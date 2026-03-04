---
summary: "Gateway、チャネル、自動化、ノード、ブラウザの詳細なトラブルシューティングランブック"
read_when:
  - トラブルシューティングハブからここに誘導された場合
  - 正確なコマンドを含む安定した症状ベースのランブックセクションが必要な場合
title: "トラブルシューティング"
x-i18n:
  generated_at: "2026-03-04T06:16:36Z"
  model: claude-opus-4-6
  provider: anthropic
  source_hash: 2016d75d24ea86d982fa11bbe05f8506d41dd1defbef8f3cf9864664fb01ecc4
  source_path: gateway/troubleshooting.md
  workflow: 15
---

# Gatewayトラブルシューティング

このページは詳細なランブックです。
まずクイックトリアージフローを確認したい場合は、[/help/troubleshooting](/help/troubleshooting)から始めてください。

## コマンドラダー

まず、以下の順序でこれらを実行してください：

```bash
openclaw status
openclaw gateway status
openclaw logs --follow
openclaw doctor
openclaw channels status --probe
```

期待される正常なシグナル：

- `openclaw gateway status`が`Runtime: running`と`RPC probe: ok`を表示する。
- `openclaw doctor`がブロッキングな設定/サービスの問題を報告しない。
- `openclaw channels status --probe`が接続済み/準備完了のチャネルを表示する。

## Anthropic 429 ロングコンテキストに追加使用量が必要

ログ/エラーに以下が含まれる場合に使用してください：
`HTTP 429: rate_limit_error: Extra usage is required for long context requests`

```bash
openclaw logs --follow
openclaw models status
openclaw config get agents.defaults.models
```

確認事項：

- 選択したAnthropicのOpus/Sonnetモデルに`params.context1m: true`が設定されている。
- 現在のAnthropic認証情報がロングコンテキスト使用の対象外である。
- 1Mベータパスが必要な長いセッション/モデル実行でのみリクエストが失敗する。

修正オプション：

1. そのモデルの`context1m`を無効にして、通常のコンテキストウィンドウにフォールバックする。
2. 課金が有効なAnthropic APIキーを使用するか、サブスクリプションアカウントでAnthropic Extra Usageを有効にする。
3. Anthropicのロングコンテキストリクエストが拒否された場合に実行を継続できるよう、フォールバックモデルを設定する。

関連：

- [/providers/anthropic](/providers/anthropic)
- [/reference/token-use](/reference/token-use)
- [/help/faq#why-am-i-seeing-http-429-ratelimiterror-from-anthropic](/help/faq#why-am-i-seeing-http-429-ratelimiterror-from-anthropic)

## 応答なし

チャネルは稼働しているが何も応答しない場合、再接続の前にルーティングとポリシーを確認してください。

```bash
openclaw status
openclaw channels status --probe
openclaw pairing list --channel <channel> [--account <id>]
openclaw config get channels
openclaw logs --follow
```

確認事項：

- DM送信者のペアリングが保留中。
- グループメンションゲーティング（`requireMention`、`mentionPatterns`）。
- チャネル/グループ許可リストの不一致。

一般的なシグネチャ：

- `drop guild message (mention required` → メンションされるまでグループメッセージが無視される。
- `pairing request` → 送信者の承認が必要。
- `blocked` / `allowlist` → 送信者/チャネルがポリシーによりフィルタリングされた。

関連：

- [/channels/troubleshooting](/channels/troubleshooting)
- [/channels/pairing](/channels/pairing)
- [/channels/groups](/channels/groups)

## ダッシュボード Control UIの接続性

ダッシュボード/Control UIが接続できない場合、URL、認証モード、セキュアコンテキストの前提条件を検証してください。

```bash
openclaw gateway status
openclaw status
openclaw logs --follow
openclaw doctor
openclaw gateway status --json
```

確認事項：

- 正しいプローブURLとダッシュボードURL。
- クライアントとGateway間の認証モード/トークンの不一致。
- デバイスIDが必要な場面でのHTTP使用。

一般的なシグネチャ：

- `device identity required` → 非セキュアコンテキストまたはデバイス認証の欠如。
- `device nonce required` / `device nonce mismatch` → クライアントがチャレンジベースのデバイス認証フロー（`connect.challenge` + `device.nonce`）を完了していない。
- `device signature invalid` / `device signature expired` → クライアントが現在のハンドシェイクに対して間違ったペイロード（またはタイムスタンプが古い）に署名した。
- `unauthorized` / 再接続ループ → トークン/パスワードの不一致。
- `gateway connect failed:` → ホスト/ポート/URLターゲットが間違っている。

デバイス認証v2移行チェック：

```bash
openclaw --version
openclaw doctor
openclaw gateway status
```

ログにnonce/署名エラーが表示される場合、接続クライアントを更新し、以下を確認してください：

1. `connect.challenge`を待機する
2. チャレンジバウンドペイロードに署名する
3. 同じチャレンジnonceで`connect.params.device.nonce`を送信する

関連：

- [/web/control-ui](/web/control-ui)
- [/gateway/authentication](/gateway/authentication)
- [/gateway/remote](/gateway/remote)

## Gatewayサービスが実行されていない

サービスはインストールされているがプロセスが起動し続けない場合に使用してください。

```bash
openclaw gateway status
openclaw status
openclaw logs --follow
openclaw doctor
openclaw gateway status --deep
```

確認事項：

- 終了ヒント付きの`Runtime: stopped`。
- サービス設定の不一致（`Config (cli)` vs `Config (service)`）。
- ポート/リスナーの競合。

一般的なシグネチャ：

- `Gateway start blocked: set gateway.mode=local` → ローカルGatewayモードが有効になっていない。修正：設定で`gateway.mode="local"`を設定する（または`openclaw configure`を実行する）。専用の`openclaw`ユーザーでPodman経由でOpenClawを実行している場合、設定は`~openclaw/.openclaw/openclaw.json`にあります。
- `refusing to bind gateway ... without auth` → 認証なしでの非ループバックバインド。
- `another gateway instance is already listening` / `EADDRINUSE` → ポート競合。

関連：

- [/gateway/background-process](/gateway/background-process)
- [/gateway/configuration](/gateway/configuration)
- [/gateway/doctor](/gateway/doctor)

## チャネル接続済みだがメッセージが流れない

チャネルの状態は接続済みだがメッセージフローが停止している場合、ポリシー、権限、チャネル固有の配信ルールに注目してください。

```bash
openclaw channels status --probe
openclaw pairing list --channel <channel> [--account <id>]
openclaw status --deep
openclaw logs --follow
openclaw config get channels
```

確認事項：

- DMポリシー（`pairing`、`allowlist`、`open`、`disabled`）。
- グループ許可リストとメンション要件。
- チャネルAPIの権限/スコープの欠如。

一般的なシグネチャ：

- `mention required` → グループメンションポリシーによりメッセージが無視された。
- `pairing` / 承認保留中のトレース → 送信者が承認されていない。
- `missing_scope`、`not_in_channel`、`Forbidden`、`401/403` → チャネルの認証/権限の問題。

関連：

- [/channels/troubleshooting](/channels/troubleshooting)
- [/channels/whatsapp](/channels/whatsapp)
- [/channels/telegram](/channels/telegram)
- [/channels/discord](/channels/discord)

## Cronとハートビートの配信

Cronまたはハートビートが実行されなかった、または配信されなかった場合、まずスケジューラの状態を確認し、次に配信先を確認してください。

```bash
openclaw cron status
openclaw cron list
openclaw cron runs --id <jobId> --limit 20
openclaw system heartbeat last
openclaw logs --follow
```

確認事項：

- Cronが有効で次のウェイクが存在する。
- ジョブ実行履歴のステータス（`ok`、`skipped`、`error`）。
- ハートビートスキップの理由（`quiet-hours`、`requests-in-flight`、`alerts-disabled`）。

一般的なシグネチャ：

- `cron: scheduler disabled; jobs will not run automatically` → Cronが無効。
- `cron: timer tick failed` → スケジューラのtickが失敗；ファイル/ログ/ランタイムエラーを確認。
- `heartbeat skipped`（`reason=quiet-hours`）→ アクティブ時間枠外。
- `heartbeat: unknown accountId` → ハートビート配信先のアカウントIDが無効。
- `heartbeat skipped`（`reason=dm-blocked`）→ ハートビートターゲットがDMスタイルの宛先に解決されたが、`agents.defaults.heartbeat.directPolicy`（またはエージェントごとのオーバーライド）が`block`に設定されている。

関連：

- [/automation/troubleshooting](/automation/troubleshooting)
- [/automation/cron-jobs](/automation/cron-jobs)
- [/gateway/heartbeat](/gateway/heartbeat)

## ノードはペアリング済みだがツールが失敗する

ノードはペアリングされているがツールが失敗する場合、フォアグラウンド状態、権限、承認状態を切り分けてください。

```bash
openclaw nodes status
openclaw nodes describe --node <idOrNameOrIp>
openclaw approvals get --node <idOrNameOrIp>
openclaw logs --follow
openclaw status
```

確認事項：

- ノードがオンラインで期待される機能がある。
- カメラ/マイク/位置情報/画面のOS権限付与。
- 実行の承認と許可リストの状態。

一般的なシグネチャ：

- `NODE_BACKGROUND_UNAVAILABLE` → ノードアプリがフォアグラウンドである必要がある。
- `*_PERMISSION_REQUIRED` / `LOCATION_PERMISSION_REQUIRED` → OS権限が不足。
- `SYSTEM_RUN_DENIED: approval required` → 実行の承認が保留中。
- `SYSTEM_RUN_DENIED: allowlist miss` → コマンドが許可リストによりブロックされた。

関連：

- [/nodes/troubleshooting](/nodes/troubleshooting)
- [/nodes/index](/nodes/index)
- [/tools/exec-approvals](/tools/exec-approvals)

## ブラウザツールが失敗する

Gateway自体は正常だがブラウザツールのアクションが失敗する場合に使用してください。

```bash
openclaw browser status
openclaw browser start --browser-profile openclaw
openclaw browser profiles
openclaw logs --follow
openclaw doctor
```

確認事項：

- 有効なブラウザ実行ファイルのパス。
- CDPプロファイルの到達可能性。
- `profile="chrome"`のExtension Relayタブのアタッチ。

一般的なシグネチャ：

- `Failed to start Chrome CDP on port` → ブラウザプロセスの起動に失敗。
- `browser.executablePath not found` → 設定されたパスが無効。
- `Chrome extension relay is running, but no tab is connected` → Extension Relayがアタッチされていない。
- `Browser attachOnly is enabled ... not reachable` → アタッチ専用プロファイルに到達可能なターゲットがない。

関連：

- [/tools/browser-linux-troubleshooting](/tools/browser-linux-troubleshooting)
- [/tools/chrome-extension](/tools/chrome-extension)
- [/tools/browser](/tools/browser)

## アップグレード後に突然壊れた場合

アップグレード後の不具合のほとんどは、設定のドリフトまたはより厳格なデフォルトが適用されるようになったことが原因です。

### 1) 認証とURLオーバーライドの動作が変更された

```bash
openclaw gateway status
openclaw config get gateway.mode
openclaw config get gateway.remote.url
openclaw config get gateway.auth.mode
```

確認事項：

- `gateway.mode=remote`の場合、CLIコマンドがリモートを対象にしている可能性があるが、ローカルサービスは正常かもしれない。
- 明示的な`--url`呼び出しは保存された認証情報にフォールバックしない。

一般的なシグネチャ：

- `gateway connect failed:` → URLターゲットが間違っている。
- `unauthorized` → エンドポイントに到達可能だが認証が間違っている。

### 2) バインドと認証のガードレールがより厳格になった

```bash
openclaw config get gateway.bind
openclaw config get gateway.auth.token
openclaw gateway status
openclaw logs --follow
```

確認事項：

- 非ループバックバインド（`lan`、`tailnet`、`custom`）には認証の設定が必要。
- 古いキー（`gateway.token`）は`gateway.auth.token`の代わりにならない。

一般的なシグネチャ：

- `refusing to bind gateway ... without auth` → バインドと認証の不一致。
- `RPC probe: failed`（ランタイムは実行中）→ Gatewayは稼働しているが、現在の認証/URLではアクセスできない。

### 3) ペアリングとデバイスIDの状態が変更された

```bash
openclaw devices list
openclaw pairing list --channel <channel> [--account <id>]
openclaw logs --follow
openclaw doctor
```

確認事項：

- ダッシュボード/ノードのデバイス承認が保留中。
- ポリシーまたはID変更後のDMペアリング承認が保留中。

一般的なシグネチャ：

- `device identity required` → デバイス認証が満たされていない。
- `pairing required` → 送信者/デバイスの承認が必要。

チェック後もサービス設定とランタイムが一致しない場合、同じプロファイル/状態ディレクトリからサービスメタデータを再インストールしてください：

```bash
openclaw gateway install --force
openclaw gateway restart
```

関連：

- [/gateway/pairing](/gateway/pairing)
- [/gateway/authentication](/gateway/authentication)
- [/gateway/background-process](/gateway/background-process)
