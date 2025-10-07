import { DefaultStages } from "@alcalzone/release-script-core";
import { assertReleaseError, createMockContext, TestFS } from "@alcalzone/release-script-testing";
import fs from "fs-extra";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import GitPlugin from ".";

describe("Git plugin", () => {
	describe("check stage", () => {
		it("raises a fatal error when no git identity is configured", async () => {
			const gitPlugin = new GitPlugin();
			const context = createMockContext({
				plugins: [gitPlugin],
			});
			context.sys.mockExec({
				"git config --get user.name": "",
				"git config --get user.email": "",
			});

			await assertReleaseError(() => gitPlugin.executeStage(context, DefaultStages.check), {
				fatal: true,
				messageMatches: /No git identity/i,
			});
		});

		it("raises a fatal error when there are remote changes", async () => {
			const gitPlugin = new GitPlugin();
			const context = createMockContext({
				plugins: [gitPlugin],
			});
			context.sys.mockExec({
				"git config --get user.name": "henlo",
				"git config --get user.email": "this.is@dog",
				"git rev-list --left-right --count HEAD...origin": "0\t2",
			});

			await assertReleaseError(() => gitPlugin.executeStage(context, DefaultStages.check), {
				fatal: true,
				messageMatches: /local branch is behind/i,
			});
		});

		it("raises a fatal error when the branches have diverged", async () => {
			const gitPlugin = new GitPlugin();
			const context = createMockContext({
				plugins: [gitPlugin],
			});
			context.sys.mockExec({
				"git config --get user.name": "henlo",
				"git config --get user.email": "this.is@dog",
				"git rev-list --left-right --count HEAD...origin": "1\t1",
			});

			await assertReleaseError(() => gitPlugin.executeStage(context, DefaultStages.check), {
				fatal: true,
				messageMatches: /different changes/i,
			});
		});

		it("raises a non-fatal error when there are uncommited changes without the --all option", async () => {
			const gitPlugin = new GitPlugin();
			const context = createMockContext({
				plugins: [gitPlugin],
				argv: { includeUnstaged: false },
			});
			context.sys.mockExec({
				"git config --get user.name": "henlo",
				"git config --get user.email": "this.is@dog",
				"git rev-list --left-right --count HEAD...origin": "1\t0",
				"git status --porcelain": "whatever",
			});

			await gitPlugin.executeStage(context, DefaultStages.check);
			expect(context.errors).toHaveLength(1);
			expect(context.errors[0]).toMatch(/uncommitted changes/i);
		});

		it("succeeds if there are uncommited changes with the --all option", async () => {
			const gitPlugin = new GitPlugin();
			const context = createMockContext({
				plugins: [gitPlugin],
				argv: { includeUnstaged: true },
			});
			context.sys.mockExec({
				"git config --get user.name": "henlo",
				"git config --get user.email": "this.is@dog",
				"git rev-list --left-right --count HEAD...origin": "1\t0",
				"git status --porcelain": "whatever",
			});

			await gitPlugin.executeStage(context, DefaultStages.check);
			expect(context.errors).toHaveLength(0);
		});

		it("succeeds if there are no uncommited changes", async () => {
			const gitPlugin = new GitPlugin();
			const context = createMockContext({
				plugins: [gitPlugin],
			});
			context.sys.mockExec({
				"git config --get user.name": "henlo",
				"git config --get user.email": "this.is@dog",
				"git rev-list --left-right --count HEAD...origin": "1\t0",
				"git status --porcelain": "",
			});

			await gitPlugin.executeStage(context, DefaultStages.check);
			expect(context.errors).toHaveLength(0);
		});
	});

	describe("commit stage", () => {
		let testFS: TestFS;
		let testFSRoot: string;
		beforeEach(async () => {
			testFS = new TestFS();
			testFSRoot = await testFS.getRoot();
		});
		afterEach(async () => {
			await testFS.remove();
		});

		it("creates an existing .commitmessage file with the correct content", async () => {
			const gitPlugin = new GitPlugin();
			const context = createMockContext({ plugins: [gitPlugin], cwd: testFSRoot });
			context.setData("version_new", "1.2.3");
			context.setData("changelog_new", `This is the changelog.`);
			// Don't throw when calling system commands
			context.sys.mockExec(() => "");

			await gitPlugin.executeStage(context, DefaultStages.commit);

			const commitmessagePath = path.join(testFSRoot, ".commitmessage");

			await expect(fs.pathExists(commitmessagePath)).resolves.toBe(true);
			const fileContent = await fs.readFile(commitmessagePath, "utf8");
			expect(fileContent).toBe(`chore: release v1.2.3

This is the changelog.`);
		});

		it("commits and tags the commit", async () => {
			const gitPlugin = new GitPlugin();
			const context = createMockContext({ plugins: [gitPlugin], cwd: testFSRoot });
			const newVersion = "1.2.3";
			context.setData("version_new", newVersion);
			context.setData("changelog_new", `This is the changelog.`);

			// Don't throw when calling system commands
			context.sys.mockExec(() => "");

			await gitPlugin.executeStage(context, DefaultStages.commit);
			const expectedCommands = [
				["git", "add", "-A", "--", ":(exclude).commitmessage"],
				["git", "commit", "-F", ".commitmessage"],
				["git", "tag", "-a", `v${newVersion}`, "-m", `v${newVersion}`],
			];
			for (const [cmd, ...args] of expectedCommands) {
				expect(context.sys.exec).toHaveBeenCalledWith(cmd, args, expect.anything());
			}
		});

		it("does also tag in lerna mode", async () => {
			const gitPlugin = new GitPlugin();
			const context = createMockContext({ plugins: [gitPlugin], cwd: testFSRoot });
			const newVersion = "1.2.3";
			context.setData("version_new", newVersion);
			context.setData("changelog_new", `This is the changelog.`);
			context.setData("lerna", true);

			// Don't throw when calling system commands
			context.sys.mockExec(() => "");

			await gitPlugin.executeStage(context, DefaultStages.commit);
			expect(context.sys.exec).toHaveBeenCalledWith(
				"git",
				["tag", "-a", `v${newVersion}`, "-m", `v${newVersion}`],
				expect.anything(),
			);
		});

		it("does not amend the commit, not even in lerna mode", async () => {
			const gitPlugin = new GitPlugin();
			const context = createMockContext({ plugins: [gitPlugin], cwd: testFSRoot });
			const newVersion = "1.2.3";
			context.setData("version_new", newVersion);
			context.setData("changelog_new", `This is the changelog.`);
			context.setData("lerna", true);

			// Don't throw when calling system commands
			context.sys.mockExec(() => "");

			await gitPlugin.executeStage(context, DefaultStages.commit);
			expect(context.sys.exec).not.toHaveBeenCalledWith(
				"git",
				expect.arrayContaining(["--amend"]),
				expect.anything(),
			);
		});
	});

	describe("push stage", () => {
		it("pushes the changes", async () => {
			const gitPlugin = new GitPlugin();
			const context = createMockContext({ plugins: [gitPlugin] });
			const newVersion = "1.2.3";
			context.setData("version_new", newVersion);

			// Don't throw when calling system commands
			context.sys.mockExec(() => "");

			await gitPlugin.executeStage(context, DefaultStages.push);
			const expectedCommands = [`git push`, `git push origin refs/tags/v1.2.3`];
			for (const cmd of expectedCommands) {
				expect(context.sys.execRaw).toHaveBeenCalledWith(cmd, expect.anything());
			}
		});

		it("and respects the configured origin", async () => {
			const gitPlugin = new GitPlugin();
			const context = createMockContext({
				plugins: [gitPlugin],
				argv: { remote: "upstream/foobar" },
			});
			const newVersion = "1.2.5";
			context.setData("version_new", newVersion);

			// Don't throw when calling system commands
			context.sys.mockExec(() => "");

			await gitPlugin.executeStage(context, DefaultStages.push);
			const expectedCommands = [
				`git push upstream foobar`,
				`git push upstream refs/tags/v1.2.5`,
			];
			for (const cmd of expectedCommands) {
				expect(context.sys.execRaw).toHaveBeenCalledWith(cmd, expect.anything());
			}
		});

		it("also pushes in lerna mode", async () => {
			const gitPlugin = new GitPlugin();
			const context = createMockContext({ plugins: [gitPlugin] });
			context.setData("lerna", true);
			const newVersion = "1.2.7";
			context.setData("version_new", newVersion);

			// Don't throw when calling system commands
			context.sys.mockExec(() => "");

			await gitPlugin.executeStage(context, DefaultStages.push);
			const expectedCommands = [`git push`, `git push origin refs/tags/v1.2.7`];
			for (const cmd of expectedCommands) {
				expect(context.sys.execRaw).toHaveBeenCalledWith(
					expect.stringContaining(cmd),
					expect.anything(),
				);
			}
		});

		it("only pushes the tag in tagOnly mode", async () => {
			const gitPlugin = new GitPlugin();
			const context = createMockContext({
				plugins: [gitPlugin],
				argv: { tagOnly: true },
			});
			const newVersion = "1.2.8";
			context.setData("version_new", newVersion);

			// Don't throw when calling system commands
			context.sys.mockExec(() => "");

			await gitPlugin.executeStage(context, DefaultStages.push);
			expect(context.sys.execRaw).toHaveBeenCalledTimes(1);
			const expectedCommands = [`git push origin refs/tags/v1.2.8`];
			for (const cmd of expectedCommands) {
				expect(context.sys.execRaw).toHaveBeenCalledWith(cmd, expect.anything());
			}
		});
	});

	describe("cleanup stage", () => {
		let testFS: TestFS;
		let testFSRoot: string;
		beforeEach(async () => {
			testFS = new TestFS();
			testFSRoot = await testFS.getRoot();
		});
		afterEach(async () => {
			await testFS.remove();
		});

		it("deletes an existing .commitmessage file", async () => {
			await testFS.create({
				".commitmessage": "this is a commit message",
			});

			const gitPlugin = new GitPlugin();
			const context = createMockContext({ plugins: [gitPlugin], cwd: testFSRoot });

			const commitmessagePath = path.join(testFSRoot, ".commitmessage");

			await expect(fs.pathExists(commitmessagePath)).resolves.toBe(true);
			await gitPlugin.executeStage(context, DefaultStages.cleanup);
			await expect(fs.pathExists(commitmessagePath)).resolves.toBe(false);
		});

		// TODO: Figure out why this test is failing. The command shows up in logs, but toHaveBeenCalledTimes fails.
		// it("removes the temporary release commit in tagOnly mode", async () => {
		// 	const gitPlugin = new GitPlugin();
		// 	const context = createMockContext({
		// 		plugins: [gitPlugin],
		// 		argv: { tagOnly: true },
		// 	});

		// 	// Don't throw when calling system commands
		// 	context.sys.mockExec(() => "");

		// 	await gitPlugin.executeStage(context, DefaultStages.cleanup);
		// 	expect(context.sys.execRaw).toHaveBeenCalledTimes(1);
		// 	const expectedCommands = [`git reset --hard HEAD~1`];
		// 	for (const cmd of expectedCommands) {
		// 		expect(context.sys.execRaw).toHaveBeenCalledWith(cmd, expect.anything());
		// 	}
		// });
	});
});
