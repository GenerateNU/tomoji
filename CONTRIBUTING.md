# Contributing to Tomoji

Found a bug? Open an issue. Docs out of date? Update them. Hit a rough edge in the dev
setup? Smooth it out for the next person.

**Take ownership. Make it better. Ship it.**

---

## Prerequisites

| Tool   | Why                                 | Install                                                                             |
| ------ | ----------------------------------- | ----------------------------------------------------------------------------------- |
| Bun    | Runtime and package manager (1.3.9) | [bun.sh](https://bun.sh)                                                            |
| Convex | Backend, database, server functions | Comes with `bun install` — just need an account at [convex.dev](https://convex.dev) |
| WorkOS | Authentication                      | Account access — ask a TL                                                           |

No Docker, no Postgres, no migration tool. Convex handles the database, and its CLI pushes
schema changes automatically.

> [!NOTE]
> Bun is pinned to `1.3.9` in `package.json` under `packageManager`, and CI uses the same
> version. If you upgrade it, upgrade it in both places.

---

## First-time setup

```bash
git clone https://github.com/GenerateNU/tomoji.git
cd tomoji
bun install
cp .env.template .env.local
```

Then start Convex once, which creates your personal dev deployment and writes
`CONVEX_DEPLOYMENT` and `NEXT_PUBLIC_CONVEX_URL` into `.env.local` for you:

```bash
bun run dev:backend
```

Fill in the WorkOS values in `.env.local` (ask a TL). Then give your Convex deployment the
WorkOS client id — `convex/auth.config.ts` reads it from there, not from `.env.local`, and
throws on startup if it's missing:

```bash
bunx convex env set WORKOS_CLIENT_ID 'client_...'   # same value as in .env.local
```

That's it — restart `bun run dev:backend` and you're set.

> [!IMPORTANT]
> Set your git email before your first commit, or your commits get attributed to whatever
> your global config says:
>
> ```bash
> git config user.email "you@northeastern.edu"
> ```

---

## Running the app

Two terminals. Backend first — the frontend needs the types it generates.

```bash
bun run dev:backend   # convex dev — watches convex/, regenerates types
```

```bash
bun run dev           # next dev — http://localhost:3000
```

Leave `dev:backend` running. It's where Convex function errors and `console.log` output
appear; they do **not** show up in the Next.js terminal.

---

## Environment variables

Secrets live in three places depending on who consumes them. Putting one in the wrong place
is the most common setup mistake.

| What                                                           | Lives in          | How to set it                                                            |
| -------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------ |
| `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL`                  | `.env.local`      | Written by `convex dev` — don't edit or share, these are personal to you |
| `WORKOS_*` — read by the Next.js server                        | `.env.local`      | Copy from `.env.template`, values from a TL                              |
| `WORKOS_CLIENT_ID` — **also** read by `convex/auth.config.ts`  | Convex deployment | `bunx convex env set WORKOS_CLIENT_ID 'client_...'`                      |
| Third-party API keys used by Convex actions (X API, Stripe, …) | Convex deployment | `bunx convex env set KEY 'value'`                                        |

> [!NOTE]
> `WORKOS_CLIENT_ID` is the one value that lives in **both** places. Next.js reads it from
> `.env.local`; the Convex deployment reads its own copy to build the JWT issuer URL. Same
> value, two consumers, two stores.

Anything a Convex action calls out to belongs in the Convex deployment, **not** in
`.env.local`. It never touches your disk and dev/prod stay separate:

```bash
bunx convex env set X_API_KEY 'value'          # your dev deployment
bunx convex env set X_API_KEY 'value' --prod   # production
bunx convex env list --names-only              # audit without exposing values
bunx convex env set --from-file .env.shared    # bulk-load shared dev keys on onboarding
```

> [!CAUTION]
> `.env*` is gitignored. Never commit a real value, and never prefix a secret with
> `NEXT_PUBLIC_` — that ships it to the browser.

We deliberately are **not** using a secrets manager (Doppler or similar) yet: Convex and
Vercel each already store secrets server-side with dev/prod separation, and adding a third
source of truth would just drift. Revisit this once we have three or more shared external
API keys.

---

## Project structure

One package, one `package.json`. The frontend deploys to Vercel and `convex/` deploys to
Convex — two services, one repo, no workspaces.

```text
src/
  proxy.ts        AuthKit proxy — MUST sit next to app/, see note below
  app/            App Router routes
  components/     React components; components/ui is shadcn (Base UI, "base-nova")
  lib/            frontend helpers
convex/
  schema.ts       database schema — must be at this exact path
  auth.config.ts  JWT provider config for WorkOS
  <domain>/       one folder per domain: campaigns/, opportunities/, submissions/, …
  lib/            shared server helpers (authz, etc.) — not callable from clients
e2e/              Playwright specs
```

> [!WARNING]
> `proxy.ts` must live at the **same level as `app/`**. Because our app is at `src/app/`,
> the proxy belongs at `src/proxy.ts` — not the project root. Next.js does not error when
> it's misplaced; it silently never runs the proxy, and `withAuth()` then fails with
> "route not covered by middleware." A correct setup shows `ƒ Proxy (Middleware)` in
> `bun run build` output.

### Convex conventions

**The file path is the public API path.** A function `list` in
`convex/campaigns/queries.ts` is called as `api.campaigns.queries.list`. Renaming a folder
renames every call site, so think before you move things.

**Default to internal.** `query` / `mutation` / `action` are reachable by anyone with our
deployment URL. `internalQuery` / `internalMutation` / `internalAction` are not. Export
public only when a client genuinely needs it.

**Never take a user id as an argument for authorization.** Derive identity server-side with
`ctx.auth.getUserIdentity()` and use `identity.tokenIdentifier` as the stable key. Scope
every query by the caller's org through the shared helper in `convex/lib/` rather than
writing ownership checks per function.

**Read `convex/_generated/ai/guidelines.md` before writing Convex code.** It overrides
general Convex knowledge and covers indexes, pagination, validators, and runtime rules.

**Don't edit `convex/_generated/`.** It's regenerated on every `convex dev` and is excluded
from linting and formatting.

---

## Code quality

One command runs everything CI runs:

```bash
bun run ci    # typecheck && lint && format:check && test
```

Run it before you push. CI runs the exact same script, so if it passes locally it passes
there.

| Command                | What it does                       |
| ---------------------- | ---------------------------------- |
| `bun run typecheck`    | `next typegen` then `tsc --noEmit` |
| `bun run lint`         | ESLint with `eslint-config-next`   |
| `bun run format`       | oxfmt, writes in place             |
| `bun run format:check` | oxfmt, fails instead of writing    |

Formatting is automatic and non-negotiable — set your editor to format on save and we never
discuss it in review again.

---

## Testing

| Kind             | Lives in              | Runner                              |
| ---------------- | --------------------- | ----------------------------------- |
| Convex functions | `convex/**/*.test.ts` | Vitest, `edge-runtime`, convex-test |
| Pure units       | `src/**/*.test.ts(x)` | Vitest, node                        |
| Browser flows    | `e2e/*.spec.ts`       | Playwright                          |

```bash
bun run test        # unit + convex
bun run test:watch
bun run test:e2e    # needs `bunx playwright install` once
```

Tests calling `convexTest` need `/// <reference types="vite/client" />` at the top of the
file for `import.meta.glob`. Add it only to those test files — never to source files, and
do **not** add `vite/client` to `tsconfig.json`'s `types` array.

Write the deny case, not just the allow case. Any function answering "is this allowed?"
needs a test proving it says no to the wrong caller; a code review will not catch an
inverted comparison.

> [!NOTE]
> `bun run test` currently passes with zero tests (`--passWithNoTests`). Remove that flag
> from `package.json` once the first real test lands — after that it only hides problems.

---

## Version control

We use [Conventional Commits](https://www.conventionalcommits.org/):

```text
feat: add creator application form
fix: correct org scoping on campaign list
docs: document convex env workflow
chore: upgrade convex to 1.46
test: cover withOrgAuth deny cases
```

Branch from `main`, open a PR, get one approval, squash merge.

> [!IMPORTANT]
> Keep PRs small and focused. Split large features into several PRs that are each easy to
> review. If a ticket looks like more than one to two weeks of work, the scope or the
> requirements probably need another conversation first.

CI must pass before merge. It runs `bun run ci` on every PR — see
[`.github/workflows/ci.yml`](.github/workflows/ci.yml).

---

## Troubleshooting

**"Module has no exported member" from `convex/_generated`.** Your generated types are
stale. Start `bun run dev:backend` and let it sync.

**`convex dev` throws "WORKOS_CLIENT_ID is not set on this Convex deployment".** You skipped
the `bunx convex env set WORKOS_CLIENT_ID` step in first-time setup. Each developer's Convex
deployment needs its own copy.

**`ctx.auth.getUserIdentity()` returns `null` but you're signed in.** The token's `iss`
doesn't match the `issuer` in `convex/auth.config.ts`. Paste the access token into
[jwt.io](https://jwt.io) and compare `iss` character for character against
`https://api.workos.com/user_management/<WORKOS_CLIENT_ID>`. Convex fails this check
silently — it returns `null` rather than raising.

**`format:check` fails right after running the backend.** Something wrote to a path that
isn't excluded in `.oxfmtrc.json`. Check what changed before reformatting.

**WorkOS redirect loop or "invalid redirect URI".** `NEXT_PUBLIC_WORKOS_REDIRECT_URI` must
match a Redirect URI in the WorkOS dashboard character for character, including the port.

**CI passes locally but fails on GitHub.** Usually a stale `bun.lock` — CI installs with
`--frozen-lockfile`. Run `bun install` and commit the lockfile change.
