import { useSyncExternalStore } from "react";
import { getFunctionName, type FunctionReference } from "convex/server";

type Call = { name: string; args: Record<string, unknown> };
type Profile = { githubLink?: string; profilePictureMediaId?: string };

const listeners = new Set<() => void>();
let revision = 0;
let profile: Profile = { githubLink: "https://github.com/zahra" };
const calls: Call[] = [];
const failures: Record<string, number> = {};
const role = new URLSearchParams(location.search).get("role") ?? "creator";

function notify() {
  revision += 1;
  for (const listener of listeners) listener();
}

export const fixture = {
  calls,
  setGithubLink(githubLink: string) {
    profile = { ...profile, githubLink };
    notify();
  },
  failNext(name: string) {
    failures[name] = (failures[name] ?? 0) + 1;
  },
};

export function useConvexAuth() {
  return { isAuthenticated: true, isLoading: false };
}

export function useQuery(reference: FunctionReference<"query">, args: unknown) {
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => revision,
  );
  if (args === "skip") return undefined;
  const name = getFunctionName(reference);
  if (name === "users:me") return { synced: true, role, firstName: "Zahra", lastName: "Wibisana" };
  if (name === "creators:me") {
    if (role !== "creator") throw new Error("A non-creator must not request creators.me");
    return profile;
  }
  throw new Error(`Unexpected query: ${name}`);
}

const operations = new Map<string, (args: Record<string, unknown>) => Promise<unknown>>();

function operation(reference: FunctionReference<"mutation" | "action">) {
  const name = getFunctionName(reference);
  if (!operations.has(name)) {
    operations.set(name, async (args) => {
      calls.push({ name, args });
      if (failures[name]) {
        failures[name] -= 1;
        throw new Error("Simulated service failure");
      }
      if (name === "creators:update") {
        profile = { ...profile, githubLink: (args.githubLink as string | null) ?? undefined };
        notify();
        return profile;
      }
      if (name === "media:requestUpload") {
        return {
          uploadId: "test-upload",
          url: "https://uploads.example.test/photo",
          fields: { key: "staging/test-photo", policy: "test-policy" },
          expiresAt: Date.now() + 900_000,
        };
      }
      if (name === "media:completeUpload") {
        profile = { ...profile, profilePictureMediaId: "test-upload" };
        notify();
        return { mediaId: "test-upload", kind: "profile-picture" };
      }
      if (name === "media:getProfilePicture") {
        // The same tiny PNG used by the file-selection tests.
        return {
          contentType: "image/png",
          bytes: Uint8Array.from(
            atob(
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
            ),
            (character) => character.charCodeAt(0),
          ).buffer,
        };
      }
      throw new Error(`Unexpected operation: ${name}`);
    });
  }
  return operations.get(name)!;
}

export const useMutation = operation;
export const useAction = operation;
