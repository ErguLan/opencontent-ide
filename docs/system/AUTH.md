# Auth System (`src/context/AuthContext.jsx`)

## Design Philosophy

Local-first by default. No server, no external identity provider, no dependency. The app authenticates as a local guest profile with full access, so it works the moment it loads. This is intentional: OpenContent IDE must not require an account to run.

Forks that want real authentication replace two stub functions. Nothing else changes.

## Default Profile

```js
const GUEST_PROFILE = {
    uid: 'local-guest',
    displayName: 'Local User',
    email: 'local@opencontent.ide',
    plan: 'PRO',
    avatarUrl: null,
    createdAt: <timestamp>
};
```

Persisted to `localStorage` under `STORAGE_KEYS.USER` (`oc_user`). A missing or unparseable value falls back to the guest profile, so a corrupted entry cannot lock the user out.

`plan: 'PRO'` is what makes a fresh install unrestricted. `isPro` is true for `'PRO'` and `'TEAMS'`.

## Context API

```js
const {
    profile, isPro, isAuthenticated, loading, error,
    loginLocal, loginGoogle, loginEmail, logout, clearError
} = useAuth();
```

| Property | Type | Meaning |
|----------|------|---------|
| `profile` | `object` | Always non-null in the default build; the guest profile. |
| `isAuthenticated` | `boolean` | `Boolean(profile?.uid)`. |
| `isPro` | `boolean` | `plan === 'PRO' \|\| plan === 'TEAMS'`. |
| `loading` | `boolean` | Set by the stub login methods only. |
| `error` | `string` | Last error message; cleared by `clearError()`. |

| Method | Purpose | Default behavior |
|--------|---------|------------------|
| `loginLocal({ displayName, email })` | Create or modify the local profile | Works immediately, persists to `oc_user` |
| `loginGoogle()` | Google OAuth | Returns `{ success: false, error: '…not configured in this build…' }` |
| `loginEmail(email, password)` | Email + password | Returns `{ success: false, error: '…not configured in this build…' }` |
| `logout()` | Clear the stored profile | Resets to the guest profile |
| `clearError()` | Clear `error` | — |

`useAuth()` throws `useAuth must be used within AuthProvider` when called outside the provider.

## Flow

```
App mounts
    ↓
localStorage.getItem('oc_user')
    ↓
Valid JSON → spread over GUEST_PROFILE
Missing or invalid → GUEST_PROFILE
    ↓
<AuthProvider> publishes { profile, isPro, isAuthenticated, ... }
    ↓
Workspace: isAIConfigured() must also be true before generation is offered.
That check is about model registration, not auth.
```

`isAIConfigured()` requires a registered text model whose provider has a credential. A valid auth profile with no configured provider still lands on the `not_configured` state, which routes to `/setup`.

## Adding Real Auth

Replace `loginGoogle` and `loginEmail` in `AuthContext.jsx`:

```js
const loginEmail = useCallback(async (email, password) => {
    setLoading(true);
    setError('');
    try {
        const { token, user } = await yourBackend.signIn(email, password);
        const profile = {
            uid: user.id,
            displayName: user.name,
            email: user.email,
            plan: 'FREE',
            avatarUrl: user.avatarUrl ?? null,
            createdAt: new Date().toISOString()
        };
        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(profile));
        setProfile(profile);
        return { success: true };
    } catch (error) {
        setError(error.message);
        return { success: false, error: error.message };
    } finally {
        setLoading(false);
    }
}, []);
```

Note that `plan` is read straight from the stored profile. If you want the plan to be server-controlled, resolve it on load rather than relying on the persisted value.

## Rules

- Do not make an external provider mandatory. The default build must keep working with no network account.
- Do not gate local functionality on `isAuthenticated`; the guest profile is always authenticated.
- Keep `profile.plan` meaningful only if you also wire `ENABLE_USAGE_LIMITS`, which is currently not read anywhere. Without it, `canUseAction` runs against whatever `isPro` reports.

## Usage

```jsx
function Settings() {
    const { profile, logout } = useAuth();
    return (
        <div>
            <span>{profile?.displayName}</span>
            <span>{profile?.plan}</span>
            <button onClick={logout}>Log out</button>
        </div>
    );
}
```