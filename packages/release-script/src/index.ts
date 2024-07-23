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
	SelectOption,
	stripColors,
} from "@alcalzone/release-script-core";
import { distinct } from "alcalzone-shared/arrays";
import { prompt } from "enquirer";
import colors from "picocolors";
import yargs from "yargs";

function colorizeTextAndTags(
	textWithTags: string,
	textColor: (input: string) => string,
	bgColor: (input: string) => string,
): string {
	return textColor(
		textWithTags.replace(
			/\[(.*?)\]/g,
			(match, group1) => bgColor("[") + colors.inverse(group1) + bgColor("]"),
		),
	);
}

const prefixColors = [
	colors.magenta,
	colors.cyan,
	colors.yellow,
	colors.red,
	colors.green,
	colors.blue,
	colors.white,
];
const usedPrefixes: string[] = [];
function colorizePrefix(prefix: string): string {
	if (!prefix.includes(":")) return colors.white(prefix);
	const prefixShort = prefix.split(":").slice(-1)[0];
	let prefixIndex = usedPrefixes.indexOf(prefixShort);
	if (prefixIndex === -1) {
		usedPrefixes.push(prefixShort);
		prefixIndex = usedPrefixes.length - 1;
	}
	return prefixColors[prefixIndex % prefixColors.length](prefix);
}

function prependPrefix(prefix: string, str: string): string {
	if (!prefix) return str;
	return colors.bold(colorizePrefix(prefix)) + " " + str;
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
		this.log(`$ ${command}`);
	}
	clearLines(lines: number): void {
		if (!process.stdout.isTTY) {
			return;
		}

		process.stdout.moveCursor(0, -lines);
		process.stdout.clearScreenDown();
	}

	async select(question: string, options: SelectOption[]): Promise<string> {
		try {
			const result = await prompt<any>({
				name: "default",
				message: question,
				type: "select",
				choices: options.map((o) => ({
					name: o.value,
					message: o.label,
					hint: o.hint ? this.colors.gray(`· ${o.hint}`) : undefined,
				})),
			});
			return result.default;
		} catch (e) {
			// Strg+C
			if (e === "") this.fatal("Aborted by user");
			throw e;
		}
	}

	async ask(question: string, placeholder?: string): Promise<string> {
		try {
			const result = await prompt<any>({
				name: "default",
				message: question,
				type: "input",
				initial: placeholder,
			});
			return result.default;
		} catch (e) {
			// Strg+C
			if (e === "") this.fatal("Aborted by user");
			throw e;
		}
	}

	// eslint-disable-next-line @typescript-eslint/no-inferrable-types
	public prefix: string = "";
	public readonly colors = colors;
	public readonly stripColors = stripColors;
}

export async function main(): Promise<void> {
	let argv = yargs
		.env("RELEASE_SCRIPT")
		.usage("$0 [<bump> [<preid>]] [options]", "AlCalzone's release script", (yargs) =>
			yargs
				.positional("bump", {
					describe: "The version bump to do.",
					choices: [
						"major",
						"premajor",
						"minor",
						"preminor",
						"patch",
						"prepatch",
						"prerelease",
					],
					required: false,
				})
				.positional("preid", {
					describe: "The prerelease identifier. Only for pre* bumps.",
					required: false,
				}),
		)
		.wrap(yargs.terminalWidth())
		// Delay showing help until the second parsing pass
		.help(false)
		.alias("v", "version")
		.options({
			config: {
				alias: "c",
				describe: "Path to the release config file",
				config: true,
				default: ".releaseconfig.json",
			},
			plugins: {
				alias: "p",
				describe: "Additional plugins to load",
				string: true,
				array: true,
			},
			verbose: {
				alias: "V",
				type: "boolean",
				description: "Enable debug output",
				default: false,
			},
			yes: {
				alias: "y",
				type: "boolean",
				description: "Answer all (applicable) yes/no prompts with yes",
				default: false,
			},
			publishAll: {
				type: "boolean",
				description: `Bump and publish all non-private packages in monorepos, even if they didn't change`,
				default: false,
			},
		});

	// We do two-pass parsing:
	// 1. parse the config file and plugins (non-strict)
	// 2. parse all options (strict)
	let parsedArgv = (await argv.parseAsync()) as unknown as Context["argv"];

	const chosenPlugins = distinct([
		// These plugins must always be loaded
		"git",
		"package",
		"exec",
		"version",
		"changelog",
		// These are provided by the user
		...(parsedArgv.plugins || []),
	]);
	const allPlugins: Plugin[] = await Promise.all(
		chosenPlugins.map(
			async (plugin) =>
				new (
					await import(`@alcalzone/release-script-plugin-${plugin}`)
				).default(),
		),
	);
	const plugins = resolvePlugins(allPlugins, chosenPlugins);

	argv = argv
		.strict()
		.help(true)
		.alias("h", "help")
		.options({
			dryRun: {
				alias: "dry",
				type: "boolean",
				description:
					"Perform a dry-run: check status, describe changes without changing anything",
				default: false,
			},
		});

	// Let plugins hook into the CLI options
	for (const plugin of plugins) {
		if (typeof plugin.defineCLIOptions === "function") {
			argv = plugin.defineCLIOptions(argv);
		}
	}
	parsedArgv = (await argv.parseAsync()) as unknown as Context["argv"];

	const data = new Map();

	const context = {
		cwd: process.cwd(),
		cli: undefined as any,
		sys: {
			exec,
			execRaw,
		},
		argv: parsedArgv as typeof parsedArgv & { [prop: string]: boolean | number | string },
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
		// Initialize plugins
		for (const plugin of plugins) {
			await plugin.init?.(context);
		}

		// Execute stages
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
