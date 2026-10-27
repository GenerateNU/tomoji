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
import type * as authorize from "../authorize.js";
import type * as campaigns from "../campaigns.js";
import type * as companies from "../companies.js";
import type * as companyUsers from "../companyUsers.js";
import type * as countries from "../countries.js";
import type * as creators from "../creators.js";
import type * as crons from "../crons.js";
import type * as deliverables from "../deliverables.js";
import type * as disputes from "../disputes.js";
import type * as http from "../http.js";
import type * as invites from "../invites.js";
import type * as lib_authz from "../lib/authz.js";
import type * as lib_birthdate from "../lib/birthdate.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_functions from "../lib/functions.js";
import type * as lib_identity from "../lib/identity.js";
import type * as lib_mediaUploadPolicy from "../lib/mediaUploadPolicy.js";
import type * as lib_pagination from "../lib/pagination.js";
import type * as lib_s3 from "../lib/s3.js";
import type * as lib_urls from "../lib/urls.js";
import type * as lib_validation from "../lib/validation.js";
import type * as lib_workos from "../lib/workos.js";
import type * as lib_xOAuth from "../lib/xOAuth.js";
import type * as lib_xTokenEncryption from "../lib/xTokenEncryption.js";
import type * as media from "../media.js";
import type * as mediaInternal from "../mediaInternal.js";
import type * as migrations_2026_10_07_remove_user_profile_pictures from "../migrations/2026_10_07_remove_user_profile_pictures.js";
import type * as migrations_2026_10_25_backfill_creator_niches from "../migrations/2026_10_25_backfill_creator_niches.js";
import type * as migrations_runner from "../migrations/runner.js";
import type * as models_applications from "../models/applications.js";
import type * as models_assignments from "../models/assignments.js";
import type * as models_campaigns from "../models/campaigns.js";
import type * as models_catalog from "../models/catalog.js";
import type * as models_companies from "../models/companies.js";
import type * as models_companyUsers from "../models/companyUsers.js";
import type * as models_countries from "../models/countries.js";
import type * as models_creatorNiches from "../models/creatorNiches.js";
import type * as models_creatorSkills from "../models/creatorSkills.js";
import type * as models_creators from "../models/creators.js";
import type * as models_deliverableDrafts from "../models/deliverableDrafts.js";
import type * as models_deliverables from "../models/deliverables.js";
import type * as models_disputes from "../models/disputes.js";
import type * as models_invites from "../models/invites.js";
import type * as models_media from "../models/media.js";
import type * as models_niches from "../models/niches.js";
import type * as models_notifications from "../models/notifications.js";
import type * as models_opportunities from "../models/opportunities.js";
import type * as models_opportunityStars from "../models/opportunityStars.js";
import type * as models_posts from "../models/posts.js";
import type * as models_skills from "../models/skills.js";
import type * as models_submissions from "../models/submissions.js";
import type * as models_users from "../models/users.js";
import type * as models_xAccountLookup from "../models/xAccountLookup.js";
import type * as models_xAccounts from "../models/xAccounts.js";
import type * as models_xLinkAttempts from "../models/xLinkAttempts.js";
import type * as niches from "../niches.js";
import type * as notifications from "../notifications.js";
import type * as opportunities from "../opportunities.js";
import type * as posts from "../posts.js";
import type * as seed from "../seed.js";
import type * as skills from "../skills.js";
import type * as submissions from "../submissions.js";
import type * as tests_helpers from "../tests/helpers.js";
import type * as users from "../users.js";
import type * as xAccounts from "../xAccounts.js";
import type * as xAccountsInternal from "../xAccountsInternal.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  applications: typeof applications;
  assignments: typeof assignments;
  auth: typeof auth;
  authorize: typeof authorize;
  campaigns: typeof campaigns;
  companies: typeof companies;
  companyUsers: typeof companyUsers;
  countries: typeof countries;
  creators: typeof creators;
  crons: typeof crons;
  deliverables: typeof deliverables;
  disputes: typeof disputes;
  http: typeof http;
  invites: typeof invites;
  "lib/authz": typeof lib_authz;
  "lib/birthdate": typeof lib_birthdate;
  "lib/errors": typeof lib_errors;
  "lib/functions": typeof lib_functions;
  "lib/identity": typeof lib_identity;
  "lib/mediaUploadPolicy": typeof lib_mediaUploadPolicy;
  "lib/pagination": typeof lib_pagination;
  "lib/s3": typeof lib_s3;
  "lib/urls": typeof lib_urls;
  "lib/validation": typeof lib_validation;
  "lib/workos": typeof lib_workos;
  "lib/xOAuth": typeof lib_xOAuth;
  "lib/xTokenEncryption": typeof lib_xTokenEncryption;
  media: typeof media;
  mediaInternal: typeof mediaInternal;
  "migrations/2026_10_07_remove_user_profile_pictures": typeof migrations_2026_10_07_remove_user_profile_pictures;
  "migrations/2026_10_25_backfill_creator_niches": typeof migrations_2026_10_25_backfill_creator_niches;
  "migrations/runner": typeof migrations_runner;
  "models/applications": typeof models_applications;
  "models/assignments": typeof models_assignments;
  "models/campaigns": typeof models_campaigns;
  "models/catalog": typeof models_catalog;
  "models/companies": typeof models_companies;
  "models/companyUsers": typeof models_companyUsers;
  "models/countries": typeof models_countries;
  "models/creatorNiches": typeof models_creatorNiches;
  "models/creatorSkills": typeof models_creatorSkills;
  "models/creators": typeof models_creators;
  "models/deliverableDrafts": typeof models_deliverableDrafts;
  "models/deliverables": typeof models_deliverables;
  "models/disputes": typeof models_disputes;
  "models/invites": typeof models_invites;
  "models/media": typeof models_media;
  "models/niches": typeof models_niches;
  "models/notifications": typeof models_notifications;
  "models/opportunities": typeof models_opportunities;
  "models/opportunityStars": typeof models_opportunityStars;
  "models/posts": typeof models_posts;
  "models/skills": typeof models_skills;
  "models/submissions": typeof models_submissions;
  "models/users": typeof models_users;
  "models/xAccountLookup": typeof models_xAccountLookup;
  "models/xAccounts": typeof models_xAccounts;
  "models/xLinkAttempts": typeof models_xLinkAttempts;
  niches: typeof niches;
  notifications: typeof notifications;
  opportunities: typeof opportunities;
  posts: typeof posts;
  seed: typeof seed;
  skills: typeof skills;
  submissions: typeof submissions;
  "tests/helpers": typeof tests_helpers;
  users: typeof users;
  xAccounts: typeof xAccounts;
  xAccountsInternal: typeof xAccountsInternal;
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
