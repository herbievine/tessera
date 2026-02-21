import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import * as schema from "./schema";

const sqlite = new Database(Bun.env.DB_FILE_NAME);

sqlite.run("PRAGMA journal_mode = WAL;");

export const db = drizzle({
	client: sqlite,
	relations: schema.relations,
	schema,
});
