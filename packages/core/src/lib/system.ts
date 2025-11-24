import type { Options, Subprocess } from "nano-spawn";

export interface System {
	/** Functions to execute commands */
	execRaw(command: string, options: Options): Subprocess;
	exec(file: string, args: readonly string[], options: Options): Subprocess;
	exec(file: string, options: Options): Subprocess;
}
