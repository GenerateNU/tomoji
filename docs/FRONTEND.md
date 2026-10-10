# Frontend

This document outlines how we organize and develop the Next.js frontend for Tomoji. For setup instructions and commands, see `CONTRIBUTING.md`. Backend conventions are covered in [Backend](BACKEND.md).

## 1. Folders

```text
src/
  app/                       Next.js routes and layouts
    layout.tsx               fonts and providers
    page.tsx                 landing — no nav bar
    signup/                  also no nav bar
    (protected)/
      layout.tsx             nav bar
      <route>/               pages requiring sign-in
    auth/                    WorkOS callback and sign-out action
  features/<domain>/         domain-specific functionality
    components/
    hooks/
    lib/
  components/                shared, reusable components
    ui/                      shadcn-generated components
  hooks/                     hooks shared across features
  lib/                       plain functions - no React, usable anywhere
  proxy.ts                   redirects unauthenticated users
```

### Where should new files go?

When adding a new file, use these guidelines to decide where it belongs:

| Question                                                                                   | Location                           |
| ------------------------------------------------------------------------------------------ | ---------------------------------- |
| Is it a Next.js-specific file like `page.tsx`, `layout.tsx`, or `route.ts`?                | `app/`                             |
| Is it related to a specific Tomoji feature, such as opportunities, campaigns, or creators? | `features/<domain>/`               |
| Is it shared or general-purpose code?                                                      | `components/`, `hooks/`, or `lib/` |

                                                                                                       |

## 2. Routes

Our routes should describe the resource being accessed rather than the role of the person accessing it, so keep URLs independent of user roles. For example, `/opportunities` serves as the discovery feed for creators and the company's opportunity list for company users. The page determines which component to render based on the current user.

## 3. Component Design

We want components to be reusable, consistent, and easy to maintain. These conventions should help us avoid unnecessary duplication while keeping the frontend flexible as designs evolve.

| Principle                                 | Guidelines                                                                                                                                                                                                                                         |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prefer variants over duplicate components | If two components have the same functionality and mainly differ in styling, use a `variant` prop instead of maintaining separate implementations.                                                                                                  |
| Pass IDs instead of entire objects        | Rather than passing data through several component layers, child components can call `useQuery` directly. Convex shares subscriptions for identical queries, so multiple components requesting the same data don't create duplicate subscriptions. |     |
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

The exceptions are signing in and signing out, which use server actions defined in `app/auth/actions.ts`.

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

## 7. Naming and Types

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
