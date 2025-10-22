import type { Context } from "./context.js";

export type ConstOrDynamic<T> = T | ((context: Context) => T | Promise<T>);
