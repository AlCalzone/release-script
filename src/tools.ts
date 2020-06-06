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

const changelogAuthorRegex = /^[ \t]*[\*\-][ \t]*\([a-z0-9\-_]+\)[ \t]*/gim;
const changelogBulletPointTestRegex = /^[ \t]*[\*\-][ \t]*/;
const changelogBulletPointReplaceRegex = new RegExp(
	changelogBulletPointTestRegex,
	"mg",
);

export function cleanChangelogForNews(changelog: string): string {
	// Remove leading "* (Author) " from changelog entries
	changelog = changelog
		.trim()
		.replace(/\r\n/g, "\n")
		.replace(/\r/g, "\n")
		.replace(changelogAuthorRegex, "* ");
	// If all changelog entries are either empty or start with a bullet point, remove that too
	const lines = changelog.split("\n");
	if (
		lines.every((line) => !line || changelogBulletPointTestRegex.test(line))
	) {
		changelog = changelog.replace(changelogBulletPointReplaceRegex, "");
	}
	return changelog;
}

/** Splits a complete changelog into the most recent 5 entries plus the rest */
export function splitChangelog(
	changelog: string,
	entryPrefix: string,
	numEntriesNew: number = 5,
): { newChangelog: string; oldChangelog?: string } {
	const changelogEntryRegex = new RegExp(
		`^${entryPrefix} \\d+\\.\\d+\\.\\d+(.+?\\(\\d{4}\\-\\d{2}\\-\\d{2}\\))?$`,
		"gm",
	);
	let matchStart: RegExpExecArray | null;
	let firstStartIndex: number | undefined;
	let lastEndIndex: number | undefined;
	const entries: string[] = [];
	while ((matchStart = changelogEntryRegex.exec(changelog))) {
		let entry = changelog.slice(matchStart.index);
		const nextHeadlineRegex = new RegExp(`^${entryPrefix.slice(1)}`, "gm");
		const matchEnd = nextHeadlineRegex.exec(
			entry.slice(matchStart[0].length),
		);
		if (matchEnd) {
			entry = entry.slice(0, matchStart[0].length + matchEnd.index);
		}
		entries.push(entry);

		// Remember where the changelog starts and ends
		if (!firstStartIndex) firstStartIndex = matchStart.index;
		lastEndIndex = matchStart.index + entry.length;
	}
	if (!firstStartIndex) {
		// no entries found
		return {
			newChangelog: changelog,
		};
	}
	// Keep the first <numEntriesNew> entries in the new changelog,
	// put all others in the old changelog
	return {
		newChangelog:
			changelog.slice(0, firstStartIndex) +
			entries.slice(0, numEntriesNew).join("") +
			changelog.slice(lastEndIndex),
		oldChangelog:
			entries.length > numEntriesNew
				? entries
						.slice(numEntriesNew)
						.map((e) => e.slice(1))
						.join("")
				: undefined,
	};
}

/** Inserts new entries at the start of a changelog */
export function insertIntoChangelog(
	changelog: string,
	newEntries: string,
	entryPrefix: string,
): string {
	const firstEntryIndex = changelog.indexOf(entryPrefix);
	if (firstEntryIndex === -1) return changelog + newEntries;
	return (
		changelog.slice(0, firstEntryIndex) +
		newEntries +
		changelog.slice(firstEntryIndex)
	);
}
