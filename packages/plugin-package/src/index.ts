import { detectPackageManager } from "@alcalzone/pak";
import { DefaultStages } from "@alcalzone/release-script-core";
import type { Context, Plugin, Stage } from "@alcalzone/release-script-core/types";
import { isObject } from "alcalzone-shared/typeguards";
import fs from "fs-extra";
import path from "path";
import semver from "semver";
import type { Argv } from "yargs";

class PackagePlugin implements Plugin {
	public readonly id = "package";
	public readonly stages = [DefaultStages.check, DefaultStages.edit, DefaultStages.commit];

	public defineCLIOptions(yargs: Argv<any>): Argv<any> {
		return yargs.options({
			updateLockfile: {
				alias: ["update-lockfile", "l"],
				description: "Update the lockfile before committing",
				type: "boolean",
				default: true,
			},
		});
	}

	// The lockfile needs to be synchronized after bumping, but before the final commit
	public readonly stageBefore = {
		commit: ["git"],
	};
	public readonly stageAfter = {
		commit: (context: Context): string[] => {
			// In lerna mode, we need to update the lockfile after bumping, so we do that in non-lerna mode too.
			const lerna = context.hasData("lerna") && !!context.getData("lerna");
			if (lerna) return ["lerna"];
			return [];
		},
	};

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
		} else {
			context.setData("version", pack.version);
		}

		// When in lerna mode, validate some legacy scripts
		let hasErrors = false;
		if (lerna && isObject(pack.scripts)) {
			for (const [scriptName, script] of Object.entries<string>(pack.scripts)) {
				if (script.includes("lerna version")) {
					context.cli.error(
						`package.json script "${scriptName}" calls "lerna version". This script must be removed!`,
					);
					hasErrors = true;
				} else if (script.includes("release-script --lerna-check")) {
					context.cli.error(
						`package.json script "${scriptName}" calls "release-script --lerna-check". This script must be removed!`,
					);
					hasErrors = true;
				} else if (script.includes("release-script --lerna")) {
					context.cli.error(
						`package.json script "${scriptName}" calls "release-script --lerna-check". This script must be removed!`,
					);
					hasErrors = true;
				} else if (scriptName === "postversion" && script.includes("git push")) {
					context.cli.error(
						`package.json script "${scriptName}" calls "git push". Pushing is handled by the release script. The script must be removed or changed!`,
					);
					hasErrors = true;
				}
			}
		}

		if (!hasErrors) context.cli.log(`package.json ok ${context.cli.colors.green("✔")}`);

		// Remember package.json contents
		context.setData("package.json", pack);
	}

	private async executeEditStage(context: Context): Promise<void> {
		const newVersion = context.getData<string>("version_new");
		const pack = context.getData<any>("package.json");

		if (context.argv.dryRun) {
			context.cli.log(
				`Dry run, would update package.json version from ${context.cli.colors.blue(
					pack.version,
				)} to ${context.cli.colors.green(newVersion!)}`,
			);
		} else {
			context.cli.log(
				`updating package.json version from ${context.cli.colors.blue(
					pack.version,
				)} to ${context.cli.colors.green(newVersion!)}`,
			);

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
		} else if (stage.id === "commit") {
			if (context.argv.updateLockfile) {
				context.cli.log(`updating lockfile...`);
				const pak = await detectPackageManager({
					cwd: context.cwd,
					setCwdToPackageRoot: true,
					requireLockfile: false,
				});
				if (!context.argv.dryRun) {
					const result = await pak.install();
					if (!result.success) {
						context.cli.error(`Updating lockfile failed: ${result.stderr}`);
					}
				}
			}
		}
	}
}

export default PackagePlugin;
