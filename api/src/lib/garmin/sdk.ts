import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { and, eq, inArray, sql } from "drizzle-orm";
import { err, ok } from "neverthrow";
import { z } from "zod";
import { db } from "../../db";
import * as schema from "../../db/schema";
import { decrypt } from "../../utils/crypto";
import { fetcher } from "../../utils/fetcher";
import { KIND_BY_TYPE_KEY, type garminKeys } from "./constants";
import type { ActivityKind, ActivityMetrics } from "./types";

dayjs.extend(utc);

// Garmin omits most metric fields entirely for activities that lack them
// (indoor runs have no GPS, no HR strap means no HR, a strength session has
// no pace), so every field beyond the identity/timing ones is nullish.
const metricsSchema = z.object({
	moving_duration_s: z.number().nullish(),
	elapsed_duration_s: z.number().nullish(),
	elevation_gain_m: z.number().nullish(),
	elevation_loss_m: z.number().nullish(),
	min_elevation_m: z.number().nullish(),
	max_elevation_m: z.number().nullish(),
	average_speed_mps: z.number().nullish(),
	max_speed_mps: z.number().nullish(),
	avg_moving_speed_mps: z.number().nullish(),
	avg_grade_adjusted_speed_mps: z.number().nullish(),
	calories: z.number().nullish(),
	resting_calories: z.number().nullish(),
	average_hr: z.number().nullish(),
	max_hr: z.number().nullish(),
	average_cadence: z.number().nullish(),
	max_cadence: z.number().nullish(),
	steps: z.number().nullish(),
	avg_stride_length_cm: z.number().nullish(),
	avg_vertical_oscillation_cm: z.number().nullish(),
	avg_vertical_ratio: z.number().nullish(),
	avg_ground_contact_time_ms: z.number().nullish(),
	avg_ground_contact_balance: z.number().nullish(),
	avg_power_w: z.number().nullish(),
	max_power_w: z.number().nullish(),
	normalized_power_w: z.number().nullish(),
	avg_respiration_rate: z.number().nullish(),
	min_respiration_rate: z.number().nullish(),
	max_respiration_rate: z.number().nullish(),
	water_estimated_ml: z.number().nullish(),
	moderate_intensity_minutes: z.number().nullish(),
	vigorous_intensity_minutes: z.number().nullish(),
	body_battery_diff: z.number().nullish(),
	activity_training_load: z.number().nullish(),
	vo2_max: z.number().nullish(),
	aerobic_training_effect: z.number().nullish(),
	anaerobic_training_effect: z.number().nullish(),
	aerobic_training_effect_message: z.string().nullish(),
	anaerobic_training_effect_message: z.string().nullish(),
	training_effect_label: z.string().nullish(),
	workout_feel: z.number().nullish(),
	workout_rpe: z.number().nullish(),
	total_sets: z.number().nullish(),
	active_sets: z.number().nullish(),
	total_reps: z.number().nullish(),
	location_name: z.string().nullish(),
	start_latitude: z.number().nullish(),
	start_longitude: z.number().nullish(),
	has_polyline: z.boolean().nullish(),
	lap_count: z.number().nullish(),
});

type GarminMetrics = z.output<typeof metricsSchema>;

const activitySummarySchema = metricsSchema.extend({
	activity_id: z.number(),
	name: z.string().nullish(),
	type_key: z.string(),
	start_time_local: z.string(),
	start_time_gmt: z.string(),
	distance_m: z.number().nullish(),
	duration_s: z.number().nullish(),
});

// The service drops metrics the watch never recorded rather than sending an
// array of nulls per sample, so every series but the timestamps is optional.
const seriesArray = z.array(z.number().nullable());

const detailsSchema = z.object({
	activity_id: z.number(),
	point_count: z.number(),
	series: z
		.object({
			timestamp: seriesArray,
			distance_m: seriesArray.optional(),
			elevation_m: seriesArray.optional(),
			speed_mps: seriesArray.optional(),
			grade_adjusted_speed_mps: seriesArray.optional(),
			hr: seriesArray.optional(),
			cadence: seriesArray.optional(),
			double_cadence: seriesArray.optional(),
			power_w: seriesArray.optional(),
			stride_length_cm: seriesArray.optional(),
			vertical_oscillation_cm: seriesArray.optional(),
			vertical_ratio: seriesArray.optional(),
			ground_contact_time_ms: seriesArray.optional(),
			ground_contact_balance: seriesArray.optional(),
			respiration_rate: seriesArray.optional(),
			performance_condition: seriesArray.optional(),
		})
		// A strength session has no series at all, only a timestamp column.
		.catchall(seriesArray),
	route: z.array(
		z.object({
			lat: z.number(),
			lon: z.number(),
			alt: z.number().nullable(),
		}),
	),
});

const nullableNumber = z.number().nullish().transform((v) => v ?? null);
const nullableString = z.string().nullish().transform((v) => v ?? null);

const splitsSchema = z.object({
	laps: z.array(
		z.object({
			lap_index: nullableNumber,
			start_time_gmt: nullableString,
			distance_m: nullableNumber,
			duration_s: nullableNumber,
			moving_duration_s: nullableNumber,
			elapsed_duration_s: nullableNumber,
			average_speed_mps: nullableNumber,
			max_speed_mps: nullableNumber,
			avg_grade_adjusted_speed_mps: nullableNumber,
			elevation_gain_m: nullableNumber,
			elevation_loss_m: nullableNumber,
			average_hr: nullableNumber,
			max_hr: nullableNumber,
			average_cadence: nullableNumber,
			max_cadence: nullableNumber,
			avg_power_w: nullableNumber,
			max_power_w: nullableNumber,
			normalized_power_w: nullableNumber,
			avg_stride_length_cm: nullableNumber,
			avg_ground_contact_time_ms: nullableNumber,
			avg_ground_contact_balance: nullableNumber,
			avg_vertical_oscillation_cm: nullableNumber,
			avg_vertical_ratio: nullableNumber,
			calories: nullableNumber,
			intensity_type: nullableString,
		}),
	),
});

const zonesSchema = z
	.array(
		z.object({
			zoneNumber: z.number(),
			secsInZone: z.number(),
			zoneLowBoundary: nullableNumber,
		}),
	)
	.nullable();

const extrasSchema = z.object({
	weather: z
		.object({
			temp_c: nullableNumber,
			apparent_temp_c: nullableNumber,
			dew_point_c: nullableNumber,
			relative_humidity: nullableNumber,
			wind_speed_kph: nullableNumber,
			wind_direction_compass: nullableString,
			description: nullableString,
		})
		.nullable(),
	hr_zones: zonesSchema,
	power_zones: zonesSchema,
	exercise_sets: z
		.array(
			z.object({
				set_index: z.number(),
				set_type: nullableString,
				category: nullableString,
				name: nullableString,
				reps: nullableNumber,
				weight_kg: nullableNumber,
				duration_s: nullableNumber,
				start_time_gmt: nullableString,
			}),
		)
		.nullable(),
	// The per-activity endpoint carries fields the list DTO omits, so it
	// backfills the stored metrics on first view.
	summary: metricsSchema.nullable(),
});

/**
 * The type filters to ask Garmin for, and which kinds each is expected to
 * return. The filter is hierarchical - "running" returns trail and treadmill
 * runs too - so two calls cover every supported key rather than one per
 * variant. It only accepts parent types: asking for "strength_training"
 * directly is a 400, while its parent "fitness_equipment" returns it.
 */
const SYNC_TYPE_FILTERS: { filter: string; kinds: ActivityKind[] }[] = [
	{ filter: "running", kinds: ["running", "trail_running"] },
	{ filter: "fitness_equipment", kinds: ["strength_training"] },
];

/**
 * Bumped when the shape of a details fetch changes. Rows cached under an
 * older version refetch on next view.
 */
const DETAILS_VERSION = 2;

function toMetrics(a: GarminMetrics, kind: ActivityKind): ActivityMetrics {
	const common = {
		movingDurationS: a.moving_duration_s ?? null,
		elapsedDurationS: a.elapsed_duration_s ?? null,
		calories: a.calories ?? null,
		restingCalories: a.resting_calories ?? null,
		averageHr: a.average_hr ?? null,
		maxHr: a.max_hr ?? null,
		avgRespirationRate: a.avg_respiration_rate ?? null,
		minRespirationRate: a.min_respiration_rate ?? null,
		maxRespirationRate: a.max_respiration_rate ?? null,
		aerobicTrainingEffect: a.aerobic_training_effect ?? null,
		anaerobicTrainingEffect: a.anaerobic_training_effect ?? null,
		aerobicTrainingEffectMessage: a.aerobic_training_effect_message ?? null,
		anaerobicTrainingEffectMessage: a.anaerobic_training_effect_message ?? null,
		trainingEffectLabel: a.training_effect_label ?? null,
		activityTrainingLoad: a.activity_training_load ?? null,
		moderateIntensityMinutes: a.moderate_intensity_minutes ?? null,
		vigorousIntensityMinutes: a.vigorous_intensity_minutes ?? null,
		bodyBatteryDiff: a.body_battery_diff ?? null,
		workoutFeel: a.workout_feel ?? null,
		workoutRpe: a.workout_rpe ?? null,
		lapCount: a.lap_count ?? null,
	};

	if (kind === "strength_training") {
		return {
			kind,
			...common,
			totalSets: a.total_sets ?? null,
			activeSets: a.active_sets ?? null,
			totalReps: a.total_reps ?? null,
		};
	}

	return {
		kind,
		...common,
		elevationGainM: a.elevation_gain_m ?? null,
		elevationLossM: a.elevation_loss_m ?? null,
		minElevationM: a.min_elevation_m ?? null,
		maxElevationM: a.max_elevation_m ?? null,
		averageSpeedMps: a.average_speed_mps ?? null,
		maxSpeedMps: a.max_speed_mps ?? null,
		avgMovingSpeedMps: a.avg_moving_speed_mps ?? null,
		avgGradeAdjustedSpeedMps: a.avg_grade_adjusted_speed_mps ?? null,
		averageCadence: a.average_cadence ?? null,
		maxCadence: a.max_cadence ?? null,
		steps: a.steps ?? null,
		avgStrideLengthCm: a.avg_stride_length_cm ?? null,
		avgVerticalOscillationCm: a.avg_vertical_oscillation_cm ?? null,
		avgVerticalRatio: a.avg_vertical_ratio ?? null,
		avgGroundContactTimeMs: a.avg_ground_contact_time_ms ?? null,
		avgGroundContactBalance: a.avg_ground_contact_balance ?? null,
		avgPowerW: a.avg_power_w ?? null,
		maxPowerW: a.max_power_w ?? null,
		normalizedPowerW: a.normalized_power_w ?? null,
		vo2Max: a.vo2_max ?? null,
		waterEstimatedMl: a.water_estimated_ml ?? null,
		locationName: a.location_name ?? null,
		startLatitude: a.start_latitude ?? null,
		startLongitude: a.start_longitude ?? null,
		hasPolyline: a.has_polyline ?? null,
	};
}

/**
 * Overlay the fields the per-activity summary filled in, keeping what's
 * already stored wherever it sent null - the list DTO and the per-activity
 * endpoint each omit fields the other has.
 */
function mergeMetrics(
	stored: ActivityMetrics | null,
	fetched: ActivityMetrics,
): ActivityMetrics {
	if (!stored) return fetched;

	const merged: Record<string, unknown> = { ...stored };

	for (const [key, value] of Object.entries(fetched)) {
		if (value !== null && value !== undefined) {
			merged[key] = value;
		}
	}

	return merged as ActivityMetrics;
}

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
	 * Import activity summaries for every sport the app renders. Details
	 * (route, series, laps, weather, zones, sets) are deliberately left out:
	 * each costs several more upstream calls, which across a full history
	 * would be thousands of sequential requests through a single-threaded
	 * service. They're fetched on first view instead.
	 *
	 * `from` forces a re-import over a window; without it each sport resumes
	 * from the newest activity already stored.
	 */
	async syncActivities(
		integration: typeof schema.integrations.$inferSelect,
		options: { from?: Date } = {},
	) {
		if (!integration.garminEmail || !integration.garminPassword) {
			return err("No email/password");
		}

		await this.authenticate(
			decrypt(integration.garminEmail),
			decrypt(integration.garminPassword),
		);

		let imported = 0;

		for (const target of SYNC_TYPE_FILTERS) {
			const result = await this.syncActivityType(
				integration,
				target,
				options.from,
			);

			if (result.isErr()) {
				return result;
			}

			imported += result.value;
		}

		return ok(imported);
	}

	private async syncActivityType(
		integration: typeof schema.integrations.$inferSelect,
		target: (typeof SYNC_TYPE_FILTERS)[number],
		forcedFrom?: Date,
	) {
		// Resume from the newest activity of this kind we already hold, minus
		// a week, so renames and post-hoc edits on recent activities get
		// picked up. With nothing stored yet this walks the account history.
		const typeKeys = Object.entries(KIND_BY_TYPE_KEY)
			.filter(([, kind]) => target.kinds.includes(kind))
			.map(([key]) => key);

		const [newest] = await db
			.select({ startTimeGmt: schema.activities.startTimeGmt })
			.from(schema.activities)
			.where(
				and(
					eq(schema.activities.userId, integration.userId),
					inArray(schema.activities.typeKey, typeKeys),
				),
			)
			.orderBy(sql`${schema.activities.startTimeGmt} desc`)
			.limit(1);

		const from = forcedFrom
			? dayjs(forcedFrom)
			: newest
				? dayjs(newest.startTimeGmt).subtract(1, "week")
				: dayjs("2010-01-01");

		const { data, error } = await fetcher(
			`${this.baseUrl}/activities/range?start=${from.format(
				"YYYY-MM-DD",
			)}&end=${dayjs().format("YYYY-MM-DD")}&type=${target.filter}`,
			z.array(activitySummarySchema),
		);

		if (error) {
			console.error("Failed to fetch activities:", error);
			return err(String(error));
		}

		if (!data || data.length === 0) {
			return ok(0);
		}

		// What's already stored may be richer than what this list returns:
		// viewing an activity completes its metrics from the per-activity
		// endpoint, which knows about self-evaluation and moving pace. Read
		// them up front so a re-sync overlays rather than flattens.
		const stored = new Map(
			(
				await db
					.select({
						garminActivityId: schema.activities.garminActivityId,
						metrics: schema.activities.metrics,
					})
					.from(schema.activities)
					.where(
						and(
							eq(schema.activities.userId, integration.userId),
							inArray(
								schema.activities.garminActivityId,
								data.map((a) => String(a.activity_id)),
							),
						),
					)
			).map((row) => [row.garminActivityId, row.metrics] as const),
		);

		let imported = 0;

		for (const a of data) {
			// Garmin's type filter is hierarchical, so a "running" request also
			// returns anything it files under running. Only the sports the app
			// renders are stored.
			const kind = KIND_BY_TYPE_KEY[a.type_key];

			if (!kind) {
				continue;
			}

			// Garmin sends both times as naive strings. The GMT one is a real
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
					metrics: mergeMetrics(
						stored.get(String(a.activity_id)) ?? null,
						toMetrics(a, kind),
					),
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
						typeKey: sql`excluded.type_key`,
						distanceM: sql`excluded.distance_m`,
						durationS: sql`excluded.duration_s`,
						metrics: sql`excluded.metrics`,
					},
				})
				.returning();

			imported += result.length;
		}

		return ok(imported);
	}

	/**
	 * Fetch and cache the heavy per-activity payloads. Called on first view of
	 * an activity rather than during sync; once stored it's refetched only
	 * when DETAILS_VERSION moves past what the cached row was written under.
	 */
	async fetchActivityDetails(activity: typeof schema.activities.$inferSelect) {
		const [cached] = await db
			.select()
			.from(schema.activityDetails)
			.where(eq(schema.activityDetails.activityId, activity.id))
			.limit(1);

		if (cached && cached.version === DETAILS_VERSION) {
			return ok({ details: cached, metrics: activity.metrics });
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

		// The per-activity summary carries fields the activity list omits
		// (self-evaluation, moving pace, respiration), so first view is also
		// when the stored metrics get completed. The merged value is returned
		// as well as stored, so that first view already renders them.
		let metrics = activity.metrics;

		if (extras.data?.summary && activity.metrics) {
			metrics = mergeMetrics(
				activity.metrics,
				toMetrics(extras.data.summary, activity.metrics.kind),
			);

			await db
				.update(schema.activities)
				.set({ metrics })
				.where(eq(schema.activities.id, activity.id));
		}

		// Splits and extras are best-effort: indoor runs have no weather, an
		// activity recorded without a HR strap has no zones, and only strength
		// sessions have sets. None of that should stop the rest rendering.
		const [row] = await db
			.insert(schema.activityDetails)
			.values({
				activityId: activity.id,
				version: DETAILS_VERSION,
				pointCount: details.data.point_count,
				route: details.data.route,
				series: details.data.series,
				splits: splits.data?.laps ?? null,
				weather: extras.data?.weather ?? null,
				hrZones: extras.data?.hr_zones ?? null,
				powerZones: extras.data?.power_zones ?? null,
				exerciseSets: extras.data?.exercise_sets ?? null,
			})
			// A row cached under an older version is replaced rather than kept,
			// which is the whole point of the version check above.
			.onConflictDoUpdate({
				target: schema.activityDetails.activityId,
				set: {
					version: sql`excluded.version`,
					pointCount: sql`excluded.point_count`,
					route: sql`excluded.route`,
					series: sql`excluded.series`,
					splits: sql`excluded.splits`,
					weather: sql`excluded.weather`,
					hrZones: sql`excluded.hr_zones`,
					powerZones: sql`excluded.power_zones`,
					exerciseSets: sql`excluded.exercise_sets`,
					fetchedAt: sql`excluded.fetched_at`,
				},
			})
			.returning();

		return ok({ details: row ?? null, metrics });
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
