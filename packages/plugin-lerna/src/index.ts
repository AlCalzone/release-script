import { DefaultStages, pathExists, readJson } from "@alcalzone/release-script-core";
import type { Context, Plugin, Stage } from "@alcalzone/release-script-core/types";
import path from "path";
import semver from "semver";

class LernaPlugin implements Plugin {
	public readonly id = "lerna";
	public readonly stages = [DefaultStages.check, DefaultStages.commit];

	public readonly stageBefore = {
		// The package.json plugin needs to know if we're in lerna mode
		check: ["package"],
		// The git plugin amends the commit made by lerna
		commit: ["git"],
	};

	private async executeCheckStage(context: Context): Promise<void> {
		// ensure that lerna.json exists and has a version (unless in lerna mode)
		const jsonPath = path.join(context.cwd, "lerna.json");
		if (!(await pathExists(jsonPath))) {
			context.cli.fatal("No lerna.json found in the current directory!");
		}

		const json = await readJson(jsonPath);
		if (!json?.version) {
			context.cli.fatal("Missing property version from lerna.json!");
		} else if (json.version === "independent") {
			context.cli.fatal(`Lerna's independent versioning is not supported!`);
		} else if (!semver.valid(json.version)) {
			context.cli.fatal(`Invalid version "${json.version}" in lerna.json!`);
		}

		// Validate lerna options
		if (json?.command?.version?.amend != undefined) {
			context.cli.error(`The option "amend" in lerna.json must be removed.`);
		}
		if (json?.command?.version?.push != undefined) {
			context.cli.warn(
				`The option "push" in lerna.json is unnecessary and should be removed.`,
			);
		}

		context.setData("version", json.version);
		context.setData("lerna", true);
		context.cli.log(`lerna.json ok ${context.cli.colors.green("✔")}`);
	}

	private async executeCommitStage(context: Context): Promise<void> {
		// We need to stash the changelog changes or lerna won't let us version
		const commands = [
			["git", "stash"],
			[
				"lerna",
				"version",
				context.getData<string>("version_new"),
				"--no-push",
				"--no-git-tag-version",
				...(context.argv.publishAll ? ["--force-publish"] : []),
				"--yes",
			],
			["git", "stash", "pop"],
		];

		context.cli.log("Bumping monorepo versions");
		for (const [cmd, ...args] of commands) {
			if (!context.argv.dryRun) {
				await context.sys.exec(cmd, args, { cwd: context.cwd });
			}
		}
	}

	async executeStage(context: Context, stage: Stage): Promise<void> {
		if (stage.id === "check") {
			await this.executeCheckStage(context);
		} else if (stage.id === "commit") {
			await this.executeCommitStage(context);
		}
	}
}

export default LernaPlugin;
