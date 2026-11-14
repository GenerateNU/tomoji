import { httpRouter } from "convex/server";
import { authKit } from "./auth";
import { stripePlatformWebhook, stripeWebhook } from "./stripeWebhook";

const http = httpRouter();
authKit.registerRoutes(http);
http.route({ path: "/stripe/webhook", method: "POST", handler: stripeWebhook });
http.route({ path: "/stripe/webhook/platform", method: "POST", handler: stripePlatformWebhook });
export default http;
