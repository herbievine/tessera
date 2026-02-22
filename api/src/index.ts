import { Hono } from "hono";
import { createTransport } from "./mcp/server";
import authRoute from "./routes/auth";
import cronRoute from "./routes/cron";
import integrationsRoute from "./routes/integrations";
import importRoute from "./routes/import";
import trendsRoute from "./routes/trends";
import withingsRoute from "./routes/withings";
import garminRoute from "./routes/garmin";
import { bearerAuth } from "hono/bearer-auth";
import { cors } from "hono/cors";
import { jwt } from "hono/jwt";

if (!Bun.env.API_KEY) {
	throw new Error("API_KEY environment variable is not set");
}

const app = new Hono().basePath("/api");

const routes = app
	.use(
		"*",
		cors({
			origin: [Bun.env.FRONT_END_URL!],
		}),
	)
	.get("/", (c) => c.json({ health: "ok" }))
	.use("/integrations/*", jwt({ secret: Bun.env.JWT_SECRET!, alg: "HS256" }))
	.use("/trends/*", jwt({ secret: Bun.env.JWT_SECRET!, alg: "HS256" }))
	.use("/garmin/*", jwt({ secret: Bun.env.JWT_SECRET!, alg: "HS256" }))
	.use("/import/*", bearerAuth({ token: Bun.env.API_KEY! }))
	.route("/auth", authRoute)
	.route("/cron", cronRoute)
	.route("/integrations", integrationsRoute)
	.route("/import", importRoute)
	.route("/trends", trendsRoute)
	.route("/withings", withingsRoute)
	.route("/garmin", garminRoute);

export type AppType = typeof routes;

Bun.serve({
	port: 3010,
	routes: {
		"/api/*": (req) => app.fetch(req),
		"/*": (req) => {
			const auth = req.headers.get("Authorization");

			if (!auth) {
				return new Response("Unauthorized", { status: 401 });
			}

			const token = (auth.startsWith("Bearer") && auth.split(" ")[1]) || null;

			if (token !== Bun.env.API_KEY) {
				return new Response("Invalid API key", { status: 403 });
			}

			return createTransport().handleRequest(req);
		},
	},
});

console.log(`HTTP Server running on ${Bun.env.BASE_URL}/api`);
console.log(`MCP Server running on ${Bun.env.BASE_URL}/mcp`);
