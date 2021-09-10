import {
	Context,
	execute,
	Plugin,
	ReleaseError,
	resolvePlugins,
} from "@alcalzone/release-script-core";
import colors from "colors/safe";

export async function main(): Promise<void> {
	const allPlugins: Plugin[] = [
		(await import("@alcalzone/release-script-plugin-git")).default,
	].map((c) => new c());
	const plugins = resolvePlugins(allPlugins, ["git"]);

	const prependPrefix = (prefix: string, str: string): string => {
		if (!prefix) return str;
		return colors.bold(`${prefix} `) + str;
	};

	const context: Context = {
		cli: {
			log: console.log,
			warn(msg) {
				console.warn(
					prependPrefix(
						context.cli.prefix,
						colors.yellow(`${colors.inverse(" WARN ")} ${msg}`),
					),
				);
				context.warnings.push(msg);
			},
			error(msg) {
				console.error(
					prependPrefix(
						context.cli.prefix,
						colors.red(`${colors.inverse(" ERR ")} ${msg}`),
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
		const msg = e.stack ?? e.message ?? String(e);
		context.cli.error(prependPrefix(context.cli.prefix, `${colors.inverse("FATAL")} ${msg}`));
		process.exit((e as any).code ?? 1);
	}
}

void main();
