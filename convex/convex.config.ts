import workflow from "@convex-dev/workflow/convex.config";
import migrations from "@convex-dev/migrations/convex.config";
import workOSAuthKit from "@convex-dev/workos-authkit/convex.config";
import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  // Each Convex deployment selects its own private bucket through these env vars.
  env: {
    // Members of this WorkOS organization are Tomoji staff, not a customer
    // company. Optional so deployments without it keep working.
    WORKOS_OPERATOR_ORG_ID: v.optional(v.string()),
    // Already set on every deployment for the AuthKit component; declared here
    // so invite actions can read it.
    WORKOS_API_KEY: v.optional(v.string()),
    S3_MEDIA_BUCKET: v.string(),
    S3_MEDIA_REGION: v.string(),
    ASSEMBLYAI_API_KEY: v.optional(v.string()),
    TYPESAFE_API_KEY: v.optional(v.string()),
    AI_REVIEW_ENABLED: v.optional(v.string()),
    X_BEARER_TOKEN: v.optional(v.string()),
    X_CLIENT_ID: v.optional(v.string()),
    X_CLIENT_SECRET: v.optional(v.string()),
    X_REDIRECT_URI: v.optional(v.string()),
    X_TOKEN_ENCRYPTION_KEYS: v.optional(v.string()),
    X_TOKEN_ENCRYPTION_KEY_VERSION: v.optional(v.string()),
    X_BEARER_TOKEN: v.optional(v.string()),
    X_METRICS_SYNC_ENABLED: v.optional(v.string()),
  },
});
app.use(workOSAuthKit);
app.use(migrations);
app.use(workflow);
export default app;
