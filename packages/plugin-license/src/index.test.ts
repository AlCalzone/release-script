import { DefaultStages } from "@alcalzone/release-script-core";
import { createMockContext, TestFS } from "@alcalzone/release-script-testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import LicensePlugin from "./index.js";

const gplV3LicenseText = `GNU GENERAL PUBLIC LICENSE
                       Version 3, 29 June 2007

Copyright (C) 2007 Free Software Foundation, Inc. <https://fsf.org/>
Everyone is permitted to copy and distribute verbatim copies
of this license document, but changing it is not allowed.`;

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

		it("does not error for the GPL license text copyright notice", async () => {
			const licPlugin = new LicensePlugin();
			const context = createMockContext({
				plugins: [licPlugin],
				cwd: testFSRoot,
				argv: {
					license: ["{LICENSE,README}{,.md}"],
				},
			});

			await testFS.create({
				LICENSE: gplV3LicenseText,
			});

			await licPlugin.executeStage(context, DefaultStages.check);
			expect(context.errors).toHaveLength(0);
		});

		it("still errors for outdated project copyright notices in GPL-licensed files", async () => {
			const licPlugin = new LicensePlugin();
			const context = createMockContext({
				plugins: [licPlugin],
				cwd: testFSRoot,
				argv: {
					license: ["{LICENSE,README}{,.md}"],
				},
			});
			const outdatedYear = new Date().getFullYear() - 1;

			await testFS.create({
				LICENSE: `Copyright (c) ${outdatedYear} Project Author

${gplV3LicenseText}`,
			});

			await licPlugin.executeStage(context, DefaultStages.check);
			expect(context.errors).toContainEqual(expect.stringMatching("outdated copyright year"));
			expect(context.errors).toContainEqual(expect.stringMatching(`${outdatedYear}`));
			expect(context.errors).not.toContainEqual(expect.stringMatching("2007"));
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
