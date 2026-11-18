import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
import { z } from 'zod';
// @ts-expect-error JavaScript settings module has no declaration file.
import { SessionSettingsRecord } from '../session-settings.mjs';
// @ts-expect-error JavaScript module has no declaration file.
import { MentorContextRecord } from '../mentor-context.mjs';
// Durable state for the consumers. The drift monitor persists nothing.
export const SESSION_SETTINGS_DOMAIN = defineDomain({
    name: 'qdev_soup_session_settings',
    version: 1,
    layout: 'per-record',
    tables: { sessions: domainTable(SessionSettingsRecord) },
});
// Feature 4: per-chat Gentle Mentor context (message, plan, amendments). Absent keys mean the defaults.
export const MENTOR_CONTEXT_DOMAIN = defineDomain({
    name: 'qdev_soup_mentor_context',
    version: 1,
    layout: 'per-record',
    tables: { sessions: domainTable(MentorContextRecord) },
});
// Spec B4-B5: the escalation-bypass register. One entry per drift, kept for the whole mission, never cleared.
export const REGISTER_DOMAIN = defineDomain({
    name: 'qdev_soup_register',
    version: 1,
    layout: 'per-record',
    tables: {
        entries: domainTable(z.object({
            id: z.string(),
            turn: z.number().int(),
            drift: z.number().int().nonnegative(),
            sent: z.enum(['first', 'full']),
            at: z.number(),
        })),
    },
});
// Per-chat Live & Mentor history: last 50 calculations and markers, restored across Harness restarts.
// Test outcome read from shell tool output text. It is a text pattern, not a test runner's verified result.
export const LIVE_HISTORY_DOMAIN = defineDomain({
    name: 'qdev_soup_live_history',
    version: 1,
    layout: 'per-record',
    tables: {
        sessions: domainTable(z.object({
            history: z.array(z.object({ at: z.number(), kl: z.number(), threshold: z.number(), drift: z.boolean() })).max(50),
            markers: z.array(z.object({ at: z.number(), kind: z.enum(['crossing', 'reminder', 'escalation', 'clarification']) })).max(50),
            tools: z.array(z.object({ callId: z.string(), name: z.string(), startedAt: z.number(), endedAt: z.number().nullable(), error: z.boolean(), reason: z.string().optional(), outcome: z.object({ result: z.enum(['passed', 'failed']), summary: z.string().max(200) }).optional() })).max(200).optional(),
            decisions: z.array(z.object({ at: z.number(), kind: z.string(), detail: z.string() })).max(200).optional(),
        })),
    },
});
export const MENTOR_STATE_DOMAIN = defineDomain({
    name: 'qdev_soup_drift_state',
    version: 1,
    layout: 'per-record',
    tables: {
        sessions: domainTable(z.object({
            carry: z.number().int().nonnegative(),
            decisionPending: z.boolean(),
        })),
    },
});
// Consumer services are optional. A missing one is recorded by noteMissing and its consumer falls back to
// volatile (in-memory) state; the SOUP monitor itself never depends on storage.
export async function openTables(ctx, noteMissing) {
    const volatileTable = () => {
        const rows = new Map();
        return { entries: () => rows.entries(), get: (id) => rows.get(id), put: async (id, value) => { rows.set(id, value); } };
    };
    const openTable = async (definition, table) => {
        const storage = ctx.get('storageDomain');
        if (!storage) {
            noteMissing('storageDomain');
            return volatileTable();
        }
        try {
            const domain = await storage.open(definition);
            ctx.effect(() => () => domain.close());
            return domain.table(table);
        }
        catch (error) {
            noteMissing('storageDomain');
            ctx.logger.warn('SOUP storage unavailable for %s: %s', table, error instanceof Error ? error.message : String(error));
            return volatileTable();
        }
    };
    const mentorTable = await openTable(MENTOR_STATE_DOMAIN, 'sessions');
    const initialMentorState = Object.fromEntries(mentorTable.entries());
    const registerTable = await openTable(REGISTER_DOMAIN, 'entries');
    const liveTable = await openTable(LIVE_HISTORY_DOMAIN, 'sessions');
    const initialLive = Object.fromEntries(liveTable.entries());
    const contextTable = await openTable(MENTOR_CONTEXT_DOMAIN, 'sessions');
    const mentorContexts = new Map(contextTable.entries());
    const settingsTable = await openTable(SESSION_SETTINGS_DOMAIN, 'sessions');
    return { mentorTable, registerTable, liveTable, contextTable, settingsTable, initialMentorState, initialLive, mentorContexts };
}
