---
x-i18n:
  source_path: docs/auth-credential-semantics.md
  generated_at: "2026-03-05T10:01:00Z"
  model: claude-opus-4-6
  provider: pi
---

# 認証クレデンシャルのセマンティクス

このドキュメントでは、以下で使用される標準的なクレデンシャルの適格性と解決セマンティクスを定義します：

- `resolveAuthProfileOrder`
- `resolveApiKeyForProfile`
- `models status --probe`
- `doctor-auth`

目的は、選択時と実行時の動作を一致させることです。

## 安定した理由コード

- `ok`
- `missing_credential`
- `invalid_expires`
- `expired`
- `unresolved_ref`

## トークンクレデンシャル

トークンクレデンシャル（`type: "token"`）はインラインの `token` および/または `tokenRef` をサポートします。

### 適格性ルール

1. `token` と `tokenRef` の両方が存在しない場合、トークンプロファイルは不適格です。
2. `expires` はオプションです。
3. `expires` が存在する場合、`0` より大きい有限の数値である必要があります。
4. `expires` が無効な場合（`NaN`、`0`、負の値、非有限、または型が不正）、プロファイルは `invalid_expires` で不適格になります。
5. `expires` が過去の場合、プロファイルは `expired` で不適格になります。
6. `tokenRef` は `expires` の検証をバイパスしません。

### 解決ルール

1. リゾルバーのセマンティクスは、`expires` に関して適格性セマンティクスと一致します。
2. 適格なプロファイルの場合、トークンマテリアルはインライン値または `tokenRef` から解決できます。
3. 解決不可能な参照は `models status --probe` の出力で `unresolved_ref` を生成します。

## レガシー互換メッセージング

スクリプト互換性のため、probeエラーの最初の行は変更されません：

`Auth profile credentials are missing or expired.`

人間が読みやすい詳細と安定した理由コードは後続の行に追加される場合があります。
