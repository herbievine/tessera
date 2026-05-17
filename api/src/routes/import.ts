import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { importDataFromMacrofactor } from "../import/macrofactor.ts";
import { bearerAuth } from "hono/bearer-auth";
import { db } from "../db/index.ts";
import * as schema from "../db/schema.ts";
import { eq } from "drizzle-orm";

const app = new Hono();

export default app.post(
	"/",
	bearerAuth({
		verifyToken: async (token, c) => {
			const [user] = await db
				.select()
				.from(schema.users)
				.where(eq(schema.users.apiKeyHash, token))
				.limit(1);

			return !!user;
		},
	}),
	async (c) => {
		const json = await c.req.json();
		const data = json?.data;

		if (!data) {
			throw new HTTPException(400);
		}

		try {
			const saved = await importDataFromMacrofactor(data);

			console.log(`Imported ${saved.length} entries.`);

			return c.json({
				success: true,
			});
		} catch (err) {
			console.error("Parse error:", err);
			throw new HTTPException(400, { message: "Invalid XLSX file" });
		}
	},
);
