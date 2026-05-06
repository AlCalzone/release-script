import type { Context, RollbackState } from "./context.js";

const ROLLBACK_STASH_MESSAGE_PREFIX = "release-script-rollback-";

async function execGit(
	context: Context,
	args: string[],
): Promise<{ stdout: string; stderr: string }> {
	const result = await context.sys.exec("git", args, { cwd: context.cwd });
	return { stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

/** Look up the `stash@{N}` ref of a stash entry by its message. */
async function findStashIndexByMessage(
	context: Context,
	stashMessage: string,
): Promise<string | undefined> {
	try {
		const { stdout } = await execGit(context, ["stash", "list", "--pretty=format:%gd %gs"]);
		for (const line of stdout.split(/\r?\n/)) {
			if (!line) continue;
			const match = /^(stash@\{\d+\})\s/.exec(line);
			if (match && line.includes(stashMessage)) {
				return match[1];
			}
		}
	} catch {
		/* ignore */
	}
	return undefined;
}

async function dropRollbackStash(context: Context, state: RollbackState): Promise<void> {
	if (!state.stashMessage) return;
	const index = await findStashIndexByMessage(context, state.stashMessage);
	if (!index) {
		// Already gone or never created — nothing to do.
		return;
	}
	try {
		await execGit(context, ["stash", "drop", index]);
	} catch (e: any) {
		context.cli.warn(`Failed to drop rollback stash ${index}: ${e?.message ?? e}`);
	}
}

/**
 * Captures the state required to roll back any release-induced changes.
 * Should be called once, just before the first stage that mutates the working tree.
 */
export async function captureRollbackSnapshot(context: Context): Promise<void> {
	if (context.argv.dryRun) return;
	if (context.argv.noRollback) return;
	if (context.rollback) return; // already captured

	let originalHead: string;
	try {
		const { stdout } = await execGit(context, ["rev-parse", "HEAD"]);
		originalHead = stdout.trim();
	} catch {
		// Not a git repo (or git unavailable) — skip rollback support entirely.
		return;
	}

	let isDirty: boolean;
	try {
		const { stdout } = await execGit(context, ["status", "--porcelain"]);
		isDirty = stdout.trim() !== "";
	} catch (e: any) {
		context.cli.warn(
			`Could not determine working tree status for rollback: ${e?.message ?? e}. ` +
				`Local rollback has been disabled for this run to avoid data loss if the release fails.`,
		);
		return;
	}

	let stashSha: string | undefined;
	let stashMessage: string | undefined;
	if (isDirty) {
		const message = `${ROLLBACK_STASH_MESSAGE_PREFIX}${Date.now()}`;
		try {
			await execGit(context, ["stash", "push", "--include-untracked", "-m", message]);
			// From this line on, the stash entry exists in `git stash list` and
			// is identifiable by its message.
			stashMessage = message;
		} catch (e: any) {
			context.cli.warn(
				`Failed to snapshot uncommitted changes for rollback: ${e?.message ?? e}. ` +
					`Local rollback has been disabled for this run to avoid data loss if the release fails.`,
			);
			return;
		}

		if (stashMessage) {
			// Re-apply immediately so the release operates on the same working
			// tree the user had. `--index` preserves the staged/unstaged split.
			// If apply fails the working tree is now clean while the user's
			// changes only live in the stash — proceeding would silently change
			// what the release contains, so abort instead.
			try {
				await execGit(context, ["stash", "apply", "--index", "stash@{0}"]);
			} catch (e: any) {
				throw new Error(
					`Could not re-apply your uncommitted changes after snapshotting them ` +
						`for rollback: ${e?.message ?? e}. ` +
						`Your changes are preserved in the stash list (look for "${stashMessage}"); ` +
						`recover them with: git stash apply stash^{/${stashMessage}}`,
				);
			}

			// Capture the SHA as a stable handle for the later restore in
			// finalizeRollback. Best-effort: if this fails we can fall back to
			// looking the entry up by its unique message.
			try {
				const { stdout } = await execGit(context, ["rev-parse", "stash@{0}"]);
				stashSha = stdout.trim();
			} catch {
				/* fall back to message-based lookup */
			}
		}
	}

	context.rollback = {
		originalHead,
		stashSha,
		stashMessage,
		pushAttempted: false,
	};
}

export interface FinalizeRollbackOptions {
	/**
	 * Whether the release failed. If true, the working tree, HEAD, and any
	 * release tag are reverted. If false, only the snapshot stash is dropped.
	 */
	failed: boolean;
}

/**
 * Single entry point for the rollback lifecycle, called once after the release
 * finishes (success or failure). Acts as the inverse of `captureRollbackSnapshot`.
 */
export async function finalizeRollback(
	context: Context,
	options: FinalizeRollbackOptions,
): Promise<void> {
	if (context.argv.dryRun) return;
	if (context.argv.noRollback) return;

	const state = context.rollback;
	if (!state) return;

	if (!options.failed) {
		// Success path: any snapshot stash was re-applied to the working tree
		// during capture (captureRollbackSnapshot aborts otherwise), so its
		// contents are part of the release commit and the entry can be dropped.
		await dropRollbackStash(context, state);
		return;
	}

	if (state.pushAttempted) {
		context.cli.warn(
			`Skipping rollback because a push to the remote has already been attempted. ` +
				`Local commit and tag have been kept so you can decide how to proceed.`,
		);
		// The user's pre-release changes (if any) are already in the local
		// release commit, so the snapshot stash is no longer useful.
		await dropRollbackStash(context, state);
		return;
	}

	context.cli.log("Rolling back local changes...");

	// Only delete the tag if this run actually created it. Tags that pre-date
	// this attempt (e.g. left over from a previous failed run) must be left
	// alone for the user to inspect.
	if (state.createdTag) {
		try {
			await execGit(context, ["tag", "-d", state.createdTag]);
			context.cli.log(`Deleted release tag ${state.createdTag}`);
		} catch (e: any) {
			context.cli.warn(
				`Failed to delete release tag ${state.createdTag}: ${e?.message ?? e}`,
			);
		}
	}

	// Reset HEAD and working tree to the snapshot commit
	try {
		await execGit(context, ["reset", "--hard", state.originalHead]);
		context.cli.log(`Reset HEAD to ${state.originalHead.slice(0, 8)}`);
	} catch (e: any) {
		context.cli.warn(`Failed to reset to original HEAD: ${e?.message ?? e}`);
		return;
	}

	// Drop untracked files left behind by plugins (e.g. .commitmessage). Do not
	// pass -x — that would also remove .gitignore'd files like node_modules.
	try {
		await execGit(context, ["clean", "-fd"]);
	} catch (e: any) {
		context.cli.warn(`Failed to clean untracked files: ${e?.message ?? e}`);
	}

	// Restore the user's pre-release uncommitted changes from the stash
	// snapshot. Prefer the SHA (stable across other stash operations); if it
	// wasn't captured, look the entry up by its unique message.
	let stashApplied = false;
	if (state.stashMessage || state.stashSha) {
		const ref =
			state.stashSha ??
			(state.stashMessage
				? await findStashIndexByMessage(context, state.stashMessage)
				: undefined);
		if (ref) {
			try {
				// `--index` preserves the staged/unstaged split the user had.
				await execGit(context, ["stash", "apply", "--index", ref]);
				stashApplied = true;
				context.cli.log("Restored your pre-release uncommitted changes");
			} catch (e: any) {
				const recoveryHint = state.stashMessage
					? `Recover them manually with: git stash list (look for "${state.stashMessage}")`
					: `Recover them manually via the stash list.`;
				context.cli.warn(
					`Failed to restore pre-release uncommitted changes: ${e?.message ?? e}. ` +
						recoveryHint,
				);
			}
		}
	}

	// Drop the snapshot stash only when there was nothing to restore, or the
	// restore succeeded. Otherwise keep it as the user's recovery anchor.
	if (!state.stashMessage || stashApplied) {
		await dropRollbackStash(context, state);
	}
}
