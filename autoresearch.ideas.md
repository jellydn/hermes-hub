# 💡 Autoresearch Optimization Ideas

Here are promising performance and DX optimization ideas for HermesHub:

- **Parallelize CI/CD Checks**: Run `typecheck` and `test` in parallel using concurrently or shell traps to make dev checks even faster on multi-core platforms.
- **Transpile-only Typechecks**: Utilize a tool like `ts-blank-space` or `esbuild` for ultra-fast type stripping, combined with isolated type checking chunking in larger codebases.
- **Exclude Vite Plugins selectively**: Continue pruning dev-only plugins from test configurations to keep transformer times minimal.
- **Cache Vitest in CI**: Configure persistent cache actions for `node_modules/.vitest` in GitHub Actions configurations to reuse transform state across runs.
