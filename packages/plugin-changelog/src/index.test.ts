import { DefaultStages } from "@alcalzone/release-script-core";
import { assertReleaseError, createMockContext, TestFS } from "@alcalzone/release-script-testing";
import ChangelogPlugin from ".";

const fixtures = {
	readme_noPlaceholder: `# README
stuff
## Changelog
### v1.2.3 Other release`,
	changelog_tooManyPlaceholders: `# Changelog
## **WORK IN PROGRESS** · Doomsday release
## **WORK IN PROGRESS** · Whoopsie
## v1.2.3 Other release`,
	changelog_empty: `# Changelog
## **WORK IN PROGRESS** · Doomsday release

## v1.2.3 Other release`,

	changelog_testParseHeader: `# Changelog`,
	changelog_testParse1: `## **WORK IN PROGRESS** · Doomsday release
* New entry 1
* New entry 2`,
	changelog_testParse2: `## v1.2.3 Other release
* Did something`,
	changelog_testParse3: `## v1.2.0 Other release
* Did something else`,

	readme_testParseHeader: `# README
stuff
## Changelog`,
	readme_testParse1: `### **WORK IN PROGRESS** · Doomsday release
* New entry 1
* New entry 2`,
	readme_testParse2: `### v1.2.3 Other release
* Did something`,
	readme_testParse3: `### v1.2.0 Other release
* Did something else`,

	changelog_old_testParseHeader: `# Changelog (older changes)`,
	changelog_old_testParse1: `## v1.0.0 Old release
* Did something`,
	changelog_old_testParse2: `## v0.0.1 Older release
* Did something else`,
	changelog_old_testParseFooter: `# Unrelated stuff`,
};

describe("Changelog plugin", () => {
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

		it("raises a fatal error when there is no README.md or CHANGELOG.md in the current directory", async () => {
			const changelogPlugin = new ChangelogPlugin();
			const context = createMockContext({
				plugins: [changelogPlugin],
				cwd: testFSRoot,
			});

			await assertReleaseError(
				() => changelogPlugin.executeStage(context, DefaultStages.check),
				{
					fatal: true,
					messageMatches: /No CHANGELOG.md or README.md/i,
				},
			);
		});

		it("raises an error when there is no changelog placeholder in the changelog", async () => {
			const changelogPlugin = new ChangelogPlugin();
			const context = createMockContext({
				plugins: [changelogPlugin],
				cwd: testFSRoot,
			});

			await testFS.create({
				"README.md": fixtures.readme_noPlaceholder,
			});

			await changelogPlugin.executeStage(context, DefaultStages.check);
			expect(context.errors).toContainEqual(expect.stringMatching(/placeholder is missing/i));
		});

		it("raises an error when there is more than one placeholder in the changelog", async () => {
			const changelogPlugin = new ChangelogPlugin();
			const context = createMockContext({
				plugins: [changelogPlugin],
				cwd: testFSRoot,
			});

			await testFS.create({
				"CHANGELOG.md": fixtures.changelog_tooManyPlaceholders,
			});

			await changelogPlugin.executeStage(context, DefaultStages.check);
			expect(context.errors).toContainEqual(
				expect.stringMatching(/more than one changelog placeholder/i),
			);
		});

		it("raises an error when the current changelog is empty", async () => {
			const changelogPlugin = new ChangelogPlugin();
			const context = createMockContext({
				plugins: [changelogPlugin],
				cwd: testFSRoot,
			});

			await testFS.create({
				"CHANGELOG.md": fixtures.changelog_empty,
			});

			await changelogPlugin.executeStage(context, DefaultStages.check);
			expect(context.errors).toContainEqual(expect.stringMatching(/changelog .+ is empty/i));
		});

		it("parses all changelog entries", async () => {
			const changelogPlugin = new ChangelogPlugin();
			const context = createMockContext({
				plugins: [changelogPlugin],
				cwd: testFSRoot,
			});

			await testFS.create({
				"CHANGELOG.md": `${fixtures.changelog_testParseHeader}
${fixtures.changelog_testParse1}

${fixtures.changelog_testParse2}

${fixtures.changelog_testParse3}`,
			});

			await changelogPlugin.executeStage(context, DefaultStages.check);
			expect(context.errors).toHaveLength(0);

			const headline = context.getData<string[]>("changelog_before");
			expect(headline).toBe(fixtures.changelog_testParseHeader + "\n");

			const entries = context.getData<string[]>("changelog_entries");
			expect(entries).toEqual([
				fixtures.changelog_testParse1,
				fixtures.changelog_testParse2,
				fixtures.changelog_testParse3,
			]);

			const footer = context.getData<string[]>("changelog_after");
			expect(footer).toBe("");

			const currentChangelog = context.getData<string[]>("changelog_new");
			expect(currentChangelog).toBe(`* New entry 1
* New entry 2`);
		});

		it("even if they are split across multiple files", async () => {
			const changelogPlugin = new ChangelogPlugin();
			const context = createMockContext({
				plugins: [changelogPlugin],
				cwd: testFSRoot,
			});

			await testFS.create({
				"README.md": `${fixtures.readme_testParseHeader}
${fixtures.readme_testParse1}

${fixtures.readme_testParse2}

${fixtures.readme_testParse3}`,
				"CHANGELOG_OLD.md": `${fixtures.changelog_old_testParseHeader}
${fixtures.changelog_old_testParse1}

${fixtures.changelog_old_testParse2}

${fixtures.changelog_old_testParseFooter}`,
			});

			await changelogPlugin.executeStage(context, DefaultStages.check);
			expect(context.errors).toHaveLength(0);

			const filename = context.getData<string[]>("changelog_filename");
			expect(filename).toBe("README.md");

			const headline = context.getData<string[]>("changelog_before");
			expect(headline).toBe(fixtures.readme_testParseHeader + "\n");

			const entries = context.getData<string[]>("changelog_entries");
			expect(entries).toEqual([
				fixtures.readme_testParse1,
				fixtures.readme_testParse2,
				fixtures.readme_testParse3,
				fixtures.changelog_old_testParse1,
				fixtures.changelog_old_testParse2,
			]);

			const footer = context.getData<string[]>("changelog_after");
			expect(footer).toBe("");

			const headlineOld = context.getData<string[]>("changelog_old_before");
			expect(headlineOld).toBe(fixtures.changelog_old_testParseHeader + "\n");
			const footer_old = context.getData<string[]>("changelog_old_after");
			expect(footer_old).toBe(fixtures.changelog_old_testParseFooter);

			const currentChangelog = context.getData<string[]>("changelog_new");
			expect(currentChangelog).toBe(`* New entry 1
* New entry 2`);
		});
	});
});
