import { DefaultStages } from "@alcalzone/release-script-core";
import type { Context, Plugin, Stage } from "@alcalzone/release-script-core/types";
import { isArray, isObject } from "alcalzone-shared/typeguards";
import type { Argv } from "yargs";

class ExecPlugin implements Plugin {
	public readonly id = "exec";
	private _stages: Stage[] = [];
	public get stages(): Stage[] {
		return this._stages;
	}

	public defineCLIOptions(yargs: Argv<any>): Argv<any> {
		return yargs.options({
			exec: {
				alias: ["x"],
				description: `Define custom commands to be executed during the release process. Example:
--exec.before_commit="echo Hello World!"`,
			},
		});
	}

	init(context: Context): void {
		const commands = (context.argv.exec ?? {}) as any;

		if (
			isObject(commands) &&
			Object.keys(commands).every((c) => typeof c === "string") &&
			Object.values(commands).every(
				(c) =>
					typeof c === "string" || (isArray(c) && c.every((c) => typeof c === "string")),
			)
		) {
			// Parse provided commands into stages
			const stages = new Map<string, Stage>();
			for (const stage of Object.keys(commands)) {
				if (stages.has(stage)) continue;

				if (stage in DefaultStages) {
					stages.set(stage, (DefaultStages as any)[stage]);
				} else if (stage.startsWith("before_")) {
					const beforeStage = stage.substr(7);
					const afterStages = Object.values(DefaultStages)
						.filter((s) => s.before?.includes(beforeStage))
						.map((s) => s.id);
					// Make sure the before_xxx stages come after the previous stage and their after_xxx stages
					afterStages.push(...((DefaultStages as any)[beforeStage]?.after ?? []));
					for (const afterStage of afterStages) {
						if (`after_${afterStage}` in commands) {
							afterStages.push(`after_${afterStage}`);
						}
					}

					stages.set(stage, {
						id: stage,
						before: [beforeStage],
						after: afterStages.length ? afterStages : undefined,
					});
				} else if (stage.startsWith("after_")) {
					const afterStage = stage.substr(6);
					const beforeStages = Object.values(DefaultStages)
						.filter((s) => s.after?.includes(afterStage))
						.map((s) => s.id);
					// Make sure the after_xxx stages come before the next stage and their before_xxx stages
					beforeStages.push(...((DefaultStages as any)[afterStage]?.before ?? []));
					for (const beforeStage of beforeStages) {
						if (`before_${beforeStage}` in commands) {
							beforeStages.push(`before_${beforeStage}`);
						}
					}

					stages.set(stage, {
						id: stage,
						before: beforeStages.length ? beforeStages : undefined,
						after: [afterStage],
					});
				} else {
					stages.set(stage, {
						id: stage,
					});
				}
			}
			this.commands = commands;
			this._stages = [...stages.values()];
		} else {
			context.cli.fatal(
				`Argument "exec" is invalid. Must be an object containing strings or string arrays! Got ${JSON.stringify(
					commands,
				)}`,
			);
		}
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
