# Internal Wallet Service

> A production-grade, ledger-based internal wallet system built with **Node.js**, **Express**, **Prisma 6.19.0**, and **PostgreSQL** — designed to simulate a high-traffic, closed-loop virtual currency platform with financial-grade consistency, auditability, and transactional integrity.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Database Design](#database-design)
- [Concurrency Strategy](#concurrency-strategy)
- [API Reference](#api-reference)
- [Running with Docker](#running-with-docker)
- [Running Locally](#running-locally)
- [Technical Details](#technical-details)
- [Design Philosophy](#design-philosophy)
- [Author](#author)

---

## Overview

This wallet service is engineered as if it were powering a real-world gaming reward system, loyalty points engine, or closed-loop digital currency platform. The system prioritizes **integrity over speed**, **auditability over convenience**, and **safety over simplicity**.

Rather than tracking balances as mutable columns, the system derives balance from an immutable ledger — the same foundational model used by financial institutions and modern fintech platforms.

---

## Features

###  ACID Transactions
All wallet operations execute inside PostgreSQL transactions via Prisma, ensuring atomicity, consistency, isolation, and durability by default.

###  Double-Entry Ledger Architecture
Every transaction creates a corresponding pair of debit and credit ledger entries. No balance column is stored — balance is always derived from the ledger sum.

```
Balance = SUM(ledger_entries.amount WHERE wallet_id = ?)
```

> Money never appears or disappears. Every credit has a matching debit.

###  Transaction Lifecycle Management
Each transaction passes through a defined set of states:

| State | Description |
|---|---|
| `PENDING` | Transaction initiated, not yet settled |
| `COMPLETED` | Successfully settled |
| `FAILED` | Rolled back due to error or constraint violation |

This ensures full observability and audit safety across all operations.

###  Idempotency Support
Duplicate transaction requests carrying the same `referenceId` are safely detected and ignored, protecting against double-processing in retry scenarios.

###  Deadlock Handling with Retry
The service implements automatic retry logic for the following PostgreSQL error codes:

- `40P01` — Deadlock detected
- `40001` — Serialization failure

Retries use deterministic ordering and incremental backoff to resolve contention without data loss.

###  Row-Level Locking
`SELECT ... FOR UPDATE` is applied to wallet rows before any mutation, preventing race conditions under high concurrency.

###  Treasury System Wallet
A system-controlled treasury wallet enables proper accounting for all operation types:

| Operation | Flow |
|---|---|
| `TOPUP` | Treasury → User |
| `SPEND` | User → Treasury |
| `BONUS` | Treasury → User |

###  Global Error Middleware
Centralized error handling delivers structured, consistent HTTP responses across all routes and failure modes.

###  Dockerized Setup
Fully containerized with automatic: database spin-up, schema migration, data seeding, and application startup — one command to run everything.

---

## Architecture

This service follows financial-grade design principles throughout:

```
┌─────────────────────────────────────────────┐
│                  API Layer                   │
│          Express Router + Middleware         │
└───────────────────┬─────────────────────────┘
                    │
┌───────────────────▼─────────────────────────┐
│               Service Layer                  │
│  wallet.service.ts — Business Logic Core     │
│  · Row-level locking (SELECT FOR UPDATE)     │
│  · Deadlock detection + retry                │
│  · Idempotency via referenceId               │
│  · Double-entry ledger writes                │
└───────────────────┬─────────────────────────┘
                    │
┌───────────────────▼─────────────────────────┐
│              Prisma ORM Layer                │
│  · ACID transaction boundaries               │
│  · Decimal precision (no float arithmetic)   │
│  · Schema-isolated `wallet` namespace        │
└───────────────────┬─────────────────────────┘
                    │
┌───────────────────▼─────────────────────────┐
│              PostgreSQL                      │
│  · Double-entry LedgerEntry table            │
│  · Unique constraint on referenceId          │
│  · Schema: `wallet`                          │
└─────────────────────────────────────────────┘
```

---

## Project Structure

```
xaltypasta-internal-wallet-service/
├── docker-compose.yml
├── Dockerfile
├── package.json
├── prisma.config.ts
├── tsconfig.json
├── .dockerignore
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
└── src/
    ├── prisma.ts
    ├── server.ts
    ├── middleware/
    │   └── error.middleware.ts
    ├── routes/
    │   └── wallet.routes.ts
    ├── services/
    │   └── wallet.service.ts
    └── utils/
        └── appError.ts
```

---

## Database Design

All tables live inside the PostgreSQL schema `wallet`, providing clean namespace isolation.

### Entity Overview

**`User`** — Represents a platform participant (human or system).

**`Asset`** — Defines the virtual currency type in use (e.g., credits, coins).

**`Wallet`** — Links a user to an asset. No balance column — balance is always derived.

**`Transaction`** — Records every financial event with full lifecycle state tracking.

| Field | Purpose |
|---|---|
| `referenceId` | Unique idempotency key |
| `type` | `TOPUP`, `SPEND`, or `BONUS` |
| `status` | `PENDING`, `COMPLETED`, or `FAILED` |
| `createdAt` / `updatedAt` | Audit timestamps |

**`LedgerEntry`** — The source of truth for all balances.

Each transaction generates exactly two entries:
- One **debit** entry (funds leaving a wallet)
- One **credit** entry (funds arriving in a wallet)

This guarantees double-entry integrity — the ledger always balances to zero across all wallets.

### Entity Relationship Diagram

```
User ──────< Wallet >────── Asset
                │
                │
           Transaction
                │
         ┌──────┴──────┐
    LedgerEntry    LedgerEntry
    (DEBIT)        (CREDIT)
```

---

## Concurrency Strategy

| Threat | Mitigation |
|---|---|
| Race Conditions | Row-level locking via `SELECT ... FOR UPDATE` |
| Deadlocks | Deterministic wallet lock ordering (consistent ID sort) |
| Deadlock Failures | Automatic retry with incremental backoff |
| Duplicate Requests | Unique `referenceId` constraint + idempotency check |
| Float Precision Errors | `Prisma.Decimal` throughout — no native float arithmetic |

---

## API Reference

### Health Check

```
GET /health
```

Returns service status. Use this to verify the container is up and the database connection is live.

---

### Get Wallet Balance

```
GET /wallet/:walletId/balance
```

Returns the current balance for the specified wallet, derived from ledger entry summation.

---

### Top-Up Wallet

```
POST /wallet/topup
```

Transfers credits from the treasury wallet to a user wallet.

**Request Body:**
```json
{
  "walletId": "USER_WALLET_ID",
  "treasuryWalletId": "TREASURY_WALLET_ID",
  "amount": 100,
  "referenceId": "topup-ref-001"
}
```

---

### Spend Credits

```
POST /wallet/spend
```

Transfers credits from a user wallet back to the treasury.

**Request Body:**
```json
{
  "walletId": "USER_WALLET_ID",
  "treasuryWalletId": "TREASURY_WALLET_ID",
  "amount": 50,
  "referenceId": "spend-ref-001"
}
```

---

### Bonus Credits

```
POST /wallet/bonus
```

Issues bonus credits from the treasury to a user wallet (e.g., promotional rewards).

**Request Body:**
```json
{
  "walletId": "USER_WALLET_ID",
  "treasuryWalletId": "TREASURY_WALLET_ID",
  "amount": 25,
  "referenceId": "bonus-ref-001"
}
```

---

## Running with Docker

Docker is the recommended way to run this service. All setup — database creation, migration, seeding, and app startup — is handled automatically.

### Prerequisites

- Docker Desktop (or Docker Engine + Compose plugin)

### Start the Service

```bash
docker compose up --build
```

This single command will:
1. Pull and start the PostgreSQL container
2. Run Prisma migrations to apply the schema
3. Seed the database with initial wallet and user data
4. Start the wallet service on port `3000`

### Verify the Service

```bash
curl http://localhost:3000/health
```

### Stop the Service

```bash
docker compose down
```

To also remove the database volume:

```bash
docker compose down -v
```

---

## Running Locally

### Prerequisites

- Node.js 18+
- PostgreSQL installed and running locally

### 1. Create the Database

```bash
createdb wallet_db
```

### 2. Configure Environment

Create a `.env` file in the project root:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/wallet_db?schema=wallet
PORT=3000
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Run Migrations

```bash
npx prisma migrate dev
```

### 5. Seed the Database

```bash
npx prisma db seed
```

### 6. Start the Server

```bash
npm run dev
```

The service will be available at `http://localhost:3000`.

---

## Technical Details

| Concern | Approach |
|---|---|
| Language | TypeScript |
| Runtime | Node.js 18+ |
| Framework | Express |
| ORM | Prisma 6.19.0 (pinned) |
| Database | PostgreSQL |
| Schema Isolation | `wallet` schema namespace |
| Concurrency Control | Row-level locking + deterministic ordering |
| Deadlock Recovery | Automatic retry with backoff |
| Idempotency | Unique constraint on `referenceId` |
| Numeric Precision | `Prisma.Decimal` — no floating point |
| Error Handling | Centralized middleware with structured responses |
| Containerization | Docker + Docker Compose |
| Shutdown | Graceful shutdown handling |

---

## Design Philosophy

This service is architected on three core principles:

**Integrity over speed.** Every operation validates state, acquires locks, and commits atomically. There are no shortcuts that could compromise consistency.

**Auditability over convenience.** The ledger is immutable and append-only. Historical state can always be reconstructed. No balance is ever silently mutated.

**Safety over simplicity.** Idempotency, deadlock retry, row-level locking, and lifecycle state management add complexity — but they make the system correct under adversarial conditions (concurrent requests, network retries, partial failures).

### Stress Testing Guidance

To validate concurrency guarantees, run parallel spend requests targeting the same wallet simultaneously. The system will guarantee:

- No negative balances
- No double-spending
- No lost or duplicated transactions
- All deadlocks resolved via retry without data corruption

---
