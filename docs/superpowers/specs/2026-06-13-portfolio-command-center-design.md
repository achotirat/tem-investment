# Portfolio Command Center Design

Date: 2026-06-13

## Purpose

Build a private household portfolio command center that reduces greed/fear-driven investing by making allocation, risk, ownership, and decision logs visible before action is taken.

The system is not an auto-trading system. It may recommend, remind, analyze, and log, but it must never place trades or send orders to brokers/exchanges.

## Product Direction

The selected direction is a Netlify-hosted Portfolio Command Center:

- Private web app for a household.
- Manual-first position/account entry.
- Auto pricing wherever practical.
- Dual-currency view with THB as allocation/rebalancing base and USD as a secondary view.
- Hybrid encryption with login plus master-password unlock.
- Netlify Database/Postgres as primary storage.
- Netlify Blobs for encrypted export/backup.
- AI-assisted analysis only after explicit user consent.

## Technical Architecture

### Stack

- Frontend: Next.js (App Router), deployed via the Netlify adapter.
- Backend: Netlify Functions for auth checks, price sync, recommendation runs, and email dispatch.
- Database: Netlify Database (Postgres) as primary storage.
- Blob storage: Netlify Blobs for encrypted exports/backups.
- Scheduled jobs: Netlify scheduled functions for daily price sync and reminder dispatch.

### Authentication

- Netlify Identity (or an equivalent provider) controls login and household membership.
- Login is separate from, and weaker than, the master-password unlock that decrypts sensitive data. Login alone never exposes plaintext sensitive fields.

### Price Feeds

Auto-pricing draws from public market sources, normalized into valuations in THB:

- BTC and major crypto: a public crypto price API (e.g., CoinGecko).
- Gold: a spot-gold price API, converted to THB.
- SET equities: a SET market data source.
- FX (THB/USD and cross rates): a daily FX rate source.

Cadence is deliberately slow to match the weekly/monthly review habit and to keep API cost low:

- A scheduled function refreshes prices once daily.
- A manual "Refresh prices now" action is available on the dashboard for on-demand updates.
- Auto-pricing never overwrites a manual valuation without recording the prior value in valuation history.

## Portfolio Buckets

The app organizes every holding into one of three portfolio buckets.

### Portfolio 1: Store of Wealth

- Target allocation: 60% of total portfolio.
- Holding period: 20-30 years.
- Assets: Bitcoin, gold, real estate.
- Principle: hold inflation-resistant assets for the long term.
- Default behavior: hold-only.
- Selling/reducing requires a reason log.
- Rebalance bands: ±5% of total portfolio by default, configurable per household. A warning is raised when actual P1 allocation drifts outside the band. A recommendation is created but the user decides the action.

### Portfolio 2: Investment / System Trading

- Target allocation: 30% of total portfolio.
- Holding period: 1-2 years.
- Assets: system-traded assets.
- Principle: let the system work and remove greed/fear.
- Opening a position requires a strict trade plan:
  - Entry reason.
  - Strategy/system/setup.
  - Position size and cost basis.
  - Stop loss.
  - Take profit plan.
  - Invalidation condition.
  - Expected holding period.

### Portfolio 3: Speculation

- Target allocation: 10% of total portfolio.
- Holding period: 1-4 weeks.
- Purpose: controlled outlet for emotional/speculative trades.
- Rules:
  - Cannot exceed 10% target allocation without warning.
  - Saving an over-cap P3 position requires an explicit override reason because external trades cannot be prevented by the app.
  - Requires max loss per trade, set in THB at the household level. Can be changed but each change is logged.
  - Requires max loss per month, set in THB at the household level. Each change is logged.
  - When either loss limit is reached the app shows a warning on every P3 entry and the dashboard. The user can still log positions but must acknowledge the breach.
  - Shows P/L clearly.
  - Does not require the full P2 checklist.

## Core Domain Model

### Household

Represents the shared portfolio owner group.

Fields include:

- Household name.
- Members.
- Base currency: THB.
- Secondary currency: USD.
- Reminder preferences.
- P3 max loss per trade (THB).
- P3 max loss per month (THB).
- P1 rebalance band override (%, optional, defaults to ±5%).
- Stale valuation threshold overrides by asset class (optional, defaults as defined in Update Valuation).

### Member / Owner Entity

Represents a person, company, or external entity that can own part of a holding.

Examples:

- User.
- Partner/spouse.
- Company.
- Other named entity.

### Account / Platform

Represents where an asset is held.

Examples:

- SET broker account.
- TFEX broker account.
- Crypto exchange.
- Hardware wallet.
- Real estate/company holding vehicle.
- Gold storage location.

Sensitive platform details are encrypted.

### Holding / Position

Represents an asset position inside a portfolio bucket.

Fields include:

- Portfolio bucket: P1, P2, or P3.
- Asset class: real estate, stock, derivative, crypto, gold, cash, other.
- Asset identifier: symbol/name/property label.
- Account/platform.
- Quantity.
- Cost basis.
- Current value.
- Currency.
- Leverage, if any.
- Liquidity category.
- Valuation source and valuation date.
- Status: active, exited, archived.

Sensitive values and notes are encrypted.

### Ownership Split

Each holding can have one or more ownership rows.

Fields include:

- Holding.
- Owner entity.
- Ownership percentage.

Percentages must total 100% for each holding.

### Decision Log

Every meaningful decision creates an audit entry.

Examples:

- Buy.
- Sell.
- Reduce.
- Rebalance.
- Ignore warning.
- Approve AI recommendation.
- Defer AI recommendation.
- Update valuation.

Fields include:

- Actor.
- Timestamp.
- Holding or portfolio scope.
- Action.
- Before/after values where relevant.
- Reason.
- Linked recommendation or warning, if relevant.

## Primary Workflows

### Add Household Asset

The user enters:

- Portfolio bucket.
- Asset class.
- Asset identifier/name.
- Platform/account.
- Currency.
- Quantity or ownership basis.
- Cost basis.
- Current value or valuation method.
- Valuation date.
- Ownership percentages.

For real estate and private/company holdings, manual valuation is expected. For BTC, gold, SET, FX, and other supported market assets, the app should try to auto-price.

### Open P2 Position

The user cannot save an active P2 position unless the strict trade plan is complete.

Required fields:

- Entry reason.
- System/setup.
- Stop loss.
- Take profit plan.
- Invalidation condition.
- Position sizing.
- Expected holding period.

A trade plan may be edited after opening — for example, trailing a stop loss as the trade moves. The original plan is preserved, and every change is written to the decision log with a reason. This keeps adjustments deliberate rather than silent.

### Close P2 Position

The user closes a P2 position by selecting an exit reason and confirming final values.

Required fields:

- Exit trigger: stop loss hit, take profit hit, invalidation condition met, or manual close.
- Exit price and date.
- Final P/L in both base cost currency and THB.
- Any notes on what the trade taught or where the plan was wrong.

The original trade plan is preserved in the decision log. The position status moves from active to exited.

### Update Valuation

The user updates the current value of any holding.

Steps:

1. Select holding.
2. Enter new value and valuation date.
3. Select valuation source: manual, auto-price, or third-party appraisal.
4. Optionally add a note.

Previous valuation values are preserved in valuation history. Stale valuation warnings clear once a new valuation is within the freshness threshold.

Stale thresholds by default:

- Liquid market assets (BTC, gold, SET, FX): 24 hours.
- Derivatives and leveraged positions: 24 hours.
- Private company holdings: 90 days.
- Real estate: 180 days.

Thresholds are configurable per household.

### Review Dashboard

Dashboard surfaces:

- Total portfolio value in THB and USD.
- Individual net worth per owner/member as a summary total, derived from ownership percentages. (A per-member drill-down into each holding is deferred; see Deferred capabilities.)
- Allocation by P1/P2/P3 against 60/30/10 targets.
- Asset class concentration.
- Platform/exchange/broker concentration.
- Currency exposure.
- Ownership/entity exposure.
- Leverage exposure.
- Liquidity concentration.
- Stale valuations.
- P2 missing or violated trade plans.
- P3 cap/loss-budget warnings.
- P1 rebalance drift.

### Review Loop

The app should encourage a regular review habit:

1. Email or in-app reminder is created.
2. User opens dashboard.
3. User unlocks sensitive data with master password.
4. User reviews warnings.
5. User updates valuations or logs decisions.
6. User optionally runs AI-assisted analysis with explicit consent.

## Security And Privacy

The app uses hybrid encryption:

- Login controls app access and household membership.
- Master-password unlock decrypts sensitive data for the current session.

### Encryption Implementation

- Sensitive fields are encrypted client-side before they reach the server, so the server and database never hold plaintext.
- The master password derives an encryption key through a slow key-derivation function (Argon2id, with PBKDF2 as a fallback where Argon2 is unavailable).
- Field- or record-level encryption uses AES-GCM.
- Client-side encryption is what makes the recovery rule true: because the server cannot decrypt, it cannot silently recover data without the master password or recovery key.

### Unlock Session

- A master-password unlock lasts for the current tab session and keeps derived keys in memory only.
- The session auto-locks after a configurable idle timeout, default 30 minutes.
- A manual Lock action clears the in-memory keys immediately.
- Closing the tab ends the session; the master password is required again on return.

Sensitive data includes:

- Account, broker, exchange, and wallet details.
- Position sizes.
- Cost basis.
- Current values.
- Trade notes.
- Decision log details.
- AI analysis context and payloads.

Some metadata may remain unencrypted so the app can function:

- Record IDs.
- Portfolio bucket.
- Asset class.
- Created/updated timestamps.
- Reminder status.
- Encrypted blob status.

Recovery must be explicit:

- Login credentials may be reset.
- Encrypted sensitive fields require the master password or recovery key.
- The app should not imply it can silently recover encrypted data without recovery material.

Recovery key:

- Generated once at household setup.
- Displayed once in full; the user must acknowledge they have saved it offline.
- Stored as a secure hash only; the plaintext is never persisted by the app.
- Can be used to re-derive the master encryption key if the master password is forgotten.
- There is one recovery key per household. Regenerating it invalidates the previous key and requires master-password confirmation.

## AI Analysis Consent

AI-assisted analysis is allowed only after:

1. User is logged in.
2. User unlocks sensitive data.
3. User explicitly clicks an Analyze with AI action.
4. The app shows a pre-send summary of the exact data categories being included.
5. User confirms.
6. The app records consent and the scope of data sent.

Data categories in the consent summary:

- Portfolio bucket allocations vs. targets.
- Asset class, platform, currency, leverage, and liquidity breakdowns (category-level, no individual values).
- Active recommendation and warning list.
- Optional: position-level values with a second explicit toggle. Off by default.

AI may:

- Summarize portfolio risk.
- Challenge assumptions.
- Explain possible actions.
- Draft rebalance or risk-reduction suggestions.
- Highlight missing decision logic.

AI must not:

- Execute trades.
- Be treated as final authority.
- Analyze sensitive data without explicit consent.
- Be presented as licensed financial advice.

Every AI recommendation must be resolved by the user as approved, ignored, deferred, or edited.

## Recommendations And Risk

v1 recommendations combine rules-based guardrails and consent-gated AI review.

Rules-based guardrails include:

- P1 allocation drift and rebalance bands.
- P2 missing/violated trade plans.
- P3 allocation cap and max-loss budget.
- Stale valuations.
- Platform/exchange/broker concentration.
- Asset class concentration.
- Currency concentration.
- Owner/entity concentration.
- Leverage exposure.
- Liquidity concentration.

Risk views are category-level in v1. Asset-level correlation, volatility models, and deeper quantitative risk analytics are deferred but should be supported by the schema.

## Notifications

v1 includes:

- In-app notifications.
- Email reminders.

Notification types include:

- Scheduled weekly/monthly portfolio review.
- Stale valuation reminders.
- P1 rebalance drift alerts.
- P2 stop/take-profit review alerts.
- P2 missing-plan warnings.
- P3 cap/loss-budget warnings.

LINE/Telegram reminders are deferred.

## Storage

Primary storage:

- Netlify Database/Postgres.

Secondary storage:

- Netlify Blobs for encrypted export/backup and future file-like artifacts.

The data model should support:

- Audit history.
- Valuation history.
- Household/member ownership.
- Future imports from CSV/API.
- Future asset-level correlation analytics.

## Implementation Phases

The v1 is too large for a single build pass. It is delivered in sequential phases, each building on the prior and each independently demonstrable. Phases 1-6 constitute a minimum usable command center: a household can record holdings, enforce bucket discipline, auto-price, and review risk without AI, notifications, or export. Phases 7-9 layer enhancements on top.

Encryption precedes holdings deliberately, so sensitive fields are never stored as plaintext and retrofitted later.

### Phase 1: Foundation and Auth

- Next.js + Netlify scaffold, Postgres, Netlify Identity login.
- Household and Member/Owner entities.
- App shell and empty dashboard skeleton.
- Outcome: a household can log in and see an empty command center.

### Phase 2: Encryption and Unlock

- Client-side AES-GCM with Argon2id key derivation.
- Master-password unlock session: idle auto-lock, manual Lock.
- Recovery key generation and one-time acknowledgement.
- Outcome: sensitive fields can be encrypted and decrypted in-session; the recovery model is in place.

### Phase 3: Holdings, Ownership, and Manual Valuation

- Account/Platform, Holding/Position, and Ownership Split entities.
- Add Household Asset workflow with manual entry and manual valuation.
- Ownership-must-total-100% enforcement.
- Valuation history.
- Outcome: a household can record holdings across accounts with ownership splits and see them listed.

### Phase 4: Bucket Discipline and Decision Log

- Decision Log/audit entity.
- P1 hold-only default with sell/reduce reason logging.
- P2 Open/Close/Edit with the strict trade plan.
- P3 guardrails: cap, loss limits, over-cap override reason.
- Outcome: the behavioral guardrails — the core purpose of the app — are enforced and logged.

### Phase 5: Auto-Pricing

- Daily scheduled price sync for BTC, gold, SET, and FX, normalized to THB.
- Manual "Refresh prices now."
- Stale valuation thresholds and warnings.
- Dual-currency view (THB base, USD secondary).
- Outcome: market holdings auto-price and stale data surfaces.

### Phase 6: Dashboard and Rules-Based Recommendations

- Total value, allocation vs. 60/30/10, individual net worth summary.
- Concentration views: asset class, platform, currency, owner/entity, leverage, liquidity.
- Rebalance drift and the full set of rules-based guardrails surfaced as warnings.
- Outcome: the complete review dashboard with rule-based recommendations.

### Phase 7: Notifications and Review Loop

- In-app notifications and email reminders.
- Scheduled weekly/monthly review, plus stale/rebalance/P2/P3 alerts.
- Outcome: the regular-review habit loop closes.

### Phase 8: AI-Assisted Analysis

- Analyze with AI action, data-scope preview, consent recording.
- Recommendation lifecycle: approve, ignore, defer, or edit — each logged.
- Outcome: optional consent-gated AI review layered on top.

### Phase 9: Export and Backup

- Netlify Blobs encrypted export/backup.
- Outcome: data portability and backup.

## Non-Goals And Safety Boundaries

The system must not:

- Auto-trade.
- Send buy/sell orders.
- Connect to brokers/exchanges for execution.
- Make hidden portfolio changes.
- Treat AI output as final decision authority.
- Present recommendations as licensed financial advice.
- Pretend category-level risk is a full correlation engine.

Deferred capabilities:

- CSV/import workflows.
- Broker/exchange API sync for read-only import/price/account data.
- LINE/Telegram notifications.
- Full quantitative correlation engine.
- Local/private AI model option.
- Advanced role permissions for advisors/accountants.
- Per-member filtered portfolio view (drill into each member's slice of every holding).
- Sub-daily/real-time price refresh.

## Success Criteria

The v1 succeeds if:

- Household users can see total portfolio value across platforms/accounts.
- Individual net worth per member is derivable from ownership percentages.
- Every holding is mapped to P1/P2/P3.
- Ownership percentages are visible and calculated.
- P2 positions cannot be created without a trade plan.
- P2 exits are logged with an exit reason and preserve the original trade plan.
- P3 speculation is capped and loss-budgeted.
- P1 holdings default to long-term hold with rebalance awareness.
- Rebalance band breaches produce visible warnings.
- Stale valuation warnings fire at configured thresholds.
- Users can see concentration by bucket, asset class, platform, currency, owner/entity, leverage, and liquidity.
- Sensitive data requires master-password unlock.
- AI analysis requires explicit consent with a visible data-scope summary.
- Recommendations and ignored warnings are logged.
- Email/in-app reminders help users review the portfolio regularly.
