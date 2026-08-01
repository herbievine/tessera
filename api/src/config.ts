// The API binds one port and also calls itself over HTTP (cron fan-out,
// triggering an import right after connecting an integration). Both need to
// agree, so they're derived from the same place rather than hardcoded.
export const port = Number(Bun.env.PORT ?? 3010);

export const internalApiUrl =
	Bun.env.API_INTERNAL_URL ?? `http://localhost:${port}`;
