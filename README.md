# Finance Tracker (EQ Bank + Wealthsimple + TD + Amex)

A TypeScript finance tracking app with a pluggable backend connector layer for:
- EQ Bank
- Wealthsimple
- TD
- American Express

It tracks:
- Cash and savings accounts
- Investment holdings
- Liabilities/debt (credit card, loan, line of credit, mortgage)
- Net worth summary

## Why this integration pattern

Canadian banking APIs and brokerage access vary by provider and account type. This app uses a connector abstraction so you can:
- Run immediately in `mock` mode for development
- Replace each connector with your approved production integration (bank API or aggregator)

## Stack

- Backend: Node.js + TypeScript + Express
- Frontend: Static HTML/JS dashboard served by the backend
- Storage: JSON file (`data/store.json`) for local MVP use

## Quick start

```bash
npm install
cp .env.example .env
npm run dev
```

Open: [http://localhost:4000](http://localhost:4000)

## Core API

- `GET /api/providers`
- `POST /api/connections` `{ userId, provider }`
- `POST /api/connections/:connectionId/sync`
- `POST /api/sync-all` `{ userId }`
- `GET /api/accounts?userId=...`
- `GET /api/holdings?userId=...`
- `GET /api/liabilities?userId=...`
- `GET /api/transactions?userId=...&limit=100`
- `GET /api/summary?userId=...`

## Provider connectors

Connector code is in:
- `src/connectors/index.ts`
- `src/connectors/providerConnector.ts`
- `src/connectors/mockData.ts`

Current behavior:
- `mock` mode: returns realistic sandbox data per institution.
- any non-`mock` mode: connection can be created, sync intentionally fails until you implement live API calls in `src/connectors/providerConnector.ts`.

## Production hardening checklist

Before using with real financial accounts:
- Replace JSON storage with encrypted database storage (PostgreSQL recommended)
- Add user auth + session management
- Add encrypted secrets handling for provider tokens
- Add audit logs and sync job queues
- Implement per-provider OAuth/link-token flows
- Add reconciliation and duplicate transaction detection
- Add test coverage for connector mappings and summary calculations

## Notes about institution access

Actual connectivity for EQ Bank, Wealthsimple, TD, and Amex depends on your approved API/aggregator access and terms. This repo is a secure scaffold for that integration, not credential scraping.
