import { Hono } from "hono";
import { and, eq, sql } from "drizzle-orm";
import { jwt } from "hono/jwt";
import * as schema from "../db/schema";
import { db } from "../db";
import dayjs from "dayjs";
import { measurementsMapping } from "../lib/withings/constants";
import { WithingsClient } from "../lib/withings/sdk";
import { garminTypes, garminKeys } from "../lib/garmin/constants";
import { decrypt } from "../utils/crypto";
import { GarminClient } from "../lib/garmin/sdk";

const app = new Hono();

export default app
	.post(
		"/sync",
		jwt({ secret: Bun.env.JWT_SECRET!, alg: "HS256" }),
		async (c) => {
			console.log("hello world");

			const token = c.get("jwtPayload");

			const [user] = await db
				.select({ id: schema.users.id, apiKeyHash: schema.users.apiKeyHash })
				.from(schema.users)
				.where(eq(schema.users.id, token.sub))
				.limit(1);

			console.log({ token, user });

			if (!user || !user.apiKeyHash) {
				return c.json({ error: "User not found" }, 404);
			}

			const results: {
				source: string;
				status: string;
				imported?: number;
				error?: string;
			}[] = [];

			// Sync Withings
			try {
				const withingsRes = await fetch(
					"http://localhost:3010/api/cron/withings",
					{
						method: "POST",
						headers: { Authorization: `Bearer ${user.apiKeyHash}` },
					},
				);
				const withingsData = (await withingsRes.json()) as {
					imported?: number;
					error?: string;
				};
				results.push({
					source: "withings",
					status: withingsRes.ok ? "success" : "error",
					imported: withingsData.imported,
					error: withingsRes.ok ? undefined : withingsData.error,
				});
			} catch (e) {
				results.push({ source: "withings", status: "error", error: String(e) });
			}

			// return c.json({ results });

			// Sync Garmin
			try {
				const garminRes = await fetch("http://localhost:3010/api/cron/garmin", {
					method: "POST",
					headers: { Authorization: `Bearer ${user.apiKeyHash}` },
				});
				const garminData = (await garminRes.json()) as {
					imported?: number;
					error?: string;
				};
				results.push({
					source: "garmin",
					status: garminRes.ok ? "success" : "error",
					imported: garminData.imported,
					error: garminRes.ok ? undefined : garminData.error,
				});
			} catch (e) {
				results.push({ source: "garmin", status: "error", error: String(e) });
			}

			return c.json({ results });
		},
	)
	.post("/:vendor", async (c) => {
		const authorization = c.req.header("Authorization");
    const vendor = c.req.param("vendor");
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
					// @ts-ignore vendor doesn't fit the enum
					eq(schema.integrations.vendor, vendor),
					eq(schema.integrations.userId, user.id),
				),
			)
			.limit(1);

		if (!integration) {
			return c.json({ error: "Integration not found" }, 404);
		}

		if (integration.vendor === "withings") {
			const client = new WithingsClient();

			const data = await client.syncMeasurements(
				integration,
        startDate
          ? dayjs(startDate).toDate()
          : dayjs().subtract(1, "week").toDate(),
			);

			if (data.isErr()) {
				return c.json({ error: data.error }, 500);
			}

			return c.json({ imported: data.value });
		}

		// if (integration.vendor === 'garmin') {
		const client = new GarminClient();

		const data = await client.syncMeasurements(
			integration,
			startDate
			? dayjs(startDate).toDate()
			: dayjs().subtract(1, "week").toDate(),
		);

		if (data.isErr()) {
			return c.json({ error: data.error }, 500);
		}

		return c.json({ imported: data.value });
		// }
	});
