---
summary: "OpenClawがサポートするモデルプロバイダー（LLM）"
read_when:
  - モデルプロバイダーを選択したい場合
  - LLMの認証とモデル選択のクイックセットアップ例が必要な場合
title: "モデルプロバイダー クイックスタート"
x-i18n:
  source_path: docs/providers/models.md
  generated_at: "2026-03-05T10:01:00Z"
  model: claude-opus-4-6
  provider: pi
---

# モデルプロバイダー

OpenClawは多くのLLMプロバイダーを使用できます。プロバイダーを選択し、認証を行い、デフォルトモデルを `provider/model` の形式で設定してください。

## クイックスタート（2ステップ）

1. プロバイダーで認証します（通常は `openclaw onboard` 経由）。
2. デフォルトモデルを設定します：

```json5
{
  agents: { defaults: { model: { primary: "anthropic/claude-opus-4-6" } } },
}
```

## サポートされているプロバイダー（スターターセット）

- [OpenAI (API + Codex)](/providers/openai)
- [Anthropic (API + Claude Code CLI)](/providers/anthropic)
- [OpenRouter](/providers/openrouter)
- [Vercel AI Gateway](/providers/vercel-ai-gateway)
- [Cloudflare AI Gateway](/providers/cloudflare-ai-gateway)
- [Moonshot AI (Kimi + Kimi Coding)](/providers/moonshot)
- [Mistral](/providers/mistral)
- [Synthetic](/providers/synthetic)
- [OpenCode Zen](/providers/opencode)
- [Z.AI](/providers/zai)
- [GLM models](/providers/glm)
- [MiniMax](/providers/minimax)
- [Venice (Venice AI)](/providers/venice)
- [Amazon Bedrock](/providers/bedrock)
- [Qianfan](/providers/qianfan)

プロバイダーの完全なカタログ（xAI、Groq、Mistralなど）と高度な設定については、[モデルプロバイダー](/concepts/model-providers)を参照してください。
