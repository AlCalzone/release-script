import spawn, { type Subprocess, type Options } from "nano-spawn";

/**
 * Parse a command string into file and arguments.
 * This is a simple implementation that handles basic command parsing.
 * It splits on spaces but respects quoted strings and escape sequences.
 */
function parseCommand(command: string): [string, string[]] {
	const parts: string[] = [];
	let current = "";
	let inQuotes = false;
	let quoteChar = "";
	let escaped = false;

	for (let i = 0; i < command.length; i++) {
		const char = command[i];

		if (escaped) {
			// Add the escaped character literally
			current += char;
			escaped = false;
		} else if (char === "\\") {
			// Next character is escaped
			escaped = true;
		} else if ((char === '"' || char === "'") && !inQuotes) {
			inQuotes = true;
			quoteChar = char;
		} else if (char === quoteChar && inQuotes) {
			inQuotes = false;
			quoteChar = "";
		} else if (char === " " && !inQuotes) {
			if (current) {
				parts.push(current);
				current = "";
			}
		} else {
			current += char;
		}
	}

	if (current) {
		parts.push(current);
	}

	if (parts.length === 0) {
		throw new Error("Cannot parse empty command string");
	}

	const [file, ...args] = parts;
	return [file, args];
}

export function execRaw(command: string, options?: Options): Subprocess {
	const [file, args] = parseCommand(command);
	return spawn(file, args, options);
}

export function exec(file: string, args?: readonly string[], options?: Options): Subprocess;
export function exec(file: string, options?: Options): Subprocess;
export function exec(...args: any[]): Subprocess {
	// @ts-expect-error IDK, this should work...
	return spawn(...args);
}
