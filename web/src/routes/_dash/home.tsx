import { useTrends, type TrendPoint } from "@/api/trends.query";
import { createFileRoute } from "@tanstack/react-router";
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
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

export const Route = createFileRoute("/_dash/home")({
	component: RouteComponent,
});

const chartConfig = {
	weight: {
		label: "Weight",
		color: "var(--chart-1)",
	},
} satisfies ChartConfig;

function RouteComponent() {
	const { trends: weightTrends, isLoading: weightLoading } =
		useTrends("weight");

	const chartData = weightTrends
		?.map((t: TrendPoint) => ({
			date: new Date(t.date).toLocaleDateString("en-US", {
				month: "short",
				day: "numeric",
			}),
			weight: t.value,
		}))
		.sort(
			(
				a: { date: string; weight: number },
				b: { date: string; weight: number },
			) => new Date(a.date).getTime() - new Date(b.date).getTime(),
		);

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Weight Trend</CardTitle>
					<CardDescription>Your weight over time</CardDescription>
				</CardHeader>
				<CardContent>
					{weightLoading ? (
						<p className="text-sm text-muted-foreground">Loading...</p>
					) : chartData && chartData.length > 0 ? (
						<ChartContainer config={chartConfig} className="h-[300px] w-full">
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
									dataKey="date"
									tickLine={false}
									axisLine={false}
									tickMargin={8}
								/>
								<ChartTooltip
									cursor={false}
									content={<ChartTooltipContent hideLabel />}
								/>
								<Line
									dataKey="weight"
									type="natural"
									stroke="var(--color-weight)"
									strokeWidth={2}
									dot={{
										fill: "var(--color-weight)",
									}}
									activeDot={{
										r: 6,
									}}
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
