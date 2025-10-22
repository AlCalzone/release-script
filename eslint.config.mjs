import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import { rules as prettierRules } from "eslint-config-prettier";
import prettierPlugin from "eslint-plugin-prettier";
import { defineConfig } from "eslint/config";

export default defineConfig(
	// Ignore patterns
	{
		ignores: ["**/build/**", "**/.prettierrc.js", "**/*.config.js"],
	},

	// Base config for all files
	eslint.configs.recommended,

	// TypeScript files
	{
		files: ["**/*.ts"],
		extends: [...tseslint.configs.recommended],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				ecmaVersion: 2019,
				sourceType: "module",
				project: "./tsconfig.eslint.json",
			},
		},
		plugins: {
			"@typescript-eslint": tseslint.plugin,
			prettier: prettierPlugin,
		},
		rules: {
			...prettierRules,
			"prettier/prettier": "error",

			"@typescript-eslint/no-parameter-properties": "off",
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-use-before-define": [
				"error",
				{
					functions: false,
					typedefs: false,
					classes: false,
				},
			],
			"@typescript-eslint/no-unused-vars": [
				"error",
				{
					ignoreRestSiblings: true,
					argsIgnorePattern: "^_",
				},
			],
			"@typescript-eslint/explicit-function-return-type": [
				"warn",
				{
					allowExpressions: true,
					allowTypedFunctionExpressions: true,
				},
			],
			"@typescript-eslint/no-object-literal-type-assertion": "off",
			"@typescript-eslint/interface-name-prefix": "off",
			"@typescript-eslint/no-non-null-assertion": "off",

			// Make sure type imports are used where necessary
			"@typescript-eslint/consistent-type-imports": [
				"error",
				{
					fixStyle: "inline-type-imports",
					disallowTypeAnnotations: false,
				},
			],
			"@typescript-eslint/consistent-type-exports": "error",

			"no-var": "error",
			"prefer-const": "error",
			"no-trailing-spaces": "error",
		},
	},

	// Test files override
	{
		files: ["**/*.test.ts"],
		rules: {
			"@typescript-eslint/explicit-function-return-type": "off",
		},
	},
);
