import { DefaultStages } from "@alcalzone/release-script-core";
import type { Context, Plugin, Stage } from "@alcalzone/release-script-core/types";

class ManualReviewPlugin implements Plugin {
	public readonly id = "manual-review";
	public readonly stages = [DefaultStages.edit];

	// dependencies?: string[] | undefined;
	public readonly stageAfter = {
		edit: "*" as const,
	};
	// stageBefore?: Record<string, ConstOrDynamic<string[]>> | undefined;

	async executeStage(context: Context, stage: Stage): Promise<void> {
		if (stage.id === "edit" && !context.argv.dryRun) {
			context.cli.log("Please review the changes and correct them manually if necessary.");
			let result: boolean;
			do {
				result =
					(await context.cli.select("Are you done?", [
						{ value: "no", label: "no" },
						{ value: "yes", label: "yes" },
					])) === "yes";
			} while (!result);
		}
	}
}

export default ManualReviewPlugin;
