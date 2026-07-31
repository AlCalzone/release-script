import { DefaultStages, pathExists } from "@alcalzone/release-script-core";
import type { Context, Plugin, Stage } from "@alcalzone/release-script-core/types";
import fs from "node:fs/promises";
import path from "path";
import glob from "tiny-glob";
import type { Argv } from "yargs";

const GPL_LICENSE_TEXT_REGEX = /\bGNU\s+(?:AFFERO\s+|LESSER\s+)?GENERAL\s+PUBLIC\s+LICENSE\b/i;
const FREE_SOFTWARE_FOUNDATION_REGEX = /\bFree Software Foundation\b/i;

function getLineContainingMatch(content: string, match: RegExpExecArray): string {
	const lineStart = content.lastIndexOf("\n", match.index) + 1;
	const lineEnd = content.indexOf("\n", match.index + match[0].length);
	return content.slice(lineStart, lineEnd === -1 ? content.length : lineEnd);
}

function isKnownLicenseTextCopyright(content: string, match: RegExpExecArray): boolean {
	// GPL-family license texts contain the Free Software Foundation's own
	// copyright notice. This is part of the license text, not the project's
	// copyright notice, so it must not make the check fail.
	if (!GPL_LICENSE_TEXT_REGEX.test(content)) return false;

	return FREE_SOFTWARE_FOUNDATION_REGEX.test(getLineContainingMatch(content, match));
}

class LicensePlugin implements Plugin {
	public readonly id = "license";
	public readonly stages = [DefaultStages.check];

	public defineCLIOptions(yargs: Argv<any>): Argv<any> {
		return yargs.options({
			license: {
				string: true,
				array: true,
				description: `Globs matching the license files to check`,
				default: ["{LICENSE,README}{,.md}"],
			},
		});
	}

	async executeStage(context: Context, stage: Stage): Promise<void> {
		if (stage.id === "check") {
			const globs = context.argv.license as string[];
			const files: string[] = [];
			for (const pattern of globs) {
				files.push(
					...(await glob(pattern, {
						cwd: context.cwd,
						dot: true,
					})),
				);
			}

			for (const file of files) {
				const filePath = path.join(context.cwd, file);
				if (!(await pathExists(filePath))) continue;

				const fileContent = await fs.readFile(filePath, "utf8");
				const regex =
					/copyright\s*(\(c\))?\s*(?<range>(?:\d{4}\s*-\s*)?(?<current>\d{4}))/gi;
				let match: RegExpExecArray | null;
				let latest: RegExpExecArray | undefined;
				while ((match = regex.exec(fileContent))) {
					if (isKnownLicenseTextCopyright(fileContent, match)) continue;

					if (
						!latest ||
						parseInt(match.groups!.current) > parseInt(latest.groups!.current)
					) {
						latest = match;
					}
				}

				if (!latest) continue;
				const latestYear = parseInt(latest.groups!.current);
				if (latestYear < new Date().getFullYear()) {
					context.cli.error(
						`File "${file}" contains an outdated copyright year: ${
							latest.groups!.range
						}`,
					);
				}
			}
		}
	}
}

export default LicensePlugin;
