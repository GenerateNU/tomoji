import { defineSchema } from "convex/server";
import { auditLogTable } from "./schemas/auditLog.schema";
import { campaignCreatorsTable } from "./schemas/campaignCreators.schema";
import { campaignsTable } from "./schemas/campaigns.schema";
import { companiesTable } from "./schemas/companies.schema";
import { companyUsersTable } from "./schemas/companyUsers.schema";
import { creatorsTable } from "./schemas/creators.schema";
import { postsTable } from "./schemas/posts.schema";
import { submissionsTable } from "./schemas/submissions.schema";
import { usersTable } from "./schemas/users.schema";

export default defineSchema({
  users: usersTable,
  companyUsers: companyUsersTable,
  creators: creatorsTable,
  companies: companiesTable,
  campaigns: campaignsTable,
  campaignCreators: campaignCreatorsTable,
  submissions: submissionsTable,
  posts: postsTable,
  auditLog: auditLogTable,
});
