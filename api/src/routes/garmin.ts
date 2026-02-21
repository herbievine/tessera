import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { db } from "../db";
import { jwt } from "hono/jwt";
import { encrypt, decrypt } from "../utils/crypto";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

const app = new Hono();

app.post("/connect",jwt({ secret: Bun.env.JWT_SECRET!, alg: "HS256" }), zValidator('json', z.object({
	email: z.string().email(),
	password: z.string().min(1),
	startDate: z.string().optional(),
})), async (c) => {
	const token = c.get("jwtPayload");
	const data = c.req.valid('json');

	const [integration] = await db
		.select()
		.from(schema.integrations)
		.where(
			and(
				eq(schema.integrations.vendor, "garmin"),
				eq(schema.integrations.userId, token.sub),
			),
		)
		.limit(1);

	if (integration) {
	return c.json({ error: "User already connected" }, 400);
	}

	await db.insert(schema.integrations).values({
		vendor: "garmin",
		garminEmail: encrypt(data.email),
		garminPassword: encrypt(data.password),
		userId: token.sub,
	});

	// Trigger import with optional startDate
	if (data.startDate) {
		try {
			await fetch(`http://localhost:3011/api/cron/garmin?startDate=${data.startDate}`, {
				headers: { Authorization: `Bearer ${Bun.env.API_KEY}` }
			});
		} catch (e) {
			console.error("Failed to trigger garmin import:", e);
		}
	}

	return c.json({ message: "Garmin connected" }, 201);
});

app.get(
	"/status",
	jwt({ secret: Bun.env.JWT_SECRET!, alg: "HS256" }),
	async (c) => {
		const token = c.get("jwtPayload");

		const [integration] = await db
			.select()
			.from(schema.integrations)
			.where(
				and(
					eq(schema.integrations.vendor, "garmin"),
					eq(schema.integrations.userId, token.sub),
				),
			)
			.limit(1);

		if (!integration) {
			return c.json({ connected: false });
		}

		try {
			const email = decrypt(integration.garminEmail!);
			return c.json({
				connected: true,
				email: email.slice(0, 3) + "***" + email.slice(email.indexOf("@")),
			});
		} catch {
			return c.json({ connected: true, email: "***" });
		}
	},
);

app.delete(
	"/disconnect",
	jwt({ secret: Bun.env.JWT_SECRET!, alg: "HS256" }),
	async (c) => {
		const token = c.get("jwtPayload");

		await db
			.delete(schema.integrations)
			.where(
				and(
					eq(schema.integrations.vendor, "garmin"),
					eq(schema.integrations.userId, token.sub),
				),
			);

		return c.json({ message: "Garmin disconnected" });
	},
);

export default app;
