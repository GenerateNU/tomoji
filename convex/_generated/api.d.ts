/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as lib_authz from "../lib/authz.js";
import type * as schemas_campaignCreators from "../schemas/campaignCreators.js";
import type * as schemas_campaigns from "../schemas/campaigns.js";
import type * as schemas_companies from "../schemas/companies.js";
import type * as schemas_companyUsers from "../schemas/companyUsers.js";
import type * as schemas_creators from "../schemas/creators.js";
import type * as schemas_posts from "../schemas/posts.js";
import type * as schemas_submissions from "../schemas/submissions.js";
import type * as schemas_users from "../schemas/users.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "lib/authz": typeof lib_authz;
  "schemas/campaignCreators": typeof schemas_campaignCreators;
  "schemas/campaigns": typeof schemas_campaigns;
  "schemas/companies": typeof schemas_companies;
  "schemas/companyUsers": typeof schemas_companyUsers;
  "schemas/creators": typeof schemas_creators;
  "schemas/posts": typeof schemas_posts;
  "schemas/submissions": typeof schemas_submissions;
  "schemas/users": typeof schemas_users;
  users: typeof users;
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
