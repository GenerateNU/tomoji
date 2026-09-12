# justfile

# Show all available commands
help:
    @just --list

# Install dependencies
install:
    bun install

# Start the Convex dev server
backend:
    bunx convex dev

# Start the frontend dev server
frontend:
    cd src && bun run dev


# Run the test suite once
test:
    bun vitest run

# Run a single test file (ex: `just test-file convex/user.test.ts`)
test-file file:
    npx vitest run {{file}}

# Lint
lint:
    bun eslint .

# Lint and fix
lint-fix:
    bun eslint . --fix