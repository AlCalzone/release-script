import type { Context } from "./context";
import { GraphNode, topologicalSort } from "./graph";
import type { Plugin } from "./plugin";
import type { Stage } from "./stage";

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
		const after = stage.after;
		if (!after) continue;
		for (const dep of after) {
			if (!graphNodes.has(dep)) {
				throw new Error(`Stage ${stage.id} has unknown dependency ${dep}!`);
			}
			node.edges.add(graphNodes.get(dep)!);
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
		// Resolve the current stage's dependencies to an array
		let deps = plugin.stageDependencies?.[stage.id];
		if (!deps) continue;
		if (typeof deps === "function") {
			deps = await deps(context);
		}

		for (const dep of deps) {
			if (!graphNodes.has(dep)) {
				throw new Error(
					`Plugin ${plugin.id} has unknown dependency ${dep} in stage ${stage.id}!`,
				);
			}
			node.edges.add(graphNodes.get(dep)!);
		}
	}

	return topologicalSort([...graphNodes.values()]);
}

/** Plans all stages of the given context and executes them in the correct order */
export async function execute(context: Context): Promise<void> {
	const stages = await planStages(context);
	for (const stage of stages) {
		const plugins = await planStage(context, stage);
		for (const plugin of plugins) {
			await plugin.executeStage(context, stage);
		}
	}
}
