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

# Run all checks (typecheck + test, parallel for speed)
check:
	#!/usr/bin/env bash
	set -e
	bun run typecheck & T1=$!
	bun run test & T2=$!
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
