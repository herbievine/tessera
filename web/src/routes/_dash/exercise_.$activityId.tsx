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
	type ActivityDetails,
	type ActivitySplit,
} from "@/api/activities.query";
import {
	Card,
	CardContent,
	CardDescription,
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
	formatShortDate,
	formatStartTime,
	paceFromSplit,
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
function buildRouteSegments(details: ActivityDetails): RouteSegment[] {
	const { route, series } = details;
	if (route.length < 2) return [];

	const speeds = series.speed_mps;
	const ratio = speeds.length / route.length;

	const speedAt = (i: number): number | null => {
		if (speeds.length === 0) return null;
		const idx = Math.min(speeds.length - 1, Math.floor(i * ratio));
		return speeds[idx] ?? null;
	}

	const valid = route
		.map((_, i) => speedAt(i))
		.filter((s): s is number => s !== null && s > 0);

	if (valid.length === 0) {
		return [
			{
				positions: route.map((p) => [p.lat, p.lon] as [number, number]),
				color: PACE_COLORS[3],
			},
		]
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
		)

		const a = route[i];
		const b = route[i + 1];

		segments.push({
			positions: [
				[a.lat, a.lon],
				[b.lat, b.lon],
			],
			color: PACE_COLORS[bucket],
		})
	}

	return segments;
}

function RouteMap({ details }: { details: ActivityDetails }) {
	const segments = useMemo(() => buildRouteSegments(details), [details]);

	if (details.route.length === 0) return null;

	const lats = details.route.map((p) => p.lat);
	const lons = details.route.map((p) => p.lon);
	const bounds: [[number, number], [number, number]] = [
		[Math.min(...lats), Math.min(...lons)],
		[Math.max(...lats), Math.max(...lons)],
	]

	const start = details.route[0];
	const end = details.route[details.route.length - 1];

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
	)
}

function StatTile({ value, label }: { value: string; label: string }) {
	return (
		<div>
			<div className="text-2xl font-semibold tabular-nums">{value}</div>
			<div className="text-xs text-muted-foreground">{label}</div>
		</div>
	)
}

type ChartPoint = {
	distanceKm: number;
	elapsed: number;
	elevation: number | null;
	hr: number | null;
	paceSecPerKm: number | null;
};

/** Recharts redraws every point on hover; ~400 is plenty at this width. */
const MAX_CHART_POINTS = 400;

function buildChartData(details: ActivityDetails): ChartPoint[] {
	const { series } = details;
	const n = series.timestamp.length;
	if (n === 0) return [];

	const step = Math.max(1, Math.ceil(n / MAX_CHART_POINTS));
	const t0 = series.timestamp[0] ?? 0;
	const points: ChartPoint[] = [];

	for (let i = 0; i < n; i += step) {
		const speed = series.speed_mps[i];
		const ts = series.timestamp[i];

		points.push({
			distanceKm: (series.distance_m[i] ?? 0) / 1000,
			elapsed: ts !== null && ts !== undefined ? (ts - (t0 ?? 0)) / 1000 : 0,
			elevation: series.elevation_m[i] ?? null,
			hr: series.hr[i] ?? null,
			// Pace is inverted against speed, so a faster runner sits lower on
			// the axis; the axis is reversed below to keep "up" meaning faster.
			paceSecPerKm: speed && speed > 0.5 ? 1000 / speed : null,
		})
	}

	return points;
}

const metricConfig = {
	elevation: { label: "Elevation", color: "var(--chart-3)" },
	hr: { label: "Heart Rate", color: "var(--chart-1)" },
	paceSecPerKm: { label: "Pace", color: "var(--chart-2)" },
} satisfies ChartConfig;

function ActivityCharts({ details }: { details: ActivityDetails }) {
	const [xAxis, setXAxis] = useState<"elapsed" | "distanceKm">("distanceKm");
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
	}

	const hasHr = data.some((d) => d.hr !== null);

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between">
				<CardTitle>Charts</CardTitle>
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
			</CardHeader>
			<CardContent className="space-y-6">
				<div>
					<p className="mb-2 text-sm font-medium">Elevation</p>
					<ChartContainer config={metricConfig} className="h-[160px] w-full">
						<AreaChart data={data}>
							<CartesianGrid vertical={false} />
							<XAxis {...xProps} />
							<YAxis
								tickLine={false}
								axisLine={false}
								width={44}
								unit=" m"
								domain={["dataMin - 5", "dataMax + 5"]}
							/>
							<ChartTooltip content={<ChartTooltipContent />} />
							<Area
								dataKey="elevation"
								stroke="var(--color-elevation)"
								fill="var(--color-elevation)"
								fillOpacity={0.25}
								connectNulls
								dot={false}
							/>
						</AreaChart>
					</ChartContainer>
				</div>

				<div>
					<p className="mb-2 text-sm font-medium">Pace</p>
					<ChartContainer config={metricConfig} className="h-[160px] w-full">
						<LineChart data={data}>
							<CartesianGrid vertical={false} />
							<XAxis {...xProps} />
							<YAxis
								tickLine={false}
								axisLine={false}
								width={56}
								// Reversed: lower seconds-per-km is faster, and a
								// faster stretch should read as a peak, not a dip.
								reversed
								domain={["dataMin - 20", "dataMax + 20"]}
								tickFormatter={(v: number) =>
									`${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, "0")}`
								}
							/>
							<ChartTooltip
								content={
									<ChartTooltipContent
										formatter={(value) => [
											formatPace(1000 / Number(value)),
											" Pace",
										]}
									/>
								}
							/>
							<Line
								dataKey="paceSecPerKm"
								stroke="var(--color-paceSecPerKm)"
								dot={false}
								connectNulls
							/>
						</LineChart>
					</ChartContainer>
				</div>

				{hasHr && (
					<div>
						<p className="mb-2 text-sm font-medium">Heart Rate</p>
						<ChartContainer config={metricConfig} className="h-[160px] w-full">
							<LineChart data={data}>
								<CartesianGrid vertical={false} />
								<XAxis {...xProps} />
								<YAxis
									tickLine={false}
									axisLine={false}
									width={44}
									unit=" bpm"
									domain={["dataMin - 5", "dataMax + 5"]}
								/>
								<ChartTooltip content={<ChartTooltipContent />} />
								<Line
									dataKey="hr"
									stroke="var(--color-hr)"
									dot={false}
									connectNulls
								/>
							</LineChart>
						</ChartContainer>
					</div>
				)}
			</CardContent>
		</Card>
	)
}

function SplitsTable({ splits }: { splits: ActivitySplit[] }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Splits</CardTitle>
				<CardDescription>Per-lap breakdown</CardDescription>
			</CardHeader>
			<CardContent className="px-0">
				<div className="grid grid-cols-5 gap-2 border-b px-4 pb-2 text-xs font-medium text-muted-foreground">
					<span>Lap</span>
					<span className="text-right">Distance</span>
					<span className="text-right">Time</span>
					<span className="text-right">Pace</span>
					<span className="text-right">Avg HR</span>
				</div>
				{splits.map((s, i) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: laps are ordinal
						key={i}
						className="grid grid-cols-5 gap-2 border-b px-4 py-2 text-sm tabular-nums last:border-0"
					>
						<span className="font-medium">{i + 1}</span>
						<span className="text-right">{formatDistance(s.distance)}</span>
						<span className="text-right">{formatDuration(s.duration)}</span>
						<span className="text-right">
							{paceFromSplit(s.distance, s.duration)}
						</span>
						<span className="text-right">
							{s.averageHR ? Math.round(s.averageHR) : "--"}
						</span>
					</div>
				))}
			</CardContent>
		</Card>
	)
}

function HrZones({ zones }: { zones: NonNullable<ActivityDetails["hrZones"]> }) {
	const total = zones.reduce((sum, z) => sum + z.secsInZone, 0);
	if (total === 0) return null;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Heart Rate Zones</CardTitle>
				<CardDescription>Time in each zone</CardDescription>
			</CardHeader>
			<CardContent className="space-y-2">
				{zones.map((z) => {
					const pct = (z.secsInZone / total) * 100;
					return (
						<div key={z.zoneNumber} className="flex items-center gap-3 text-sm">
							<span className="w-14 shrink-0 text-muted-foreground">
								Zone {z.zoneNumber}
							</span>
							<div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
								<div
									className="h-full rounded-full"
									style={{
										width: "${pct}%",
										backgroundColor: PACE_COLORS[z.zoneNumber + 1] ?? "#888",
									}}
								/>
							</div>
							<span className="w-16 shrink-0 text-right tabular-nums">
								{formatDuration(z.secsInZone)}
							</span>
							<span className="w-12 shrink-0 text-right tabular-nums text-muted-foreground">
								{pct.toFixed(0)}%
							</span>
						</div>
					)
				})}
			</CardContent>
		</Card>
	)
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
		)
	}

	if (!activity) {
		return <p className="text-muted-foreground">Activity not found.</p>;
	}

	const avgPace =
		activity.distanceM && activity.durationS
			? formatPace(activity.distanceM / activity.durationS)
			: "--"

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
					{activity.typeKey === "trail_running" && " · Trail"}
				</p>
			</div>

			<Card>
				<CardContent className="flex flex-wrap gap-8 pt-6">
					<StatTile value={formatDistance(activity.distanceM)} label="Distance" />
					<StatTile value={formatDuration(activity.durationS)} label="Time" />
					<StatTile value={avgPace} label="Avg Pace" />
					<StatTile
						value={
							activity.elevationGainM !== null
								? `${Math.round(activity.elevationGainM)} m`
								: "--"
						}
						label="Total Ascent"
					/>
					<StatTile
						value={activity.calories ? String(Math.round(activity.calories)) : "--"}
						label="Calories"
					/>
					{activity.averageHr && (
						<StatTile
							value={`${Math.round(activity.averageHr)} bpm`}
							label="Avg HR"
						/>
					)}
				</CardContent>
			</Card>

			{detailsError && (
				<Card>
					<CardContent className="pt-6 text-sm text-muted-foreground">
						Couldn't load the route and charts for this activity: {detailsError}
					</CardContent>
				</Card>
			)}

			{details && details.route.length > 0 && (
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

			{details && <ActivityCharts details={details} />}

			{details?.splits && details.splits.length > 0 && (
				<SplitsTable splits={details.splits} />
			)}

			{details?.hrZones && details.hrZones.length > 0 && (
				<HrZones zones={details.hrZones} />
			)}
		</div>
	)
}
