---
summary: "OpenCode Zen（厳選モデル）をOpenClawで使用する"
read_when:
  - OpenCode Zenでモデルアクセスを利用したい場合
  - コーディング向けに厳選されたモデル一覧が必要な場合
title: "OpenCode Zen"
x-i18n:
  source_path: "docs/providers/opencode.md"
  generated_at: "2026-03-05T10:01:00Z"
  model: "claude-opus-4-6"
  provider: "pi"
---

# OpenCode Zen

OpenCode Zenは、OpenCodeチームがコーディングエージェント向けに推奨する**厳選されたモデル一覧**です。
APIキーと `opencode` プロバイダーを使用する、オプションのホスト型モデルアクセスパスです。
Zenは現在ベータ版です。

## CLIセットアップ

```bash
openclaw onboard --auth-choice opencode-zen
# または非対話式
openclaw onboard --opencode-zen-api-key "$OPENCODE_API_KEY"
```

## 設定スニペット

```json5
{
  env: { OPENCODE_API_KEY: "sk-..." },
  agents: { defaults: { model: { primary: "opencode/claude-opus-4-6" } } },
}
```

## 備考

- `OPENCODE_ZEN_API_KEY` もサポートされています。
- Zenにサインインし、請求先情報を追加して、APIキーをコピーします。
- OpenCode Zenはリクエストごとに課金されます。詳細はOpenCodeダッシュボードをご確認ください。
