export interface Stage {
	/** The ID of this stage */
	id: string;

	/** Which stages come before this stage */
	after?: string[];

	/** Which stages come after this stage */
	before?: string[];
}

export const defaultStages = Object.freeze({
	check: {
		id: "check",
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
});
