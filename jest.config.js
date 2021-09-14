module.exports = {
	testEnvironment: "node",
	roots: [
		"<rootDir>/packages/release-script/src",
		"<rootDir>/packages/core/src",
		"<rootDir>/packages/plugin-changelog/src",
		"<rootDir>/packages/plugin-exec/src",
		"<rootDir>/packages/plugin-git/src",
		"<rootDir>/packages/plugin-iobroker/src",
		"<rootDir>/packages/plugin-lerna/src",
		"<rootDir>/packages/plugin-package/src",
		"<rootDir>/packages/plugin-version/src",
		// Add others as necessary
	],
	testRegex: "(.|/)test.tsx?$",
	moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
	moduleNameMapper: {
		"^@alcalzone/release-script-core(.*)": "<rootDir>/packages/core/src$1",
		"^@alcalzone/release-script-plugin-changelog(.*)":
			"<rootDir>/packages/plugin-changelog/src$1",
		"^@alcalzone/release-script-plugin-exec(.*)": "<rootDir>/packages/plugin-exec/src$1",
		"^@alcalzone/release-script-plugin-git(.*)": "<rootDir>/packages/plugin-git/src$1",
		"^@alcalzone/release-script-plugin-iobroker(.*)":
			"<rootDir>/packages/plugin-iobroker/src$1",
		"^@alcalzone/release-script-plugin-lerna(.*)": "<rootDir>/packages/plugin-lerna/src$1",
		"^@alcalzone/release-script-plugin-package(.*)": "<rootDir>/packages/plugin-package/src$1",
		"^@alcalzone/release-script-plugin-version(.*)": "<rootDir>/packages/plugin-version/src$1",
		"^@alcalzone/release-script-(.*)/package.json": "<rootDir>/packages/$1/package.json",
		// Add others as necessary
	},
	setupFilesAfterEnv: ["jest-extended"],
	setupFiles: ["./test/jest.setup.js"],
	collectCoverage: false,
	collectCoverageFrom: ["packages/**/src/**/*.ts", "!packages/**/src/**/*.test.ts"],
	coverageReporters: ["lcov", "html", "text-summary"],
	transform: {
		"^.+.tsx?$": "babel-jest",
	},
};
