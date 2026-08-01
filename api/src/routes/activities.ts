import { Hono } from "hono";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { db } from "../db";
import * as schema from "../db/schema";
import { GarminClient } from "../lib/garmin/sdk";

dayjs.extend(utc);

const app = new Hono();

// Garmin models trail running as a child of running, and its type filter
// returns both. Grouping them keeps the Exercise tab's "running" consistent
// with what the backfill actually imported.
const runningTypes = ["running", "trail_running"];

export default app
	.get("/", async (c) => {
		const token = c.get("jwtPayload");
		const startDate = c.req.query("startDate");
		const endDate = c.req.query("endDate");
		const limit = Number(c.req.query("limit") ?? 50);
		const offset = Number(c.req.query("offset") ?? 0);

		const filters = [
			eq(schema.activities.userId, token.sub),
			inArray(schema.activities.typeKey, runningTypes),
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
					inArray(schema.activities.typeKey, runningTypes),
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

		// Months with no runs are absent from the GROUP BY, but the chart needs
		// them present as zeroes or the bars misalign against the time axis.
		const buckets: Record<
			string,
			{ month: string; running: number; trailRunning: number; km: number }
		> = {};

		for (let i = 0; i < months; i++) {
			const month = from.add(i, "month").format("YYYY-MM");
			buckets[month] = { month, running: 0, trailRunning: 0, km: 0 };
		}

		for (const row of rows) {
			const bucket = buckets[row.month];
			if (!bucket) continue;

			if (row.typeKey === "trail_running") {
				bucket.trailRunning += row.totalMinutes ?? 0;
			} else {
				bucket.running += row.totalMinutes ?? 0;
			}
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
		const details = await new GarminClient().fetchActivityDetails(activity);

		return c.json({
			activity,
			details: details.isErr() ? null : details.value,
			detailsError: details.isErr() ? details.error : undefined,
		});
	});
