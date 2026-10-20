# SANAD — سند

SANAD is a Kuwait-focused worker, family, and personal-wallet web app using KWD and MongoDB-backed records.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/api-server run test:rules` — run server-side business-rule tests
- `pnpm --filter @workspace/api-server run test:persistence` — verify a simulated worker tip from a fresh MongoDB process; requires development `MONGODB_URI` and `REPLIT_DEV_DOMAIN`
- Required API env: `MONGODB_URI`, `SESSION_SECRET`
- Optional API env: `STRIPE_SECRET_KEY` (test key only), `SANAD_PUBLIC_BASE_URL`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- SANAD data: MongoDB Atlas; keep existing PostgreSQL/Drizzle code intact for unrelated legacy features
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (ESM bundle)

## Where things live

- `artifacts/sanad` — SANAD web application
- `artifacts/api-server` — Express API, payment verification, wallet and authorization routes
- `lib/api-spec/openapi.yaml` — API contract source; regenerate clients after changes
- `lib/db/src/models.ts` and `lib/db/src/mongo.ts` — MongoDB application models, connection, and indexes

## Architecture decisions

- MongoDB is the primary store for SANAD records; do not migrate or remove PostgreSQL as part of SANAD feature work.
- Stripe is server-side and test-mode only. Simulated checkouts remain clearly labeled and never represent a live payment.
- Internal transfers and money requests update SANAD wallets only; worker withdrawals and company settlements do not make payouts.

## Product

- Public worker tips and child QR transfers use shared checkout.
- Parents manage child wallets; signed-in users can use private personal wallets, transfers, and money requests.
- Worker, family, wallet, company, and settlement histories are backed by MongoDB.

## User preferences

No additional user preferences recorded.

## Gotchas

- Simulated payments finish as `demo_completed`; only verified Stripe test Checkout Sessions may finish as `paid`.
- MongoDB transaction workflows require a replica-set-capable cluster.
- Keep database and payment secrets on the server; never expose them through `VITE_` variables.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
