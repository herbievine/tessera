import { Hono } from "hono";
import { db } from "../db/index.ts";
import * as schema from "../db/schema.ts";
import { eq, and, gte, lte } from "drizzle-orm";

// export const entities = [
//   'weight',
//   'calories',
//   'protein',
//   'fat',
//   'carbs',
//   'targetCaloriesKcal',
//   'targetProtein',
//   'targetFat',
//   'targetCarbs',
//   'steps',
//   'alcohol',
//   'b12Cobalamin',
//   'b1Thiamine',
//   'b2Riboflavin',
//   'b3Niacin',
//   'b5PantothenicAcid',
//   'b6Pyridoxine',
//   'caffeine',
//   'calcium',
//   'cholesterol',
//   'choline',
//   'copper',
//   'cysteine',
//   'monounsaturatedFat',
//   'polyunsaturatedFat',
//   'saturatedFat',
//   'transFat',
//   'fiber',
//   'folate',
//   'histidine',
//   'iron',
//   'isoleucine',
//   'leucine',
//   'lysine',
//   'magnesium',
//   'manganese',
//   'methionine',
//   'omega3Ala',
//   'omega3Dha',
//   'omega3Epa',
//   'omega3',
//   'omega6',
//   'phenylalanine',
//   'phosphorus',
//   'potassium',
//   'selenium',
//   'sodium',
//   'starch',
//   'sugars',
//   'sugarsAdded',
//   'threonine',
//   'tryptophan',
//   'tyrosine',
//   'valine',
//   'vitaminA',
//   'vitaminC',
//   'vitaminD',
//   'vitaminE',
//   'vitaminK',
//   'water',
//   'zinc',
// ] as const

export const macrofactorEntityMap = {
	weight: {
		key: "weightKg",
		unit: "kg",
	},
	calories: {
		key: "caloriesKcal",
		unit: "kcal",
	},
	protein: {
		key: "proteinG",
		unit: "g",
	},
	fat: {
		key: "fatG",
		unit: "g",
	},
	carbs: {
		key: "carbsG",
		unit: "g",
	},
	targetCaloriesKcal: {
		key: "targetCaloriesKcal",
		unit: "kcal",
	},
	targetProtein: {
		key: "targetProteinG",
		unit: "g",
	},
	targetFat: {
		key: "targetFatG",
		unit: "g",
	},
	targetCarbs: {
		key: "targetCarbsG",
		unit: "g",
	},
	steps: {
		key: "steps",
		unit: "step",
	},
	alcohol: {
		key: "alcoholG",
		unit: "g",
	},
	b12Cobalamin: {
		key: "b12CobalaminMcg",
		unit: "mcg",
	},
	b1Thiamine: {
		key: "b1ThiamineMg",
		unit: "mg",
	},
	b2Riboflavin: {
		key: "b2RiboflavinMg",
		unit: "mg",
	},
	b3Niacin: {
		key: "b3NiacinMg",
		unit: "mg",
	},
	b5PantothenicAcid: {
		key: "b5PantothenicAcidMg",
		unit: "mg",
	},
	b6Pyridoxine: {
		key: "b6PyridoxineMg",
		unit: "mg",
	},
	caffeine: {
		key: "caffeineMg",
		unit: "mg",
	},
	calcium: {
		key: "calciumMg",
		unit: "mg",
	},
	cholesterol: {
		key: "cholesterolMg",
		unit: "mg",
	},
	choline: {
		key: "cholineMg",
		unit: "mg",
	},
	copper: {
		key: "copperMg",
		unit: "mg",
	},
	cysteine: {
		key: "cysteineG",
		unit: "g",
	},
	monounsaturatedFat: {
		key: "monounsaturatedFatG",
		unit: "g",
	},
	polyunsaturatedFat: {
		key: "polyunsaturatedFatG",
		unit: "g",
	},
	saturatedFat: {
		key: "saturatedFatG",
		unit: "g",
	},
	transFat: {
		key: "transFatG",
		unit: "g",
	},
	fiber: {
		key: "fiberG",
		unit: "g",
	},
	folate: {
		key: "folateMcg",
		unit: "mcg",
	},
	histidine: {
		key: "histidineG",
		unit: "g",
	},
	iron: {
		key: "ironMg",
		unit: "mg",
	},
	isoleucine: {
		key: "isoleucineG",
		unit: "g",
	},
	leucine: {
		key: "leucineG",
		unit: "g",
	},
	lysine: {
		key: "lysineG",
		unit: "g",
	},
	magnesium: {
		key: "magnesiumMg",
		unit: "mg",
	},
	manganese: {
		key: "manganeseMg",
		unit: "mg",
	},
	methionine: {
		key: "methionineG",
		unit: "g",
	},
	omega3Ala: {
		key: "omega3AlaG",
		unit: "g",
	},
	omega3Dha: {
		key: "omega3DhaG",
		unit: "g",
	},
	omega3Epa: {
		key: "omega3EpaG",
		unit: "g",
	},
	omega3: {
		key: "omega3G",
		unit: "g",
	},
	omega6: {
		key: "omega6G",
		unit: "g",
	},
	phenylalanine: {
		key: "phenylalanineG",
		unit: "g",
	},
	phosphorus: {
		key: "phosphorusMg",
		unit: "mg",
	},
	potassium: {
		key: "potassiumMg",
		unit: "mg",
	},
	selenium: {
		key: "seleniumMcg",
		unit: "mcg",
	},
	sodium: {
		key: "sodiumMg",
		unit: "mg",
	},
	starch: {
		key: "starchG",
		unit: "g",
	},
	sugars: {
		key: "sugarsG",
		unit: "g",
	},
	sugarsAdded: {
		key: "sugarsAddedG",
		unit: "g",
	},
	threonine: {
		key: "threonineG",
		unit: "g",
	},
	tryptophan: {
		key: "tryptophanG",
		unit: "g",
	},
	tyrosine: {
		key: "tyrosineG",
		unit: "g",
	},
	valine: {
		key: "valineG",
		unit: "g",
	},
	vitaminA: {
		key: "vitaminAMcg",
		unit: "mcg",
	},
	vitaminC: {
		key: "vitaminCMg",
		unit: "mg",
	},
	vitaminD: {
		key: "vitaminDMcg",
		unit: "mcg",
	},
	vitaminE: {
		key: "vitaminEMg",
		unit: "mg",
	},
	vitaminK: {
		key: "vitaminKMcg",
		unit: "mcg",
	},
	water: {
		key: "waterG",
		unit: "g",
	},
	zinc: {
		key: "zincMg",
		unit: "mg",
	},
} as const;

export const garminEntityMap = {
	sleep_score: {
		key: "sleep_score",
		unit: "score",
	},
	sleep_total_hours: {
		key: "sleep_total_hours",
		unit: "hours",
	},
	sleep_deep_hours: {
		key: "sleep_deep_hours",
		unit: "hours",
	},
	sleep_light_hours: {
		key: "sleep_light_hours",
		unit: "hours",
	},
	sleep_rem_hours: {
		key: "sleep_rem_hours",
		unit: "hours",
	},
	sleep_awake_hours: {
		key: "sleep_awake_hours",
		unit: "hours",
	},
	resting_heart_rate: {
		key: "resting_heart_rate",
		unit: "bpm",
	},
	heart_rate_max: {
		key: "heart_rate_max",
		unit: "bpm",
	},
	heart_rate_min: {
		key: "heart_rate_min",
		unit: "bpm",
	},
	heart_rate_avg: {
		key: "heart_rate_avg",
		unit: "bpm",
	},
	heart_rate: {
		key: "heart_rate",
		unit: "bpm",
	},
	hrv_weekly_avg: {
		key: "hrv_weekly_avg",
		unit: "ms",
	},
	hrv_last_night_avg: {
		key: "hrv_last_night_avg",
		unit: "ms",
	},
	hrv_status: {
		key: "hrv_status",
		unit: "status",
	},
} as const;

export const entityMap = {
	...macrofactorEntityMap,
	...garminEntityMap,
} as const;

export const macrofactorEntities = Object.keys(
	macrofactorEntityMap,
) as (keyof typeof macrofactorEntityMap)[];
export const garminEntities = Object.keys(
	garminEntityMap,
) as (keyof typeof garminEntityMap)[];
export const entities = Object.keys(entityMap) as (keyof typeof entityMap)[];

// app.get('/:entity', async (c) => {
//   const entity = c.req.param('entity') as keyof typeof entityMap;

//   if (!(entity in entityMap)) {
//     throw new HTTPException(404)
//   }

//   const data = await db
//     .select({
//       date: schema.macrofactorDaily.date,
//       [entity]: schema.macrofactorDaily[entityMap[entity].key]
//     })
//     .from(schema.macrofactorDaily)

//   return c.json(data.map(item => ({
//     date: item.date,
//     label: entity,
//     value: item[entity],
//     unit: entityMap[entity].unit,
//   })))
// })

const app = new Hono().get("/:entity", async (c) => {
	const entity = c.req.param("entity") as string;
	const startDate = c.req.query("startDate");
	const endDate = c.req.query("endDate");

	const buildDateFilter = () => {
		const conditions = [];
		if (startDate) {
			conditions.push(gte(schema.observations.observedAt, new Date(startDate)));
		}
		if (endDate) {
			conditions.push(lte(schema.observations.observedAt, new Date(endDate + "T23:59:59.999Z")));
		}
		return conditions.length > 0 ? and(...conditions) : undefined;
	};

	if (entity in garminEntityMap) {
		const dateFilter = buildDateFilter();
		const conditions: any[] = [eq(schema.observations.type, entity as any)];
		if (dateFilter) conditions.push(dateFilter);
		
		const data = await db
			.select({
				date: schema.observations.observedAt,
				label: schema.observations.label,
				unit: schema.observations.unit,
				value: schema.observations.value,
			})
			.from(schema.observations)
			.where(and(...conditions));

		return c.json(
			data.map((item: any) => ({
				date: item.date,
				label: entity,
				unit: garminEntityMap[entity as keyof typeof garminEntityMap].unit,
				value: item.value,
			})),
		);
	}

	if (entity in macrofactorEntityMap) {
		type MacroFactorEntity = keyof typeof macrofactorEntityMap;
		const entityKey = entity as MacroFactorEntity;
		const key = macrofactorEntityMap[entityKey].key;
		const col = schema.macrofactorDaily[key as typeof key];
		
		const mfDateFilter: any[] = [];
		if (startDate) mfDateFilter.push(gte(schema.macrofactorDaily.date, new Date(startDate)));
		if (endDate) mfDateFilter.push(lte(schema.macrofactorDaily.date, new Date(endDate + "T23:59:59.999Z")));
		
		const data = await db
			.select({
				date: schema.macrofactorDaily.date,
				value: col,
			})
			.from(schema.macrofactorDaily)
			.where(mfDateFilter.length > 0 ? and(...mfDateFilter) : undefined);

		return c.json(
			data.map((item: any) => ({
				date: item.date,
				label: entity,
				unit: macrofactorEntityMap[entity as keyof typeof macrofactorEntityMap]
					.unit,
				value: item.value,
			})),
		);
	}

	// @ts-ignore
	const data = await db
		.select({
			date: schema.observations.observedAt,
			label: schema.observations.label,
			unit: schema.observations.unit,
			value: schema.observations.value,
		})
		.from(schema.observations)
		// @ts-ignore
		.where(eq(schema.observations.type, entity));

	return c.json(data);
});

export default app;
