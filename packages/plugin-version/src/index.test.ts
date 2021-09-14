import { DefaultStages } from "@alcalzone/release-script-core";
import { assertReleaseError, createMockContext } from "@alcalzone/release-script-testing";
import VersionPlugin from ".";

describe("Version plugin", () => {
	describe("edit stage", () => {
		it("asks for the version bump when none was provided", async () => {
			const versionPlugin = new VersionPlugin();
			const context = createMockContext({
				plugins: [versionPlugin],
			});
			context.setData("version", "1.2.3");
			(context.cli.select as jest.Mock).mockResolvedValue("1.2.4");

			await versionPlugin.executeStage(context, DefaultStages.edit);

			expect(context.cli.select).toHaveBeenCalledWith(
				"Please choose a version",
				expect.arrayContaining([
					expect.objectContaining({ value: "2.0.0" }),
					expect.objectContaining({ value: "1.3.0" }),
					expect.objectContaining({ value: "1.2.4" }),
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

			await versionPlugin.executeStage(context, DefaultStages.edit);

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
				() => versionPlugin.executeStage(context, DefaultStages.edit),
				{
					fatal: true,
					messageMatches: /aborted/i,
				},
			);
		});
	});
});
