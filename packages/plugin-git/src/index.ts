import { DefaultStages } from "@alcalzone/release-script-core";
import type { Context, Plugin, Stage } from "@alcalzone/release-script-core/types";
import fs from "fs-extra";
import os from "os";
import path from "path";
import type { Argv } from "yargs";

type GitStatus = "diverged" | "uncommitted" | "behind" | "ahead" | "up-to-date";

async function hasGitIdentity(context: Context): Promise<boolean> {
	try {
		const { stdout: username } = await context.sys.execRaw("git config --get user.name", {
			cwd: context.cwd,
		});
		const { stdout: email } = await context.sys.execRaw("git config --get user.email", {
			cwd: context.cwd,
		});
		return username !== "" && email !== "";
	} catch (e) {
		return false;
	}
}

async function getUpstream(context: Context): Promise<string> {
	const { stdout: upstream } = await context.sys.execRaw(
		"git rev-parse --abbrev-ref --symbolic-full-name @{u}",
		{ cwd: context.cwd },
	);
	return upstream;
}

async function getCommitDifferences(
	context: Context,
): Promise<[localDiff: number, remoteDiff: number]> {
	// if upstream hard configured we use it
	const { stdout: output } = await context.sys.exec(
		"git",
		[
			"rev-list",
			"--left-right",
			"--count",
			`HEAD...${context.argv.remote || (await getUpstream(context))}`,
		],
		{ cwd: context.cwd },
	);
	// something like "1\t0"
	return output.split("\t", 2).map(Number) as any;
}

async function hasUncommittedChanges(context: Context): Promise<boolean> {
	const { stdout: output } = await context.sys.execRaw(`git status --porcelain`, {
		cwd: context.cwd,
	});
	return output !== "";
}

async function gitStatus(context: Context): Promise<GitStatus> {
	const [localDiff, remoteDiff] = await getCommitDifferences(context);
	if (localDiff > 0 && remoteDiff > 0) {
		return "diverged";
	} else if (localDiff === 0 && remoteDiff > 0) {
		return "behind";
	} else if (await hasUncommittedChanges(context)) {
		return "uncommitted";
	} /* if (remote === 0) */ else {
		return localDiff === 0 ? "up-to-date" : "ahead";
	}
}

class GitPlugin implements Plugin {
	public readonly id = "git";
	public readonly stages = [
		DefaultStages.check,
		DefaultStages.commit,
		DefaultStages.push,
		DefaultStages.cleanup,
	];

	// dependencies?: string[] | undefined;
	// stageAfter?: Record<string, ConstOrDynamic<string[]>> | undefined;
	// stageBefore?: Record<string, ConstOrDynamic<string[]>> | undefined;
	public defineCLIOptions(yargs: Argv<any>): Argv<any> {
		return yargs.options({
			remote: {
				alias: "r",
				type: "string",
				description: "Which remote to push to",
				defaultDescription: "The remote the current branch is tracking",
			},
			includeUnstaged: {
				alias: ["all", "A"],
				type: "boolean",
				description: "Whether unstaged changes should be allowed",
				default: false,
			},
			tagOnly: {
				type: "boolean",
				description: "Only push the annotated tag, not the release commit",
				default: false,
			},
			noPush: {
				type: "boolean",
				description: "Do not push the commit or tag to Git",
				default: false,
			},
		});
	}

	private async executeCheckStage(context: Context): Promise<void> {
		const colors = context.cli.colors;
		if (!(await hasGitIdentity(context))) {
			const message = `No git identity is configured for the current user ${colors.bold(
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

		const lerna = context.hasData("lerna") && !!context.getData("lerna");

		// check if there are untracked changes
		const branchStatus = await gitStatus(context);
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
				context.cli.log(`git status ok ${context.cli.colors.green("✔")}`);
			}
		} else if (branchStatus === "uncommitted" && !lerna) {
			if (!context.argv.includeUnstaged) {
				context.cli.error(
					`The local branch has uncommitted changes! Add them to a separate commit first or add the "--all" option to include them in the release commit.`,
				);
			} else {
				context.cli.log(`git status ok ${context.cli.colors.green("✔")}`);
			}
		}
	}

	private async executeCommitStage(context: Context): Promise<void> {
		const newVersion = context.getData<string>("version_new");

		// Prepare the commit message
		const commitMessage = `chore: release v${newVersion}

${context.getData("changelog_new")}`;

		context.cli.log(
			`Commit message: ${context.cli.colors.green(commitMessage.split("\n")[0])}`,
		);

		if (!context.argv.dryRun) {
			await fs.writeFile(path.join(context.cwd, ".commitmessage"), commitMessage);
		}

		// And commit stuff
		const commands = [
			["git", "add", "-A", "--", ":(exclude).commitmessage"],
			["git", "commit", "-F", ".commitmessage"],
			["git", "tag", "-a", `v${newVersion}`, "-m", `v${newVersion}`],
		];

		for (const [cmd, ...args] of commands) {
			context.cli.logCommand(cmd, args);
			if (!context.argv.dryRun) {
				await context.sys.exec(cmd, args, { cwd: context.cwd });
			}
		}
	}

	private async executePushStage(context: Context): Promise<void> {
		if (context.argv.noPush) {
			context.cli.log("Do not push to git");
			return;
		}

		const upstream =
			(context.argv.remote as string | undefined) || (await getUpstream(context));
		const [remote, branch] = upstream.split("/", 2);
		const newVersion = context.getData<string>("version_new");

		const commands: string[] = [];
		// Push the branch unless we're in tag-only mode
		if (!context.argv.tagOnly) {
			if (remote !== "origin") {
				commands.push(`git push ${remote || ""} ${branch || ""}`.trimEnd());
			} else {
				commands.push(`git push`);
			}
		}
		// Always push the annotated tag. Use refs/tags/... to disambiguate from branch names
		commands.push(`git push ${remote || "origin"} refs/tags/v${newVersion}`);

		for (const command of commands) {
			context.cli.logCommand(command);
			if (!context.argv.dryRun) {
				await context.sys.execRaw(command, { cwd: context.cwd });
			}
		}
	}

	private async executeCleanupStage(context: Context): Promise<void> {
		const commitMessagePath = path.join(context.cwd, ".commitmessage");
		if (await fs.pathExists(commitMessagePath)) {
			context.cli.log("Removing .commitmessage file");
			await fs.unlink(path.join(context.cwd, ".commitmessage"));
		}

		// In tag-only mode, we don't want to preserve the release commit
		if (context.argv.tagOnly) {
			context.cli.log("Removing temporary release commit");
			const commands = [["git", "reset", "--hard", "HEAD~1"]];

			for (const [cmd, ...args] of commands) {
				context.cli.logCommand(cmd, args);
				if (!context.argv.dryRun) {
					await context.sys.exec(cmd, args, { cwd: context.cwd });
				}
			}
		}
	}

	async executeStage(context: Context, stage: Stage): Promise<void> {
		if (stage.id === "check") {
			await this.executeCheckStage(context);
		} else if (stage.id === "commit") {
			await this.executeCommitStage(context);
		} else if (stage.id === "push") {
			await this.executePushStage(context);
		} else if (stage.id === "cleanup") {
			await this.executeCleanupStage(context);
		}
	}
}

export default GitPlugin;
