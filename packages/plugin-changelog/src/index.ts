import { DefaultStages } from "@alcalzone/release-script-core";
import type { Context, Plugin, Stage } from "@alcalzone/release-script-core/types";
import fs from "fs-extra";
import path from "path";
import type { Argv } from "yargs";

export type ChangelogLocation = "readme" | "changelog";

const changelogMarkers = ["**WORK IN PROGRESS**", "__WORK IN PROGRESS__"] as const;

function buildChangelogPlaceholderRegex(changelogPlaceholderPrefix: string) {
	return (): RegExp =>
		new RegExp(
			`^${changelogPlaceholderPrefix} (?:${changelogMarkers
				.map((m) => m.replace(/\*/g, "\\*"))
				.join("|")})(.*?)$`,
			"gm",
		);
}

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
		// The next headline must start with the same or lower amount of prefix chars as the current one
		const nextHeadlineRegex = new RegExp(
			`^${entryPrefix[0]}{${entryPrefix.length - 1},${entryPrefix.length}}(?!${
				entryPrefix[0]
			})`,
			"gm",
		);
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

	public stages(context: Context): Stage[] {
		const ret = [DefaultStages.check, DefaultStages.edit];
		if (context.argv.addPlaceholder) {
			ret.push(DefaultStages.cleanup);
		}
		return ret;
	}

	public defineCLIOptions(yargs: Argv<any>): Argv<any> {
		return yargs.options({
			numChangelogEntries: {
				alias: ["n"],
				type: "number",
				description: `How many changelog entries should be kept in README.md. Only applies when README.md and CHANGELOG_OLD.md exist.`,
				default: 5,
			},
			addPlaceholder: {
				type: "boolean",
				description: `Add an empty placeholder to the changelog after a release.`,
				default: false,
			},
		});
	}

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
		let changelogLocation: ChangelogLocation;
		let changelogOld: string | undefined;
		let changelogPlaceholderPrefix = "##";

		if (await fs.pathExists(changelogPath)) {
			changelog = await fs.readFile(changelogPath, "utf8");
			changelogFilename = path.basename(changelogPath);
			changelogLocation = "changelog";
		} else if (await fs.pathExists(readmePath)) {
			changelog = await fs.readFile(readmePath, "utf8");
			changelogFilename = path.basename(readmePath);
			changelogLocation = "readme";
			// The changelog is indented one more level in the readme
			changelogPlaceholderPrefix += "#";
		} else {
			context.cli.fatal("No CHANGELOG.md or README.md found in the current directory!");
		}

		if (changelogLocation === "readme" && (await fs.pathExists(changelogOldPath))) {
			changelogOld = await fs.readFile(changelogOldPath, "utf8");
		}

		// Parse changelog entries
		const parsed = parseChangelogFile(changelog, changelogPlaceholderPrefix);
		const changelogHasFinalNewline = changelog.replace(/(\r|\n|\r\n)/g, "\n").endsWith("\n");
		let parsedOld: typeof parsed | undefined;
		if (changelogOld) {
			parsedOld = parseChangelogFile(changelogOld, changelogPlaceholderPrefix.substr(1));
		}

		const entries = [...parsed.entries, ...(parsedOld?.entries ?? [])];

		context.setData("changelog_filename", changelogFilename);
		context.setData("changelog_before", parsed.before);
		context.setData("changelog_after", parsed.after);
		context.setData("changelog_final_newline", changelogHasFinalNewline);
		context.setData("changelog_location", changelogLocation);
		context.setData("changelog_entry_prefix", changelogPlaceholderPrefix);

		if (parsedOld) {
			context.setData("changelog_old_before", parsedOld.before);
			context.setData("changelog_old_after", parsedOld.after);
			const changelogOldHasFinalNewline = changelogOld!
				.replace(/(\r|\n|\r\n)/g, "\n")
				.endsWith("\n");
			context.setData("changelog_old_final_newline", changelogOldHasFinalNewline);
		}

		// check if the changelog contains exactly 1 occurence of the changelog placeholder
		const getPlaceholderRegex = buildChangelogPlaceholderRegex(changelogPlaceholderPrefix);
		// There are several possible changelog markers:
		// But we only output the primary one
		const changelogPlaceholder = `${changelogPlaceholderPrefix} ${changelogMarkers[0]}`;

		const currentChangelogs = entries.filter((e) => getPlaceholderRegex().test(e));
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
					const currentChangelogBody = currentChangelogs[0]
						.split("\n")
						.slice(1)
						.join("\n")
						.trim();

					// And make sure it is not empty
					if (!currentChangelogBody) {
						context.cli.error("The changelog for the next version is empty!");
					} else {
						// Place the current changelog at the top
						context.setData("changelog_entries", [
							currentChangelogs[0],
							...entries.filter((e) => e !== currentChangelogs[0]),
						]);
						// And save the body separately
						context.setData("changelog_new", currentChangelogBody);
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

	private async executeEditStage(context: Context): Promise<void> {
		const changelogFilename = context.getData<string>("changelog_filename");
		const changelogBefore = context.getData<string>("changelog_before").trimEnd();
		const changelogEntries = context.getData<string[]>("changelog_entries");
		const changelogAfter = context.getData<string>("changelog_after").trimStart();
		const changelogHasFinalNewline = context.getData<boolean>("changelog_final_newline");
		const prefix = context.getData<string>("changelog_entry_prefix");
		const newVersion = context.getData<string>("version_new");

		const hasChangelogOld =
			context.hasData("changelog_old_before") && context.hasData("changelog_old_after");
		const changelogOldHasFinalNewline =
			context.hasData("changelog_old_final_newline") &&
			context.getData<boolean>("changelog_old_final_newline");

		// Replace the changelog placeholder and keep the free text
		const placeholderRegex = buildChangelogPlaceholderRegex(prefix)();
		let currentChangelog = changelogEntries[0];
		currentChangelog = currentChangelog.replace(
			placeholderRegex,
			`${prefix} ${newVersion} (${new Date().toISOString().split("T")[0]})$1`,
		);
		changelogEntries[0] = currentChangelog;

		if (hasChangelogOld) {
			// If there's a CHANGELOG_OLD.md, we need to split the changelog
			const numNew = context.argv.numChangelogEntries as number;
			const normalizedEntries = changelogEntries.map((e) => e.replace(/^#+/, ""));
			const entriesNew = normalizedEntries.slice(0, numNew).map((e) => prefix + e + "\n\n");
			const entriesOld = normalizedEntries
				.slice(numNew)
				.map((e) => prefix.slice(1) + e + "\n\n");
			const changelogOldBefore = context.getData<string>("changelog_old_before").trimEnd();
			const changelogOldAfter = context.getData<string>("changelog_old_after").trimStart();

			context.cli.log(`Updating changelog in ${changelogFilename}`);
			await fs.writeFile(
				path.join(context.cwd, changelogFilename),
				(changelogBefore + "\n" + entriesNew.join("") + changelogAfter).trim() +
					(changelogHasFinalNewline ? "\n" : ""),
			);

			context.cli.log(`Updating changelog in CHANGELOG_OLD.md`);
			await fs.writeFile(
				path.join(context.cwd, "CHANGELOG_OLD.md"),
				(changelogOldBefore + "\n" + entriesOld.join("") + changelogOldAfter).trim() +
					(changelogOldHasFinalNewline ? "\n" : ""),
			);
		} else {
			const normalizedEntries = changelogEntries
				.map((e) => e.replace(/^#+/, ""))
				.map((e) => prefix + e + "\n\n");
			context.cli.log(`Updating changelog in ${changelogFilename}`);
			await fs.writeFile(
				path.join(context.cwd, changelogFilename),
				(changelogBefore + "\n" + normalizedEntries.join("") + changelogAfter).trim() +
					(changelogHasFinalNewline ? "\n" : ""),
			);
		}
	}

	private async executeCleanupStage(context: Context): Promise<void> {
		const changelogFilename = context.getData<string>("changelog_filename");
		const changelogBefore = context.getData<string>("changelog_before").trimEnd();
		const prefix = context.getData<string>("changelog_entry_prefix");

		const changelogPath = path.join(context.cwd, changelogFilename);
		let fileContent = await fs.readFile(changelogPath, "utf8");
		fileContent = `${fileContent.slice(0, changelogBefore.length)}
${prefix} ${changelogMarkers[0]}
${fileContent.slice(changelogBefore.length)}`; // The part after the new placeholder contains a leading newline, so we don't need an extra one here
		await fs.writeFile(changelogPath, fileContent);
	}

	async executeStage(context: Context, stage: Stage): Promise<void> {
		if (stage.id === "check") {
			await this.executeCheckStage(context);
		} else if (stage.id === "edit") {
			if (context.argv.dryRun) {
				context.cli.log("Dry run, would update changelog");
			} else {
				await this.executeEditStage(context);
			}
		} else if (stage.id === "cleanup" && context.argv.addPlaceholder) {
			if (context.argv.dryRun) {
				context.cli.log("Dry run, would add placeholder to changelog");
			} else {
				await this.executeCleanupStage(context);
			}
		}
	}
}

export default ChangelogPlugin;
