import type { Context } from "./context.js";

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

async function dropRollbackStash(context: Context, state: RollbackStateInternal): Promise<void> {
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

// Local alias to avoid an import cycle and keep call sites readable.
type RollbackStateInternal = NonNullable<Context["rollback"]>;

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

	let stashSha: string | undefined;
	let stashMessage: string | undefined;
	try {
		const { stdout } = await execGit(context, ["status", "--porcelain"]);
		const isDirty = stdout.trim() !== "";
		if (isDirty) {
			stashMessage = `${ROLLBACK_STASH_MESSAGE_PREFIX}${Date.now()}`;
			await execGit(context, ["stash", "push", "--include-untracked", "-m", stashMessage]);
			const { stdout: stashRef } = await execGit(context, ["rev-parse", "stash@{0}"]);
			stashSha = stashRef.trim();
			// Re-apply the stash so the working tree is restored. The stash entry
			// itself stays in the stash list as a recovery snapshot.
			await execGit(context, ["stash", "apply", stashSha]);
		}
	} catch (e: any) {
		context.cli.warn(
			`Failed to snapshot uncommitted changes for rollback: ${e?.message ?? e}. ` +
				`Rollback will still undo committed and edited files.`,
		);
		// Don't carry a half-baked stash forward.
		stashSha = undefined;
		stashMessage = undefined;
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
		// Success path: the snapshot stash (if any) holds changes that are now
		// part of the release commit, so just drop it to keep `git stash list`
		// clean.
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
	// pass -x so files ignored by .gitignore (node_modules etc.) are preserved.
	try {
		await execGit(context, ["clean", "-fd"]);
	} catch (e: any) {
		context.cli.warn(`Failed to clean untracked files: ${e?.message ?? e}`);
	}

	// Restore the user's pre-release uncommitted changes from the stash snapshot
	let stashApplied = false;
	if (state.stashSha) {
		try {
			await execGit(context, ["stash", "apply", state.stashSha]);
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

	// Only drop the stash entry if we successfully restored its contents (or if
	// there was nothing to restore). Keep it around if apply failed so the user
	// can recover manually.
	if (!state.stashSha || stashApplied) {
		await dropRollbackStash(context, state);
	}
}
