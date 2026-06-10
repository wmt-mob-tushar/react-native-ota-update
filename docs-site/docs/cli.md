---
id: cli
title: CLI Reference
sidebar_position: 11
---

# CLI Reference

`ota-cli` builds, uploads, and manages releases. Run it from your React Native project directory.

```bash
npx ota-cli <command> [options]
```

Credentials are stored under `~/.config/ota-cli-nodejs/auth.json`. The publishable (anon) key is resolved from your login, `.ota-config.json`, or the `OTA_SUPABASE_ANON_KEY` environment variable — the CLI never needs the service-role key.

## Commands

| Command | Description |
|---------|-------------|
| `login` | Authenticate (email + password + publishable key) |
| `logout` | Clear stored credentials |
| `init` | Link the current directory to an app → `.ota-config.json` |
| `apps:list` | List applications you can access + API keys |
| `release` | Build → upload → create a release |
| `rollout` | Set rollout %, pause, or resume |
| `rollback` | Roll back to the previous (or a specific) bundle |
| `channel:create` / `channel:list` | Manage channels |
| `releases:list` | List bundles |
| `analytics` | Adoption / crash summary |

## `login`

```bash
ota-cli login -e you@example.com -k sb_publishable_xxx
```

| Flag | Description |
|------|-------------|
| `-e, --email` | Email |
| `-p, --password` | Password (prefer the prompt) |
| `-k, --anon-key` | Supabase publishable key (or set `OTA_SUPABASE_ANON_KEY`) |

## `release`

```bash
ota-cli release -p android --runtime 1.0.0 --message "Bug fixes"

ota-cli release -p ios -c beta --rollout 25 --hermes \
  --semver 1.4.0 --message "Dark mode"
```

| Flag | Default | Description |
|------|---------|-------------|
| `-p, --platform` | `both` | `ios` / `android` / `both` |
| `-c, --channel` | `production` | Target channel |
| `--runtime <v>` | from `package.json` | Native binary version (match the SDK `runtimeVersion`) |
| `--hermes` | `false` | Compile to Hermes bytecode |
| `--force` | `false` | Mark as a forced update |
| `--semver <v>` | — | Human-readable version |
| `--message <t>` | — | Release notes |
| `--rollout <n>` | `100` | Rollout percentage (0–100) |
| `--entry <f>` | `index.js` | RN entry file |
| `--dry-run` | `false` | Build only, no upload |

What it does: `react-native bundle` → optional Hermes → zip → SHA-256 → upload → `create-release` (which re-verifies the hash server-side) → bundle + deployment + rollout rows.

## `rollout`

```bash
ota-cli rollout -c production -p android --percent 50
ota-cli rollout -c production -p android --pause
ota-cli rollout -c production -p android --resume
```

## `rollback`

```bash
ota-cli rollback -c production -p android --runtime 1.0.0
ota-cli rollback -c production -p android --runtime 1.0.0 --to-bundle <id> --reason "regression"
```
