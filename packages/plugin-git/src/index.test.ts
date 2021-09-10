import { DefaultStages } from "@alcalzone/release-script-core";
import { assertReleaseError, createMockContext } from "@alcalzone/release-script-testing";
import execa from "execa";
import GitPlugin from ".";
jest.mock("execa");

const execaMock = execa as jest.MockedFunction<typeof execa>;

function mockCommands(commands: Record<string, string>) {
	execa.command = jest.fn().mockImplementation((command) => {
		if (command in commands) {
			return { stdout: commands[command] };
		} else {
			throw new Error(`mock missing for command "${command}"!`);
		}
	});
	execaMock.mockImplementation((file, args: any) => {
		let command = `${file}`;
		if (args && args.length) {
			command += ` ${args.join(" ")}`;
		}

		if (command in commands) {
			return { stdout: commands[command] } as any;
		} else {
			throw new Error(`mock missing for command "${command}"!`);
		}
	});
}

describe("Git plugin", () => {
	afterEach(() => {
		execaMock.mockClear();
	});

	describe("check stage", () => {
		it("raises a fatal error when no git identity is configured", async () => {
			const gitPlugin = new GitPlugin();
			const context = createMockContext({ plugins: [gitPlugin] });

			mockCommands({
				"git config --get user.name": "",
				"git config --get user.email": "",
			});

			await assertReleaseError(() => gitPlugin.executeStage(context, DefaultStages.check), {
				fatal: true,
				messageMatches: /No git identity/i,
			});
		});

		it("raises a fatal error when there are remote changes", async () => {
			const gitPlugin = new GitPlugin();
			const context = createMockContext({ plugins: [gitPlugin] });

			mockCommands({
				"git config --get user.name": "henlo",
				"git config --get user.email": "this.is@dog",
				"git rev-list --left-right --count HEAD...origin": "0\t2",
			});

			await assertReleaseError(() => gitPlugin.executeStage(context, DefaultStages.check), {
				fatal: true,
				messageMatches: /local branch is behind/i,
			});
		});

		it("raises a fatal error when the branches have diverged", async () => {
			const gitPlugin = new GitPlugin();
			const context = createMockContext({ plugins: [gitPlugin] });

			mockCommands({
				"git config --get user.name": "henlo",
				"git config --get user.email": "this.is@dog",
				"git rev-list --left-right --count HEAD...origin": "1\t1",
			});

			await assertReleaseError(() => gitPlugin.executeStage(context, DefaultStages.check), {
				fatal: true,
				messageMatches: /different changes/i,
			});
		});

		it("raises a non-fatal error when there are uncommited changes without the --all option", async () => {
			const gitPlugin = new GitPlugin();
			const context = createMockContext({
				plugins: [gitPlugin],
				includeUnstaged: false,
			});

			mockCommands({
				"git config --get user.name": "henlo",
				"git config --get user.email": "this.is@dog",
				"git rev-list --left-right --count HEAD...origin": "1\t0",
				"git status --porcelain": "whatever",
			});

			await gitPlugin.executeStage(context, DefaultStages.check);
			expect(context.errors).toHaveLength(1);
			expect(context.errors[0]).toMatch(/uncommitted changes/i);
		});

		it("succeeds if there are uncommited changes with the --all option", async () => {
			const gitPlugin = new GitPlugin();
			const context = createMockContext({
				plugins: [gitPlugin],
				includeUnstaged: true,
			});

			mockCommands({
				"git config --get user.name": "henlo",
				"git config --get user.email": "this.is@dog",
				"git rev-list --left-right --count HEAD...origin": "1\t0",
				"git status --porcelain": "whatever",
			});

			await gitPlugin.executeStage(context, DefaultStages.check);
			expect(context.errors).toHaveLength(0);
		});

		it("succeeds if there are no uncommited changes", async () => {
			const gitPlugin = new GitPlugin();
			const context = createMockContext({
				plugins: [gitPlugin],
			});

			mockCommands({
				"git config --get user.name": "henlo",
				"git config --get user.email": "this.is@dog",
				"git rev-list --left-right --count HEAD...origin": "1\t0",
				"git status --porcelain": "",
			});

			await gitPlugin.executeStage(context, DefaultStages.check);
			expect(context.errors).toHaveLength(0);
		});
	});
});
