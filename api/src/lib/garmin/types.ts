/**
 * Shapes of the JSON blobs stored on `activities` and `activity_details`.
 *
 * These are the contract between the Garmin microservice's formatters and
 * the columns they land in, so the `$type` annotations on those columns
 * point here rather than restating the shape.
 */

/**
 * The sports the app renders. Garmin has dozens of type keys; the ones it
 * treats as variants of these (treadmill and indoor running) map onto the
 * same kind, while the activity's own `type_key` column keeps Garmin's
 * verbatim key for filtering.
 */
export type ActivityKind = "running" | "trail_running" | "strength_training";

/** Metrics every sport reports, whatever the watch was strapped to. */
type CommonMetrics = {
	movingDurationS: number | null;
	elapsedDurationS: number | null;
	calories: number | null;
	/** Calories the body would have burned at rest over the same period. */
	restingCalories: number | null;
	averageHr: number | null;
	maxHr: number | null;
	avgRespirationRate: number | null;
	minRespirationRate: number | null;
	maxRespirationRate: number | null;
	aerobicTrainingEffect: number | null;
	anaerobicTrainingEffect: number | null;
	aerobicTrainingEffectMessage: string | null;
	anaerobicTrainingEffectMessage: string | null;
	trainingEffectLabel: string | null;
	activityTrainingLoad: number | null;
	moderateIntensityMinutes: number | null;
	vigorousIntensityMinutes: number | null;
	bodyBatteryDiff: number | null;
	/** Self-evaluation, entered by hand in Connect, so usually null. */
	workoutFeel: number | null;
	workoutRpe: number | null;
	lapCount: number | null;
};

/** Metrics that only mean something when covering ground. */
type RunMetrics = CommonMetrics & {
	elevationGainM: number | null;
	elevationLossM: number | null;
	minElevationM: number | null;
	maxElevationM: number | null;
	averageSpeedMps: number | null;
	maxSpeedMps: number | null;
	avgMovingSpeedMps: number | null;
	avgGradeAdjustedSpeedMps: number | null;
	averageCadence: number | null;
	maxCadence: number | null;
	steps: number | null;
	avgStrideLengthCm: number | null;
	avgVerticalOscillationCm: number | null;
	avgVerticalRatio: number | null;
	avgGroundContactTimeMs: number | null;
	avgGroundContactBalance: number | null;
	avgPowerW: number | null;
	maxPowerW: number | null;
	normalizedPowerW: number | null;
	vo2Max: number | null;
	waterEstimatedMl: number | null;
	locationName: string | null;
	startLatitude: number | null;
	startLongitude: number | null;
	hasPolyline: boolean | null;
};

export type RunningMetrics = RunMetrics & { kind: "running" };

export type TrailRunningMetrics = RunMetrics & { kind: "trail_running" };

export type StrengthMetrics = CommonMetrics & {
	kind: "strength_training";
	totalSets: number | null;
	/** Sets that were actual work rather than rest. */
	activeSets: number | null;
	totalReps: number | null;
};

export type ActivityMetrics =
	| RunningMetrics
	| TrailRunningMetrics
	| StrengthMetrics;

export type ActivityRoutePoint = {
	lat: number;
	lon: number;
	alt: number | null;
};

/**
 * Per-point metrics, one array per metric, all the same length.
 *
 * Only `timestamp` is guaranteed: the service drops any metric the watch
 * never recorded rather than storing an array of nulls per sample, so a
 * strength session arrives with almost nothing and an outdoor run with
 * everything.
 */
export type ActivitySeries = {
	timestamp: (number | null)[];
	distance_m?: (number | null)[];
	elevation_m?: (number | null)[];
	speed_mps?: (number | null)[];
	grade_adjusted_speed_mps?: (number | null)[];
	hr?: (number | null)[];
	cadence?: (number | null)[];
	double_cadence?: (number | null)[];
	power_w?: (number | null)[];
	stride_length_cm?: (number | null)[];
	vertical_oscillation_cm?: (number | null)[];
	vertical_ratio?: (number | null)[];
	ground_contact_time_ms?: (number | null)[];
	ground_contact_balance?: (number | null)[];
	respiration_rate?: (number | null)[];
	performance_condition?: (number | null)[];
};

export type ActivityLap = {
	lap_index: number | null;
	start_time_gmt: string | null;
	distance_m: number | null;
	duration_s: number | null;
	moving_duration_s: number | null;
	elapsed_duration_s: number | null;
	average_speed_mps: number | null;
	max_speed_mps: number | null;
	avg_grade_adjusted_speed_mps: number | null;
	elevation_gain_m: number | null;
	elevation_loss_m: number | null;
	average_hr: number | null;
	max_hr: number | null;
	average_cadence: number | null;
	max_cadence: number | null;
	avg_power_w: number | null;
	max_power_w: number | null;
	normalized_power_w: number | null;
	avg_stride_length_cm: number | null;
	avg_ground_contact_time_ms: number | null;
	avg_ground_contact_balance: number | null;
	avg_vertical_oscillation_cm: number | null;
	avg_vertical_ratio: number | null;
	calories: number | null;
	intensity_type: string | null;
};

export type ActivityWeather = {
	temp_c: number | null;
	apparent_temp_c: number | null;
	dew_point_c: number | null;
	relative_humidity: number | null;
	wind_speed_kph: number | null;
	wind_direction_compass: string | null;
	description: string | null;
};

/**
 * Time in a heart-rate or power zone. `zoneLowBoundary` is the only boundary
 * Garmin sends; a zone's upper bound is the next zone's lower bound.
 */
export type ActivityZone = {
	zoneNumber: number;
	secsInZone: number;
	zoneLowBoundary: number | null;
};

/**
 * One set of a strength session. `name` is null when Garmin recognised only
 * the broad category, and rest periods come through as sets with
 * `set_type: "REST"` and no reps.
 */
export type ExerciseSet = {
	set_index: number;
	set_type: string | null;
	category: string | null;
	name: string | null;
	reps: number | null;
	weight_kg: number | null;
	duration_s: number | null;
	start_time_gmt: string | null;
};
