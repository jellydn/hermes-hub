# HermesHub justfile
# https://github.com/casey/just

# Dotenv files (.env) are loaded automatically — no explicit `set dotenv` needed

# Default recipe
default:
    @just --list

# Start the dev server
dev:
    bun run dev

# Production build
build:
    bun run build

# Preview production build
preview:
    bun run preview

# Run tests
test:
    bun run test

# TypeScript type check
typecheck:
    bun run typecheck

# Generate Drizzle migrations
db-generate:
    bun run db:generate

# Run all checks (typecheck + test)
check: typecheck test

# Install dependencies
install:
    bun install
