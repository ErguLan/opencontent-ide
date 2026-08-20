# Auth System (`src/context/AuthContext.jsx`)

## Design Philosophy

The auth system is **local-first by default**. No server, no Firebase, no external dependency. The app auto-authenticates as a "Local User" with full access. This is intentional — OpenContent IDE should work out of the box without any sign-up.

For forks that want real authentication, the system provides stub methods that can be replaced.

## Default Behavior

```js
// On first load, creates a guest profile:
{
    uid: 'local-guest',
    displayName: 'Local User',
    email: 'local@opencontent.ide',
    plan: 'PRO',           // Full access by default
    avatarUrl: null,
    createdAt: timestamp
}
```

The guest profile is persisted to `localStorage` under `oc_user`.

## Context API

```js
const { profile, isPro, isAuthenticated, loading, error, loginLocal, loginGoogle, loginEmail, logout } = useAuth();
```

| Property | Type | Description |
|----------|------|-------------|
| `profile` | `object|null` | User profile object |
| `isPro` | `boolean` | `true` if `profile.plan === 'PRO'` or `'TEAMS'` |
| `isAuthenticated` | `boolean` | `true` if profile exists |
| `loading` | `boolean` | Loading state (for stub async operations) |
| `error` | `string` | Last error message |

| Method | Purpose | Default Implementation |
|--------|---------|----------------------|
| `loginLocal({ displayName, email })` | Create/modify local profile | Works immediately |
| `loginGoogle()` | Google OAuth (stub) | Returns `{ success: false, error: 'Not configured' }` |
| `loginEmail(email, password)` | Email/password (stub) | Returns `{ success: false, error: 'Not configured' }` |
| `logout()` | Clear profile and reset to local | Resets to guest profile |

## Auth Flow

```
App mounts
    ↓
localStorage.getItem('oc_user')?
    ↓
Yes → restore profile
No  → create GUEST_PROFILE
    ↓
<AuthProvider> provides { profile, isPro, ... }
    ↓
Workspace checks: isAIConfigured() → YES (if any key stored)
                    ↓
              isPro → true (by default) → no usage limits
```

## Forking for Real Auth

Replace `loginGoogle` and `loginEmail` in `AuthContext.jsx` with your own provider (Firebase, Auth0, Supabase, etc.):

```js
const loginGoogle = useCallback(async () => {
    setLoading(true);
    try {
        const result = await yourAuthProvider.signInWithPopup();
        const user = result.user;
        setProfile({
            uid: user.uid,
            displayName: user.displayName,
            email: user.email,
            plan: 'FREE',  // or fetch from your backend
            avatarUrl: user.photoURL
        });
        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(profile));
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    } finally {
        setLoading(false);
    }
}, []);
```

## Usage in Components

```jsx
function Settings() {
    const { isAuthenticated, profile, logout } = useAuth();
    return (
        <div>
            <span>{profile?.displayName}</span>
            <span>{profile?.plan}</span>
            <button onClick={logout}>Log out</button>
        </div>
    );
}
```
