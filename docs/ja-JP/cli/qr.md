---
summary: "`openclaw qr`のCLIリファレンス（iOSペアリング用QRコードとセットアップコードの生成）"
read_when:
  - iOSアプリをゲートウェイと素早くペアリングしたい
  - リモート/手動共有用のセットアップコード出力が必要
title: "qr"
x-i18n:
  source_path: "docs/cli/qr.md"
  generated_at: "2026-03-05T10:01:00Z"
  model: "claude-opus-4-6"
  provider: "pi"
---

# `openclaw qr`

現在のゲートウェイ設定からiOSペアリング用のQRコードとセットアップコードを生成します。

## 使い方

```bash
openclaw qr
openclaw qr --setup-code-only
openclaw qr --json
openclaw qr --remote
openclaw qr --url wss://gateway.example/ws --token '<token>'
```

## オプション

- `--remote`: 設定から`gateway.remote.url`とリモートトークン/パスワードを使用
- `--url <url>`: ペイロードで使用するゲートウェイURLを上書き
- `--public-url <url>`: ペイロードで使用するパブリックURLを上書き
- `--token <token>`: ペイロード用のゲートウェイトークンを上書き
- `--password <password>`: ペイロード用のゲートウェイパスワードを上書き
- `--setup-code-only`: セットアップコードのみを出力
- `--no-ascii`: ASCII QRレンダリングをスキップ
- `--json`: JSON出力（`setupCode`、`gatewayUrl`、`auth`、`urlSource`）

## 備考

- `--token`と`--password`は排他的です（同時に使用できません）。
- `--remote`使用時、有効なリモート認証情報がSecretRefとして設定されており、`--token`や`--password`を渡さない場合、コマンドはアクティブなゲートウェイスナップショットから解決します。ゲートウェイが利用できない場合、コマンドは即座に失敗します。
- `--remote`なしの場合、パスワード認証が優先される場合（明示的な`gateway.auth.mode="password"`、またはトークンなしで推定されるパスワードモード）にローカルの`gateway.auth.password` SecretRefが解決され、CLIの認証上書きは渡されません。
- ゲートウェイバージョンの互換性に関する注意：このコマンドパスは`secrets.resolve`をサポートするゲートウェイが必要です。古いゲートウェイはunknown-methodエラーを返します。
- スキャン後、以下のコマンドでデバイスのペアリングを承認してください：
  - `openclaw devices list`
  - `openclaw devices approve <requestId>`
