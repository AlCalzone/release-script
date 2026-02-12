import { DefaultStages } from "@alcalzone/release-script-core";
import { assertReleaseError, createMockContext, TestFS } from "@alcalzone/release-script-testing";
import fs from "node:fs/promises";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import IoBrokerPlugin from "./index.js";

const mockTranslate = { translate: "mock" };
vi.mock("./translate", () => ({
	translateText: () => mockTranslate,
}));

const fixtures = {
	ioPackage_noVersion: JSON.stringify({
		name: "test-adapter",
	}),
	ioPackage_invalidVersion: JSON.stringify({
		name: "test-adapter",
		common: { version: "a.b.c" },
	}),
	ioPackage_correctVersion: JSON.stringify({
		name: "test-adapter",
		common: { version: "1.2.3" },
	}),
	ioPackage_bumped: JSON.stringify(
		{
			name: "test-adapter",
			common: {
				version: "2.0.0",
				news: {
					"2.0.0": mockTranslate,
				},
			},
		},
		null,
		2,
	),
	ioPackage_incorrectVersion: JSON.stringify({
		name: "test-adapter",
		common: { version: "1.2.4" },
	}),
	ioPackage_prereleaseVersion: JSON.stringify({
		name: "test-adapter",
		common: { version: "1.2.4" },
	}),
	ioPackage_tooManyNews: JSON.stringify({
		name: "test-adapter",
		common: {
			version: "1.2.3",
			news: {
				"1.2.3": "c",
				"1.2.2": "b",
				"1.2.1": "a",
			},
		},
	}),
	ioPackage_tooManyNews_bumped: JSON.stringify(
		{
			name: "test-adapter",
			common: {
				version: "2.0.0",
				news: {
					"2.0.0": mockTranslate,
					"1.2.3": "c",
				},
			},
		},
		null,
		2,
	),
	ioPackage_news_NEXT: JSON.stringify({
		name: "test-adapter",
		common: {
			version: "1.2.3",
			news: {
				NEXT: { foo: ":)" },
				"1.2.3": "c",
			},
		},
	}),
	ioPackage_news_NEXT_bumped: JSON.stringify(
		{
			name: "test-adapter",
			common: {
				version: "2.0.0",
				news: {
					"2.0.0": { foo: ":)" },
					"1.2.3": "c",
				},
			},
		},
		null,
		2,
	),

	package_version: "1.2.3",
	package_version_prerelease: "1.2.4-alpha.0",
	test_workflow: `
  deploy:
    needs: [lint, unit-tests]

    # blabla
    if: |
      contains(github.event.head_commit.message, '[skip ci]') == false &&
      github.event_name == 'push' &&
      startsWith(github.ref, 'refs/tags/v') &&
      github.event.base_ref == 'refs/heads/master'
`,
};

describe("ioBroker plugin", () => {
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

		it("raises a fatal error when io-package.json is missing from cwd", async () => {
			const iobPlugin = new IoBrokerPlugin();
			const context = createMockContext({
				plugins: [iobPlugin],
				cwd: testFSRoot,
			});

			await assertReleaseError(() => iobPlugin.executeStage(context, DefaultStages.check), {
				fatal: true,
				messageMatches: /io-package.json not found/i,
			});
		});

		it("raises a fatal error when io-package.json is missing from the specified directory", async () => {
			const iobPlugin = new IoBrokerPlugin();
			const context = createMockContext({
				plugins: [iobPlugin],
				cwd: testFSRoot,
				argv: {
					ioPackage: "packages/foobar",
				},
			});

			await assertReleaseError(() => iobPlugin.executeStage(context, DefaultStages.check), {
				fatal: true,
				messageMatches: /io-package.json not found/i,
			});
		});

		it("raises an error when io-package.json has a missing version", async () => {
			const iobPlugin = new IoBrokerPlugin();
			const context = createMockContext({
				plugins: [iobPlugin],
				cwd: testFSRoot,
			});

			await testFS.create({
				"io-package.json": fixtures.ioPackage_noVersion,
			});

			await iobPlugin.executeStage(context, DefaultStages.check);
			expect(context.errors).toContainEqual(expect.stringMatching(/version missing/i));
		});

		it("raises an error when io-package.json has a non-semver version", async () => {
			const iobPlugin = new IoBrokerPlugin();
			const context = createMockContext({
				plugins: [iobPlugin],
				cwd: testFSRoot,
			});

			await testFS.create({
				"io-package.json": fixtures.ioPackage_invalidVersion,
			});
			await iobPlugin.executeStage(context, DefaultStages.check);
			expect(context.errors).toContainEqual(
				expect.stringMatching(/invalid version "a.b.c"/i),
			);
		});

		it("raises an error when io-package.json's version is different from the one in package.json", async () => {
			const iobPlugin = new IoBrokerPlugin();
			const context = createMockContext({
				plugins: [iobPlugin],
				cwd: testFSRoot,
			});
			context.setData("version", fixtures.package_version);

			await testFS.create({
				"io-package.json": fixtures.ioPackage_incorrectVersion,
			});
			await iobPlugin.executeStage(context, DefaultStages.check);
			expect(context.errors).toContainEqual(expect.stringMatching(/version mismatch/i));
		});

		it("unless ioPackageNoPrerelease is true and the main part matches", async () => {
			const iobPlugin = new IoBrokerPlugin();
			const context = createMockContext({
				plugins: [iobPlugin],
				cwd: testFSRoot,
				argv: {
					ioPackageNoPrerelease: true,
				},
			});
			context.setData("version", fixtures.package_version_prerelease);

			await testFS.create({
				"io-package.json": fixtures.ioPackage_prereleaseVersion,
			});
			await iobPlugin.executeStage(context, DefaultStages.check);
			expect(context.errors).toHaveLength(0);
		});

		it("happy path 1", async () => {
			const iobPlugin = new IoBrokerPlugin();
			const context = createMockContext({
				plugins: [iobPlugin],
				cwd: testFSRoot,
			});
			context.setData("version", fixtures.package_version);

			await testFS.create({
				"io-package.json": fixtures.ioPackage_correctVersion,
			});
			await iobPlugin.executeStage(context, DefaultStages.check);
			expect(context.errors).toHaveLength(0);

			expect(context.cli.log).toHaveBeenCalledWith(
				expect.stringMatching("io-package.json ok"),
			);
		});

		it("happy path 2", async () => {
			const iobPlugin = new IoBrokerPlugin();
			const context = createMockContext({
				plugins: [iobPlugin],
				cwd: testFSRoot,
				argv: {
					ioPackage: "packages/foobar",
				},
			});
			context.setData("version", fixtures.package_version);

			await testFS.create({
				"packages/foobar/io-package.json": fixtures.ioPackage_correctVersion,
			});
			await iobPlugin.executeStage(context, DefaultStages.check);
			expect(context.errors).toHaveLength(0);

			expect(context.cli.log).toHaveBeenCalledWith(
				expect.stringMatching("io-package.json ok"),
			);
		});

		it("raises an error when test-and-release.yml is outdated", async () => {
			const iobPlugin = new IoBrokerPlugin();
			const context = createMockContext({
				plugins: [iobPlugin],
				cwd: testFSRoot,
			});
			context.setData("version", fixtures.package_version);
			await testFS.create({
				"io-package.json": fixtures.ioPackage_correctVersion,
				".github/workflows/test-and-release.yml": fixtures.test_workflow,
			});
			await iobPlugin.executeStage(context, DefaultStages.check);
			expect(context.errors).toContainEqual(expect.stringMatching(/test-and-release.yml/i));
		});

		it("ignores test-and-release.yml when --no-workflow-check is set", async () => {
			const iobPlugin = new IoBrokerPlugin();
			const context = createMockContext({
				plugins: [iobPlugin],
				cwd: testFSRoot,
				argv: {
					noWorkflowCheck: true,
				},
			});
			context.setData("version", fixtures.package_version);
			await testFS.create({
				"io-package.json": fixtures.ioPackage_correctVersion,
				".github/workflows/test-and-release.yml": fixtures.test_workflow,
			});
			await iobPlugin.executeStage(context, DefaultStages.check);
			expect(context.errors).toHaveLength(0);
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
			const iobPlugin = new IoBrokerPlugin();
			const context = createMockContext({
				plugins: [iobPlugin],
				cwd: testFSRoot,
			});

			context.setData("io-package.json", JSON.parse(fixtures.ioPackage_correctVersion));
			context.setData("version_new", "2.0.0");
			context.setData("changelog_new", "This is new");

			await iobPlugin.executeStage(context, DefaultStages.edit);

			expect(context.cli.log).toHaveBeenCalledWith(
				expect.stringMatching(/updating io-package.json version/i),
			);
			expect(context.cli.log).toHaveBeenCalledWith(expect.stringMatching("2.0.0"));
		});

		it("updates the version in io-package.json", async () => {
			const iobPlugin = new IoBrokerPlugin();
			const context = createMockContext({
				plugins: [iobPlugin],
				cwd: testFSRoot,
			});

			context.setData("io-package.json", JSON.parse(fixtures.ioPackage_correctVersion));
			context.setData("version_new", "2.0.0");
			context.setData("changelog_new", "This is new");

			await iobPlugin.executeStage(context, DefaultStages.edit);

			const packPath = path.join(testFSRoot, "io-package.json");
			const fileContent = (await fs.readFile(packPath, "utf8")).trim();
			expect(fileContent).toBe(fixtures.ioPackage_bumped);
		});

		it("removes older news entries from io-package.json", async () => {
			const iobPlugin = new IoBrokerPlugin();
			const context = createMockContext({
				plugins: [iobPlugin],
				cwd: testFSRoot,
				argv: {
					numNews: 2,
				},
			});

			context.setData("io-package.json", JSON.parse(fixtures.ioPackage_tooManyNews));
			context.setData("version_new", "2.0.0");
			context.setData("changelog_new", "This is new");

			await iobPlugin.executeStage(context, DefaultStages.edit);

			const packPath = path.join(testFSRoot, "io-package.json");
			const fileContent = (await fs.readFile(packPath, "utf8")).trim();
			expect(fileContent).toBe(fixtures.ioPackage_tooManyNews_bumped);
		});

		it("preserves the NEXT news in io-package.json", async () => {
			const iobPlugin = new IoBrokerPlugin();
			const context = createMockContext({
				plugins: [iobPlugin],
				cwd: testFSRoot,
				argv: {
					numNews: 2,
				},
			});

			context.setData("io-package.json", JSON.parse(fixtures.ioPackage_news_NEXT));
			context.setData("version_new", "2.0.0");
			context.setData("changelog_new", "This is new");

			await iobPlugin.executeStage(context, DefaultStages.edit);

			const packPath = path.join(testFSRoot, "io-package.json");
			const fileContent = (await fs.readFile(packPath, "utf8")).trim();
			expect(fileContent).toBe(fixtures.ioPackage_news_NEXT_bumped);
		});
	});
});
