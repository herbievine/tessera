import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
	useActivities,
	useMonthlyTotals,
	type Activity,
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

// The palette is one hue at five lightnesses, so adjacent steps are almost
// indistinguishable when stacked; these are the two ends of the ramp.
const chartConfig = {
	running: { label: "Running", color: "var(--chart-1)" },
	trailRunning: { label: "Trail Running", color: "var(--chart-4)" },
} satisfies ChartConfig;

function TotalActivityTime() {
	const [months, setMonths] = useState<number>(6);
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
		(sum, m) => sum + m.running + m.trailRunning,
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
							    split between road and trail visible inside it. */}
							<Bar
								dataKey="running"
								stackId="time"
								fill="var(--color-running)"
								name="running"
							/>
							<Bar
								dataKey="trailRunning"
								stackId="time"
								fill="var(--color-trailRunning)"
								name="trailRunning"
								radius={[4, 4, 0, 0]}
							/>
						</BarChart>
					</ChartContainer>
				)}
			</CardContent>
		</Card>
	);
}

function ActivityRow({ activity }: { activity: Activity }) {
	const pace =
		activity.distanceM && activity.durationS
			? formatPace(activity.distanceM / activity.durationS)
			: "--";

	return (
		<Link
			to="/exercise/$activityId"
			params={{ activityId: activity.id }}
			className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-4 border-b px-4 py-3 text-sm transition-colors hover:bg-muted/50"
		>
			<span className="truncate font-medium text-primary">
				{activity.name ?? "Untitled"}
			</span>
			<span className="hidden w-24 text-right tabular-nums text-muted-foreground sm:block">
				{formatDistance(activity.distanceM)}
			</span>
			<span className="hidden w-24 text-right tabular-nums text-muted-foreground md:block">
				{pace}
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
	const { activities, total, isLoading } = useActivities(limit);

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
			<CardHeader>
				<CardTitle>Activities</CardTitle>
				<CardDescription>
					Showing {activities.length} of {total}
				</CardDescription>
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
