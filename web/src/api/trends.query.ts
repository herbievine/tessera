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

async function fn(entity: string, startDate?: string, endDate?: string) {
	const query: Record<string, string> = {};
	if (startDate) query.startDate = startDate;
	if (endDate) query.endDate = endDate;
	
	const res = await client.api.trends[`:entity`].$get({
		param: { entity },
		...(Object.keys(query).length > 0 ? { query } : {}),
	});

	if (res.ok) {
		return res.json() as Promise<TrendPoint[]>;
	}

	return [];
}

export function trendsOptions(entity: string, startDate?: string, endDate?: string, options: Options = {}) {
	return queryOptions({
		queryKey: ["trends", entity, startDate, endDate],
		queryFn: () => fn(entity, startDate, endDate),
		staleTime: 10 * 1000,
		...options,
	});
}

export function useTrends(entity: string, startDate?: string, endDate?: string, options: Options = {}) {
	const { data, ...query } = useQuery(trendsOptions(entity, startDate, endDate, options));

	return {
		trends: data,
		...query,
	};
}
