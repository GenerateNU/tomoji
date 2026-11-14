/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as aiReview from "../aiReview.js";
import type * as aiReviewActions from "../aiReviewActions.js";
import type * as aiReviewInternal from "../aiReviewInternal.js";
import type * as applications from "../applications.js";
import type * as assignments from "../assignments.js";
import type * as auth from "../auth.js";
import type * as authorize from "../authorize.js";
import type * as campaigns from "../campaigns.js";
import type * as charging from "../charging.js";
import type * as companies from "../companies.js";
import type * as companyUsers from "../companyUsers.js";
import type * as countries from "../countries.js";
import type * as creators from "../creators.js";
import type * as crons from "../crons.js";
import type * as deliverables from "../deliverables.js";
import type * as disputes from "../disputes.js";
import type * as earningSources from "../earningSources.js";
import type * as earnings from "../earnings.js";
import type * as earningsSchedules from "../earningsSchedules.js";
import type * as http from "../http.js";
import type * as invites from "../invites.js";
import type * as languages from "../languages.js";
import type * as lib_ai_aiProvider from "../lib/ai/aiProvider.js";
import type * as lib_ai_assemblyAi from "../lib/ai/assemblyAi.js";
import type * as lib_ai_jev from "../lib/ai/jev.js";
import type * as lib_ai_providerStep from "../lib/ai/providerStep.js";
import type * as lib_ai_reviewPolicy from "../lib/ai/reviewPolicy.js";
import type * as lib_ai_validation from "../lib/ai/validation.js";
import type * as lib_ai_workflow from "../lib/ai/workflow.js";
import type * as lib_authz from "../lib/authz.js";
import type * as lib_birthdate from "../lib/birthdate.js";
import type * as lib_earningsCalculator from "../lib/earningsCalculator.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_functions from "../lib/functions.js";
import type * as lib_identity from "../lib/identity.js";
import type * as lib_mediaUploadPolicy from "../lib/mediaUploadPolicy.js";
import type * as lib_pagination from "../lib/pagination.js";
import type * as lib_s3 from "../lib/s3.js";
import type * as lib_stripe from "../lib/stripe.js";
import type * as lib_time from "../lib/time.js";
import type * as lib_urls from "../lib/urls.js";
import type * as lib_validation from "../lib/validation.js";
import type * as lib_workos from "../lib/workos.js";
import type * as lib_xApi from "../lib/xApi.js";
import type * as lib_xOAuth from "../lib/xOAuth.js";
import type * as lib_xTokenEncryption from "../lib/xTokenEncryption.js";
import type * as media from "../media.js";
import type * as mediaInternal from "../mediaInternal.js";
import type * as migrations_2026_10_07_remove_user_profile_pictures from "../migrations/2026_10_07_remove_user_profile_pictures.js";
import type * as migrations_2026_11_11_backfill_earnings_schedules from "../migrations/2026_11_11_backfill_earnings_schedules.js";
import type * as migrations_2026_11_14_score_open_opportunities from "../migrations/2026_11_14_score_open_opportunities.js";
import type * as migrations_runner from "../migrations/runner.js";
import type * as models_aiReviewAttempts from "../models/aiReviewAttempts.js";
import type * as models_applications from "../models/applications.js";
import type * as models_assignments from "../models/assignments.js";
import type * as models_campaigns from "../models/campaigns.js";
import type * as models_catalog from "../models/catalog.js";
import type * as models_companies from "../models/companies.js";
import type * as models_companyUsers from "../models/companyUsers.js";
import type * as models_countries from "../models/countries.js";
import type * as models_creatorAssignments from "../models/creatorAssignments.js";
import type * as models_creatorLanguages from "../models/creatorLanguages.js";
import type * as models_creatorNiches from "../models/creatorNiches.js";
import type * as models_creatorSkills from "../models/creatorSkills.js";
import type * as models_creators from "../models/creators.js";
import type * as models_deliverableDrafts from "../models/deliverableDrafts.js";
import type * as models_deliverables from "../models/deliverables.js";
import type * as models_disputes from "../models/disputes.js";
import type * as models_earningSources from "../models/earningSources.js";
import type * as models_earnings from "../models/earnings.js";
import type * as models_earningsHistory from "../models/earningsHistory.js";
import type * as models_earningsScheduler from "../models/earningsScheduler.js";
import type * as models_earningsSchedules from "../models/earningsSchedules.js";
import type * as models_followerRanges from "../models/followerRanges.js";
import type * as models_invites from "../models/invites.js";
import type * as models_languages from "../models/languages.js";
import type * as models_media from "../models/media.js";
import type * as models_niches from "../models/niches.js";
import type * as models_notifications from "../models/notifications.js";
import type * as models_operators from "../models/operators.js";
import type * as models_opportunities from "../models/opportunities.js";
import type * as models_opportunityLanguages from "../models/opportunityLanguages.js";
import type * as models_opportunityNiches from "../models/opportunityNiches.js";
import type * as models_opportunityScores from "../models/opportunityScores.js";
import type * as models_opportunitySkills from "../models/opportunitySkills.js";
import type * as models_opportunityStars from "../models/opportunityStars.js";
import type * as models_payments from "../models/payments.js";
import type * as models_payouts from "../models/payouts.js";
import type * as models_posts from "../models/posts.js";
import type * as models_skills from "../models/skills.js";
import type * as models_stripeAccounts from "../models/stripeAccounts.js";
import type * as models_stripeCustomers from "../models/stripeCustomers.js";
import type * as models_submissions from "../models/submissions.js";
import type * as models_supportingMedia from "../models/supportingMedia.js";
import type * as models_users from "../models/users.js";
import type * as models_xAccountLookup from "../models/xAccountLookup.js";
import type * as models_xAccounts from "../models/xAccounts.js";
import type * as models_xLinkAttempts from "../models/xLinkAttempts.js";
import type * as niches from "../niches.js";
import type * as notifications from "../notifications.js";
import type * as operators from "../operators.js";
import type * as opportunities from "../opportunities.js";
import type * as opportunityScores from "../opportunityScores.js";
import type * as payments from "../payments.js";
import type * as payouts from "../payouts.js";
import type * as posts from "../posts.js";
import type * as seed from "../seed.js";
import type * as skills from "../skills.js";
import type * as stripeAccounts from "../stripeAccounts.js";
import type * as stripeCustomers from "../stripeCustomers.js";
import type * as stripeWebhook from "../stripeWebhook.js";
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
  aiReview: typeof aiReview;
  aiReviewActions: typeof aiReviewActions;
  aiReviewInternal: typeof aiReviewInternal;
  applications: typeof applications;
  assignments: typeof assignments;
  auth: typeof auth;
  authorize: typeof authorize;
  campaigns: typeof campaigns;
  charging: typeof charging;
  companies: typeof companies;
  companyUsers: typeof companyUsers;
  countries: typeof countries;
  creators: typeof creators;
  crons: typeof crons;
  deliverables: typeof deliverables;
  disputes: typeof disputes;
  earningSources: typeof earningSources;
  earnings: typeof earnings;
  earningsSchedules: typeof earningsSchedules;
  http: typeof http;
  invites: typeof invites;
  languages: typeof languages;
  "lib/ai/aiProvider": typeof lib_ai_aiProvider;
  "lib/ai/assemblyAi": typeof lib_ai_assemblyAi;
  "lib/ai/jev": typeof lib_ai_jev;
  "lib/ai/providerStep": typeof lib_ai_providerStep;
  "lib/ai/reviewPolicy": typeof lib_ai_reviewPolicy;
  "lib/ai/validation": typeof lib_ai_validation;
  "lib/ai/workflow": typeof lib_ai_workflow;
  "lib/authz": typeof lib_authz;
  "lib/birthdate": typeof lib_birthdate;
  "lib/earningsCalculator": typeof lib_earningsCalculator;
  "lib/errors": typeof lib_errors;
  "lib/functions": typeof lib_functions;
  "lib/identity": typeof lib_identity;
  "lib/mediaUploadPolicy": typeof lib_mediaUploadPolicy;
  "lib/pagination": typeof lib_pagination;
  "lib/s3": typeof lib_s3;
  "lib/stripe": typeof lib_stripe;
  "lib/time": typeof lib_time;
  "lib/urls": typeof lib_urls;
  "lib/validation": typeof lib_validation;
  "lib/workos": typeof lib_workos;
  "lib/xApi": typeof lib_xApi;
  "lib/xOAuth": typeof lib_xOAuth;
  "lib/xTokenEncryption": typeof lib_xTokenEncryption;
  media: typeof media;
  mediaInternal: typeof mediaInternal;
  "migrations/2026_10_07_remove_user_profile_pictures": typeof migrations_2026_10_07_remove_user_profile_pictures;
  "migrations/2026_11_11_backfill_earnings_schedules": typeof migrations_2026_11_11_backfill_earnings_schedules;
  "migrations/2026_11_14_score_open_opportunities": typeof migrations_2026_11_14_score_open_opportunities;
  "migrations/runner": typeof migrations_runner;
  "models/aiReviewAttempts": typeof models_aiReviewAttempts;
  "models/applications": typeof models_applications;
  "models/assignments": typeof models_assignments;
  "models/campaigns": typeof models_campaigns;
  "models/catalog": typeof models_catalog;
  "models/companies": typeof models_companies;
  "models/companyUsers": typeof models_companyUsers;
  "models/countries": typeof models_countries;
  "models/creatorAssignments": typeof models_creatorAssignments;
  "models/creatorLanguages": typeof models_creatorLanguages;
  "models/creatorNiches": typeof models_creatorNiches;
  "models/creatorSkills": typeof models_creatorSkills;
  "models/creators": typeof models_creators;
  "models/deliverableDrafts": typeof models_deliverableDrafts;
  "models/deliverables": typeof models_deliverables;
  "models/disputes": typeof models_disputes;
  "models/earningSources": typeof models_earningSources;
  "models/earnings": typeof models_earnings;
  "models/earningsHistory": typeof models_earningsHistory;
  "models/earningsScheduler": typeof models_earningsScheduler;
  "models/earningsSchedules": typeof models_earningsSchedules;
  "models/followerRanges": typeof models_followerRanges;
  "models/invites": typeof models_invites;
  "models/languages": typeof models_languages;
  "models/media": typeof models_media;
  "models/niches": typeof models_niches;
  "models/notifications": typeof models_notifications;
  "models/operators": typeof models_operators;
  "models/opportunities": typeof models_opportunities;
  "models/opportunityLanguages": typeof models_opportunityLanguages;
  "models/opportunityNiches": typeof models_opportunityNiches;
  "models/opportunityScores": typeof models_opportunityScores;
  "models/opportunitySkills": typeof models_opportunitySkills;
  "models/opportunityStars": typeof models_opportunityStars;
  "models/payments": typeof models_payments;
  "models/payouts": typeof models_payouts;
  "models/posts": typeof models_posts;
  "models/skills": typeof models_skills;
  "models/stripeAccounts": typeof models_stripeAccounts;
  "models/stripeCustomers": typeof models_stripeCustomers;
  "models/submissions": typeof models_submissions;
  "models/supportingMedia": typeof models_supportingMedia;
  "models/users": typeof models_users;
  "models/xAccountLookup": typeof models_xAccountLookup;
  "models/xAccounts": typeof models_xAccounts;
  "models/xLinkAttempts": typeof models_xLinkAttempts;
  niches: typeof niches;
  notifications: typeof notifications;
  operators: typeof operators;
  opportunities: typeof opportunities;
  opportunityScores: typeof opportunityScores;
  payments: typeof payments;
  payouts: typeof payouts;
  posts: typeof posts;
  seed: typeof seed;
  skills: typeof skills;
  stripeAccounts: typeof stripeAccounts;
  stripeCustomers: typeof stripeCustomers;
  stripeWebhook: typeof stripeWebhook;
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
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
};
