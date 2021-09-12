import {
	Context,
	execute,
	isReleaseError,
	Plugin,
	ReleaseError,
	resolvePlugins,
} from "@alcalzone/release-script-core";
import colors from "colors/safe";

const primaryAndInlineTagRegex = /\[([^\]]+)\]/g;

function colorizeTextAndTags(
	textWithTags: string,
	textColor: (input: string) => string,
	bgColor: (input: string) => string,
): string {
	return textColor(
		textWithTags.replace(
			primaryAndInlineTagRegex,
			(match, group1) => bgColor("[") + colors.inverse(group1) + bgColor("]"),
		),
	);
}

export async function main(): Promise<void> {
	const allPlugins: Plugin[] = [
		(await import("@alcalzone/release-script-plugin-git")).default,
	].map((c) => new c());
	const plugins = resolvePlugins(allPlugins, ["git"]);

	const prependPrefix = (prefix: string, str: string): string => {
		if (!prefix) return str;
		return colors.bold(`${prefix} `) + str;
	};

	const data = new Map();

	const context: Context = {
		cwd: process.cwd(),
		cli: {
			log: console.log,
			warn(msg) {
				console.warn(
					prependPrefix(
						context.cli.prefix,
						colorizeTextAndTags(`[WARN] ${msg}`, colors.yellow, colors.bgYellow),
					),
				);
				context.warnings.push(msg);
			},
			error(msg) {
				console.error(
					prependPrefix(
						context.cli.prefix,
						colorizeTextAndTags(`[ERR] ${msg}`, colors.red, colors.bgRed),
					),
				);
				context.errors.push(msg);
			},
			fatal(msg, code) {
				throw new ReleaseError(msg, true, code);
			},
			colors,
			prefix: "",
		},
		dryRun: true,
		includeUnstaged: false,
		remote: "origin",
		plugins,
		warnings: [],
		errors: [],
		getData: <T>(key: string) => {
			if (!data.has(key)) {
				throw new ReleaseError(
					`A plugin tried to access non-existent data with key "${key}"`,
					true,
				);
			} else {
				return data.get(key) as T;
			}
		},
		hasData: (key: string) => data.has(key),
		setData: (key: string, value: any) => {
			data.set(key, value);
		},
	};

	try {
		await execute(context);

		const numWarnings = context.warnings.length;
		const numErrors = context.errors.length;

		if (numErrors > 0) {
			let message = `Release did not complete. There ${
				numErrors + numWarnings !== 1 ? "were" : "was"
			} ${colors.red(`${numErrors} error${numErrors !== 1 ? "s" : ""}`)}`;
			if (numWarnings > 0) {
				message += ` and ${colors.yellow(
					`${numWarnings} warning${numWarnings !== 1 ? "s" : ""}`,
				)}`;
			}
			message += "!";
			console.error();
			console.error(message);
			process.exit(1);
		}
	} catch (e: any) {
		if (isReleaseError(e)) {
			console.error(
				prependPrefix(
					context.cli.prefix,
					colorizeTextAndTags(
						`[FATAL] ${e.message.replace("ReleaseError: ", "")}`,
						colors.red,
						colors.bgRed,
					),
				),
			);
		} else {
			const msg = e.stack ?? e.message ?? String(e);
			console.error(
				prependPrefix(
					context.cli.prefix,
					colorizeTextAndTags(`[FATAL] ${msg}`, colors.red, colors.bgRed),
				),
			);
		}
		process.exit((e as any).code ?? 1);
	}
}

void main();
