/** Methods to interact with the CLI */
export interface CLI {
	/** Logs an info message */
	log(message: string): void;
	/** Logs a warning */
	warn(message: string): void;

	/** Logs an error and continues */
	error(message: string): void;

	/** Logs an error and exits */
	fatal(message: string, code?: number): never;

	/** Logs an executed command (mainly used for dry runs) */
	logCommand(command: string, args?: readonly string[]): void;

	/** Displays a select dialog to the user and returns the value of the chosen option */
	select(prompt: string, options: SelectOption[]): Promise<string>;

	/** Asks the user to enter something */
	ask(question: string, placeholder?: string): Promise<string>;

	/** Clears the last N lines */
	clearLines(lines: number): void;

	prefix: string;
	colors: typeof import("picocolors");
	stripColors: (str: string) => string;

	// TODO: Ask the user something
}

export interface SelectOption {
	value: string;
	label: string;
	hint?: string;
}

// Shamelessly copied from https://github.com/chalk/ansi-regex
const ansiRegex = (() => {
	const pattern = [
		"[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)",
		"(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]))",
	].join("|");

	return new RegExp(pattern, "g");
})();

export function stripColors(str: string): string {
	return str.replace(ansiRegex, "");
}
