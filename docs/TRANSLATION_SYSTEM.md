# Translation System

OpenContent IDE uses a simple JSON-based i18n system. It supports English (`en`) and Spanish (`es`) out of the box, but new languages can be added by creating a new JSON file and registering it in `src/i18n/index.js`.

## Files

- `src/i18n/index.js` — Translation loader, `t()` function, language list.
- `src/i18n/en.json` — English translations.
- `src/i18n/es.json` — Spanish translations.
- `src/context/LanguageContext.jsx` — Current language state and switching logic.

## How to use translations in components

```jsx
import { useLanguage } from '../context/LanguageContext';

function MyComponent() {
  const { t } = useLanguage();
  return <h1>{t('workspace.newProject')}</h1>;
}
```

## Key naming convention

Keys use dot notation grouped by feature:

```
<feature>.<subgroup>.<key>
```

Examples:

- `workspace.newProject`
- `workspace.actions.export`
- `settings.theme.dark`
- `errors.network`

## Adding a new string

1. Add the key to `src/i18n/en.json`.
2. Add the same key to `src/i18n/es.json`.
3. Use `t('your.new.key')` in the component.
4. Do not leave hardcoded strings in JSX.

## Adding a new language

1. Create `src/i18n/<lang>.json` copying the structure from `en.json`.
2. Register it in `src/i18n/index.js`:

```js
import fr from './fr.json';
const translations = { es, en, fr };
```

3. Add the language to `getLanguages()` in the same file.

## Dynamic values

The current system does not support interpolation. If you need dynamic values, compose strings in the component:

```jsx
<span>{t('workspace.projectCount')} {count}</span>
```

If interpolation becomes common, we can extend `t()` to accept a second `values` object.

## Arrays

Some keys contain arrays, such as `landing.placeholderHints`. Keep the same structure across all languages.

## Avoid

- Hardcoded strings in components.
- Adding a key to only one language.
- Using translation keys as user-facing fallback text.
