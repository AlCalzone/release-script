/**
 * Errors thrown in this release script are of this type. The `code` property identifies what went wrong.
 */
export class ReleaseError extends Error {
	public constructor(
		public readonly message: string,
		/** Whether this is a fatal error */
		public readonly fatal?: boolean,
		public readonly exitCode?: number,
	) {
		super(message);

		// We need to set the prototype explicitly
		Object.setPrototypeOf(this, ReleaseError.prototype);
		Object.getPrototypeOf(this).name = "ReleaseError";
	}
}

export function isReleaseError(e: unknown): e is ReleaseError {
	return e instanceof Error && Object.getPrototypeOf(e).name === "ReleaseError";
}
