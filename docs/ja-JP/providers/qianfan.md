---
summary: "Qianfanの統合APIを使用してOpenClawで多数のモデルにアクセスする"
read_when:
  - 多数のLLMに単一のAPIキーでアクセスしたい場合
  - Baidu Qianfanのセットアップガイダンスが必要な場合
title: "Qianfan"
x-i18n:
  source_path: "docs/providers/qianfan.md"
  generated_at: "2026-03-05T10:01:00Z"
  model: "claude-opus-4-6"
  provider: "pi"
---

# Qianfan プロバイダーガイド

Qianfanは百度（Baidu）のMaaSプラットフォームで、単一のエンドポイントとAPIキーで多数のモデルにリクエストをルーティングする**統合API**を提供します。OpenAI互換のため、ほとんどのOpenAI SDKはベースURLを切り替えるだけで動作します。

## 前提条件

1. Qianfan APIアクセスが有効な百度クラウドアカウント
2. Qianfanコンソールから取得したAPIキー
3. システムにインストール済みのOpenClaw

## APIキーの取得方法

1. [Qianfanコンソール](https://console.bce.baidu.com/qianfan/ais/console/apiKey)にアクセス
2. 新しいアプリケーションを作成するか、既存のアプリケーションを選択
3. APIキーを生成（形式: `bce-v3/ALTAK-...`）
4. OpenClawで使用するためにAPIキーをコピー

## CLIセットアップ

```bash
openclaw onboard --auth-choice qianfan-api-key
```

## 関連ドキュメント

- [OpenClaw設定](/gateway/configuration)
- [モデルプロバイダー](/concepts/model-providers)
- [エージェントセットアップ](/concepts/agent)
- [Qianfan APIドキュメント](https://cloud.baidu.com/doc/qianfan-api/s/3m7of64lb)
