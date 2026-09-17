# Checklister

Swing-trading decision support: score a setup against a 10-criteria checklist, let an ML timing model veto bad entries, and manage the resulting trade plan, watchlist, portfolio, and journal. Built with Next.js 16 (App Router, server actions), Supabase (Postgres, auth, RLS), and Tailwind 4.

The edge is assumed to come from "soft signals" the user brings (insider buying, politician trades). The ML model is a timing filter only: it vetoes an entry when its predicted probability of loss is high, then the exit calculator produces stop and take-profit levels.

## Features

| Area | What it does | Code |
|------|--------------|------|
| Checklist evaluation | Scores a ticker on market, sector, company, catalyst, patterns, support/resistance, price action, volume, MA/Fibonacci, and RSI criteria; detects market regime and multi-timeframe alignment | `src/lib/analysis.ts`, `src/lib/market-regime`, `src/lib/multi-timeframe`, `src/components/CriteriaList.tsx` |
| ML timing veto | Logistic-regression model (40 features) with Platt, isotonic, or temperature calibration; vetoes when P(loss) exceeds a threshold, then computes ATR-based stop and TP1/TP2/TP3 | `src/lib/model`, `src/lib/ml`, `src/lib/trade-plan` |
| Recommendations | Scheduled scan of recent insider activity (FMP) turned into ranked candidates | `src/app/api/cron/recommendations`, `src/components/tabs/RecommendationsTab.tsx` |
| Politician trades | Ingest congressional trade signals via webhook, queue and evaluate them, ML-timed exits, price updates, performance summary | `src/lib/politician`, `src/app/api/politician/*`, `src/components/politician` |
| Watchlist | Manual entries plus Telegram-sourced signals via webhook | `src/app/watchlist-actions.ts`, `src/app/api/watchlist/telegram-signal` |
| Portfolio and journal | Open positions, partial exits, realised R, trade notes, CSV/LaTeX export | `src/app/portfolio-actions.ts`, `src/app/journal-actions.ts`, `src/app/export-actions.ts`, `src/components/latex` |
| Benchmarking | Tracks the full trade lifecycle against a benchmark and reports performance | `src/lib/benchmarking`, `src/components/tabs/PerformanceTab.tsx` |
| Backtesting and training | Point-in-time simulator, trade labelling, dataset generation, model training and veto threshold optimisation (CLI scripts) | `src/lib/backtest`, `scripts/` |
| Admin | Usage and API-log dashboard | `src/app/admin`, `src/components/admin` |

## Architecture

```
Browser (Next.js App Router, React 19)
  |  server actions (src/app/*-actions.ts)
  v
Next.js server
  |-- src/lib/analysis.ts        checklist scoring pipeline
  |-- src/lib/trade-plan         veto system + exit calculator
  |-- src/lib/model, src/lib/ml  logistic model, calibration, gradient boosting, registry
  |-- src/lib/data-services      FMP, EODHD, yahoo-finance2 fallback, Anthropic sentiment, cache
  |-- src/app/api/cron/*         scheduled jobs (bearer CRON_SECRET)
  |-- src/app/api/*/signals      inbound webhooks (Telegram, politician feed)
  v
Supabase (Postgres + RLS, auth via @supabase/ssr middleware)
```

Trained model artefacts live in `data/` (`model-v2.json`, `politician-exit-model.json`) and are loaded at runtime by `src/lib/trade-plan/veto-system.ts` and `src/lib/backtest/politician-exit-model.ts`.

## Getting started

Requirements: Node 22 or later, a Supabase project, and at least one market-data API key.

```bash
npm ci
cp .env.example .env.local   # fill in Supabase and provider keys
npm run dev                  # http://localhost:3000
```

### Environment variables

See `.env.example` for the full annotated list. In short:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`: database and auth.
- `DATA_PROVIDER` (`fmp` or `eodhd`) with `FMP_API_KEY` or `EODHD_API_KEY`; `FALLBACK_TO_YAHOO=true` to fall back to yahoo-finance2.
- `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` (default `claude-haiku-4-5-20251001`) for LLM sentiment scoring.
- `CRON_SECRET`, `WATCHLIST_TELEGRAM_API_KEY`, `WATCHLIST_DEFAULT_USER_ID`, `POLITICIAN_WEBHOOK_API_KEY`, `POLITICIAN_DEFAULT_USER_ID` for scheduled jobs and webhooks.

Provider base URLs are centralised in `src/lib/config/providers.ts`.

### Database

Run these in the Supabase SQL editor, in order:

1. `supabase-schema.sql` (core tables: trades, watchlists, portfolios, journal)
2. `supabase-schema-v2.sql` (historical data and backtesting tables)
3. `supabase-benchmarking-schema.sql`
4. `supabase-recommendations-migration.sql`
5. `supabase-politician-migration.sql`
6. `supabase-api-logs-migration.sql`
7. `supabase-user-activity-logs.sql`
8. `supabase-add-sells-column.sql`
9. `supabase/migrations/20250122_add_watchlist_source.sql`

## Scripts

Application:

```bash
npm run dev            # Next.js dev server
npm run build          # production build
npm run start          # serve the build
npm run lint           # eslint
npm test               # vitest unit tests
npm run scripts:check  # verify every package.json script target exists
```

Research CLI (all run with `tsx`; most need a warmed price cache and provider keys):

```bash
npm run evaluate:trade -- --ticker NVDA --signal insider_buy --cache   # trade plan + veto for one ticker
npm run evaluate:veto                                                  # veto system metrics on the holdout set
npm run optimize:veto                                                  # sweep the veto threshold (writes results/)
npm run cache:warm -- --tickers MSFT,GOOGL,META                        # populate the local price cache
npm run cache:stats / npm run cache:clear
npm run train:offline:v2 / npm run train:offline:v2:50k                # build training data from the cache
npm run train:model:v2                                                 # train and write data/model-v2.json
```

Other one-off scripts in `scripts/` (politician backtest and strategy, exit-model training, regression checks) are run directly with `npx tsx scripts/<name>.ts`.

## Testing

`npm test` runs vitest against pure functions in the model and backtest layers (`tests/unit/`): calibration maths, label statistics, default backtest config, logistic prediction and class weighting. CI (`.github/workflows/build-check.yml`) runs lint, the script-target check, the unit tests, and `next build` on every push and pull request to `main`; Dependabot opens weekly dependency PRs.

## Deployment

Deploys as a standard Next.js app (Vercel or any Node host). Set the environment variables above in the host, and schedule `GET /api/cron/recommendations` (and the politician `update-prices` and `evaluate-exits` routes) with the `Authorization: Bearer <CRON_SECRET>` header.

## Model notes

The current production model (`data/model-v2.json`, 40 features, logistic regression, 35k training samples) has a holdout AUC of about 0.54. That is expected: technical features alone do not predict outcomes well, which is why the model only vetoes (P(loss) > 60 percent, roughly 83 percent veto precision at the tuned threshold) rather than generates entries. Exits default to a 1.5 ATR stop and TP1/TP2/TP3 at 2R/3R/4R with 33/33/34 percent partial exits.

## License

Private project. No license granted.
