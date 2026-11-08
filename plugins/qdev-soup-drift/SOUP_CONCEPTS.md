# SOUP Trajectory Drift Detection

**Statistical Output Profiling (SOUP)** detects when an AI assistant's output distribution shifts away from its established baseline behavior.

## What is SOUP?

SOUP monitors the statistical properties of an AI assistant's token-level output to detect meaningful changes in behavior. Unlike simple keyword matching or rule-based systems, SOUP works by comparing probability distributions.

**Key insight:** If an assistant consistently produces certain kinds of output (distribution A), and suddenly starts producing very different output (distribution B), something may have changed—drift, jailbreaking, or unintended behavior modification.

## Core Concepts

### Baseline Distribution

The **baseline** is the reference pattern SOUP learns from early assistant messages. Think of it as "what normal looks like."

**Current default:** First 4 assistant messages establish the baseline.

**Why this matters:**
- Too small (1-2 messages): Unstable, may not represent normal behavior
- Too large (20+ messages): Takes too long before drift detection starts
- Just right (4-8 messages): Captures typical patterns without excessive delay

The baseline is fixed once established. SOUP doesn't continuously update it—that would make it unable to detect persistent drift.

### Comparison Windows

Later messages are grouped into **windows** for batch evaluation. Each window is compared against the baseline as a unit.

**Current default:** 4 messages per window.

**Why windows instead of individual messages:**
- Individual messages are noisy—one unusual message doesn't mean drift
- Batching smooths out natural variation
- Multiple messages give stronger statistical evidence

**Example timeline:**
- Messages 1-4: Baseline (learning phase)
- Messages 5-8: Window 1 (evaluated)
- Messages 9-12: Window 2 (evaluated)
- Messages 13-16: Window 3 (evaluated)

Each window gets its own KL divergence score vs the baseline.

### KL Divergence (Kullback-Leibler Divergence)

**KL divergence** measures how different two probability distributions are.

**In SOUP's context:**
- KL = 0: Window distribution identical to baseline
- KL = small number (0.05-0.15): Slight variation, probably normal
- KL = larger number (0.2-0.4): Significant change, possible drift
- KL = very large: Major distribution shift

**Intuitive explanation:** If the baseline says "70% formal language, 20% technical terms, 10% casual" and a window shows "20% formal, 10% technical, 70% casual," the KL divergence will be high because the distributions are very different.

SOUP doesn't care *what* the content is—it cares about the statistical shape of the output.

### Sensitivity Thresholds

The **threshold** determines when SOUP considers a KL divergence score high enough to count as drift.

**Available presets (0-4):**
- Position 0: 0.05 — Very sensitive, catches small changes
- Position 1: 0.10 — Sensitive
- **Position 2: 0.20 — Default, balanced** ✅
- Position 3: 0.30 — Less sensitive
- Position 4: 0.40 — Only major changes

**Current default:** Position 2 (threshold 0.20)

**Why 0.20 is the default:**
- Based on SOUP research findings
- Balances false positives (crying wolf) vs false negatives (missing real drift)
- Catches meaningful changes without being too noisy

**How to choose:**
- Use 0.05-0.10 if you want early warning of subtle changes (expect more alerts)
- Use 0.20 (default) for balanced detection
- Use 0.30-0.40 if you only care about major shifts

## Gentle Mentor Intervention

When SOUP detects qualifying drift (KL > threshold), it doesn't immediately alert you. Instead:

1. **First detection:** Gentle reminder to the agent about staying on track
2. **Second detection:** Another gentle reminder
3. **Third detection:** Asks you (the human) for clarification

**Why this pattern:**
- Gives the agent two chances to self-correct
- Reduces false-alarm interruptions to humans
- Human escalation happens only after repeated drift

**Your choice at escalation:**
- **Reset count:** Fresh start, agent gets two more reminders before next escalation
- **Keep count:** Carry the strikes forward, next drift escalates immediately

## Why These Settings Matter

| Setting | Effect | Trade-off |
|---------|--------|-----------|
| Baseline size ↑ | More stable reference | Longer before detection starts |
| Window size ↑ | Smoother, less noisy | Slower to detect emerging drift |
| Threshold ↓ | More sensitive, catch smaller changes | More alerts, possible false positives |
| Threshold ↑ | Only catch major changes | May miss gradual drift |

**Recommended starting point (defaults):**
- Baseline: 4 messages
- Window: 4 messages  
- Threshold: 0.20 (position 2)

These are based on SOUP research and give balanced detection for most use cases.

## Technical Details

**SOUP implementation:** Official `soup-cli` Python package  
**Method:** Kullback-Leibler divergence on token-level distributions  
**Evaluation:** Per-window batch comparison against fixed baseline  
**Integration:** DeepSeek Harness native plugin with Settings UI

**Telemetry flow:** DeepSeek → SOUP → OpenTelemetry → ClickHouse

**Research reference:** SOUP (Statistical Output Profiling) methodology from AI safety research

## Practical Implications

**SOUP detects:**
- Jailbreak attempts that change output patterns
- Unintended behavior drift over long conversations
- Mode switches (formal → casual, technical → vague)
- Distribution shifts from prompt injection

**SOUP does NOT detect:**
- Specific harmful content (use content filters for that)
- Factual correctness (use fact-checking for that)
- Topic changes (SOUP measures statistical patterns, not topics)
- Single unusual messages (windows smooth out noise)

## When to Adjust Settings

**Increase sensitivity (lower threshold) when:**
- You want early warning of subtle changes
- The task requires very consistent output style
- You can tolerate more alerts to catch real drift

**Decrease sensitivity (raise threshold) when:**
- You're getting too many false alarms
- Natural variation in your task is high
- You only care about major distribution shifts

**Increase baseline size when:**
- Output style varies in early messages
- You want more stable reference behavior

**Decrease baseline size when:**
- You need earlier detection
- Output style is consistent from the start

## Default Recommendations

The plugin ships with research-based defaults that work for most users:

- **Baseline:** 4 messages — enough to establish pattern, not too slow
- **Window:** 4 messages — good balance of smoothing and responsiveness
- **Threshold:** 0.20 — catches meaningful drift without excessive alerts
- **Gentle Mentor:** Enabled — two reminders before human escalation

**Start with defaults, adjust based on experience.**

If you're seeing too many alerts, raise the threshold (position 3 or 4).  
If you're missing drift you care about, lower it (position 1 or 0).

---

**For implementation details, see:** [Plugin README](README.md) and [Development Lessons](LESSONS.md)
