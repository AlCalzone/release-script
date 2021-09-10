import { CLI, Context, ReleaseError } from "@alcalzone/release-script-core";
import colors from "colors/safe";

export const defaultContextOptions: Omit<Context, "cli" | "warnings" | "errors"> = {
	dryRun: false,
	includeUnstaged: false,
	remote: "origin",
	plugins: [],
};

export function createMockContext(
	options: Partial<Omit<Context, "cli" | "warnings" | "errors">>,
): Context {
	const ret: Context = {
		cli: {
			log: jest.fn(),
			warn: jest.fn().mockImplementation((msg) => {
				ret.warnings.push(msg);
			}),
			error: jest.fn().mockImplementation((msg) => {
				ret.errors.push(msg);
			}),
			fatal: jest.fn<never, Parameters<CLI["fatal"]>>().mockImplementation((msg, code) => {
				throw new ReleaseError(msg, true, code);
			}),
			colors,
			prefix: "",
		},
		warnings: [],
		errors: [],
		...defaultContextOptions,
		...options,
	};
	return ret;
}
