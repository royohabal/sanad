---
name: SANAD Clerk runtime versions
description: Keep the SANAD React app's Clerk dependencies and runtime React versions in sync.
---

When changing Clerk-related frontend dependencies, keep `react` and `react-dom` on the same exact version. The app can typecheck and production-build while a stale Vite optimized dependency cache still causes a runtime React version mismatch.

**Why:** A React/ReactDOM version mismatch surfaced only in the browser preview after workspace package versions had been aligned.

**How to apply:** After changing React, ReactDOM, or Clerk dependencies, verify their resolved versions, refresh the SANAD Vite optimizer cache if the preview still reports a mismatch, restart the web workflow, and check the browser console.
