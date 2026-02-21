import { client } from "@/lib/hono";
import {
	queryOptions,
	useQuery,
	type QueryOptions,
} from "@tanstack/react-query";

export type TrendPoint = {
	date: string;
	label: string;
	unit: string;
	value: number;
};

export type UseTrendsReturn = Awaited<ReturnType<typeof fn>>;
type Options = QueryOptions<UseTrendsReturn>;

async function fn(entity: string) {
	const res = await client.api.trends[`:entity`].$get({
		param: { entity },
	});

	if (res.ok) {
		return res.json() as Promise<TrendPoint[]>;
	}

	return [];
}

export function trendsOptions(entity: string, options: Options = {}) {
	return queryOptions({
		queryKey: ["trends", entity],
		queryFn: () => fn(entity),
		staleTime: 10 * 1000,
		...options,
	});
}

export function useTrends(entity: string, options: Options = {}) {
	const { data, ...query } = useQuery(trendsOptions(entity, options));

	return {
		trends: data,
		...query,
	};
}
