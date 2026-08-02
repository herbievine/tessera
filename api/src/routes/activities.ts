import { Hono } from "hono";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { db } from "../db";
import * as schema from "../db/schema";
import { GarminClient } from "../lib/garmin/sdk";
import { KIND_BY_TYPE_KEY, supportedTypeKeys } from "../lib/garmin/constants";

dayjs.extend(utc);

const app = new Hono();

export default app
	.get("/", async (c) => {
		const token = c.get("jwtPayload");
		const startDate = c.req.query("startDate");
		const endDate = c.req.query("endDate");
		const kind = c.req.query("kind");
		const limit = Number(c.req.query("limit") ?? 50);
		const offset = Number(c.req.query("offset") ?? 0);

		// `kind` narrows to one sport; without it the list spans all three.
		// Filtering on the type keys rather than metrics.kind keeps this on
		// the (userId, typeKey, startTimeGmt) index.
		const typeKeys = kind
			? supportedTypeKeys.filter((key) => KIND_BY_TYPE_KEY[key] === kind)
			: supportedTypeKeys;

		const filters = [
			eq(schema.activities.userId, token.sub),
			inArray(schema.activities.typeKey, typeKeys),
		];

		if (startDate) {
			filters.push(
				gte(schema.activities.startTimeGmt, dayjs.utc(startDate).toDate()),
			);
		}

		if (endDate) {
			filters.push(
				lte(
					schema.activities.startTimeGmt,
					dayjs.utc(endDate).endOf("day").toDate(),
				),
			);
		}

		const rows = await db
			.select()
			.from(schema.activities)
			.where(and(...filters))
			.orderBy(desc(schema.activities.startTimeGmt))
			.limit(limit)
			.offset(offset);

		const [count] = await db
			.select({ total: sql<number>`count(*)` })
			.from(schema.activities)
			.where(and(...filters));

		return c.json({ activities: rows, total: count?.total ?? 0 });
	})
	/**
	 * Monthly totals for the activity-time chart. Aggregated in SQL rather
	 * than by loading every activity, since this spans the full history.
	 */
	.get("/monthly", async (c) => {
		const token = c.get("jwtPayload");
		const months = Number(c.req.query("months") ?? 6);
		const from = dayjs.utc().subtract(months - 1, "month").startOf("month");

		const rows = await db
			.select({
				month: sql<string>`strftime('%Y-%m', ${schema.activities.startTimeGmt}, 'unixepoch')`,
				typeKey: schema.activities.typeKey,
				totalMinutes: sql<number>`sum(${schema.activities.durationS}) / 60.0`,
				totalKm: sql<number>`sum(${schema.activities.distanceM}) / 1000.0`,
				count: sql<number>`count(*)`,
			})
			.from(schema.activities)
			.where(
				and(
					eq(schema.activities.userId, token.sub),
					inArray(schema.activities.typeKey, supportedTypeKeys),
					gte(schema.activities.startTimeGmt, from.toDate()),
				),
			)
			.groupBy(
				sql`strftime('%Y-%m', ${schema.activities.startTimeGmt}, 'unixepoch')`,
				schema.activities.typeKey,
			)
			.orderBy(
				asc(
					sql`strftime('%Y-%m', ${schema.activities.startTimeGmt}, 'unixepoch')`,
				),
			);

		// Months with no activity are absent from the GROUP BY, but the chart
		// needs them present as zeroes or the bars misalign against the axis.
		const buckets: Record<
			string,
			{
				month: string;
				running: number;
				trailRunning: number;
				strength: number;
				km: number;
			}
		> = {};

		for (let i = 0; i < months; i++) {
			const month = from.add(i, "month").format("YYYY-MM");
			buckets[month] = {
				month,
				running: 0,
				trailRunning: 0,
				strength: 0,
				km: 0,
			};
		}

		for (const row of rows) {
			const bucket = buckets[row.month];
			if (!bucket) continue;

			const kind = KIND_BY_TYPE_KEY[row.typeKey];

			if (kind === "trail_running") {
				bucket.trailRunning += row.totalMinutes ?? 0;
			} else if (kind === "strength_training") {
				bucket.strength += row.totalMinutes ?? 0;
			} else {
				bucket.running += row.totalMinutes ?? 0;
			}

			// Distance only means something for the two running kinds; a
			// strength session's is null and sums to nothing.
			bucket.km += row.totalKm ?? 0;
		}

		return c.json(Object.values(buckets));
	})
	.get("/:id", async (c) => {
		const token = c.get("jwtPayload");

		const [activity] = await db
			.select()
			.from(schema.activities)
			.where(
				and(
					eq(schema.activities.id, c.req.param("id")),
					eq(schema.activities.userId, token.sub),
				),
			)
			.limit(1);

		if (!activity) {
			return c.json({ error: "Activity not found" }, 404);
		}

		// Details are fetched from Garmin on first view and cached from then
		// on, so this is slow once per activity and instant thereafter. A
		// failure still returns the summary rather than erroring the page.
		// That first fetch also completes the summary metrics, so the
		// activity is returned with whatever it filled in.
		const result = await new GarminClient().fetchActivityDetails(activity);

		return c.json({
			activity: result.isErr()
				? activity
				: { ...activity, metrics: result.value.metrics },
			details: result.isErr() ? null : result.value.details,
			detailsError: result.isErr() ? result.error : undefined,
		});
	});
