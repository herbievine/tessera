import dayjs from "dayjs";
import { and, eq, type InferSelectModel, sql } from "drizzle-orm";
import { err, ok } from "neverthrow";
import { z } from "zod";
import { db } from "../../db";
import * as schema from "../../db/schema";
import { decrypt } from "../../utils/crypto";
import { fetcher } from "../../utils/fetcher";
import { tryCatch } from "../../utils/try-catch";
import type { garminKeys } from "./constants";

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

	async syncMeasurements(
		integration: typeof schema.integrations.$inferSelect,
		from: Date,
	) {
		if (!integration.garminEmail || !integration.garminPassword) {
			return err("No email/password");
		}

		this.authenticate(integration.garminEmail, integration.garminPassword);

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
						sleep_score: z.number(),
						quality: z.enum(["EXCELLENT", "GOOD", "FAIR", "POOR"]),
						light_pct_score: z.number(),
						light_pct_quality: z.enum(["EXCELLENT", "GOOD", "FAIR", "POOR"]),
						deep_pct_score: z.number(),
						deep_pct_quality: z.enum(["EXCELLENT", "GOOD", "FAIR", "POOR"]),
						rem_pct_score: z.number(),
						rem_pct_quality: z.enum(["EXCELLENT", "GOOD", "FAIR", "POOR"]),
						total_seconds: z.number(),
						total_hours: z.number(),
						deep_seconds: z.number(),
						deep_hours: z.number(),
						light_seconds: z.number(),
						light_hours: z.number(),
						rem_seconds: z.number(),
						rem_hours: z.number(),
						awake_seconds: z.number(),
						awake_hours: z.number(),
						awake_count: z.number(),
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
			} catch (e) {
				console.error("Failed to fetch sleep data:", e);
			}

			// Fetch HR data for each date
			try {
				const { data: hrData, error: hrError } = await fetcher(
					`${this.baseUrl}/hr?date=${date}`,
					z.object({
						date: z.string().transform((v) => dayjs(v)),
						resting_hr: z.number(),
						max_hr: z.number(),
						min_hr: z.number(),
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

		try {
			const { data: hrvData, error: hrvError } = await fetcher(
				`${this.baseUrl}/hrv?start=${dates[0]}&end=${dates[dates.length - 1]}`,
				z.array(
					z.object({
						date: z.string().transform((v) => dayjs(v)),
						lastNightAvg: z.number(),
						lowUpper: z.number(),
						balancedLow: z.number(),
						balancedUpper: z.number(),
						markerValue: z.number(),
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

			for (const reading of hrvData || []) {
				console.log("Received HRV data for", reading.date.format("YYYY-MM-DD"));

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
		} catch (e) {
			console.error("Failed to fetch HRV data:", e);
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
