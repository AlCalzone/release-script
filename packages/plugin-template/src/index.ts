import { DefaultStages } from "@alcalzone/release-script-core";
import type { Context, Plugin, Stage } from "@alcalzone/release-script-core/types";

class TemplatePlugin implements Plugin {
	public readonly id = "template";
	public readonly stages = [
		DefaultStages.check,
		// Add others as necessary
	];

	// dependencies?: string[] | undefined;
	// stageDependencies?: Record<string, ConstOrDynamic<string[]>> | undefined;

	async executeStage(context: Context, stage: Stage): Promise<void> {
		if (stage.id === "check") {
			context.cli.log("Hello World!");
		}
	}
}

export default TemplatePlugin;
