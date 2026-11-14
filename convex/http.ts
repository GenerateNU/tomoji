import { httpRouter } from "convex/server";
import { authKit } from "./auth";
import { stripeWebhook } from "./stripeWebhook";

const http = httpRouter();
authKit.registerRoutes(http);
http.route({ path: "/stripe/webhook", method: "POST", handler: stripeWebhook });
export default http;
