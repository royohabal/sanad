# SANAD — سند

SANAD is a Kuwait-focused worker, family, and personal-wallet experience. It uses KWD and stores SANAD application records in MongoDB; existing PostgreSQL code remains available for unrelated legacy features.

## Payment and wallet behavior

- Worker QR tips and child QR transfers use the shared checkout.
- Parent child-wallet top-ups and personal demo-wallet top-ups use that same checkout.
- Stripe Checkout is attempted only with a server-side test key (`sk_test_`) and only in test mode. If a session cannot be created for KWD, SANAD falls back to an explicitly labeled simulated checkout.
- A simulated checkout is never reported as a Stripe payment. Its final status is `demo_completed`; `paid` is only written after the server verifies a completed, paid Stripe test session.
- Person-to-person wallet transfers and requests are internal SANAD ledger entries. They do not charge a card or transfer funds externally.
- Worker withdrawals and monthly company settlements remain review/demo records. SANAD does not make payouts.
- Stripe confirmation currently happens when the payer returns to SANAD and the server verifies the Checkout Session. There is no webhook, so a payer who closes the page before returning may need to reopen the return flow for SANAD to record the result.

## Runtime and build environment

| Variable | Use |
| --- | --- |
| `MONGODB_URI` | API server — required MongoDB Atlas connection string. Keep it in the server's secret store. |
| `SESSION_SECRET` | API server — required by public-request protection. |
| `CLERK_SECRET_KEY` | API server — existing Clerk server credential. |
| `CLERK_PUBLISHABLE_KEY` | API server — existing Clerk proxy configuration. |
| `VITE_CLERK_PUBLISHABLE_KEY` | SANAD web build — existing public Clerk key; it is not a secret. |
| `STRIPE_SECRET_KEY` | API server — optional Stripe **test** secret. Only `sk_test_` values are accepted. The existing `Secretkey` name is also recognized for compatibility. |
| `SANAD_PUBLIC_BASE_URL` | API server — optional exact public SANAD base URL, used to build Stripe return and cancel URLs. Set it when automatic host detection does not match the deployed app URL. |

The app does not need a Stripe publishable key for its hosted Checkout redirect. Never place Stripe secret keys or `MONGODB_URI` in frontend environment variables.

MongoDB transactions require a replica-set-capable deployment, as provided by MongoDB Atlas. Preserve the existing database and use separate Atlas development and production databases where available.

## Vercel setup

The root `vercel.json` already defines the API, SANAD web app, and mockup sandbox services, with `/api/*` routed to the API service and other paths routed to SANAD.

1. Import the repository with the existing root `vercel.json` configuration.
2. Add `MONGODB_URI`, `SESSION_SECRET`, `CLERK_SECRET_KEY`, and `CLERK_PUBLISHABLE_KEY` to the API service's Vercel environment.
3. Add `VITE_CLERK_PUBLISHABLE_KEY` to the SANAD web service's build environment. Add `STRIPE_SECRET_KEY` to the API service only if using Stripe test Checkout; use a test key, never a live key.
4. Add `SANAD_PUBLIC_BASE_URL` to the API service if automatic host detection does not produce the SANAD app's public URL. Include the app's base path if it is not hosted at `/`.
5. Configure the MongoDB Atlas network access policy for the deployed API runtime and confirm the database user can use transactions.
6. After deployment, check `/api/healthz`. Test a worker tip with a Stripe test payment only if the checkout page identifies Stripe test mode; otherwise the page will identify the simulated demo.

Keep all provider configuration server-side. Do not treat a simulated completion as a real payment or payout.

## Development and verification

```sh
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/api-server run test:rules
pnpm --filter @workspace/api-server run test:persistence
pnpm --filter @workspace/sanad run typecheck
pnpm --filter @workspace/sanad run build
```

The persistence check requires a development `MONGODB_URI` and `REPLIT_DEV_DOMAIN`. It creates an isolated worker and simulated tip, verifies them from a fresh process, then removes only its own test records.
