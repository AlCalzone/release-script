import { DefaultStages } from "@alcalzone/release-script-core";
import type { Context, Plugin, Stage } from "@alcalzone/release-script-core/types";
import fs from "fs-extra";
import path from "path";
import semver from "semver";

class LernaPlugin implements Plugin {
	public readonly id = "lerna";
	public readonly stages = [DefaultStages.check, DefaultStages.commit];

	public readonly stageBefore = {
		// The package.json plugin needs to know if we're in lerna mode
		check: ["package"],
	};

	public readonly stageAfter = {
		// Lerna amends the commit made by the git plugin
		commit: ["git"],
	};

	private async executeCheckStage(context: Context): Promise<void> {
		// ensure that lerna.json exists and has a version (unless in lerna mode)
		const jsonPath = path.join(context.cwd, "lerna.json");
		if (!(await fs.pathExists(jsonPath))) {
			context.cli.fatal("No lerna.json found in the current directory!");
		}

		const json = await fs.readJson(jsonPath);
		if (!json?.version) {
			context.cli.fatal("Missing property version from lerna.json!");
		} else if (json.version === "independent") {
			context.cli.fatal(`Lerna's independent versioning is not supported!`);
		} else if (!semver.valid(json.version)) {
			context.cli.fatal(`Invalid version "${json.version}" in lerna.json!`);
		}

		// Validate lerna options
		if (json?.command?.version?.amend != undefined) {
			context.cli.warn(
				`The option "amend" in lerna.json is unnecessary and should be removed.`,
			);
		}
		if (json?.command?.version?.push === true) {
			context.cli.warn(
				`The option "push: true" in lerna.json is unnecessary and should be removed.`,
			);
		} else if (json?.command?.version?.push === false) {
			context.cli.error(
				`The option "push: false" in lerna.json prevents the release script from working must be removed.`,
			);
		}

		context.setData("version", json.version);
		context.setData("lerna", true);
		context.cli.log(`lerna.json ok ${context.cli.colors.green("✔")}`);
	}

	private async executeCommitStage(context: Context): Promise<void> {
		const cmd = [
			"lerna",
			["version", context.getData<string>("version_new"), "--amend"],
		] as const;
		if (context.argv.dryRun) {
			context.cli.logCommand(...cmd);
		} else {
			await context.sys.exec(...cmd, { cwd: context.cwd });
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
