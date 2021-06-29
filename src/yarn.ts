import { isArray } from "alcalzone-shared/typeguards";
import execa from "execa";
import fs from "fs-extra";
import path from "path";
import semver from "semver";

/**
 * Tests if the current workspace is using yarn with the version and workspace-tools plugin,
 * which can be used to bump the versions
 */
export async function isYarnWorkspace(): Promise<boolean> {
	// There should be a yarn.lock or yarn is not used
	if (!(await fs.pathExists(path.join(process.cwd(), "yarn.lock")))) {
		return false;
	}

	// package.json should contain a workspaces field
	const packageJson = await fs.readJSON(
		path.join(process.cwd(), "package.json"),
		{ encoding: "utf8" },
	);
	if (!("workspaces" in packageJson && isArray(packageJson.workspaces))) {
		return false;
	}

	// Check if yarn is used in at least version 2
	const { stdout: yarnVersion } = await execa("yarn", ["-v"], {
		reject: false,
	});
	if (!semver.valid(yarnVersion) || semver.lt(yarnVersion, "2.0.0")) {
		return false;
	}

	// Check that the version plugin is there
	const { stdout: plugins } = await execa(
		"yarn",
		["plugin", "runtime", "--json"],
		{
			reject: false,
		},
	);
	return (
		plugins.includes(`"@yarnpkg/plugin-version"`) &&
		plugins.includes(`"@yarnpkg/plugin-workspace-tools"`)
	);
}

export async function getChangedWorkspaces(): Promise<string[]> {
	const { stdout: checkResult } = await execa("yarn", ["version", "check"], {
		reject: false,
	});

	const matches = [
		...checkResult.matchAll(
			/ (?<workspace>@?[^ ]*?)@.+ has been modified but/g,
		),
	].map((match) => match.groups!.workspace!);
	return matches;
}

export async function bump(workspace: string, type: string): Promise<void> {
	await execa("yarn", ["workspace", workspace, "version", type]);
}
