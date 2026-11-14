export type XLinkResult = "connected" | "failed" | "denied" | "sign_in_required" | "already_linked";

type XGrant = { authorizationUrl: string; expiresAt: number };
const pendingStarts = new WeakMap<object, Map<string, Promise<XGrant>>>();
const startListeners = new Set<() => void>();

export function subscribeXStarts(listener: () => void) {
  startListeners.add(listener);
  return () => {
    startListeners.delete(listener);
  };
}

export function hasPendingXStart(client: object, creatorId: string): boolean {
  return pendingStarts.get(client)?.has(creatorId) ?? false;
}

/** A UI timeout cannot cancel Convex; retain the lock across editor remounts until it settles. */
export function startXLinkOnce(
  client: object,
  creatorId: string,
  start: () => Promise<XGrant>,
): Promise<XGrant> {
  let requests = pendingStarts.get(client);
  if (!requests) {
    requests = new Map();
    pendingStarts.set(client, requests);
  }
  const pending = requests.get(creatorId);
  if (pending) return pending;
  const request = start();
  requests.set(creatorId, request);
  startListeners.forEach((listener) => listener());
  void request
    .finally(() => {
      requests.delete(creatorId);
      startListeners.forEach((listener) => listener());
    })
    .catch(() => {
      // The caller handles the original rejection; this cleanup chain must not reject again.
    });
  return request;
}

export class XLinkTimeoutError extends Error {}

/** A late Convex answer is ignored; timing out never starts another authorization. */
export async function withXLinkTimeout<T>(request: Promise<T>): Promise<T> {
  let timer: number | undefined;
  try {
    return await Promise.race([
      request,
      new Promise<never>((_, reject) => {
        timer = window.setTimeout(() => reject(new XLinkTimeoutError()), 30_000);
      }),
    ]);
  } finally {
    window.clearTimeout(timer);
  }
}

/** Callback flags explain an outcome; they never prove that an account is connected. */
export function readXLinkResult(tab: Window, origin: string): XLinkResult | null {
  try {
    const url = new URL(tab.location.href);
    if (url.origin !== origin || url.pathname !== "/") return null;
    const result = url.searchParams.get("x_link");
    return result === "connected" ||
      result === "failed" ||
      result === "denied" ||
      result === "sign_in_required" ||
      result === "already_linked"
      ? result
      : null;
  } catch {
    // X is cross-origin while authorization is in progress.
    return null;
  }
}

export function xLinkResultMessage(result: XLinkResult): string {
  switch (result) {
    case "connected":
      return "X finished authorization. Check your connection to confirm.";
    case "denied":
      return "X authorization was cancelled. You can try again.";
    case "sign_in_required":
      return "Sign in to Ohani again, then retry connecting X.";
    case "already_linked":
      return "That X account is connected to another creator. Choose a different account.";
    case "failed":
      return "We couldn't confirm the X connection. Check your connection before trying again.";
  }
}

/** Only navigate the tab to the provider endpoint returned by the existing backend. */
export function xAuthorizationUrl(value: string): string {
  const url = new URL(value);
  if (url.origin !== "https://x.com" || url.pathname !== "/i/oauth2/authorize") {
    throw new Error("Invalid X authorization URL");
  }
  return url.href;
}
