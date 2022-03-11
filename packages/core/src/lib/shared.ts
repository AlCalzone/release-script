import { isArray, isObject } from "alcalzone-shared/typeguards";
import type { Context } from "./context";

export type ConstOrDynamic<T> = T | ((context: Context) => T | Promise<T>);

/**
 * Creates a deep copy of the given object
 */
export function cloneDeep<T>(source: T): T {
	if (isArray(source)) {
		return source.map((i) => cloneDeep(i)) as any;
	} else if (isObject(source)) {
		const target: any = {};
		for (const [key, value] of Object.entries(source)) {
			target[key] = cloneDeep(value);
		}
		return target;
	} else {
		return source;
	}
}
