const ENCRYPTION_KEY = Bun.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY) {
	throw new Error("ENCRYPTION_KEY environment variable is required");
}

const key = Buffer.from(ENCRYPTION_KEY.slice(0, 32).padEnd(32, "0"));

function xorEncrypt(text: string): string {
	const textBytes = Buffer.from(text);
	const keyBytes = key;

	const result = Buffer.alloc(textBytes.length);
	for (let i = 0; i < textBytes.length; i++) {
		result[i] = textBytes[i]! ^ keyBytes[i % keyBytes.length]!;
	}

	return Buffer.concat([result]).toString("base64");
}

function xorDecrypt(ciphertext: string): string {
	const cipherBytes = Buffer.from(ciphertext, "base64");
	const keyBytes = key;

	const result = Buffer.alloc(cipherBytes.length);
	for (let i = 0; i < cipherBytes.length; i++) {
		result[i] = cipherBytes[i]! ^ keyBytes[i % keyBytes.length]!;
	}

	return result.toString();
}

export const encrypt = xorEncrypt;
export const decrypt = xorDecrypt;
