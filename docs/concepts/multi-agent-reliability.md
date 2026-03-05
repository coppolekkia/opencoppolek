---
summary: "Reliability patterns for multi-agent setups based on the MAST failure taxonomy"
title: Multi-Agent Reliability Patterns
read_when:
  - Running multiple agents with subagent spawning
  - Debugging why subagents fail silently or produce wrong output
  - Designing agent SOUL.md rules for a fleet
status: active
---

# Multi-Agent Reliability Patterns

Running multiple agents introduces failure modes that don't exist in single-agent setups. This guide covers practical patterns to catch and prevent them, informed by the [MAST failure taxonomy](https://arxiv.org/abs/2503.13657) (UC Berkeley, 2025) which analyzed 1,600+ traces across seven multi-agent frameworks.

The taxonomy identifies 14 failure modes in three categories. Not all apply to OpenClaw's hub-and-spoke architecture (where a main agent orchestrates specialist subagents), but several do. This guide focuses on the ones that matter and what to do about them.

## The failure modes that hit hardest

### Incomplete verification (MAST FM-3.2)

The most impactful failure in practice: a subagent says "done" but the output is wrong or incomplete. The orchestrator forwards it without checking.

**Pattern: mandatory completion report**

Add a structured report format to each agent's `SOUL.md`:

```markdown
## Completion Report Format

Every task report must include:

- **What changed**: files, configs, or data modified
- **Evidence**: command output, file paths, test results
- **Confidence**: HIGH / MEDIUM / LOW with reasoning
- **Risks**: side effects, limitations, open questions (cannot be blank)
```

The key is making "Risks" mandatory. When agents must explicitly write "no risks found" instead of omitting the section, they're more likely to actually think about it.

### Reasoning-action mismatch (MAST FM-2.6)

An agent's reasoning says one thing but its actions do another. Common with code agents that claim to have edited a file but wrote to the wrong path, or research agents that summarize findings that contradict their sources.

**Pattern: evidence-based closure**

Don't accept "I did it" from subagents. Verify:

```markdown
## Orchestrator rule (AGENTS.md)

When a subagent reports completion:

1. Check if output files exist
2. Verify content matches the task
3. Run build/test if applicable
4. Only then report success to the user
```

For code agents specifically, require `git diff` output or test results as part of the completion report.

### Premature termination (MAST FM-3.1)

A subagent hits a context limit, encounters an error, or just stops before finishing. With OpenClaw's [subagent lifecycle hooks](/automation/hooks), you can detect this automatically.

**Pattern: exhaustion alerts**

If you use pickup tracking hooks, add an alert when retry budget is exhausted:

```markdown
When a subagent's pickup state reaches EXHAUSTED:

1. Inject alert to main session
2. Notify user that manual intervention may be needed
3. Suggest re-spawning with a narrower scope
```

OpenClaw's `subagent:complete`, `subagent:timeout`, and `subagent:killed` events ([#24925](https://github.com/openclaw/openclaw/pull/24925), in review) will provide these signals natively. Until that lands, custom [hooks](/automation/hooks) can track subagent lifecycle and layer retry and escalation logic on top.

### Silent information loss (MAST FM-2.4)

A subagent finds something important but doesn't include it in the report because it wasn't explicitly asked for. Common in research tasks where a side finding is more valuable than the main result.

**Pattern: mandatory critical findings**

Add this to every agent's `SOUL.md`:

```markdown
## Output standard

Every report must include a "Critical Findings" section.
Items that weren't asked for but matter: side effects, risks, unexpected data.
This section cannot be blank. If nothing: write "No critical findings."
```

Customize per agent role. A code agent should flag breaking changes. A research agent should flag contradicting sources. A financial agent should flag unusual amounts.

## Patterns that OpenClaw's architecture already handles

### Conversation reset (MAST FM-2.1)

In peer-to-peer multi-agent systems, two agents can lose their shared context mid-conversation. OpenClaw's hub-and-spoke model avoids this: the main agent orchestrates all communication, and subagents don't talk to each other directly.

### Step repetition (MAST FM-1.3)

The most common failure mode in the MAST dataset (15.7%). OpenClaw mitigates this through:

- **Deduplication** in lifecycle hooks (the `internalHookEmittedRunIds` guard in [#24925](https://github.com/openclaw/openclaw/pull/24925))
- **Rate limiting** in pickup enforcement (prevents re-injecting the same completion)
- **Idempotency keys** on `injectAgentMessage` calls

## Patterns for specific agent types

### Research agents

Research tasks are prone to scope creep (FM-1.5: unaware of stopping conditions). Define scope upfront:

```markdown
## Research scope protocol

Before starting research, confirm:

1. Topic (one sentence)
2. Boundaries (what's in scope, what's not)
3. Depth: surface (3 sources) / medium (5+) / deep (10+)
4. Output format

If the task doesn't specify these, ask before starting.
```

### Long-running agents

Pipeline agents that process large datasets or run multi-step workflows risk loss of conversation history (FM-1.4) and derailment (FM-2.3).

```markdown
## Context overflow protocol

If context is filling up during a long task:

1. Stop and summarize progress so far
2. List remaining work items
3. Write partial results to a checkpoint file
4. Report "context limit approaching, X items remaining"

The orchestrator will re-spawn to continue from the checkpoint.
```

For derailment detection, set a timer when spawning long tasks. If a subagent runs longer than expected, check whether its output still aligns with the original task scope.

### Financial agents

Any agent that can move money needs a confirmation gate (FM-2.6 mitigation):

```markdown
## Financial transaction guard

Read-only operations (price checks, balance queries): no confirmation needed.
Write operations (transfers, swaps, trades): require explicit confirmation
before execution. State the exact operation, amount, and destination first.
```

## Disobey role specification (MAST FM-1.2)

When agents restart or models switch mid-session, they can lose their persona. This is rare (1.5% in MAST data) but high-impact when it happens, as it breaks the separation between agents.

**Pattern: identity checkpoint**

Add a self-verification block near the top of each agent's `SOUL.md`:

```markdown
## Identity checkpoint

At session start, silently verify:
I am [Name], [Role]. I read this SOUL.md.
Do not behave as a different agent.
```

This doesn't guarantee identity retention, but it provides an anchor that survives context compaction better than identity buried deep in a system prompt.

## Testing your setup

After implementing these patterns:

1. **Spawn a subagent with an intentionally vague task.** Does it ask for clarification or make assumptions?
2. **Spawn a code agent and check if the completion report includes evidence.** Does it have actual file paths and test output?
3. **Kill a subagent mid-task.** Does the orchestrator detect it and notify you?
4. **Run a research task without scope limits.** Does it stop at a reasonable depth or spiral?

## References

- Cemri, M. et al. (2025). "Why Do Multi-Agent LLM Systems Fail?" [arXiv:2503.13657](https://arxiv.org/abs/2503.13657)
- [MAST Dataset](https://huggingface.co/datasets/mcemri/MAD) (1,600+ annotated multi-agent traces)
- [OpenClaw Multi-Agent Routing](/concepts/multi-agent) (agent setup and bindings)
- [OpenClaw Hooks](/automation/hooks) (lifecycle events for subagent tracking)
