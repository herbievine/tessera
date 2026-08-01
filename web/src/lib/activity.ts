/**
 * Garmin's startTimeLocal is a wall clock with no offset, stored by the API
 * as UTC digits. Rendering it in the browser's zone would shift it, so every
 * formatter here reads the UTC components deliberately.
 */
export function localDate(iso: string): Date {
	return new Date(iso);
}

export function formatStartTime(iso: string): string {
	return localDate(iso).toLocaleTimeString("en-US", {
		hour: "numeric",
		minute: "2-digit",
		timeZone: "UTC",
	});
}

export function formatDayLabel(iso: string): string {
	return localDate(iso).toLocaleDateString("en-US", {
		weekday: "long",
		timeZone: "UTC",
	});
}

export function formatShortDate(iso: string): string {
	return localDate(iso).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		timeZone: "UTC",
	});
}

/** Garmin's own convention: m:ss under an hour, h:mm:ss over it. */
export function formatDuration(seconds: number | null): string {
	if (seconds === null || Number.isNaN(seconds)) return "--";

	const total = Math.round(seconds);
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;

	if (h > 0) {
		return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
	}

	return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatDistance(metres: number | null): string {
	if (!metres) return "--";
	return `${(metres / 1000).toFixed(2)} km`;
}

/** Pace in min/km, the unit runners actually read, rather than m/s. */
export function formatPace(metresPerSecond: number | null): string {
	if (!metresPerSecond || metresPerSecond <= 0) return "--";

	const secondsPerKm = 1000 / metresPerSecond;
	const m = Math.floor(secondsPerKm / 60);
	const s = Math.round(secondsPerKm % 60);

	// 5:60 /km is never right; carry the rounding into the minute.
	if (s === 60) return `${m + 1}:00 /km`;

	return `${m}:${String(s).padStart(2, "0")} /km`;
}

export function paceFromSplit(
	distanceM: number | null,
	durationS: number | null,
): string {
	if (!distanceM || !durationS) return "--";
	return formatPace(distanceM / durationS);
}

/**
 * Groups activities the way Garmin's list does — by calendar month relative
 * to now, so the most recent block reads "Last Month" rather than a date.
 */
export function monthGroupLabel(iso: string, now = new Date()): string {
	const d = localDate(iso);
	const months =
		(now.getUTCFullYear() - d.getUTCFullYear()) * 12 +
		(now.getUTCMonth() - d.getUTCMonth());

	if (months <= 1) return "Last Month";
	if (months < 12) return `${months} Months Ago`;

	const years = Math.floor(months / 12);
	return years === 1 ? "Last Year" : `${years} Years Ago`;
}

/**
 * Relative day names for the recent past, matching Garmin's list. Falls back
 * to a short date beyond a week, where "Tuesday" stops being unambiguous.
 */
export function formatRelativeDate(iso: string, now = new Date()): string {
	const d = localDate(iso);
	const startOfDay = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
	const startOfToday = Date.UTC(
		now.getUTCFullYear(),
		now.getUTCMonth(),
		now.getUTCDate(),
	);
	const days = Math.round((startOfToday - startOfDay) / 86_400_000);

	if (days === 0) return "Today";
	if (days === 1) return "Yesterday";
	if (days < 7) return formatDayLabel(iso);

	return formatShortDate(iso);
}
