import { describe, expect, it } from "vitest";
import { GraphNode, topologicalSort } from "./graph";

describe("Graph", () => {
	describe("topologicalSort()", () => {
		it("should sort correctly (Test 1)", () => {
			const nodes = [new GraphNode(1), new GraphNode(2), new GraphNode(3), new GraphNode(4)];
			nodes[0].edges.add(nodes[1]);
			nodes[0].edges.add(nodes[2]);
			nodes[1].edges.add(nodes[3]);
			nodes[2].edges.add(nodes[3]);

			expect(topologicalSort(nodes)).toEqual([4, 2, 3, 1]);
		});

		it("should sort correctly (Test 2)", () => {
			const nodes = [new GraphNode(1), new GraphNode(2), new GraphNode(3), new GraphNode(4)];
			nodes[0].edges.add(nodes[3]);
			nodes[0].edges.add(nodes[2]);
			nodes[3].edges.add(nodes[1]);
			nodes[2].edges.add(nodes[3]);

			expect(topologicalSort(nodes)).toEqual([2, 4, 3, 1]);
		});

		it("should throw when there are circular dependencies", () => {
			const nodes = [new GraphNode(1), new GraphNode(2), new GraphNode(3), new GraphNode(4)];
			nodes[0].edges.add(nodes[1]);
			nodes[1].edges.add(nodes[3]);
			nodes[3].edges.add(nodes[2]);
			nodes[2].edges.add(nodes[0]);

			expect(() => topologicalSort(nodes)).toThrow();
		});

		it("should keep nodes in the order they were defined when they have no dependencies", () => {
			const nodes = [new GraphNode(1), new GraphNode(2), new GraphNode(3), new GraphNode(4)];
			nodes[1].edges.add(nodes[2]);

			expect(topologicalSort(nodes)).toEqual([1, 3, 4, 2]);
		});
	});
});
