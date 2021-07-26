/*

	Bumps the package version and releases a new tag
	to set off a CI and npm release run

	CALL THIS WITH:
	npx AlCalzone/release-script#v1.0.0 -- [<releaseType> [<postfix]] [--dry]
	or
	npx AlCalzone/release-script#v1.0.0 -- <version> [--dry]

	PLACEHOLDER for next version in CHANGELOG.md:
	## **WORK IN PROGRESS**

	PLACEHOLDER for next version in README.md:
	### **WORK IN PROGRESS**

*/

/* eslint-disable @typescript-eslint/no-var-requires */

import { padStart } from "alcalzone-shared/strings";
import { isObject, isArray } from "alcalzone-shared/typeguards";
import { execSync } from "child_process";
import colors from "colors/safe";
import * as fs from "fs";
import * as path from "path";
import * as semver from "semver";
import * as os from "os";
import yargs from "yargs";
import {
	cleanChangelogForNews,
	extractCurrentChangelog,
	insertIntoChangelog,
	limitKeys,
	prependKey,
	splitChangelog,
} from "./tools";
import { translateText } from "./translate";
import { parseArgs } from "./parseArgs";
import { checkGitIdentity, gitStatus } from "./git";
import { getChangedWorkspaces } from "./yarn";

(async () => {
	const rootDir = process.cwd();
	const argv = yargs.parseSync();
	const {
		allChanges,
		isDryRun,
		yarnWorkspace,
		lerna,
		lernaCheck,
		scripts: userScripts,
		remote,
		noWorkflowCheck,
	} = await parseArgs();

	function fail(reason: string): never {
		console.error("");
		console.error(colors.red("ERROR: " + reason));
		console.error("");
		process.exit(1);
	}

	// ensure that package.json exists and has a version (in lerna mode)
	const packPath = path.join(rootDir, "package.json");
	if (!fs.existsSync(packPath)) {
		fail("No package.json found in the current directory!");
	}
	const pack = require(packPath);
	if (!lerna && !pack?.version) {
		fail("Missing property version from package.json!");
	}

	const lernaPath = path.join(rootDir, "lerna.json");
	if (lerna && !fs.existsSync(lernaPath)) {
		fail("No lerna.json found in the current directory!");
	}
	let lernaJson: Record<string, any> | undefined;
	if (lerna) {
		lernaJson = require(lernaPath);
		if (!lernaJson!.version) {
			fail("Missing property version from lerna.json!");
		}
	}

	// Check that git can push
	if (!checkGitIdentity(rootDir)) {
		let message = colors.red(
			(isDryRun
				? "This is a dry run. The full run would fail because "
				: "Cannot continue because ") +
				`no git identity is configured for the current user ${colors.bold(
					colors.blue(os.userInfo().username),
				)}!`,
		);
		message += `\n
Please tell git who you are, either globally using
	${colors.blue(`git config --global user.name "Your Name"
	git config --global user.email "your@e-mail.com"`)}

or only for this folder
	${colors.blue(`git config user.name "Your Name"
	git config user.email "your@e-mail.com"`)}

Note: If the current folder belongs to a different user than ${colors.bold(
			colors.blue(os.userInfo().username),
		)}, you might have to switch to that user first before changing the global config.
`;
		if (isDryRun) console.log(message);
		else fail(message);
	}

	// ensure that the release workflow does not check for base_ref
	// This is pretty specific to ioBroker's release workflow, but better than silently failing
	const workflowPath = path.join(
		rootDir,
		".github/workflows/test-and-release.yml",
	);
	if (!noWorkflowCheck && fs.existsSync(workflowPath)) {
		let content = fs.readFileSync(workflowPath, "utf8");
		// Find deploy step, crudely by string manipulation. TODO: This should be done with a yaml parser
		while (true) {
			let match = /^[ \t]+deploy:/gm.exec(content);
			if (!match) break;
			content = content.substr(match.index);

			match = /^[ \t]+if: |/gm.exec(content);
			if (!match) break;
			content = content.substr(match.index);

			match = /^[ \t]+github\.event\.base_ref ==/gm.exec(content);
			if (!match) break;

			let line = content.substr(match.index);
			line = line.substr(0, line.indexOf("\n"));

			fail(`The ${colors.bold("deploy")} job in ${colors.bold(
				`.github/workflows/test-and-release.yml`,
			)} potentially has an error, which can cause your deploy to fail.
Remove this line to fix it:
${colors.inverse(line)}

You can suppress this check with the ${colors.bold(
				"--no-workflow-check",
			)} flag.`);
		}
	}

	// If this is an ioBroker project, also bump the io-package.json
	const ioPackPath = path.join(rootDir, "io-package.json");
	const hasIoPack = fs.existsSync(ioPackPath);
	const ioPack = hasIoPack ? require(ioPackPath) : undefined;
	if (!lerna && hasIoPack && !ioPack?.common?.version) {
		fail("Missing property common.version from io-package.json!");
	}

	// Assume the repo is managed with yarn if there is a yarn.lock
	const isYarn = fs.existsSync(path.join(rootDir, "yarn.lock"));

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
	// CHANGELOG_OLD is only used if the main changelog is in the readme
	const changelogOldPath = path.join(rootDir, "CHANGELOG_OLD.md");
	const hasChangelogOld =
		isChangelogInReadme && fs.existsSync(changelogOldPath);

	const CHANGELOG_MARKERS = [
		"**WORK IN PROGRESS**",
		"__WORK IN PROGRESS__",
	] as const;
	const CHANGELOG_PLACEHOLDER = `${CHANGELOG_PLACEHOLDER_PREFIX} ${CHANGELOG_MARKERS[0]}`;
	// The regex for the placeholder includes an optional free text at the end, e.g.
	// ### __WORK IN PROGRESS__ "2020 Doomsday release"
	const CHANGELOG_PLACEHOLDER_REGEX = new RegExp(
		`^${CHANGELOG_PLACEHOLDER_PREFIX} (?:${CHANGELOG_MARKERS.map((m) =>
			m.replace(/\*/g, "\\*"),
		).join("|")})(.*?)$`,
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

	// Check if there is a changelog for the current version
	const currentChangelog = extractCurrentChangelog(
		changelog,
		CHANGELOG_PLACEHOLDER_PREFIX,
		CHANGELOG_PLACEHOLDER_REGEX,
	);
	if (!currentChangelog) {
		fail(
			colors.red(
				"Cannot continue, the changelog for the next version is empty!",
			),
		);
	}

	// check if there are untracked changes
	const branchStatus = gitStatus(rootDir, remote);
	if (branchStatus === "diverged") {
		if (!isDryRun) {
			fail(
				colors.red(
					"Cannot continue, both the remote and the local repo have different changes! Please merge the remote changes first.",
				),
			);
		} else {
			console.log(
				colors.red(
					"This is a dry run. The full run would fail due to a diverged branch\n",
				),
			);
		}
	} else if (branchStatus === "behind") {
		if (!isDryRun) {
			fail(
				colors.red(
					`Cannot continue, the local branch is behind the remote changes! Please include them first, e.g. with "git pull".`,
				),
			);
		} else {
			console.log(
				colors.red(
					"This is a dry run. The full run would fail due to the local branch being behind\n",
				),
			);
		}
	} else if (branchStatus === "ahead" || branchStatus === "up-to-date") {
		// all good
		if (!lerna) {
			console.log(colors.green("git status is good - I can continue..."));
		}
	} else if (branchStatus === "uncommitted" && !lerna) {
		if (!isDryRun && !allChanges) {
			fail(
				colors.red(
					`Cannot continue, the local branch has uncommitted changes! Add them to a separate commit first or add the "--all" option to include them in the release commit.`,
				),
			);
		} else {
			if (allChanges) {
				console.warn(
					colors.yellow(
						`Your branch has uncommitted changes that will be included in the release commit!
Consider adding them to a separate commit first.
`,
					),
				);
			} else {
				console.log(
					colors.red(
						`This is a dry run. The full run would fail due to uncommitted changes.
Add them to a separate commit first or add the "--all" option to include them in the release commit.
`,
					),
				);
			}
		}
	}

	// All the necessary checks are done, exit
	if (lernaCheck) process.exit(0);

	const releaseTypes = [
		"major",
		"premajor",
		"minor",
		"preminor",
		"patch",
		"prepatch",
		"prerelease",
	];

	const releaseType = (argv._[0] || "patch").toString();
	if (!lerna && releaseType.startsWith("--")) {
		fail(
			`Invalid release type ${releaseType}. If you meant to pass hyphenated args, try again without the single "--".`,
		);
	}
	let newVersion: string | null;
	if (lerna) {
		newVersion = lernaJson!.version;
	} else {
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
				newVersion = semver.inc(
					oldVersion,
					releaseType as any,
					argv._[1]?.toString(),
				)!;
			} else {
				newVersion = semver.inc(oldVersion, releaseType as any)!;
			}
			console.log(
				`bumping version ${colors.blue(oldVersion)} to ${colors.gray(
					releaseType,
				)} version ${colors.green(newVersion)}\n`,
			);
		} else {
			// increment to specific version
			newVersion = semver.clean(releaseType);
			if (newVersion == null) {
				fail(`invalid version string "${newVersion}"`);
			} else {
				// valid version string => check if its actually newer
				if (!semver.gt(newVersion, pack.version)) {
					fail(
						`new version ${newVersion} is NOT > than package.json version ${pack.version}`,
					);
				}
				if (
					hasIoPack &&
					!semver.gt(newVersion, ioPack.common.version)
				) {
					fail(
						`new version ${newVersion} is NOT > than io-package.json version ${ioPack.common.version}`,
					);
				}
			}
			console.log(
				`bumping version ${oldVersion} to specific version ${newVersion}`,
			);
		}
	}

	if (isDryRun) {
		console.log(colors.yellow("dry run:") + " not updating package files");
	} else {
		if (!lerna && !yarnWorkspace) {
			console.log(
				`updating package.json from ${colors.blue(
					pack.version,
				)} to ${colors.green(newVersion!)}`,
			);
			pack.version = newVersion;
			fs.writeFileSync(packPath, JSON.stringify(pack, null, 2));
		}

		const d = new Date();
		// Replace the changelog placeholder and keep the free text
		changelog = changelog.replace(
			CHANGELOG_PLACEHOLDER_REGEX,
			`${CHANGELOG_PLACEHOLDER_PREFIX} ${newVersion} (${d.getFullYear()}-${padStart(
				"" + (d.getMonth() + 1),
				2,
				"0",
			)}-${padStart("" + d.getDate(), 2, "0")})$1`,
		);

		// If there's a CHANGELOG_OLD.md, we need to split the changelog
		if (hasChangelogOld) {
			const { newChangelog, oldChangelog } = splitChangelog(
				changelog,
				CHANGELOG_PLACEHOLDER_PREFIX,
				5,
			);

			console.log(`updating ${changelogFilename}`);
			fs.writeFileSync(
				isChangelogInReadme ? readmePath : changelogPath,
				newChangelog,
				"utf8",
			);

			if (oldChangelog) {
				console.log(`moving old changelog entries to CHANGELOG_OLD.md`);
				let oldChangelogFileContent = fs.readFileSync(
					changelogOldPath,
					"utf8",
				);
				oldChangelogFileContent = insertIntoChangelog(
					oldChangelogFileContent,
					oldChangelog,
					CHANGELOG_PLACEHOLDER_PREFIX.slice(1),
				);
				fs.writeFileSync(
					changelogOldPath,
					oldChangelogFileContent,
					"utf8",
				);
			}
		} else {
			console.log(`updating ${changelogFilename}`);
			fs.writeFileSync(
				isChangelogInReadme ? readmePath : changelogPath,
				changelog,
				"utf8",
			);
		}

		// Prepare the changelog so it can be put into io-package.json news and the commit message
		const newChangelog = cleanChangelogForNews(currentChangelog);

		// Prepare the commit message
		fs.writeFileSync(
			path.join(rootDir, ".commitmessage"),
			`chore: release v${newVersion}

${newChangelog}`,
		);

		if (hasIoPack) {
			console.log(
				`updating io-package.json from ${colors.blue(
					ioPack.common.version,
				)} to ${colors.green(newVersion!)}`,
			);
			ioPack.common.version = newVersion;

			if (newVersion! in ioPack.common.news) {
				console.log(`current news is already in io-package.json`);
			} else if (isObject(ioPack.common.news.NEXT)) {
				console.log(
					`replacing version number for current news io-package.json...`,
				);
				ioPack.common.news = prependKey(
					ioPack.common.news,
					newVersion!,
					ioPack.common.news.NEXT,
				);
				delete ioPack.common.news.NEXT;
			} else {
				console.log(`adding new news to io-package.json...`);
				try {
					const translated = await translateText(newChangelog);
					ioPack.common.news = prependKey(
						ioPack.common.news,
						newVersion!,
						translated,
					);
				} catch (e) {
					fail(`could not translate the news: ${e}`);
				}
				// If someone left this in here, also delete it
				delete ioPack.common.news.NEXT;
			}
			// Make sure we don't have too many keys
			if (Object.keys(ioPack.common.news).length > 20) {
				ioPack.common.news = limitKeys(ioPack.common.news, 20);
			}
			fs.writeFileSync(ioPackPath, JSON.stringify(ioPack, null, 4));
		}
	}

	let changedWorkspaces: string[] = [];
	if (yarnWorkspace) {
		changedWorkspaces = await getChangedWorkspaces();
		if (!changedWorkspaces.length) {
			fail("No changed workspaces detected!");
		}
	}

	const execQueue = (
		lerna
			? [
					`git add -A -- ":(exclude).commitmessage"`,
					`git commit -F ".commitmessage" --no-verify`,
					// lerna does the rest for us
			  ]
			: [
					...(yarnWorkspace
						? [
								...changedWorkspaces.map(
									(ws) =>
										`yarn workspace ${ws} version ${newVersion} --deferred`,
								),
								`yarn version apply --all`,
						  ]
						: []),
					isYarn ? `yarn install` : `npm install`,
					`git add -A -- ":(exclude).commitmessage"`,
					`git commit -F ".commitmessage"`,
					`git tag -a v${newVersion} -m "v${newVersion}"`,
					`git push${
						remote ? ` ${remote.split("/").join(" ")}` : ""
					}`,
					`git push${
						remote ? ` ${remote.split("/").join(" ")}` : ""
					} --tags`,
			  ]
	).filter((cmd): cmd is string => !!cmd);

	// Execute user scripts before pushing
	if (typeof userScripts.beforePush === "string") {
		execQueue.unshift(userScripts.beforePush);
	} else if (isArray(userScripts.beforePush)) {
		execQueue.unshift(...userScripts.beforePush);
	}

	if (isDryRun) {
		console.log(colors.yellow("dry run:") + " I would execute this:");
		for (const command of execQueue) {
			console.log("  " + command);
		}
	} else {
		for (const command of execQueue) {
			console.log(`executing "${colors.blue(command)}" ...`);
			execSync(command, { cwd: rootDir });
		}

		// Delete the commit message file again
		try {
			fs.unlinkSync(path.join(rootDir, ".commitmessage"));
		} catch (e) {
			/* ignore */
		}
	}

	console.log("");
	console.log(colors.green("done!"));
	console.log("");

	process.exit(0);
})().catch((e) => {
	console.error(e);
	process.exit(1);
});
