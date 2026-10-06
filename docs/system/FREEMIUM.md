# Freemium / Usage Limits (`src/services/freemium.js`)

## Overview

Optional usage tracking and limit checks. The plan comes from the user profile: `profile.plan === 'PRO'` selects `PRO_LIMITS`, anything else selects `FREE_LIMITS`.

### The `ENABLE_USAGE_LIMITS` flag is not wired

`src/config/constants.js` exports `ENABLE_USAGE_LIMITS = import.meta.env.VITE_ENABLE_USAGE_LIMITS === 'true'`, and it is included in the default export. **No module in `src/` imports it.** The gate in `useWorkspaceFreemium.gateAction` calls `canUseAction` unconditionally, and `PaywallModal` is always mounted in `Workspace.jsx` (it simply renders nothing while `paywall.open` is `false`).

What actually keeps a fresh install unrestricted is that the default guest profile is `PRO`, so `PRO_LIMITS` apply and they are generous. That is not the same as the feature flag working. Do not document `VITE_ENABLE_USAGE_LIMITS` as the switch that disables limits; wiring it into `gateAction` is a pending change.

## Storage

Usage is tracked in `localStorage` under one key per user per UTC day:

```
oc_usage:{userId}:{YYYY-MM-DD}
```

`userId` falls back to `'guest'`. Because the date is part of the key, counters reset daily without a cleanup job. Corrupt or missing values read as all-zero rather than throwing.

Note there is no separate `oc_model_usage` key: per-model counters do not exist.

## Counters

```js
{ generate: 0, iteration: 0, image: 0, export: 0, publish: 0 }
```

`iteration` is not a daily counter. It is read from `currentProjectIterations` passed by the caller, because the limit is per project rather than per day.

## Limits

`FREE_LIMITS` and `PRO_LIMITS` in `src/config/constants.js`:

| Constant | Free | Pro |
|----------|------|-----|
| `DAILY_GENERATIONS` | 5 | 100 |
| `DAILY_IMAGES` | 2 | 80 |
| `DAILY_EXPORTS` | 2 | 100 |
| `DAILY_PUBLISHES` | 1 | 100 |
| `MAX_PROJECTS` | 5 | `-1` (unlimited) |
| `MAX_ITERATIONS` | 2 | 10 |
| `WATERMARK` | `true` | `false` |

## Functions

### `getPlanLimits(isPro)`
Returns `PRO_LIMITS` or `FREE_LIMITS`.

### `getDailyUsage(userId)`
Returns the counter object for today.

### `incrementUsage(action, userId, amount = 1)`
Increments one counter and returns the updated object. Unknown action names create a new key rather than failing; callers pass the fixed set above.

### `canUseAction(action, { isPro, userId, projectCount, currentProjectIterations })`

```js
{ allowed: boolean, reason: string|null, used: number, limit: number, remaining: number }
```

| `action` | Limit source | `reason` when blocked |
|----------|--------------|------------------------|
| `generate` | `DAILY_GENERATIONS` | `DAILY_GENERATIONS_LIMIT` |
| `iteration` | `MAX_ITERATIONS` vs `currentProjectIterations` | `ITERATIONS_PER_PROJECT_LIMIT` |
| `image` | `DAILY_IMAGES` | `DAILY_IMAGES_LIMIT` |
| `export` | `DAILY_EXPORTS` | `DAILY_EXPORTS_LIMIT` |
| `publish` | `DAILY_PUBLISHES` | `DAILY_PUBLISHES_LIMIT` |
| `project` | `MAX_PROJECTS` vs `projectCount` | `PROJECT_LIMIT` |

A limit of `-1` short-circuits to `allowed: true`. An unrecognized `action` also returns `allowed: true`, so an unmapped call never silently blocks the user.

## Paywall Flow

```
Action requested
    ↓
gateAction(action, extra)          ← useWorkspaceFreemium
    ↓
canUseAction(action, { isPro, userId, projectCount, currentProjectIterations })
    ↓
allowed === false?
    ↓
Yes → openPaywall({ reason, used, limit, plan }) → PaywallModal renders
        reason is mapped to a translated title/message pair via PAYWALL_REASON_KEYS,
        with paywall.defaultTitle / paywall.defaultMessage as the fallback
No  → run the action, then incrementUsage(action, userId, 1)
```

`gateAction` returns a boolean, so callers write `if (!gateAction('project')) return;` before doing the work. In the workspace it is consumed by `useWorkspaceGeneration`, `useWorkspaceBatch` and `useWorkspaceActions`. `useWorkspaceMedia` receives `openPaywall` directly and calls it when an asset limit is hit.

## Server-Side Endpoints

Optional and in-memory only (`server/routes/usage.js`), for forks that want a shared counter:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/usage` | GET | Plan limits |
| `/api/usage/:userId` | GET | Current usage |
| `/api/usage/:userId/increment` | POST | Increment an action |

There is no database behind them and they reset when the process restarts.

## Architecture Decisions

- **No mandatory paywall in the default build.** The shipped guest profile is `PRO`, and the feature flag that was meant to disable the limits is not wired (see above). The capability exists for forks that want it; it is not a gate the open-source build imposes.
- **Local-first.** Counters live in `localStorage`. The server endpoints are optional.
- **Advisory, not enforced.** The check is client-side, so clearing site data resets it. Do not describe these limits as enforcement.
- **Plan comes from the profile.** `profile.plan` decides Free vs Pro, and the default guest profile is `PRO`.