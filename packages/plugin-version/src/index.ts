import { DefaultStages } from "@alcalzone/release-script-core";
import type { Context, Plugin, Stage } from "@alcalzone/release-script-core/types";
import semver from "semver";

class VersionPlugin implements Plugin {
	public readonly id = "version";
	public readonly stages = [DefaultStages.check];

	public readonly stageAfter = {
		check: "*" as const,
	};

	async executeStage(context: Context, stage: Stage): Promise<void> {
		if (stage.id === "check") {
			const version = context.getData<string>("version");
			let newVersion: string;
			if (!context.argv.bump) {
				context.cli.log(`Version bump not provided`);
				context.argv.bump = await context.cli.select("Please choose a version", [
					{
						value: "major",
						label: `major (${semver.inc(version, "major")!})`,
					},
					{
						value: "minor",
						label: `minor (${semver.inc(version, "minor")!})`,
					},
					{
						value: "patch",
						label: `patch (${semver.inc(version, "patch")!})`,
					},
				]);
				newVersion = semver.inc(version, context.argv.bump as any)!;
			} else {
				newVersion = semver.inc(version, context.argv.bump as any)!;
				context.cli.log(`Bumping version from ${version} to ${newVersion}`);
				const ok =
					(await context.cli.select("Is this okay?", [
						{
							value: "yes",
							label: "yes",
						},
						{
							value: "no",
							label: "no",
						},
					])) === "yes";
				if (!ok) context.cli.fatal("Aborted by user");
			}
			context.cli.clearLines(2);

			context.cli.log(
				`Bumping version from ${version} to ${newVersion} ${context.cli.colors.green("✔")}`,
			);
			context.setData("version_new", newVersion);
		}
	}
}

export default VersionPlugin;
