import { entries } from "alcalzone-shared/objects";

/** Extracts the current (work in progress) changelog from the complete changelog text */
export function extractCurrentChangelog(
	changelogText: string,
	versionHeaderPrefix: string,
	nextVersionPlaceholderRegex: RegExp,
): string | undefined {
	const match = nextVersionPlaceholderRegex.exec(changelogText);
	if (!match) return;
	const start = match.index + match[0].length;

	let end: number | undefined = changelogText.indexOf(
		versionHeaderPrefix,
		start,
	);
	if (end === -1) end = undefined;

	return changelogText.substring(start, end).trim();
}

export function prependKey<T>(
	obj: Record<string, T>,
	newKey: string,
	value: T,
): Record<string, T> {
	const ret = { [newKey]: value };
	for (const [k, v] of entries(obj)) {
		ret[k] = v;
	}
	return ret;
}
