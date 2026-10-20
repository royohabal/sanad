# SANAD worker ownership audit

**Audit date:** 2026-10-20  
**Scope:** Read-only review of the `sanad_development` MongoDB database and the worker invitation/settlement code. Production was not queried or changed.

## Findings

Development contains one pending company (record `1`) and two unassociated, non-archived worker records (`1` and `5`). Neither worker has a `companyId`, `invitedCompanyId`, or company-membership history. No company-specific confirmation of either worker is recorded.

| Worker record | Ownership and email mapping | Existing history | Decision |
| --- | --- | --- | --- |
| `1` | No account owner or email address is stored; no verified-email match can be made from this record. | Public QR identifier is present; four tips (two unassigned and two marked independent); one legacy, company-unscoped settlement; two wallet-ledger entries. | Unmatched. Preserve the QR identifier and all history. Do not attach to a company or include independent funds in a company settlement. |
| `5` | An account owner is stored, but no email address is stored. The owner's verified Clerk email was not queried, so no verified-email mapping was established. | Public QR identifier is present; two unassigned tips; no settlement or wallet-ledger entries. | Unmatched. Do not infer company ownership or attach without a verified email match and company confirmation. |

The company record is pending approval. It cannot issue company-worker invitations under the current API rules. No invitation, activation, ownership update, settlement, or financial-history reassignment was performed.

## Safety checks in the current code

- Company invitations require an approved company.
- Existing worker records can be reused only through a matching normalized email or the Clerk user associated with the invited email; conflicting ownership/account states are rejected.
- Invitation acceptance requires the user's primary verified Clerk email to match the pending invitation and the company to remain approved.
- The invitation and acceptance updates do not rewrite the worker's public QR identifier or tip, wallet-ledger, withdrawal, or settlement records.
- Company settlement creation selects only unsettled tips explicitly marked `payoutMethod: "company"` for that company. Legacy/unassigned and independent tips are excluded.
- The legacy tip reassignment endpoint is currently disabled with a `410` response.

## Unmatched records and next safe step

Records `1` and `5` remain unmatched. Before any future production change, the company must be approved and confirm the specific workers to invite. For each confirmed person, match the invitation email to the person's primary verified Clerk email and the existing record where possible. Do not use a name or employer-text match as proof of ownership. Keep the existing public QR ID and financial history; do not move independent ledger balances or company-unscoped settlements into company settlements.
