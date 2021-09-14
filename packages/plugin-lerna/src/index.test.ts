import { DefaultStages } from "@alcalzone/release-script-core";
import { assertReleaseError, createMockContext, TestFS } from "@alcalzone/release-script-testing";
import LernaPlugin from ".";

describe("Lerna plugin", () => {
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

		it("raises a fatal error when lerna.json is missing from cwd", async () => {
			const lernaPlugin = new LernaPlugin();
			const context = createMockContext({
				plugins: [lernaPlugin],
				cwd: testFSRoot,
			});

			await assertReleaseError(() => lernaPlugin.executeStage(context, DefaultStages.check), {
				fatal: true,
				messageMatches: /no lerna.json found/i,
			});
		});

		it("raises a fatal error when lerna.json contains no version field", async () => {
			const lernaPlugin = new LernaPlugin();
			const context = createMockContext({
				plugins: [lernaPlugin],
				cwd: testFSRoot,
			});

			await testFS.create({
				"lerna.json": JSON.stringify({}),
			});

			await assertReleaseError(() => lernaPlugin.executeStage(context, DefaultStages.check), {
				fatal: true,
				messageMatches: /missing property version/i,
			});
		});

		it("raises a fatal error when lerna.json operates in independent mode", async () => {
			const lernaPlugin = new LernaPlugin();
			const context = createMockContext({
				plugins: [lernaPlugin],
				cwd: testFSRoot,
			});

			await testFS.create({
				"lerna.json": JSON.stringify({
					version: "independent",
				}),
			});

			await assertReleaseError(() => lernaPlugin.executeStage(context, DefaultStages.check), {
				fatal: true,
				messageMatches: /independent versioning is not supported/i,
			});
		});

		it("raises a fatal error when lerna.json contains a non-semver version", async () => {
			const lernaPlugin = new LernaPlugin();
			const context = createMockContext({
				plugins: [lernaPlugin],
				cwd: testFSRoot,
			});

			await testFS.create({
				"lerna.json": JSON.stringify({
					version: "a.b.c",
				}),
			});

			await assertReleaseError(() => lernaPlugin.executeStage(context, DefaultStages.check), {
				fatal: true,
				messageMatches: /invalid version "a.b.c"/i,
			});
		});

		it("warns if --amend is set in lerna.json", async () => {
			const lernaPlugin = new LernaPlugin();
			const context = createMockContext({
				plugins: [lernaPlugin],
				cwd: testFSRoot,
			});

			await testFS.create({
				"lerna.json": JSON.stringify({
					version: "1.2.3",
					amend: true,
				}),
			});

			await lernaPlugin.executeStage(context, DefaultStages.check);
			expect(context.warnings).toContainEqual(expect.stringMatching(`"amend" in lerna.json`));
		});

		it("warns if --push is true in lerna.json", async () => {
			const lernaPlugin = new LernaPlugin();
			const context = createMockContext({
				plugins: [lernaPlugin],
				cwd: testFSRoot,
			});

			await testFS.create({
				"lerna.json": JSON.stringify({
					version: "1.2.3",
					push: true,
				}),
			});

			await lernaPlugin.executeStage(context, DefaultStages.check);
			expect(context.warnings).toContainEqual(
				expect.stringMatching(`"push: true" in lerna.json`),
			);
		});

		it("errors if --push is false in lerna.json", async () => {
			const lernaPlugin = new LernaPlugin();
			const context = createMockContext({
				plugins: [lernaPlugin],
				cwd: testFSRoot,
			});

			await testFS.create({
				"lerna.json": JSON.stringify({
					version: "1.2.3",
					push: false,
				}),
			});

			await lernaPlugin.executeStage(context, DefaultStages.check);
			expect(context.errors).toContainEqual(
				expect.stringMatching(`"push: false" in lerna.json`),
			);
		});

		it("happy path", async () => {
			const lernaPlugin = new LernaPlugin();
			const context = createMockContext({
				plugins: [lernaPlugin],
				cwd: testFSRoot,
			});

			await testFS.create({
				"lerna.json": JSON.stringify({
					version: "1.2.3",
				}),
			});

			await lernaPlugin.executeStage(context, DefaultStages.check);
			expect(context.getData("lerna")).toBeTrue();
		});
	});
});
