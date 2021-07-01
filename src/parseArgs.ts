import yargs from "yargs";
import * as fs from "fs";
import * as path from "path";
import { isYarnWorkspace } from "./yarn";

export async function parseArgs() {
	// Try to read the CLI args from an RC file
	let rcFile: Record<string, any> | undefined;
	const argv = yargs.parseSync();
	const rcFileName: string = (argv.c as any) ?? ".releaseconfig.json";
	const rcFilePath = path.isAbsolute(rcFileName)
		? rcFileName
		: path.join(process.cwd(), rcFileName);
	if (fs.existsSync(rcFilePath)) {
		try {
			rcFile = require(rcFilePath);
		} catch {}
	}

	// Scripts can only provided through an RC file
	const scripts: { [K in string]?: string | string[] } =
		rcFile?.scripts ?? {};

	// remote repo, can be set by remote flag - else we let it be falsy
	const remote: string | undefined = argv.r as any;

	// yarn workspace with plugins is auto-detected
	const yarnWorkspace = await isYarnWorkspace();

	// lerna mode offloads bumping the versions to lerna.
	// it implies --all, since that is what lerna does
	// yarn workspaces implies NO lerna
	const lernaCheck: boolean = yarnWorkspace
		? false
		: (argv.lernaCheck as any) ??
		  argv["lerna-check"] ??
		  argv._.includes("--lerna-check");
	const lerna: boolean = yarnWorkspace
		? false
		: lernaCheck ||
		  (rcFile?.lerna ?? argv.lerna ?? argv._.includes("--lerna"));

	// in lerna mode, these have no effect
	const isDryRun: boolean = (argv.dry as any) ?? argv._.includes("--dry");
	const allChanges: boolean =
		rcFile?.all ?? argv.all ?? argv._.includes("--all");

	// Don't check workflow file
	const noWorkflowCheck: boolean = rcFile?.noWorkflowCheck ?? argv.noWorkflowCheck ?? argv._.includes("--no-workflow-check");

	return {
		lernaCheck,
		lerna,
		yarnWorkspace,
		isDryRun,
		allChanges,
		scripts,
		remote,
		noWorkflowCheck,
	};
}
