export interface Stage {
	/** The ID of this stage */
	id: string;

	/** Which stages come before this stage */
	after?: string[];
}
