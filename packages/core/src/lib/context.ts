import type { CLI } from "./cli";
import type { Plugin } from "./plugin";

export interface Context {
	/** Access to the CLI instance. */
	cli: CLI;

	/**
	 * Whether unstaged changes should be committed aswell
	 */
	includeUnstaged: boolean;

	/** Whether this is a dry run */
	dryRun: boolean;

	/** The git remote to push to */
	remote: string;

	warnings: string[];
	errors: string[];

	/** An array of enabled plugins and their context */
	plugins: Plugin[];
}
