import { ReleaseError } from "..";
import type { Context } from "./context";
import { GraphNode, topologicalSort } from "./graph";
import type { Plugin } from "./plugin";
import { DefaultStages, Stage } from "./stage";

/** Resolve all plugins that are required by the chosen plugins */
export function resolvePlugins(allPlugins: Plugin[], chosenPluginIds: string[]): Plugin[] {
	const pluginMap = new Map<string, Plugin>(allPlugins.map((p) => [p.id, p]));

	// Pass 1: collect all graph nodes
	const graphNodes = new Map<string, GraphNode<Plugin>>();
	const resolveQueue = new Set<string>(chosenPluginIds);
	for (const id of resolveQueue) {
		if (!pluginMap.has(id)) {
			throw new Error(`Unknown plugin: ${id}`);
		}
		const plugin = pluginMap.get(id)!;
		if (plugin.dependencies) {
			for (const dep of plugin.dependencies) {
				resolveQueue.add(dep);
			}
		}
		graphNodes.set(id, new GraphNode(plugin));
	}

	// Pass 2: create dependencies
	for (const node of graphNodes.values()) {
		const plugin = node.value;
		const deps = plugin.dependencies;
		if (!deps) continue;
		for (const dep of deps) {
			node.edges.add(graphNodes.get(dep)!);
		}
	}

	return topologicalSort([...graphNodes.values()]);
}

export async function planStages(context: Context): Promise<Stage[]> {
	// Pass 1: collect all graph nodes
	const graphNodes = new Map<string, GraphNode<Stage>>();
	// Always add the default stages
	for (const defStage of Object.values(DefaultStages)) {
		graphNodes.set(defStage.id, new GraphNode(defStage));
	}
	// Now add the ones required by plugins
	for (const plugin of context.plugins) {
		// Resolve stages to an array
		let stages = plugin.stages;
		if (!stages) continue;
		if (typeof stages === "function") {
			stages = await stages(context);
			// Remember the resolved plugin stages
			plugin.stages = stages;
		}

		for (const stage of stages) {
			graphNodes.set(stage.id, new GraphNode(stage));
		}
	}

	// Pass 2: create dependencies
	for (const node of graphNodes.values()) {
		const stage = node.value;
		const { before, after } = stage;
		if (after) {
			for (const dep of after) {
				if (!graphNodes.has(dep)) {
					throw new Error(`Stage ${stage.id} has unknown dependency ${dep}!`);
				}
				node.edges.add(graphNodes.get(dep)!);
			}
		}
		if (before) {
			for (const dep of before) {
				if (!graphNodes.has(dep)) {
					throw new Error(`Stage ${stage.id} has unknown dependency ${dep}!`);
				}
				graphNodes.get(dep)!.edges.add(node);
			}
		}
	}

	return topologicalSort([...graphNodes.values()]);
}

export async function planStage(context: Context, stage: Stage): Promise<Plugin[]> {
	const stagePlugins = context.plugins.filter((p) => {
		if (!p.stages) return false;
		return (p.stages as Stage[]).some((s) => s.id === stage.id);
	});

	// Pass 1: collect all graph nodes
	const graphNodes = new Map<string, GraphNode<Plugin>>();
	for (const plugin of stagePlugins) {
		graphNodes.set(plugin.id, new GraphNode(plugin));
	}

	// Pass 2: create dependencies
	for (const node of graphNodes.values()) {
		const plugin = node.value;
		// Resolve the current plugin's stage dependencies to an array
		let stageAfter = plugin.stageAfter?.[stage.id];
		if (stageAfter) {
			if (typeof stageAfter === "function") {
				stageAfter = await stageAfter(context);
			}

			// Convert "*" dependency to "all other plugins"
			if (stageAfter === "*") {
				stageAfter = [...graphNodes.values()]
					.filter((n) => n.value.id !== plugin.id)
					.map((n) => n.value.id);
			}

			for (const dep of stageAfter) {
				if (!graphNodes.has(dep)) {
					throw new ReleaseError(
						`Plugin ${plugin.id} has unknown dependency ${dep} in stage ${stage.id}!`,
						true,
					);
				}
				node.edges.add(graphNodes.get(dep)!);
			}
		}
		let stageBefore = plugin.stageBefore?.[stage.id];
		if (stageBefore) {
			if (typeof stageBefore === "function") {
				stageBefore = await stageBefore(context);
			}

			// Convert "*" dependency to "all other plugins"
			if (stageBefore === "*") {
				stageBefore = [...graphNodes.values()]
					.filter((n) => n.value.id !== plugin.id)
					.map((n) => n.value.id);
			}

			for (const dep of stageBefore) {
				if (!graphNodes.has(dep)) {
					throw new ReleaseError(
						`Plugin ${plugin.id} has unknown dependency ${dep} in stage ${stage.id}!`,
						true,
					);
				}
				graphNodes.get(dep)!.edges.add(node);
			}
		}
	}

	return topologicalSort([...graphNodes.values()]);
}

/** Plans all stages of the given context and executes them in the correct order */
export async function execute(context: Context): Promise<void> {
	const isTest = process.env.NODE_ENV === "test" || !!process.env.CI;
	const colors = context.cli.colors;
	context.cli.prefix = "";
	const stages = await planStages(context);
	if (context.argv.verbose) {
		context.cli.log(
			colors.gray(
				`Stages: ${stages.map((s) => colors.white(colors.bold(s.id))).join(" → ")}`,
			),
		);
	}
	for (const stage of stages) {
		context.cli.prefix = `${stage.id}`;
		const plugins = await planStage(context, stage);
		if (context.argv.verbose) {
			context.cli.log(
				colors.gray(
					`Plugins in this stage: ${plugins
						.map((s) => colors.white(colors.bold(s.id)))
						.join(" → ")}`,
				),
			);
		}
		for (const plugin of plugins) {
			context.cli.prefix = `${stage.id}:${plugin.id}`;
			if (context.argv.verbose) {
				context.cli.log(colors.gray(`executing...`));
			}
			await plugin.executeStage(context, stage);

			// If there were errors, we may need to abort
			if (context.errors.length > 0) {
				switch (stage.continueOnError) {
					case true:
						continue;
					case "dry-run":
						if (context.argv.dryRun) continue;
					// fall through
					default:
						return;
				}
			}
		}
		if (!isTest) console.log();
	}
}
