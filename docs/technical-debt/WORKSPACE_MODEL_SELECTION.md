# Workspace model selection cleanup

Status: deferred cleanup. Current behavior is safe; structural cleanup is still pending.

## Context

OpenContent now follows an explicit model-selection rule:

- the model registry starts empty;
- no GPT, Gemini, Seedream, Ollama, or other vendor model ID is injected by the application;
- stale model IDs saved in browser storage are cleared when they no longer exist in the registry;
- the empty option is represented as an explicit unselected placeholder;
- generation must not silently fall back to the first registered model.

## Remaining cleanup in `Workspace.jsx`

`Workspace.jsx` still contains legacy effects that react to an invalid model selection by assigning the first item returned by `getTextModelOptions()`, `getImageModelOptions()`, or `getVisionModelOptions()`.

The model-option services now intentionally return the **unselected placeholder as the first item**, so this legacy code currently resolves to an empty selection rather than silently selecting a real model. This makes the current product behavior compliant with the explicit-selection rule.

The legacy effect should still be removed/refactored when a verified checkout is available because the intent is misleading and makes the invariant depend on option ordering.

## Desired refactor

Replace the fallback-to-first-option effect with validation-only logic:

1. Read the selected ID.
2. Check whether that ID exists and has the required capability.
3. If invalid, set that selection to `null` / empty and clear its storage key.
4. Never assign another registered model automatically.
5. Keep text, vision, and image selection independent.
6. Add tests proving that deleting an active model leaves the corresponding capability unselected.

## Acceptance tests

- Fresh browser with an empty registry shows `No model selected`.
- Adding three models does not automatically activate any of them.
- Selecting a text model does not change image or vision selections.
- Removing the active text model leaves text unselected instead of selecting another model.
- A stale hardcoded/vendor ID in localStorage is cleared on load.
- Opening Workspace directly without a selected text model does not send a generation request; it asks the user to choose a model.

This debt is intentionally documented rather than hidden: the current behavior is safe, but the implementation should eventually express the invariant directly.