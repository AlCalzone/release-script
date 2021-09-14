import { DefaultStages } from "@alcalzone/release-script-core";
import { assertReleaseError, createMockContext, TestFS } from "@alcalzone/release-script-testing";
import IoBrokerPlugin from ".";

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
	ioPackage_incorrectVersion: JSON.stringify({
		name: "test-adapter",
		common: { version: "1.2.4" },
	}),
	package_version: "1.2.3",
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
			const pkgPlugin = new IoBrokerPlugin();
			const context = createMockContext({
				plugins: [pkgPlugin],
				cwd: testFSRoot,
			});

			await assertReleaseError(() => pkgPlugin.executeStage(context, DefaultStages.check), {
				fatal: true,
				messageMatches: /io-package.json not found/i,
			});
		});

		it("raises a fatal error when io-package.json is missing from the specified directory", async () => {
			const pkgPlugin = new IoBrokerPlugin();
			const context = createMockContext({
				plugins: [pkgPlugin],
				cwd: testFSRoot,
				argv: {
					ioPackage: "packages/foobar",
				},
			});

			await assertReleaseError(() => pkgPlugin.executeStage(context, DefaultStages.check), {
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
});
