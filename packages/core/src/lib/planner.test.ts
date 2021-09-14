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
			stages: async (ctx: any) => [
				{
					id: "cleanup",
					after: [(ctx.plugins[0].stages as any)[2].id],
					before: ["push"],
				},
			],
		} as any as Plugin;

		const plugins = [plugin1, plugin2, plugin3];
		const context = { plugins } as Context;

		const result = (await planStages(context)).map((s) => s.id);
		// The expected array includes the default stagess
		expect(result).toEqual(["check", "edit", "commit", "check2", "cleanup", "push"]);
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
			stageAfter: undefined,
		} as Plugin;

		const plugin2 = {
			id: "plugin2",
			dependencies: ["plugin1"],
			stages,
			stageAfter: {
				commit: ["plugin3"],
			},
		} as any as Plugin;

		const plugin3 = {
			id: "plugin3",
			dependencies: ["plugin1"],
			stages,
			stageAfter: {
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

	it("allows plugins to be executed after all others with '*'", async () => {
		const stages: Stage[] = [
			{
				id: "check",
			},
		];

		const plugin1 = {
			id: "plugin1",
			stages,
		} as Plugin;

		const plugin2 = {
			id: "plugin2",
			dependencies: ["plugin1"],
			stages,
			stageAfter: {
				check: ["plugin1"],
			},
		} as any as Plugin;

		const plugin3 = {
			id: "plugin3",
			dependencies: ["plugin1"],
			stages,
			stageAfter: {
				check: "*",
			},
		} as any as Plugin;

		const plugins = [plugin3, plugin1, plugin2];
		const context = { plugins } as Context;

		const result = (await planStage(context, stages.find((s) => s.id === "check")!)).map(
			(p) => p.id,
		);
		expect(result).toEqual(["plugin1", "plugin2", "plugin3"]);
	});

	it("allows plugins to be executed before all others with '*'", async () => {
		const stages: Stage[] = [
			{
				id: "check",
			},
		];

		const plugin1 = {
			id: "plugin1",
			stages,
		} as Plugin;

		const plugin2 = {
			id: "plugin2",
			dependencies: ["plugin1"],
			stages,
			stageAfter: {
				check: ["plugin1"],
			},
		} as any as Plugin;

		const plugin3 = {
			id: "plugin3",
			dependencies: ["plugin1"],
			stages,
			stageBefore: {
				check: "*",
			},
		} as any as Plugin;

		const plugins = [plugin1, plugin2, plugin3];
		const context = { plugins } as Context;

		const result = (await planStage(context, stages.find((s) => s.id === "check")!)).map(
			(p) => p.id,
		);
		expect(result).toEqual(["plugin3", "plugin1", "plugin2"]);
	});

	it("allows combinations of 'before *' and 'after *'", async () => {
		const stages: Stage[] = [
			{
				id: "check",
			},
		];

		const plugin1 = {
			id: "plugin1",
			stages,
		} as Plugin;

		const plugin2 = {
			id: "plugin2",
			dependencies: ["plugin1"],
			stages,
			stageAfter: {
				check: "*",
			},
		} as any as Plugin;

		const plugin3 = {
			id: "plugin3",
			dependencies: ["plugin1"],
			stages,
			stageBefore: {
				check: "*",
			},
		} as any as Plugin;

		const plugins = [plugin2, plugin1, plugin3];
		const context = { plugins } as Context;

		const result = (await planStage(context, stages.find((s) => s.id === "check")!)).map(
			(p) => p.id,
		);
		expect(result).toEqual(["plugin3", "plugin1", "plugin2"]);
	});

	it("disallows multiple conflicting '*' stage dependencies", async () => {
		const stages: Stage[] = [
			{
				id: "check",
			},
		];

		const plugin1 = {
			id: "plugin1",
			stages,
		} as Plugin;

		const plugin2 = {
			id: "plugin2",
			dependencies: ["plugin1"],
			stages,
			stageAfter: {
				check: "*",
			},
		} as any as Plugin;

		const plugin3 = {
			id: "plugin3",
			dependencies: ["plugin1"],
			stages,
			stageAfter: {
				check: "*",
			},
		} as any as Plugin;

		const plugins = [plugin1, plugin2, plugin3];
		const context = { plugins } as Context;

		await expect(
			planStage(context, stages.find((s) => s.id === "check")!),
		).rejects.toThrowError(/circular dependency/i);
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
			stageAfter: {
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
			stageAfter: {
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
			stageAfter: {
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
			argv: {},
			errors: [],
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
