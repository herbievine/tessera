import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db";
import * as schema from "../db/schema";
import { z } from "zod";
import { sign, verify } from "hono/jwt";
import { generateApiKey } from "../utils/id";
import { tryCatch } from "../utils/try-catch";
import { zValidator } from "@hono/zod-validator";

const app = new Hono();

type Payload = {
	sub: string;
	exp: number;
};

export default app
	.get("/me", async (c) => {
		const authorization = c.req.header("Authorization");

		if (!authorization || !authorization.startsWith("Bearer ")) {
			return c.json({ error: "Unauthorized" }, 401);
		}

		const token = authorization.split(" ")[1];

		if (!token) {
			return c.json({ error: "Invalid token" }, 401);
		}

		const { data, error } = await tryCatch(
			verify(token, Bun.env.JWT_SECRET!, "HS256") as Promise<Payload>,
		);

		if (error) {
			return c.json({ error: "Token expired" }, 401);
		} else if (!data.sub) {
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
			.where(eq(schema.users.id, data.sub))
			.execute();

		if (!user) {
			return c.json({ error: "User not found" }, 404);
		}

		const newToken = await sign(
			{
				sub: user.id,
				exp: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hour
			},
			Bun.env.JWT_SECRET!,
		);

		return c.json({
			...user,
			token: newToken,
		});
	})
	.post(
		"/login",
		zValidator(
			"json",
			z.object({
				email: z.email(),
				password: z.string().min(8).max(128),
			}),
		),
		async (c) => {
			const data = c.req.valid("json");

			const user = await db
				.select()
				.from(schema.users)
				.where(eq(schema.users.email, data.email))
				.execute();

			if (user.length === 0 || !user[0]) {
				return c.json({ error: "Invalid credentials" }, 401);
			}

			const valid = await Bun.password.verify(data.password, user[0].password);

			if (!valid) {
				return c.json({ error: "Invalid credentials" }, 401);
			}

			const token = await sign(
				{
					sub: user[0].id,
					exp: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hour
				} as Payload,
				Bun.env.JWT_SECRET!,
			);

			return c.json({ token });
		},
	)
	.post("/signup", async (c) => {
		const body = await c.req.json();

		const { data, success } = z
			.object({
				name: z.string().min(2).max(128),
				email: z.email(),
				password: z.string().min(8).max(128),
			})
			.safeParse(body);

		if (!success) {
			return c.json({ error: "Invalid request" }, 400);
		}

		const user = await db
			.select()
			.from(schema.users)
			.where(eq(schema.users.email, data.email))
			.execute();

		if (user.length === 1) {
			return c.json({ error: "User already exists" }, 401);
		}

		const [returned] = await db
			.insert(schema.users)
			.values({
				name: data.name,
				email: data.email,
				password: await Bun.password.hash(data.password),
				apiKeyHash: generateApiKey(),
			})
			.returning();

		if (!returned) {
			return c.json({ error: "Failed to create user" }, 500);
		}

		const token = await sign(
			{
				sub: returned.id,
				exp: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hour
			} as Payload,
			Bun.env.JWT_SECRET!,
		);

		return c.json({ token });
	});
