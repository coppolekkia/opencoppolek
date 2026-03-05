---
name: gws
description: Official Google Workspace CLI for Drive, Gmail, Calendar, Sheets, Docs, Chat, Admin, and other Workspace APIs with structured JSON output.
homepage: https://github.com/googleworkspace/cli
metadata:
  {
    "openclaw":
      {
        "emoji": "🧰",
        "requires": { "bins": ["gws"] },
        "install":
          [
            {
              "id": "npm",
              "kind": "npm",
              "package": "@googleworkspace/cli",
              "bins": ["gws"],
              "label": "Install gws (npm)",
            },
          ],
      },
  }
---

# gws

Use `gws` for Google Workspace APIs from one CLI with JSON-friendly output.

Quick start

- `npm install -g @googleworkspace/cli`
- `gws auth setup`
- `gws drive files list --params '{"pageSize": 5}'`

Authentication

- First-time guided setup: `gws auth setup`
- Login after setup: `gws auth login`
- Export creds for headless/CI: `gws auth export --unmasked > credentials.json`
- Use exported creds in CI/server: `export GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE=/path/to/credentials.json`

Common commands

- Drive files list: `gws drive files list --params '{"pageSize": 10}'`
- Create spreadsheet: `gws sheets spreadsheets create --json '{"properties":{"title":"Q1 Budget"}}'`
- Chat message (dry run): `gws chat spaces messages create --params '{"parent":"spaces/xyz"}' --json '{"text":"Deploy complete."}' --dry-run`
- Method schema lookup: `gws schema drive.files.list`
- Paginate all pages: `gws drive files list --params '{"pageSize": 100}' --page-all`

Notes

- Command surface is discovery-driven and can evolve as Google APIs change.
- Prefer `--dry-run` before create/update/delete operations.
- Confirm before sending messages or mutating Workspace resources.
