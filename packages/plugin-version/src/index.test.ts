import { DefaultStages } from "@alcalzone/release-script-core";
import { assertReleaseError, createMockContext, TestFS } from "@alcalzone/release-script-testing";
import fs from "fs-extra";
import path from "path";
import VersionPlugin from ".";

describe("Version plugin", () => {
	describe("check stage", () => {
		it("asks for the version bump when none was provided", async () => {
			const versionPlugin = new VersionPlugin();
			const context = createMockContext({
				plugins: [versionPlugin],
			});
			context.setData("version", "1.2.3");
			(context.cli.select as jest.Mock).mockResolvedValue("patch");

			await versionPlugin.executeStage(context, DefaultStages.check);

			expect(context.cli.select).toHaveBeenCalledWith(
				"Please choose a version",
				expect.arrayContaining([
					expect.objectContaining({
						value: expect.stringContaining("major"),
						label: expect.stringContaining("2.0.0"),
					}),
					expect.objectContaining({
						value: expect.stringContaining("minor"),
						label: expect.stringContaining("1.3.0"),
					}),
					expect.objectContaining({
						value: expect.stringContaining("patch"),
						label: expect.stringContaining("1.2.4"),
					}),
				]),
			);
			expect(context.getData<string>("version_new")).toBe("1.2.4");
		});

		it("confirms the version bump otherwise", async () => {
			const versionPlugin = new VersionPlugin();
			const context = createMockContext({
				plugins: [versionPlugin],
				argv: {
					bump: "major",
				},
			});
			context.setData("version", "1.2.3");
			(context.cli.select as jest.Mock).mockResolvedValue("yes");

			await versionPlugin.executeStage(context, DefaultStages.check);

			expect(context.cli.select).toHaveBeenCalledWith(
				"Is this okay?",
				expect.arrayContaining([
					expect.objectContaining({ value: "yes" }),
					expect.objectContaining({ value: "no" }),
				]),
			);
			expect(context.getData<string>("version_new")).toBe("2.0.0");
		});

		it("raises a fatal error when the user does not agree", async () => {
			const versionPlugin = new VersionPlugin();
			const context = createMockContext({
				plugins: [versionPlugin],
				argv: {
					bump: "major",
				},
			});
			context.setData("version", "1.2.3");
			(context.cli.select as jest.Mock).mockResolvedValue("no");

			await assertReleaseError(
				() => versionPlugin.executeStage(context, DefaultStages.check),
				{
					fatal: true,
					messageMatches: /aborted/i,
				},
			);
		});

		it("if versionFiles is given, checks that each pattern is a valid regular expression", async () => {
			const versionPlugin = new VersionPlugin();
			const context = createMockContext({
				plugins: [versionPlugin],
				argv: { bump: "major" },
			});
			context.setData("version", "1.2.3");
			(context.cli.select as jest.Mock).mockResolvedValue("yes");

			// Error: invalid option
			context.errors = [];
			context.argv.versionFiles = "not an array" as any;
			await versionPlugin.executeStage(context, DefaultStages.check);
			expect(context.errors).toContainEqual(
				expect.stringMatching(/versionFiles must be an array of tuples/i),
			);

			// Error: not a string
			context.errors = [];
			context.argv.versionFiles = [["widget/**/*.html", 1]] as any;
			await versionPlugin.executeStage(context, DefaultStages.check);
			expect(context.errors).toContainEqual(
				expect.stringMatching(/string or an array of strings/i),
			);

			// Error: not a string array
			context.errors = [];
			context.argv.versionFiles = [["widget/**/*.html", ["1", true]]] as any;
			await versionPlugin.executeStage(context, DefaultStages.check);
			expect(context.errors).toContainEqual(
				expect.stringMatching(/string or an array of strings/i),
			);

			// Test 4: does not parse
			context.errors = [];
			context.argv.versionFiles = [["widget/**/*.html", ['"version": "(.*?",']]] as any;
			await versionPlugin.executeStage(context, DefaultStages.check);
			expect(context.errors).toContainEqual(
				expect.stringMatching(/invalid regular expression/i),
			);

			// Test 5: succeeds:
			context.errors = [];
			context.argv.versionFiles = [["widget/**/*.html", ['"version": "(.*?)",']]] as any;
			await versionPlugin.executeStage(context, DefaultStages.check);
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

		it("updates the version in matched files", async () => {
			const versionPlugin = new VersionPlugin();
			const context = createMockContext({
				plugins: [versionPlugin],
				cwd: testFSRoot,
			});
			context.setData("version_new", "2.0.0");

			await testFS.create({
				"widget/test/1.html": `<b>Version: "1.2.3"</b>`,
				"widget/test2.html": `<b>Version: 1.2.3</b>`,
				"widget/test.js": `var v = {
	"version": "1.2.3",
};`,
			});
			context.argv.versionFiles = [
				["widget/*.html", `(?<=>Version: )(.*?)(?=<)`],
				["widget/**/*.*", [`(?<="version": ")(.*?)(?=",)`, `(?<=Version: ")(.*?)(?=")`]],
			] as any;

			await versionPlugin.executeStage(context, DefaultStages.edit);

			expect(
				(await fs.readFile(path.join(testFSRoot, "widget/test/1.html"), "utf8")).trim(),
			).toBe(`<b>Version: "2.0.0"</b>`);
			expect(
				(await fs.readFile(path.join(testFSRoot, "widget/test2.html"), "utf8")).trim(),
			).toBe(`<b>Version: 2.0.0</b>`);
			expect((await fs.readFile(path.join(testFSRoot, "widget/test.js"), "utf8")).trim())
				.toBe(`var v = {
	"version": "2.0.0",
};`);
		});
	});
});
