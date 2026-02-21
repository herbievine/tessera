import type { AppType } from "@tessera/api";
import { hc } from "hono/client";

function getAuthHeader(): Record<string, string> {
	if (typeof window === "undefined") return {};
	const token = localStorage.getItem("access_token");
	return token ? { Authorization: `Bearer ${token}` } : {};
}

export const client = hc<AppType>("http://localhost:3010", {
	headers: getAuthHeader,
});
