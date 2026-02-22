/**
 * Example MCP server using Hono with WebStandardStreamableHTTPServerTransport
 *
 * This example demonstrates using the Web Standard transport directly with Hono,
 * which works on any runtime: Node.js, Cloudflare Workers, Deno, Bun, etc.
 *
 * Run with: pnpm tsx src/honoWebStandardStreamableHttp.ts
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { entities, entityMap, macrofactorEntityMap } from "../routes/trends";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { db } from "../db";
import * as schema from "../db/schema";
import { between, sql } from "drizzle-orm";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import dayjs from "dayjs";

export function createTransport() {
	const server = new McpServer({
		name: "Tessera",
		version: "1.0.0",
	});

	server.registerTool(
		"data_over_time",
		{
			title: "Get data over time",
			description:
				"Get health data over a specific time period. Supports multiple metrics, date filtering, aggregation, and limits.",
			inputSchema: z.object({
				entities: z
					.array(z.enum(entities))
					.max(5)
					.describe(
						`Metrics to query (max 5). Possible options: ${entities.join(", ")}`,
					),
				startDate: z
					.string()
					.optional()
					.describe(
						"Start date in ISO format (YYYY-MM-DD). If not provided, returns all historical data.",
					),
				endDate: z
					.string()
					.optional()
					.describe(
						"End date in ISO format (YYYY-MM-DD). If not provided, returns data up to today.",
					),
				aggregation: z
					.enum(["daily", "weekly", "monthly"])
					.optional()
					.describe(
						"Aggregate data: daily (default), weekly averages, monthly averages",
					),
				limit: z
					.number()
					.min(1)
					.max(1000)
					.optional()
					.describe(
						"Max number of data points to return (default: 100, max: 1000)",
					),
			}),
		},
		async ({
			entities: selectedEntities,
			startDate,
			endDate,
			aggregation = "daily",
			limit = 100,
		}): Promise<CallToolResult> => {
			// Build the select columns dynamically
			const selectColumns: Record<string, any> = {
				date: schema.macrofactorDaily.date,
			};

			selectedEntities.forEach((entity) => {
				if (entity in macrofactorEntityMap) {
					type MacroFactorEntity = keyof typeof macrofactorEntityMap;
					const entityKey = entity as MacroFactorEntity;
					const key = macrofactorEntityMap[entityKey]
						.key as keyof typeof schema.macrofactorDaily;
					selectColumns[entity] = schema.macrofactorDaily[key];
				}
			});

			// Build date conditions
			let dateCondition = undefined;

			if (startDate && endDate) {
				const start = dayjs(startDate).startOf("day").toDate();
				const end = dayjs(endDate).endOf("day").toDate();
				dateCondition = between(schema.macrofactorDaily.date, start, end);
			} else if (startDate) {
				const start = dayjs(startDate).startOf("day").toDate();
				dateCondition = sql`${schema.macrofactorDaily.date} >= ${start}`;
			} else if (endDate) {
				const end = dayjs(endDate).endOf("day").toDate();
				dateCondition = sql`${schema.macrofactorDaily.date} <= ${end}`;
			}

			// Build and execute query
			const data = await db
				.select(selectColumns)
				.from(schema.macrofactorDaily)
				.where(dateCondition)
				.orderBy(schema.macrofactorDaily.date)
				.limit(limit);

			// Process data based on aggregation
			let processedData = data;

			if (aggregation !== "daily" && data.length > 0) {
				processedData = aggregateData(data, selectedEntities, aggregation);
			}

			// Build response with metadata
			const response = {
				metadata: {
					entities: selectedEntities,
					aggregation,
					dateRange:
						data.length > 0
							? {
									start: data[0]?.date,
									end: data[data.length - 1]?.date,
								}
							: null,
					count: processedData.length,
					limit,
				},
				data: processedData.map((item: any) => ({
					date: item.date,
					metrics: selectedEntities.map((entity) => ({
						label: entity,
						value: item[entity],
						unit: entityMap[entity].unit,
					})),
				})),
			};

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(response, null, 2),
					},
				],
			};
		},
	);

	// Create a stateless transport (no options = no session management)
	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
	});

	server.connect(transport);

	return transport;
}

// Helper function to aggregate data
function aggregateData(
	data: any[],
	entities: string[],
	aggregation: "weekly" | "monthly",
) {
	const grouped = new Map<string, any[]>();

	data.forEach((item) => {
		const date = dayjs(item.date);
		let key: string;

		if (aggregation === "weekly") {
			key = date.startOf("week").format("YYYY-MM-DD");
		} else {
			key = date.startOf("month").format("YYYY-MM-DD");
		}

		if (!grouped.has(key)) {
			grouped.set(key, []);
		}
		grouped.get(key)!.push(item);
	});

	return Array.from(grouped.entries()).map(([date, items]) => {
		const aggregated: any = { date };

		entities.forEach((entity) => {
			const values = items
				.map((item) => item[entity])
				.filter((v): v is number => v !== null && v !== undefined);
			aggregated[entity] =
				values.length > 0
					? values.reduce((a, b) => a + b, 0) / values.length
					: null;
		});

		return aggregated;
	});
}
