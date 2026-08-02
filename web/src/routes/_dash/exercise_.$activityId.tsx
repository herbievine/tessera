import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { MapContainer, Polyline, TileLayer, CircleMarker } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
	Area,
	AreaChart,
	CartesianGrid,
	Line,
	LineChart,
	XAxis,
	YAxis,
} from "recharts";
import { ArrowLeft, Thermometer, Wind, Droplets } from "lucide-react";
import {
	useActivity,
	type Activity,
	type ActivityDetails,
	type ActivityLap,
	type ActivityMetrics,
	type ActivityZone,
	type ExerciseSet,
} from "@/api/activities.query";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
	type ChartConfig,
} from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
	formatDistance,
	formatDuration,
	formatPace,
	formatPaceFromSeconds,
	formatShortDate,
	formatStartTime,
} from "@/lib/activity";

export const Route = createFileRoute("/_dash/exercise_/$activityId")({
	component: RouteComponent,
});

/** Blue (slow) through green to red (fast), matching Garmin's pace ramp. */
const PACE_COLORS = [
	"#2c7bb6",
	"#00a6ca",
	"#00ccbc",
	"#90eb9d",
	"#f9d057",
	"#f29e2e",
	"#d7191c",
];

type RouteSegment = {
	positions: [number, number][];
	color: string;
};

/**
 * Colours the route by speed.
 *
 * Garmin downsamples the polyline and the metric series independently, so the
 * two arrays rarely have the same length and can't be zipped directly. Each
 * route point is mapped onto the series proportionally, which is approximate
 * but visually indistinguishable at this density.
 */
function buildRouteSegments(
	route: NonNullable<ActivityDetails["route"]>,
	speeds: (number | null)[],
): RouteSegment[] {
	if (route.length < 2) return [];

	const ratio = speeds.length / route.length;

	const speedAt = (i: number): number | null => {
		if (speeds.length === 0) return null;
		const idx = Math.min(speeds.length - 1, Math.floor(i * ratio));
		return speeds[idx] ?? null;
	};

	const valid = route
		.map((_, i) => speedAt(i))
		.filter((s): s is number => s !== null && s > 0);

	if (valid.length === 0) {
		return [
			{
				positions: route.map((p) => [p.lat, p.lon] as [number, number]),
				color: PACE_COLORS[3],
			},
		];
	}

	// Percentile bounds rather than min/max: a single GPS glitch spiking to
	// 20 m/s would otherwise flatten the whole ramp into one colour.
	const sorted = [...valid].sort((a, b) => a - b);
	const low = sorted[Math.floor(sorted.length * 0.05)];
	const high = sorted[Math.floor(sorted.length * 0.95)];
	const span = Math.max(high - low, 0.01);

	const segments: RouteSegment[] = [];

	for (let i = 0; i < route.length - 1; i++) {
		const speed = speedAt(i);
		const t = speed === null ? 0.5 : (speed - low) / span;
		const bucket = Math.min(
			PACE_COLORS.length - 1,
			Math.max(0, Math.round(t * (PACE_COLORS.length - 1))),
		);

		const a = route[i];
		const b = route[i + 1];

		segments.push({
			positions: [
				[a.lat, a.lon],
				[b.lat, b.lon],
			],
			color: PACE_COLORS[bucket],
		});
	}

	return segments;
}

function RouteMap({ details }: { details: ActivityDetails }) {
	const route = details.route ?? [];
	const segments = useMemo(
		() => buildRouteSegments(route, details.series?.speed_mps ?? []),
		[route, details.series],
	);

	if (route.length === 0) return null;

	const lats = route.map((p) => p.lat);
	const lons = route.map((p) => p.lon);
	const bounds: [[number, number], [number, number]] = [
		[Math.min(...lats), Math.min(...lons)],
		[Math.max(...lats), Math.max(...lons)],
	];

	const start = route[0];
	const end = route[route.length - 1];

	return (
		<div className="space-y-2">
			<MapContainer
				bounds={bounds}
				boundsOptions={{ padding: [24, 24] }}
				scrollWheelZoom={false}
				className="h-[420px] w-full rounded-md"
			>
				<TileLayer
					attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
					url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
				/>
				{segments.map((seg, i) => (
					<Polyline
						// biome-ignore lint/suspicious/noArrayIndexKey: segments are positional
						key={i}
						positions={seg.positions}
						pathOptions={{ color: seg.color, weight: 4, opacity: 0.9 }}
					/>
				))}
				{/* CircleMarker rather than Marker: Leaflet's default pin icon
				    resolves its image by URL and breaks under bundling. */}
				<CircleMarker
					center={[start.lat, start.lon]}
					radius={7}
					pathOptions={{ color: "#fff", fillColor: "#16a34a", fillOpacity: 1, weight: 2 }}
				/>
				<CircleMarker
					center={[end.lat, end.lon]}
					radius={7}
					pathOptions={{ color: "#fff", fillColor: "#dc2626", fillOpacity: 1, weight: 2 }}
				/>
			</MapContainer>

			<div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
				<span>Slower</span>
				<div className="flex h-2 w-40 overflow-hidden rounded-full">
					{PACE_COLORS.map((c) => (
						<div key={c} className="flex-1" style={{ backgroundColor: c }} />
					))}
				</div>
				<span>Faster</span>
			</div>
		</div>
	);
}

function StatTile({ value, label }: { value: string; label: string }) {
	return (
		<div>
			<div className="text-2xl font-semibold tabular-nums">{value}</div>
			<div className="text-xs text-muted-foreground">{label}</div>
		</div>
	);
}

type ChartPoint = Record<string, number | null>;

/** Recharts redraws every point on hover; ~400 is plenty at this width. */
const MAX_CHART_POINTS = 400;

/**
 * One chart per metric the watch actually recorded.
 *
 * Which metrics exist varies by watch and by sport, so charts are declared
 * as data and filtered against the series rather than written out one by
 * one: a strength session ends up with heart rate alone, an outdoor run with
 * the full set.
 */
type ChartSpec = {
	key: string;
	label: string;
	unit: string;
	color: string;
	shape: "area" | "line";
	/** Pace runs backwards: fewer seconds per km is faster. */
	reversed?: boolean;
	format?: (value: number) => string;
};

const CHART_SPECS: ChartSpec[] = [
	{
		key: "elevation",
		label: "Elevation",
		unit: "m",
		color: "var(--chart-3)",
		shape: "area",
	},
	{
		key: "paceSecPerKm",
		label: "Pace",
		unit: "min/km",
		color: "var(--chart-2)",
		shape: "line",
		reversed: true,
		format: formatPaceFromSeconds,
	},
	{
		key: "hr",
		label: "Heart Rate",
		unit: "bpm",
		color: "var(--chart-1)",
		shape: "area",
	},
	{
		key: "power",
		label: "Power",
		unit: "W",
		color: "var(--chart-5)",
		shape: "area",
	},
	{
		key: "cadence",
		label: "Run Cadence",
		unit: "spm",
		color: "var(--chart-4)",
		shape: "line",
	},
	{
		key: "strideLength",
		label: "Stride Length",
		unit: "m",
		color: "var(--chart-2)",
		shape: "line",
		format: (v) => v.toFixed(2),
	},
	{
		key: "verticalRatio",
		label: "Vertical Ratio",
		unit: "%",
		color: "var(--chart-4)",
		shape: "line",
		format: (v) => v.toFixed(1),
	},
	{
		key: "verticalOscillation",
		label: "Vertical Oscillation",
		unit: "cm",
		color: "var(--chart-5)",
		shape: "line",
		format: (v) => v.toFixed(1),
	},
	{
		key: "groundContactTime",
		label: "Ground Contact Time",
		unit: "ms",
		color: "var(--chart-3)",
		shape: "line",
	},
	{
		key: "respiration",
		label: "Respiration Rate",
		unit: "brpm",
		color: "var(--chart-1)",
		shape: "area",
	},
	{
		key: "performanceCondition",
		label: "Performance Condition",
		unit: "",
		color: "var(--chart-2)",
		shape: "area",
	},
];

function buildChartData(details: ActivityDetails): ChartPoint[] {
	const series = details.series;
	const n = series?.timestamp.length ?? 0;

	if (!series || n === 0) return [];

	const step = Math.max(1, Math.ceil(n / MAX_CHART_POINTS));
	const t0 = series.timestamp[0] ?? 0;
	const points: ChartPoint[] = [];

	for (let i = 0; i < n; i += step) {
		const speed = series.speed_mps?.[i];
		const ts = series.timestamp[i];
		const strideCm = series.stride_length_cm?.[i];

		points.push({
			distanceKm: (series.distance_m?.[i] ?? 0) / 1000,
			elapsed: ts !== null && ts !== undefined ? (ts - (t0 ?? 0)) / 1000 : 0,
			elevation: series.elevation_m?.[i] ?? null,
			hr: series.hr?.[i] ?? null,
			// Pace is inverted against speed, so a faster runner sits lower on
			// the axis; the axis is reversed below to keep "up" meaning faster.
			paceSecPerKm: speed && speed > 0.5 ? 1000 / speed : null,
			power: series.power_w?.[i] ?? null,
			// Cadence is published per-leg and doubled; the doubled one is
			// what Garmin shows and what the summary's spm figure matches.
			cadence: series.double_cadence?.[i] ?? series.cadence?.[i] ?? null,
			strideLength: strideCm === null || strideCm === undefined ? null : strideCm / 100,
			verticalRatio: series.vertical_ratio?.[i] ?? null,
			verticalOscillation: series.vertical_oscillation_cm?.[i] ?? null,
			groundContactTime: series.ground_contact_time_ms?.[i] ?? null,
			respiration: series.respiration_rate?.[i] ?? null,
			performanceCondition: series.performance_condition?.[i] ?? null,
		});
	}

	return points;
}

function MetricChart({
	spec,
	data,
	xProps,
}: {
	spec: ChartSpec;
	data: ChartPoint[];
	xProps: Record<string, unknown>;
}) {
	const config = {
		[spec.key]: { label: spec.label, color: spec.color },
	} satisfies ChartConfig;

	const yProps = {
		tickLine: false,
		axisLine: false,
		// Wide enough for a mm:ss pace tick; the others are three digits.
		width: spec.reversed ? 56 : 44,
		reversed: spec.reversed,
		domain: ["dataMin - 5", "dataMax + 5"] as [string, string],
		// Garmin's values are unrounded floats (57.79999923706055); without a
		// formatter Recharts renders the full value, which overflows the axis
		// and gets clipped to its tail digits.
		tickFormatter: (v: number) =>
			spec.format ? spec.format(v) : String(Math.round(v)),
	};

	const tooltip = (
		<ChartTooltip
			content={
				<ChartTooltipContent
					formatter={(value) => [
						`${spec.format ? spec.format(Number(value)) : Math.round(Number(value))} ${spec.unit}`,
						` ${spec.label}`,
					]}
				/>
			}
		/>
	);

	return (
		<div>
			<p className="mb-2 text-sm font-medium">
				{spec.label}
				{spec.unit && ` (${spec.unit})`}
			</p>
			<ChartContainer config={config} className="h-[160px] w-full">
				{spec.shape === "area" ? (
					<AreaChart data={data}>
						<CartesianGrid vertical={false} />
						<XAxis {...xProps} />
						<YAxis {...yProps} />
						{tooltip}
						<Area
							dataKey={spec.key}
							stroke={`var(--color-${spec.key})`}
							fill={`var(--color-${spec.key})`}
							fillOpacity={0.25}
							connectNulls
							dot={false}
						/>
					</AreaChart>
				) : (
					<LineChart data={data}>
						<CartesianGrid vertical={false} />
						<XAxis {...xProps} />
						<YAxis {...yProps} />
						{tooltip}
						<Line
							dataKey={spec.key}
							stroke={`var(--color-${spec.key})`}
							dot={false}
							connectNulls
						/>
					</LineChart>
				)}
			</ChartContainer>
		</div>
	);
}

function ActivityCharts({
	details,
	hasDistance,
}: {
	details: ActivityDetails;
	hasDistance: boolean;
}) {
	const [xAxis, setXAxis] = useState<"elapsed" | "distanceKm">(
		hasDistance ? "distanceKm" : "elapsed",
	);
	const data = useMemo(() => buildChartData(details), [details]);

	if (data.length === 0) return null;

	const xProps = {
		dataKey: xAxis,
		type: "number" as const,
		domain: [0, "dataMax"] as [number, string],
		tickLine: false,
		axisLine: false,
		tickFormatter: (v: number) =>
			xAxis === "distanceKm" ? `${v.toFixed(1)}` : formatDuration(v),
	};

	const specs = CHART_SPECS.filter((spec) =>
		data.some((point) => point[spec.key] !== null),
	);

	if (specs.length === 0) return null;

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between">
				<CardTitle>Charts</CardTitle>
				{hasDistance && (
					<div className="flex gap-1">
						<Button
							variant={xAxis === "elapsed" ? "default" : "outline"}
							size="sm"
							onClick={() => setXAxis("elapsed")}
						>
							Time
						</Button>
						<Button
							variant={xAxis === "distanceKm" ? "default" : "outline"}
							size="sm"
							onClick={() => setXAxis("distanceKm")}
						>
							Distance
						</Button>
					</div>
				)}
			</CardHeader>
			<CardContent className="space-y-6">
				{specs.map((spec) => (
					<MetricChart key={spec.key} spec={spec} data={data} xProps={xProps} />
				))}
			</CardContent>
		</Card>
	);
}

/** A stat row is dropped when its value is null, and a group with no rows left
 *  disappears - which is how the same declaration covers every sport. */
type StatRow = [label: string, value: string | null];

function StatGroup({ title, rows }: { title: string; rows: StatRow[] }) {
	const present = rows.filter((row): row is [string, string] => row[1] !== null);

	if (present.length === 0) return null;

	return (
		<div>
			<h3 className="border-b pb-1 text-sm font-medium">{title}</h3>
			<dl className="mt-2 space-y-2">
				{present.map(([label, value]) => (
					<div key={label}>
						<dt className="text-lg font-semibold tabular-nums">{value}</dt>
						<dd className="text-xs text-muted-foreground">{label}</dd>
					</div>
				))}
			</dl>
		</div>
	);
}

/**
 * Garmin ships these as constants, not prose: "TEMPO",
 * "IMPROVING_AEROBIC_FITNESS_2", "BARBELL_BENCH_PRESS". The trailing index on
 * the training-effect messages is a variant number, not something to show.
 */
function humanize(raw: string | null): string | null {
	if (!raw) return null;

	return raw
		.replace(/_\d+$/, "")
		.toLowerCase()
		.split("_")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

const number = (value: number | null | undefined, unit = "", digits = 0) =>
	value === null || value === undefined
		? null
		: `${value.toFixed(digits)}${unit ? ` ${unit}` : ""}`;

/** Garmin scores both self-evaluations 0-100 and renders them on its own
 *  scales: five words for feel, a 1-10 rating for perceived effort. */
const FEEL_LABELS = ["Very Weak", "Weak", "Normal", "Strong", "Very Strong"];

function formatFeel(value: number | null): string | null {
	if (value === null) return null;
	const index = Math.min(4, Math.max(0, Math.round(value / 25)));
	return FEEL_LABELS[index];
}

const RPE_LABELS: Record<number, string> = {
	0: "Rest",
	1: "Very Easy",
	2: "Easy",
	3: "Moderate",
	4: "Somewhat Hard",
	5: "Hard",
	6: "Harder",
	7: "Very Hard",
	8: "Extremely Hard",
	9: "Maximal",
	10: "Absolute Max",
};

function formatRpe(value: number | null): string | null {
	if (value === null) return null;
	const rating = Math.min(10, Math.max(0, Math.round(value / 10)));
	return `${rating}/10 ${RPE_LABELS[rating]}`;
}

function StatsTab({
	activity,
	metrics,
}: {
	activity: Activity;
	metrics: ActivityMetrics;
}) {
	const run = metrics.kind === "strength_training" ? null : metrics;
	const strength = metrics.kind === "strength_training" ? metrics : null;

	const activeCalories =
		metrics.calories !== null && metrics.restingCalories !== null
			? metrics.calories - metrics.restingCalories
			: null;

	const intensityTotal =
		metrics.moderateIntensityMinutes !== null ||
		metrics.vigorousIntensityMinutes !== null
			? (metrics.moderateIntensityMinutes ?? 0) +
				// Garmin counts vigorous minutes double towards the total.
				(metrics.vigorousIntensityMinutes ?? 0) * 2
			: null;

	return (
		<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
			<StatGroup
				title="Timing"
				rows={[
					["Time", formatDuration(activity.durationS)],
					["Moving Time", formatDuration(metrics.movingDurationS)],
					["Elapsed Time", formatDuration(metrics.elapsedDurationS)],
					["Distance", activity.distanceM ? formatDistance(activity.distanceM) : null],
				]}
			/>

			{run && (
				<StatGroup
					title="Pace/Speed"
					rows={[
						["Avg Pace", run.averageSpeedMps ? formatPace(run.averageSpeedMps) : null],
						[
							"Avg Moving Pace",
							run.avgMovingSpeedMps ? formatPace(run.avgMovingSpeedMps) : null,
						],
						["Best Pace", run.maxSpeedMps ? formatPace(run.maxSpeedMps) : null],
						[
							"Avg Grade-Adjusted Pace",
							run.avgGradeAdjustedSpeedMps
								? formatPace(run.avgGradeAdjustedSpeedMps)
								: null,
						],
					]}
				/>
			)}

			{strength && (
				<StatGroup
					title="Sets"
					rows={[
						["Total Sets", number(strength.totalSets)],
						["Active Sets", number(strength.activeSets)],
						["Total Reps", number(strength.totalReps)],
					]}
				/>
			)}

			<StatGroup
				title="Heart Rate"
				rows={[
					["Avg HR", number(metrics.averageHr, "bpm")],
					["Max HR", number(metrics.maxHr, "bpm")],
				]}
			/>

			<StatGroup
				title="Training Effect"
				rows={[
					["Primary Benefit", humanize(metrics.trainingEffectLabel)],
					[
						"Aerobic",
						metrics.aerobicTrainingEffect === null
							? null
							: [
									metrics.aerobicTrainingEffect.toFixed(1),
									humanize(metrics.aerobicTrainingEffectMessage),
								]
									.filter(Boolean)
									.join(" "),
					],
					[
						"Anaerobic",
						metrics.anaerobicTrainingEffect === null
							? null
							: [
									metrics.anaerobicTrainingEffect.toFixed(1),
									humanize(metrics.anaerobicTrainingEffectMessage),
								]
									.filter(Boolean)
									.join(" "),
					],
					["Exercise Load", number(metrics.activityTrainingLoad)],
					["VO2 Max", number(run?.vo2Max ?? null)],
				]}
			/>

			{run && (
				<StatGroup
					title="Elevation"
					rows={[
						["Total Ascent", number(run.elevationGainM, "m")],
						["Total Descent", number(run.elevationLossM, "m")],
						["Min Elev", number(run.minElevationM, "m")],
						["Max Elev", number(run.maxElevationM, "m")],
					]}
				/>
			)}

			{run && (
				<StatGroup
					title="Running Dynamics"
					rows={[
						["Avg Run Cadence", number(run.averageCadence, "spm")],
						["Max Run Cadence", number(run.maxCadence, "spm")],
						[
							"Avg Stride Length",
							run.avgStrideLengthCm === null
								? null
								: `${(run.avgStrideLengthCm / 100).toFixed(2)} m`,
						],
						["Avg Vertical Ratio", number(run.avgVerticalRatio, "%", 1)],
						[
							"Avg Vertical Oscillation",
							number(run.avgVerticalOscillationCm, "cm", 1),
						],
						["Avg Ground Contact Time", number(run.avgGroundContactTimeMs, "ms")],
						[
							"Avg GCT Balance",
							number(run.avgGroundContactBalance, "%", 1),
						],
						["Steps", number(run.steps)],
					]}
				/>
			)}

			{run && (
				<StatGroup
					title="Power"
					rows={[
						["Avg Power", number(run.avgPowerW, "W")],
						["Max Power", number(run.maxPowerW, "W")],
						["Normalized Power", number(run.normalizedPowerW, "W")],
					]}
				/>
			)}

			<StatGroup
				title="Respiration Rate"
				rows={[
					["Avg Respiration Rate", number(metrics.avgRespirationRate, "brpm")],
					["Min Respiration Rate", number(metrics.minRespirationRate, "brpm")],
					["Max Respiration Rate", number(metrics.maxRespirationRate, "brpm")],
				]}
			/>

			<StatGroup
				title="Nutrition & Hydration"
				rows={[
					["Resting Calories", number(metrics.restingCalories)],
					["Active Calories", number(activeCalories)],
					["Total Calories Burned", number(metrics.calories)],
					["Est. Sweat Loss", number(run?.waterEstimatedMl ?? null, "ml")],
				]}
			/>

			<StatGroup
				title="Intensity Minutes"
				rows={[
					["Moderate", number(metrics.moderateIntensityMinutes, "min")],
					["Vigorous", number(metrics.vigorousIntensityMinutes, "min")],
					["Total", number(intensityTotal, "min")],
				]}
			/>

			<StatGroup
				title="Body Battery"
				rows={[["Net Impact", number(metrics.bodyBatteryDiff)]]}
			/>

			<StatGroup
				title="Self Evaluation"
				rows={[
					["How did you feel?", formatFeel(metrics.workoutFeel)],
					["Perceived Effort", formatRpe(metrics.workoutRpe)],
				]}
			/>
		</div>
	);
}

/** Lap columns, dropped wholesale when no lap in the activity has the metric -
 *  a strength session's laps carry little more than time and heart rate. */
const LAP_COLUMNS: {
	label: string;
	sub: string;
	value: (lap: ActivityLap) => string | null;
}[] = [
	{
		label: "Time",
		sub: "",
		value: (lap) => formatDuration(lap.duration_s),
	},
	{
		label: "Distance",
		sub: "km",
		value: (lap) =>
			lap.distance_m === null ? null : (lap.distance_m / 1000).toFixed(2),
	},
	{
		label: "Avg Pace",
		sub: "min/km",
		// Null rather than a dash, so the column disappears on a strength
		// session's laps instead of standing there empty.
		value: (lap) =>
			lap.distance_m && lap.duration_s
				? formatPace(lap.distance_m / lap.duration_s)
				: null,
	},
	{
		label: "Avg GAP",
		sub: "min/km",
		value: (lap) =>
			lap.avg_grade_adjusted_speed_mps === null
				? null
				: formatPace(lap.avg_grade_adjusted_speed_mps),
	},
	{ label: "Avg HR", sub: "bpm", value: (lap) => number(lap.average_hr) },
	{ label: "Max HR", sub: "bpm", value: (lap) => number(lap.max_hr) },
	{
		label: "Ascent",
		sub: "m",
		value: (lap) => number(lap.elevation_gain_m),
	},
	{
		label: "Descent",
		sub: "m",
		value: (lap) => number(lap.elevation_loss_m),
	},
	{ label: "Avg Power", sub: "W", value: (lap) => number(lap.avg_power_w) },
	{ label: "Max Power", sub: "W", value: (lap) => number(lap.max_power_w) },
	{
		label: "Avg Cadence",
		sub: "spm",
		value: (lap) => number(lap.average_cadence),
	},
	{
		label: "Avg GCT",
		sub: "ms",
		value: (lap) => number(lap.avg_ground_contact_time_ms),
	},
	{
		label: "Avg Stride",
		sub: "m",
		value: (lap) =>
			lap.avg_stride_length_cm === null
				? null
				: (lap.avg_stride_length_cm / 100).toFixed(2),
	},
	{ label: "Calories", sub: "", value: (lap) => number(lap.calories) },
];

function LapsTab({ laps }: { laps: ActivityLap[] }) {
	const columns = LAP_COLUMNS.filter((column) =>
		laps.some((lap) => column.value(lap) !== null),
	);

	return (
		// Fifteen columns don't fit a phone, and squeezing them would make the
		// table unreadable everywhere rather than just on small screens.
		<div className="overflow-x-auto">
			<table className="w-full min-w-[720px] text-sm tabular-nums">
				<thead>
					<tr className="border-b text-xs font-medium text-muted-foreground">
						<th className="px-2 py-2 text-left">Lap</th>
						{columns.map((column) => (
							<th key={column.label} className="px-2 py-2 text-right">
								<div>{column.label}</div>
								{column.sub && <div className="font-normal">{column.sub}</div>}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{laps.map((lap, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: laps are ordinal
						<tr key={i} className="border-b last:border-0">
							<td className="px-2 py-2 text-left font-medium">
								{lap.lap_index ?? i + 1}
							</td>
							{columns.map((column) => (
								<td key={column.label} className="px-2 py-2 text-right">
									{column.value(lap) ?? "--"}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

/** Garmin's zone names are fixed per zone number rather than configurable. */
const HR_ZONE_NAMES = ["Warm Up", "Easy", "Aerobic", "Threshold", "Maximum"];
const POWER_ZONE_NAMES = [
	"Easy",
	"Moderate",
	"Tempo",
	"Long Interval",
	"Short Interval",
];

function ZoneBars({
	zones,
	names,
	unit,
}: {
	zones: ActivityZone[];
	names: string[];
	unit: string;
}) {
	const total = zones.reduce((sum, z) => sum + z.secsInZone, 0);
	if (total === 0) return null;

	// Garmin sends only each zone's lower bound, so a zone's upper bound is
	// the next one's lower bound; the top zone is open-ended.
	const byNumber = [...zones].sort((a, b) => a.zoneNumber - b.zoneNumber);

	const boundary = (index: number): string | null => {
		const zone = byNumber[index];
		if (zone.zoneLowBoundary === null) return null;

		const next = byNumber[index + 1];

		if (!next || next.zoneLowBoundary === null) {
			return `> ${Math.round(zone.zoneLowBoundary)} ${unit}`;
		}

		return `${Math.round(zone.zoneLowBoundary)} - ${Math.round(next.zoneLowBoundary) - 1} ${unit}`;
	};

	// Highest zone first, the way Garmin stacks them.
	return (
		<div className="space-y-3">
			{byNumber
				.map((zone, index) => ({ zone, index }))
				.reverse()
				.map(({ zone, index }) => {
					const pct = (zone.secsInZone / total) * 100;
					const name = names[zone.zoneNumber - 1];

					return (
						<div key={zone.zoneNumber} className="space-y-1">
							<div className="flex items-baseline gap-2 text-sm">
								<span className="font-medium">Zone {zone.zoneNumber}</span>
								<span className="text-muted-foreground">
									{[boundary(index), name].filter(Boolean).join(" • ")}
								</span>
							</div>
							<div className="flex items-center gap-3">
								<div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
									<div
										className="h-full rounded-full"
										style={{
											width: `${pct}%`,
											backgroundColor: PACE_COLORS[zone.zoneNumber + 1] ?? "#888",
										}}
									/>
								</div>
								<span className="w-16 shrink-0 text-right text-sm tabular-nums">
									{formatDuration(zone.secsInZone)}
								</span>
								<span className="w-12 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
									{pct.toFixed(0)}%
								</span>
							</div>
						</div>
					);
				})}
		</div>
	);
}

function ZonesTab({ details }: { details: ActivityDetails }) {
	const hasHr = details.hrZones && details.hrZones.length > 0;
	const hasPower = details.powerZones && details.powerZones.length > 0;

	if (!hasHr && !hasPower) {
		return (
			<p className="text-sm text-muted-foreground">
				No zone data for this activity.
			</p>
		);
	}

	return (
		<div className="space-y-8">
			{details.hrZones && hasHr && (
				<div className="space-y-3">
					<h3 className="text-lg font-medium">Heart Rate Zones</h3>
					<ZoneBars zones={details.hrZones} names={HR_ZONE_NAMES} unit="bpm" />
				</div>
			)}
			{details.powerZones && hasPower && (
				<div className="space-y-3">
					<h3 className="text-lg font-medium">Power Zones</h3>
					<ZoneBars
						zones={details.powerZones}
						names={POWER_ZONE_NAMES}
						unit="W"
					/>
				</div>
			)}
		</div>
	);
}

function humanizeExercise(set: ExerciseSet): string {
	return humanize(set.name ?? set.category) ?? "Unknown";
}

function SetsTab({ sets }: { sets: ExerciseSet[] }) {
	// Rest periods are recorded as sets too; they'd otherwise double the rows
	// with blank ones.
	const working = sets.filter((set) => set.set_type !== "REST");

	if (working.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">
				No sets recorded for this session.
			</p>
		);
	}

	return (
		<div className="overflow-x-auto">
			<table className="w-full text-sm tabular-nums">
				<thead>
					<tr className="border-b text-xs font-medium text-muted-foreground">
						<th className="px-2 py-2 text-left">Set</th>
						<th className="px-2 py-2 text-left">Exercise</th>
						<th className="px-2 py-2 text-right">Reps</th>
						<th className="px-2 py-2 text-right">Weight</th>
						<th className="px-2 py-2 text-right">Time</th>
					</tr>
				</thead>
				<tbody>
					{working.map((set) => (
						<tr key={set.set_index} className="border-b last:border-0">
							<td className="px-2 py-2 font-medium">{set.set_index}</td>
							<td className="px-2 py-2 text-left">{humanizeExercise(set)}</td>
							<td className="px-2 py-2 text-right">{set.reps ?? "--"}</td>
							<td className="px-2 py-2 text-right">
								{set.weight_kg === null ? "--" : `${set.weight_kg} kg`}
							</td>
							<td className="px-2 py-2 text-right">
								{formatDuration(set.duration_s)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

type TabKey = "stats" | "laps" | "zones" | "sets";

function DetailTabs({
	activity,
	metrics,
	details,
}: {
	activity: Activity;
	metrics: ActivityMetrics;
	details: ActivityDetails | null;
}) {
	const tabs: { key: TabKey; label: string }[] = [{ key: "stats", label: "Stats" }];

	if (details?.exerciseSets && details.exerciseSets.length > 0) {
		tabs.push({ key: "sets", label: "Sets" });
	}

	if (details?.splits && details.splits.length > 0) {
		tabs.push({ key: "laps", label: "Laps" });
	}

	if (
		(details?.hrZones && details.hrZones.length > 0) ||
		(details?.powerZones && details.powerZones.length > 0)
	) {
		tabs.push({ key: "zones", label: "Time in Zones" });
	}

	const [tab, setTab] = useState<TabKey>("stats");

	return (
		<Card>
			<CardHeader>
				<div className="flex gap-1">
					{tabs.map((t) => (
						<Button
							key={t.key}
							variant={tab === t.key ? "default" : "outline"}
							size="sm"
							onClick={() => setTab(t.key)}
						>
							{t.label}
						</Button>
					))}
				</div>
			</CardHeader>
			<CardContent>
				{tab === "stats" && <StatsTab activity={activity} metrics={metrics} />}
				{tab === "sets" && details?.exerciseSets && (
					<SetsTab sets={details.exerciseSets} />
				)}
				{tab === "laps" && details?.splits && <LapsTab laps={details.splits} />}
				{tab === "zones" && details && <ZonesTab details={details} />}
			</CardContent>
		</Card>
	);
}

const KIND_LABELS: Record<string, string> = {
	running: "Running",
	trail_running: "Trail Running",
	strength_training: "Strength",
};

function SummaryTiles({
	activity,
	metrics,
}: {
	activity: Activity;
	metrics: ActivityMetrics | null;
}) {
	const avgPace =
		activity.distanceM && activity.durationS
			? formatPace(activity.distanceM / activity.durationS)
			: "--";

	const isStrength = metrics?.kind === "strength_training";

	return (
		<Card>
			<CardContent className="flex flex-wrap gap-8 pt-6">
				{!isStrength && (
					<StatTile value={formatDistance(activity.distanceM)} label="Distance" />
				)}
				<StatTile value={formatDuration(activity.durationS)} label="Time" />
				{!isStrength && <StatTile value={avgPace} label="Avg Pace" />}
				{metrics && metrics.kind !== "strength_training" && (
					<StatTile
						value={
							metrics.elevationGainM !== null
								? `${Math.round(metrics.elevationGainM)} m`
								: "--"
						}
						label="Total Ascent"
					/>
				)}
				{metrics?.kind === "strength_training" && (
					<>
						<StatTile value={metrics.totalSets?.toString() ?? "--"} label="Sets" />
						<StatTile value={metrics.totalReps?.toString() ?? "--"} label="Reps" />
					</>
				)}
				<StatTile
					value={metrics?.calories ? String(Math.round(metrics.calories)) : "--"}
					label="Calories"
				/>
				{metrics?.averageHr && (
					<StatTile
						value={`${Math.round(metrics.averageHr)} bpm`}
						label="Avg HR"
					/>
				)}
			</CardContent>
		</Card>
	);
}

function RouteComponent() {
	const { activityId } = Route.useParams();
	const { activity, details, detailsError, isLoading } = useActivity(activityId);

	if (isLoading) {
		return (
			<div className="space-y-4">
				<Skeleton className="h-8 w-64" />
				<Skeleton className="h-24 w-full" />
				<Skeleton className="h-[420px] w-full" />
			</div>
		);
	}

	if (!activity) {
		return <p className="text-muted-foreground">Activity not found.</p>;
	}

	const metrics = activity.metrics;
	const kindLabel = KIND_LABELS[metrics?.kind ?? activity.typeKey];
	const hasRoute = (details?.route?.length ?? 0) > 0;

	return (
		<div className="flex flex-col gap-4">
			<div>
				<Link
					to="/exercise"
					className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
				>
					<ArrowLeft className="size-4" />
					All activities
				</Link>
				<h2 className="text-2xl font-semibold">
					{activity.name ?? "Untitled"}
				</h2>
				<p className="text-sm text-muted-foreground">
					{formatShortDate(activity.startTimeLocal)} at{" "}
					{formatStartTime(activity.startTimeLocal)}
					{kindLabel && ` · ${kindLabel}`}
				</p>
			</div>

			<SummaryTiles activity={activity} metrics={metrics} />

			{detailsError && (
				<Card>
					<CardContent className="pt-6 text-sm text-muted-foreground">
						Couldn't load the route and charts for this activity: {detailsError}
					</CardContent>
				</Card>
			)}

			{details && hasRoute && (
				<Card>
					<CardHeader className="flex flex-row items-center justify-between">
						<CardTitle>Route</CardTitle>
						{details.weather && (
							<div className="flex items-center gap-4 text-sm text-muted-foreground">
								{details.weather.temp_c !== null && (
									<span className="flex items-center gap-1">
										<Thermometer className="size-4" />
										{details.weather.temp_c}°C
									</span>
								)}
								{details.weather.relative_humidity !== null && (
									<span className="flex items-center gap-1">
										<Droplets className="size-4" />
										{details.weather.relative_humidity}%
									</span>
								)}
								{details.weather.wind_speed_kph !== null && (
									<span className="flex items-center gap-1">
										<Wind className="size-4" />
										{details.weather.wind_speed_kph} km/h
									</span>
								)}
								{details.weather.description && (
									<span>{details.weather.description}</span>
								)}
							</div>
						)}
					</CardHeader>
					<CardContent>
						<RouteMap details={details} />
					</CardContent>
				</Card>
			)}

			{details && (
				<ActivityCharts details={details} hasDistance={Boolean(activity.distanceM)} />
			)}

			{metrics && (
				<DetailTabs activity={activity} metrics={metrics} details={details} />
			)}
		</div>
	);
}
