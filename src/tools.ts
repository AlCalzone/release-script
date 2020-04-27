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
		// Avoid matching sub-headlines
		versionHeaderPrefix + " ",
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

export function limitKeys<T>(
	obj: Record<string, T>,
	count: number,
): Record<string, T> {
	const ret: Record<string, T> = {};
	for (const [k, v] of entries(obj).slice(0, count)) {
		ret[k] = v;
	}
	return ret;
}

const changelogAuthorRegex = /^[ \t]*[\*\-][ \t]*\([a-z0-9\-_]+\)[ \t]*/mgi;
const changelogBulletPointTestRegex = /^[ \t]*[\*\-][ \t]*/;
const changelogBulletPointReplaceRegex = new RegExp(changelogBulletPointTestRegex, "mg");

export function cleanChangelogForNews(changelog: string): string {
	// Remove leading "* (Author) " from changelog entries
	changelog = changelog
	.trim()
		.replace(/\r\n/g, "\n")
		.replace(/\r/g, "\n")
		.replace(changelogAuthorRegex, "* ");
	// If all changelog entries are either empty or start with a bullet point, remove that too
	const lines = changelog.split("\n");
	if (lines.every(line => !line || changelogBulletPointTestRegex.test(line))) {
		changelog = changelog.replace(changelogBulletPointReplaceRegex, "");
	}
	return changelog;
}