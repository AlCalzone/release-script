import {
	CLI as ICLI,
	Context,
	exec,
	execRaw,
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

function prependPrefix(prefix: string, str: string): string {
	if (!prefix) return str;
	return colors.bold(`${prefix} `) + str;
}

class CLI implements ICLI {
	public constructor(private context: Context) {}

	log(msg: string): void {
		console.log(prependPrefix(this.context.cli.prefix, msg));
	}
	warn(msg: string): void {
		console.warn(
			prependPrefix(
				this.context.cli.prefix,
				colorizeTextAndTags(`[WARN] ${msg}`, colors.yellow, colors.bgYellow),
			),
		);
		this.context.warnings.push(msg);
	}
	error(msg: string): void {
		console.error(
			prependPrefix(
				this.context.cli.prefix,
				colorizeTextAndTags(`[ERR] ${msg}`, colors.red, colors.bgRed),
			),
		);
		this.context.errors.push(msg);
	}
	fatal(msg: string, code?: number): never {
		throw new ReleaseError(msg, true, code);
	}
	logCommand(command: string, args?: string[]): void {
		if (args?.length) {
			command += ` ${args.join(" ")}`;
		}
		this.log(` $ ${command}`);
	}
	// eslint-disable-next-line @typescript-eslint/no-inferrable-types
	public prefix: string = "";
	public readonly colors = colors;
}

export async function main(): Promise<void> {
	const allPlugins: Plugin[] = [
		(await import("@alcalzone/release-script-plugin-git")).default,
	].map((c) => new c());
	const plugins = resolvePlugins(allPlugins, ["git"]);

	const data = new Map();

	const context = {
		cwd: process.cwd(),
		cli: undefined as any,
		sys: {
			exec,
			execRaw,
		},
		argv: {
			dryRun: true,
			includeUnstaged: false,
			remote: "origin",
		},
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

	context.cli = new CLI(context);

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
