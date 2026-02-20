# Everything App (Finance + Fitness)

Production-ready scaffold with:
- TypeScript backend (Express)
- Auth (register/login with JWT)
- Postgres data storage
- Encrypted provider credential storage (AES-256-GCM)
- Direct EQ Bank mobile API connector (`mode=eq_mobile_api`, non-Plaid)
- Live bank connector mode via Plaid (`mode=plaid`)
- Wealthsimple brokerage connector mode via SnapTrade (`mode=snaptrade`)
- Mock mode for local demos (`mode=mock`)
- Statement CSV import mode (`provider=manual_csv`, no API credentials)
- Fitness tracking page with Apple Health sync, insights, and performance targets

## What changed

This build now includes the two hardening steps you asked for:
1. Live API wiring in connectors (`plaid` mode)
2. Auth + encrypted Postgres persistence

## Architecture

- API: `src/index.ts`, `src/api/routes.ts`
- Auth: `src/auth/authService.ts`, `src/auth/middleware.ts`
- Postgres repo/schema: `src/db/postgresRepository.ts`
- Encryption: `src/security/encryption.ts`
- Connectors:
  - `src/connectors/eqBankMobileConnector.ts` (EQ Bank mobile API)
  - `src/connectors/plaidConnector.ts` (live)
  - `src/connectors/snapTradeConnector.ts` (live Wealthsimple via SnapTrade)
  - `src/connectors/mockConnector.ts` (sandbox)

## Setup

1. Start Postgres locally.
2. Configure `.env`:

```bash
cp .env.example .env
```

3. Install dependencies and run:

```bash
npm install
npm run dev
```

The app auto-creates DB tables on startup.

## Connector modes

Per provider mode env vars:
- `EQ_BANK_MODE`
- `WEALTHSIMPLE_MODE`
- `TD_MODE`
- `AMEX_MODE`

Allowed values:
- `mock`: uses local sandbox data
- `eq_mobile_api`: EQ Bank-only connector using the mobile API flow
- `plaid`: uses live Plaid Link + API sync
- `snaptrade`: Wealthsimple-only live brokerage connection via SnapTrade portal
- `manual_holdings`: Wealthsimple-only manual per-account holdings JSON + quote-based valuation (no aggregator)

If any provider uses `plaid`, you must set:
- `PLAID_CLIENT_ID`
- `PLAID_SECRET`
- `PLAID_ENV` (`sandbox`, `development`, `production`)

If `WEALTHSIMPLE_MODE=snaptrade`, you must set:
- `SNAPTRADE_CLIENT_ID`
- `SNAPTRADE_CONSUMER_KEY`
- optional: `SNAPTRADE_BASE_URL` (defaults to `https://api.snaptrade.com/api/v1`)

If `EQ_BANK_MODE=eq_mobile_api`, you must set:
- `EQ_BANK_API_BASE_URL` (default: `https://mobile-api.eqbank.ca/mobile/v1.1/`)
- `EQ_BANK_API_AUTHORIZATION` (default from documented mobile API header)
- optional: `EQ_BANK_CLIENT_OS`, `EQ_BANK_CLIENT_VERSION`, `EQ_BANK_TRUST_DEVICE`

If `WEALTHSIMPLE_MODE=manual_holdings`:
- You will paste a JSON payload with accounts + positions in the UI on connect.
- Quotes are fetched via a free provider (default: Stooq). Configure:
  - `QUOTE_PROVIDER` (`stooq`, `yahoo`, or `none`)
  - `QUOTE_DEFAULT_SUFFIX` (default: `.TO`)
  - `QUOTE_CDR_SUFFIX` (default: `.NE`, used when parsing CDR tickers from Wealthsimple CSV exports)
  - `QUOTE_TIMEOUT_MS` (default: `8000`)
  - `QUOTE_MAX_CONCURRENCY` (default: `6`)

Wealthsimple CSV valuation helper:
- `npm run wealthsimple:value -- /path/to/TFSA-...csv /path/to/FHSA-...csv`
- Set `QUOTE_PROVIDER=yahoo` to price using Yahoo Finance.
- Generate manual holdings JSON for in-app connect:
  - `npm run wealthsimple:payload -- /path/to/TFSA-...csv /path/to/FHSA-...csv`

## EQ connector notes

- The EQ mobile API docs used here are from an unofficial community repo last updated on 2022-10-25:
  - https://github.com/bufutda/eq-bank-api/blob/master/API.md
- This connector supports login, step-up auth (OTP/security question), dashboard accounts, and recent transactions.
- If EQ enforces a fresh OTP and you do not provide it during connect, the connector will fail with a step-up-required message and you can reconnect with the OTP.
- For longer-term, officially-consented sharing, EQ now documents Open Banking access through approved third-party apps and Flinks authorization flows.

## CSV import notes

- Upload in-app from the `Import Statement CSV` panel after login.
- The parser auto-detects common headers for date, description, amount or debit/credit, optional balance, account name/number, and currency.
- If a balance column exists, the latest balance becomes the account balance; otherwise balance is estimated from imported transaction flow.
- Imported data is stored under provider `manual_csv` and can be re-imported per account without API credentials.

## Security notes

- JWT auth is required for all finance endpoints.
- Provider access tokens are encrypted before being stored in Postgres.
- Use strong random values for:
  - `JWT_SECRET`
  - `APP_ENCRYPTION_KEY`

## API summary

Public:
- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`

Authenticated:
- `GET /api/auth/me`
- `GET /api/providers`
- `POST /api/providers/:provider/link-token`
- `POST /api/providers/:provider/exchange`
- `GET /api/connections`
- `POST /api/connections/:connectionId/sync`
- `POST /api/sync-all`
- `GET /api/accounts`
- `GET /api/holdings`
- `GET /api/liabilities`
- `GET /api/transactions?limit=100`
- `GET /api/summary`
- `POST /api/import/csv` (import statement CSV to `manual_csv` provider)
- `GET /api/fitness/metrics`
- `GET /api/fitness/dashboard`
- `POST /api/fitness/apple-health/sync` (optional JSON sample payload)
- `POST /api/fitness/samples`
- `POST /api/fitness/targets`
- `DELETE /api/fitness/targets/:targetId`

## Frontend flow

1. Register or log in.
2. Click provider connect button.
3. Complete the connector flow for the selected mode:
   - `eq_mobile_api`: enter EQ credentials + optional step-up details in prompts.
   - `plaid`: complete Plaid Link.
   - `snaptrade`: complete the SnapTrade portal in the opened tab, then confirm in-app.
4. Optionally upload bank statement CSV files from the dashboard import panel (no API connector required).
5. Sync and review net worth, accounts, investments, and liabilities.
6. Open `/fitness.html` to sync health samples, track goals (VO2 max, squat/bench/deadlift 1RM, mile PR), and view insights.
