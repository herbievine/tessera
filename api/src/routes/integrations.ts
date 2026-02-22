import { Hono } from "hono";
import { and, eq, or } from "drizzle-orm";
import { db } from "../db";
import * as schema from "../db/schema";

const app = new Hono();

app.get("/", async (c) => {
	const token = c.get("jwtPayload");

	const integrations = await db.query.integrations.findMany({
		where: {
			userId: token.sub,
		},
	});

	return c.json(integrations);
});

app.delete("/:id", async (c) => {
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
				)
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

export default app;
