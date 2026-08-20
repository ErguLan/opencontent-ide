# Freemium / Paywall (`src/services/freemium.js`)

## Overview

Optional usage tracking and limit enforcement. Controlled by `VITE_ENABLE_USAGE_LIMITS=true` in `.env`. When disabled, all limits are ignored and the paywall UI is hidden.

## Storage

Usage data is stored in `localStorage` with keys like:
```
oc_usage:{userId}:{YYYY-MM-DD}
oc_model_usage:{userId}:{YYYY-MM-DD}
```

Data resets daily (keyed by date).

## Functions

### `getPlanLimits(isPro)`
Returns the limit object for the plan:
```js
isPro ? PRO_LIMITS : FREE_LIMITS
```

**Free limits:**
| Action | Daily Limit |
|--------|------------|
| Generations | 5 |
| Iterations per project | 2 |
| Images | 2 |
| Exports | 2 |
| Publishes | 2 |
| Max projects | 5 |

**Pro limits:**
| Action | Daily Limit |
|--------|------------|
| Generations | 100 |
| Iterations per project | 10 |
| Images | 80 |
| Exports | 100 |
| Publishes | 100 |
| Max projects | Unlimited (-1) |

### `getDailyUsage(userId)`
Returns `{ generate, iteration, image, export, publish }` with current counts.

### `incrementUsage(action, userId, amount = 1)`
Increments a specific action counter. Returns updated usage object.

### `canUseAction(action, { isPro, userId, projectCount, currentProjectIterations })`
Checks if an action is allowed. Returns:
```js
{ allowed: boolean, reason: string|null, used: number, limit: number, remaining: number }
```

If `allowed === false`, `reason` contains the limit type (e.g. `'DAILY_GENERATIONS_LIMIT'`).

## Paywall Modal Flow

```
Generation requested
    ↓
ENABLE_USAGE_LIMITS == true?
    ↓
Yes → canUseAction('generate', { isPro, userId })
    ↓
allowed === false?
    ↓
Yes → openPaywall({ reason: 'DAILY_GENERATIONS_LIMIT', used, limit })
    ↓
      setPaywall({ open: true, title, message, reason })
    ↓
      Modal renders with upgrade message
    ↓
No → incrementUsage('generate', userId, 1)
    ↓
      Proceed with generation
```

## Server-Side Endpoints

The Express server (`server/routes/usage.js`) provides optional cloud sync:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/usage/:userId` | GET | Get current usage |
| `/api/usage/:userId/increment` | POST | Increment an action |
| `/api/usage` | GET | Get plan limits |

These are in-memory only (no database). Forks can replace with a real database.

## Architecture Decisions

- **Local-first**: Usage is tracked in localStorage by default. Server endpoints are optional.
- **No hard enforcement**: The frontend checks limits, but a determined user could bypass by clearing localStorage.
- **Plan stored in profile**: `profile.plan` determines Free vs Pro. By default it's `'PRO'`.
- **Paywall hidden when disabled**: When `ENABLE_USAGE_LIMITS` is false, no paywall UI is rendered.
