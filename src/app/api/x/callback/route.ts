import { withAuth } from "@workos-inc/authkit-nextjs";
import { fetchAction } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";

/** Exchanges X's callback immediately under the existing WorkOS session. */
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  let session: Awaited<ReturnType<typeof withAuth>>;
  try {
    session = await withAuth();
  } catch {
    return resultRedirect(request, "failed");
  }
  if (!session.user || !session.accessToken) return resultRedirect(request, "sign_in_required");
  const state = params.get("state");
  const code = params.get("code");
  const denied = params.has("error");
  if (
    !state ||
    params.getAll("state").length !== 1 ||
    params.getAll("code").length > 1 ||
    (!denied && !code)
  )
    return resultRedirect(request, "failed");
  try {
    await fetchAction(
      api.xAccounts.complete,
      { state, code: code ?? undefined, denied },
      { token: session.accessToken },
    );
    return resultRedirect(request, "connected");
  } catch {
    // Never put provider payloads, codes, state, or credentials into redirect URLs.
    return resultRedirect(request, denied ? "denied" : "failed");
  }
}

/** Clears callback parameters and prevents caching/referrer disclosure. */
function resultRedirect(
  request: Request,
  result: "connected" | "failed" | "denied" | "sign_in_required",
): Response {
  const url = new URL("/", request.url);
  url.searchParams.set("x_link", result);
  return new Response(null, {
    status: 303,
    headers: {
      Location: url.toString(),
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
