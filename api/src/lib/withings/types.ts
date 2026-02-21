import { z } from "zod";

export const errorSchema = z.object({
	// status can be anything > 0, but we use literal for discriminated unions
	status: z.literal(1).catch(1),
	error: z.string(),
	body: z.object({}),
});

export const oauthSchema = z.object({
	status: z.literal(0),
	body: z.object({
		userid: z.number(),
		access_token: z.string(),
		refresh_token: z.string(),
		scope: z.string(),
		expires_in: z.number(),
	}),
});

export const measureSchema = z.object({
	status: z.literal(0),
	body: z.object({
		updatetime: z.number(),
		timezone: z.string(),
		measuregrps: z.array(
			z.object({
				grpid: z.number(),
				attrib: z.number(),
				date: z.number(),
				created: z.number(),
				modified: z.number(),
				category: z.number(),
				deviceid: z.string().optional(),
				hash_deviceid: z.string().optional(),
				measures: z
					.object({
						value: z.number(),
						type: z.number(),
						unit: z.number(),
						algo: z.number().optional(),
						fm: z.number().optional(),
						position: z.number().optional(),
					})
					.array(),
				modelid: z.number().optional(),
				model: z.string().nullable(),
				comment: z.string().nullable(),
				timezone: z.string().optional(),
			}),
		),
	}),
});

// export type ErrorResponse = z.infer<typeof errorSchema>;
// export type MeasureResponse = z.infer<typeof measureSchema>;
