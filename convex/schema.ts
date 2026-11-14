import { defineSchema } from "convex/server";
import { applicationsTable } from "./schemas/applications.schema";
import { assignmentsTable } from "./schemas/assignments.schema";
import { campaignsTable } from "./schemas/campaigns.schema";
import { companiesTable } from "./schemas/companies.schema";
import { invitesTable } from "./schemas/invites.schema";
import { companyUsersTable } from "./schemas/companyUsers.schema";
import { creatorsTable } from "./schemas/creators.schema";
import { creatorLanguagesTable } from "./schemas/creatorLanguages.schema";
import { creatorNichesTable } from "./schemas/creatorNiches.schema";
import { creatorSkillsTable } from "./schemas/creatorSkills.schema";
import { disputesTable } from "./schemas/disputes.schema";
import { mediaUploadsTable } from "./schemas/mediaUploads.schema";
import { notificationsTable } from "./schemas/notifications.schema";
import { opportunitiesTable } from "./schemas/opportunities.schema";
import { opportunityScoresTable } from "./schemas/opportunityScores.schema";
import { opportunityStarsTable } from "./schemas/opportunityStars.schema";
import { opportunityLanguagesTable } from "./schemas/opportunityLanguages.schema";
import { opportunityNichesTable } from "./schemas/opportunityNiches.schema";
import { opportunitySkillsTable } from "./schemas/opportunitySkills.schema";
import { postsTable } from "./schemas/posts.schema";
import { payoutsTable } from "./schemas/payouts.schema";
import { stripeAccountCreationsTable, stripeAccountsTable } from "./schemas/stripeAccounts.schema";
import { submissionsTable } from "./schemas/submissions.schema";
import { usersTable } from "./schemas/users.schema";
import { xAccountsTable } from "./schemas/xAccounts.schema";
import { xAccountCredentialsTable } from "./schemas/xAccountCredentials.schema";
import { xLinkAttemptsTable } from "./schemas/xLinkAttempts.schema";
import { deliverablesTable } from "./schemas/deliverables.schema";
import { aiReviewAttemptsTable } from "./schemas/aiReviewAttempts.schema";

export default defineSchema({
  users: usersTable,
  companyUsers: companyUsersTable,
  creators: creatorsTable,
  creatorNiches: creatorNichesTable,
  creatorLanguages: creatorLanguagesTable,
  creatorSkills: creatorSkillsTable,
  companies: companiesTable,
  invites: invitesTable,
  campaigns: campaignsTable,
  opportunities: opportunitiesTable,
  opportunityNiches: opportunityNichesTable,
  opportunityLanguages: opportunityLanguagesTable,
  opportunitySkills: opportunitySkillsTable,
  opportunityStars: opportunityStarsTable,
  opportunityScores: opportunityScoresTable,
  deliverables: deliverablesTable,
  applications: applicationsTable,
  assignments: assignmentsTable,
  submissions: submissionsTable,
  aiReviewAttempts: aiReviewAttemptsTable,
  posts: postsTable,
  payouts: payoutsTable,
  disputes: disputesTable,
  mediaUploads: mediaUploadsTable,
  xAccounts: xAccountsTable,
  xAccountCredentials: xAccountCredentialsTable,
  xLinkAttempts: xLinkAttemptsTable,
  stripeAccounts: stripeAccountsTable,
  stripeAccountCreations: stripeAccountCreationsTable,
  notifications: notificationsTable,
});
