# SOUP build v2: prompt and amendments (final, for review)

Status: draft for owner review. Source of truth for the wording is `reanchor.mjs`; this file records what the owner has decided and the exact text the model receives.

## 1. Prompt the model receives

Two intervention texts are sent, depending on how many qualifying drifts the chat has had.

### First drift

Sent as a single user message. Nothing else is added.

> I think what you are doing is interesting; however, I would like to return focus to the current plan.

### Second drift

Sent as a single user message, built from the Gentle Mentor message, then the current plan, then any amendments.

```
<Gentle Mentor message>

Current plan:

<plan text>

Plan amendments:
- <amendment 1>
- <amendment 2>
```

- The **Gentle Mentor message** defaults to:
  > I noticed you might be drifting slightly off plan. Can you use this to get back on track and help me succeed? If you have questions for me, need clarification, or would like me to clarify anything, I'm happy to help so we can both succeed.
- The **plan text** is the chat's Mentor plan. It defaults to the original plan the user gave.
- The **Plan amendments** block appears only when the chat has amendments.

### Escalation (third drift)

Not sent to the model. The human is asked for clarification:

> I'm having some difficulty staying aligned with the original plan. Could you help me clarify what I'm missing before I continue?

## 2. Amendments (owner decisions)

These are the decisions recorded for the build. Each one is final unless the owner changes it.

| # | Topic | Decision |
|---|---|---|
| A1 | Intent button location | A SOUP button on the chat window, shown above the chat, like the Goal and Queue bars. |
| A2 | Scope | Per chat. Each chat has its own intent. |
| A3 | Plan source | The user chooses the plan, the same way they choose Plan or Goal. The plan is not taken from the first message. |
| A4 | Intent storage | An Intent event would be preferred, but **no changes to DSH are allowed**. Intent is stored in SOUP's own Mentor store on disk, not in the session log. |
| A5 | Amend | "Amend" adds an amendment to the intent. The word "append" is not used. |
| A6 | First-drift rule | The first drift stays one sentence. The plan and amendments appear only on the second drift. (Owner decision; no code change.) |
| A7 | Storage record | One optional `intent` field added to the Mentor record in the existing `qdev_soup_mentor_context` domain. Existing records stay valid. |
| A8 | Intent actions | Set, Amend, pause, stop. |
| A9 | Settings UI | The SOUP settings UI provides the path to compile and store intents. |

## 3. Open items this file does not settle

- The exact wording of the Intent button and its states (set, active, paused, stopped).
- Whether a paused or stopped intent still reaches the model, and how it is shown.
- The wording for the domain-specific examples (aircraft, creative writing, governance). The source examples are not in the repo.

## 4. Not changed by this file

- No DSH source is changed.
- The first-drift behaviour is unchanged.
- The installed build is unchanged.
