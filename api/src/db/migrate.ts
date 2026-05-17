import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import * as schema from "./schema";
import { generateApiKey } from "../utils/id";

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

const email = Bun.env.DEFAULT_EMAIL;
const password = Bun.env.DEFAULT_PASSWORD;

if (email && password) {
	const existing = await db.select().from(schema.users).limit(1);
	if (existing.length === 0) {
		await db.insert(schema.users).values({
			name: email!.split("@")[0],
			email: email!,
			password: await Bun.password.hash(password!),
			apiKeyHash: generateApiKey(),
		});
		console.log(`Created default user: ${email}`);
	}
}
