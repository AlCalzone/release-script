import { DefaultStages } from "@alcalzone/release-script-core";
import {
	assertReleaseError,
	createMockContext,
	createMockExec,
	TestFS,
} from "@alcalzone/release-script-testing";
import fs from "fs-extra";
import "jest-extended";
import path from "path";
import GitPlugin from ".";

const exec = createMockExec();

describe("Git plugin", () => {
	afterEach(() => {
		exec.instance.mockClear();
	});
	afterAll(() => {
		exec.unmock();
	});

	describe("check stage", () => {
		it("raises a fatal error when no git identity is configured", async () => {
			const gitPlugin = new GitPlugin();
			const context = createMockContext({ plugins: [gitPlugin] });

			exec.mock({
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
			const context = createMockContext({ plugins: [gitPlugin] });

			exec.mock({
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
			const context = createMockContext({ plugins: [gitPlugin] });

			exec.mock({
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
				includeUnstaged: false,
			});

			exec.mock({
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
				includeUnstaged: true,
			});

			exec.mock({
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

			exec.mock({
				"git config --get user.name": "henlo",
				"git config --get user.email": "this.is@dog",
				"git rev-list --left-right --count HEAD...origin": "1\t0",
				"git status --porcelain": "",
			});

			await gitPlugin.executeStage(context, DefaultStages.check);
			expect(context.errors).toHaveLength(0);
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

			await expect(fs.pathExists(commitmessagePath)).resolves.toBeTrue();
			await gitPlugin.executeStage(context, DefaultStages.cleanup);
			await expect(fs.pathExists(commitmessagePath)).resolves.toBeFalse();
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

			await expect(fs.pathExists(commitmessagePath)).resolves.toBeTrue();
			await gitPlugin.executeStage(context, DefaultStages.cleanup);
			await expect(fs.pathExists(commitmessagePath)).resolves.toBeFalse();
		});
	});
});
