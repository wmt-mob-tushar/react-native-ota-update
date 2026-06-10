# Contributing

Thanks for your interest in improving the **React Native OTA Update Platform**! Contributions of all kinds are welcome — bug reports, docs, features, and fixes.

## Ways to contribute

- 🐛 **Report a bug** — open an [issue](https://github.com/wmt-mob-tushar/react-native-ota-update/issues) with steps to reproduce.
- 💡 **Suggest a feature** — open an issue describing the use case.
- 📖 **Improve docs** — the docs live in [`docs-site/`](./docs-site) and auto-deploy to Vercel.
- 🔧 **Send a pull request** — see the workflow below.

## Project layout

| Path | What it is |
|------|------------|
| `supabase/` | Migrations + edge functions (Deno/TS) |
| `packages/sdk/` | `@ota-platform/sdk` — RN SDK + Android/iOS native modules |
| `packages/cli/` | `ota-cli` |
| `apps/dashboard/` | Next.js 14 admin panel |
| `apps/demo-app/` | RN 0.74 reference app |
| `docs-site/` | Docusaurus documentation |

## Development setup

```bash
git clone https://github.com/wmt-mob-tushar/react-native-ota-update.git
cd react-native-ota-update
npm install

# Typecheck / build a package
npm run build --workspace=packages/cli
npx tsc --noEmit            # in packages/sdk or apps/demo-app
npm run dev                 # in apps/dashboard  → http://localhost:3001
npm start                   # in docs-site       → http://localhost:3000
```

See [`INSTRUCTIONS.md`](./INSTRUCTIONS.md) for the full backend + device setup.

## Pull request workflow

1. **Fork** the repo and create a branch from `main`:
   - `feat/<short-name>` for features
   - `fix/<short-name>` for bug fixes
   - `docs/<short-name>` for documentation
2. Make your change. Keep it focused — one logical change per PR.
3. Make sure it builds: the **CI workflow** typechecks the SDK and builds the CLI + dashboard on every push/PR.
4. Use clear, conventional commit messages (e.g. `fix: re-read bundle path on cold start`).
5. Open a PR against `main` with a short description of *what* and *why*.

## Coding conventions

- **TypeScript** across SDK, CLI, dashboard, and docs.
- Match the style of the surrounding code (naming, comment density, idioms).
- SDK changes that touch native behaviour should keep the Android (`OTAModule.java`) and iOS (`OTAModule.m`) modules in sync.
- Database changes go in a **new, idempotent migration** under `supabase/migrations/` — never edit an applied migration.

## Reporting security issues

Please do **not** open a public issue for security vulnerabilities. Email **tusharkumarp@webmobtech.com** instead.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](./LICENSE).
