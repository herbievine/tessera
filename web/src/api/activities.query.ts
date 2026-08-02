import { queryOptions, useQuery } from "@tanstack/react-query";
import type {
	ActivityKind,
	ActivityLap,
	ActivityMetrics,
	ActivityRoutePoint,
	ActivitySeries,
	ActivityWeather,
	ActivityZone,
	ExerciseSet,
} from "@tessera/api";

export type {
	ActivityKind,
	ActivityLap,
	ActivityMetrics,
	ActivitySeries,
	ActivityZone,
	ExerciseSet,
};

/**
 * Everything past the identity and timing fields lives in `metrics`, which
 * is a union discriminated on the sport - a run has pace and running
 * dynamics, a strength session has sets and reps.
 */
export type Activity = {
	id: string;
	garminActivityId: string;
	name: string | null;
	typeKey: string;
	startTimeLocal: string;
	startTimeGmt: string;
	distanceM: number | null;
	durationS: number | null;
	metrics: ActivityMetrics | null;
};

export type ActivityDetails = {
	pointCount: number | null;
	route: ActivityRoutePoint[] | null;
	series: ActivitySeries | null;
	splits: ActivityLap[] | null;
	weather: ActivityWeather | null;
	hrZones: ActivityZone[] | null;
	powerZones: ActivityZone[] | null;
	exerciseSets: ExerciseSet[] | null;
};

export type MonthlyTotal = {
	month: string;
	running: number;
	trailRunning: number;
	strength: number;
	km: number;
};

function authHeaders(): Record<string, string> {
	const token = localStorage.getItem("access_token");
	return token ? { Authorization: `Bearer ${token}` } : {};
}

async function get<T>(path: string): Promise<T> {
	const res = await fetch(`${import.meta.env.VITE_API_URL}/api${path}`, {
		headers: authHeaders(),
	});

	if (!res.ok) {
		throw new Error(`Request failed: ${res.status}`);
	}

	return res.json() as Promise<T>;
}

export function activitiesOptions(
	limit = 50,
	offset = 0,
	kind?: ActivityKind,
) {
	return queryOptions({
		queryKey: ["activities", limit, offset, kind ?? "all"],
		queryFn: () =>
			get<{ activities: Activity[]; total: number }>(
				`/activities?limit=${limit}&offset=${offset}${kind ? `&kind=${kind}` : ""}`,
			),
		staleTime: 30 * 1000,
	});
}

export function useActivities(limit = 50, offset = 0, kind?: ActivityKind) {
	const { data, ...query } = useQuery(activitiesOptions(limit, offset, kind));

	return {
		activities: data?.activities ?? [],
		total: data?.total ?? 0,
		...query,
	};
}

export function monthlyOptions(months = 6) {
	return queryOptions({
		queryKey: ["activities", "monthly", months],
		queryFn: () => get<MonthlyTotal[]>(`/activities/monthly?months=${months}`),
		staleTime: 30 * 1000,
	});
}

export function useMonthlyTotals(months = 6) {
	const { data, ...query } = useQuery(monthlyOptions(months));

	return { monthly: data ?? [], ...query };
}

export function activityOptions(id: string) {
	return queryOptions({
		queryKey: ["activity", id],
		queryFn: () =>
			get<{
				activity: Activity;
				details: ActivityDetails | null;
				detailsError?: string;
			}>(`/activities/${id}`),
		// Details are fetched from Garmin on first view, so the first load of
		// an activity is slow; once cached server-side it never refetches.
		staleTime: 5 * 60 * 1000,
	});
}

export function useActivity(id: string) {
	const { data, ...query } = useQuery(activityOptions(id));

	return {
		activity: data?.activity,
		details: data?.details ?? null,
		detailsError: data?.detailsError,
		...query,
	};
}
