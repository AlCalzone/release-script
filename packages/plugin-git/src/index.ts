import { DefaultStages } from "@alcalzone/release-script-core";
import type { Context, Plugin, Stage } from "@alcalzone/release-script-core/types";
import execa from "execa";
import os from "os";

type GitStatus = "diverged" | "uncommitted" | "behind" | "ahead" | "up-to-date";

async function hasGitIdentity(): Promise<boolean> {
	try {
		const { stdout: username } = await execa.command("git config --get user.name");
		const { stdout: email } = await execa.command("git config --get user.email");
		return username !== "" && email !== "";
	} catch (e) {
		return false;
	}
}

async function getUpstream(): Promise<string> {
	const { stdout: upstream } = await execa.command(
		"git rev-parse --abbrev-ref --symbolic-full-name @{u}",
	);
	return upstream;
}

async function getCommitDifferences(
	remote?: string,
): Promise<[localDiff: number, remoteDiff: number]> {
	// if upstream hard configured we use it
	const { stdout: output } = await execa("git", [
		"rev-list",
		"--left-right",
		"--count",
		`HEAD...${remote || getUpstream()}`,
	]);
	// something like "1\t0"
	return output.split("\t", 2).map(Number) as any;
}

async function hasUncommittedChanges(): Promise<boolean> {
	const { stdout: output } = await execa.command(`git status --porcelain`);
	return output !== "";
}

async function gitStatus(remote?: string): Promise<GitStatus> {
	const [localDiff, remoteDiff] = await getCommitDifferences(remote);
	if (localDiff > 0 && remoteDiff > 0) {
		return "diverged";
	} else if (localDiff === 0 && remoteDiff > 0) {
		return "behind";
	} else if (await hasUncommittedChanges()) {
		return "uncommitted";
	} /* if (remote === 0) */ else {
		return localDiff === 0 ? "up-to-date" : "ahead";
	}
}

class GitPlugin implements Plugin {
	public readonly id = "git";
	public readonly stages = [DefaultStages.check];

	// dependencies?: string[] | undefined;
	// stageDependencies?: Record<string, ConstOrDynamic<string[]>> | undefined;

	private async executeCheckStage(context: Context): Promise<void> {
		const colors = context.cli.colors;
		if (!(await hasGitIdentity())) {
			const message = `
No git identity is configured for the current user ${colors.bold(
				colors.blue(os.userInfo().username),
			)}!
			
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
			context.cli.fatal(message);
		}

		// TODO:
		const lerna = false;

		// check if there are untracked changes
		const branchStatus = await gitStatus(context.remote);
		if (branchStatus === "diverged") {
			context.cli.fatal(
				"Both the remote and the local repo have different changes! Please merge the remote changes first.",
			);
		} else if (branchStatus === "behind") {
			context.cli.fatal(
				`The local branch is behind the remote changes! Please include them first, e.g. with "git pull".`,
			);
		} else if (branchStatus === "ahead" || branchStatus === "up-to-date") {
			// all good
			if (!lerna) {
				context.cli.log(colors.green("git status is good - I can continue..."));
			}
		} else if (branchStatus === "uncommitted" && !lerna) {
			if (!context.includeUnstaged) {
				context.cli.error(
					`The local branch has uncommitted changes! Add them to a separate commit first or add the "--all" option to include them in the release commit.`,
				);
			}
		}
	}

	async executeStage(context: Context, stage: Stage): Promise<void> {
		if (stage.id === "check") {
			await this.executeCheckStage(context);
		}
	}
	// context: Map<string, any>;
}

export default GitPlugin;
