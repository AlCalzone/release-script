export function prependKey<T>(obj: Record<string, T>, newKey: string, value: T): Record<string, T> {
	const ret = { [newKey]: value };
	for (const [k, v] of Object.entries(obj)) {
		ret[k] = v;
	}
	return ret;
}

export function limitKeys<T>(obj: Record<string, T>, count: number): Record<string, T> {
	const ret: Record<string, T> = {};
	for (const [k, v] of Object.entries(obj).slice(0, count)) {
		ret[k] = v;
	}
	return ret;
}

const changelogAuthorRegex = /^[ \t]*[\*\-][ \t]*\([\p{L}\p{M}0-9@\-_,;&\+\/ ]+\)[ \t]*/gimu;
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
	if (lines.every((line) => !line || changelogBulletPointTestRegex.test(line))) {
		changelog = changelog.replace(changelogBulletPointReplaceRegex, "");
	}
	return changelog;
}
