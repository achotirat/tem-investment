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

## Portfolio Buckets

The app organizes every holding into one of three portfolio buckets.

### Portfolio 1: Store of Wealth

- Target allocation: 60% of total portfolio.
- Holding period: 20-30 years.
- Assets: Bitcoin, gold, real estate.
- Principle: hold inflation-resistant assets for the long term.
- Default behavior: hold-only.
- Selling/reducing requires a reason log.
- Rebalance bands may trigger recommendations when allocation drifts too far.

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
  - Requires max loss per trade.
  - Requires max loss per month.
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

### Review Dashboard

Dashboard surfaces:

- Total portfolio value in THB and USD.
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

## AI Analysis Consent

AI-assisted analysis is allowed only after:

1. User is logged in.
2. User unlocks sensitive data.
3. User explicitly clicks an Analyze with AI action.
4. The app records consent and the scope of data sent.

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

## Success Criteria

The v1 succeeds if:

- Household users can see total portfolio value across platforms/accounts.
- Every holding is mapped to P1/P2/P3.
- Ownership percentages are visible and calculated.
- P2 positions cannot be created without a trade plan.
- P3 speculation is capped and loss-budgeted.
- P1 holdings default to long-term hold with rebalance awareness.
- Users can see concentration by bucket, asset class, platform, currency, owner/entity, leverage, and liquidity.
- Sensitive data requires master-password unlock.
- AI analysis requires explicit consent.
- Recommendations and ignored warnings are logged.
- Email/in-app reminders help users review the portfolio regularly.
