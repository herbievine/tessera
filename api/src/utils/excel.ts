// Excel epoch starts at 1900-01-01 (with leap year bug)
const EXCEL_EPOCH = new Date(Date.UTC(1899, 11, 30));

export function parseExcelDate(value: unknown): Date {
	// If it's a number, it's an Excel serial date
	if (typeof value === "number") {
		// Excel stores dates as days since epoch, with time as fraction of day
		const days = Math.floor(value);
		const ms = (value - days) * 24 * 60 * 60 * 1000;
		const date = new Date(
			EXCEL_EPOCH.getTime() + days * 24 * 60 * 60 * 1000 + ms,
		);
		// Reset to midnight UTC
		return new Date(
			Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
		);
	}

	// If it's a string, try to parse it
	const str = String(value);

	// Try ISO format first: 2026-02-01 (auto-parses correctly in UTC)
	if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
		return new Date(
			Date.UTC(
				parseInt(str.slice(0, 4)),
				parseInt(str.slice(5, 7)) - 1,
				parseInt(str.slice(8, 10)),
			),
		);
	}

	// Try US format: 2/1/26 or 02/01/2026
	const usMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
	if (usMatch) {
		const m = parseInt(usMatch[1]!);
		const d = parseInt(usMatch[2]!);
		let y = parseInt(usMatch[3]!);
		if (y < 100) y += 2000;
		return new Date(Date.UTC(y, m - 1, d));
	}

	// Fallback: try auto-parse (may interpret in local TZ)
	const d = new Date(str);
	if (!isNaN(d.getTime())) {
		return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
	}

	throw new Error(`Unable to parse date: ${str}`);
}
