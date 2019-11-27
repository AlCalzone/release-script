/*

	Bumps the package version and releases a new tag
	to set off a CI and npm release run

	CALL THIS WITH:
	npx AlCalzone/release-script#v1.0.0 -- [<releaseType> [<postfix]] [--dry]
	or
	npx AlCalzone/release-script#v1.0.0 -- <version> [--dry]

	PLACEHOLDER for next version in CHANGELOG.md:
	## __WORK IN PROGRESS__

	PLACEHOLDER for next version in README.md:
	### __WORK IN PROGRESS__

*/

/* eslint-disable @typescript-eslint/no-var-requires */

import { padStart } from "alcalzone-shared/strings";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as semver from "semver";
import { argv } from "yargs";
const colors = require("colors/safe");

const rootDir = process.cwd();

function fail(reason: string): never {
	console.error("");
	console.error(colors.red("ERROR: " + reason));
	console.error("");
	process.exit(1);
}

const packPath = path.join(rootDir, "package.json");
if (!fs.existsSync(packPath)) {
	fail("No package.json found in the current directory!");
}
const pack = require(packPath);

// If this is an ioBroker project, also bump the io-package.json
const ioPackPath = path.join(rootDir, "io-package.json");
const hasIoPack = fs.existsSync(ioPackPath);
const ioPack = hasIoPack ? require(packPath) : undefined;

// Try to find the changelog
let isChangelogInReadme = false;
let CHANGELOG_PLACEHOLDER_PREFIX = "##";
const changelogPath = path.join(rootDir, "CHANGELOG.md");
const readmePath = path.join(rootDir, "README.md");
/** Can also be the readme! */
let changelog: string;
let changelogFilename: string;
if (!fs.existsSync(changelogPath)) {
	// The changelog might be in the readme
	if (!fs.existsSync(readmePath)) {
		fail(
			"No CHANGELOG.md or README.md found in the current directory!",
		);
	}
	isChangelogInReadme = true;
	changelog = fs.readFileSync(readmePath, "utf8");
	changelogFilename = path.basename(readmePath);
	// The changelog is indented one more level in the readme
	CHANGELOG_PLACEHOLDER_PREFIX += "#";
} else {
	changelog = fs.readFileSync(changelogPath, "utf8");
	changelogFilename = path.basename(changelogPath);
}
const CHANGELOG_PLACEHOLDER = CHANGELOG_PLACEHOLDER_PREFIX + " __WORK IN PROGRESS__";
const CHANGELOG_PLACEHOLDER_REGEX = new RegExp(
	"^" + CHANGELOG_PLACEHOLDER + "$",
	"gm",
);

// check if the changelog contains exactly 1 occurence of the changelog placeholder
switch ((changelog.match(CHANGELOG_PLACEHOLDER_REGEX) || []).length) {
	case 0:
		fail(
			colors.red(
				`Cannot continue, the changelog placeholder is missing from ${changelogFilename}!\n` +
					"Please add the following line to your changelog:\n" +
					CHANGELOG_PLACEHOLDER,
			),
		);
	case 1:
		break; // all good
	default:
		fail(
			colors.red(
				`Cannot continue, there is more than one changelog placeholder in ${changelogFilename}!`,
			),
		);
}

// check if there are untracked changes
const gitStatus = execSync("git status", { cwd: rootDir, encoding: "utf8" });
if (/have diverged/.test(gitStatus)) {
	if (!argv.dry) {
		fail(
			colors.red(
				"Cannot continue, the local branch has diverged from the git repo!",
			),
		);
	} else {
		console.log(
			colors.red(
				"This is a dry run. The full run would fail due to a diverged branch\n",
			),
		);
	}
} else if (!/working tree clean/.test(gitStatus)) {
	if (!argv.dry)
		fail(
			colors.red(
				"Cannot continue, the local branch has uncommited changes!",
			),
		);
	else
		console.log(
			colors.red(
				"This is a dry run. The full run would fail due to uncommited changes\n",
			),
		);
} else if (/Your branch is behind/.test(gitStatus)) {
	if (!argv.dry) {
		fail(
			colors.red(
				"Cannot continue, the local branch is behind the remote changes!",
			),
		);
	} else {
		console.log(
			colors.red(
				"This is a dry run. The full run would fail due to the local branch being behind\n",
			),
		);
	}
} else if (
	/Your branch is up\-to\-date/.test(gitStatus) ||
	/Your branch is ahead/.test(gitStatus)
) {
	// all good
	console.log(colors.green("git status is good - I can continue..."));
}

const releaseTypes = [
	"major",
	"premajor",
	"minor",
	"preminor",
	"patch",
	"prepatch",
	"prerelease",
];

const releaseType = argv._[0] || "patch";
let newVersion: string | null = releaseType;
// Find the highest current version
let oldVersion = pack.version as string;
if (
	hasIoPack &&
	semver.valid(ioPack.common.version) &&
	semver.gt(ioPack.common.version, oldVersion)
) {
	oldVersion = ioPack.common.version;
}

if (releaseTypes.indexOf(releaseType) > -1) {
	if (releaseType.startsWith("pre") && argv._.length >= 2) {
		// increment to pre-release with an additional prerelease string
		newVersion = semver.inc(oldVersion, releaseType as any, argv._[1]);
	} else {
		newVersion = semver.inc(oldVersion, releaseType as any);
	}
	console.log(
		`bumping version ${colors.blue(oldVersion)} to ${colors.gray(
			releaseType,
		)} version ${colors.green(newVersion)}\n`,
	);
} else {
	// increment to specific version
	newVersion = semver.clean(newVersion);
	if (newVersion == null) {
		fail(`invalid version string "${newVersion}"`);
	} else {
		// valid version string => check if its actually newer
		if (!semver.gt(newVersion, pack.version)) {
			fail(
				`new version ${newVersion} is NOT > than package.json version ${pack.version}`,
			);
		}
		if (hasIoPack && !semver.gt(newVersion, ioPack.common.version)) {
			fail(
				`new version ${newVersion} is NOT > than io-package.json version ${ioPack.common.version}`,
			);
		}
	}
	console.log(
		`bumping version ${oldVersion} to specific version ${newVersion}`,
	);
}

if (argv.dry) {
	console.log(colors.yellow("dry run:") + " not updating package files");
} else {
	console.log(
		`updating package.json from ${colors.blue(
			pack.version,
		)} to ${colors.green(newVersion)}`,
	);
	pack.version = newVersion;
	fs.writeFileSync(packPath, JSON.stringify(pack, null, 2));

	console.log(`updating CHANGELOG.md`);
	const d = new Date();
	changelog = changelog.replace(
		CHANGELOG_PLACEHOLDER_REGEX,
		`${CHANGELOG_PLACEHOLDER_PREFIX} ${newVersion} (${d.getFullYear()}-${padStart(
			"" + (d.getMonth() + 1),
			2,
			"0",
		)}-${padStart("" + d.getDate(), 2, "0")})`,
	);
	fs.writeFileSync(changelogPath, changelog, "utf8");

	if (hasIoPack) {
		console.log(
			`updating io-package.json from ${colors.blue(
				ioPack.common.version,
			)} to ${colors.green(newVersion)}`,
		);
		ioPack.common.version = newVersion;
		fs.writeFileSync(ioPackPath, JSON.stringify(ioPack, null, 4));
	}
}

const gitCommands = [
	`npm install`,
	`git add -A`,
	`git commit -m "chore: release v${newVersion}"`,
	`git tag v${newVersion}`,
	`git push`,
	`git push --tags`,
];
if (argv.dry) {
	console.log(colors.yellow("dry run:") + " I would execute this:");
	for (const command of gitCommands) {
		console.log("  " + command);
	}
} else {
	for (const command of gitCommands) {
		console.log(`executing "${colors.blue(command)}" ...`);
		execSync(command, { cwd: rootDir });
	}
}

console.log("");
console.log(colors.green("done!"));
console.log("");

process.exit(0);
