module.exports = {
	testEnvironment: "node",
	roots: [
		"<rootDir>/packages/release-script/src",
		"<rootDir>/packages/core/src",
		"<rootDir>/packages/plugin-git/src",
		"<rootDir>/packages/plugin-package/src",
		// Add others as necessary
	],
	testRegex: "(.|/)test.tsx?$",
	moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
	moduleNameMapper: {
		"^@alcalzone/release-script-core(.*)": "<rootDir>/packages/core/src$1",
		"^@alcalzone/release-script-plugin-git(.*)": "<rootDir>/packages/plugin-git/src$1",
		"^@alcalzone/release-script-plugin-package(.*)": "<rootDir>/packages/plugin-package/src$1",
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
