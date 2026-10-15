# Frontend

This document outlines how we organize and develop the Next.js frontend for Tomoji. For setup instructions and commands, see `CONTRIBUTING.md`. Backend conventions are covered in [Backend](BACKEND.md).

## 1. Folders

```text
src/
  app/                       Next.js routes and layouts
    layout.tsx               fonts and providers
    signup/, login/,         sign-in pages, no nav bar
    forgot-password/,
    reset-password/,
    verify-email/
    (protected)/
      layout.tsx             nav bar
      page.tsx               home (/) — where sign-in lands
      error.tsx              error boundary for signed-in pages
      <route>/               pages requiring sign-in
    auth/                    auth server actions, WorkOS callback, Google sign-in routes
  features/<domain>/         domain-specific functionality
    components/
    hooks/
    lib/
  components/                shared, reusable components
    ui/                      shadcn-generated components
  hooks/                     hooks shared across features
  lib/                       plain functions - no React, usable anywhere
  proxy.ts                   sends signed-out page visits to /login?next=<path>; server actions and other non-GET requests pass through and must check auth themselves (rules in features/auth/lib/access.ts)
```

### Where should new files go?

When adding a new file, use these guidelines to decide where it belongs:

| Question                                                                                   | Location                           |
| ------------------------------------------------------------------------------------------ | ---------------------------------- |
| Is it a Next.js-specific file like `page.tsx`, `layout.tsx`, or `route.ts`?                | `app/`                             |
| Is it related to a specific Tomoji feature, such as opportunities, campaigns, or creators? | `features/<domain>/`               |
| Is it shared or general-purpose code?                                                      | `components/`, `hooks/`, or `lib/` |

## 2. Routes

Our routes should describe the resource being accessed rather than the role of the person accessing it, so keep URLs independent of user roles. For example, `/opportunities` serves as the discovery feed for creators and the company's opportunity list for company users. The page determines which component to render based on the current user.

## 3. Component Design

We want components to be reusable, consistent, and easy to maintain. These conventions should help us avoid unnecessary duplication while keeping the frontend flexible as designs evolve.

| Principle                                 | Guidelines                                                                                                                                                                                                                                         |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prefer variants over duplicate components | If two components have the same functionality and mainly differ in styling, use a `variant` prop instead of maintaining separate implementations.                                                                                                  |
| Pass IDs instead of entire objects        | Rather than passing data through several component layers, child components can call `useQuery` directly. Convex shares subscriptions for identical queries, so multiple components requesting the same data don't create duplicate subscriptions. |
| Prefer SVGs for icons                     | Prefer SVG images for scalability and better performance. They offer crisp quality on all screen sizes and are more flexible for styling (e.g., changing colors).                                                                                  |
| Build responsive layouts                  | Use flexbox, grid, and relative widths rather than relying on fixed pixel dimensions. This will allow us to make components responsive across different screen sizes.                                                                              |
| Let parent components manage spacing      | Reusable components generally shouldn't define their own outer margins. Their parent components have a better understanding of the surrounding layout and can handle spacing accordingly.                                                          |

## 4. Reading Data

We use Convex directly within our components to retrieve data.

For example:

```tsx
import { api } from "@convex/_generated/api";

const opportunity = useQuery(api.opportunities.get, { opportunityId });
```

When we call `useQuery`, Convex establishes a real-time subscription over a WebSocket. Any changes to the underlying data automatically update subscribed components. This means we don't need to manually refetch data, invalidate caches, or implement polling to keep the UI up to date.

### Working with queries

| Question                                                                   | Guidance                                                                                                                                                                                      |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does calling the same query multiple times create duplicate subscriptions? | No. Convex identifies queries using their function path and arguments, so components requesting the same data share a subscription.                                                           |
| Should every query have a custom hook?                                     | Not necessarily. If a hook only forwards arguments to `useQuery`, it doesn't provide much additional value.                                                                                   |
| When should we create custom hooks?                                        | Custom hooks are useful when they encapsulate actual logic, such as pagination defaults, mutation error handling, or converting filter state into query arguments.                            |
| How do we handle pagination?                                               | Use `usePaginatedQuery`. Our backend list queries use cursor-based pagination, and cursors are tied to the filters that generated them. Whenever filters change, we need to reset pagination. |

For example, we could create a custom hook to standardize pagination behavior across opportunity feeds:

```ts
// features/opportunities/hooks/use-opportunity-feed.ts

export function useOpportunityFeed() {
  return usePaginatedQuery(api.opportunities.discover, {}, { initialNumItems: 20 });
}
```

## 5. Writing Data

We use `useMutation` for operations that modify application data.

The exceptions are signing in and signing out, which use server actions defined in `app/auth/actions.ts`. The forms call them through `useAuthForm` (`features/auth/hooks/`), which checks the same field rules (`features/auth/lib/rules.ts`) in the browser before submitting. After a sign-in succeeds, the hook reloads AuthKit's client state before navigating, so Convex sees the new session, then navigates to `next` — the page the user was sent to log in from, validated by `safeNext` and carried through the verify-email step and Google sign-in — or home (`/`, signed-in only). Password-reset links always land home.

### Error handling

Convex mutations can reject with a `ConvexError` containing a `code` and `reason`.

We shouldn't expose these raw errors directly to users. Instead, `lib/errors.ts` converts error codes into user-friendly messages, while the detailed reason remains available for logging and testing.

```ts
try {
  await updateProfile({ username });
} catch (error) {
  setError(errorMessage(error));
}
```

The default messages are deliberately vague, because most codes cover many situations. `conflict` is thrown for "already applied", "already assigned", "already belongs to a company", and more. When you know which one you're expecting, pass your own copy:

```ts
setError(errorMessage(error, { conflict: "That username is taken." }));
```

Use `errorCode(error)` when a failure needs more than a message — putting the error on a specific field, or sending the user somewhere else.

Sign-in errors come from WorkOS, not Convex, so `features/auth/lib/auth-errors.ts` plays the same role for them: it maps each WorkOS error to a field message, a form message, or the email-verification step.

## 6. User Experience

We should account for all the states a user might encounter when interacting with the application.

The main goal is to make sure users understand what's happening, whether their action succeeded, and what they should do next.

| Situation                    | Expected behavior                                                                                   |
| ---------------------------- | --------------------------------------------------------------------------------------------------- |
| Data is loading              | Show a skeleton that resembles the content being loaded to minimize layout shifts.                  |
| Data fails to load           | Display a useful error message and provide a way to retry.                                          |
| No data is available         | Explain the empty state and suggest an appropriate next step, such as "Create your first campaign." |
| A form is submitting         | Disable the submit button and display a loading indicator to prevent duplicate submissions.         |
| An action succeeds           | Confirm the result through a toast, inline message, or visible UI update.                           |
| Input is invalid             | Validate input as users interact with the form and prevent invalid submissions.                     |
| An action takes a while      | Show progress or indicate which step is currently running.                                          |
| A user is typing into search | Debounce input to avoid triggering unnecessary queries.                                             |
| An action is destructive     | Ask for confirmation and clearly explain what will happen.                                          |

### Where should these states be handled?

Next.js provides built-in files for some loading and error states, but they don't necessarily cover everything in our application.

| State        | Where to handle it                                                                          |
| ------------ | ------------------------------------------------------------------------------------------- |
| Loading      | Within the component, since `useQuery` initially returns `undefined` while data is loading. |
| Empty        | Within the component, once a query returns no results.                                      |
| Denied       | Within the component, based on a `forbidden` or `not_found` error.                          |
| Error        | Use `error.tsx` for rendering errors and handle failed mutations with `try`/`catch`.        |
| Missing page | Use `not-found.tsx` with `notFound()`.                                                      |

One important distinction is that `loading.tsx` handles route-level loading, but doesn't automatically account for client-side Convex queries. Since a page may render before its query resolves, we still need to implement the appropriate loading states within components.

Similarly, `forbidden.tsx` and `unauthorized.tsx` respond to server-side authorization handling. Because our permission errors come from client-side Convex requests, we need to handle those errors ourselves.

### Permission checks

We should avoid showing users actions they don't have permission to perform, but hiding a button is not a replacement for backend authorization.

**The backend is responsible for enforcing permissions.** Frontend checks are there to improve the user experience and prevent users from attempting actions that would ultimately fail.

## 7. Notifications inbox

`/notifications` uses the existing authenticated notification APIs with cursor pagination.
Read actions use reactive query updates. Mark-all includes unloaded pages and can finish in
server-side batches. Dates use the viewer's local calendar. Query failures use the protected error boundary.

Category filters, deadline summaries, destination links, and the full Figma sidebar are deferred.
Browser tests render the real inbox with a local Convex service double, not a live deployment:
`E2E_BASE_URL=http://notifications.test bun run test:e2e e2e/notifications.spec.ts`.

## 8. Teammate invitations

Company admins use `/team/invites` via the signed-in header. The page uses `users.me` to gate
admin queries, `invites.listMine` for outstanding invites, and the existing invitation/revocation
actions. It sends one email at a time; existing-member editing and bulk invitations are deferred.
Successful cancellation stays visible as requested until the WorkOS webhook removes the row.
No local optimistic removal or automatic action retry is performed. Browser tests never send email:
`E2E_BASE_URL=http://invites.test bun run test:e2e e2e/invites.spec.ts`.

## 9. Naming and Types

To keep the codebase consistent, we follow a few naming conventions:

| Element         | Convention                                                            | Example                                                     |
| --------------- | --------------------------------------------------------------------- | ----------------------------------------------------------- |
| Files           | kebab-case, including component files                                 | `opportunity-card.tsx`                                      |
| Components      | PascalCase                                                            | `OpportunityCard`                                           |
| Hooks           | Prefix with `use`                                                     | `useOpportunityFeed`                                        |
| Route folders   | lowercase                                                             | `app/(protected)/opportunities/`                            |
| Component names | Describe what the component represents, not where it's currently used | `creator-feed.tsx` instead of `opportunities-page-list.tsx` |

### Types

Frontend types should come directly from our backend definitions whenever possible.

For Convex documents and IDs, use the generated types from `@convex/_generated/dataModel`:

```ts
Doc<"opportunities">;
Id<"opportunities">;
```

For more specific data structures, we can infer types from existing validators:

```ts
Infer<typeof creatorOpportunity>;
```

We should avoid manually recreating backend types on the frontend because those definitions can easily become outdated as the schema changes. Using generated and inferred types helps keep the frontend aligned with the backend without requiring us to maintain duplicate definitions.

## 10. Creator settings

`/settings` uses the components in `features/profile/`. It waits for authentication and account synchronization before loading `creators.me`; other roles see an explanation instead of making creator-only requests.

Basic details displays the creator's first name, last name, and email as read-only account information synced from WorkOS. Username and optional phone number are edited through `creators.update`. Changed usernames are trimmed and lowercased, and the backend enforces uniqueness. An unset username can remain unset when editing the phone number; an existing username cannot be cleared. Saving a blank phone number clears it with `null`. Each edit starts with a snapshot of the saved values and sends only changed fields, so live updates do not overwrite drafts and untouched fields are not written back. Discard returns to the latest saved values. Errors preserve the draft for correction or retry.

The Portfolio section edits the existing single `githubLink` through `creators.update`. Save accepts an HTTPS GitHub URL (or adds HTTPS to a pasted `github.com/...` link); saving a blank field clears it. Discard leaves the saved value unchanged. Live query updates do not overwrite an unsaved draft. Older invalid links are never rendered as clickable URLs.

Portfolio also shows an X account card with a disabled **Connect X** button and a coming-soon message. It does not request account data or start authorization. The existing X backend is documented in [X accounts](X_ACCOUNTS.md); connecting it to Settings is future work.

The profile-picture section has a separate Save/Discard flow. Selecting a JPEG, PNG, or WebP checks its size and whether it decodes, then shows a local preview. Save requests an S3 grant, uploads the file, and completes the upload to attach it to the user. A failed completion can be retried with the same upload ID. `useProfilePicture` retrieves the private image bytes and manages Blob URL cleanup. See [S3](S3.md) for the required credentials and browser CORS configuration.

Run `bun run test:e2e e2e/settings.spec.ts` for browser coverage. These tests render the real Settings components with isolated Convex/S3 responses and separately check the signed-out route redirect. They do not prove that a live deployment's S3 credentials or bucket CORS are configured.

## 11. Creator profile

`/profile` shows the signed-in creator's own name, username, picture, and GitHub link. The navigation link appears for synced creator accounts. The page waits for authentication and `users.me` before subscribing to `creators.me`; company users and operators see an explanation instead. It does not accept a creator ID or provide a public profile view.

**Edit profile** links to `/settings`. Profile content updates through the existing reactive queries and has no write operations. Email and phone remain in Settings; an email stored as a legacy name fallback is not displayed as the profile name. Unset fields have empty states. GitHub links use the same URL validation as Settings, and private pictures use `useProfilePicture`, including loading, retry, and Blob URL cleanup. Query failures use the shared protected-route error boundary.

Run `bun run test:e2e e2e/profile.spec.ts` for browser coverage of the real components with isolated backend responses and the signed-out route redirect. Live S3 configuration is still required to load stored pictures from a development deployment.

Run `bun run test:e2e e2e/profile-nav.spec.ts` for navigation subscription regression tests. These use the installed Convex React hooks with an isolated client, covering render stability, authentication changes, and query failures without connecting to a deployment.
