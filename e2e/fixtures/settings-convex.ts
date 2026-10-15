import { useSyncExternalStore } from "react";
import { getFunctionName, type FunctionReference, type FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import type { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

type Call = { name: string; args: Record<string, unknown> };
type Profile = FunctionReturnType<typeof api.creators.me>;

const listeners = new Set<() => void>();
let revision = 0;
let profile: Profile = {
  creatorId: "test-creator" as Id<"creators">,
  firstName: "Zahra",
  lastName: "Wibisana",
  email: "zahra@example.test",
  username: "zahra",
  phoneNumber: "+1 617 555 0100",
  githubLink: "https://github.com/zahra",
};
const calls: Call[] = [];
const queries: Call[] = [];
const failures = new Map<string, Error[]>();
const delays = new Map<string, { promise: Promise<void>; release: () => void }>();
const parameters = new URLSearchParams(location.search);
let session = {
  role: parameters.get("role") ?? "creator",
  isAuthenticated: !parameters.has("auth"),
  isLoading: parameters.get("auth") === "loading",
  synced: parameters.get("account") !== "unsynced",
  userLoading: parameters.get("account") === "loading",
  profileLoading: parameters.get("profile") === "loading",
  failedQuery: parameters.get("failedQuery") ?? "",
};

function notify() {
  revision += 1;
  for (const listener of listeners) listener();
}

export const fixture = {
  calls,
  queries,
  setSession(updates: Partial<typeof session>) {
    session = { ...session, ...updates };
    notify();
  },
  setGithubLink(githubLink: string) {
    profile = { ...profile, githubLink };
    notify();
  },
  setProfile(updates: Partial<Profile>) {
    profile = { ...profile, ...updates };
    notify();
  },
  failNext(name: string) {
    failures.set(name, [...(failures.get(name) ?? []), new Error("Simulated service failure")]);
  },
  rejectUsername() {
    failures.set("creators:update", [
      new ConvexError({ code: "conflict", reason: "username_taken" }),
    ]);
  },
  delayNext(name: string) {
    let release!: () => void;
    const promise = new Promise<void>((resolve) => {
      release = resolve;
    });
    delays.set(name, { promise, release });
  },
  release(name: string) {
    delays.get(name)?.release();
    delays.delete(name);
  },
};

export function useConvexAuth() {
  useRevision();
  return { isAuthenticated: session.isAuthenticated, isLoading: session.isLoading };
}

function useRevision() {
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => revision,
  );
}

export function useQuery(reference: FunctionReference<"query">, args: unknown) {
  useRevision();
  return queryResult(reference, args);
}

export function useQueries(
  requests: Record<string, { query: FunctionReference<"query">; args: unknown }>,
) {
  useRevision();
  return Object.fromEntries(
    Object.entries(requests).map(([key, { query, args }]) => {
      try {
        return [key, queryResult(query, args)];
      } catch (error) {
        return [key, error];
      }
    }),
  );
}

function queryResult(reference: FunctionReference<"query">, args: unknown) {
  if (args === "skip") return undefined;
  const name = getFunctionName(reference);
  if (!queries.some((query) => query.name === name)) {
    queries.push({ name, args: args as Record<string, unknown> });
  }
  if (session.failedQuery === name) throw new Error("Simulated query failure");
  if (name === "users:me") {
    if (!session.isAuthenticated) throw new Error("Signed-out visitors must not query users.me");
    if (session.userLoading) return undefined;
    return {
      synced: session.synced,
      role: session.role,
      userId: "test-user",
      firstName: "Zahra",
      lastName: "Wibisana",
    };
  }
  if (name === "creators:me") {
    if (session.role !== "creator" || !session.synced || session.userLoading) {
      throw new Error("Only a synced creator must request creators.me");
    }
    return session.profileLoading ? undefined : profile;
  }
  throw new Error(`Unexpected query: ${name}`);
}

const operations = new Map<string, (args: Record<string, unknown>) => Promise<unknown>>();

function operation(reference: FunctionReference<"mutation" | "action">) {
  const name = getFunctionName(reference);
  if (!operations.has(name)) {
    operations.set(name, async (args) => {
      calls.push({ name, args });
      if (delays.has(name)) await delays.get(name)!.promise;
      const failure = failures.get(name)?.shift();
      if (failure) throw failure;
      if (name === "creators:update") {
        profile = {
          ...profile,
          ...(args.username !== undefined ? { username: args.username as string } : {}),
          ...("githubLink" in args
            ? { githubLink: (args.githubLink as string | null) ?? undefined }
            : {}),
          ...("phoneNumber" in args
            ? { phoneNumber: (args.phoneNumber as string | null) ?? undefined }
            : {}),
        };
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
        profile = {
          ...profile,
          profilePictureMediaId: "test-upload" as Id<"mediaUploads">,
        };
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
