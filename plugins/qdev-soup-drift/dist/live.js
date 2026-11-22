// Per-chat Live & Mentor records (history, markers, tool calls, decisions). Consumer state only.
export function createLive({ initialLive, liveTable, recordError }) {
    const sessionLive = new Map();
    const liveTools = new Map();
    // The short reason a failed result gives, from its text blocks. Used to group failures by type.
    const reasonText = (content) => (Array.isArray(content)
        ? content.map((block) => (block && typeof block.text === 'string' ? block.text : '')).join(' ')
        : '').replace(/\s+/g, ' ').trim().slice(0, 160);
    const liveDecisions = new Map();
    const observeDecision = (id, event) => {
        const data = event.data;
        let record = null;
        // The SDK's SessionEvent union omits these two types, so compare as string.
        const type = event.type;
        if (type === 'plan/mode') {
            record = { at: event.time, kind: 'plan mode', detail: data.active === true ? 'turned on' : 'turned off' };
        }
        else if (type === 'hook/result') {
            const exit = typeof data.exitCode === 'number' ? ` (exit ${data.exitCode})` : '';
            const stderr = typeof data.stderrSummary === 'string' ? ` · ${data.stderrSummary.slice(0, 120)}` : '';
            record = { at: event.time, kind: 'hook', detail: `${String(data.decision)}${exit}${stderr}` };
        }
        if (record === null)
            return;
        const list = liveDecisions.get(id) ?? [...(initialLive[id]?.decisions ?? [])];
        list.push(record);
        if (list.length > 200)
            list.splice(0, list.length - 200);
        liveDecisions.set(id, list);
        persistLive(id, ensureSessionLive(id));
    };
    // Counts from pytest-style "3 failed" and node-style "# fail 1" lines. Only shell-like tools are read.
    const testOutcome = (name, content) => {
        if (!/bash|shell|exec|run|command|terminal/i.test(name) || !Array.isArray(content))
            return undefined;
        const text = content.map((part) => (part && typeof part === 'object' && typeof part.text === 'string' ? part.text : '')).join('\n');
        const lineOf = (index) => {
            const start = text.lastIndexOf('\n', index) + 1;
            const end = text.indexOf('\n', index);
            return text.slice(start, end === -1 ? undefined : end).trim();
        };
        let passed = 0;
        let failed = 0;
        let summary = '';
        for (const m of text.matchAll(/(\d+)\s+(passed|failed)\b|#\s*(pass|fail)\s+(\d+)/gi)) {
            const count = Number(m[1] ?? m[4]);
            const kind = (m[2] ?? m[3]).toLowerCase();
            if (kind.startsWith('fail'))
                failed += count;
            else
                passed += count;
            summary = summary || lineOf(m.index ?? 0);
        }
        if (failed === 0 && passed === 0)
            return undefined;
        return { result: failed > 0 ? 'failed' : 'passed', summary: summary.slice(0, 160) };
    };
    const observeTool = (id, event) => {
        const data = event.data;
        const list = liveTools.get(id) ?? [...(initialLive[id]?.tools ?? [])];
        if (event.type === 'tool/call') {
            list.push({ callId: String(data.callId), name: String(data.name), startedAt: event.time, endedAt: null, error: false });
            if (list.length > 200)
                list.splice(0, list.length - 200);
        }
        else {
            const callId = String(data.message?.source?.callId);
            const record = [...list].reverse().find((item) => item.callId === callId);
            if (record) {
                record.endedAt = event.time;
                record.error = data.message?.isError === true;
                if (record.error)
                    record.reason = reasonText(data.message?.content);
                const outcome = testOutcome(record.name, data.message?.content);
                if (outcome)
                    record.outcome = outcome;
            }
        }
        liveTools.set(id, list);
        persistLive(id, ensureSessionLive(id));
    };
    const ensureSessionLive = (id) => {
        const existing = sessionLive.get(id);
        if (existing)
            return existing;
        const created = {
            sessionEvents: 0,
            assistantMessages: 0,
            baselineSize: 0,
            windowSize: 0,
            pending: false,
            evaluations: 0,
            drifts: 0,
            klTotal: 0,
            history: initialLive[id]?.history ?? [],
            markers: initialLive[id]?.markers ?? [],
        };
        sessionLive.set(id, created);
        return created;
    };
    // Write the chat's history and markers to its own storage row. Failures are recorded, never thrown.
    const persistLive = (id, live) => {
        void liveTable.put(id, { history: live.history, markers: live.markers, tools: liveTools.get(id) ?? initialLive[id]?.tools ?? [], decisions: liveDecisions.get(id) ?? initialLive[id]?.decisions ?? [] })
            .catch((error) => recordError(error, { phase: 'live-history-persist', sessionId: id }));
    };
    return { sessionLive, liveTools, liveDecisions, observeTool, observeDecision, ensureSessionLive, persistLive };
}
