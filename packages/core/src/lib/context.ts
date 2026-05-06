import type { CLI } from "./cli.js";
import type { Plugin } from "./plugin.js";
import type { System } from "./system.js";

export interface Context {
	/** Access to the CLI instance. */
	cli: CLI;

	/** Access to the system layer */
	sys: System;

	/** Which directory the release script is executed in */
	cwd: string;

	/** Command line arguments to the release script */
	argv: {
		/** Whether this is a dry run */
		dryRun: boolean;

		/** Log debug information */
		verbose: boolean;

		/** Additional plugins to load */
		plugins: string[];

		/** The desired version bump */
		bump?: string;
		preid?: string;

		/** Answer all (applicable) yes/no prompts with yes */
		yes: boolean;

		[arg: string]: string | number | boolean | string[] | number[] | boolean[] | undefined;
	};

	warnings: string[];
	errors: string[];

	/** An array of enabled plugins */
	plugins: Plugin[];

	/** Data storage to be used by plugins */
	getData<T>(key: string): T;
	hasData(key: string): boolean;
	setData(key: string, value: any): void;

	/**
	 * State used to roll back local changes if the release fails.
	 * Populated by `captureRollbackSnapshot` once the edit stage is about to run.
	 */
	rollback?: RollbackState;
}

export interface RollbackState {
	/** SHA of HEAD before any release-related modifications were made */
	originalHead: string;
	/**
	 * SHA of the stash commit that holds the user's pre-release uncommitted
	 * changes (only set when the working tree was dirty, i.e. with --all).
	 */
	stashSha?: string;
	/**
	 * Unique message used to identify the snapshot stash in `git stash list`,
	 * since `git stash drop` requires a `stash@{N}` ref rather than a SHA.
	 */
	stashMessage?: string;
	/** Set to true once the push stage starts. Disables rollback afterwards. */
	pushAttempted: boolean;
	/**
	 * Name of the release tag created during this run (e.g. "v1.2.3"). Only set
	 * after `git tag` succeeds, so rollback never deletes a pre-existing tag.
	 */
	createdTag?: string;
	/**
	 * Whether `git clean -fd` is safe to run during rollback. False when the
	 * working tree was dirty at snapshot time but the snapshot stash could not
	 * be created — running clean in that case would permanently lose the user's
	 * pre-existing untracked files.
	 */
	cleanAllowedDuringRollback: boolean;
}
