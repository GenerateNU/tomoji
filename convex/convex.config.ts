import migrations from "@convex-dev/migrations/convex.config";
import workOSAuthKit from "@convex-dev/workos-authkit/convex.config";
import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  // Each Convex deployment selects its own private bucket through these env vars.
  env: {
    S3_MEDIA_BUCKET: v.string(),
    S3_MEDIA_REGION: v.string(),
  },
});
app.use(workOSAuthKit);
app.use(migrations);
export default app;
