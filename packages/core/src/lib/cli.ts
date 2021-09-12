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
	logCommand(command: string, args?: string[]): void;

	prefix: string;
	colors: typeof import("colors/safe");

	// TODO: Ask the user something
}
