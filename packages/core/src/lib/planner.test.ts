import type { Context } from "./context";
import { execute, planStage, planStages, resolvePlugins } from "./planner";
import type { Plugin } from "./plugin";
import type { Stage } from "./stage";

describe("resolvePlugins", () => {
	it("throws if an unknown plugin should be loaded", () => {
		const plugins: Plugin[] = [
			{ id: "plugin1" } as any,
			{ id: "plugin2", dependencies: ["plugin-nope"] } as any,
		];
		expect(() => {
			resolvePlugins(plugins, ["plugin2"]);
		}).toThrowError(/plugin-nope/);
	});

	it("resolves known plugins", () => {
		const plugins: Plugin[] = [
			{ id: "plugin1" } as any,
			{ id: "plugin3", dependencies: ["plugin1"] } as any,
			{ id: "plugin2", dependencies: ["plugin1"] } as any,
			{ id: "plugin4", dependencies: ["plugin2", "plugin3"] } as any,
		];

		const result = resolvePlugins(plugins, ["plugin4"]).map((p) => p.id);
		expect(result).toEqual(["plugin1", "plugin2", "plugin3", "plugin4"]);
	});

	it("preserves the plugin order as good as possible", () => {
		const plugins: Plugin[] = [
			{ id: "plugin1" } as any,
			{ id: "plugin2", dependencies: ["plugin1"] } as any,
			{ id: "plugin3", dependencies: ["plugin1"] } as any,
		];

		const result = resolvePlugins(plugins, ["plugin3", "plugin2"]).map((p) => p.id);
		expect(result).toEqual(["plugin1", "plugin3", "plugin2"]);
	});
});

describe("planStages", () => {
	it("figures out which stages should be executed in which order", async () => {
		const plugin1 = {
			id: "plugin1",
			stages: [
				{
					id: "check",
				},
				{
					id: "push",
					after: ["commit", "check"],
				},
				{
					id: "commit",
					after: ["check"],
				},
			],
		} as Plugin;

		const plugin2 = {
			id: "plugin2",
			dependencies: ["plugin1"],
			stages: (_ctx) => [
				{
					id: "check2",
					after: ["check"],
				},
			],
		} as Plugin;

		const plugin3 = {
			id: "plugin3",
			dependencies: ["plugin1"],
			stages: async (ctx) => [
				{
					id: "cleanup",
					after: [(ctx.plugins[0].stages as any)[2].id],
				},
			],
		} as Plugin;

		const plugins = [plugin1, plugin2, plugin3];
		const context = { plugins } as Context;

		const result = (await planStages(context)).map((s) => s.id);
		expect(result).toEqual(["check", "commit", "check2", "push", "cleanup"]);
	});
});

describe("planStage", () => {
	it("figures out which plugins should be executed in which order in a given stage", async () => {
		const stages: Stage[] = [
			{
				id: "check",
			},
			{
				id: "commit",
				after: ["check"],
			},
		];

		const plugin1 = {
			id: "plugin1",
			stages,
			stageDependencies: undefined,
		} as Plugin;

		const plugin2 = {
			id: "plugin2",
			dependencies: ["plugin1"],
			stages,
			stageDependencies: {
				commit: ["plugin3"],
			},
		} as any as Plugin;

		const plugin3 = {
			id: "plugin3",
			dependencies: ["plugin1"],
			stages,
			stageDependencies: {
				commit: async (ctx: Context) => [ctx.plugins[0].id],
			},
		} as any as Plugin;

		const plugins = [plugin1, plugin2, plugin3];
		const context = { plugins } as Context;

		const result = (await planStage(context, stages.find((s) => s.id === "commit")!)).map(
			(p) => p.id,
		);
		expect(result).toEqual(["plugin1", "plugin3", "plugin2"]);
	});
});

describe("execute", () => {
	it("plans everything and executed it in the correct order", async () => {
		const stages: Stage[] = [
			{
				id: "check",
			},
			{
				id: "commit",
				after: ["check"],
			},
		];

		const plugin1 = {
			id: "plugin1",
			stages,
			stageDependencies: {
				check: ["plugin3"],
			},
			executeStage: async (ctx: Context, stage: Stage) => {
				ctx.cli.log(`plugin1, ${stage.id}`);
			},
		} as any as Plugin;

		const plugin2 = {
			id: "plugin2",
			dependencies: ["plugin1"],
			stages,
			stageDependencies: {
				check: ["plugin1"],
				commit: ["plugin3"],
			},
			executeStage: async (ctx: Context, stage: Stage) => {
				ctx.cli.log(`plugin2, ${stage.id}`);
			},
		} as any as Plugin;

		const plugin3 = {
			id: "plugin3",
			dependencies: ["plugin1"],
			stages,
			stageDependencies: {
				commit: ["plugin1"],
			},
			executeStage: async (ctx: Context, stage: Stage) => {
				ctx.cli.log(`plugin3, ${stage.id}`);
			},
		} as any as Plugin;

		const plugins = resolvePlugins([plugin1, plugin2, plugin3], ["plugin2", "plugin3"]);
		const logStub = jest.fn();
		const context = {
			plugins,
			cli: {
				log: logStub,
			},
		} as unknown as Context;

		await execute(context);
		expect(logStub.mock.calls.map((args) => args[0])).toEqual([
			"plugin3, check",
			"plugin1, check",
			"plugin2, check",
			"plugin1, commit",
			"plugin3, commit",
			"plugin2, commit",
		]);
	});
});
