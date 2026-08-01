import { queryOptions, useQuery } from "@tanstack/react-query";

export type Activity = {
	id: string;
	garminActivityId: string;
	name: string | null;
	typeKey: string;
	startTimeLocal: string;
	startTimeGmt: string;
	distanceM: number | null;
	durationS: number | null;
	movingDurationS: number | null;
	elevationGainM: number | null;
	elevationLossM: number | null;
	averageSpeedMps: number | null;
	maxSpeedMps: number | null;
	calories: number | null;
	averageHr: number | null;
	maxHr: number | null;
	averageCadence: number | null;
	maxCadence: number | null;
	steps: number | null;
	vo2Max: number | null;
	trainingEffectLabel: string | null;
	locationName: string | null;
	lapCount: number | null;
};

export type ActivitySplit = {
	distance: number | null;
	duration: number | null;
	averageSpeed: number | null;
	elevationGain: number | null;
	elevationLoss: number | null;
	averageHR: number | null;
	maxHR: number | null;
};

export type ActivityDetails = {
	pointCount: number | null;
	route: { lat: number; lon: number; alt: number | null }[];
	series: {
		timestamp: (number | null)[];
		distance_m: (number | null)[];
		elevation_m: (number | null)[];
		speed_mps: (number | null)[];
		hr: (number | null)[];
		cadence: (number | null)[];
	};
	splits: ActivitySplit[] | null;
	weather: {
		temp_c: number | null;
		apparent_temp_c: number | null;
		relative_humidity: number | null;
		wind_speed_kph: number | null;
		wind_direction_compass: string | null;
		description: string | null;
	} | null;
	hrZones: { zoneNumber: number; secsInZone: number }[] | null;
};

export type MonthlyTotal = {
	month: string;
	running: number;
	trailRunning: number;
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

export function activitiesOptions(limit = 50, offset = 0) {
	return queryOptions({
		queryKey: ["activities", limit, offset],
		queryFn: () =>
			get<{ activities: Activity[]; total: number }>(
				`/activities?limit=${limit}&offset=${offset}`,
			),
		staleTime: 30 * 1000,
	});
}

export function useActivities(limit = 50, offset = 0) {
	const { data, ...query } = useQuery(activitiesOptions(limit, offset));

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
