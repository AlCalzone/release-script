import execa from "execa";
jest.mock("execa");

export interface MockExec {
	instance: jest.MockedFunction<typeof import("execa")>;
	mock: (commands: Record<string, string | execa.ExecaReturnValue>) => void;
	unmock: () => void;
}

export function createMockExec(): MockExec {
	const instance = execa as jest.MockedFunction<typeof execa>;

	function mock(commands: Record<string, string | execa.ExecaReturnValue>): void {
		instance.mockImplementation(((file: string, args: any) => {
			let command = `${file}`;
			if (args && args.length) {
				command += ` ${args.join(" ")}`;
			}

			if (command in commands) {
				const ret = commands[command];
				return typeof ret === "string" ? { stdout: ret } : ret;
			} else {
				throw new Error(`mock missing for command "${command}"!`);
			}
		}) as any);
	}

	return {
		instance,
		mock,
		unmock: () => jest.unmock("execa"),
	};
}
