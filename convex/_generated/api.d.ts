/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as backtests from "../backtests.js";
import type * as connector from "../connector.js";
import type * as http from "../http.js";
import type * as identity from "../identity.js";
import type * as journal from "../journal.js";
import type * as notes from "../notes.js";
import type * as passwordRecovery from "../passwordRecovery.js";
import type * as samplePrices from "../samplePrices.js";
import type * as secrets from "../secrets.js";
import type * as strategies from "../strategies.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  backtests: typeof backtests;
  connector: typeof connector;
  http: typeof http;
  identity: typeof identity;
  journal: typeof journal;
  notes: typeof notes;
  passwordRecovery: typeof passwordRecovery;
  samplePrices: typeof samplePrices;
  secrets: typeof secrets;
  strategies: typeof strategies;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
