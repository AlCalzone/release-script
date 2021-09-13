import { DefaultStages } from "@alcalzone/release-script-core";
import type { Context, Plugin, Stage } from "@alcalzone/release-script-core/types";

class ExecPlugin implements Plugin {
	public readonly id = "exec";
	private _stages: Stage[] = [];
	public get stages(): Stage[] {
		return this._stages;
	}

	init(context: Context): void {
		this.commands = context.argv.exec_commands as any;

		// Parse provided commands into stages
		const stages = new Map<string, Stage>();
		for (const stage of Object.keys(this.commands)) {
			if (stages.has(stage)) continue;

			if (stage in DefaultStages) {
				stages.set(stage, (DefaultStages as any)[stage]);
			} else if (stage.startsWith("before_")) {
				stages.set(stage, {
					id: stage,
					before: [stage.substr(7)],
				});
			} else if (stage.startsWith("after_")) {
				stages.set(stage, {
					id: stage,
					after: [stage.substr(6)],
				});
			} else {
				stages.set(stage, {
					id: stage,
				});
			}
		}
		this._stages = [...stages.values()];
	}

	// dependencies?: string[] | undefined;
	// stageAfter?: Record<string, ConstOrDynamic<string[]>> | undefined;
	// stageBefore?: Record<string, ConstOrDynamic<string[]>> | undefined;

	private commands: Partial<Record<string, string | string[]>> = {};

	async executeStage(context: Context, stage: Stage): Promise<void> {
		let commands = this.commands[stage.id];
		if (!commands) return;

		// Normalize commands to an array
		if (typeof commands === "string") {
			commands = [commands];
		}

		// Execute commands
		const colors = context.cli.colors;
		for (const command of commands) {
			context.cli.logCommand(command);
			if (!context.argv.dryRun) {
				const promise = context.sys.execRaw(command, { cwd: context.cwd });
				promise.stdout?.on("data", (data) => {
					context.cli.log(
						colors.grey(colors.stripColors(data.toString().replace(/\r?\n$/, ""))),
					);
				});
				await promise;
			}
		}
	}
}

export default ExecPlugin;
