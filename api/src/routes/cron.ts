import { Hono } from "hono";
import { and, eq, sql } from "drizzle-orm";
import * as schema from "../db/schema";
import { db } from "../db";
import dayjs from "dayjs";
import { measurementsMapping } from "../lib/withings/constants";
import { WithingsClient } from "../lib/withings/sdk";
import { garminTypes, garminKeys } from "../lib/garmin/constants";
import { decrypt } from "../utils/crypto";

const app = new Hono();

app.post("/withings", async (c) => {
	const authorization = c.req.header("Authorization");

	if (!authorization || !authorization.startsWith("Bearer ")) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const token = authorization.split(" ")[1];

	if (!token) {
		return c.json({ error: "Invalid token" }, 401);
	}

	const [user] = await db
		.select({
			id: schema.users.id,
			email: schema.users.email,
			name: schema.users.name,
			apiKeyHash: schema.users.apiKeyHash,
			createdAt: schema.users.createdAt,
		})
		.from(schema.users)
		.where(eq(schema.users.apiKeyHash, token))
		.execute();

	if (!user) {
		return c.json({ error: "User not found" }, 404);
	}

	const [integration] = await db
		.select()
		.from(schema.integrations)
		.where(
			and(
				eq(schema.integrations.vendor, "withings"),
				eq(schema.integrations.userId, user.id),
			),
		)
		.limit(1);

	if (!integration || !integration.refreshToken) {
		return c.json(
			{ error: "User not connected or missing refresh token" },
			400,
		);
	}

	const client = new WithingsClient();

	const { success, data: accessTokenData } = await client.refreshAccessToken(
		integration.refreshToken,
	);

	if (!success) {
		return c.json({ error: "Failed to refresh access token" }, 500);
	}

	await db
		.update(schema.integrations)
		.set({
			accessToken: accessTokenData.access_token,
			refreshToken: accessTokenData.refresh_token,
			scope: accessTokenData.scope,
			expiresAt: new Date(Date.now() + accessTokenData.expires_in * 1000),
		})
		.where(
			and(
				eq(schema.integrations.vendor, "withings"),
				eq(schema.integrations.userId, user.id),
			),
		);

	const { success: measurementSuccess, data: measurementData } =
		await client.getMeasurements(accessTokenData.access_token);

	if (!measurementSuccess) {
		return c.json({ error: "Failed to fetch data" }, 500);
	}

	let imported = 0;

	for (const { date, measures } of measurementData.measuregrps) {
		const obsDate = dayjs.unix(date).toDate();
		
		const baseObservations: Array<{
			source: "withings";
			type: string;
			label: string;
			unit: string | null;
			value: number;
			observedAt: Date;
			userId: string;
			integrationId: string;
		}> = measures.map((measure) => ({
			source: "withings" as const,
			type: measurementsMapping[
				measure.type as keyof typeof measurementsMapping
			].key,
			label:
				measurementsMapping[
					measure.type as keyof typeof measurementsMapping
				].name,
			unit: measurementsMapping[
				measure.type as keyof typeof measurementsMapping
			].unit,
			value: +(measure.value * Math.pow(10, measure.unit)).toFixed(2),
			observedAt: obsDate,
			userId: user.id,
			integrationId: integration.id,
		}));

		const weight = baseObservations.find((o: any) => o.type === "weight")?.value;
		const muscleMassKg = baseObservations.find((o: any) => o.type === "muscle_mass")?.value;
		const boneMassKg = baseObservations.find((o: any) => o.type === "bone_mass")?.value;

		const derivedObservations: typeof baseObservations = [];
		
		if (weight && muscleMassKg) {
			const muscleMassPct = (muscleMassKg / weight) * 100;
			derivedObservations.push({
				source: "withings",
				type: "muscle_mass_pct",
				label: "Muscle Mass (%)",
				unit: "%",
				value: +muscleMassPct.toFixed(1),
				observedAt: obsDate,
				userId: user.id,
				integrationId: integration.id,
			});
		}

		if (weight && boneMassKg) {
			const boneMassPct = (boneMassKg / weight) * 100;
			derivedObservations.push({
				source: "withings",
				type: "bone_mass_pct",
				label: "Bone Mass (%)",
				unit: "%",
				value: +boneMassPct.toFixed(1),
				observedAt: obsDate,
				userId: user.id,
				integrationId: integration.id,
			});
		}

		const allObservations = [...baseObservations, ...derivedObservations] as any;

		const { length } = await db
			.insert(schema.observations)
			.values(allObservations)
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

		imported += length;
	}

	return c.json({ message: "Data fetched successfully", imported }, 200);
});

app.post("/garmin", async (c) => {
	const authorization = c.req.header("Authorization");
	const startDate = c.req.query("startDate");

	if (!authorization || !authorization.startsWith("Bearer ")) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const token = authorization.split(" ")[1];

	if (!token) {
		return c.json({ error: "Invalid token" }, 401);
	}

	const [user] = await db
		.select({
			id: schema.users.id,
		})
		.from(schema.users)
		.where(eq(schema.users.apiKeyHash, token))
		.execute();

	if (!user) {
		return c.json({ error: "User not found" }, 404);
	}

	const [integration] = await db
		.select()
		.from(schema.integrations)
		.where(
			and(
				eq(schema.integrations.vendor, "garmin"),
				eq(schema.integrations.userId, user.id),
			),
		)
		.limit(1);

	if (!integration) {
		return c.json({ error: "User not connected" }, 400);
	}

	if (!integration.garminEmail || !integration.garminPassword) {
		return c.json({ error: "Garmin credentials not configured" }, 400);
	}

	const garminApiUrl = process.env.GARMIN_API_URL || "http://localhost:3011";

	// Decrypt credentials
	const email = decrypt(integration.garminEmail);
	const password = decrypt(integration.garminPassword);

	const adminKey = process.env.GARMIN_ADMIN_KEY;

	console.log({ email, password, startDate, adminKey, integration });

	// Update credentials on garmin service
	try {
		const updateRes = await fetch(`${garminApiUrl}/update-credentials`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-API-Key": adminKey || "",
			},
			body: JSON.stringify({ email, password }),
		});

		if (!updateRes.ok) {
			const err = await updateRes.text();
			return c.json(
				{
					error: "Failed to update credentials on garmin service",
					details: err,
				},
				500,
			);
		}
	} catch (e) {
		console.error("Failed to update credentials:", e);
		// Continue anyway - tokens might still be valid
	}

	const headers = {};

	const today = dayjs();
	const start = startDate ? dayjs(startDate) : today.subtract(1, "month");
	const dates: string[] = [];

	let current = start;
	while (current.isBefore(today) || current.isSame(today, "day")) {
		dates.push(current.format("YYYY-MM-DD"));
		current = current.add(1, "day");
	}

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
			const sleepRes = await fetch(`${garminApiUrl}/sleep?date=${date}`, {
				headers,
			});
			if (sleepRes.ok) {
				const sleep = (await sleepRes.json()) as Record<string, unknown>;
				const sleepDate = (sleep.date as string) || date;

				if (sleep.sleep_score != null) {
					observations.push({
						source: "garmin",
						type: "sleep_score",
						label: "Sleep Score",
						unit: "score",
						value: sleep.sleep_score as number,
						observedAt: dayjs(sleepDate).toDate(),
						userId: user.id,
						integrationId: integration.id,
					});
				}
				if (sleep.total_hours != null) {
					observations.push({
						source: "garmin",
						type: "sleep_total_hours",
						label: "Total Sleep Hours",
						unit: "hours",
						value: sleep.total_hours as number,
						observedAt: dayjs(sleepDate).toDate(),
						userId: user.id,
						integrationId: integration.id,
					});
				}
				if (sleep.deep_hours != null) {
					observations.push({
						source: "garmin",
						type: "sleep_deep_hours",
						label: "Deep Sleep Hours",
						unit: "hours",
						value: sleep.deep_hours as number,
						observedAt: dayjs(sleepDate).toDate(),
						userId: user.id,
						integrationId: integration.id,
					});
				}
				if (sleep.light_hours != null) {
					observations.push({
						source: "garmin",
						type: "sleep_light_hours",
						label: "Light Sleep Hours",
						unit: "hours",
						value: sleep.light_hours as number,
						observedAt: dayjs(sleepDate).toDate(),
						userId: user.id,
						integrationId: integration.id,
					});
				}
				if (sleep.rem_hours != null) {
					observations.push({
						source: "garmin",
						type: "sleep_rem_hours",
						label: "REM Sleep Hours",
						unit: "hours",
						value: sleep.rem_hours as number,
						observedAt: dayjs(sleepDate).toDate(),
						userId: user.id,
						integrationId: integration.id,
					});
				}
				if (sleep.awake_hours != null) {
					observations.push({
						source: "garmin",
						type: "sleep_awake_hours",
						label: "Awake Hours",
						unit: "hours",
						value: sleep.awake_hours as number,
						observedAt: dayjs(sleepDate).toDate(),
						userId: user.id,
						integrationId: integration.id,
					});
				}
			}
		} catch (e) {
			console.error("Failed to fetch sleep data:", e);
		}

		// Fetch HR data for each date
		try {
			const hrRes = await fetch(`${garminApiUrl}/hr?date=${date}`, { headers });
			if (hrRes.ok) {
				const hr = (await hrRes.json()) as Record<string, unknown>;

				if (hr.resting_hr != null) {
					observations.push({
						source: "garmin",
						type: "resting_heart_rate",
						label: "Resting Heart Rate",
						unit: "bpm",
						value: hr.resting_hr as number,
						observedAt: dayjs(date).toDate(),
						userId: user.id,
						integrationId: integration.id,
					});
				}
				if (hr.max_hr != null) {
					observations.push({
						source: "garmin",
						type: "heart_rate_max",
						label: "Max Heart Rate",
						unit: "bpm",
						value: hr.max_hr as number,
						observedAt: dayjs(date).toDate(),
						userId: user.id,
						integrationId: integration.id,
					});
				}
				if (hr.min_hr != null) {
					observations.push({
						source: "garmin",
						type: "heart_rate_min",
						label: "Min Heart Rate",
						unit: "bpm",
						value: hr.min_hr as number,
						observedAt: dayjs(date).toDate(),
						userId: user.id,
						integrationId: integration.id,
					});
				}
				if (hr.avg_hr != null) {
					observations.push({
						source: "garmin",
						type: "heart_rate_avg",
						label: "Average Heart Rate",
						unit: "bpm",
						value: hr.avg_hr as number,
						observedAt: dayjs(date).toDate(),
						userId: user.id,
						integrationId: integration.id,
					});
				}

				// Store individual HR readings as separate observations
				const timeseries = hr.timeseries as Array<{ time: string; bpm: number }> | undefined;
				if (timeseries) {
					for (const reading of timeseries) {
            if (reading.bpm !== null) {
              observations.push({
  							source: "garmin",
  							type: "heart_rate",
  							label: "Heart Rate",
  							unit: "bpm",
  							value: reading.bpm,
  							observedAt: dayjs(reading.time).toDate(),
  							userId: user.id,
  							integrationId: integration.id,
  						});
						}
					}
				}
			}
		} catch (e) {
			console.error("Failed to fetch HR data:", e);
		}

		// Fetch HRV data for each date
		try {
			const hrvRes = await fetch(
				`${garminApiUrl}/hrv?start=${date}&end=${date}`,
				{ headers },
			);
			if (hrvRes.ok) {
				const hrv = (await hrvRes.json()) as Record<string, unknown>;

				if (hrv.weekly_average != null) {
					observations.push({
						source: "garmin",
						type: "hrv_weekly_avg",
						label: "HRV Weekly Average",
						unit: "ms",
						value: hrv.weekly_average as number,
						observedAt: dayjs(date).toDate(),
						userId: user.id,
						integrationId: integration.id,
					});
				}
				if (hrv.last_night_average != null) {
					observations.push({
						source: "garmin",
						type: "hrv_last_night_avg",
						label: "HRV Last Night Average",
						unit: "ms",
						value: hrv.last_night_average as number,
						observedAt: dayjs(date).toDate(),
						userId: user.id,
						integrationId: integration.id,
					});
				}
				if (hrv.status != null) {
					observations.push({
						source: "garmin",
						type: "hrv_status",
						label: "HRV Status",
						unit: "status",
						value:
							typeof hrv.status === "string"
								? parseInt(hrv.status) || 0
								: (hrv.status as number),
						observedAt: dayjs(date).toDate(),
						userId: user.id,
						integrationId: integration.id,
					});
				}
			}
		} catch (e) {
			console.error("Failed to fetch HRV data:", e);
		}
	}

	if (observations.length === 0) {
		return c.json({ message: "No data to import", imported: 0 }, 200);
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

	return c.json({ message: "Data fetched successfully", imported }, 200);
});

export default app;
