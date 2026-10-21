import { defineSchema } from "convex/server";
import { applicationsTable } from "./schemas/applications.schema";
import { assignmentsTable } from "./schemas/assignments.schema";
import { campaignsTable } from "./schemas/campaigns.schema";
import { companiesTable } from "./schemas/companies.schema";
import { invitesTable } from "./schemas/invites.schema";
import { companyUsersTable } from "./schemas/companyUsers.schema";
import { creatorsTable } from "./schemas/creators.schema";
import { deliverablesTable } from "./schemas/deliverables.schema";
import { disputesTable } from "./schemas/disputes.schema";
import { mediaUploadsTable } from "./schemas/mediaUploads.schema";
import { notificationsTable } from "./schemas/notifications.schema";
import { opportunitiesTable } from "./schemas/opportunities.schema";
import { opportunityStarsTable } from "./schemas/opportunityStars.schema";
import { postsTable } from "./schemas/posts.schema";
import { submissionsTable } from "./schemas/submissions.schema";
import { usersTable } from "./schemas/users.schema";
import { xAccountsTable } from "./schemas/xAccounts.schema";
import { xAccountCredentialsTable } from "./schemas/xAccountCredentials.schema";
import { xLinkAttemptsTable } from "./schemas/xLinkAttempts.schema";

export default defineSchema({
  users: usersTable,
  companyUsers: companyUsersTable,
  creators: creatorsTable,
  companies: companiesTable,
  invites: invitesTable,
  campaigns: campaignsTable,
  opportunities: opportunitiesTable,
  opportunityStars: opportunityStarsTable,
  deliverables: deliverablesTable,
  applications: applicationsTable,
  assignments: assignmentsTable,
  submissions: submissionsTable,
  posts: postsTable,
  disputes: disputesTable,
  mediaUploads: mediaUploadsTable,
  xAccounts: xAccountsTable,
  xAccountCredentials: xAccountCredentialsTable,
  xLinkAttempts: xLinkAttemptsTable,
  notifications: notificationsTable,
});
