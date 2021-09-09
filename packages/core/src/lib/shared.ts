import type { Context } from "./context";

export type ConstOrDynamic<T> = T | ((context: Context) => T | Promise<T>);
