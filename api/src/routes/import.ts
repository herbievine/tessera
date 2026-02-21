import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { importDataFromMacrofactor } from "../import/macrofactor.ts";

const app = new Hono();

app.post("/", async (c) => {
	const json = await c.req.json();
	const data = json?.data;

	if (!data) {
		throw new HTTPException(400);
	}

	try {
		const saved = await importDataFromMacrofactor(data);

		console.log(`Imported ${saved.length} entries.`);

		return c.json({
			success: true,
		});
	} catch (err) {
		console.error("Parse error:", err);
		throw new HTTPException(400, { message: "Invalid XLSX file" });
	}
});

export default app;
