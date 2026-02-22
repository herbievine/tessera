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

export const Route = createFileRoute("/_dash/analytics")({
	component: RouteComponent,
});

type ChartDataPoint = {
	date: string;
	[key: string]: string | number;
};

const colors = [
	"var(--chart-1)",
	"var(--chart-2)",
	"var(--chart-3)",
	"var(--chart-4)",
	"var(--chart-5)",
];

function mergeChartData(
	allData: (TrendPoint[] | undefined)[],
	entities: string[],
): ChartDataPoint[] {
	const mergedData: ChartDataPoint[] = [];

	allData.forEach((dataSet, dataSetIndex) => {
		if (!dataSet) return;
		dataSet.forEach((point) => {
			const dateStr = new Date(point.date).toLocaleDateString("en-US", {
				month: "short",
				day: "numeric",
			});
			let existing = mergedData.find((d) => d.date === dateStr);
			if (!existing) {
				existing = { date: dateStr };
				mergedData.push(existing);
			}
			(existing as Record<string, number | string>)[entities[dataSetIndex]] =
				point.value;
		});
	});

	return mergedData.sort(
		(a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
	);
}

function TrendChart({
	title,
	description,
	data,
	entities,
	labels,
	units,
	isLoading,
}: {
	title: string;
	description?: string;
	data: ChartDataPoint[];
	entities: string[];
	labels?: string[];
	units?: string[];
	isLoading: boolean;
}) {
	const chartConfig = entities.reduce(
		(acc, entity, i) => {
			acc[entity] = {
				label: labels?.[i] || entity,
				color: colors[i % colors.length],
			};
			return acc;
		},
		{} as Record<string, { label: string; color: string }>,
	);

	const formatTooltip = (value: number, name: string) => {
		const idx = entities.indexOf(name);
		const label = labels?.[idx] || name;
		const unit = units?.[idx] || "";
		return (
			<span className="font-mono">
				{label}: {value.toFixed(1)} {unit}
			</span>
		);
	};

	if (isLoading) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>{title}</CardTitle>
					{description && <CardDescription>{description}</CardDescription>}
				</CardHeader>
				<CardContent>
					<p className="text-sm text-muted-foreground">Loading...</p>
				</CardContent>
			</Card>
		);
	}

	if (!data || data.length === 0) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>{title}</CardTitle>
					{description && <CardDescription>{description}</CardDescription>}
				</CardHeader>
				<CardContent>
					<p className="text-sm text-muted-foreground">No data available</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>{title}</CardTitle>
				{description && <CardDescription>{description}</CardDescription>}
			</CardHeader>
			<CardContent>
				<ChartContainer
					config={chartConfig as ChartConfig}
					className="h-[200px] w-full"
				>
					<LineChart
						accessibilityLayer
						data={data}
						margin={{ left: 12, right: 12 }}
					>
						<CartesianGrid vertical={false} />
						<YAxis
							tickLine={false}
							axisLine={false}
							tickMargin={8}
							domain={["auto", "auto"]}
						/>
						<XAxis
							dataKey="date"
							tickLine={false}
							axisLine={false}
							tickMargin={8}
						/>
						<ChartTooltip
							cursor={false}
							content={
								<ChartTooltipContent
									hideLabel
									formatter={(value, name) =>
										formatTooltip(value as number, name as string)
									}
								/>
							}
						/>
						{entities.map((entity) => (
							<Line
								key={entity}
								dataKey={entity}
								type="natural"
								stroke={chartConfig[entity]?.color}
								strokeWidth={2}
								dot={false}
							/>
						))}
					</LineChart>
				</ChartContainer>
			</CardContent>
		</Card>
	);
}

function RouteComponent() {
	const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
	const startDate = params.get("startDate") || undefined;
	const endDate = params.get("endDate") || undefined;

	const weight = useTrends("weight", startDate, endDate);
	const fatRatio = useTrends("fat_ratio_pct", startDate, endDate);
	const muscleMass = useTrends("muscle_mass", startDate, endDate);
	const calories = useTrends("calories", startDate, endDate);
	const protein = useTrends("protein", startDate, endDate);
	const fat = useTrends("fat", startDate, endDate);
	const carbs = useTrends("carbs", startDate, endDate);
	const vitaminA = useTrends("vitaminA", startDate, endDate);
	const vitaminC = useTrends("vitaminC", startDate, endDate);
	const vitaminD = useTrends("vitaminD", startDate, endDate);
	const vitaminE = useTrends("vitaminE", startDate, endDate);
	const b1 = useTrends("b1Thiamine", startDate, endDate);
	const b2 = useTrends("b2Riboflavin", startDate, endDate);
	const b3 = useTrends("b3Niacin", startDate, endDate);
	const b6 = useTrends("b6Pyridoxine", startDate, endDate);
	const calcium = useTrends("calcium", startDate, endDate);
	const iron = useTrends("iron", startDate, endDate);
	const magnesium = useTrends("magnesium", startDate, endDate);
	const zinc = useTrends("zinc", startDate, endDate);
	const potassium = useTrends("potassium", startDate, endDate);
	const sodium = useTrends("sodium", startDate, endDate);
	const caffeine = useTrends("caffeine", startDate, endDate);
	const alcohol = useTrends("alcohol", startDate, endDate);
	const cholesterol = useTrends("cholesterol", startDate, endDate);
	const fiber = useTrends("fiber", startDate, endDate);

	const restingHR = useTrends("resting_heart_rate", startDate, endDate);
	const heartRate = useTrends("heart_rate", startDate, endDate);

	const fatKg = useTrends("fat_mass_weight", startDate, endDate);
	const boneMass = useTrends("bone_mass", startDate, endDate);
	const boneMassPct = useTrends("bone_mass_pct", startDate, endDate);
	const fatFreeMass = useTrends("fat_free_mass", startDate, endDate);
	const visceralFat = useTrends("visceral_fat", startDate, endDate);
	const muscleMassPct = useTrends("muscle_mass_pct", startDate, endDate);

	return (
		<div className="space-y-8">
			<div>
				<h2 className="text-lg font-semibold mb-4">Heart Rate</h2>
				<div className="grid gap-6 md:grid-cols-2">
					<TrendChart
						title="Resting Heart Rate"
						description="RHR over time"
						data={mergeChartData([restingHR.trends], ["resting_heart_rate"])}
						entities={["resting_heart_rate"]}
						labels={["RHR"]}
						units={["bpm"]}
						isLoading={restingHR.isLoading}
					/>
					<TrendChart
						title="Heart Rate"
						description="Intraday heart rate"
						data={mergeChartData([heartRate.trends], ["heart_rate"])}
						entities={["heart_rate"]}
						labels={["HR"]}
						units={["bpm"]}
						isLoading={heartRate.isLoading}
					/>
				</div>
			</div>

			<div>
				<h2 className="text-lg font-semibold mb-4">Body Composition</h2>
				<div className="grid gap-6 md:grid-cols-2">
					<TrendChart
						title="Weight"
						description="Body weight over time"
						data={mergeChartData([weight.trends], ["weight"])}
						entities={["weight"]}
						labels={["Weight"]}
						units={["kg"]}
						isLoading={weight.isLoading}
					/>
					<TrendChart
						title="Fat & Muscle Mass (%)"
						description="Fat percentage and muscle mass percentage"
						data={mergeChartData(
							[fatRatio.trends, muscleMassPct.trends],
							["fat_ratio_pct", "muscle_mass_pct"],
						)}
						entities={["fat_ratio_pct", "muscle_mass_pct"]}
						labels={["Fat %", "Muscle %"]}
						units={["%", "%"]}
						isLoading={fatRatio.isLoading || muscleMassPct.isLoading}
					/>
					<TrendChart
						title="Fat & Muscle Mass (kg)"
						description="Fat mass and muscle mass in kg"
						data={mergeChartData(
							[fatKg.trends, muscleMass.trends],
							["fat_mass_weight", "muscle_mass"],
						)}
						entities={["fat_mass_weight", "muscle_mass"]}
						labels={["Fat (kg)", "Muscle (kg)"]}
						units={["kg", "kg"]}
						isLoading={fatKg.isLoading || muscleMass.isLoading}
					/>
					<TrendChart
						title="Bone Mass"
						description="Bone mass in kg and percentage"
						data={mergeChartData(
							[boneMass.trends, boneMassPct.trends],
							["bone_mass", "bone_mass_pct"],
						)}
						entities={["bone_mass", "bone_mass_pct"]}
						labels={["Bone (kg)", "Bone (%)"]}
						units={["kg", "%"]}
						isLoading={boneMass.isLoading || boneMassPct.isLoading}
					/>
					<TrendChart
						title="Lean Mass"
						description="Fat-free mass in kg"
						data={mergeChartData([fatFreeMass.trends], ["fat_free_mass"])}
						entities={["fat_free_mass"]}
						labels={["Lean Mass"]}
						units={["kg"]}
						isLoading={fatFreeMass.isLoading}
					/>
					<TrendChart
						title="Visceral Fat"
						description="Visceral fat index"
						data={mergeChartData([visceralFat.trends], ["visceral_fat"])}
						entities={["visceral_fat"]}
						labels={["Visceral Fat"]}
						units={[""]}
						isLoading={visceralFat.isLoading}
					/>
				</div>
			</div>

			<div>
				<h2 className="text-lg font-semibold mb-4">Macros</h2>
				<div className="grid gap-6 md:grid-cols-2">
					<TrendChart
						title="Calories"
						description="Daily caloric intake"
						data={mergeChartData([calories.trends], ["calories"])}
						entities={["calories"]}
						labels={["Calories"]}
						units={["kcal"]}
						isLoading={calories.isLoading}
					/>
					<TrendChart
						title="Macronutrients"
						description="Protein, Fat, Carbs"
						data={mergeChartData(
							[protein.trends, fat.trends, carbs.trends],
							["protein", "fat", "carbs"],
						)}
						entities={["protein", "fat", "carbs"]}
						labels={["Protein", "Fat", "Carbs"]}
						units={["g", "g", "g"]}
						isLoading={protein.isLoading || fat.isLoading || carbs.isLoading}
					/>
				</div>
			</div>

			<div>
				<h2 className="text-lg font-semibold mb-4">Vitamins</h2>
				<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
					<TrendChart
						title="Vitamin A & C"
						data={mergeChartData(
							[vitaminA.trends, vitaminC.trends],
							["vitaminA", "vitaminC"],
						)}
						entities={["vitaminA", "vitaminC"]}
						labels={["Vitamin A", "Vitamin C"]}
						units={["mcg", "mg"]}
						isLoading={vitaminA.isLoading || vitaminC.isLoading}
					/>
					<TrendChart
						title="Vitamin D & E"
						data={mergeChartData(
							[vitaminD.trends, vitaminE.trends],
							["vitaminD", "vitaminE"],
						)}
						entities={["vitaminD", "vitaminE"]}
						labels={["Vitamin D", "Vitamin E"]}
						units={["mcg", "mg"]}
						isLoading={vitaminD.isLoading || vitaminE.isLoading}
					/>
					<TrendChart
						title="B Vitamins"
						data={mergeChartData(
							[b1.trends, b2.trends, b3.trends, b6.trends],
							["b1Thiamine", "b2Riboflavin", "b3Niacin", "b6Pyridoxine"],
						)}
						entities={[
							"b1Thiamine",
							"b2Riboflavin",
							"b3Niacin",
							"b6Pyridoxine",
						]}
						labels={["B1", "B2", "B3", "B6"]}
						units={["mg", "mg", "mg", "mg"]}
						isLoading={
							b1.isLoading || b2.isLoading || b3.isLoading || b6.isLoading
						}
					/>
				</div>
			</div>

			<div>
				<h2 className="text-lg font-semibold mb-4">Minerals</h2>
				<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
					<TrendChart
						title="Calcium & Iron"
						data={mergeChartData(
							[calcium.trends, iron.trends],
							["calcium", "iron"],
						)}
						entities={["calcium", "iron"]}
						labels={["Calcium", "Iron"]}
						units={["mg", "mg"]}
						isLoading={calcium.isLoading || iron.isLoading}
					/>
					<TrendChart
						title="Magnesium & Zinc"
						data={mergeChartData(
							[magnesium.trends, zinc.trends],
							["magnesium", "zinc"],
						)}
						entities={["magnesium", "zinc"]}
						labels={["Magnesium", "Zinc"]}
						units={["mg", "mg"]}
						isLoading={magnesium.isLoading || zinc.isLoading}
					/>
					<TrendChart
						title="Potassium & Sodium"
						data={mergeChartData(
							[potassium.trends, sodium.trends],
							["potassium", "sodium"],
						)}
						entities={["potassium", "sodium"]}
						labels={["Potassium", "Sodium"]}
						units={["mg", "mg"]}
						isLoading={potassium.isLoading || sodium.isLoading}
					/>
				</div>
			</div>

			<div>
				<h2 className="text-lg font-semibold mb-4">Other</h2>
				<div className="grid gap-6 md:grid-cols-2">
					<TrendChart
						title="Caffeine & Alcohol"
						data={mergeChartData(
							[caffeine.trends, alcohol.trends],
							["caffeine", "alcohol"],
						)}
						entities={["caffeine", "alcohol"]}
						labels={["Caffeine", "Alcohol"]}
						units={["mg", "g"]}
						isLoading={caffeine.isLoading || alcohol.isLoading}
					/>
					<TrendChart
						title="Cholesterol & Fiber"
						data={mergeChartData(
							[cholesterol.trends, fiber.trends],
							["cholesterol", "fiber"],
						)}
						entities={["cholesterol", "fiber"]}
						labels={["Cholesterol", "Fiber"]}
						units={["mg", "g"]}
						isLoading={cholesterol.isLoading || fiber.isLoading}
					/>
				</div>
			</div>
		</div>
	);
}
