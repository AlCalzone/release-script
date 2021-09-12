import execa, { ExecaChildProcess } from "execa";

export function execRaw(command: string, options?: execa.Options): ExecaChildProcess {
	return execa.command(command, options);
}

export function exec(
	file: string,
	args?: readonly string[],
	options?: execa.Options<string>,
): ExecaChildProcess;
export function exec(file: string, options?: execa.Options<string>): ExecaChildProcess;
export function exec(...args: any[]): ExecaChildProcess {
	// @ts-expect-error IDK, this should work...
	return execa(...args);
}
