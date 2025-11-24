import {
	type Context,
	exec,
	execRaw,
	ReleaseError,
	stripColors,
	type System,
} from "@alcalzone/release-script-core";
import type { Result } from "nano-spawn";
import colors from "picocolors";
import type { Mock } from "vitest";
import { vi } from "vitest";

class MockSystem implements System {
	public exec: Mock = vi.fn();
	public execRaw: Mock = vi.fn();

	public mockExec(
		commands: Record<string, string | Result> | ((cmd: string) => string | Result),
	): void {
		const execRaw = (command: string): Promise<Result> => {
			let ret: string | Result;
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
							output: ret,
							command: command,
							durationMs: 0,
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
			log: vi.fn(),
			warn: vi.fn().mockImplementation((msg) => {
				ret.warnings.push(msg);
			}),
			error: vi.fn().mockImplementation((msg) => {
				ret.errors.push(msg);
			}),
			fatal: vi.fn().mockImplementation((msg: string, code?: number): never => {
				throw new ReleaseError(msg, true, code);
			}) as any,
			logCommand: vi.fn(),
			select: vi.fn(),
			ask: vi.fn(),
			clearLines: vi.fn(),
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
