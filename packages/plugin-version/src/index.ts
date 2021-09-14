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
			const parsedVersion = semver.parse(version);
			const colors = context.cli.colors;

			let deleteLines = 2;
			let askOk = false;

			if (!context.argv.bump) {
				context.cli.log(`Version bump not provided`);
				let preid = context.argv.preid ?? parsedVersion?.prerelease?.[0];
				if (typeof preid !== "string" || !Number.isNaN(parseInt(preid, 10))) {
					preid = undefined;
				}
				context.argv.bump = await context.cli.select("Please choose a version", [
					{
						value: "major",
						label: `${colors.bold(semver.inc(version, "major")!)} (major)`,
						hint: "Breaking changes were introduced. This may include new features and bugfixes.",
					},
					{
						value: "minor",
						label: `${colors.bold(semver.inc(version, "minor")!)} (minor)`,
						hint: "A new feature was added without breaking things. This may include bugfixes.",
					},
					{
						value: "patch",
						label: `${colors.bold(semver.inc(version, "patch")!)} (patch)`,
						hint: "A bug was fixed without adding new functionality.",
					},
					{
						value: "prerelease",
						label: `${colors.bold(
							semver.inc(version, "prerelease", preid ?? "alpha")!,
						)} or similar (prerelease)`,
						hint: "Bump an existing prerelease suffix, behaves like prepatch otherwise.",
					},
					{
						value: "premajor",
						label: `${colors.bold(
							semver.inc(version, "premajor", preid ?? "alpha")!,
						)} or similar (premajor)`,
						hint: "To provide test versions before a major release.",
					},
					{
						value: "preminor",
						label: `${colors.bold(
							semver.inc(version, "preminor", preid ?? "alpha")!,
						)} or similar (preminor)`,
						hint: "To provide test versions before a minor release.",
					},
					{
						value: "prepatch",
						label: `${colors.bold(
							semver.inc(version, "prepatch", preid ?? "alpha")!,
						)} or similar (prepatch)`,
						hint: "To provide test versions before a patch release.",
					},
				]);
				deleteLines++;
			} else {
				askOk = true;
			}

			if (context.argv.bump.startsWith("pre")) {
				context.argv.preid = (
					await context.cli.ask("Please enter the desired prerelease identifier", "alpha")
				).trim();
				deleteLines++;
				askOk = true;
			} else {
				context.argv.preid = undefined;
			}
			const newVersion = semver.inc(version, context.argv.bump as any, context.argv.preid)!;
			context.cli.log(`Bumping version from ${version} to ${newVersion}`);
			if (askOk) {
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
				deleteLines++;
			}

			context.cli.clearLines(deleteLines);

			context.cli.log(
				`Bumping version from ${colors.blue(version)} to ${colors.green(
					newVersion,
				)} ${colors.green("✔")}`,
			);
			context.setData("version_new", newVersion);
		}
	}
}

export default VersionPlugin;
