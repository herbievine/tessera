import { Hono } from "hono";
import { db } from "../db/index.ts";
import * as schema from "../db/schema.ts";
import { eq } from "drizzle-orm";

export const dataOptions = {
	"heart-rate": {
		key: "sleep_score",
		unit: "score",
	},
} as const;

const app = new Hono().get("/:entity", async (c) => {
	const entity = c.req.param("entity") as string;

  if (!(entity in dataOptions)) {
    return c.json({ error: "Entity not found" }, 404);
  }

	const data = await db
		.select({
			date: schema.observations.observedAt,
			label: schema.observations.label,
			unit: schema.observations.unit,
			value: schema.observations.value,
		})
		.from(schema.observations)
		// @ts-ignore
		.where(eq(schema.observations.type, entity));

	return c.json(data);
});

export default app;
