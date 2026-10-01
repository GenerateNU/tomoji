/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as applications from "../applications.js";
import type * as assignments from "../assignments.js";
import type * as auth from "../auth.js";
import type * as campaigns from "../campaigns.js";
import type * as companies from "../companies.js";
import type * as companyUsers from "../companyUsers.js";
import type * as creators from "../creators.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as lib_authz from "../lib/authz.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_functions from "../lib/functions.js";
import type * as lib_identity from "../lib/identity.js";
import type * as lib_s3 from "../lib/s3.js";
import type * as lib_validation from "../lib/validation.js";
import type * as migrations_2026_09_26_backfill_creator_usernames from "../migrations/2026_09_26_backfill_creator_usernames.js";
import type * as migrations_2026_09_26_backfill_user_names from "../migrations/2026_09_26_backfill_user_names.js";
import type * as migrations_runner from "../migrations/runner.js";
import type * as models_applications from "../models/applications.js";
import type * as models_assignments from "../models/assignments.js";
import type * as models_campaigns from "../models/campaigns.js";
import type * as models_companies from "../models/companies.js";
import type * as models_companyUsers from "../models/companyUsers.js";
import type * as models_creators from "../models/creators.js";
import type * as models_opportunities from "../models/opportunities.js";
import type * as models_users from "../models/users.js";
import type * as opportunities from "../opportunities.js";
import type * as tests_helpers from "../tests/helpers.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  applications: typeof applications;
  assignments: typeof assignments;
  auth: typeof auth;
  campaigns: typeof campaigns;
  companies: typeof companies;
  companyUsers: typeof companyUsers;
  creators: typeof creators;
  crons: typeof crons;
  http: typeof http;
  "lib/authz": typeof lib_authz;
  "lib/errors": typeof lib_errors;
  "lib/functions": typeof lib_functions;
  "lib/identity": typeof lib_identity;
  "lib/s3": typeof lib_s3;
  "lib/validation": typeof lib_validation;
  "migrations/2026_09_26_backfill_creator_usernames": typeof migrations_2026_09_26_backfill_creator_usernames;
  "migrations/2026_09_26_backfill_user_names": typeof migrations_2026_09_26_backfill_user_names;
  "migrations/runner": typeof migrations_runner;
  "models/applications": typeof models_applications;
  "models/assignments": typeof models_assignments;
  "models/campaigns": typeof models_campaigns;
  "models/companies": typeof models_companies;
  "models/companyUsers": typeof models_companyUsers;
  "models/creators": typeof models_creators;
  "models/opportunities": typeof models_opportunities;
  "models/users": typeof models_users;
  opportunities: typeof opportunities;
  "tests/helpers": typeof tests_helpers;
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

export declare const components: {
  workOSAuthKit: import("@convex-dev/workos-authkit/_generated/component.js").ComponentApi<"workOSAuthKit">;
  migrations: import("@convex-dev/migrations/_generated/component.js").ComponentApi<"migrations">;
};
