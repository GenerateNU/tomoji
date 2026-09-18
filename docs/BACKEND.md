# Backend

This document covers how we structure and write Convex code. Setup instructions and common commands live in `CONTRIBUTING.md`.

## Layout

Convex maps the **file path directly to the API path**. For example, a function exported from `convex/creators.ts` is called as `api.creators.<name>`. There is no separate router because the filename itself defines the namespace.

```text
convex/
  schema.ts            assembles the tables
  schemas/             one file per table: fields + indexes
  <domain>.ts          route layer: args, returns, calls models/
  models/<domain>.ts   data layer: queries, writes, business rules
  lib/                 shared utilities: errors, auth helpers, function builders
  tests/               mirrors the source tree
  auth.ts              WorkOS webhook handlers
  http.ts              HTTP routes, currently only used for webhooks
```

**Keep route files thin.** They should validate arguments and delegate the actual work to the model layer. Anything that interacts with the database belongs in `models/`. This makes the logic easier to test directly and allows it to be reused by other routes without creating circular imports.

## Queries, mutations, and actions

Choose the function type based on what it needs to do:

| Function   | Reads DB           | Writes DB             | External HTTP | Transactional |
| ---------- | ------------------ | --------------------- | ------------- | ------------- |
| `query`    | yes                | no                    | no            | yes           |
| `mutation` | yes                | yes                   | no            | yes           |
| `action`   | through `runQuery` | through `runMutation` | yes           | **no**        |

Anything that calls an external API should be an action. Actions do not have access to `ctx.db` directly. They interact with the database through `ctx.runQuery` and `ctx.runMutation`.

**Actions are not transactions.** If an action calls an API and then writes to the database, it can fail somewhere between those steps. The API call may succeed while the write never happens, or the write may succeed before something later fails.

Keep the database work in a single mutation near the end whenever possible so that the write either fully commits or does not happen at all. Actions should also be safe to retry. Running the same action twice should not send a second invitation or create a duplicate row.

**Authorize inside the action itself, not only inside a mutation it calls.** An action may perform external side effects before that mutation runs. If authorization happens afterward, it is already too late to stop something like an email from being sent.

## Public vs. internal

`query`, `mutation`, and `action` create **publicly callable functions**. Any client with access to the application can attempt to invoke them with their own arguments.

`internalQuery`, `internalMutation`, and `internalAction` are only callable by other server-side Convex functions.

Default to internal for anything that is not intentionally part of the public API. This includes webhook helpers, functions called by actions, and scheduled jobs. A function should be public because we intentionally chose to expose it, not simply because we forgot to make it internal.

`bunx convex function-spec` shows what is actually deployed and whether each function is public or internal. It is worth checking before opening a PR.

## Authorization

`lib/functions.ts` exports function builders that verify the caller's account type before the handler runs:

| Builder                              | Caller must be     | Extra context           |
| ------------------------------------ | ------------------ | ----------------------- |
| `authedQuery` / `authedMutation`     | any signed-in user | `ctx.user`              |
| `creatorQuery` / `creatorMutation`   | a creator          | `ctx.user`              |
| `companyQuery` / `companyMutation`   | a company user     | `ctx.user`, `ctx.orgId` |
| `operatorQuery` / `operatorMutation` | a Tomoji operator  | `ctx.user`              |

Use these instead of the raw `query` and `mutation` functions when you can. **Choosing the correct builder should handle the authorization for the route.** If you find yourself manually checking a user's role inside the handler, there is probably a better builder for that route.

Authorization should always happen on the server. Never accept a `userId` from the client to determine what someone is allowed to do. Derive the caller's identity from `ctx` instead.

## Errors

Throw `apiError(code, detail)` from `lib/errors.ts` instead of using `new Error()`.

Convex redacts normal error messages in production, so the client would only receive `"Server Error"` and the useful message would be lost.

Only add a new error code when the caller would actually respond to it differently. For example, `not_found` intentionally covers both "this doesn't exist" and "this isn't yours." The client should not be able to distinguish between those cases.

## Naming routes

- **Do not repeat the domain name.** Use `campaigns.create`, not `campaigns.createCampaign`. The namespace already tells us it is a campaign.
- **Use standard CRUD names:** `get`, `list`, `create`, `update`, and `remove`.
- Use **`me` when the row represents the current caller**, such as `creators.me`.
- Use **an optional ID when the caller owns the resource but may access others they own**, such as `companies.get({ companyId? })`. Omitting the ID means "my own."

A route should only get its own name when it returns or does something meaningfully different. If two routes only differ based on who is calling them, they should usually be one route because the builder already captures the caller type.

## Tests

`convex/tests/` should mirror the source tree. For example:

```text
models/users.ts
tests/models/users.test.ts
```

Shared fixtures and testing utilities should stay in `tests/helpers.ts`.

Prefer testing model functions directly with `t.run()`. Use the `api.*` route path when the behavior you are testing specifically involves authorization, argument validation, or route behavior.
