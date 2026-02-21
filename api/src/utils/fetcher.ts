import type { z } from "zod";

type Success<T> = {
	data: T;
	error: null;
};

type Failure<E> = {
	data: null;
	error: E;
};

type Result<T, E = Error> = Success<T> | Failure<E>;

export async function fetcher<S extends z.ZodTypeAny, E = Error>(
	url: string | URL,
	schema: S,
	options?: RequestInit,
): Promise<Result<z.output<S>, E>> {
	const res = await fetch(url, options);

	if (!res.ok) {
		return {
			data: null,
			error: new Error(`HTTP error: ${res.status}`),
		} as Failure<E>;
	}

	const json = await res.json();
	const parsedJson = schema.safeParse(json);

	if (parsedJson.success === false) {
		return {
			data: null,
			error: new Error(`Zod error: ${parsedJson.error}`),
		} as Failure<E>;
	}

	return {
		data: parsedJson.data,
		error: null,
	} as Success<z.output<S>>;
}
