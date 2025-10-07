import { ReleaseError } from "@alcalzone/release-script-core";
import { AssertionError } from "assert";
import { expect } from "vitest";

export interface AssertReleaseErrorOptions {
	messageMatches?: string | RegExp;
	fatal?: boolean;
	exitCode?: number;
}

/**
 * Asserts that a value is or a method returns a ReleaseError.
 * @param valueOrFactory An error object or method that is expected to throw
 * @param options Additional assertions
 */
export function assertReleaseError<T>(
	valueOrFactory: T,
	options: AssertReleaseErrorOptions = {},
): T extends () => PromiseLike<any> ? Promise<void> : void {
	const { messageMatches, fatal, exitCode } = options;

	function handleError(e: any): void {
		if (e.constructor.name !== "ReleaseError") {
			throw new AssertionError({
				actual: e,
				expected: new ReleaseError(""),
			});
		}
		if (messageMatches != undefined) expect(e.message).toMatch(messageMatches);
		if (exitCode != undefined) expect(e.exitCode).toBe(exitCode);
		if (fatal != undefined) expect(e.fatal).toBe(fatal);
	}
	function fail(): never {
		// We should not be here
		throw new Error("The factory function did not throw any error!");
	}

	if (typeof valueOrFactory === "function") {
		try {
			// This call is expected to throw if valueOrFactory is a synchronous function
			const result = valueOrFactory();
			if (result instanceof Promise) {
				return result.then(
					fail, // If valueOrFactory is an async function the promise should be rejected
					handleError,
				) as any;
			}
		} catch (e) {
			return void handleError(e) as any;
		}
		fail();
	} else {
		// Directly assert the error object
		handleError(valueOrFactory);
	}
	return undefined as any;
}
