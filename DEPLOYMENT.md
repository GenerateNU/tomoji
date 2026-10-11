# Deployment

| Piece                 | Runs on                               | Ships when                    |
| --------------------- | ------------------------------------- | ----------------------------- |
| Backend (production)  | Convex production deployment          | A GitHub Release is published |
| Frontend (production) | Vercel                                | A GitHub Release is published |
| Backend (PR preview)  | Convex preview deployment, one per PR | Automatically, on every PR    |
| Frontend (PR preview) | Vercel preview deployment             | Automatically, on every PR    |
| Auth                  | WorkOS                                | —                             |
| Media                 | S3 (see [docs/S3.md](docs/S3.md))     | —                             |

Merging to `main` deploys nothing. To ship, cut a release; the backend and
frontend go out together.

Every pull request gets its own frontend and its own Convex backend with its
own database, isolated from other PRs and from production.

## How it works

[vercel.json](vercel.json) sets one build command for every environment:

```sh
bunx convex deploy --cmd 'bun run build' --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL
```

`convex deploy` pushes functions and schema, then runs `next build` with
`NEXT_PUBLIC_CONVEX_URL` set to the deployment it just pushed. If the push fails,
the frontend never builds. `CONVEX_DEPLOY_KEY` decides which deployment the build
targets:

- **Previews** use the Convex **preview** deploy key, stored in Vercel's
  Preview environment. Convex creates a preview deployment named after the PR
  branch, or reuses it on later pushes so data entered during review survives.
- **Production** uses the Convex **production** deploy key, stored only in
  GitHub's `production` environment. The
  [deploy workflow](.github/workflows/deploy-production.yml) runs
  `vercel build --prod` and `vercel deploy --prebuilt --prod` with it after a TL
  approves.

`git.deploymentEnabled` in `vercel.json` turns off Vercel's Git deploys for
`main`, so merges don't publish anything. Every other branch still gets a
preview.

## Day-to-day

### Ship to production

```sh
git checkout main && git pull
gh release create v1.2.0 --generate-notes
```

A TL approves the run under **Actions → Deploy production**. The workflow
deploys Convex, builds and publishes the frontend, then checks that the site
responds.

Deploying code does not run data migrations. If the release includes one, a TL
runs it against production after the deploy, as described in
[docs/MIGRATIONS.md](docs/MIGRATIONS.md). Write schema changes so the new schema
accepts both old and migrated documents.

### Roll back

Go to **Actions → Deploy production → Run workflow** and enter an earlier tag.
This redeploys that tag's Convex functions and frontend.

Convex checks every deploy's schema against existing data. If a later
migration changed documents so the old schema rejects them, the rollback fails
at the Convex step and the frontend is left alone. In that case, fix forward.

To roll back only the frontend, use Vercel's **Instant Rollback**: **Vercel →
Deployments →** pick an earlier production deployment **→ Instant Rollback**.

### Review a PR

Open the PR. Vercel comments with the preview URL. That preview talks to its
own Convex preview deployment, which you can browse in the Convex dashboard
under the project's preview deployments.

Previews delete themselves after **5 days** on the Convex free plan (14 on
Pro), counted from creation. Pushing again to a PR whose preview has expired
creates a new, empty one.

Crons in [convex/crons.ts](convex/crons.ts) also run on preview deployments,
against that preview's data only.

### Known preview limitations

These are follow-ups and are not handled yet:

- **Sign-in does not work on previews.** `NEXT_PUBLIC_WORKOS_REDIRECT_URI` is one
  fixed URL, but every preview has its own hostname. A fix needs WorkOS to
  accept a wildcard redirect for preview URLs, and the app to work out the
  redirect URI from `VERCEL_BRANCH_URL`.
- **Preview `users` tables start empty.** Users are synced by the WorkOS webhook
  (`/workos/webhook`), and no webhook points at a preview deployment. A possible
  fix is seeding on creation with `--preview-run`.
- **Profile-picture uploads will fail on previews** until the dev bucket's CORS
  rules allow the preview origins. See [docs/S3.md](docs/S3.md).

## Setup

You only need to do this once. Nothing here is automated.

### Convex

1. In the Convex dashboard, create the project's **production** deployment if
   it doesn't exist yet.
2. Set production's environment variables (`WORKOS_CLIENT_ID`,
   `WORKOS_API_KEY`, `WORKOS_WEBHOOK_SECRET`, `S3_MEDIA_BUCKET`,
   `S3_MEDIA_REGION`, and AWS credentials per [docs/S3.md](docs/S3.md)) with
   `bunx convex env set <NAME> <value> --prod`. The deploy fails without
   `WORKOS_CLIENT_ID`; [convex/auth.config.ts](convex/auth.config.ts) checks it.
3. Point a production WorkOS webhook at `<production CONVEX_SITE_URL>/workos/webhook`.
4. Under the production deployment's **Settings → General**, generate a
   **production deploy key**.
5. Under **Project Settings**, generate a **preview deploy key**.
6. Under **Project Settings → Environment Variables**, set the default
   variables for preview deployments: the same names as step 2, with WorkOS
   staging values and the dev/QA bucket. Without `WORKOS_CLIENT_ID`, every
   preview build fails.

### Vercel

1. Import the repository as a new project. Vercel reads [vercel.json](vercel.json)
   for the framework and build command, and installs with Bun because of
   `bun.lock`.
2. Under **Settings → Environment Variables**, add:

   | Variable                          | Production                      | Preview                            |
   | --------------------------------- | ------------------------------- | ---------------------------------- |
   | `CONVEX_DEPLOY_KEY`               | _leave unset_ (GitHub holds it) | Convex **preview** deploy key      |
   | `WORKOS_API_KEY`                  | Production WorkOS key           | Staging WorkOS key                 |
   | `WORKOS_CLIENT_ID`                | Production client ID            | Staging client ID                  |
   | `WORKOS_COOKIE_PASSWORD`          | `openssl rand -hex 32`          | A different `openssl rand -hex 32` |
   | `NEXT_PUBLIC_WORKOS_REDIRECT_URI` | `https://<site>/auth/callback`  | See "Known preview limitations"    |

   Also add `https://<site>/auth/callback` as a redirect URI in WorkOS
   production.

3. Create an access token under **Account Settings → Tokens**. Run
   `bunx vercel link` locally once; `.vercel/project.json` then shows the
   `orgId` and `projectId`. `.vercel` is gitignored.

### GitHub

**Settings → Environments → `production`.** Add the TLs as required
reviewers, then add these to the environment:

| Kind     | Name                  | Value                               |
| -------- | --------------------- | ----------------------------------- |
| Secret   | `CONVEX_DEPLOY_KEY`   | Convex **production** deploy key    |
| Secret   | `VERCEL_TOKEN`        | Vercel access token                 |
| Variable | `VERCEL_ORG_ID`       | `orgId` from `.vercel/project.json` |
| Variable | `VERCEL_PROJECT_ID`   | `projectId` from the same file      |
| Variable | `PUBLIC_FRONTEND_URL` | `https://<site>`, no trailing slash |

The production deploy key can push to the production database, so keep it in
the environment rather than in repository secrets. Only approved runs can read
it.

## Cost

Vercel's free Hobby plan is limited to non-commercial use, and Pro is billed
per team seat. Check that the plan the project is on fits how it's used.
Convex's free plan includes the production deployment and preview deployments,
subject to its usage limits.

## Troubleshooting

**A build fails with `WORKOS_CLIENT_ID is not set on this Convex deployment`.**
For previews, set the project's default preview environment variables (Convex
step 6). For production, set it with `--prod` (Convex step 2).

**A preview build fails at `convex deploy` with an auth error.** Vercel's
Preview environment is missing `CONVEX_DEPLOY_KEY`, or it holds the production
key instead of the preview key.

**A merge to `main` created a production deployment.** It shouldn't:
`git.deploymentEnabled` in `vercel.json` disables Git deploys for `main`. Check
that block is intact and that the production branch in Vercel's Git settings is
`main`.

**The deploy fails at "Check the site answers".** Convex and the frontend have
already been published. Check the Vercel deployment's runtime logs, often for a
missing WorkOS variable in the Production environment.
