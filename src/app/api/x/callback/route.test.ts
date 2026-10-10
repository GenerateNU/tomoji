import { afterEach, expect, test, vi } from "vitest";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { fetchAction } from "convex/nextjs";
import { GET } from "./route";

vi.mock("@workos-inc/authkit-nextjs", () => ({ withAuth: vi.fn() }));
vi.mock("convex/nextjs", () => ({ fetchAction: vi.fn() }));
afterEach(() => vi.resetAllMocks());

test("a signed-out callback never exchanges an authorization code", async () => {
  vi.mocked(withAuth).mockResolvedValue({ user: null } as never);
  const response = await GET(
    new Request("http://localhost:3000/api/x/callback?state=state&code=secret-code"),
  );
  expect(response.headers.get("location")).toBe("http://localhost:3000/?x_link=sign_in_required");
  expect(fetchAction).not.toHaveBeenCalled();
});

test("the callback forwards the WorkOS token and redirects without secrets", async () => {
  vi.mocked(withAuth).mockResolvedValue({
    user: { id: "creator" },
    accessToken: "workos-token",
  } as never);
  const response = await GET(
    new Request("http://localhost:3000/api/x/callback?state=state&code=secret-code"),
  );
  expect(fetchAction).toHaveBeenCalledWith(
    expect.anything(),
    { state: "state", code: "secret-code", denied: false },
    { token: "workos-token" },
  );
  expect(response.headers.get("location")).toBe("http://localhost:3000/?x_link=connected");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("cache-control")).toBe("no-store");
});

test("provider errors are treated as data and never included in redirects", async () => {
  vi.mocked(withAuth).mockResolvedValue({
    user: { id: "creator" },
    accessToken: "workos-token",
  } as never);
  vi.mocked(fetchAction).mockRejectedValue(new Error("sensitive-provider-payload"));
  const response = await GET(
    new Request(
      "http://localhost:3000/api/x/callback?state=state&error=access_denied&error_description=sensitive",
    ),
  );
  expect(response.headers.get("location")).toBe("http://localhost:3000/?x_link=denied");
  expect(fetchAction).toHaveBeenCalledWith(
    expect.anything(),
    { state: "state", code: undefined, denied: true },
    { token: "workos-token" },
  );
});

test("session lookup failure still clears the sensitive callback URL", async () => {
  vi.mocked(withAuth).mockRejectedValue(new Error("WorkOS temporarily unavailable"));
  const response = await GET(
    new Request("http://localhost:3000/api/x/callback?state=state&code=secret-code"),
  );
  expect(response.headers.get("location")).toBe("http://localhost:3000/?x_link=failed");
  expect(fetchAction).not.toHaveBeenCalled();
});
