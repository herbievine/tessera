import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { db } from "../db";
import { jwt } from "hono/jwt";
import { WithingsClient } from "../lib/withings/sdk";

const app = new Hono();

app.get("/callback", async (c) => {
	const code = c.req.query("code");
	const state = c.req.query("state");
	const returnSearchParams = new URLSearchParams();

	if (!code || !state) {
		returnSearchParams.append("error", "invalid_request");
		returnSearchParams.append("success", "false");

		return c.redirect(
			new URL(
				`/withings/callback?${returnSearchParams.toString()}`,
				Bun.env.FRONT_END_URL,
			),
		);
	}

	const [userId, initiatedAt] = state.split(":");

	if (!userId || !initiatedAt || +initiatedAt + 30000 < Date.now()) {
		returnSearchParams.append("error", "invalid_state");
		returnSearchParams.append("success", "false");

		return c.redirect(
			new URL(
				`/withings/callback?${returnSearchParams.toString()}`,
				Bun.env.FRONT_END_URL,
			),
		);
	}

	const client = new WithingsClient();
	const { success, data } = await client.getAuthorizationCode(code);

	if (!success) {
		returnSearchParams.append("error", "internal_error");
		returnSearchParams.append("success", "false");

		return c.redirect(
			new URL(
				`/withings/callback?${returnSearchParams.toString()}`,
				Bun.env.FRONT_END_URL,
			),
		);
	}

	await db.insert(schema.integrations).values({
		vendor: "withings",
		accessToken: data.access_token,
		refreshToken: data.refresh_token,
		externalUserId: data.userid.toString(),
		scope: data.scope,
		expiresAt: new Date(Date.now() + data.expires_in * 1000),
		userId,
	});

	returnSearchParams.append("success", "true");

	return c.redirect(
		new URL(
			`/withings/callback?${returnSearchParams.toString()}`,
			Bun.env.FRONT_END_URL,
		),
	);
});

app.get(
	"/connect",
	jwt({ secret: Bun.env.JWT_SECRET!, alg: "HS256" }),
	async (c) => {
		const token = c.get("jwtPayload");

		const [integration] = await db
			.select()
			.from(schema.integrations)
			.where(
				and(
					eq(schema.integrations.vendor, "withings"),
					eq(schema.integrations.userId, token.sub),
				),
			)
			.limit(1);

		if (integration) {
			return c.json({ error: "User already connected" }, 400);
		}

		const searchParams = new URLSearchParams();

		searchParams.append("response_type", "code");
		searchParams.append("client_id", Bun.env.WITHINGS_CLIENT_ID!);
		searchParams.append("scope", "user.metrics");
		searchParams.append(
			"redirect_uri",
			Bun.env.BASE_URL + "/api/withings/callback",
		);
		searchParams.append("state", `${token.sub}:${Date.now()}`);

		return c.json({
			url: `https://account.withings.com/oauth2_user/authorize2?${searchParams.toString()}`,
		});
	},
);

export default app;
