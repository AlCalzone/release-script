import { detectPackageManager } from "@alcalzone/pak";
import { DefaultStages } from "@alcalzone/release-script-core";
import type { Context, Plugin, Stage } from "@alcalzone/release-script-core/types";
import { isArray, isObject } from "alcalzone-shared/typeguards";
import fs from "fs-extra";
import path from "path";
import semver from "semver";
import type { Argv } from "yargs";

function getEffectivePublishAllFlag(context: Context): boolean {
	const oldVersion = context.getData<string>("version");
	const newVersion = context.getData<string>("version_new");

	// Force a publish of all packages if the version changed from a prerelease to a stable version
	let publishAll = context.argv.publishAll as boolean;
	if (
		!publishAll &&
		semver.gt(newVersion, oldVersion) &&
		semver.parse(newVersion)?.prerelease.length === 0 &&
		(semver.parse(oldVersion)?.prerelease.length ?? 0) > 0
	) {
		publishAll = true;
	}
	return publishAll;
}

async function getUpdatePackages(
	context: Context,
	publishAll: boolean,
	oldVersion: string,
): Promise<{ name: string; location: string }[]> {
	const { stdout: output } = await context.sys.exec(
		"yarn",
		publishAll
			? ["workspaces", "list", "--json"]
			: ["changed", "list", "--json", `--git-range=v${oldVersion}`],
		{ cwd: context.cwd },
	);
	const updatePackages = output
		.trim()
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => JSON.parse(line));

	return updatePackages;
}

async function getYarnVersion(context: Context): Promise<string> {
	const { stdout: output } = await context.sys.exec("yarn", ["--version"], { cwd: context.cwd });
	const version = output.trim();
	if (!semver.valid(version)) {
		context.cli.fatal(`Invalid yarn version "${version}"`);
	}
	return version;
}

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
			forceUpdateLockfile: {
				alias: ["force-update-lockfile", "lf"],
				description: "Update the lockfile before committing, using the --force flag",
				type: "boolean",
				default: false,
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
					const yarnVersion = await getYarnVersion(context);

					const yarnRc = await fs.readFile(yarnRcPath, "utf8");
					const yarnPlugins = yarnRc
						.split("\n")
						.map((line) => line.trim())
						.filter((line) => !!line && !line.startsWith("#"))
						.filter((line) => line.includes("path: "))
						.map((line) =>
							line
								.substring(line.indexOf("@yarnpkg/"))
								.replace(/^@yarnpkg\/plugin-/, "")
								.replace(/\.cjs$/, ""),
						);
					// A list of required plugins and how to import them
					const requiredPlugins: Record<string, string> = {
						changed:
							"https://github.com/Dcard/yarn-plugins/releases/latest/download/plugin-changed.js",
					};
					if (semver.lt(yarnVersion, "4.0.0")) {
						// Yarn v4 includes these plugins by default
						Object.assign(requiredPlugins, {
							"workspace-tools": "workspace-tools",
							version: "version",
						});
					}
					const missingPlugins = Object.keys(requiredPlugins).filter(
						(plugin) => !yarnPlugins.includes(plugin),
					);

					// context.cli.log(`Installed yarn plugins: ${yarnPlugins.join(", ")}`);
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
					context.setData("yarn_version", yarnVersion);

					// One last check: make sure there is anything to publish
					// We cannot use getEffectivePublishAllFlag here without introducing a circular dependency
					const publishAll = context.argv.publishAll as boolean;
					const updatePackages = await getUpdatePackages(
						context,
						publishAll,
						pack.version,
					);
					if (!updatePackages.length) {
						context.cli.fatal(
							`The current project is a monorepo, but no packages were changed! To force a release anyways, use the "--publishAll" flag!`,
						);
					}
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

		// Force a publish of all packages if the version changed from a prerelease to a stable version
		const publishAll = getEffectivePublishAllFlag(context);

		// Figure out which packages changed (or which ones exist if all should be published)
		const updatePackages = await getUpdatePackages(context, publishAll, pack.version);

		// Work around https://github.com/yarnpkg/berry/issues/3868
		const packageJsonFiles = updatePackages.map((info) =>
			path.join(context.cwd, info.location, "package.json"),
		);
		const deleteStableVersions = async (): Promise<void> => {
			for (const packPath of packageJsonFiles) {
				try {
					const pack = await fs.readJSON(packPath);
					delete pack.stableVersion;
					await fs.writeJSON(packPath, pack, { spaces: 2 });
				} catch {
					// ignore
				}
			}
		};

		if (context.argv.dryRun) {
			context.cli.log(
				`Dry run, would update monorepo version from ${context.cli.colors.blue(
					pack.version,
				)} to ${context.cli.colors.green(
					newVersion!,
				)}. The following packages would be updated:${context.cli.colors.blue(
					updatePackages
						.filter((info) => info.location !== ".")
						.map((info) => `\n· ${info.name}`)
						.join(""),
				)}`,
			);
		} else {
			context.cli.log(
				`updating monorepo version from ${context.cli.colors.blue(
					pack.version,
				)} to ${context.cli.colors.green(
					newVersion!,
				)}. The following packages will be updated:${context.cli.colors.blue(
					updatePackages
						.filter((info) => info.location !== ".")
						.map((info) => `\n· ${info.name}`)
						.join(""),
				)}`,
			);

			await deleteStableVersions();
			const commands = [
				publishAll
					? [
							"yarn",
							"workspaces",
							"foreach",
							"--all",
							"version",
							newVersion,
							"--deferred",
					  ]
					: [
							"yarn",
							"changed",
							"foreach",
							"--all",
							`--git-range=v${pack.version}`,
							"version",
							newVersion,
							"--deferred",
					  ],
				["yarn", "version", newVersion, "--deferred"],
				["yarn", "version", "apply", "--all"],
			];
			for (const [cmd, ...args] of commands) {
				context.cli.logCommand(cmd, args);
				await context.sys.exec(cmd, args, { cwd: context.cwd });
			}
			await deleteStableVersions();
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
				// Not necessary, when using yarn workspaces, this was done during the edit stage
				return;
			}

			if (context.argv.updateLockfile || context.argv.forceUpdateLockfile) {
				context.cli.log(
					`updating lockfile...${
						context.argv.forceUpdateLockfile ? " (with --force)" : ""
					}`,
				);
				const pak = await detectPackageManager({
					cwd: context.cwd,
					setCwdToPackageRoot: true,
					requireLockfile: false,
				});
				// npm7+ deletes devDependencies unless we set this flag
				pak.environment = "development";
				if (!context.argv.dryRun) {
					const result = await pak.install(undefined, {
						ignoreScripts: true,
						force: !!context.argv.forceUpdateLockfile,
					});
					if (!result.success) {
						context.cli.error(`Updating lockfile failed: ${result.stderr}`);
					}
				}
			}
		}
	}
}

export default PackagePlugin;
