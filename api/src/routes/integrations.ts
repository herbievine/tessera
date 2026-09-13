import { Hono } from "hono";
import { and, eq, or, sql } from "drizzle-orm";
import { db } from "../db";
import * as schema from "../db/schema";

const app = new Hono();

export default app
	.get("/", async (c) => {
		const token = c.get("jwtPayload");

		const integrations = await db.query.integrations.findMany({
			where: {
				userId: token.sub,
			},
		});

		// There is no lastSyncedAt column: a sync is only ever observable as the
		// rows it wrote, so the newest row's createdAt is the last sync. Two
		// grouped queries rather than one per integration.
		const [observationSyncs, activitySyncs] = await Promise.all([
			db
				.select({
					integrationId: schema.observations.integrationId,
					source: schema.observations.source,
					lastAt: sql<number | null>`max(${schema.observations.createdAt})`,
				})
				.from(schema.observations)
				.where(eq(schema.observations.userId, token.sub))
				.groupBy(schema.observations.integrationId, schema.observations.source),
			db
				.select({
					integrationId: schema.activities.integrationId,
					lastAt: sql<number | null>`max(${schema.activities.createdAt})`,
				})
				.from(schema.activities)
				.where(eq(schema.activities.userId, token.sub))
				.groupBy(schema.activities.integrationId),
		]);

		return c.json(
			integrations.map((integration) => {
				const seconds = [
					// Rows written before integrationId was recorded consistently are
					// still attributable by vendor, the same fallback the delete uses.
					...observationSyncs
						.filter(
							(r) =>
								r.integrationId === integration.id ||
								r.source === integration.vendor,
						)
						.map((r) => r.lastAt),
					...activitySyncs
						.filter((r) => r.integrationId === integration.id)
						.map((r) => r.lastAt),
				].filter((v): v is number => typeof v === "number");

				return {
					...integration,
					lastSyncedAt: seconds.length
						? new Date(Math.max(...seconds) * 1000)
						: null,
				};
			}),
		);
	})
	.delete("/:id", async (c) => {
		const token = c.get("jwtPayload");
		const integrationId = c.req.param("id");

		const [deleted] = await db
			.delete(schema.integrations)
			.where(
				and(
					eq(schema.integrations.userId, token.sub),
					or(
						eq(schema.integrations.id, integrationId),
						// @ts-ignore
						eq(schema.integrations.vendor, integrationId),
					),
				),
			)
			.returning();

		if (!deleted) {
			return c.json(
				{
					success: false,
				},
				404,
			);
		}

		// Delete observations by integrationId OR by source matching the vendor
		await db
			.delete(schema.observations)
			.where(
				and(
					eq(schema.observations.userId, token.sub),
					or(
						eq(schema.observations.integrationId, integrationId),
						eq(schema.observations.source, deleted.vendor),
					),
				),
			);

		return c.json({
			success: true,
			deleted,
		});
	});
