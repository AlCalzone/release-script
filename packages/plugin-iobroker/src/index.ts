import { DefaultStages } from "@alcalzone/release-script-core";
import type { Context, Plugin, Stage } from "@alcalzone/release-script-core/types";
import { isObject } from "alcalzone-shared/typeguards";
import fs from "fs-extra";
import path from "path";
import semver from "semver";
import type { Argv } from "yargs";
import { cleanChangelogForNews, limitKeys, prependKey } from "./tools";
import { translateText } from "./translate";

function getDesiredIoPackVersion(context: Context): string {
	const version = context.getData<string>("version");
	if (context.argv.ioPackageNoPrerelease) {
		const s = semver.parse(version)!;
		return `${s.major}.${s.minor}.${s.patch}`;
	} else {
		return version;
	}
}

class IoBrokerPlugin implements Plugin {
	public readonly id = "iobroker";
	public readonly stages = [
		DefaultStages.check,
		DefaultStages.edit,
		// Add others as necessary
	];

	public readonly dependencies = ["package", "changelog"];
	// stageAfter?: Record<string, ConstOrDynamic<string[]>> | undefined;
	// stageBefore?: Record<string, ConstOrDynamic<string[]>> | undefined;
	public readonly stageAfter = {
		check: ["package"],
	};

	public defineCLIOptions(yargs: Argv<any>): Argv<any> {
		return yargs.options({
			ioPackage: {
				alias: ["io"],
				type: "string",
				description: `The location of ioBroker's io-package.json file, relative to the current directory`,
				defaultDescription: "The current directory",
			},
			noWorkflowCheck: {
				description: "Disable checking the test-and-release.yml workflow",
				type: "boolean",
				default: false,
			},
			numNews: {
				alias: ["nn"],
				type: "number",
				description: `How many news entries should be kept in io-package.json`,
				default: 7,
			},
			ioPackageNoPrerelease: {
				description: "Remove prerelease identifiers from the version in io-package.json",
				type: "boolean",
				default: false,
			},
		});
	}

	private async checkIoPackage(context: Context): Promise<void> {
		// ensure that io-package.json exists and has a valid version
		let ioPackDirectory = context.cwd;
		if (context.argv.ioPackage) {
			ioPackDirectory = path.join(ioPackDirectory, context.argv.ioPackage as string);
		}
		const ioPackPath = path.join(ioPackDirectory, "io-package.json");
		if (!(await fs.pathExists(ioPackPath))) {
			context.cli.fatal(`io-package.json not found in ${ioPackDirectory}!`);
		}

		const ioPack = await fs.readJson(ioPackPath);
		const ioPackVersion = ioPack?.common?.version;
		if (!ioPackVersion) {
			context.cli.error("Version missing from io-package.json!");
		} else if (!semver.valid(ioPackVersion)) {
			context.cli.error(`Invalid version "${ioPackVersion}" in io-package.json!`);
		} else {
			const packVersion = context.getData<string>("version");
			const desiredVersion = getDesiredIoPackVersion(context);
			if (ioPackVersion !== desiredVersion) {
				context.cli.error(
					`Version mismatch between io-package.json (${ioPackVersion}) and package.json (${packVersion})!`,
				);
			} else {
				context.cli.log(`io-package.json ok ${context.cli.colors.green("✔")}`);
			}
		}

		// Remember io-package.json contents
		context.setData("io-package.json", ioPack);
	}

	private async checkWorkflow(context: Context): Promise<void> {
		// ensure that the release workflow does not check for base_ref
		// This is pretty specific to ioBroker's release workflow, but better than silently failing
		const workflowPath = path.join(context.cwd, ".github/workflows/test-and-release.yml");
		const colors = context.cli.colors;
		if (await fs.pathExists(workflowPath)) {
			let content = fs.readFileSync(workflowPath, "utf8");
			// Find deploy step, crudely by string manipulation. TODO: This should be done with a yaml parser
			let match = /^[ \t]+deploy:/gm.exec(content);
			if (!match) return;
			content = content.substr(match.index);

			match = /^[ \t]+if: |/gm.exec(content);
			if (!match) return;
			content = content.substr(match.index);

			match = /^[ \t]+github\.event\.base_ref ==/gm.exec(content);
			if (!match) return;

			let line = content.substr(match.index);
			line = line.substr(0, line.indexOf("\n"));

			context.cli.error(`The ${colors.bold("deploy")} job in ${colors.bold(
				`.github/workflows/test-and-release.yml`,
			)} potentially has an error, which can cause your deploy to fail.
Remove this line to fix it:
${colors.inverse(line)}

You can suppress this check with the ${colors.bold("--no-workflow-check")} flag.`);
		}
	}

	private async executeEditStage(context: Context): Promise<void> {
		const newVersion = context.getData<string>("version_new");
		const ioPack = context.getData<any>("io-package.json");

		if (context.argv.dryRun) {
			context.cli.log(
				`Dry run, would update io-package.json version to ${context.cli.colors.green(
					newVersion,
				)}`,
			);
		} else {
			context.cli.log(
				`updating io-package.json version to ${context.cli.colors.green(newVersion)}`,
			);
			ioPack.common.version = newVersion;
		}

		context.cli.log(`updating news in io-package.json`);
		ioPack.common.news ??= {};

		if (newVersion in ioPack.common.news) {
			context.cli.log(`current news is already in io-package.json, not changing it`);
		} else if (isObject(ioPack.common.news.NEXT)) {
			if (context.argv.dryRun) {
				context.cli.log(
					`Dry run, would replace "NEXT" with new version number in io-package.json news`,
				);
			} else {
				context.cli.log(`replacing "NEXT" with new version number in io-package.json news`);
				ioPack.common.news = prependKey(
					ioPack.common.news,
					newVersion,
					ioPack.common.news.NEXT,
				);
				delete ioPack.common.news.NEXT;
			}
		} else {
			if (context.argv.dryRun) {
				context.cli.log(`Dry run, would add new news to io-package.json`);
			} else {
				context.cli.log(`adding new news to io-package.json`);
				const newChangelog = cleanChangelogForNews(
					context.getData<string>("changelog_new"),
				);
				try {
					const translated = await translateText(newChangelog);
					ioPack.common.news = prependKey(ioPack.common.news, newVersion, translated);
				} catch (e) {
					context.cli.fatal(`Could not translate the news: ${e}`);
				}
				// If someone left this in here, also delete it
				delete ioPack.common.news.NEXT;
			}
		}
		// Make sure we don't have too many keys
		const maxNews = context.argv.numNews as number;
		if (Object.keys(ioPack.common.news).length > maxNews) {
			ioPack.common.news = limitKeys(ioPack.common.news, maxNews);
		}

		if (!context.argv.dryRun) {
			let ioPackDirectory = context.cwd;
			if (context.argv.ioPackage) {
				ioPackDirectory = path.join(ioPackDirectory, context.argv.ioPackage as string);
			}
			const ioPackPath = path.join(ioPackDirectory, "io-package.json");
			await fs.writeJson(ioPackPath, ioPack, { spaces: 2 });
		}
	}

	async executeStage(context: Context, stage: Stage): Promise<void> {
		if (stage.id === "check") {
			await this.checkIoPackage(context);
			if (!context.argv.noWorkflowCheck) {
				await this.checkWorkflow(context);
			}
		} else if (stage.id === "edit") {
			await this.executeEditStage(context);
		}
	}
}

export default IoBrokerPlugin;
