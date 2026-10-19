---
name: SANAD database and payments
description: User-confirmed database choice and payment boundary for SANAD.
---

SANAD uses MongoDB as the application's primary database, replacing PostgreSQL for runtime. Keep PostgreSQL intact as a rollback/source copy. The development database was migrated; production data has not been migrated and must be checked before publishing.

Public child-QR transfers and worker tips are simulated demo records, even though they persist in MongoDB. Real payments are planned but no payment provider is connected. Family management and cash-out actions require Clerk sign-in; platform management requires an allowlisted admin. No first-admin email has been approved. Cash-out approval/rejection does not move money, and no user should mark a request paid until a real payout flow exists.

Use the same Clerk identity for parent, worker, and company accounts; do not add global worker/company roles. Worker profiles, tip histories, and settlements are owner-scoped. Company access stays pending until admin approval, and companies can review only worker association requests for their own approved company. Public worker QR tipping stays no-login and simulated.

**Why:** The user explicitly chose MongoDB and secure sign-in, said payments would be connected later, and dismissed the first-admin email prompt.

**How to apply:** Keep PostgreSQL intact; enforce worker ownership and companyId scope on the server; verify MongoDB health without logging credentials; keep money flows labelled simulated; do not bootstrap an admin without an email the user has explicitly selected.
