/* eslint-disable @typescript-eslint/no-inferrable-types */
import {
	CLI,
	Context,
	exec,
	execRaw,
	ReleaseError,
	stripColors,
	System,
} from "@alcalzone/release-script-core";
import type { ExecaReturnValue } from "execa";
import colors from "picocolors";

class MockSystem implements System {
	public exec: jest.MockedFunction<System["exec"]> = jest.fn();
	public execRaw: jest.MockedFunction<System["execRaw"]> = jest.fn();

	public mockExec(
		commands:
			| Record<string, string | ExecaReturnValue>
			| ((cmd: string) => string | ExecaReturnValue),
	): void {
		const execRaw = (command: string): Promise<ExecaReturnValue> => {
			let ret: string | ExecaReturnValue;
			if (typeof commands === "function") {
				ret = commands(command);
			} else if (command in commands) {
				ret = commands[command];
			} else {
				throw new Error(`mock missing for command "${command}"!`);
			}

			return Promise.resolve(
				typeof ret === "string"
					? ({
							stdout: ret,
							stderr: "",
							isCanceled: false,
							failed: false,
							exitCode: 0,
					  } as any)
					: ret,
			);
		};
		// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
		const exec = (file: string, args: any) => {
			let command = `${file}`;
			if (args && args.length) {
				command += ` ${args.join(" ")}`;
			}
			return execRaw(command);
		};
		this.execRaw.mockReset().mockImplementation(execRaw as any);
		this.exec.mockReset().mockImplementation(exec as any);
	}

	public unmockExec(): void {
		this.exec.mockReset().mockImplementation(exec);
		this.execRaw.mockReset().mockImplementation(execRaw);
	}
}

export const defaultContextOptions: Omit<
	Context,
	"cli" | "warnings" | "errors" | "getData" | "hasData" | "setData"
> & { sys: MockSystem } = {
	cwd: process.cwd(),
	argv: {
		dryRun: false,
		includeUnstaged: false,
		remote: "origin",
		verbose: false,
		plugins: [],
		yes: false,
	},
	plugins: [],
	sys: new MockSystem(),
};

export function createMockContext(
	options: Partial<
		Omit<Context, "cli" | "warnings" | "errors" | "sys" | "argv"> & {
			argv: Partial<Context["argv"]>;
		}
	>,
): Context & { sys: MockSystem } {
	const data = new Map();
	const ret: Context & { sys: MockSystem } = {
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
			logCommand: jest.fn(),
			select: jest.fn(),
			ask: jest.fn(),
			clearLines: jest.fn(),
			colors,
			stripColors,
			prefix: "",
		},
		warnings: [],
		errors: [],
		...defaultContextOptions,
		...options,
		argv: {
			...defaultContextOptions.argv,
			...(options.argv ?? {}),
		},
		getData: <T>(key: string) => {
			if (!data.has(key)) {
				throw new ReleaseError(
					`A plugin tried to access non-existent data with key "${key}"`,
					true,
				);
			} else {
				return data.get(key) as T;
			}
		},
		hasData: (key: string) => data.has(key),
		setData: (key: string, value: any) => {
			data.set(key, value);
		},
	};
	return ret;
}
