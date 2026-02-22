import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { db } from "../db";
import { jwt } from "hono/jwt";
import { encrypt, decrypt } from "../utils/crypto";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { fetcher } from "../utils/fetcher";

dayjs.extend(utc);

const app = new Hono();

app.post(
	"/connect",
	jwt({ secret: Bun.env.JWT_SECRET!, alg: "HS256" }),
	zValidator(
		"json",
		z.object({
			email: z.email(),
			password: z.string().min(1),
			startDate: z
				.string()
				.default(dayjs.utc().subtract(1, "month").toISOString()),
		}),
	),
	async (c) => {
		const token = c.get("jwtPayload");
		const data = c.req.valid("json");

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

    const garminApiUrl = process.env.GARMIN_API_URL || "http://localhost:3011";

    const { data: garmin } = await fetcher(
      `${garminApiUrl}/user/profile`,
      z.object({ id: z.number() }),
      {
        headers: {
          Authorization: `Bearer: ${Bun.env.GARMIN_ADMIN_KEY}`
        }
      }
    )

    console.log(garmin)

    if (!garmin?.id) {
      return c.json({ error: "Garmin user not found" }, 404);
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
				const [user] = await db
					.select({ apiKeyHash: schema.users.apiKeyHash })
					.from(schema.users)
					.where(eq(schema.users.id, token.sub))
					.limit(1);

				console.log({ user });

				if (user?.apiKeyHash) {
					const y = await fetch(
						`${Bun.env.BASE_URL}/api/cron/garmin?startDate=${data.startDate}`,
						{
              method: "POST",
              headers: { Authorization: `Bearer ${user.apiKeyHash}` }
						},
					);

					console.log(y.status);
					console.log(await y.json());
				}
			} catch (e) {
				console.error("Failed to trigger garmin import:", e);
			}
		}

		return c.json({ message: "Garmin connected" }, 201);
	},
);

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
