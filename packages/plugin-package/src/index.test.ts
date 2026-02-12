import { detectPackageManager } from "@alcalzone/pak";
import { DefaultStages } from "@alcalzone/release-script-core";
import { assertReleaseError, createMockContext, TestFS } from "@alcalzone/release-script-testing";
import fs from "node:fs/promises";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import PackagePlugin from "./index.js";

vi.mock("@alcalzone/pak");

const fixtures = {
	yarnrc_commented_out: `
plugins:
  - path: .yarn/plugins/@yarnpkg/plugin-workspace-tools.cjs
    spec: "@yarnpkg/plugin-workspace-tools"
  - path: .yarn/plugins/@yarnpkg/plugin-changed.cjs
    spec: "https://github.com/Dcard/yarn-plugins/releases/latest/download/plugin-changed.js"
# commented out, but required:
#  - path: .yarn/plugins/@yarnpkg/plugin-version.cjs
#    spec: "@yarnpkg/plugin-version"
`.trim(),
	yarnrc_complete: `
plugins:
  - path: .yarn/plugins/@yarnpkg/plugin-workspace-tools.cjs
    spec: "@yarnpkg/plugin-workspace-tools"
  - path: .yarn/plugins/@yarnpkg/plugin-changed.cjs
    spec: "https://github.com/Dcard/yarn-plugins/releases/latest/download/plugin-changed.js"
  - path: .yarn/plugins/@yarnpkg/plugin-version.cjs
    spec: "@yarnpkg/plugin-version"
`.trim(),
};

describe("Package plugin", () => {
	describe("check stage", () => {
		let testFS: TestFS;
		let testFSRoot: string;
		beforeEach(async () => {
			testFS = new TestFS();
			testFSRoot = await testFS.getRoot();
		});
		afterEach(async () => {
			await testFS.remove();
		});

		it("raises a fatal error when package.json is missing from cwd", async () => {
			const pkgPlugin = new PackagePlugin();
			const context = createMockContext({
				plugins: [pkgPlugin],
				cwd: testFSRoot,
			});

			await assertReleaseError(() => pkgPlugin.executeStage(context, DefaultStages.check), {
				fatal: true,
				messageMatches: /no package.json found/i,
			});
		});

		it("raises a fatal error when package.json contains no version field", async () => {
			const pkgPlugin = new PackagePlugin();
			const context = createMockContext({
				plugins: [pkgPlugin],
				cwd: testFSRoot,
			});

			await testFS.create({
				"package.json": JSON.stringify({
					name: "test-package",
				}),
			});

			await assertReleaseError(() => pkgPlugin.executeStage(context, DefaultStages.check), {
				fatal: true,
				messageMatches: /missing property version/i,
			});
		});

		it("raises a fatal error when package.json contains a non-semver version", async () => {
			const pkgPlugin = new PackagePlugin();
			const context = createMockContext({
				plugins: [pkgPlugin],
				cwd: testFSRoot,
			});

			await testFS.create({
				"package.json": JSON.stringify({
					name: "test-package",
					version: "a.b.c",
				}),
			});

			await assertReleaseError(() => pkgPlugin.executeStage(context, DefaultStages.check), {
				fatal: true,
				messageMatches: /invalid version "a.b.c"/i,
			});
		});

		it(`errors when package scripts are outdated`, async () => {
			const pkgPlugin = new PackagePlugin();
			const context = createMockContext({
				plugins: [pkgPlugin],
				cwd: testFSRoot,
			});
			context.setData("lerna", true);

			await testFS.create({
				"package.json": JSON.stringify({
					name: "test-package",
					version: "1.2.3",
					scripts: {
						release: "lerna version",
						preversion: "release-script --lerna-check",
						version: "release-script --lerna",
						postversion: "git push && git push --tags",
					},
				}),
			});

			await pkgPlugin.executeStage(context, DefaultStages.check);
			expect(context.errors).toContainEqual(expect.stringMatching(`lerna version`));
			expect(context.errors).toContainEqual(expect.stringMatching(`"preversion"`));
			expect(context.errors).toContainEqual(expect.stringMatching(`"version"`));
			expect(context.errors).toContainEqual(expect.stringMatching(`"postversion"`));
		});
	});

	describe("check stage (monorepo)", () => {
		let testFS: TestFS;
		let testFSRoot: string;
		beforeEach(async () => {
			testFS = new TestFS();
			testFSRoot = await testFS.getRoot();
		});
		afterEach(async () => {
			await testFS.remove();
		});

		it("raises a fatal error when neither lerna nor yarn plugins are available", async () => {
			const pkgPlugin = new PackagePlugin();
			const context = createMockContext({
				plugins: [pkgPlugin],
				cwd: testFSRoot,
			});

			await testFS.create({
				"package.json": JSON.stringify({
					name: "test-package",
					version: "1.2.3",
					workspaces: ["packages/*"],
				}),
			});

			await assertReleaseError(() => pkgPlugin.executeStage(context, DefaultStages.check), {
				fatal: true,
				messageMatches: /monorepo/i,
			});
		});

		it("raises a fatal error when some yarn plugins are unavailable", async () => {
			const pkgPlugin = new PackagePlugin();
			const context = createMockContext({
				plugins: [pkgPlugin],
				cwd: testFSRoot,
			});

			await testFS.create({
				"package.json": JSON.stringify({
					name: "test-package",
					version: "1.2.3",
					workspaces: ["packages/*"],
				}),
				".yarnrc.yml": fixtures.yarnrc_commented_out,
			});

			context.sys.mockExec((cmd) => {
				if (cmd === "yarn --version") return "3.4.5";
				return "";
			});

			await assertReleaseError(() => pkgPlugin.executeStage(context, DefaultStages.check), {
				fatal: true,
				messageMatches: /plugin import version/i,
			});
		});

		it("does not error when the monorepo doesn't have any sub-packages", async () => {
			const pkgPlugin = new PackagePlugin();
			const context = createMockContext({
				plugins: [pkgPlugin],
				cwd: testFSRoot,
			});

			await testFS.create({
				"package.json": JSON.stringify({
					name: "test-package",
					version: "1.2.3",
					workspaces: [],
				}),
			});

			await pkgPlugin.executeStage(context, DefaultStages.check);
			expect(context.errors).toHaveLength(0);
		});

		it("does not error when lerna is available", async () => {
			const pkgPlugin = new PackagePlugin();
			const context = createMockContext({
				plugins: [pkgPlugin],
				cwd: testFSRoot,
			});
			context.setData("lerna", true);

			await testFS.create({
				"package.json": JSON.stringify({
					name: "test-package",
					version: "1.2.3",
					workspaces: ["packages/*"],
				}),
			});

			await pkgPlugin.executeStage(context, DefaultStages.check);
			expect(context.errors).toHaveLength(0);
		});

		it("raises a fatal error in yarn-monorepo mode when no packages are changed", async () => {
			const pkgPlugin = new PackagePlugin();
			const context = createMockContext({
				plugins: [pkgPlugin],
				cwd: testFSRoot,
			});

			const oldVersion = "1.2.3";
			const newVersion = "1.2.4";

			const pack = {
				name: "test-package",
				version: oldVersion,
				workspaces: ["packages/*"],
			};
			await testFS.create({
				"package.json": JSON.stringify(pack, null, 2),
				".yarnrc.yml": fixtures.yarnrc_complete,
			});

			context.setData("package.json", pack);
			context.setData("version", oldVersion);
			context.setData("version_new", newVersion);
			context.setData("monorepo", "yarn");

			context.sys.mockExec((cmd) => {
				if (cmd === "yarn --version") return "3.4.5";
				return "";
			});

			await assertReleaseError(() => pkgPlugin.executeStage(context, DefaultStages.check), {
				fatal: true,
				messageMatches: /--publishAll/i,
			});
		});
	});

	describe("edit stage", () => {
		let testFS: TestFS;
		let testFSRoot: string;
		beforeEach(async () => {
			testFS = new TestFS();
			testFSRoot = await testFS.getRoot();
		});
		afterEach(async () => {
			await testFS.remove();
		});

		it("logs the version change", async () => {
			const pkgPlugin = new PackagePlugin();
			const context = createMockContext({
				plugins: [pkgPlugin],
				cwd: testFSRoot,
			});

			context.setData("package.json", {
				name: "test-package",
				version: "1.0.0",
			});
			context.setData("version_new", "1.2.3");

			await pkgPlugin.executeStage(context, DefaultStages.edit);

			expect(context.cli.log).toHaveBeenCalledWith(
				expect.stringMatching(/updating package.json version/i),
			);
			expect(context.cli.log).toHaveBeenCalledWith(expect.stringMatching("1.0.0"));
			expect(context.cli.log).toHaveBeenCalledWith(expect.stringMatching("1.2.3"));
		});

		it("updates package.json", async () => {
			const pkgPlugin = new PackagePlugin();
			const context = createMockContext({
				plugins: [pkgPlugin],
				cwd: testFSRoot,
			});

			context.setData("package.json", {
				name: "test-package",
				version: "1.0.0",
			});
			context.setData("version_new", "1.2.3");

			await pkgPlugin.executeStage(context, DefaultStages.edit);

			const packPath = path.join(testFSRoot, "package.json");
			const fileContent = (await fs.readFile(packPath, "utf8")).trim();
			expect(fileContent).toBe(`{
  "name": "test-package",
  "version": "1.2.3"
}`);
		});

		it("but not in lerna mode", async () => {
			const pkgPlugin = new PackagePlugin();
			const context = createMockContext({
				plugins: [pkgPlugin],
				cwd: testFSRoot,
			});
			const packPath = path.join(testFSRoot, "package.json");
			const pack = {
				name: "test-package",
				version: "1.0.0",
			};
			await testFS.create({
				"package.json": JSON.stringify(pack, null, 2),
			});

			context.setData("package.json", pack);
			context.setData("version_new", "1.2.3");
			context.setData("lerna", true);

			await pkgPlugin.executeStage(context, DefaultStages.edit);

			const fileContent = JSON.parse(await fs.readFile(packPath, "utf8"));
			expect(fileContent).toEqual(pack);
		});

		it("and not during a dry run", async () => {
			const pkgPlugin = new PackagePlugin();
			const context = createMockContext({
				plugins: [pkgPlugin],
				cwd: testFSRoot,
				argv: {
					dryRun: true,
				},
			});
			const packPath = path.join(testFSRoot, "package.json");
			const pack = {
				name: "test-package",
				version: "1.0.0",
			};
			await testFS.create({
				"package.json": JSON.stringify(pack, null, 2),
			});

			context.setData("package.json", pack);
			context.setData("version_new", "1.2.3");

			await pkgPlugin.executeStage(context, DefaultStages.edit);

			const fileContent = JSON.parse(await fs.readFile(packPath, "utf8"));
			expect(fileContent).toEqual(pack);
		});

		it("defers the versioning to yarn for yarn-managed monorepos (no lerna)", async () => {
			const pkgPlugin = new PackagePlugin();
			const context = createMockContext({
				plugins: [pkgPlugin],
				cwd: testFSRoot,
			});

			const oldVersion = "1.2.3";
			const newVersion = "1.2.4";

			const pack = {
				name: "test-package",
				version: oldVersion,
				workspaces: ["packages/*"],
			};
			await testFS.create({
				"package.json": JSON.stringify(pack, null, 2),
				".yarnrc.yml": fixtures.yarnrc_complete,
			});

			context.setData("package.json", pack);
			context.setData("version", oldVersion);
			context.setData("version_new", newVersion);
			context.setData("monorepo", "yarn");

			context.sys.mockExec((cmd) =>
				cmd.includes("changed list")
					? `
{"name":"@package/foo","location":"packages/foo"}
{"name":"@package/bar","location":"packages/bar"}`
					: "",
			);

			await pkgPlugin.executeStage(context, DefaultStages.edit);
			expect(context.errors).toHaveLength(0);

			expect(context.cli.log).toHaveBeenCalledWith(expect.stringMatching("@package/foo"));
			expect(context.cli.log).toHaveBeenCalledWith(expect.stringMatching("@package/bar"));

			const expectedCommands = [
				[
					"yarn",
					"changed",
					"foreach",
					`--git-range=v${pack.version}`,
					"version",
					newVersion,
					"--deferred",
				],
				["yarn", "version", newVersion, "--deferred"],
				["yarn", "version", "apply", "--all"],
			];
			for (const [cmd, ...args] of expectedCommands) {
				expect(context.sys.exec).toHaveBeenCalledWith(cmd, args, expect.anything());
			}
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

		it("executes npm/yarn install if the lockfile should be synchronized", async () => {
			const pkgPlugin = new PackagePlugin();
			const context = createMockContext({
				plugins: [pkgPlugin],
				cwd: testFSRoot,
				argv: {
					updateLockfile: true,
				},
			});

			// Don't throw when calling system commands
			context.sys.mockExec(() => "");

			// Mock pak
			const pakInstall = vi.fn().mockResolvedValue({ success: true });
			(detectPackageManager as Mock).mockReturnValue({
				install: pakInstall,
			});

			await pkgPlugin.executeStage(context, DefaultStages.commit);

			expect(context.cli.log).toHaveBeenCalledWith(
				expect.stringMatching(/updating lockfile/i),
			);
			expect(pakInstall).toHaveBeenCalled();
		});

		it("but not during a dry run", async () => {
			const pkgPlugin = new PackagePlugin();
			const context = createMockContext({
				plugins: [pkgPlugin],
				cwd: testFSRoot,
				argv: {
					updateLockfile: true,
					dryRun: true,
				},
			});

			// Don't throw when calling system commands
			context.sys.mockExec(() => "");

			// Mock pak
			const pakInstall = vi.fn().mockResolvedValue({ success: true });
			(detectPackageManager as Mock).mockReturnValue({
				install: pakInstall,
			});

			await pkgPlugin.executeStage(context, DefaultStages.commit);

			expect(context.cli.log).toHaveBeenCalledWith(
				expect.stringMatching(/updating lockfile/i),
			);
			expect(pakInstall).not.toHaveBeenCalled();
		});

		it("raises an error if npm/yarn install fails", async () => {
			const pkgPlugin = new PackagePlugin();
			const context = createMockContext({
				plugins: [pkgPlugin],
				cwd: testFSRoot,
				argv: {
					updateLockfile: true,
				},
			});

			// Don't throw when calling system commands
			context.sys.mockExec(() => "");

			// Mock pak
			const pakInstall = vi.fn().mockResolvedValue({ success: false, stderr: "NOOOO" });
			(detectPackageManager as Mock).mockReturnValue({
				install: pakInstall,
			});

			await pkgPlugin.executeStage(context, DefaultStages.commit);

			expect(context.cli.log).toHaveBeenCalledWith(
				expect.stringMatching(/updating lockfile/i),
			);
			expect(pakInstall).toHaveBeenCalled();
			expect(context.errors).toContainEqual(
				expect.stringMatching("Updating lockfile failed: NOOOO"),
			);
		});

		it("does nothing for yarn-managed monorepos (no lerna)", async () => {
			const pkgPlugin = new PackagePlugin();
			const context = createMockContext({
				plugins: [pkgPlugin],
				cwd: testFSRoot,
			});
			// Don't throw when calling system commands
			context.sys.mockExec(() => "");

			const packPath = path.join(testFSRoot, "package.json");
			const pack = {
				name: "test-package",
				version: "1.2.3",
				workspaces: ["packages/*"],
			};

			await testFS.create({
				"package.json": JSON.stringify(pack, null, 2),
				".yarnrc.yml": fixtures.yarnrc_complete,
			});

			context.setData("package.json", pack);
			context.setData("version_new", "1.2.4");
			context.setData("monorepo", "yarn");

			await pkgPlugin.executeStage(context, DefaultStages.commit);
			expect(context.errors).toHaveLength(0);

			const fileContent = JSON.parse(await fs.readFile(packPath, "utf8"));
			expect(fileContent).toEqual(pack);

			expect(context.sys.execRaw).not.toHaveBeenCalled();
		});
	});
});
