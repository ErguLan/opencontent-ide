# Contributing to OpenContent IDE

Thanks for your interest in contributing!

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/opencontent-ide.git`
3. Install dependencies: `npm install`
4. Copy `.env.example` to `.env` and add your API keys
5. Run the dev server: `npm run dev`

## Code Style

- Use vanilla CSS (no Tailwind, no CSS-in-JS)
- Use the CSS variables defined in `src/styles/variables.css`
- Keep components focused and small
- Use the existing i18n system for all user-facing text
- No emojis in the frontend UI (use icon components instead)

## Adding a Skill / Persona

Edit `src/data/skills.json` and add a new entry:

```json
{
  "id": "your-skill-id",
  "name": "Your Skill Name",
  "nameEs": "Nombre en Espanol",
  "systemPrompt": "You are a..."
}
```

## Adding an AI Provider

Edit `src/services/ai/index.js` and add a new provider function following the existing pattern.

## Pull Requests

- Create a feature branch from `main`
- Write clear commit messages
- Test your changes locally before submitting
- Keep PRs focused on a single feature or fix

## Reporting Issues

Use GitHub Issues. Include:
- Steps to reproduce
- Expected vs actual behavior
- Browser and OS info
- Console errors (if any)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
