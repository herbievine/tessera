export function safeParse(number: string | number | null | undefined) {
	if (typeof number === "undefined" || number === null) {
		return null;
	}

	return parseFloat(number.toString());
}
