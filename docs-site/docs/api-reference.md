---
id: api-reference
title: API Reference
sidebar_position: 13
---

# API Reference

Base URL: `https://<project>.supabase.co/functions/v1`

## Device endpoints

Authenticate with the `x-app-key: <app-api-key>` header.

### `POST /check-update`

```json
{
  "platform": "android",
  "channel": "production",
  "runtime_version": "1.0.0",
  "device_id": "unique-device-id",
  "current_bundle_id": "uuid-or-null",
  "app_version": "1.0.0",
  "os_version": "14"
}
```

**Response**

```json
{
  "status": "UPDATE",
  "bundle": {
    "id": "uuid",
    "version": 2,
    "semver": "1.4.0",
    "platform": "android",
    "file_hash": "sha256-hex",
    "file_size": 247692,
    "download_url": "https://...signed-url...",
    "should_force_update": false,
    "message": "Bug fixes"
  }
}
```

`status` is `UPDATE`, `ROLLBACK`, or `NONE` (no `bundle` when `NONE`).

### `POST /report-install`

```json
{
  "bundle_id": "uuid",
  "device_id": "unique-device-id",
  "platform": "android",
  "status": "installed",
  "app_version": "1.0.0",
  "error_message": null
}
```

### `POST /report-crash`

```json
{
  "device_id": "unique-device-id",
  "platform": "android",
  "fatal": true,
  "error_message": "TypeError: ...",
  "stack": "...",
  "bundle_id": "uuid",
  "app_version": "1.0.0",
  "metadata": { "crash_window": true }
}
```

## Operator endpoints

Authenticate with `Authorization: Bearer <supabase-jwt>`.

### `POST /create-release`

```json
{
  "application_id": "uuid",
  "channel": "production",
  "platform": "android",
  "runtime_version": "1.0.0",
  "storage_path": "slug/production/android/uuid/bundle.zip",
  "file_hash": "sha256-hex",
  "file_size": 247692,
  "semver": "1.4.0",
  "should_force_update": false,
  "message": "Bug fixes",
  "rollout_percentage": 100
}
```

### `POST /rollback-release`

```json
{
  "application_id": "uuid",
  "channel": "production",
  "platform": "android",
  "runtime_version": "1.0.0",
  "to_bundle_id": "uuid-or-null",
  "reason": "regression"
}
```

### `POST /list-releases`

```json
{ "application_id": "uuid", "channel": "production", "platform": "android", "limit": 20, "offset": 0 }
```

### `POST /analytics`

```json
{ "application_id": "uuid", "range": "7d", "bundle_id": "uuid-or-null" }
```

## Status & error codes

| Code | Meaning |
|------|---------|
| `200` | Success |
| `401` | Invalid app key or JWT |
| `403` | Insufficient role (RLS) |
| `429` | Rate limited (`Retry-After` header) |
