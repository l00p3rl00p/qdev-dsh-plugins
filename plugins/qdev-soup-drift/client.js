window.__ModuleLoader__.load({
  id: 'qdev-trajectory-drift-soup',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useMemo, useState, useSyncExternalStore } = React;

    const ENTRY = 'qdev-trajectory-drift-soup';
    const THRESHOLDS = [0.05, 0.1, 0.2, 0.3, 0.4];
    const ROW_KEYS = [`${ENTRY}#${ENTRY}`];

    const styles = {
      page: { display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 920 },
      card: {
        display: 'flex', flexDirection: 'column', gap: 12, padding: '18px 20px',
        border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 14,
        background: 'var(--dsw-alias-bg-layer-1)',
      },
      hero: {
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18,
        padding: 18, border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 12,
        background: 'var(--dsw-alias-bg-layer-2)',
      },
      title: { margin: 0, color: 'var(--dsw-alias-label-primary)', fontSize: 15, lineHeight: '22px', fontWeight: 650 },
      sectionLabel: { margin: 0, color: 'var(--dsw-alias-label-secondary)', fontSize: 11, lineHeight: '16px', fontWeight: 650, letterSpacing: '.08em', textTransform: 'uppercase' },
      body: { margin: 0, color: 'var(--dsw-alias-label-secondary)', fontSize: 13, lineHeight: '20px' },
      row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 18, padding: '9px 0', borderBottom: '1px solid var(--dsw-alias-border-l1)' },
      copy: { display: 'flex', minWidth: 0, flexDirection: 'column', gap: 3 },
      label: { color: 'var(--dsw-alias-label-primary)', fontSize: 14, lineHeight: '20px', fontWeight: 550 },
      hint: { color: 'var(--dsw-alias-label-secondary)', fontSize: 12, lineHeight: '18px' },
      input: {
        width: 92, boxSizing: 'border-box', padding: '7px 9px',
        color: 'var(--dsw-alias-label-primary)', background: 'var(--dsw-alias-bg-layer-2)',
        border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, font: 'inherit',
      },
      statusGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(138px, 1fr))', gap: 8 },
      metric: { padding: '11px 12px', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 10, background: 'var(--dsw-alias-bg-layer-2)' },
      metricValue: { display: 'block', marginTop: 4, color: 'var(--dsw-alias-label-primary)', fontSize: 18, lineHeight: '24px', fontWeight: 680 },
      meter: { height: 7, overflow: 'hidden', borderRadius: 999, background: 'var(--dsw-alias-bg-base)' },
      actionRow: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 2 },
      button: { padding: '8px 12px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 9, background: 'var(--dsw-alias-bg-layer-2)', color: 'var(--dsw-alias-label-primary)', font: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
      error: { margin: 0, color: 'var(--dsw-alias-state-error-primary)', fontSize: 13, lineHeight: '20px' },
      code: { color: 'var(--dsw-alias-label-primary)', fontSize: 12 },
    };

    function SoupIcon({ size = 34 }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 64 64', role: 'img',
        'aria-label': 'SOUP trajectory drift', style: { flex: '0 0 auto' },
      },
      h('rect', { x: 4, y: 4, width: 56, height: 56, rx: 16, fill: '#101828' }),
      h('path', { d: 'M15 17v30M49 17v30', fill: 'none', stroke: '#93a4c7', strokeWidth: 3, strokeLinecap: 'round', opacity: 0.72 }),
      h('path', { d: 'M14 43c8 0 8-22 18-22s10 22 19 22', fill: 'none', stroke: '#22c7a9', strokeWidth: 6, strokeLinecap: 'round' }),
      h('circle', { cx: 14, cy: 43, r: 4, fill: '#22c7a9' }),
      h('circle', { cx: 51, cy: 43, r: 4, fill: '#6d72ff' }));
    }

    function Toggle({ label, checked, disabled, onChange }) {
      return h('button', {
        type: 'button', role: 'switch', 'aria-label': label, 'aria-checked': checked,
        disabled, onClick: () => onChange(!checked),
        style: {
          position: 'relative', width: 42, height: 24, flex: '0 0 auto', padding: 0,
          border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 999,
          background: checked ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-bg-layer-2)',
          cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
        },
      }, h('span', {
        'aria-hidden': true,
        style: {
          position: 'absolute', top: 3, left: checked ? 21 : 3, width: 16, height: 16,
          borderRadius: '50%', background: 'var(--dsw-alias-bg-layer-1)', transition: 'left 120ms ease',
        },
      }));
    }

    function SettingRow({ label, hint, children }) {
      return h('div', { style: styles.row },
        h('span', { style: styles.copy },
          h('span', { style: styles.label }, label),
          hint ? h('span', { style: styles.hint }, hint) : null,
        ),
        children,
      );
    }

    function NumberSetting({ label, hint, value, min, max, disabled, onCommit }) {
      const [draft, setDraft] = useState(String(value));
      useEffect(() => setDraft(String(value)), [value]);
      const commit = () => {
        const next = Number(draft);
        if (Number.isInteger(next) && next >= min && next <= max) onCommit(next);
        else setDraft(String(value));
      };
      return h(SettingRow, { label, hint }, h('input', {
        type: 'number', min, max, step: 1, value: draft, disabled,
        'aria-label': label, style: styles.input,
        onChange: event => setDraft(event.target.value), onBlur: commit,
        onKeyDown: event => { if (event.key === 'Enter') event.currentTarget.blur(); },
      }));
    }

    function useLiveStatus() {
      const [status, setStatus] = useState(null);
      const [error, setError] = useState('');
      const [refreshKey, setRefreshKey] = useState(0);
      useEffect(() => {
        let active = true;
        let controller;
        async function refresh() {
          controller?.abort();
          controller = new AbortController();
          try {
            const response = await fetch('/qdev-soup-drift/status', {
              signal: controller.signal, credentials: 'same-origin', headers: { accept: 'application/json' },
            });
            if (!response.ok) throw new Error(`Status endpoint returned ${response.status}`);
            const next = await response.json();
            if (active) { setStatus(next); setError(''); }
          } catch (cause) {
            if (active && cause?.name !== 'AbortError') setError(cause instanceof Error ? cause.message : String(cause));
          }
        }
        refresh();
        const timer = window.setInterval(refresh, 4000);
        return () => { active = false; window.clearInterval(timer); controller?.abort(); };
      }, [refreshKey]);
      return { status, error, refresh: () => setRefreshKey(value => value + 1) };
    }

    function Metric({ label, value }) {
      return h('div', { style: styles.metric },
        h('span', { style: styles.hint }, label),
        h('strong', { style: styles.metricValue }, String(value)),
      );
    }

    function formatTime(value) {
      if (typeof value !== 'number') return 'Waiting for session activity';
      return new Date(value).toLocaleString();
    }

    function DeliveryEvidence({ record }) {
      const details = [
        record.state,
        record.attempt == null ? null : `attempt ${record.attempt}`,
        record.eventSeq == null ? null : `inbox event ${record.eventSeq}`,
        record.messageId ? `message ${record.messageId}` : null,
      ].filter(Boolean).join(' · ');
      return h('li', { style: styles.body },
        h('strong', { style: styles.label }, record.kind),
        ` — ${details}`,
        record.error ? h('span', { style: styles.error }, ` — ${record.error}`) : null,
      );
    }

    function StatusPanel() {
      const { status, error, refresh } = useLiveStatus();
      const [decisionWorking, setDecisionWorking] = useState('');
      const [decisionError, setDecisionError] = useState('');
      const trajectory = status?.trajectory ?? {};
      const detector = status?.detector ?? {};
      const mentor = status?.mentor ?? {};
      const deliveries = [...(mentor.reminders ?? []), ...(mentor.escalation ? [mentor.escalation] : [])];
      const delivered = deliveries.filter(item => item.state === 'delivered' || item.state === 'answered').length;
      const result = detector.lastResult;
      const kl = typeof result?.klDivergence === 'number' ? result.klDivergence.toFixed(4) : '—';
      const average = typeof detector.averageKlDivergence === 'number' ? detector.averageKlDivergence.toFixed(4) : '—';
      const ratio = typeof detector.averageThresholdRatio === 'number' ? detector.averageThresholdRatio : null;
      const ratioLabel = ratio == null ? 'Waiting for enough output' : `${ratio.toFixed(1)}× the active threshold`;
      const summary = detector.humanSummary ?? 'Waiting for measurements';
      const meterColor = summary === 'Stable'
        ? 'var(--dsw-alias-state-success-primary)'
        : summary === 'Approaching threshold'
          ? 'var(--dsw-alias-state-warn-primary)'
          : 'var(--dsw-alias-state-error-primary)';
      const hostErrors = Array.isArray(status?.errors) ? status.errors : [];
      const resetDecision = mentor.resetDecision?.required ? mentor.resetDecision : null;

      async function chooseReset(reset) {
        if (!resetDecision || decisionWorking) return;
        setDecisionWorking(reset ? 'reset' : 'carry');
        setDecisionError('');
        try {
          const response = await fetch('/qdev-soup-drift/status', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'content-type': 'application/json', 'x-qdev-soup-action': 'reset-drift-count' },
            body: JSON.stringify({ action: 'reset-drift-count', sessionId: resetDecision.sessionId, reset }),
          });
          const payload = await response.json();
          if (!response.ok || !payload.ok) throw new Error(payload.error || payload.result?.reason || `Reset action returned ${response.status}`);
          refresh();
        } catch (cause) {
          setDecisionError(cause instanceof Error ? cause.message : String(cause));
        } finally {
          setDecisionWorking('');
        }
      }

      return h('section', { style: styles.card, 'aria-labelledby': 'soup-live-status' },
        h('p', { style: styles.sectionLabel }, 'Trajectory monitor'),
        h('h3', { id: 'soup-live-status', style: styles.title }, 'What SOUP sees right now'),
        h('div', { style: styles.hero },
          h('div', { style: styles.copy },
            h('strong', { style: { ...styles.metricValue, marginTop: 0, fontSize: 24 } }, summary),
            h('p', { style: styles.body }, ratio == null
              ? 'SOUP is collecting a stable baseline before it compares live output.'
              : `Average KL divergence is ${average}, which is ${ratioLabel}. KL is the difference between recent output and the baseline: 0 means closely aligned, larger values mean more change, and a value above the threshold counts as drift.`),
            h('div', { style: styles.meter, role: 'meter', 'aria-label': 'Average drift versus threshold', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': ratio == null ? 0 : Math.min(100, Math.round(ratio * 100)) },
              h('span', { style: { display: 'block', width: `${ratio == null ? 0 : Math.min(100, ratio * 100)}%`, height: '100%', background: meterColor, transition: 'width 180ms ease' } }),
            ),
          ),
          h('div', { style: styles.copy },
            h('span', { style: styles.sectionLabel }, 'Accountability'),
            h('strong', { style: { ...styles.metricValue, marginTop: 0 } }, `${mentor.driftCount ?? 0} qualifying drift${mentor.driftCount === 1 ? '' : 's'}`),
            h('span', { style: styles.hint }, `${mentor.carriedDrifts ?? 0} carried across turns · two reminders, then escalation`),
          ),
        ),
        resetDecision ? h('div', { style: { ...styles.hero, borderColor: 'var(--dsw-alias-state-warn-primary)' } },
          h('div', { style: styles.copy },
            h('strong', { style: styles.label }, 'Reset the drift count?'),
            h('p', { style: styles.body }, 'Reset gives the corrected trajectory a fresh allowance. Keep carries three strikes forward, so the next qualifying drift escalates immediately.'),
          ),
          h('div', { style: styles.actionRow, role: 'group', 'aria-label': 'Reset accumulated drift count' },
            h('button', { type: 'button', style: { ...styles.button, borderColor: 'var(--dsw-alias-state-success-primary)' }, disabled: Boolean(decisionWorking), onClick: () => chooseReset(true) }, decisionWorking === 'reset' ? 'Resetting…' : 'Yes — reset to 0'),
            h('button', { type: 'button', style: { ...styles.button, borderColor: 'var(--dsw-alias-state-warn-primary)' }, disabled: Boolean(decisionWorking), onClick: () => chooseReset(false) }, decisionWorking === 'carry' ? 'Saving…' : 'No — carry 3 forward'),
          ),
          decisionError ? h('p', { role: 'alert', style: styles.error }, decisionError) : null,
        ) : null,
        h('div', { style: styles.statusGrid },
          h(Metric, { label: 'Session events', value: trajectory.sessionEvents ?? '—' }),
          h(Metric, { label: 'Assistant messages', value: trajectory.assistantMessages ?? '—' }),
          h(Metric, { label: 'SOUP calculations', value: detector.evaluations ?? '—' }),
          h(Metric, { label: 'Average KL', value: average }),
          h(Metric, { label: 'Latest KL', value: kl }),
          h(Metric, { label: 'Inbox deliveries', value: status ? delivered : '—' }),
        ),
        h('p', { style: styles.hint }, `Trajectory ${trajectory.state ?? 'unavailable'} · Detector ${detector.state ?? 'unavailable'} · Mentor ${mentor.state ?? 'unavailable'} · Latest activity ${formatTime(trajectory.lastEventAt)}`),
        result ? h('p', { style: styles.body }, `Latest calculation: ${result.driftDetected ? 'drift detected' : 'within threshold'} at KL ${kl} / ${Number(result.threshold).toFixed(2)}${result.singleTurn ? ' in one turn' : ' across turns'}.`) : null,
        mentor.lastOutcome ? h('p', { role: 'status', style: styles.body }, mentor.lastOutcome) : null,
        deliveries.length ? h('div', null,
          h('h4', { style: styles.title }, 'Delivery evidence'),
          h('ul', { style: { margin: '8px 0 0', paddingLeft: 20 } }, deliveries.map((record, index) => h(DeliveryEvidence, { key: `${record.kind}-${record.requestedAt}-${index}`, record }))),
        ) : h('p', { style: styles.hint }, 'No mentor delivery has been requested in this runtime.'),
        error ? h('p', { role: 'alert', style: styles.error }, `Live status unavailable: ${error}`) : null,
        hostErrors.length ? h('div', { role: 'alert' },
          h('h4', { style: styles.title }, 'Recent host errors'),
          h('ul', { style: { margin: '8px 0 0', paddingLeft: 20 } }, hostErrors.map((item, index) => h('li', { key: `${item.at}-${index}`, style: styles.error }, `${formatTime(item.at)} · ${item.phase ?? 'runtime'} · ${item.message}`))),
        ) : null,
      );
    }

    function usePageForm(source) {
      const subscribe = useCallback(listener => source ? source.subscribe(listener) : () => {}, [source]);
      const state = useSyncExternalStore(subscribe, () => source?.getSnapshot(), () => source?.getSnapshot());
      return useMemo(() => source && state ? { state, mutate: source.mutate.bind(source) } : undefined, [source, state]);
    }

    function SoupSettingsSection({ source }) {
      return h(SoupConfig, { view: 'page', form: usePageForm(source) });
    }

    function SoupConfig({ view, form }) {
      if (view === 'summary') return h('span', null, 'Detects trajectory drift with SOUP and gently reanchors the agent before requesting human clarification.');

      const snapshot = form?.state ?? { status: 'unavailable', value: {}, writable: false };
      const value = snapshot.value ?? {};
      const [working, setWorking] = useState('');
      const [error, setError] = useState('');
      const writable = snapshot.status === 'ready' && snapshot.writable && !working;
      const enabled = value.enabled !== false;
      const detectorEnabled = value.detectorEnabled !== false;
      const reanchoring = value.reanchoring !== false;
      const preset = Number.isInteger(value.preset) && value.preset >= 0 && value.preset < THRESHOLDS.length ? value.preset : 2;
      const baselineCount = Number.isInteger(value.baselineCount) ? value.baselineCount : 4;
      const windowCount = Number.isInteger(value.windowCount) ? value.windowCount : 4;
      const [showAbout, setShowAbout] = useState(false);

      async function set(path, next) {
        if (!form?.mutate || snapshot.status !== 'ready' || !snapshot.writable) return;
        setWorking(path.join('.'));
        setError('');
        try {
          const accepted = await form.mutate([{ op: 'set', path, value: next }], snapshot.revision);
          if (!accepted) setError('The configuration changed elsewhere or the host rejected this value. Review the refreshed settings and try again.');
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : String(cause));
        } finally {
          setWorking('');
        }
      }

      return h('main', { style: styles.page },
        h('section', { style: styles.card, 'aria-labelledby': 'soup-identity' },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 12 } },
            h(SoupIcon, { size: 40 }),
            h('div', { style: styles.copy },
              h('h3', { id: 'soup-identity', style: styles.title }, 'SOUP trajectory drift'),
              h('span', { style: styles.hint }, 'Official SOUP detection · native DSH settings'),
            ),
          ),
          h('p', { style: styles.body }, 'Compares a stable baseline of assistant output with later windows using the official SOUP KL-divergence implementation. Gentle Mentor can inject two reanchoring reminders before escalating the third qualifying detection.'),
          h('button', {
            onClick: () => setShowAbout(!showAbout),
            style: { ...styles.hint, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', textDecoration: 'underline' },
            'aria-expanded': showAbout,
          }, showAbout ? 'Hide explanation ▲' : 'What is SOUP? ▼'),
          showAbout ? h('div', { style: { marginTop: 12, padding: 12, background: 'var(--dsw-alias-bg-layer-2)', borderRadius: 8 } },
            h('p', { style: { ...styles.body, margin: '0 0 12px' } }, 
              h('strong', null, 'SOUP (Statistical Output Profiling)'), ' detects when an AI assistant\'s output distribution shifts away from its baseline behavior. This can indicate drift, jailbreaking attempts, or unintended behavior changes.'
            ),
            h('p', { style: { ...styles.body, margin: '0 0 12px' } }, 
              h('strong', null, 'How it works:')
            ),
            h('ul', { style: { ...styles.body, margin: '0 0 12px', paddingLeft: 20 } },
              h('li', { style: { marginBottom: 8 } }, 
                h('strong', null, 'Baseline (', baselineCount, ' messages): '), 
                'SOUP analyzes the first ', baselineCount, ' assistant messages to learn the "normal" token distribution pattern. These messages establish the reference - what the assistant\'s output should look like.'
              ),
              h('li', { style: { marginBottom: 8 } }, 
                h('strong', null, 'Comparison window (', windowCount, ' messages): '), 
                'Later messages are grouped into windows of ', windowCount, ' messages each. Each window is compared against the baseline as a batch.'
              ),
              h('li', { style: { marginBottom: 8 } }, 
                h('strong', null, 'KL divergence: '), 
                'SOUP calculates the Kullback-Leibler divergence between each window and the baseline. KL measures how different two probability distributions are. A KL of 0 means identical distributions; larger values mean the output has changed.'
              ),
              h('li', null, 
                h('strong', null, 'Threshold (', THRESHOLDS[preset].toFixed(2), '): '), 
                'If a window\'s KL divergence exceeds this threshold, it counts as one qualifying drift. Lower thresholds (0.05–0.1) are very sensitive; higher thresholds (0.3–0.4) only catch major changes. The default 0.2 balances sensitivity and false positives.'
              ),
            ),
            h('p', { style: { ...styles.body, margin: '12px 0 0' } }, 
              h('strong', null, 'Gentle Mentor: '), 
              'After the first two qualifying drifts, SOUP delivers gentle reminders to the agent. On the third drift, it asks you (the human) whether to reset the counter or continue monitoring.'
            ),
          ) : null,
          h('div', { style: styles.copy },
            h('code', { style: styles.code }, 'qdev-trajectory-drift-soup · version 0.5.3'),
            h('a', {
              href: 'https://github.com/l00p3rl00p/quatrus-scratchpad/tree/main/plugins/qdev-soup-drift',
              target: '_blank', rel: 'noreferrer',
              style: { color: 'var(--dsw-alias-label-primary)', fontSize: 12, lineHeight: '18px' },
            }, 'Source repository'),
          ),
          snapshot.status !== 'ready' ? h('p', { role: 'status', style: styles.body }, `Configuration is ${snapshot.status}.`) : null,
          error ? h('p', { role: 'alert', style: styles.error }, error) : null,
        ),
        h('section', { style: styles.card, 'aria-labelledby': 'soup-master' },
          h('h3', { id: 'soup-master', style: styles.title }, 'Master control'),
          h(SettingRow, { label: 'Enable trajectory monitoring', hint: 'Stops observation and drift calculations when disabled.' },
            h(Toggle, { label: 'Enable trajectory monitoring', checked: enabled, disabled: !writable, onChange: next => set(['enabled'], next) }),
          ),
        ),
        h('section', { style: styles.card, 'aria-labelledby': 'soup-detector' },
          h('h3', { id: 'soup-detector', style: styles.title }, 'Drift detector'),
          h('p', { style: styles.body }, 'Lower thresholds are more sensitive. The numeric threshold is determined by the selected five-position preset.'),
          h(SettingRow, { label: 'Enable detector', hint: 'Continue observing the session while pausing SOUP worker calculations when disabled.' },
            h(Toggle, { label: 'Enable SOUP drift detector', checked: detectorEnabled, disabled: !writable || !enabled, onChange: next => set(['detectorEnabled'], next) }),
          ),
          h(SettingRow, { label: 'Sensitivity', hint: `Position ${preset + 1} of 5 · KL threshold ${THRESHOLDS[preset].toFixed(2)}` },
            h('input', {
              type: 'range', min: 0, max: 4, step: 1, value: preset,
              disabled: !writable || !enabled || !detectorEnabled, 'aria-label': 'Drift sensitivity preset',
              'aria-valuetext': `Position ${preset + 1} of 5, KL threshold ${THRESHOLDS[preset].toFixed(2)}`,
              onChange: event => set(['preset'], Number(event.target.value)),
            }),
          ),
          h(SettingRow, { label: 'Active KL threshold', hint: 'Read-only value supplied by the selected sensitivity preset.' },
            h('output', { style: styles.label, 'aria-live': 'polite' }, THRESHOLDS[preset].toFixed(2)),
          ),
          h(NumberSetting, { label: 'Baseline messages', hint: `First ${baselineCount} assistant messages establish the reference distribution. SOUP learns "normal" from these (1–100).`, value: baselineCount, min: 1, max: 100, disabled: !writable || !enabled || !detectorEnabled, onCommit: next => set(['baselineCount'], next) }),
          h(NumberSetting, { label: 'Comparison window', hint: `Later messages grouped in windows of ${windowCount}. Each window is compared against baseline (1–100).`, value: windowCount, min: 1, max: 100, disabled: !writable || !enabled || !detectorEnabled, onCommit: next => set(['windowCount'], next) }),
        ),
        h('section', { style: styles.card, 'aria-labelledby': 'soup-mentor' },
          h('h3', { id: 'soup-mentor', style: styles.title }, 'Gentle Mentor'),
          h(SettingRow, { label: 'Enable reanchoring', hint: 'Deliver two original-plan reminders, then request human clarification on the third qualifying detection.' },
            h(Toggle, { label: 'Enable Gentle Mentor reanchoring', checked: reanchoring, disabled: !writable || !enabled || !detectorEnabled, onChange: next => set(['reanchoring'], next) }),
          ),
        ),
        h(StatusPanel),
      );
    }

    return {
      name: 'qdev-trajectory-drift-soup-settings',
      inject: ['slots', 'configForms'],
      apply(ctx) {
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section', id: 'soup-trajectory-drift', order: 18, label: 'SOUP Drift',
          inject: () => ({ source: ctx.configForms.get(ENTRY) }),
        }, SoupSettingsSection));
        ctx.effect(() => {
          const disposers = ROW_KEYS.map(key => ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
            name: 'plugins.row.config', key,
          }, SoupConfig)));
          return () => { for (const dispose of disposers.reverse()) dispose(); };
        }, 'qdev-trajectory-drift-soup: native settings and plugin detail configuration');
      },
    };
  },
});
