import type { CLI } from "./cli";
import type { Plugin } from "./plugin";
import type { System } from "./system";

export interface Context {
	/** Access to the CLI instance. */
	cli: CLI;

	/** Access to the system layer */
	sys: System;

	/** Which directory the release script is executed in */
	cwd: string;

	/** Command line arguments to the release script */
	argv: {
		/** Whether unstaged changes should be committed aswell */
		includeUnstaged: boolean;

		/** Whether this is a dry run */
		dryRun: boolean;

		/** The git remote to push to */
		remote?: string;

		verbose: boolean;

		[arg: string]: string | number | boolean | undefined;
	};

	warnings: string[];
	errors: string[];

	/** An array of enabled plugins */
	plugins: Plugin[];

	/** Data storage to be used by plugins */
	getData<T>(key: string): T;
	hasData(key: string): boolean;
	setData(key: string, value: any): void;
}
