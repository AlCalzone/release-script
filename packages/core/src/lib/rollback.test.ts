import { createMockContext } from "@alcalzone/release-script-testing";
import { describe, expect, it } from "vitest";
import { captureRollbackSnapshot, finalizeRollback } from "./rollback.js";

const HEAD_SHA = "1111111111111111111111111111111111111111";
const STASH_SHA = "2222222222222222222222222222222222222222";
const STASH_MSG = "release-script-rollback-12345";

// MockSystem is shared across tests via the default context. Reset call
// history (and any previous mockExec implementation) before each test so
// "not called" assertions are accurate.
function freshContext(...args: Parameters<typeof createMockContext>) {
	const context = createMockContext(...args);
	context.sys.exec.mockReset();
	context.sys.execRaw.mockReset();
	return context;
}

describe("captureRollbackSnapshot", () => {
	it("records HEAD when the working tree is clean", async () => {
		const context = freshContext({});
		context.sys.mockExec({
			"git rev-parse HEAD": HEAD_SHA,
			"git status --porcelain": "",
		});

		await captureRollbackSnapshot(context);

		expect(context.rollback).toBeDefined();
		expect(context.rollback?.originalHead).toBe(HEAD_SHA);
		expect(context.rollback?.stashSha).toBeUndefined();
		expect(context.rollback?.stashMessage).toBeUndefined();
		expect(context.rollback?.pushAttempted).toBe(false);
	});

	it("creates and re-applies a stash when the working tree is dirty", async () => {
		const context = freshContext({});
		context.sys.mockExec((cmd) => {
			if (cmd === "git rev-parse HEAD") return HEAD_SHA;
			if (cmd === "git status --porcelain") return " M package.json\n";
			if (cmd.startsWith("git stash push")) return "";
			if (cmd === "git stash apply --index stash@{0}") return "";
			if (cmd === "git rev-parse stash@{0}") return STASH_SHA;
			throw new Error(`unexpected command: ${cmd}`);
		});

		await captureRollbackSnapshot(context);

		expect(context.rollback?.stashSha).toBe(STASH_SHA);
		expect(context.rollback?.stashMessage).toMatch(/^release-script-rollback-/);
		expect(context.rollback?.cleanAllowedDuringRollback).toBe(true);
		// Stash apply must be called so plugin edits + user edits coexist before commit
		expect(context.sys.exec).toHaveBeenCalledWith(
			"git",
			["stash", "apply", "--index", "stash@{0}"],
			expect.anything(),
		);
	});

	it("marks cleanAllowedDuringRollback=true when the working tree is clean", async () => {
		const context = freshContext({});
		context.sys.mockExec({
			"git rev-parse HEAD": HEAD_SHA,
			"git status --porcelain": "",
		});

		await captureRollbackSnapshot(context);

		expect(context.rollback?.cleanAllowedDuringRollback).toBe(true);
	});

	it("marks cleanAllowedDuringRollback=false when stash creation fails on dirty tree", async () => {
		const context = freshContext({});
		context.sys.mockExec((cmd) => {
			if (cmd === "git rev-parse HEAD") return HEAD_SHA;
			if (cmd === "git status --porcelain") return " M package.json\n";
			if (cmd.startsWith("git stash push")) throw new Error("stash push failed");
			throw new Error(`unexpected command: ${cmd}`);
		});

		await captureRollbackSnapshot(context);

		expect(context.rollback).toBeDefined();
		expect(context.rollback?.cleanAllowedDuringRollback).toBe(false);
		expect(context.rollback?.stashMessage).toBeUndefined();
		expect(context.rollback?.stashSha).toBeUndefined();
	});

	it("preserves stashMessage when SHA capture fails after a successful apply", async () => {
		const context = freshContext({});
		context.sys.mockExec((cmd) => {
			if (cmd === "git rev-parse HEAD") return HEAD_SHA;
			if (cmd === "git status --porcelain") return " M package.json\n";
			if (cmd.startsWith("git stash push")) return "";
			if (cmd === "git stash apply --index stash@{0}") return "";
			if (cmd === "git rev-parse stash@{0}") throw new Error("rev-parse failed");
			throw new Error(`unexpected command: ${cmd}`);
		});

		await captureRollbackSnapshot(context);

		// Apply succeeded, so the working tree matches the user's pre-release state.
		// The stash entry remains as a recovery anchor identified by message.
		expect(context.rollback?.stashMessage).toMatch(/^release-script-rollback-/);
		expect(context.rollback?.stashSha).toBeUndefined();
		expect(context.rollback?.cleanAllowedDuringRollback).toBe(true);
	});

	it("throws if apply fails after the snapshot stash was created", async () => {
		// A failed apply leaves the working tree clean while the user's changes
		// only live in the stash — proceeding would silently change the release
		// contents, so capture must abort and let the caller surface the error.
		const context = freshContext({});
		context.sys.mockExec((cmd) => {
			if (cmd === "git rev-parse HEAD") return HEAD_SHA;
			if (cmd === "git status --porcelain") return " M package.json\n";
			if (cmd.startsWith("git stash push")) return "";
			if (cmd === "git stash apply --index stash@{0}") throw new Error("conflict");
			throw new Error(`unexpected command: ${cmd}`);
		});

		await expect(captureRollbackSnapshot(context)).rejects.toThrow(
			/Could not re-apply your uncommitted changes/,
		);
	});

	it("does nothing when --dryRun is set", async () => {
		const context = freshContext({ argv: { dryRun: true } });
		await captureRollbackSnapshot(context);
		expect(context.rollback).toBeUndefined();
		expect(context.sys.exec).not.toHaveBeenCalled();
	});

	it("does nothing when --noRollback is set", async () => {
		const context = freshContext({ argv: { noRollback: true } });
		await captureRollbackSnapshot(context);
		expect(context.rollback).toBeUndefined();
		expect(context.sys.exec).not.toHaveBeenCalled();
	});

	it("silently skips when not in a git repo", async () => {
		const context = freshContext({});
		context.sys.mockExec(() => {
			throw new Error("fatal: not a git repository");
		});
		await captureRollbackSnapshot(context);
		expect(context.rollback).toBeUndefined();
	});
});

describe("finalizeRollback (failure path)", () => {
	it("is a no-op when no snapshot was captured", async () => {
		const context = freshContext({});
		await finalizeRollback(context, { failed: true });
		expect(context.sys.exec).not.toHaveBeenCalled();
	});

	it("resets HEAD and cleans untracked files when no tag and no stash", async () => {
		const context = freshContext({});
		context.rollback = {
			originalHead: HEAD_SHA,
			pushAttempted: false,
			cleanAllowedDuringRollback: true,
		};
		context.sys.mockExec(() => "");

		await finalizeRollback(context, { failed: true });

		expect(context.sys.exec).toHaveBeenCalledWith(
			"git",
			["reset", "--hard", HEAD_SHA],
			expect.anything(),
		);
		expect(context.sys.exec).toHaveBeenCalledWith("git", ["clean", "-fd"], expect.anything());
	});

	it("does NOT run git clean when cleanAllowedDuringRollback is false", async () => {
		const context = freshContext({});
		context.rollback = {
			originalHead: HEAD_SHA,
			pushAttempted: false,
			cleanAllowedDuringRollback: false,
		};
		context.sys.mockExec(() => "");

		await finalizeRollback(context, { failed: true });

		expect(context.sys.exec).toHaveBeenCalledWith(
			"git",
			["reset", "--hard", HEAD_SHA],
			expect.anything(),
		);
		// Clean would destroy pre-existing untracked files we couldn't snapshot
		expect(context.sys.exec).not.toHaveBeenCalledWith(
			"git",
			["clean", "-fd"],
			expect.anything(),
		);
		expect(context.warnings.some((w) => /untracked files/i.test(w))).toBe(true);
	});

	it("deletes the release tag only if this run created it", async () => {
		const context = freshContext({});
		context.rollback = {
			originalHead: HEAD_SHA,
			pushAttempted: false,
			cleanAllowedDuringRollback: true,
			createdTag: "v1.2.3",
		};
		context.sys.mockExec(() => "");

		await finalizeRollback(context, { failed: true });

		expect(context.sys.exec).toHaveBeenCalledWith(
			"git",
			["tag", "-d", "v1.2.3"],
			expect.anything(),
		);
	});

	it("does NOT delete a pre-existing tag when this run did not create one", async () => {
		const context = freshContext({});
		context.rollback = {
			originalHead: HEAD_SHA,
			pushAttempted: false,
			cleanAllowedDuringRollback: true,
		};
		// version_new is set but createdTag is not — tag pre-existed.
		context.setData("version_new", "1.2.3");
		context.sys.mockExec(() => "");

		await finalizeRollback(context, { failed: true });

		expect(context.sys.exec).not.toHaveBeenCalledWith(
			"git",
			["tag", "-d", "v1.2.3"],
			expect.anything(),
		);
	});

	it("restores the user's stash and drops it by index after a clean rollback", async () => {
		const context = freshContext({});
		context.rollback = {
			originalHead: HEAD_SHA,
			stashSha: STASH_SHA,
			stashMessage: STASH_MSG,
			pushAttempted: false,
			cleanAllowedDuringRollback: true,
		};
		context.sys.mockExec((cmd) => {
			if (cmd === "git stash list --pretty=format:%gd %gs") {
				return `stash@{0} On main: ${STASH_MSG}`;
			}
			return "";
		});

		await finalizeRollback(context, { failed: true });

		expect(context.sys.exec).toHaveBeenCalledWith(
			"git",
			["stash", "apply", "--index", STASH_SHA],
			expect.anything(),
		);
		// Drop must use the stash@{N} index, not the SHA
		expect(context.sys.exec).toHaveBeenCalledWith(
			"git",
			["stash", "drop", "stash@{0}"],
			expect.anything(),
		);
		expect(context.sys.exec).not.toHaveBeenCalledWith(
			"git",
			["stash", "drop", STASH_SHA],
			expect.anything(),
		);
	});

	it("does NOT drop the stash if applying it failed", async () => {
		const context = freshContext({});
		context.rollback = {
			originalHead: HEAD_SHA,
			stashSha: STASH_SHA,
			stashMessage: STASH_MSG,
			pushAttempted: false,
			cleanAllowedDuringRollback: true,
		};
		context.sys.mockExec((cmd) => {
			if (cmd === `git stash apply --index ${STASH_SHA}`) {
				throw new Error("conflict");
			}
			if (cmd === "git stash list --pretty=format:%gd %gs") {
				return `stash@{0} On main: ${STASH_MSG}`;
			}
			return "";
		});

		await finalizeRollback(context, { failed: true });

		expect(context.sys.exec).not.toHaveBeenCalledWith(
			"git",
			["stash", "drop", "stash@{0}"],
			expect.anything(),
		);
		expect(context.warnings.some((w) => /uncommitted changes/i.test(w))).toBe(true);
	});

	it("restores the stash via message-based lookup when stashSha is missing", async () => {
		// Captures the case where the SHA couldn't be resolved at snapshot time
		// (e.g. transient `git rev-parse` failure) but the stash entry exists
		// and is identifiable by its message.
		const context = freshContext({});
		context.rollback = {
			originalHead: HEAD_SHA,
			stashMessage: STASH_MSG,
			pushAttempted: false,
			cleanAllowedDuringRollback: true,
		};
		context.sys.mockExec((cmd) => {
			if (cmd === "git stash list --pretty=format:%gd %gs") {
				return `stash@{0} On main: ${STASH_MSG}`;
			}
			return "";
		});

		await finalizeRollback(context, { failed: true });

		expect(context.sys.exec).toHaveBeenCalledWith(
			"git",
			["stash", "apply", "--index", "stash@{0}"],
			expect.anything(),
		);
		expect(context.sys.exec).toHaveBeenCalledWith(
			"git",
			["stash", "drop", "stash@{0}"],
			expect.anything(),
		);
	});

	it("does NOT drop the stash when message-based restore fails", async () => {
		const context = freshContext({});
		context.rollback = {
			originalHead: HEAD_SHA,
			stashMessage: STASH_MSG,
			pushAttempted: false,
			cleanAllowedDuringRollback: true,
		};
		context.sys.mockExec((cmd) => {
			if (cmd === "git stash list --pretty=format:%gd %gs") {
				return `stash@{0} On main: ${STASH_MSG}`;
			}
			if (cmd === "git stash apply --index stash@{0}") {
				throw new Error("conflict");
			}
			return "";
		});

		await finalizeRollback(context, { failed: true });

		expect(context.sys.exec).not.toHaveBeenCalledWith(
			"git",
			["stash", "drop", "stash@{0}"],
			expect.anything(),
		);
		expect(context.warnings.some((w) => /uncommitted changes/i.test(w))).toBe(true);
	});

	it("drops the snapshot stash even when push was already attempted", async () => {
		const context = freshContext({});
		context.rollback = {
			originalHead: HEAD_SHA,
			stashSha: STASH_SHA,
			stashMessage: STASH_MSG,
			pushAttempted: true,
			cleanAllowedDuringRollback: true,
		};
		context.sys.mockExec((cmd) => {
			if (cmd === "git stash list --pretty=format:%gd %gs") {
				return `stash@{0} On main: ${STASH_MSG}`;
			}
			return "";
		});

		await finalizeRollback(context, { failed: true });

		// Did not roll back HEAD
		expect(context.sys.exec).not.toHaveBeenCalledWith(
			"git",
			["reset", "--hard", HEAD_SHA],
			expect.anything(),
		);
		// But did clean up the stash (its contents are in the local commit)
		expect(context.sys.exec).toHaveBeenCalledWith(
			"git",
			["stash", "drop", "stash@{0}"],
			expect.anything(),
		);
		expect(context.warnings.some((w) => /push.*already.*attempted/i.test(w))).toBe(true);
	});

	it("does nothing when --dryRun is set", async () => {
		const context = freshContext({ argv: { dryRun: true } });
		context.rollback = {
			originalHead: HEAD_SHA,
			pushAttempted: false,
			cleanAllowedDuringRollback: true,
		};
		await finalizeRollback(context, { failed: true });
		expect(context.sys.exec).not.toHaveBeenCalled();
	});

	it("does nothing when --noRollback is set", async () => {
		const context = freshContext({ argv: { noRollback: true } });
		context.rollback = {
			originalHead: HEAD_SHA,
			pushAttempted: false,
			cleanAllowedDuringRollback: true,
		};
		await finalizeRollback(context, { failed: true });
		expect(context.sys.exec).not.toHaveBeenCalled();
	});
});

describe("finalizeRollback (success path)", () => {
	it("drops the snapshot stash by index", async () => {
		const context = freshContext({});
		context.rollback = {
			originalHead: HEAD_SHA,
			stashSha: STASH_SHA,
			stashMessage: STASH_MSG,
			pushAttempted: false,
			cleanAllowedDuringRollback: true,
		};
		context.sys.mockExec((cmd) => {
			if (cmd === "git stash list --pretty=format:%gd %gs") {
				return `stash@{2} On main: unrelated\nstash@{1} On main: ${STASH_MSG}\nstash@{0} On main: other`;
			}
			return "";
		});

		await finalizeRollback(context, { failed: false });

		expect(context.sys.exec).toHaveBeenCalledWith(
			"git",
			["stash", "drop", "stash@{1}"],
			expect.anything(),
		);
		// Must not touch HEAD or the working tree on the success path
		expect(context.sys.exec).not.toHaveBeenCalledWith(
			"git",
			["reset", "--hard", HEAD_SHA],
			expect.anything(),
		);
	});

	it("is a no-op when no snapshot was taken", async () => {
		const context = freshContext({});
		await finalizeRollback(context, { failed: false });
		expect(context.sys.exec).not.toHaveBeenCalled();
	});

	it("is a no-op when no stash was created (clean working tree)", async () => {
		const context = freshContext({});
		context.rollback = {
			originalHead: HEAD_SHA,
			pushAttempted: false,
			cleanAllowedDuringRollback: true,
		};
		await finalizeRollback(context, { failed: false });
		expect(context.sys.exec).not.toHaveBeenCalled();
	});

	it("is a no-op when --dryRun or --noRollback is set", async () => {
		const dry = freshContext({ argv: { dryRun: true } });
		dry.rollback = {
			originalHead: HEAD_SHA,
			stashSha: STASH_SHA,
			stashMessage: STASH_MSG,
			pushAttempted: false,
			cleanAllowedDuringRollback: true,
		};
		await finalizeRollback(dry, { failed: false });
		expect(dry.sys.exec).not.toHaveBeenCalled();

		const noRb = freshContext({ argv: { noRollback: true } });
		noRb.rollback = {
			originalHead: HEAD_SHA,
			stashSha: STASH_SHA,
			stashMessage: STASH_MSG,
			pushAttempted: false,
			cleanAllowedDuringRollback: true,
		};
		await finalizeRollback(noRb, { failed: false });
		expect(noRb.sys.exec).not.toHaveBeenCalled();
	});
});
