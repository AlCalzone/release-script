export interface Stage {
	/** The ID of this stage */
	id: string;

	/**
	 * Whether execution should continue after this stage if there are errors.
	 * If set to "dry-run", execution during a dry run will continue even if there are errors.
	 * Default: `false`
	 */
	continueOnError?: boolean | "dry-run";

	/** Whether this stage should be executed during a dry run. Default: `true` */
	skipForDryRun?: boolean;

	/** Which stages come before this stage */
	after?: string[];

	/** Which stages come after this stage */
	before?: string[];
}

export const DefaultStages = Object.freeze({
	check: {
		id: "check",
		continueOnError: false,
	} as Stage,
	edit: {
		id: "edit",
		after: ["check"],
	} as Stage,
	commit: {
		id: "commit",
		after: ["edit"],
	} as Stage,
	push: {
		id: "push",
		after: ["commit"],
	} as Stage,
	cleanup: {
		id: "cleanup",
		after: ["push"],
	} as Stage,
});
