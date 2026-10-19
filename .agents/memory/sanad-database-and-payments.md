---
name: SANAD database and payments
description: User-confirmed database choice and payment boundary for SANAD.
---

SANAD uses MongoDB as the application's primary database, replacing PostgreSQL for runtime. Keep PostgreSQL intact as a rollback/source copy. The development database was migrated; production data has not been migrated and must be checked before publishing.

Child QR payments are intended to become real payments, but Stripe is not connected yet. Keep the current QR transfer flow demo-only until payment setup is completed.

**Why:** The user explicitly chose MongoDB instead of PostgreSQL and said they will connect payments later.

**How to apply:** Use MongoDB for app runtime, do not drop the PostgreSQL backup, and do not treat child QR transfers as real-money payments until a payment provider is connected and verified.
