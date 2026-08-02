import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
	useActivities,
	useMonthlyTotals,
	type Activity,
	type ActivityKind,
	type MonthlyTotal,
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
	ChartLegend,
	ChartLegendContent,
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
	formatRelativeDate,
	monthGroupLabel,
} from "@/lib/activity";

export const Route = createFileRoute("/_dash/exercise")({
	component: RouteComponent,
});

const RANGES = [
	{ label: "4 Weeks", months: 2 },
	{ label: "6 Months", months: 6 },
	{ label: "1 Year", months: 12 },
] as const;

// One hue per sport rather than steps off the single-hue --chart-* ramp,
// which is built for magnitude and leaves stacked segments looking identical.
// See the palette note in styles.css for why trail isn't green.
const chartConfig = {
	running: { label: "Running", color: "var(--color-sport-running)" },
	trailRunning: { label: "Trail Running", color: "var(--color-sport-trail)" },
	strength: { label: "Strength", color: "var(--color-sport-strength)" },
} satisfies ChartConfig;

// Bottom of the stack first, so the rounded cap lands on the top segment.
const SPORT_BARS = [
	{ key: "running", last: false },
	{ key: "trailRunning", last: false },
	{ key: "strength", last: true },
] as const;

const SPORT_DOT: Record<string, string> = {
	running: "var(--color-sport-running)",
	trail_running: "var(--color-sport-trail)",
	strength_training: "var(--color-sport-strength)",
	// An activity synced before metrics existed has no kind to colour.
	"": "var(--color-muted-foreground)",
};

const KIND_FILTERS = [
	{ label: "All", kind: undefined },
	{ label: "Running", kind: "running" },
	{ label: "Trail", kind: "trail_running" },
	{ label: "Strength", kind: "strength_training" },
] as const;

/**
 * The same monthly totals as numbers.
 *
 * Not decoration: the strength hue sits just under 3:1 against the light card,
 * which is legible as a stacked block but obliges a readable fallback rather
 * than leaving the value carried by colour alone.
 */
function MonthlyTable({ rows }: { rows: MonthlyTotal[] }) {
	return (
		<div className="overflow-x-auto">
			<table className="w-full text-sm tabular-nums">
				<thead>
					<tr className="border-b text-xs font-medium text-muted-foreground">
						<th className="px-2 py-2 text-left">Month</th>
						{SPORT_BARS.map(({ key }) => (
							<th key={key} className="px-2 py-2 text-right">
								{chartConfig[key].label}
							</th>
						))}
						<th className="px-2 py-2 text-right">Distance</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => (
						<tr key={row.month} className="border-b last:border-0">
							<td className="px-2 py-2 text-left font-medium">{row.month}</td>
							{SPORT_BARS.map(({ key }) => (
								<td key={key} className="px-2 py-2 text-right">
									{row[key] > 0 ? `${Math.round(row[key])} min` : "--"}
								</td>
							))}
							<td className="px-2 py-2 text-right">
								{row.km > 0 ? `${row.km.toFixed(1)} km` : "--"}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function TotalActivityTime() {
	const [months, setMonths] = useState<number>(6);
	const [view, setView] = useState<"chart" | "table">("chart");
	const { monthly, isLoading } = useMonthlyTotals(months);

	const data = monthly.map((m) => ({
		...m,
		// "2026-07" -> "Jul". Parsed as UTC so the month never slips back a
		// step for browsers behind GMT.
		label: new Date(`${m.month}-01T00:00:00Z`).toLocaleDateString("en-US", {
			month: "short",
			timeZone: "UTC",
		}),
	}));

	const totalMinutes = monthly.reduce(
		(sum, m) => sum + m.running + m.trailRunning + m.strength,
		0,
	);
	const totalKm = monthly.reduce((sum, m) => sum + m.km, 0);

	return (
		<Card>
			<CardHeader className="flex flex-row items-start justify-between gap-4">
				<div>
					<CardTitle>Total Activity Time</CardTitle>
					<CardDescription>
						{Math.round(totalMinutes).toLocaleString()} minutes ·{" "}
						{totalKm.toFixed(1)} km
					</CardDescription>
				</div>
				<div className="flex shrink-0 gap-1">
					<Button
						variant="outline"
						size="sm"
						onClick={() => setView(view === "chart" ? "table" : "chart")}
					>
						{view === "chart" ? "Table" : "Chart"}
					</Button>
					{RANGES.map((r) => (
						<Button
							key={r.label}
							variant={months === r.months ? "default" : "outline"}
							size="sm"
							onClick={() => setMonths(r.months)}
						>
							{r.label}
						</Button>
					))}
				</div>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<Skeleton className="h-[280px] w-full" />
				) : view === "table" ? (
					<MonthlyTable rows={monthly} />
				) : (
					<ChartContainer config={chartConfig} className="h-[280px] w-full">
						<BarChart data={data} accessibilityLayer>
							<CartesianGrid vertical={false} />
							<XAxis
								dataKey="label"
								tickLine={false}
								axisLine={false}
								tickMargin={8}
							/>
							<YAxis
								tickLine={false}
								axisLine={false}
								width={44}
								label={{
									value: "Minutes",
									angle: -90,
									position: "insideLeft",
									style: { fontSize: 12 },
								}}
							/>
							<ChartTooltip
								content={
									<ChartTooltipContent
										formatter={(value, name) => [
											`${Math.round(Number(value))} min `,
											chartConfig[name as keyof typeof chartConfig]?.label ??
												name,
										]}
									/>
								}
							/>
							<ChartLegend content={<ChartLegendContent />} />
							{/* Stacked so a month reads as one total height, with the
							    split between sports visible inside it. The stroke is
							    the card colour, which reads as a 2px gap between
							    segments rather than an outline. */}
							{SPORT_BARS.map(({ key, last }) => (
								<Bar
									key={key}
									dataKey={key}
									stackId="time"
									fill={`var(--color-${key})`}
									name={key}
									stroke="var(--color-card)"
									strokeWidth={2}
									radius={last ? [4, 4, 0, 0] : undefined}
								/>
							))}
						</BarChart>
					</ChartContainer>
				)}
			</CardContent>
		</Card>
	);
}

function ActivityRow({ activity }: { activity: Activity }) {
	const metrics = activity.metrics;

	// The two middle columns mean different things per sport: a run's ground
	// covered and how fast, a strength session's volume.
	const [volume, effort] =
		metrics?.kind === "strength_training"
			? [
					metrics.totalSets === null ? "--" : `${metrics.totalSets} sets`,
					metrics.totalReps === null ? "--" : `${metrics.totalReps} reps`,
				]
			: [
					formatDistance(activity.distanceM),
					activity.distanceM && activity.durationS
						? formatPace(activity.distanceM / activity.durationS)
						: "--",
				];

	return (
		<Link
			to="/exercise/$activityId"
			params={{ activityId: activity.id }}
			className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-4 border-b px-4 py-3 text-sm transition-colors hover:bg-muted/50"
		>
			{/* The dot repeats the chart's hue so the two read as one system.
			    It's never the only cue - the name, and the sets/reps vs
			    distance/pace columns, say the same thing in words. */}
			<span className="flex min-w-0 items-center gap-2">
				<span
					aria-hidden
					className="size-2 shrink-0 rounded-full"
					style={{ backgroundColor: SPORT_DOT[metrics?.kind ?? ""] }}
				/>
				<span className="truncate font-medium text-primary">
					{activity.name ?? "Untitled"}
				</span>
			</span>
			<span className="hidden w-24 text-right tabular-nums text-muted-foreground sm:block">
				{volume}
			</span>
			<span className="hidden w-24 text-right tabular-nums text-muted-foreground md:block">
				{effort}
			</span>
			<span className="w-28 text-right tabular-nums text-muted-foreground">
				{formatRelativeDate(activity.startTimeLocal)}
			</span>
			<span className="w-20 text-right tabular-nums">
				{formatDuration(activity.durationS)}
			</span>
		</Link>
	);
}

const PAGE_SIZE = 25;

function ActivityList() {
	const [limit, setLimit] = useState(PAGE_SIZE);
	const [kind, setKind] = useState<ActivityKind | undefined>(undefined);
	const { activities, total, isLoading } = useActivities(limit, 0, kind);

	if (isLoading) {
		return (
			<Card>
				<CardContent className="space-y-2 pt-6">
					{Array.from({ length: 6 }).map((_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
						<Skeleton key={i} className="h-10 w-full" />
					))}
				</CardContent>
			</Card>
		);
	}

	// Group headers are emitted inline while walking the sorted list, so the
	// rows keep their single flat order and only break where the month does.
	let lastGroup: string | null = null;

	return (
		<Card>
			<CardHeader className="flex flex-row items-start justify-between gap-4">
				<div>
					<CardTitle>Activities</CardTitle>
					<CardDescription>
						Showing {activities.length} of {total}
					</CardDescription>
				</div>
				<div className="flex shrink-0 gap-1">
					{KIND_FILTERS.map((f) => (
						<Button
							key={f.label}
							variant={kind === f.kind ? "default" : "outline"}
							size="sm"
							onClick={() => setKind(f.kind)}
						>
							{f.label}
						</Button>
					))}
				</div>
			</CardHeader>
			<CardContent className="px-0">
				<div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 border-b px-4 pb-2 text-xs font-medium text-muted-foreground">
					<span>Activity Name</span>
					<span className="hidden w-24 text-right sm:block">Distance</span>
					<span className="hidden w-24 text-right md:block">Pace</span>
					<span className="w-28 text-right">Date</span>
					<span className="w-20 text-right">Time</span>
				</div>

				{activities.map((activity) => {
					const group = monthGroupLabel(activity.startTimeLocal);
					const showHeader = group !== lastGroup;
					lastGroup = group;

					return (
						<div key={activity.id}>
							{showHeader && (
								<div className="bg-muted/50 px-4 py-2 text-sm font-medium">
									{group}
								</div>
							)}
							<ActivityRow activity={activity} />
						</div>
					);
				})}

				{activities.length < total && (
					<div className="flex justify-center pt-4">
						<Button
							variant="outline"
							onClick={() => setLimit((l) => l + PAGE_SIZE)}
						>
							Show More
						</Button>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

function RouteComponent() {
	return (
		<div className="flex flex-col gap-4">
			<TotalActivityTime />
			<ActivityList />
		</div>
	);
}
