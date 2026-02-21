import { customAlphabet } from "nanoid";

const alphabet = "abcdefghijklmnopqrstuvwxyz";

export const id = customAlphabet(alphabet, 10);

export function generateApiKey() {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);

	return (
		"tessera_sk_" +
		Array.from(bytes)
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("")
	);
}
