import { defineSchema } from "convex/server";
import { campaignCreatorsTable } from "./schemas/campaignCreators";
import { campaignsTable } from "./schemas/campaigns";
import { companiesTable } from "./schemas/companies";
import { companyUsersTable } from "./schemas/companyUsers";
import { creatorsTable } from "./schemas/creators";
import { postsTable } from "./schemas/posts";
import { submissionsTable } from "./schemas/submissions";
import { usersTable } from "./schemas/users";

export default defineSchema({
  users: usersTable,
  companyUsers: companyUsersTable,
  creators: creatorsTable,
  companies: companiesTable,
  campaigns: campaignsTable,
  campaignCreators: campaignCreatorsTable,
  submissions: submissionsTable,
  posts: postsTable,
});
