import dayjs from "dayjs";
import { fetcher } from "../../utils/fetcher";
import { errorSchema, measureSchema, oauthSchema } from "./types";
import { z } from "zod";
import { and, eq, sql, type InferSelectModel } from "drizzle-orm";
import { db } from "../../db";
import * as schema from "../../db/schema";
import { err, ok } from "neverthrow";
import { measurementsMapping } from "./constants";

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
			Bun.env.API_URL + "/api/withings/callback",
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

	async getMeasurements(accessToken: string, from: Date) {
		const searchParams = new URLSearchParams();

		searchParams.append("action", "getmeas");
		searchParams.append("meastypes", "1,4,5,6,8,9,10,76,88,91,155,167,170");
		searchParams.append("category", "1");
		searchParams.append("startdate", dayjs(from).unix().toString());
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

	async syncMeasurements(
		integration: typeof schema.integrations.$inferSelect,
		from: Date,
	) {
		if (!integration.refreshToken) {
			return err("No refresh token");
		}

		const { success, data: accessTokenData } = await this.refreshAccessToken(
			integration.refreshToken,
		);

		if (!success) {
			return err("Failed to refresh access token");
		}

		await db
			.update(schema.integrations)
			.set({
				accessToken: accessTokenData.access_token,
				refreshToken: accessTokenData.refresh_token,
				scope: accessTokenData.scope,
				expiresAt: new Date(Date.now() + accessTokenData.expires_in * 1000),
			})
			.where(
				and(
					eq(schema.integrations.vendor, "withings"),
					eq(schema.integrations.userId, integration.userId),
				),
			);

		const { success: measurementSuccess, data: measurementData } =
			await this.getMeasurements(accessTokenData.access_token, from);

		if (!measurementSuccess) {
			return err("Failed to fetch data");
		}

		let imported = 0;

		for (const { date, measures } of measurementData.measuregrps) {
			const obsDate = dayjs.unix(date).toDate();

			const baseObservations: Array<{
				source: "withings";
				type: string;
				label: string;
				unit: string | null;
				value: number;
				observedAt: Date;
				userId: string;
				integrationId: string;
			}> = [];

			for (const measure of measures) {
				if (!(measure.type in measurementsMapping)) {
					console.log(`Skipping unknown measure type: ${measure.type}`);

					continue;
				}

				const { key, name, unit } =
					measurementsMapping[measure.type as keyof typeof measurementsMapping];

				baseObservations.push({
					source: "withings" as const,
					type: key,
					label: name,
					unit,
					value: +(measure.value * Math.pow(10, measure.unit)).toFixed(2),
					observedAt: obsDate,
					userId: integration.userId,
					integrationId: integration.id,
				});
			}

			const weight = baseObservations.find(
				(o: any) => o.type === "weight",
			)?.value;
			const muscleMassKg = baseObservations.find(
				(o: any) => o.type === "muscle_mass",
			)?.value;
			const boneMassKg = baseObservations.find(
				(o: any) => o.type === "bone_mass",
			)?.value;

			const derivedObservations: typeof baseObservations = [];

			if (weight && muscleMassKg) {
				const muscleMassPct = (muscleMassKg / weight) * 100;

				derivedObservations.push({
					source: "withings",
					type: "muscle_mass_pct",
					label: "Muscle Mass (%)",
					unit: "%",
					value: +muscleMassPct.toFixed(1),
					observedAt: obsDate,
					userId: integration.userId,
					integrationId: integration.id,
				});
			}

			if (weight && boneMassKg) {
				const boneMassPct = (boneMassKg / weight) * 100;

				derivedObservations.push({
					source: "withings",
					type: "bone_mass_pct",
					label: "Bone Mass (%)",
					unit: "%",
					value: +boneMassPct.toFixed(1),
					observedAt: obsDate,
					userId: integration.userId,
					integrationId: integration.id,
				});
			}

			const allObservations = [
				...baseObservations,
				...derivedObservations,
			] as any;

			const { length } = await db
				.insert(schema.observations)
				.values(allObservations)
				.onConflictDoUpdate({
					target: [
						schema.observations.userId,
						schema.observations.observedAt,
						schema.observations.type,
						schema.observations.source,
					],
					set: {
						value: sql`excluded.value`,
					},
				})
				.returning();

			imported += length;
		}

		return ok(imported);
	}
}
