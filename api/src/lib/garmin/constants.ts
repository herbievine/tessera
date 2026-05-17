export const garminTypes = {
	sleep_score: {
		name: "Sleep Score",
		key: "sleep_score",
		unit: "score",
	},
	sleep_quality: {
		name: "Sleep Quality",
		key: "sleep_quality",
		unit: "rating",
	},
	sleep_total_hours: {
		name: "Total Sleep Hours",
		key: "sleep_total_hours",
		unit: "hours",
	},
	sleep_deep_hours: {
		name: "Deep Sleep Hours",
		key: "sleep_deep_hours",
		unit: "hours",
	},
	sleep_light_hours: {
		name: "Light Sleep Hours",
		key: "sleep_light_hours",
		unit: "hours",
	},
	sleep_rem_hours: {
		name: "REM Sleep Hours",
		key: "sleep_rem_hours",
		unit: "hours",
	},
	sleep_awake_hours: {
		name: "Awake Hours",
		key: "sleep_awake_hours",
		unit: "hours",
	},
	resting_heart_rate: {
		name: "Resting Heart Rate",
		key: "resting_heart_rate",
		unit: "bpm",
	},
	heart_rate_max: {
		name: "Max Heart Rate",
		key: "heart_rate_max",
		unit: "bpm",
	},
	heart_rate_min: {
		name: "Min Heart Rate",
		key: "heart_rate_min",
		unit: "bpm",
	},
	heart_rate_avg: {
		name: "Average Heart Rate",
		key: "heart_rate_avg",
		unit: "bpm",
	},
	heart_rate: {
		name: "Heart Rate",
		key: "heart_rate",
		unit: "bpm",
	},
	hrv_weekly_avg: {
		name: "HRV Weekly Average",
		key: "hrv_weekly_avg",
		unit: "ms",
	},
	hrv_last_night_avg: {
		name: "HRV Last Night Average",
		key: "hrv_last_night_avg",
		unit: "ms",
	},
	hrv_low_upper: {
		name: "HRV Low Upper",
		key: "hrv_low_upper",
		unit: "ms",
	},
	hrv_balanced_low: {
		name: "HRV Balanced Low",
		key: "hrv_balanced_low",
		unit: "ms",
	},
	hrv_balanced_upper: {
		name: "HRV Balanced Upper",
		key: "hrv_balanced_upper",
		unit: "ms",
	},
	hrv_marker_value: {
		name: "HRV Marker Value",
		key: "hrv_marker_value",
		unit: "ms",
	},
} as const;

export const garminKeys: (keyof typeof garminTypes)[] = [
	"sleep_score",
	"sleep_quality",
	"sleep_total_hours",
	"sleep_deep_hours",
	"sleep_light_hours",
	"sleep_rem_hours",
	"sleep_awake_hours",
	"resting_heart_rate",
	"heart_rate_max",
	"heart_rate_min",
	"heart_rate_avg",
	"heart_rate",
	"hrv_weekly_avg",
	"hrv_last_night_avg",
] as const;
