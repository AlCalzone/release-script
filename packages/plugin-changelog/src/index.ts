import { DefaultStages } from "@alcalzone/release-script-core";
import type { Context, Plugin, Stage } from "@alcalzone/release-script-core/types";
import fs from "fs-extra";
import path from "path";

const changelogMarkers = ["**WORK IN PROGRESS**", "__WORK IN PROGRESS__"] as const;

/** Extracts the current (work in progress) changelog from the complete changelog text */
export function extractCurrentChangelog(
	changelogText: string,
	versionHeaderPrefix: string,
	nextVersionPlaceholderRegex: RegExp,
): string | undefined {
	const match = nextVersionPlaceholderRegex.exec(changelogText);
	if (!match) return;
	const start = match.index + match[0].length;
	let entry = changelogText.slice(start);

	const nextHeadlineRegex = new RegExp(`^${versionHeaderPrefix} `, "gm");
	const matchEnd = nextHeadlineRegex.exec(entry);
	if (matchEnd) {
		entry = entry.slice(0, matchEnd.index);
	}

	return entry.trim();
}

export function parseChangelogFile(
	changelog: string,
	entryPrefix: string,
): { before: string; after: string; entries: string[] } {
	const escapedMarkers = changelogMarkers.map((m) => m.replace(/\*/g, "\\*"));
	const versionAndDate = "v?\\d+\\.\\d+\\.\\d+(.+?\\(\\d{4}\\-\\d{2}\\-\\d{2}\\))?";
	const changelogEntryRegex = new RegExp(
		// match changelog headline with optional free text at the end
		`^${entryPrefix} (?:${[...escapedMarkers, versionAndDate].join("|")}).*?$`,
		"gm",
	);

	let matchStart: RegExpExecArray | null;
	let firstStartIndex: number | undefined;
	let lastEndIndex: number | undefined;
	const entries: string[] = [];
	while ((matchStart = changelogEntryRegex.exec(changelog))) {
		let entry = changelog.slice(matchStart.index);
		const nextHeadlineRegex = new RegExp(`^${entryPrefix.slice(1)}`, "gm");
		const matchEnd = nextHeadlineRegex.exec(entry.slice(matchStart[0].length));
		if (matchEnd) {
			entry = entry.slice(0, matchStart[0].length + matchEnd.index);
		}
		entries.push(entry.trim());

		// Remember where the changelog starts and ends
		if (!firstStartIndex) firstStartIndex = matchStart.index;
		lastEndIndex = matchStart.index + entry.length;
	}
	if (!firstStartIndex) {
		// no entries found
		return {
			before: changelog,
			after: "",
			entries: [],
		};
	} else {
		return {
			before: changelog.slice(0, firstStartIndex),
			after: changelog.slice(lastEndIndex),
			entries,
		};
	}
}

class ChangelogPlugin implements Plugin {
	public readonly id = "changelog";
	public readonly stages = [
		DefaultStages.check,
		// Add others as necessary
	];

	// dependencies?: string[] | undefined;
	// stageAfter?: Record<string, ConstOrDynamic<string[]>> | undefined;
	// stageBefore?: Record<string, ConstOrDynamic<string[]>> | undefined;

	private async executeCheckStage(context: Context): Promise<void> {
		// The changelog must either be in CHANGELOG.md or README.md
		const changelogPath = path.join(context.cwd, "CHANGELOG.md");
		const readmePath = path.join(context.cwd, "README.md");
		// CHANGELOG_OLD is only used if the main changelog is in the readme
		const changelogOldPath = path.join(context.cwd, "CHANGELOG_OLD.md");

		let changelog: string;
		let changelogFilename: string;
		let changelogLocation: "README" | "CHANGELOG";
		let changelogOld: string | undefined;
		let changelogPlaceholderPrefix = "##";

		if (await fs.pathExists(changelogPath)) {
			changelog = await fs.readFile(changelogPath, "utf8");
			changelogFilename = path.basename(changelogPath);
			changelogLocation = "CHANGELOG";
		} else if (await fs.pathExists(readmePath)) {
			changelog = await fs.readFile(readmePath, "utf8");
			changelogFilename = path.basename(readmePath);
			changelogLocation = "README";
			// The changelog is indented one more level in the readme
			changelogPlaceholderPrefix += "#";
		} else {
			context.cli.fatal("No CHANGELOG.md or README.md found in the current directory!");
		}

		if (changelogLocation === "README" && (await fs.pathExists(changelogOldPath))) {
			changelogOld = await fs.readFile(changelogOldPath, "utf8");
		}

		// // The regex for the placeholder includes an optional free text at the end, e.g.
		// // ### __WORK IN PROGRESS__ "2020 Doomsday release"
		// const changelogPlaceholderRegex = new RegExp(
		// 	`^${changelogPlaceholderPrefix} (?:${changelogMarkers
		// 		.map((m) => m.replace(/\*/g, "\\*"))
		// 		.join("|")})(.*?)$`,
		// 	"gm",
		// );

		// 		// check if the changelog contains exactly 1 occurence of the changelog placeholder
		// 		switch ((changelog.match(changelogPlaceholderRegex) || []).length) {
		// 			case 0:
		// 				context.cli.error(
		// 					`The changelog placeholder is missing from ${changelogFilename}!
		// Please add the following line to your changelog:
		// ${changelogPlaceholder}`,
		// 				);
		// 			case 1:
		// 				break; // all good
		// 			default:
		// 				context.cli.error(
		// 					`There is more than one changelog placeholder in ${changelogFilename}!`,
		// 				);
		// 		}

		// 		// Make sure the changelog is not empty
		// 		// Check if there is a changelog for the current version
		// 		const currentChangelog = extractCurrentChangelog(
		// 			changelog,
		// 			changelogPlaceholderPrefix,
		// 			changelogPlaceholderRegex,
		// 		);
		// 		if (!currentChangelog) {
		// 			context.cli.error("The changelog for the next version is empty!");
		// 		}

		// Parse changelog entries
		const parsed = parseChangelogFile(changelog, changelogPlaceholderPrefix);
		let parsedOld: typeof parsed | undefined;
		if (changelogOld) {
			parsedOld = parseChangelogFile(changelogOld, changelogPlaceholderPrefix.substr(1));
		}

		const entries = [...parsed.entries, ...(parsedOld?.entries ?? [])];

		context.setData("changelog_filename", changelogFilename);
		context.setData("changelog_before", parsed.before);
		context.setData("changelog_entries", entries);
		context.setData("changelog_after", parsed.after);

		if (parsedOld) {
			context.setData("changelog_old_before", parsedOld.before);
			context.setData("changelog_old_after", parsedOld.after);
		}

		// check if the changelog contains exactly 1 occurence of the changelog placeholder
		const getChangelogPlaceholderRegex = (): RegExp =>
			new RegExp(
				`^${changelogPlaceholderPrefix} (?:${changelogMarkers
					.map((m) => m.replace(/\*/g, "\\*"))
					.join("|")})`,
				"g",
			);
		// There are several possible changelog markers:
		// But we only output the primary one
		const changelogPlaceholder = `${changelogPlaceholderPrefix} ${changelogMarkers[0]}`;

		const currentChangelogs = entries.filter((e) => getChangelogPlaceholderRegex().test(e));
		switch (currentChangelogs.length) {
			case 0:
				context.cli.error(
					`The changelog placeholder is missing from ${changelogFilename}!
Please add the following line to your changelog:
${changelogPlaceholder}`,
				);
				break;
			case 1:
				{
					// Ok, extract the current changelog body for further processing
					const currentChangelog = currentChangelogs[0]
						.split("\n")
						.slice(1)
						.join("\n")
						.trim();

					// And make sure it is not empty
					if (!currentChangelog) {
						context.cli.error("The changelog for the next version is empty!");
					} else {
						context.setData("changelog_new", currentChangelog);
						context.cli.log(`changelog ok ${context.cli.colors.green("✔")}`);
					}
				}
				break; // all good
			default:
				context.cli.error(
					`There is more than one changelog placeholder in ${changelogFilename}!`,
				);
		}
	}

	async executeStage(context: Context, stage: Stage): Promise<void> {
		if (stage.id === "check") {
			await this.executeCheckStage(context);
		}
	}
}

export default ChangelogPlugin;
