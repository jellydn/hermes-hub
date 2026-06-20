// ── Shim: re-export from model-access package ─────────────────────
// Existing imports of `./providers/model-access` resolve here,
// which forwards to the split package at `./model-access/`.

export * from "./model-access/index";
