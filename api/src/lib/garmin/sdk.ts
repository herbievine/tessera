import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { and, eq, type InferSelectModel, sql } from "drizzle-orm";
import { err, ok } from "neverthrow";
import { z } from "zod";
import { db } from "../../db";
import * as schema from "../../db/schema";
import { decrypt } from "../../utils/crypto";
import { fetcher } from "../../utils/fetcher";
import { tryCatch } from "../../utils/try-catch";
import type { garminKeys } from "./constants";

dayjs.extend(utc);

// Garmin omits most metric fields entirely for activities that lack them
// (indoor runs have no GPS, no HR strap means no HR), so every field beyond
// the identity/timing ones is nullish rather than merely optional.
const activitySummarySchema = z.object({
	activity_id: z.number(),
	name: z.string().nullish(),
	type_key: z.string(),
	start_time_local: z.string(),
	start_time_gmt: z.string(),
	distance_m: z.number().nullish(),
	duration_s: z.number().nullish(),
	moving_duration_s: z.number().nullish(),
	elapsed_duration_s: z.number().nullish(),
	elevation_gain_m: z.number().nullish(),
	elevation_loss_m: z.number().nullish(),
	average_speed_mps: z.number().nullish(),
	max_speed_mps: z.number().nullish(),
	calories: z.number().nullish(),
	average_hr: z.number().nullish(),
	max_hr: z.number().nullish(),
	average_cadence: z.number().nullish(),
	max_cadence: z.number().nullish(),
	steps: z.number().nullish(),
	avg_stride_length_cm: z.number().nullish(),
	vo2_max: z.number().nullish(),
	aerobic_training_effect: z.number().nullish(),
	anaerobic_training_effect: z.number().nullish(),
	training_effect_label: z.string().nullish(),
	location_name: z.string().nullish(),
	start_latitude: z.number().nullish(),
	start_longitude: z.number().nullish(),
	has_polyline: z.boolean().nullish(),
	lap_count: z.number().nullish(),
});

const detailsSchema = z.object({
	activity_id: z.number(),
	point_count: z.number(),
	series: z.object({
		timestamp: z.array(z.number().nullable()),
		distance_m: z.array(z.number().nullable()),
		elevation_m: z.array(z.number().nullable()),
		speed_mps: z.array(z.number().nullable()),
		hr: z.array(z.number().nullable()),
		cadence: z.array(z.number().nullable()),
	}),
	route: z.array(
		z.object({
			lat: z.number(),
			lon: z.number(),
			alt: z.number().nullable(),
		}),
	),
});

const splitsSchema = z.object({
	lapDTOs: z
		.array(
			z.object({
				distance: z.number().nullish(),
				duration: z.number().nullish(),
				movingDuration: z.number().nullish(),
				averageSpeed: z.number().nullish(),
				maxSpeed: z.number().nullish(),
				elevationGain: z.number().nullish(),
				elevationLoss: z.number().nullish(),
				averageHR: z.number().nullish(),
				maxHR: z.number().nullish(),
				calories: z.number().nullish(),
				startTimeGMT: z.string().nullish(),
			}),
		)
		.nullish(),
});

const extrasSchema = z.object({
	weather: z
		.object({
			temp_c: z.number().nullish(),
			apparent_temp_c: z.number().nullish(),
			dew_point_c: z.number().nullish(),
			relative_humidity: z.number().nullish(),
			wind_speed_kph: z.number().nullish(),
			wind_direction_compass: z.string().nullish(),
			description: z.string().nullish(),
		})
		.nullable(),
	hr_zones: z
		.array(
			z.object({
				zoneNumber: z.number(),
				secsInZone: z.number(),
				zoneLowBoundary: z.number().nullish(),
			}),
		)
		.nullable(),
});

export class GarminClient {
	private readonly baseUrl: string = "http://localhost:3011";
	private readonly garminAdminKey: string;

	constructor() {
		if (!Bun.env.GARMIN_ADMIN_KEY) {
			throw new Error("GARMIN_ADMIN_KEY is required");
		}

		this.garminAdminKey = Bun.env.GARMIN_ADMIN_KEY;

		// Act as override
		if (Bun.env.GARMIN_API_URL) {
			this.baseUrl = Bun.env.GARMIN_API_URL;
		}
	}

	async authenticate(email: string, password: string) {
		const { data } = await fetcher(
			`${this.baseUrl}/update-credentials`,
			z.object({
				status: z.literal("success"),
			}),
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-API-Key": this.garminAdminKey,
				},
				body: JSON.stringify({ email, password }),
			},
		);

		return data?.status === "success" ? ok() : err();
	}

	async refreshAccessToken(refreshToken: string) {
		const searchParams = new URLSearchParams();

		searchParams.append("action", "requesttoken");
		searchParams.append("grant_type", "refresh_token");
		searchParams.append("client_id", this.clientId);
		searchParams.append("client_secret", this.clientSecret);
		searchParams.append("refresh_token", refreshToken);

		const { data, error } = await fetcher(
			`${this.baseUrl}/v2/oauth2?${searchParams.toString()}`,
			z.discriminatedUnion("status", [errorSchema, oauthSchema]),
		);

		if (error || data.status === 1) {
			console.log(error);

			return {
				success: false,
				data: null,
			} as const;
		}

		return {
			success: true,
			data: data.body,
		} as const;
	}

	async getMeasurements(accessToken: string) {
		const searchParams = new URLSearchParams();

		searchParams.append("action", "getmeas");
		searchParams.append("meastypes", "1,4,5,6,8,9,10,76,88,91,155,167,170");
		searchParams.append("category", "1");
		searchParams.append(
			"startdate",
			dayjs().subtract(1, "week").unix().toString(),
		);
		searchParams.append("enddate", dayjs().unix().toString());

		const { data, error } = await fetcher(
			`${this.baseUrl}/measure?${searchParams.toString()}`,
			z.discriminatedUnion("status", [errorSchema, measureSchema]),
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
			},
		);

		if (error || data.status === 1) {
			console.log(error);

			return {
				success: false,
				data: null,
			} as const;
		}

		return {
			success: true,
			data: data.body,
		} as const;
	}

	/**
	 * Import activity summaries. Details (route, splits, weather, HR zones)
	 * are deliberately left out: each costs three more upstream calls, which
	 * across a full history would be thousands of sequential requests through
	 * a single-threaded service. They're fetched on first view instead.
	 */
	async syncActivities(
		integration: typeof schema.integrations.$inferSelect,
		typeKey = "running",
	) {
		if (!integration.garminEmail || !integration.garminPassword) {
			return err("No email/password");
		}

		await this.authenticate(
			decrypt(integration.garminEmail),
			decrypt(integration.garminPassword),
		);

		// Resume from the newest activity we already hold, minus a week, so
		// renames and post-hoc edits on recent activities get picked up. With
		// nothing stored yet this walks the whole account history.
		const [newest] = await db
			.select({ startTimeGmt: schema.activities.startTimeGmt })
			.from(schema.activities)
			.where(
				and(
					eq(schema.activities.userId, integration.userId),
					eq(schema.activities.typeKey, typeKey),
				),
			)
			.orderBy(sql`${schema.activities.startTimeGmt} desc`)
			.limit(1);

		const from = newest
			? dayjs(newest.startTimeGmt).subtract(1, "week")
			: dayjs("2010-01-01");

		const { data, error } = await fetcher(
			`${this.baseUrl}/activities/range?start=${from.format(
				"YYYY-MM-DD",
			)}&end=${dayjs().format("YYYY-MM-DD")}&type=${typeKey}`,
			z.array(activitySummarySchema),
		);

		if (error) {
			console.error("Failed to fetch activities:", error);
			return err(String(error));
		}

		if (!data || data.length === 0) {
			return ok(0);
		}

		let imported = 0;

		for (const a of data) {
			// Garmin sends both as naive strings. The GMT one is a real
			// instant; the local one is the wall clock the runner saw, with no
			// offset attached, so it's stored as though UTC to keep its digits
			// intact and must always be rendered in UTC. Parsing it plainly
			// would bake in whatever zone the server runs in and shift every
			// displayed start time.
			const result = await db
				.insert(schema.activities)
				.values({
					garminActivityId: String(a.activity_id),
					name: a.name,
					typeKey: a.type_key,
					startTimeLocal: dayjs.utc(a.start_time_local).toDate(),
					startTimeGmt: dayjs.utc(a.start_time_gmt).toDate(),
					distanceM: a.distance_m,
					durationS: a.duration_s,
					movingDurationS: a.moving_duration_s,
					elapsedDurationS: a.elapsed_duration_s,
					elevationGainM: a.elevation_gain_m,
					elevationLossM: a.elevation_loss_m,
					averageSpeedMps: a.average_speed_mps,
					maxSpeedMps: a.max_speed_mps,
					calories: a.calories,
					averageHr: a.average_hr,
					maxHr: a.max_hr,
					averageCadence: a.average_cadence,
					maxCadence: a.max_cadence,
					steps: a.steps,
					avgStrideLengthCm: a.avg_stride_length_cm,
					vo2Max: a.vo2_max,
					aerobicTrainingEffect: a.aerobic_training_effect,
					anaerobicTrainingEffect: a.anaerobic_training_effect,
					trainingEffectLabel: a.training_effect_label,
					locationName: a.location_name,
					startLatitude: a.start_latitude,
					startLongitude: a.start_longitude,
					hasPolyline: a.has_polyline,
					lapCount: a.lap_count,
					userId: integration.userId,
					integrationId: integration.id,
				})
				.onConflictDoUpdate({
					target: [
						schema.activities.userId,
						schema.activities.garminActivityId,
					],
					set: {
						name: sql`excluded.name`,
						distanceM: sql`excluded.distance_m`,
						durationS: sql`excluded.duration_s`,
						calories: sql`excluded.calories`,
						averageHr: sql`excluded.average_hr`,
						maxHr: sql`excluded.max_hr`,
					},
				})
				.returning();

			imported += result.length;
		}

		return ok(imported);
	}

	/**
	 * Fetch and cache the heavy per-activity payloads. Called on first view of
	 * an activity rather than during sync; once stored it's never refetched.
	 */
	async fetchActivityDetails(activity: typeof schema.activities.$inferSelect) {
		const [cached] = await db
			.select()
			.from(schema.activityDetails)
			.where(eq(schema.activityDetails.activityId, activity.id))
			.limit(1);

		if (cached) {
			return ok(cached);
		}

		const gid = activity.garminActivityId;

		const [details, splits, extras] = await Promise.all([
			fetcher(`${this.baseUrl}/activities/${gid}/details`, detailsSchema),
			fetcher(`${this.baseUrl}/activities/${gid}/splits`, splitsSchema),
			fetcher(`${this.baseUrl}/activities/${gid}/extras`, extrasSchema),
		]);

		if (details.error) {
			console.error("Failed to fetch activity details:", details.error);
			return err(String(details.error));
		}

		// Splits and extras are best-effort: indoor runs have no weather, and
		// an activity recorded without a HR strap has no zones. Neither should
		// stop the route and elevation profile from rendering.
		const [row] = await db
			.insert(schema.activityDetails)
			.values({
				activityId: activity.id,
				pointCount: details.data.point_count,
				route: details.data.route,
				series: details.data.series,
				splits: splits.data?.lapDTOs ?? null,
				weather: extras.data?.weather ?? null,
				hrZones: extras.data?.hr_zones ?? null,
			})
			.onConflictDoNothing()
			.returning();

		return ok(row ?? null);
	}

	async syncMeasurements(
		integration: typeof schema.integrations.$inferSelect,
		from: Date,
	) {
		if (!integration.garminEmail || !integration.garminPassword) {
			return err("No email/password");
		}

		this.authenticate(
			decrypt(integration.garminEmail),
			decrypt(integration.garminPassword),
		);

		const headers = {};

		const today = dayjs();
		const dates: string[] = [];

		let current = dayjs(from);
		while (current.isBefore(today) || current.isSame(today, "day")) {
			dates.push(current.format("YYYY-MM-DD"));
			current = current.add(1, "day");
		}

		console.log(
			"Importing Garmin data for the following dates:",
			dates.join(", "),
		);

		const observations: Array<{
			source: "garmin";
			type: (typeof garminKeys)[number];
			label: string;
			unit: string | null;
			value: number;
			observedAt: Date;
			userId: string;
			integrationId: string;
		}> = [];

		// Fetch sleep data for each date
		for (const date of dates) {
			try {
				const { data: sleepData, error: sleepError } = await fetcher(
					`${this.baseUrl}/sleep?date=${date}`,
					z.object({
						date: z.string().transform((v) => dayjs(v)),
						// Garmin hasn't finished scoring very recent nights yet, so
						// these come back null rather than being omitted.
						sleep_score: z.number().nullable(),
						quality: z.enum(["EXCELLENT", "GOOD", "FAIR", "POOR"]).nullable(),
						light_pct_score: z.number().nullable(),
						light_pct_quality: z
							.enum(["EXCELLENT", "GOOD", "FAIR", "POOR"])
							.nullable(),
						deep_pct_score: z.number().nullable(),
						deep_pct_quality: z
							.enum(["EXCELLENT", "GOOD", "FAIR", "POOR"])
							.nullable(),
						rem_pct_score: z.number().nullable(),
						rem_pct_quality: z
							.enum(["EXCELLENT", "GOOD", "FAIR", "POOR"])
							.nullable(),
						// Garmin also omits the durations themselves (not just the
						// scores) for nights it hasn't finished processing yet.
						total_seconds: z.number().nullable(),
						total_hours: z.number().nullable(),
						deep_seconds: z.number().nullable(),
						deep_hours: z.number().nullable(),
						light_seconds: z.number().nullable(),
						light_hours: z.number().nullable(),
						rem_seconds: z.number().nullable(),
						rem_hours: z.number().nullable(),
						awake_seconds: z.number().nullable(),
						awake_hours: z.number().nullable(),
						awake_count: z.number().nullable(),
					}),
					{
						headers,
					},
				);

				if (sleepError) {
					console.error("Failed to fetch sleep data for", date, sleepError);
					continue;
				}

				if (sleepData) {
					console.log(
						"Received sleep data for",
						sleepData.date.format("YYYY-MM-DD"),
					);

					if (sleepData.sleep_score !== null) {
						observations.push({
							source: "garmin",
							type: "sleep_score",
							label: "Sleep Score",
							unit: "score",
							value: sleepData.sleep_score,
							observedAt: sleepData.date.toDate(),
							userId: integration.userId,
							integrationId: integration.id,
						});
					}

					if (sleepData.total_hours !== null) {
						observations.push({
							source: "garmin",
							type: "sleep_total_hours",
							label: "Total Sleep Hours",
							unit: "hours",
							value: sleepData.total_hours,
							observedAt: sleepData.date.toDate(),
							userId: integration.userId,
							integrationId: integration.id,
						});
					}

					if (sleepData.deep_hours !== null) {
						observations.push({
							source: "garmin",
							type: "sleep_deep_hours",
							label: "Deep Sleep Hours",
							unit: "hours",
							value: sleepData.deep_hours,
							observedAt: sleepData.date.toDate(),
							userId: integration.userId,
							integrationId: integration.id,
						});
					}

					if (sleepData.light_hours !== null) {
						observations.push({
							source: "garmin",
							type: "sleep_light_hours",
							label: "Light Sleep Hours",
							unit: "hours",
							value: sleepData.light_hours,
							observedAt: sleepData.date.toDate(),
							userId: integration.userId,
							integrationId: integration.id,
						});
					}

					if (sleepData.rem_hours !== null) {
						observations.push({
							source: "garmin",
							type: "sleep_rem_hours",
							label: "REM Sleep Hours",
							unit: "hours",
							value: sleepData.rem_hours,
							observedAt: sleepData.date.toDate(),
							userId: integration.userId,
							integrationId: integration.id,
						});
					}

					if (sleepData.awake_hours !== null) {
						observations.push({
							source: "garmin",
							type: "sleep_awake_hours",
							label: "Awake Hours",
							unit: "hours",
							value: sleepData.awake_hours,
							observedAt: sleepData.date.toDate(),
							userId: integration.userId,
							integrationId: integration.id,
						});
					}
				}
			} catch (e) {
				console.error("Failed to fetch sleep data:", e);
			}

			// Fetch HR data for each date
			try {
				const { data: hrData, error: hrError } = await fetcher(
					`${this.baseUrl}/hr?date=${date}`,
					z.object({
						date: z.string().transform((v) => dayjs(v)),
						// Garmin returns these as null for dates without a finished
						// HR summary yet (e.g. very recent dates).
						resting_hr: z.number().nullable(),
						max_hr: z.number().nullable(),
						min_hr: z.number().nullable(),
						avg_hr: z.number().nullish(),
						timeseries: z.array(
							z.object({
								time: z.string().transform((v) => dayjs(v)),
								bpm: z.number().nullable().catch(null),
							}),
						),
					}),
					{
						headers,
					},
				);

				if (hrError) {
					console.error("Failed to fetch HR data for", date, hrError);
					continue;
				}

				if (hrData) {
					console.log("Received HR data for", hrData.date.format("YYYY-MM-DD"));

					if (hrData.resting_hr !== null) {
						observations.push({
							source: "garmin",
							type: "resting_heart_rate",
							label: "Resting Heart Rate",
							unit: "bpm",
							value: hrData.resting_hr,
							observedAt: hrData.date.toDate(),
							userId: integration.userId,
							integrationId: integration.id,
						});
					}
					if (hrData.max_hr !== null) {
						observations.push({
							source: "garmin",
							type: "heart_rate_max",
							label: "Max Heart Rate",
							unit: "bpm",
							value: hrData.max_hr,
							observedAt: hrData.date.toDate(),
							userId: integration.userId,
							integrationId: integration.id,
						});
					}
					if (hrData.min_hr !== null) {
						observations.push({
							source: "garmin",
							type: "heart_rate_min",
							label: "Min Heart Rate",
							unit: "bpm",
							value: hrData.min_hr,
							observedAt: hrData.date.toDate(),
							userId: integration.userId,
							integrationId: integration.id,
						});
					}

					if (hrData.avg_hr !== null && hrData.avg_hr !== undefined) {
						observations.push({
							source: "garmin",
							type: "heart_rate_avg",
							label: "Average Heart Rate",
							unit: "bpm",
							value: hrData.avg_hr,
							observedAt: hrData.date.toDate(),
							userId: integration.userId,
							integrationId: integration.id,
						});
					}

					for (const reading of hrData.timeseries) {
						// Skip readings with null bpm values to avoid NOT NULL constraint violation
						if (reading.bpm !== null && reading.bpm !== undefined) {
							observations.push({
								source: "garmin",
								type: "heart_rate",
								label: "Heart Rate",
								unit: "bpm",
								value: reading.bpm,
								observedAt: dayjs(reading.time).toDate(),
								userId: integration.userId,
								integrationId: integration.id,
							});
						}
					}
				}
			} catch (e) {
				console.error("Failed to fetch HR data:", e);
			}
		}

		// Chunked to keep each request to the (single-threaded) garmin
		// microservice small - requesting the full range in one call makes it
		// do hundreds of sequential upstream Garmin calls inside one HTTP
		// request, which blocks the server long enough for the connection
		// to drop before it can respond.
		const HRV_CHUNK_SIZE = 14;

		for (let i = 0; i < dates.length; i += HRV_CHUNK_SIZE) {
			const chunk = dates.slice(i, i + HRV_CHUNK_SIZE);

			try {
				const { data: hrvData, error: hrvError } = await fetcher(
					`${this.baseUrl}/hrv?start=${chunk[0]}&end=${chunk[chunk.length - 1]}`,
					z.array(
						z.object({
							date: z.string().transform((v) => dayjs(v)),
							// Garmin's HRV baseline isn't established for every day
							// (e.g. very recent dates, or accounts without enough
							// history yet), so these come back null individually.
							lastNightAvg: z.number().nullable(),
							lowUpper: z.number().nullable(),
							balancedLow: z.number().nullable(),
							balancedUpper: z.number().nullable(),
							markerValue: z.number().nullable(),
							readings: z.array(
								z.object({
									hrvValue: z.number(),
									readingTimeGMT: z.string().transform((v) => dayjs(v)),
									readingTimeLocal: z.string().transform((v) => dayjs(v)),
								}),
							),
						}),
					),
					{ headers },
				);

				if (hrvError) {
					console.error(
						"Failed to fetch HRV data for",
						chunk[0],
						"-",
						chunk[chunk.length - 1],
						hrvError,
					);
					continue;
				}

				for (const reading of hrvData || []) {
					console.log("Received HRV data for", reading.date.format("YYYY-MM-DD"));

					if (reading.lastNightAvg !== null) {
						observations.push({
							source: "garmin",
							type: "hrv_last_night_avg",
							label: "HRV Last Night Average",
							unit: "ms",
							value: reading.lastNightAvg,
							observedAt: dayjs(reading.date).toDate(),
							userId: integration.userId,
							integrationId: integration.id,
						});
					}

					if (reading.lowUpper !== null) {
						observations.push({
							source: "garmin",
							type: "hrv_low_upper",
							label: "HRV Low Upper",
							unit: "ms",
							value: reading.lowUpper,
							observedAt: dayjs(reading.date).toDate(),
							userId: integration.userId,
							integrationId: integration.id,
						});
					}

					if (reading.balancedLow !== null) {
						observations.push({
							source: "garmin",
							type: "hrv_balanced_low",
							label: "HRV Balanced Low",
							unit: "ms",
							value: reading.balancedLow,
							observedAt: dayjs(reading.date).toDate(),
							userId: integration.userId,
							integrationId: integration.id,
						});
					}

					if (reading.balancedUpper !== null) {
						observations.push({
							source: "garmin",
							type: "hrv_balanced_upper",
							label: "HRV Balanced Upper",
							unit: "ms",
							value: reading.balancedUpper,
							observedAt: dayjs(reading.date).toDate(),
							userId: integration.userId,
							integrationId: integration.id,
						});
					}

					if (reading.markerValue !== null) {
						observations.push({
							source: "garmin",
							type: "hrv_marker_value",
							label: "HRV Marker Value",
							unit: "ms",
							value: reading.markerValue,
							observedAt: dayjs(reading.date).toDate(),
							userId: integration.userId,
							integrationId: integration.id,
						});
					}
				}
			} catch (e) {
				console.error(
					"Failed to fetch HRV data for",
					chunk[0],
					"-",
					chunk[chunk.length - 1],
					":",
					e,
				);
			}
		}

		if (observations.length === 0) {
			return err("No data to import");
		}

		let imported = 0;

		for (const obs of observations) {
			const result = await db
				.insert(schema.observations)
				.values(obs)
				.onConflictDoUpdate({
					target: [
						schema.observations.userId,
						schema.observations.observedAt,
						schema.observations.type,
						schema.observations.source,
					],
					set: {
						value: sql`excluded.value`,
					},
				})
				.returning();

			imported += result.length;
		}

		return ok(imported);
	}
}
