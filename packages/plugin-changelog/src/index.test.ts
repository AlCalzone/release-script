import { DefaultStages } from "@alcalzone/release-script-core";
import { assertReleaseError, createMockContext, TestFS } from "@alcalzone/release-script-testing";
import ChangelogPlugin from ".";
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
	});
});
