---
summary: "Real-world workspace configurations for common agent setups — dev, social media, growth, and multi-agent teams"
read_when:
  - Setting up a new agent workspace
  - Looking for SOUL.md and AGENTS.md examples
  - Configuring multi-agent teams
  - Building specialized agents (dev, social, growth)
title: "Workspace Examples"
---

# Workspace Examples

Practical workspace configurations for common OpenClaw agent setups.
For workspace basics, see [Agent Workspace](/concepts/agent-workspace).

---

## Single Agent (Personal Assistant)

The simplest setup — one agent handling everything.

```
~/.openclaw/workspace/
├── SOUL.md          # Persona and tone
├── AGENTS.md        # Operating instructions
├── USER.md          # About you
├── IDENTITY.md      # Agent name and emoji
├── TOOLS.md         # Local tool notes
├── HEARTBEAT.md     # Periodic checks
└── memory/
    └── YYYY-MM-DD.md
```

### SOUL.md (personal assistant)

```markdown
# SOUL.md

You are a helpful, proactive personal assistant. You communicate
clearly and concisely. You remember context from past conversations
and anticipate needs.

## Tone

- Direct and efficient
- Friendly but professional
- Use the user's preferred language
```

---

## Dev Agent

A coding-focused agent that manages repositories, reviews code, and deploys.

```
~/agents/dev/
├── SOUL.md
├── AGENTS.md
├── TOOLS.md        # CLI tools, repo locations, deploy commands
├── HEARTBEAT.md    # CI/CD monitoring
└── memory/
    ├── bugs.md
    ├── tech-debt.md
    └── YYYY-MM-DD.md
```

### AGENTS.md (dev)

```markdown
# AGENTS.md - Dev Agent

## Workflow

1. Always `git pull` before making changes
2. Use Claude Code in tmux for complex tasks
3. Get approval before pushing to production
4. Log all deployments to memory

## Code Quality

- Run linter before committing
- No console.log in production
- Clear commit messages
- Update docs when changing APIs

## Project Locations

- Main project: ~/project
- Staging: ~/project-staging
```

### HEARTBEAT.md (dev)

```markdown
# HEARTBEAT.md

## Check CI/CD

- Monitor GitHub Actions for failures
- Check deployment status

## Check queues

- Look for pending tasks in ~/agents/shared/queue/
```

---

## Social Media Agent

An agent dedicated to content creation and social posting.

```
~/agents/social/
├── SOUL.md
├── AGENTS.md
├── TOOLS.md         # xurl setup, browser automation notes
├── HEARTBEAT.md     # Engagement monitoring
└── memory/
    ├── post-log.md  # Track all posts
    ├── analytics.md # Performance data
    └── YYYY-MM-DD.md
```

### SOUL.md (social)

```markdown
# SOUL.md - Social Media Agent

You manage social media presence across X (Twitter) and other platforms.

## Content Voice

- Knowledgeable but approachable
- Use data and examples to support claims
- Engage authentically with the community
- Never be spammy or overly promotional

## Posting Rules

- X: max 3 posts/day, space them out
- Always check mentions before posting
- Respond to genuine questions within 4 hours
- Never engage with trolls
```

### AGENTS.md (social)

```markdown
# AGENTS.md - Social Media Agent

## X (Twitter) Posting

1. Check trending topics (web_search)
2. Draft post aligned with brand voice
3. Post with `xurl post "text"`
4. Log post ID and text to memory/post-log.md
5. If posting media, upload first with `xurl media upload`

## Engagement

- Check mentions: `xurl mentions -n 20`
- Like positive mentions: `xurl like POST_ID`
- Reply to questions: `xurl reply POST_ID "response"`

## Content Calendar

- Mon/Wed/Fri: Industry insights
- Tue/Thu: Product updates or tips
- Weekend: Community engagement only

## Tools

- xurl: X API CLI (must be pre-authenticated)
- browser: For platforms without APIs (Xiaohongshu, Instagram)
```

---

## Growth / SEO Agent

An agent focused on SEO, analytics, and growth tasks.

```
~/agents/growth/
├── SOUL.md
├── AGENTS.md
├── HEARTBEAT.md     # Metric checks, backlink monitoring
└── memory/
    ├── daily-metrics.json
    ├── backlink-progress.md
    ├── experiments.md
    └── YYYY-MM-DD.md
```

### HEARTBEAT.md (growth)

```markdown
# HEARTBEAT.md

## Daily Checks

- Monitor site traffic and keyword rankings
- Check for new backlink opportunities
- Review SEO queue for pending keywords

## Weekly

- Generate performance report
- Identify new keyword opportunities
- Update experiment tracking
```

---

## Multi-Agent Team

Multiple agents sharing a Gateway, with a shared directory for communication.

### Gateway config

```json5
{
  agents: {
    dev: { workspace: "~/agents/dev" },
    social: { workspace: "~/agents/social" },
    growth: { workspace: "~/agents/growth" },
  },
}
```

### Shared directory

```
~/agents/shared/
├── seo-queue/
│   ├── pending.json     # Growth adds keywords
│   └── completed.json   # Dev marks completed
├── content-queue/
│   ├── drafts/          # Content agent writes drafts
│   └── published/       # Social agent moves after posting
└── brand/
    └── guidelines.md    # Shared brand voice
```

### Inter-agent communication

Agents communicate through:

1. **Shared files**: write to `~/agents/shared/` for async coordination
2. **sessions_send**: send direct messages between agent sessions
3. **Cron triggers**: schedule tasks that trigger specific agents

Example — growth agent requests a new SEO page:

```json
// ~/agents/shared/seo-queue/pending.json
[
  {
    "keyword": "Veo 3",
    "slug": "veo-3",
    "description": "Google's latest video AI model",
    "addedBy": "growth",
    "addedAt": "2026-03-01"
  }
]
```

Dev agent picks it up during heartbeat, creates the page, and moves it to
`completed.json`.

---

## Tips

- **Start simple**: begin with a single agent, split into multi-agent when workflows get complex
- **Memory discipline**: log important actions to daily memory files
- **HEARTBEAT.md**: keep it short — every line costs tokens on each heartbeat
- **Shared directories**: use JSON files for structured data, markdown for human-readable notes
- **Version control**: git-track your workspace files (exclude `memory/` if it grows large)

---

## See Also

- [Agent workspace](/concepts/agent-workspace) — file map and locations
- [Multi-agent routing](/concepts/multi-agent) — configuring multiple agents
- [Cron jobs](/automation/cron-jobs) — scheduling agent tasks
