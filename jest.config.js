module.exports = {
	testEnvironment: "node",
	roots: [
		"<rootDir>/packages/core/src",
		// Add others as necessary
	],
	testRegex: "(.|/)test.tsx?$",
	moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
	moduleNameMapper: {
		"^@alcalzone/release-script-(.*)/package.json": "<rootDir>/packages/$1/package.json",
		"^@alcalzone/release-script-core(.*)": "<rootDir>/packages/core/src$1",
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
