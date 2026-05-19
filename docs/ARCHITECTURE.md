# Architecture

## Overview

OpenContent IDE is a local-first, AI-powered content creation studio built with React + Vite. It requires no server — everything runs in the browser with IndexedDB for persistence.

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 7 |
| Styling | Vanilla CSS with variables |
| Routing | React Router DOM |
| Storage | IndexedDB (projects + media) |
| AI | OpenRouter, Gemini, Ollama |
| i18n | Custom JSON-based system |

## Data Flow

```
User Prompt → Skill (System Prompt) → AI Provider → Response → Canvas
                                          ↑
                                    OpenRouter / Gemini / Ollama
```

## Key Directories

- `src/config/` — Constants, feature flags
- `src/context/` — React contexts (Auth, Theme, Language)
- `src/data/` — Skills/personas definitions
- `src/services/ai/` — AI provider logic (send, analyze, generate)
- `src/services/` — Local storage (projects, media, metrics)
- `src/features/` — Page components (Landing, Workspace, Settings)
- `src/components/` — Shared UI components

## AI Provider Architecture

The AI service (`services/ai/index.js`) supports three providers:

1. **OpenRouter** — Default cloud provider (200+ models)
2. **Gemini** — Google's API for image generation
3. **Ollama** — Local models, no API key needed

Provider is detected automatically:
- Model IDs with `/` (e.g., `nvidia/nemotron-nano`) → OpenRouter
- Model IDs without `/` (e.g., `llama3`) → Ollama

## Skills System

Skills are AI personas stored in `src/data/skills.json`. Each skill defines a `systemPrompt` that shapes the AI's behavior. Users can switch skills at any time and create custom ones.

## Auth

By default, the app auto-logs in as "Local User" with full (PRO) access. No server needed. Auth is implemented as a context provider that can be extended for real authentication if needed.

## Usage Limits

Disabled by default. Set `VITE_ENABLE_USAGE_LIMITS=true` in `.env` to activate freemium limits (for SaaS forks).
