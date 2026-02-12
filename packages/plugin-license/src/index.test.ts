import { DefaultStages } from "@alcalzone/release-script-core";
import { createMockContext, TestFS } from "@alcalzone/release-script-testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import LicensePlugin from "./index.js";

describe("License plugin", () => {
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

		it("errors when the copyright year is outdated (Test 1)", async () => {
			const licPlugin = new LicensePlugin();
			const context = createMockContext({
				plugins: [licPlugin],
				cwd: testFSRoot,
				argv: {
					license: ["{LICENSE,README}{,.md}"],
				},
			});

			await testFS.create({
				"README.md": `## License
Apache 2.0 Copyright 2018-2020`,
			});

			await licPlugin.executeStage(context, DefaultStages.check);
			expect(context.errors).toContainEqual(expect.stringMatching("outdated copyright year"));
			expect(context.errors).toContainEqual(expect.stringMatching("2018-2020"));
		});

		it("errors when the copyright year is outdated (Test 2)", async () => {
			const licPlugin = new LicensePlugin();
			const context = createMockContext({
				plugins: [licPlugin],
				cwd: testFSRoot,
				argv: {
					license: ["{LICENSE,README}{,.md}"],
				},
			});

			await testFS.create({
				"LICENSE.md": `Copyright 2018 me@is-cool.de`,
			});

			await licPlugin.executeStage(context, DefaultStages.check);
			expect(context.errors).toContainEqual(expect.stringMatching("outdated copyright year"));
			expect(context.errors).toContainEqual(expect.stringMatching("2018"));
		});

		it("errors when the copyright year is outdated (Test 3)", async () => {
			const licPlugin = new LicensePlugin();
			const context = createMockContext({
				plugins: [licPlugin],
				cwd: testFSRoot,
				argv: {
					license: ["{LICENSE,README}{,.md}"],
				},
			});

			await testFS.create({
				LICENSE: `Copyright (C) 2018 - 2019 me@is-cool.de`,
				"README.md": `Copyright 2017 me@is-cool.de`,
			});

			await licPlugin.executeStage(context, DefaultStages.check);
			expect(context.errors).toContainEqual(expect.stringMatching("outdated copyright year"));
			expect(context.errors).toContainEqual(expect.stringMatching("2018 - 2019"));
			expect(context.errors).toContainEqual(expect.stringMatching("2017"));
		});

		it("errors when the copyright year is outdated (Test 3)", async () => {
			const licPlugin = new LicensePlugin();
			const context = createMockContext({
				plugins: [licPlugin],
				cwd: testFSRoot,
				argv: {
					license: ["packages/**/{LICENSE,README}{,.md}"],
				},
			});

			await testFS.create({
				"packages/p1/LICENSE": `Copyright ${new Date().getFullYear()} is ok`,
				"packages/p2/README.md": `Copyright 2017 me@is-cool.de`,
			});

			await licPlugin.executeStage(context, DefaultStages.check);
			expect(context.errors).toContainEqual(
				expect.stringMatching(/packages[\\/]p2[\\/]README.md/i),
			);
			expect(context.errors).not.toContainEqual(
				expect.stringMatching(/packages[\\/]p1[\\/]LICENSE/i),
			);
		});
	});
});
