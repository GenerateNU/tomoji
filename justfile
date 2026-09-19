# Show all available commands
help:
    @just --list --unsorted

# Start the frontend (fd = frontend dev) — http://localhost:3000
fd:
    bun run dev

# Start the Convex backend (bd = backend dev) — watches convex/, streams logs
bd:
    bun run dev:backend

# Everything CI runs — typecheck, lint, format, test. Run before you push.
ci:
    bun run format
    bun run ci

# Print the deployed API surface — what is public, what is internal
api:
    @bun scripts/api-surface.ts

# Run the test suite once
test:
    bun run test

# Format every file in place
format:
    bun run format

# Re-run tests on change
test-watch:
    bun run test:watch

# Run one test file (ex: `just test-file convex/users.test.ts`)
test-file file:
    bunx vitest run {{ file }}

# Typecheck only (next typegen + tsc)
typecheck:
    bun run typecheck

# Lint only
lint:
    bun run lint

# Lint and auto-fix what it can
lint-fix:
    bun eslint . --fix

# Check formatting without writing (what CI does)
format-check:
    bun run format:check

# Open the Convex dashboard — data, logs, function runner
dashboard:
    bunx convex dashboard

# Production build
build:
    bun run build

# Playwright browser tests (needs `bunx playwright install` once)
test-e2e:
    bun run test:e2e

# Install dependencies
install:
    bun install

# Install deps and create .env.local, then print what's left to do
setup:
    bun install
    @bun scripts/setup.ts

# Copy the WORKOS_* values from .env.local to your Convex deployment (Convex reads them there)
convex-env:
    @bun scripts/set-convex-env.ts

# Print the webhook URL to send a TL, who creates your WorkOS webhook
webhook-url:
    @echo "$(bunx convex env get CONVEX_SITE_URL)/workos/webhook"
