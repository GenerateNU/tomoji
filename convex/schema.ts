import { defineSchema } from "convex/server";
import { applicationsTable } from "./schemas/applications.schema";
import { assignmentsTable } from "./schemas/assignments.schema";
import { campaignsTable } from "./schemas/campaigns.schema";
import { companiesTable } from "./schemas/companies.schema";
import { companyUsersTable } from "./schemas/companyUsers.schema";
import { creatorsTable } from "./schemas/creators.schema";
import { disputesTable } from "./schemas/disputes.schema";
import { opportunitiesTable } from "./schemas/opportunities.schema";
import { postsTable } from "./schemas/posts.schema";
import { submissionsTable } from "./schemas/submissions.schema";
import { usersTable } from "./schemas/users.schema";

export default defineSchema({
  users: usersTable,
  companyUsers: companyUsersTable,
  creators: creatorsTable,
  companies: companiesTable,
  campaigns: campaignsTable,
  opportunities: opportunitiesTable,
  applications: applicationsTable,
  assignments: assignmentsTable,
  submissions: submissionsTable,
  posts: postsTable,
  disputes: disputesTable,
});
