import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import * as schema from "./schema";

if (!Bun.env.DB_FILE_NAME) {
	throw new Error("DB_FILE_NAME environment variable is not set");
}

const exists = await Bun.file(Bun.env.DB_FILE_NAME).exists();

if (!exists) {
	await Bun.write(Bun.env.DB_FILE_NAME, Buffer.from(""));
}

const sqlite = new Database(Bun.env.DB_FILE_NAME);
const db = drizzle({ client: sqlite, relations: schema.relations, schema });

migrate(db, { migrationsFolder: "./drizzle" });
