import { createMockContext } from "@alcalzone/release-script-testing";
import ExecPlugin from ".";

describe("Exec plugin", () => {
	it("runs the correct script in the correct stage", async () => {
		const execPlugin = new ExecPlugin();
		const context = createMockContext({
			plugins: [execPlugin],
			argv: {
				exec_commands: {
					before_check: "echo before_check",
					after_push: "echo after_push",
				} as any,
			},
		});

		context.sys.mockExec(() => "");

		execPlugin.init(context);

		await execPlugin.executeStage(
			context,
			execPlugin.stages.find((s) => s.id === "before_check")!,
		);
		expect(context.sys.execRaw).toHaveBeenCalledWith("echo before_check", expect.anything());
		expect(context.sys.execRaw).not.toHaveBeenCalledWith("echo after_push", expect.anything());

		await execPlugin.executeStage(
			context,
			execPlugin.stages.find((s) => s.id === "after_push")!,
		);
		expect(context.sys.execRaw).toHaveBeenCalledWith("echo after_push", expect.anything());
	});
});
