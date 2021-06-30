import { execSync, ExecOptions } from "child_process";

type GitStatus = "diverged" | "uncommitted" | "behind" | "ahead" | "up-to-date";

function getExecOptions(cwd: string): ExecOptions & { encoding: "utf8" } {
	return { cwd, encoding: "utf8" };
}

function getUpstream(cwd: string): string {
	return execSync(
		"git rev-parse --abbrev-ref --symbolic-full-name @{u}",
		getExecOptions(cwd),
	).trim();
}

function getCommitDifferences(cwd: string, remote?: string): [localDiff: number, remoteDiff: number] {
	// if upstream hard configured we use it
	const output = execSync(
		`git rev-list --left-right --count HEAD...${remote || getUpstream(cwd)}`,
		getExecOptions(cwd),
	).trim();
	// something like "1\t0"
	return output.split("\t", 2).map(Number) as any;
}

function hasUncommittedChanges(cwd: string): boolean {
	const output = execSync(
		`git status --porcelain`,
		getExecOptions(cwd),
	).trim();
	return output !== "";
}

/** Locale-independent check for uncommitted changes and commit differences between local and remote branches */
export function gitStatus(cwd: string, remote?: string): GitStatus {
	const [localDiff, remoteDiff] = getCommitDifferences(cwd, remote);
	if (localDiff > 0 && remoteDiff > 0) {
		return "diverged";
	} else if (localDiff === 0 && remoteDiff > 0) {
		return "behind";
	} else if (hasUncommittedChanges(cwd)) {
		return "uncommitted";
	} /* if (remote === 0) */ else {
		return localDiff === 0 ? "up-to-date" : "ahead";
	}
}

// // check if there are untracked changes
// const gitStatus = execSync("git status", { cwd: rootDir, encoding: "utf8" });
// if (/have diverged/.test(gitStatus)) {
// 	if (!isDryRun) {
// 		fail(
// 			colors.red(
// 				"Cannot continue, the local branch has diverged from the git repo!",
// 			),
// 		);
// 	} else {
// 		console.log(
// 			colors.red(
// 				"This is a dry run. The full run would fail due to a diverged branch\n",
// 			),
// 		);
// 	}
// } else if (!lerna && !/working tree clean/.test(gitStatus)) {
// 	if (!isDryRun && !allChanges) {
// 		fail(
// 			colors.red(
// 				`Cannot continue, the local branch has uncommitted changes! Add them to a separate commit first or add the "--all" option to include them in the release commit.`,
// 			),
// 		);
// 	} else {
// 		if (allChanges) {
// 			console.warn(
// 				colors.yellow(
// 					`Your branch has uncommitted changes that will be included in the release commit!
// Consider adding them to a separate commit first.
// `,
// 				),
// 			);
// 		} else {
// 			console.log(
// 				colors.red(
// 					`This is a dry run. The full run would fail due to uncommitted changes.
// Add them to a separate commit first or add the "--all" option to include them in the release commit.
// `,
// 				),
// 			);
// 		}
// 	}
// } else if (/Your branch is behind/.test(gitStatus)) {
// 	if (!isDryRun) {
// 		fail(
// 			colors.red(
// 				"Cannot continue, the local branch is behind the remote changes!",
// 			),
// 		);
// 	} else {
// 		console.log(
// 			colors.red(
// 				"This is a dry run. The full run would fail due to the local branch being behind\n",
// 			),
// 		);
// 	}
// } else if (
// 	/Your branch is up\-to\-date/.test(gitStatus) ||
// 	/Your branch is ahead/.test(gitStatus)
// ) {
// 	// all good
// 	if (!lerna) {
// 		console.log(colors.green("git status is good - I can continue..."));
// 	}
// }
