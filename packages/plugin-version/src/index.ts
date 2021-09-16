import { DefaultStages } from "@alcalzone/release-script-core";
import type { Context, Plugin, Stage } from "@alcalzone/release-script-core/types";
import { isArray } from "alcalzone-shared/typeguards";
import fs from "fs-extra";
import path from "path";
import semver from "semver";
import glob from "tiny-glob";
import type { Argv } from "yargs";

function isArrayOfTuples<T>(value: T): value is T & [unknown, unknown][] {
	if (!isArray(value)) return false;
	return value.every((v) => isArray(v) && v.length === 2);
}

function isArrayOfStrings(value: unknown): value is string[] {
	if (!isArray(value)) return false;
	return value.every((v) => typeof v === "string");
}

class VersionPlugin implements Plugin {
	public readonly id = "version";
	public readonly stages = [DefaultStages.check, DefaultStages.edit];

	public readonly stageAfter = {
		check: "*" as const,
	};

	public defineCLIOptions(yargs: Argv<any>): Argv<any> {
		return yargs.options({
			versionFiles: {
				description: `Replace versions in additional files using regular expressions. Can only be configured with a config file - see documentation.`,
			},
		});
	}

	private async executeCheckStage(context: Context): Promise<void> {
		const version = context.getData<string>("version");
		const parsedVersion = semver.parse(version);
		const colors = context.cli.colors;

		let deleteLines = 2;
		let askOk = false;

		if (!context.argv.bump) {
			context.cli.log(`Version bump not provided`);
			let preid = context.argv.preid ?? parsedVersion?.prerelease?.[0];
			if (typeof preid !== "string" || !Number.isNaN(parseInt(preid, 10))) {
				preid = undefined;
			}
			context.argv.bump = await context.cli.select("Please choose a version", [
				{
					value: "major",
					label: `${colors.bold(semver.inc(version, "major")!)} (major)`,
					hint: "Breaking changes were introduced. This may include new features and bugfixes.",
				},
				{
					value: "minor",
					label: `${colors.bold(semver.inc(version, "minor")!)} (minor)`,
					hint: "A new feature was added without breaking things. This may include bugfixes.",
				},
				{
					value: "patch",
					label: `${colors.bold(semver.inc(version, "patch")!)} (patch)`,
					hint: "A bug was fixed without adding new functionality.",
				},
				{
					value: "prerelease",
					label: `${colors.bold(
						semver.inc(version, "prerelease", preid ?? "alpha")!,
					)} or similar (prerelease)`,
					hint: "Bump an existing prerelease suffix, behaves like prepatch otherwise.",
				},
				{
					value: "premajor",
					label: `${colors.bold(
						semver.inc(version, "premajor", preid ?? "alpha")!,
					)} or similar (premajor)`,
					hint: "To provide test versions before a major release.",
				},
				{
					value: "preminor",
					label: `${colors.bold(
						semver.inc(version, "preminor", preid ?? "alpha")!,
					)} or similar (preminor)`,
					hint: "To provide test versions before a minor release.",
				},
				{
					value: "prepatch",
					label: `${colors.bold(
						semver.inc(version, "prepatch", preid ?? "alpha")!,
					)} or similar (prepatch)`,
					hint: "To provide test versions before a patch release.",
				},
			]);
			deleteLines++;
		} else {
			askOk = true;
		}

		if (context.argv.bump.startsWith("pre")) {
			context.argv.preid = (
				await context.cli.ask("Please enter the desired prerelease identifier", "alpha")
			).trim();
			deleteLines++;
			askOk = true;
		} else {
			context.argv.preid = undefined;
		}
		const newVersion = semver.inc(version, context.argv.bump as any, context.argv.preid)!;
		context.cli.log(`Bumping version from ${version} to ${newVersion}`);
		if (askOk && !context.argv.yes) {
			const ok =
				(await context.cli.select("Is this okay?", [
					{
						value: "yes",
						label: "yes",
					},
					{
						value: "no",
						label: "no",
					},
				])) === "yes";
			if (!ok) context.cli.fatal("Aborted by user");
			deleteLines++;
		}

		context.cli.clearLines(deleteLines);

		context.cli.log(
			`Bumping version from ${colors.blue(version)} to ${colors.green(
				newVersion,
			)} ${colors.green("✔")}`,
		);
		context.setData("version_new", newVersion);

		// Check versionFiles if given
		if (context.argv.versionFiles != undefined) {
			if (isArrayOfTuples(context.argv.versionFiles)) {
				// eslint-disable-next-line prefer-const
				for (let [pattern, re] of context.argv.versionFiles) {
					if (typeof re === "string") re = [re];
					if (!isArrayOfStrings(re)) {
						context.cli.error(
							`Invalid option versionFiles: replacement pattern for glob "${pattern}" must be a string or an array of strings!`,
						);
						continue;
					}

					// Test regular expressions
					for (const r of re) {
						try {
							new RegExp(r, "g");
						} catch (e) {
							context.cli.error(
								`Invalid option versionFiles: replacement pattern for glob "${pattern}" contains invalid regular expression "${r}"!`,
							);
						}
					}
				}
			} else {
				context.cli.error(`Option versionFiles must be an array of tuples`);
			}
		}
	}

	private async executeEditStage(context: Context): Promise<void> {
		if (context.argv.versionFiles != undefined) {
			context.cli.log(`Updating version in additional files`);
			const newVersion = context.getData<string>("version_new");

			// eslint-disable-next-line prefer-const
			for (let [pattern, re] of context.argv.versionFiles as any as [any, any][]) {
				if (typeof re === "string") re = [re];

				const files = await glob(pattern, {
					cwd: context.cwd,
					dot: true,
				});

				for (const file of files) {
					const filePath = path.join(context.cwd, file);
					if (!(await fs.pathExists(filePath))) continue;

					if (context.argv.verbose) {
						context.cli.log(`Updating version in ${file}`);
					}

					if (!context.argv.dryRun) {
						let fileContent = await fs.readFile(filePath, "utf8");
						// Apply replacements
						for (const r of re) {
							const regex = new RegExp(r, "g");
							fileContent = fileContent.replace(regex, newVersion);
						}
						await fs.writeFile(filePath, fileContent, "utf8");
					}
				}
			}
		}
	}

	async executeStage(context: Context, stage: Stage): Promise<void> {
		if (stage.id === "check") {
			await this.executeCheckStage(context);
		} else if (stage.id === "edit") {
			await this.executeEditStage(context);
		}
	}
}

export default VersionPlugin;
