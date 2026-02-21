import dayjs from "dayjs";
import { fetcher } from "../../utils/fetcher";
import { errorSchema, measureSchema, oauthSchema } from "./types";
import { z } from "zod";

export class WithingsClient {
	private readonly baseUrl = "https://wbsapi.withings.net";
	private readonly clientId: string;
	private readonly clientSecret: string;

	constructor() {
		if (!Bun.env.WITHINGS_CLIENT_ID) {
			throw new Error("WITHINGS_CLIENT_ID is required");
		} else if (!Bun.env.WITHINGS_CLIENT_SECRET) {
			throw new Error("WITHINGS_CLIENT_SECRET is required");
		}

		this.clientId = Bun.env.WITHINGS_CLIENT_ID;
		this.clientSecret = Bun.env.WITHINGS_CLIENT_SECRET;
	}

	async getAuthorizationCode(code: string) {
		const searchParams = new URLSearchParams();

		searchParams.append("action", "requesttoken");
		searchParams.append("grant_type", "authorization_code");
		searchParams.append("client_id", this.clientId);
		searchParams.append("client_secret", this.clientSecret);
		searchParams.append("code", code);
		searchParams.append(
			"redirect_uri",
			Bun.env.BASE_URL + "/api/withings/callback",
		);

		const { data, error } = await fetcher(
			`${this.baseUrl}/v2/oauth2?${searchParams.toString()}`,
			z.discriminatedUnion("status", [errorSchema, oauthSchema]),
		);

		if (error || data.status === 1) {
			console.log(error);

			return {
				success: false,
				data: null,
			} as const;
		}

		return {
			success: true,
			data: data.body,
		} as const;
	}

	async refreshAccessToken(refreshToken: string) {
		const searchParams = new URLSearchParams();

		searchParams.append("action", "requesttoken");
		searchParams.append("grant_type", "refresh_token");
		searchParams.append("client_id", this.clientId);
		searchParams.append("client_secret", this.clientSecret);
		searchParams.append("refresh_token", refreshToken);

		const { data, error } = await fetcher(
			`${this.baseUrl}/v2/oauth2?${searchParams.toString()}`,
			z.discriminatedUnion("status", [errorSchema, oauthSchema]),
		);

		if (error || data.status === 1) {
			console.log(error);

			return {
				success: false,
				data: null,
			} as const;
		}

		return {
			success: true,
			data: data.body,
		} as const;
	}

	async getMeasurements(accessToken: string) {
		const searchParams = new URLSearchParams();

		searchParams.append("action", "getmeas");
		searchParams.append("meastypes", "1,4,5,6,8,9,10,76,88,91,155,167,170");
		searchParams.append("category", "1");
		searchParams.append(
			"startdate",
			dayjs().subtract(1, "week").unix().toString(),
		);
		searchParams.append("enddate", dayjs().unix().toString());

		const { data, error } = await fetcher(
			`${this.baseUrl}/measure?${searchParams.toString()}`,
			z.discriminatedUnion("status", [errorSchema, measureSchema]),
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
			},
		);

		if (error || data.status === 1) {
			console.log(error);

			return {
				success: false,
				data: null,
			} as const;
		}

		return {
			success: true,
			data: data.body,
		} as const;
	}
}
