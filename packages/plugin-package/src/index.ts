import { DefaultStages } from "@alcalzone/release-script-core";
import type { Context, Plugin, Stage } from "@alcalzone/release-script-core/types";
import fs from "fs-extra";
import path from "path";
import semver from "semver";

class PackagePlugin implements Plugin {
	public readonly id = "package";
	public readonly stages = [DefaultStages.check, DefaultStages.edit];

	// dependencies?: string[] | undefined;
	// stageDependencies?: Record<string, ConstOrDynamic<string[]>> | undefined;

	private async executeCheckStage(context: Context): Promise<void> {
		// ensure that package.json exists and has a version (unless in lerna mode)
		const packPath = path.join(context.cwd, "package.json");
		if (!(await fs.pathExists(packPath))) {
			context.cli.fatal("No package.json found in the current directory!");
		}

		const pack = await fs.readJson(packPath);
		const lerna = context.hasData("lerna") && !!context.getData("lerna");
		if (!pack?.version) {
			if (!lerna) context.cli.fatal("Missing property version from package.json!");
		} else if (!semver.valid(pack.version)) {
			context.cli.fatal(`Invalid version "${pack.version}" in package.json!`);
		}

		// Remember package.json contents
		context.setData("package.json", pack);
	}

	private async executeEditStage(context: Context): Promise<void> {
		const newVersion = context.getData<string>("version_new");
		const pack = context.getData<any>("package.json");

		context.cli.log(
			`updating package.json version from ${context.cli.colors.blue(
				pack.version,
			)} to ${context.cli.colors.green(newVersion!)}`,
		);

		if (!context.argv.dryRun) {
			pack.version = newVersion;
			const packPath = path.join(context.cwd, "package.json");
			await fs.writeJson(packPath, pack, { spaces: 2 });
		}
	}

	async executeStage(context: Context, stage: Stage): Promise<void> {
		if (stage.id === "check") {
			await this.executeCheckStage(context);
		} else if (stage.id === "edit") {
			// In lerna mode, we don't need to edit package.json
			const lerna = context.hasData("lerna") && !!context.getData("lerna");
			if (lerna) return;
			await this.executeEditStage(context);
		}
	}
}

export default PackagePlugin;
