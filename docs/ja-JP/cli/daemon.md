---
summary: "`openclaw daemon`のCLIリファレンス（ゲートウェイサービス管理のレガシーエイリアス）"
read_when:
  - スクリプトでまだ`openclaw daemon ...`を使用している
  - サービスライフサイクルコマンド（install/start/stop/restart/status）が必要
title: "daemon"
x-i18n:
  source_path: "docs/cli/daemon.md"
  generated_at: "2026-03-05T10:01:00Z"
  model: "claude-opus-4-6"
  provider: "pi"
---

# `openclaw daemon`

ゲートウェイサービス管理コマンドのレガシーエイリアスです。

`openclaw daemon ...`は`openclaw gateway ...`のサービス制御コマンドと同じ機能にマッピングされます。

## 使い方

```bash
openclaw daemon status
openclaw daemon install
openclaw daemon start
openclaw daemon stop
openclaw daemon restart
openclaw daemon uninstall
```

## サブコマンド

- `status`: サービスのインストール状態を表示し、ゲートウェイの健全性を確認
- `install`: サービスをインストール（`launchd`/`systemd`/`schtasks`）
- `uninstall`: サービスを削除
- `start`: サービスを開始
- `stop`: サービスを停止
- `restart`: サービスを再起動

## 共通オプション

- `status`: `--url`、`--token`、`--password`、`--timeout`、`--no-probe`、`--deep`、`--json`
- `install`: `--port`、`--runtime <node|bun>`、`--token`、`--force`、`--json`
- ライフサイクル（`uninstall|start|stop|restart`）: `--json`

## 推奨

現在のドキュメントと使用例については[`openclaw gateway`](/cli/gateway)を使用してください。
