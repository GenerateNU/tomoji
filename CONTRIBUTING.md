# Contributing to Tomoji

Found a bug? Open an issue. Docs out of date? Update them. Hit a rough edge in the dev
setup? Smooth it out for the next person.

**Take ownership. Make it better. Ship it.**

This doc has two halves:

- **[Part 1 — Day one](#part-1--day-one)**: get the app running on your machine. Do this once.
- **[Part 2 — Working here](#part-2--working-here)**: how we write and ship code, every day.

---

# Part 1 — Day one

## What you need first

| Tool | Why                                 | Install                                                                                                         |
| ---- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Bun  | Runtime and package manager (1.3.9) | [bun.sh](https://bun.sh)                                                                                        |
| Node | v22 or newer — runs CLI tools       | [nodejs.org](https://nodejs.org)                                                                                |
| Just | Command runner                      | mac `brew install just` · win `winget install Casey.Just` · [other](https://github.com/casey/just#installation) |

> [!IMPORTANT]
> **On Windows, run everything from Git Bash**, not PowerShell or cmd. `just` executes
> recipes with `sh`, which Git for Windows provides. Everything below works identically on
> macOS, Linux, and Windows-in-Git-Bash.

## Step 1 — Clone and install

```bash
git clone https://github.com/GenerateNU/tomoji.git
cd tomoji
just setup
```

`just setup` installs dependencies and creates `.env.local` from the template.

## Step 2 — Get the WorkOS values

Ask a TL for these two and paste them into `.env.local`.

```text
WORKOS_API_KEY
WORKOS_CLIENT_ID
```

Then generate your **own** cookie password — this one is not shared:

```bash
bun -e 'console.log(crypto.randomUUID()+crypto.randomUUID())'
```

Paste it as `WORKOS_COOKIE_PASSWORD`. It isn't a WorkOS credential; the SDK uses it to
encrypt your local session cookie, so every developer should have a different one. It must
be at least 32 characters.

Leave the rest of the file alone — the Convex values fill themselves in next.

## Step 3 — Create your Convex deployment

```bash
just bd
```

The very first time, this opens your browser to sign in to Convex — create a free account
there if you don't have one, then come back to the terminal.

It then creates a Convex dev deployment **that is yours alone** and writes
`CONVEX_DEPLOYMENT` and `NEXT_PUBLIC_CONVEX_URL` into your `.env.local`.

It will then fail with `WORKOS_CLIENT_ID is not set on this Convex deployment`. That's
expected — step 4 fixes it.

> [!NOTE]
> There is no localhost URL for the backend. Convex runs your `convex/` code in the cloud;
> `just bd` is a file watcher that pushes changes up and streams logs back. Use
> `just dashboard` to browse data and read logs.

## Step 4 — Give Convex the WorkOS client id

```bash
just convex-env
```

`convex/auth.config.ts` reads `WORKOS_CLIENT_ID` from the **Convex deployment**, not from
`.env.local`. This copies it across. Restart `just bd` — it should now print
`Convex functions ready!`.

## Step 5 — Run the app

Two terminals:

```bash
just bd         # leave running — Convex logs appear here
```

```bash
just fd         # http://localhost:3000
```

## Step 6 — Confirm it works

1. Open http://localhost:3000 and click **Sign in**. You should land on a real WorkOS page.
2. After signing in, your email should appear in the header.
3. `just test` — 5 tests should pass.
4. `just ci` — should exit clean.

If all four work, you're set up.

## If something went wrong

**`WORKOS_CLIENT_ID is not set on this Convex deployment`** — you skipped step 4. Run
`just convex-env`.

**Signed in, but the app can't read your identity** — the token's `iss` doesn't match
`convex/auth.config.ts`. Paste the access token into [jwt.io](https://jwt.io) and compare
`iss` against `https://api.workos.com/user_management/<WORKOS_CLIENT_ID>`. Convex fails this
check silently, returning `null` rather than raising.

**`Module has no exported member` from `convex/_generated`** — generated types are stale.
Make sure `just bd` is running.

**"invalid redirect URI"** — `NEXT_PUBLIC_WORKOS_REDIRECT_URI` must match a Redirect URI in
the WorkOS dashboard character for character, including the port.

**CI passes locally but fails on GitHub** — usually a stale `bun.lock`, since CI installs
with `--frozen-lockfile`. Run `bun install` and commit the lockfile.

---

# Part 2 — Working here

For backend codebase conventions, see [docs/BACKEND.md](docs/BACKEND.md).

## Version control

[Conventional Commits](https://www.conventionalcommits.org/):

```text
feat: add creator application form
fix: correct org scoping on campaign list
docs: document convex env workflow
chore: upgrade convex to 1.46
test: cover requireIdentity deny case
```

Branch from `main`, open a PR, get one approval, squash merge. CI must pass before merge —
it runs `bun run ci` on every PR, the same script `just ci` wraps. See
[`.github/workflows/ci.yml`](.github/workflows/ci.yml).

> [!IMPORTANT]
> Keep PRs small and focused. If a ticket looks like more than one to two weeks of work,
> the scope or the requirements probably need another conversation first.

## Commands

`just` on its own lists all available commands. The five you'll use daily:

```bash
just fd        # frontend — localhost:3000
just bd        # Convex — watches convex/, streams logs
just ci        # typecheck + lint + format + test. Run before you push.
just test      # tests once
just format    # format everything in place
```
