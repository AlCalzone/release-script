import fs from "node:fs/promises";
import os from "os";
import path from "path";

/** Class to manage an isolated test "filesystem" for unit tests */
export class TestFS {
	private testFsRoot: string | undefined;
	async getRoot(): Promise<string> {
		if (!this.testFsRoot) {
			this.testFsRoot = await fs.mkdtemp(`${os.tmpdir()}${path.sep}release-script-test-`);
		}
		return this.testFsRoot;
	}

	private normalizePath(testRoot: string, filename: string): string {
		const relativeToFsRoot = path.relative("/", path.resolve("/", filename));
		return path.resolve(testRoot, relativeToFsRoot);
	}

	/** Creates a test directory and file structure with the given contents */
	async create(structure: Record<string, string | null> = {}): Promise<void> {
		const root = await this.getRoot();
		await fs.rm(root, { recursive: true, force: true });
		await fs.mkdir(root, { recursive: true });
		for (const [filename, content] of Object.entries(structure)) {
			const normalizedFilename = this.normalizePath(root, filename);
			if (content === null) {
				// this is a directory
				await fs.mkdir(normalizedFilename, { recursive: true });
			} else {
				// this is a file
				await fs.mkdir(path.dirname(normalizedFilename), { recursive: true });
				await fs.writeFile(normalizedFilename, content, "utf8");
			}
		}
	}

	/** Removes the test directory structure */
	async remove(): Promise<void> {
		if (!this.testFsRoot) return;
		await fs.rm(this.testFsRoot, { recursive: true, force: true });
	}
}
