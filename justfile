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

# Apply Drizzle migrations locally
db-migrate:
    bun run db:migrate

# Run all checks (typecheck + test, parallel for speed)
check:
	#!/usr/bin/env bash
	set -e
	bun run typecheck & T1=$!
	CPU="$(sysctl -n hw.ncpu 2>/dev/null || nproc 2>/dev/null || echo 4)"
	if [ "$CPU" -gt 6 ]; then CPU=6; fi
	VITEST_MAX_WORKERS="${VITEST_MAX_WORKERS:-$CPU}" bun run test & T2=$!
	wait $T1
	wait $T2

# Install dependencies
install:
    bun install

# Lint with Biome
lint:
    bunx @biomejs/biome check .

# Auto-format with Biome
format:
    bunx @biomejs/biome check --write .

# Run complete CI pipeline (lint, typecheck, test, build)
ci: lint typecheck test build
