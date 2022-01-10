import { detectPackageManager } from "@alcalzone/pak";
import { DefaultStages } from "@alcalzone/release-script-core";
import type { Context, Plugin, Stage } from "@alcalzone/release-script-core/types";
import { isArray, isObject } from "alcalzone-shared/typeguards";
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

		// Check if the current project is a monorepo
		const isMonorepo =
			"workspaces" in pack && isArray(pack.workspaces) && pack.workspaces.length > 0;
		const lerna = context.hasData("lerna") && !!context.getData("lerna");
		if (isMonorepo) {
			if (lerna) {
				// ok, continue
			} else {
				// we need some yarn plugins to be able to handle this
				const yarnRcPath = path.join(context.cwd, ".yarnrc.yml");
				if (await fs.pathExists(yarnRcPath)) {
					const yarnRc = await fs.readFile(yarnRcPath, "utf8");
					const yarnPlugins = yarnRc
						.split("\n")
						.map((line) => line.trim())
						.filter((line) => !!line && !line.startsWith("#"))
						.filter((line) => line.includes("path: "))
						.map((line) => line.substring(line.indexOf("@yarnpkg/")));
					// A list of required plugins and how to import them
					const requiredPlugins: Record<string, string> = {
						"workspace-tools": "workspace-tools",
						version: "version",
						changed:
							"https://github.com/Dcard/yarn-plugins/releases/download/latest/plugin-changed.js",
					};
					const missingPlugins = Object.keys(requiredPlugins).filter(
						(plugin) => !yarnPlugins.includes(plugin),
					);
					if (missingPlugins.length > 0) {
						context.cli.fatal(
							`The current project is a monorepo, which seems to be managed with yarn. The release script requires you to install additional yarn plugins to be able to handle this:
${context.cli.colors.blue(
	missingPlugins.map((plugin) => `\nyarn plugin import ${requiredPlugins[plugin]}`).join(""),
)}

Alternatively, you can use ${context.cli.colors.blue("lerna")} to manage the monorepo.`,
						);
					}

					// All good, remember that we use yarn to manage the monorepo
					context.setData("monorepo", "yarn");
				} else {
					context.cli.fatal(
						`The current project is a monorepo. The release script requires either lerna or the yarn package manager to handle this!`,
					);
				}
			}
		}

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

	private async executeEditStageYarnMonorepo(context: Context): Promise<void> {
		const newVersion = context.getData<string>("version_new");
		const pack = context.getData<any>("package.json");

		// Figure out which packages changed
		const { stdout: output } = await context.sys.exec(
			"yarn",
			["changed", "list", "--json", `--gitRange=${pack.version}`],
			{ cwd: context.cwd },
		);
		// The returned info contains the monorepo root
		const changedPackages: string[] = output
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line))
			.filter((info) => info.location !== ".")
			.map((info) => info.name);

		if (context.argv.dryRun) {
			context.cli.log(
				`Dry run, would update monorepo version from ${context.cli.colors.blue(
					pack.version,
				)} to ${context.cli.colors.green(
					newVersion!,
				)}. The following packages would be updated:${context.cli.colors.blue(
					changedPackages.map((info) => `\n· ${info}`).join(""),
				)}`,
			);
		} else {
			context.cli.log(
				`updating package.json version from ${context.cli.colors.blue(
					pack.version,
				)} to ${context.cli.colors.green(
					newVersion!,
				)}. The following packages will be updated:${context.cli.colors.blue(
					changedPackages.map((info) => `\n· ${info}`).join(""),
				)}`,
			);

			const commands = [
				[
					"yarn",
					"changed",
					"foreach",
					`--git-range=${pack.version}`,
					"version",
					newVersion,
					"--deferred",
				],
				["yarn", "version", "apply", "--all"],
			];
			for (const [cmd, ...args] of commands) {
				context.cli.logCommand(cmd, args);
				await context.sys.exec(cmd, args, { cwd: context.cwd });
			}
		}
	}

	async executeStage(context: Context, stage: Stage): Promise<void> {
		if (stage.id === "check") {
			await this.executeCheckStage(context);
		} else if (stage.id === "edit") {
			// In lerna mode, we don't need to edit package.json
			const lerna = context.hasData("lerna") && !!context.getData("lerna");
			if (lerna) return;
			if (context.hasData("monorepo") && context.getData("monorepo") === "yarn") {
				await this.executeEditStageYarnMonorepo(context);
			} else {
				await this.executeEditStage(context);
			}
		} else if (stage.id === "commit") {
			if (context.hasData("monorepo") && context.getData("monorepo") === "yarn") {
				// Not necessary, when using yarn workspaces this was done during the edit stage
				return;
			}

			if (context.argv.updateLockfile) {
				context.cli.log(`updating lockfile...`);
				const pak = await detectPackageManager({
					cwd: context.cwd,
					setCwdToPackageRoot: true,
					requireLockfile: false,
				});
				// npm7+ deletes devDependencies unless we set this flag
				pak.environment = "development";
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
