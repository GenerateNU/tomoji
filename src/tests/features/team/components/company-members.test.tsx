import { beforeEach, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { notFound } from "next/navigation";
import { useConvexAuth, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "@convex/_generated/dataModel";
import type { api } from "@convex/_generated/api";
import { CompanyMembers } from "@/features/team/components/company-members";

vi.mock("convex/react", () => ({
  useConvexAuth: vi.fn(),
  useQuery: vi.fn(),
  usePaginatedQuery: vi.fn(),
}));
vi.mock("@convex/_generated/api", () => ({
  api: { users: { me: "users:me" }, companyUsers: { list: "companyUsers:list" } },
}));
// Like redirect(), notFound() stops rendering by throwing to a Next.js boundary.
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

const profile = {
  synced: true as const,
  userId: "viewer" as Id<"users">,
  email: "viewer@example.com",
  firstName: undefined,
  lastName: undefined,
  profilePictureMediaId: undefined,
};
const companyUser: FunctionReturnType<typeof api.users.me> = {
  ...profile,
  role: "company",
  orgId: "org_company",
  companyRole: "member",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useConvexAuth).mockReturnValue({
    isAuthenticated: true,
    isLoading: false,
    isRefreshing: false,
  });
  vi.mocked(useQuery).mockReturnValue(companyUser);
  vi.mocked(usePaginatedQuery).mockReturnValue({
    results: [],
    status: "Exhausted",
    loadMore: vi.fn(),
    isLoading: false,
  });
});

test("shows not-found for a creator and skips the company query", () => {
  vi.mocked(useQuery).mockReturnValue({ ...profile, role: "creator" });
  expect(() => renderToStaticMarkup(<CompanyMembers />)).toThrow("NEXT_NOT_FOUND");
  expect(notFound).toHaveBeenCalledOnce();
  expect(usePaginatedQuery).toHaveBeenCalledWith("companyUsers:list", "skip", {
    initialNumItems: 20,
  });
});

test("keeps operator access unavailable until a company-scoped flow is defined", () => {
  vi.mocked(useQuery).mockReturnValue({ ...profile, role: "operator" });
  expect(() => renderToStaticMarkup(<CompanyMembers />)).toThrow("NEXT_NOT_FOUND");
  expect(usePaginatedQuery).toHaveBeenCalledWith("companyUsers:list", "skip", {
    initialNumItems: 20,
  });
});

test("renders the directory for a company member", () => {
  expect(renderToStaticMarkup(<CompanyMembers />)).toContain("Workspace members");
  expect(notFound).not.toHaveBeenCalled();
  expect(usePaginatedQuery).toHaveBeenCalledWith("companyUsers:list", {}, { initialNumItems: 20 });
});

test("waits for the account query rather than showing not-found", () => {
  vi.mocked(useQuery).mockReturnValue(undefined);
  expect(renderToStaticMarkup(<CompanyMembers />)).toContain("Loading workspace members");
  expect(notFound).not.toHaveBeenCalled();
  expect(usePaginatedQuery).toHaveBeenCalledWith("companyUsers:list", "skip", {
    initialNumItems: 20,
  });
});

test("skips identity and company queries while authentication is loading", () => {
  vi.mocked(useConvexAuth).mockReturnValue({
    isAuthenticated: false,
    isLoading: true,
    isRefreshing: false,
  });
  vi.mocked(useQuery).mockReturnValue(undefined);
  expect(renderToStaticMarkup(<CompanyMembers />)).toContain("Loading workspace members");
  expect(useQuery).toHaveBeenCalledWith("users:me", "skip");
  expect(usePaginatedQuery).toHaveBeenCalledWith("companyUsers:list", "skip", {
    initialNumItems: 20,
  });
  expect(notFound).not.toHaveBeenCalled();
});

test("preserves the setup message for an unsynced account", () => {
  vi.mocked(useQuery).mockReturnValue({ synced: false });
  expect(renderToStaticMarkup(<CompanyMembers />)).toContain("finishing setting up your account");
  expect(notFound).not.toHaveBeenCalled();
  expect(usePaginatedQuery).toHaveBeenCalledWith("companyUsers:list", "skip", {
    initialNumItems: 20,
  });
});

test("offers sign-in rather than loading forever after the session ends", () => {
  vi.mocked(useConvexAuth).mockReturnValue({
    isAuthenticated: false,
    isLoading: false,
    isRefreshing: false,
  });
  vi.mocked(useQuery).mockReturnValue(undefined);
  const html = renderToStaticMarkup(<CompanyMembers />);
  expect(html).toContain("sign in");
  expect(html).toContain("/login?next=%2Fteam%2Finvites");
  expect(notFound).not.toHaveBeenCalled();
  expect(usePaginatedQuery).toHaveBeenCalledWith("companyUsers:list", "skip", {
    initialNumItems: 20,
  });
});
