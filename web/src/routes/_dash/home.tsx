import { createFileRoute } from "@tanstack/react-router";
import {
	Area,
	CartesianGrid,
	ComposedChart,
	Line,
	LineChart,
	XAxis,
	YAxis,
} from "recharts";
import { type TrendPoint, useTrends } from "@/api/trends.query";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";

export const Route = createFileRoute("/_dash/home")({
	component: RouteComponent,
});

const weightChartConfig = {
	weight: {
		label: "Weight",
		color: "var(--chart-1)",
	},
} satisfies ChartConfig;

const hrvChartConfig = {
	hrv: {
		label: "Last Night HRV",
		color: "var(--chart-1)",
	},
	band: {
		label: "Balanced Range",
		color: "var(--chart-2)",
	},
} satisfies ChartConfig;

function HRVChart({
	startDate,
	endDate,
}: {
	startDate?: string;
	endDate?: string;
}) {
	const { trends: hrvAvg, isLoading: loading1 } = useTrends(
		"hrv_last_night_avg",
		startDate,
		endDate,
	);
	const { trends: balancedLow, isLoading: loading2 } = useTrends(
		"hrv_balanced_low",
		startDate,
		endDate,
	);
	const { trends: balancedUpper, isLoading: loading3 } = useTrends(
		"hrv_balanced_upper",
		startDate,
		endDate,
	);

	const isLoading = loading1 || loading2 || loading3

	const mergedData = (() => {
		if (!hrvAvg) return [];
		const map = new Map<
			string,
			{
				date: string;
				sortTime: number;
				hrv?: number | null;
				band?: [number, number];
			}
		>();

		hrvAvg.forEach((t) => {
			const dateStr = new Date(t.date).toLocaleDateString("en-US", {
				month: "short",
				day: "numeric",
			});
			const sortTime = new Date(t.date).getTime();
			map.set(dateStr, { date: dateStr, sortTime, hrv: t.value });
		});

		balancedLow?.forEach((t) => {
			const dateStr = new Date(t.date).toLocaleDateString("en-US", {
				month: "short",
				day: "numeric",
			});
			const existing = map.get(dateStr);
			if (existing) {
				const low = t.value;
				const upper = (existing as any).balancedUpperValue;
				if (upper != null) {
					existing.band = [low || 0, upper];
					delete (existing as any).balancedUpperValue;
				} else {
					(existing as any).balancedLowValue = low;
				}
			}
		});

		balancedUpper?.forEach((t) => {
			const dateStr = new Date(t.date).toLocaleDateString("en-US", {
				month: "short",
				day: "numeric",
			});
			const existing = map.get(dateStr);
			if (existing) {
				const upper = t.value;
				const low = (existing as any).balancedLowValue;
				if (low != null) {
					existing.band = [low, upper || 0];
					delete (existing as any).balancedLowValue;
				} else {
					(existing as any).balancedUpperValue = upper;
				}
			}
		});

		return Array.from(map.values()).sort((a, b) => a.sortTime - b.sortTime);
	})();

	const hasBandData = mergedData.some((d) => d.band != null);

	if (isLoading) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Heart Rate Variability</CardTitle>
					<CardDescription>Loading...</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	if (mergedData.length === 0) {
		return null;
	}

	return (
		<Card className="w-full">
			<CardHeader>
				<CardTitle>Heart Rate Variability</CardTitle>
				<CardDescription>HRV with balanced range bands</CardDescription>
			</CardHeader>
			<CardContent>
				<ChartContainer config={hrvChartConfig} className="h-[250px] w-full">
					<ComposedChart
						accessibilityLayer
						data={mergedData}
						margin={{ left: 12, right: 12 }}
					>
						<CartesianGrid vertical={false} />
						<YAxis
							tickLine={false}
							axisLine={false}
							tickMargin={8}
							domain={["auto", "auto"]}
							tickFormatter={(v) => `${v} ms`}
						/>
						<XAxis
							dataKey="sortTime"
							type="number"
							domain={["dataMin", "dataMax"]}
							scale="time"
							tickLine={false}
							axisLine={false}
							tickMargin={8}
							tickFormatter={(value) =>
								new Date(value).toLocaleDateString("en-US", {
									month: "short",
									day: "numeric",
								})
							}
						/>
						<ChartTooltip
							cursor={false}
							content={<ChartTooltipContent hideLabel />}
						/>
						{hasBandData && (
							<Area
								type="monotone"
								dataKey="band"
								stroke="none"
								fill="green"
								fillOpacity={0.2}
								isAnimationActive={false}
								dot={false}
								activeDot={false}
							/>
						)}
						<Line
							dataKey="hrv"
              type="natural"
							stroke="var(--chart-2)"
							strokeWidth={2}
							isAnimationActive={false}
							connectNulls={true}
							dot={false}
						/>
					</ComposedChart>
				</ChartContainer>
			</CardContent>
		</Card>
	);
}

function RouteComponent() {
	const params = new URLSearchParams(
		typeof window !== "undefined" ? window.location.search : "",
	);
	const startDate = params.get("startDate") || undefined;
	const endDate = params.get("endDate") || undefined;

	const { trends: weightTrends, isLoading: weightLoading } = useTrends(
		"weight",
		startDate,
		endDate,
	);

	const chartData = weightTrends
		?.map((t: TrendPoint) => ({
			sortTime: new Date(t.date).getTime(),
			weight: t.value,
		}))
		.sort(
			(a: { sortTime: number }, b: { sortTime: number }) =>
				a.sortTime - b.sortTime,
		);

	return (
		<div className="space-y-6">
			<HRVChart startDate={startDate} endDate={endDate} />
			<Card>
				<CardHeader>
					<CardTitle>Weight Trend</CardTitle>
					<CardDescription>Your weight over time</CardDescription>
				</CardHeader>
				<CardContent>
					{weightLoading ? (
						<p className="text-sm text-muted-foreground">Loading...</p>
					) : chartData && chartData.length > 0 ? (
						<ChartContainer
							config={weightChartConfig}
							className="h-[300px] w-full"
						>
							<LineChart
								accessibilityLayer
								data={chartData}
								margin={{
									left: 12,
									right: 12,
								}}
							>
								<CartesianGrid vertical={false} />
								<YAxis
									dataKey="weight"
									tickLine={false}
									axisLine={false}
									tickMargin={8}
									domain={["auto", "auto"]}
									tickFormatter={(value) => `${value} kg`}
								/>
								<XAxis
									dataKey="sortTime"
									type="number"
									domain={["dataMin", "dataMax"]}
									scale="time"
									tickLine={false}
									axisLine={false}
									tickMargin={8}
									tickFormatter={(value) =>
										new Date(value).toLocaleDateString("en-US", {
											month: "short",
											day: "numeric",
										})
									}
								/>
								<ChartTooltip
									cursor={false}
									content={<ChartTooltipContent hideLabel />}
								/>
								<Line
									dataKey="weight"
									type="natural"
              		stroke="var(--chart-2)"
              		strokeWidth={2}
              		isAnimationActive={false}
              		connectNulls={true}
              		dot={false}
								/>
							</LineChart>
						</ChartContainer>
					) : (
						<p className="text-sm text-muted-foreground">
							No weight data available
						</p>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
