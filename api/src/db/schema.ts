import {
	sqliteTable,
	text,
	integer,
	real,
	index,
	unique,
} from "drizzle-orm/sqlite-core";
import { id } from "../utils/id";
import { defineRelations } from "drizzle-orm";
import { measurementsMapping, withingsKeys } from "../lib/withings/constants";
import { garminKeys } from "../lib/garmin/constants";
import type {
	ActivityLap,
	ActivityMetrics,
	ActivityRoutePoint,
	ActivitySeries,
	ActivityWeather,
	ActivityZone,
	ExerciseSet,
} from "../lib/garmin/types";

export const users = sqliteTable("users", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => id()),

	name: text("name").notNull(),
	email: text("email").notNull(),
	password: text("password").notNull(),
	apiKeyHash: text("api_key").notNull(),

	createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
		() => new Date(),
	),
});

export const integrations = sqliteTable("integrations", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => id()),

	vendor: text({ enum: ["withings", "garmin"] }).notNull(),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	externalUserId: text("external_user_id"),
	scope: text("scope"),
	expiresAt: integer("expires_at", { mode: "timestamp" }),

	garminEmail: text("garmin_email"),
	garminPassword: text("garmin_password"),

	userId: text("user_id").notNull(),
	createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
		() => new Date(),
	),
});

export const observations = sqliteTable(
	"observations",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => id()),

		source: text({ enum: ["withings", "garmin"] }).notNull(),
		type: text({ enum: [...withingsKeys, ...garminKeys] }).notNull(),
		label: text("label").notNull(),
		unit: text(),
		value: real("value").notNull(),
		observedAt: integer("observed_at", { mode: "timestamp" }).notNull(),

		userId: text("user_id").notNull(),
		integrationId: text("integration_id").notNull(),
		createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
			() => new Date(),
		),
	},
	(t) => [
		index("idx_date_source_type").on(t.userId, t.observedAt, t.source, t.type),
		unique().on(t.userId, t.observedAt, t.type, t.source),
	],
);

// Activities don't fit the observations table: an observation is one scalar
// at one instant, whereas an activity is a record with a dozen correlated
// metrics. Summaries live here; the heavy per-point blobs live in
// activityDetails so listing activities never has to read them.
//
// Only the fields the list and the monthly chart aggregate in SQL are
// columns. The rest of Garmin's metrics differ per sport - a strength
// session has sets and reps and no pace, a run has running dynamics and no
// sets - so they live in `metrics` as a union discriminated on `kind`,
// rather than as a wide table of columns that are null for most rows.
export const activities = sqliteTable(
	"activities",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => id()),

		garminActivityId: text("garmin_activity_id").notNull(),
		name: text("name"),
		// Garmin's verbatim key (running, trail_running, treadmill_running,
		// strength_training). `metrics.kind` folds the running variants
		// together; this keeps the distinction.
		typeKey: text("type_key").notNull(),

		// Garmin reports both; local is what the user ran "at 7:13 AM", GMT is
		// what we sort and range-query on.
		startTimeLocal: integer("start_time_local", { mode: "timestamp" }).notNull(),
		startTimeGmt: integer("start_time_gmt", { mode: "timestamp" }).notNull(),

		distanceM: real("distance_m"),
		durationS: real("duration_s"),

		metrics: text("metrics", { mode: "json" }).$type<ActivityMetrics>(),

		userId: text("user_id").notNull(),
		integrationId: text("integration_id").notNull(),
		createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
			() => new Date(),
		),
	},
	(t) => [
		index("idx_activities_user_start").on(t.userId, t.startTimeGmt),
		index("idx_activities_user_type_start").on(
			t.userId,
			t.typeKey,
			t.startTimeGmt,
		),
		unique().on(t.userId, t.garminActivityId),
	],
);

// Fetched lazily on first view rather than during backfill: each row costs
// three upstream Garmin calls, which across a full history would be thousands
// of sequential requests through a single-threaded service.
export const activityDetails = sqliteTable("activity_details", {
	activityId: text("activity_id").primaryKey(),

	// Bumped when the shape of what we fetch changes, so rows cached under an
	// older shape refetch on next view instead of rendering half a page.
	version: integer("version").notNull().default(1),

	pointCount: integer("point_count"),
	route: text("route", { mode: "json" }).$type<ActivityRoutePoint[]>(),
	series: text("series", { mode: "json" }).$type<ActivitySeries>(),
	splits: text("splits", { mode: "json" }).$type<ActivityLap[]>(),
	weather: text("weather", { mode: "json" }).$type<ActivityWeather>(),
	hrZones: text("hr_zones", { mode: "json" }).$type<ActivityZone[]>(),
	powerZones: text("power_zones", { mode: "json" }).$type<ActivityZone[]>(),
	exerciseSets: text("exercise_sets", { mode: "json" }).$type<ExerciseSet[]>(),

	fetchedAt: integer("fetched_at", { mode: "timestamp" }).$defaultFn(
		() => new Date(),
	),
});

export const macrofactorDaily = sqliteTable(
	"macrofactor_daily",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => id()),

		date: integer({ mode: "timestamp" }).notNull(),

		expenditure: real("expenditure"),
		trendWeightKg: real("trend_weight_kg"),
		weightKg: real("weight_kg"),
		caloriesKcal: real("calories_kcal"),
		proteinG: real("protein_g"),
		fatG: real("fat_g"),
		carbsG: real("carbs_g"),
		targetCaloriesKcal: real("target_calories_kcal"),
		targetProteinG: real("target_protein_g"),
		targetFatG: real("target_fat_g"),
		targetCarbsG: real("target_carbs_g"),
		steps: real("step"),
		alcoholG: real("alcohol_g"),
		b12CobalaminMcg: real("b12_cobalamin_mcg"),
		b1ThiamineMg: real("b1_thiamine_mg"),
		b2RiboflavinMg: real("b2_riboflavin_mg"),
		b3NiacinMg: real("b3_niacin_mg"),
		b5PantothenicAcidMg: real("b5_pantothenic_acid_mg"),
		b6PyridoxineMg: real("b6_pyridoxine_mg"),
		caffeineMg: real("caffeine_mg"),
		calciumMg: real("calcium_mg"),
		cholesterolMg: real("cholesterol_mg"),
		cholineMg: real("choline_mg"),
		copperMg: real("copper_mg"),
		cysteineG: real("cysteine_g"),
		monounsaturatedFatG: real("monounsaturated_fat_g"),
		polyunsaturatedFatG: real("polyunsaturated_fat_g"),
		saturatedFatG: real("saturated_fat_g"),
		transFatG: real("trans_fat_g"),
		fiberG: real("fiber_g"),
		folateMcg: real("folate_mcg"),
		histidineG: real("histidine_g"),
		ironMg: real("iron_mg"),
		isoleucineG: real("isoleucine_g"),
		leucineG: real("leucine_g"),
		lysineG: real("lysine_g"),
		magnesiumMg: real("magnesium_mg"),
		manganeseMg: real("manganese_mg"),
		methionineG: real("methionine_g"),
		omega3AlaG: real("omega3_ala_g"),
		omega3DhaG: real("omega3_dha_g"),
		omega3EpaG: real("omega3_epa_g"),
		omega3G: real("omega3_g"),
		omega6G: real("omega6_g"),
		phenylalanineG: real("phenylalanine_g"),
		phosphorusMg: real("phosphorus_mg"),
		potassiumMg: real("potassium_mg"),
		seleniumMcg: real("selenium_mcg"),
		sodiumMg: real("sodium_mg"),
		starchG: real("starch_g"),
		sugarsG: real("sugars_g"),
		sugarsAddedG: real("sugars_added_g"),
		threonineG: real("threonine_g"),
		tryptophanG: real("tryptophan_g"),
		tyrosineG: real("tyrosine_g"),
		valineG: real("valine_g"),
		vitaminAMcg: real("vitamin_a_mcg"),
		vitaminCMg: real("vitamin_c_mg"),
		vitaminDMcg: real("vitamin_d_mcg"),
		vitaminEMg: real("vitamin_e_mg"),
		vitaminKMcg: real("vitamin_k_mcg"),
		waterG: real("water_g"),
		zincMg: real("zinc_mg"),

		importedAt: integer("imported_at", { mode: "timestamp" }).$defaultFn(
			() => new Date(),
		),
		raw: text("raw", { mode: "json" }),
	},
	(t) => [index("idx_date").on(t.date)],
);

export const relations = defineRelations(
	{ users, integrations, observations },
	(r) => ({
		users: {
			integrations: r.many.integrations({
				from: r.users.id,
				to: r.integrations.userId,
				alias: "user_integrations",
			}),
			observations: r.many.observations({
				from: r.users.id,
				to: r.observations.userId,
				alias: "user_observations",
			}),
		},
		integrations: {
			observations: r.many.observations({
				from: r.integrations.userId,
				to: r.observations.id,
				alias: "integration_observations",
			}),
		},
	}),
);
