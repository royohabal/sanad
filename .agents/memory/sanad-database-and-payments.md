---
name: SANAD database and payments
description: User-confirmed database choice and payment boundary for SANAD.
---

SANAD uses MongoDB as the application's primary database, replacing PostgreSQL for runtime. Keep PostgreSQL intact as a rollback/source copy. The development database was migrated; production data has not been migrated and must be checked before publishing.

Public child-QR transfers, worker tips, parent top-ups, and personal demo top-ups use shared checkout and persist in MongoDB. Stripe Checkout is test-mode-only; the active development `Secretkey` is accepted as a test key, but Stripe returns HTTP 400 for KWD because this account needs a KWD bank account added. No Checkout Session is created, so SANAD safely falls back to explicit simulation. Production key mode has not been verified. No live payments or payouts have been verified. Family management and cash-out actions require Clerk sign-in; platform management requires an allowlisted admin. No first-admin email has been approved. Child cash-out must not be marked paid until a real payout flow exists. Worker withdrawal “paid” is an admin-only demo status that never moves money.

Use the same Clerk identity for parent, worker, and company accounts; do not add global worker/company roles. Worker profiles, tip histories, and settlements are owner-scoped. Company access stays pending until admin approval, and companies can review only worker association requests for their own approved company. Public worker QR tipping stays no-login and simulated. New tips snapshot their payout route and company; association changes apply only to future tips. Legacy tips without a route stay unassigned until the worker explicitly chooses, and company assignment must respect recorded membership history. Never transfer an independent balance into a company settlement or vice versa.

**Why:** The user explicitly chose MongoDB and secure sign-in, requested real payments for child QR transfers, dismissed the first-admin email prompt, and requested explicit handling of legacy tips and separate worker/company balances. The current Stripe test account rejected KWD, so the implementation must preserve the simulated fallback.

**How to apply:** Keep PostgreSQL intact; enforce worker ownership and companyId scope on the server; verify MongoDB health without logging credentials; use Stripe only after a server-created test Checkout Session supports KWD, and otherwise label simulation explicitly; do not bootstrap an admin without an email the user has explicitly selected.
