import fs from "node:fs/promises";

export async function pathExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

export async function readJson(filePath: string): Promise<any> {
	return JSON.parse(await fs.readFile(filePath, "utf8"));
}

export async function writeJson(
	filePath: string,
	data: unknown,
	options?: { spaces?: number },
): Promise<void> {
	const spaces = options?.spaces ?? 2;
	await fs.writeFile(filePath, JSON.stringify(data, null, spaces) + "\n");
}
