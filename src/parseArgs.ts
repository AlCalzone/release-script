import yargs from "yargs";
import * as fs from "fs";
import * as path from "path";

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
const scripts: {[K in string]?: string | string[]} = rcFile?.scripts ?? {};

// lerna mode offloads bumping the versions to lerna.
// it implies --all, since that is what lerna does
const lernaCheck: boolean =
	argv.lernaCheck as any ??
	argv["lerna-check"] ??
	argv._.includes("--lerna-check");
const lerna: boolean =
	lernaCheck || (rcFile?.lerna ?? argv.lerna ?? argv._.includes("--lerna"));

// remote repo, can be set by remote flag - else we let it be falsy
const remote: string = argv.r as any;

// in lerna mode, these have no effect
const isDryRun: boolean = (argv.dry as any) ?? argv._.includes("--dry");
const allChanges: boolean = rcFile?.all ?? argv.all ?? argv._.includes("--all");

export { lernaCheck, lerna, isDryRun, allChanges, scripts, remote };
