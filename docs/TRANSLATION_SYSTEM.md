# Translation System

OpenContent IDE ships English (`en`) and Spanish (`es`). The canonical invocation in a component is `useLanguage()` with `t('key')`.

## The tree is split across four files

This is the single most common source of confusion in this system, so it is stated first. There is no one file with all the strings.

| File | Shape | Top-level sections |
|------|-------|--------------------|
| `src/i18n/en.json` | JSON object | `app`, `landing`, `workspace`, `settings`, `auth`, `Agent`, `errors`, `common`, `pro`, `paywall`, `calendar`, `cli`, `agentic`, `setup`, `gallery`, `delivery` |
| `src/i18n/es.json` | JSON object | same structure |
| `src/i18n/artifactTranslations.js` | `{ en, es }` | `artifactStudio` |
| `src/i18n/uxTranslations.js` | `{ en, es }` | `landing`, `workspace`, `setup`, `library`, `ux`, `cliUx` |

The two modules export both languages because the sections they contribute are written as a pair, next to each other, so a copy can never drift from its translation by accident.

## Merge order

`src/i18n/index.js` builds one tree per language:

```js
const translations = {
    es: deepMerge(es, artifactTranslations.es, uxTranslations.es),
    en: deepMerge(en, artifactTranslations.en, uxTranslations.en)
};
```

`deepMerge` is recursive and **later layers win** for scalar values. Consequences:

- The JSON file is the base. The modules add and override.
- `uxTranslations` is merged last, so it overrides both `en.json`/`es.json` and `artifactTranslations`. It currently overrides four existing keys (`workspace.apiKeyRequiredTitle`, `workspace.apiKeyRequiredMessage`, `workspace.apiKeyRequiredOrOllama`, `workspace.model.noModelSelected`).
- `en.json` and `es.json` have **exact parity**: 693 leaf keys each, no key present in one and missing from the other. This is verified, not assumed.
- After merging, each language resolves to 862 leaf keys (693 from JSON + 54 from `artifactTranslations` + 115 net new from `uxTranslations`).

When adding a key that belongs to an artifact or UX section, add it to the module, not to the JSON file. Editing `en.json` for a key that `uxTranslations` also defines will silently have no effect.

## Files

| File | Responsibility |
|------|----------------|
| `src/i18n/index.js` | `t()`, `setLanguage()`, `getLanguage()`, `getSection()`, `getLanguages()`, `getBrowserLanguage()`, `deepMerge` |
| `src/i18n/en.json` / `es.json` | Base tree |
| `src/i18n/artifactTranslations.js` | Artifact Studio sections, both languages |
| `src/i18n/uxTranslations.js` | Landing / workspace / setup / library UX copy, both languages |
| `src/context/LanguageContext.jsx` | React state and `useLanguage()` |

## Usage in components

```jsx
import { useLanguage } from '../../context/LanguageContext';

function MyComponent() {
    const { t } = useLanguage();
    return <h1>{t('workspace.newProject')}</h1>;
}
```

The context exposes `t`, `language`, `languages` and `changeLanguage`.

## Dynamic values: interpolation is supported

`t()` accepts a second argument of variables. Placeholders use `{variableName}`:

```jsx
t('delivery.library.stateEmptyTitle', { state: t('delivery.states.draft') })
t('agentic.partialFailureNotice', { count: 3 })
```

`interpolate()` replaces every `{name}` for which `vars` has a key, and leaves an unknown `{name}` untouched rather than rendering `undefined`. Interpolation only runs when a variables object is passed, so a literal brace in a plain string is not rewritten.

Composition in the component is still the better choice when a sentence would need restructuring between languages. Interpolation is for inserting values, not for rearranging grammar.

## Non-component access

```js
import { t, setLanguage, getSection } from '../../i18n';

setLanguage('en');
t('common.close');
t('common.close', {}, 'es');          // explicit language
getSection('common');                 // whole section object
```

`t()` falls back to the current language, then to Spanish, and returns the key itself when a key does not resolve. Services that produce user-visible text are given `t` as a parameter instead of importing it, so they stay free of language state.

## Verification

Every literal `t('…')` call in `src/` resolves to a string in both merged trees. Verified across the 130 `.js`/`.jsx` files under `src/`. The only non-string hits are `landing.placeholderHints`, which is an array read through `getSection`, and a deliberately missing key inside `src/i18n/index.test.js`.

## Adding a string

1. Decide which file owns the section: JSON base, `artifactTranslations.js` or `uxTranslations.js`.
2. Add the key to **both** languages in that file.
3. Use `t('your.new.key')` in the component. No hardcoded user-facing strings in JSX.
4. Keep the key tree in exact parity between languages.

## Key naming

Dot notation grouped by feature: `<feature>.<subgroup>.<key>`.

- `workspace.newProject`
- `workspace.actions.export`
- `delivery.states.in-review`
- `errors.network`

Delivery state values are machine identifiers, so a key can contain a hyphen (`delivery.states.in-review`). Lookup is plain property access and does not care.

## Arrays

Some keys hold arrays, such as `landing.placeholderHints`. `t()` returns the key for a non-string value; read those through `getSection`. Keep the array shape and length identical across languages.

## Adding a language

A language is four files: `<code>.json`, its `<code>.json` sibling, and a matching `{ en, <code> }` pair in each module.

1. Copy `en.json` to `<code>.json` and translate it.
2. Translate `en` in `artifactTranslations.js` to `<code>`.
3. Translate `en` in `uxTranslations.js` to `<code>`.
4. Import and add to the `translations` object in `index.js`.
5. Add the entry to `getLanguages()`.

Skipping step 2 or 3 leaves that module's sections absent from the new language; `deepMerge` will not invent them.

## Avoid

- Hardcoded strings in components.
- A key present in one language and missing from another.
- Using a translation key as user-facing fallback text.
- Adding a key to `en.json` that a later merge layer already defines.