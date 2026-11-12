window.__ModuleLoader__.load({
  id: 'qdev-trajectory-drift-soup',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useMemo, useState, useSyncExternalStore } = React;

    const ENTRY = 'qdev-trajectory-drift-soup';
    const THRESHOLDS = [0.05, 0.1, 0.2, 0.3, 0.4];
    const SESSION_STATUS_PATH = '/api/qdev-soup/session-status';
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
      sessionView: { display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', color: 'var(--dsw-alias-label-primary)' },
      sessionHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 11, flexShrink: 0, padding: '9px 14px 8px', borderBottom: '1px solid var(--dsw-alias-border-l2)' },
      sessionHeaderCopy: { display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0, flexWrap: 'wrap' },
      sessionBody: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '9px 14px 18px' },
      sessionGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 400px), 1fr))', gap: 8, maxWidth: 1080 },
      compactCard: { display: 'flex', flexDirection: 'column', padding: '3px 11px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, background: 'var(--dsw-alias-bg-layer-1)' },
      compactCardTitle: { margin: 0, padding: '7px 0 4px', color: 'var(--dsw-alias-label-secondary)', fontSize: 10, lineHeight: '14px', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' },
      compactRow: { display: 'grid', gridTemplateColumns: 'minmax(140px, 1fr) minmax(200px, auto)', alignItems: 'center', gap: 9, minHeight: 39, padding: '4px 0', borderTop: '1px solid var(--dsw-alias-border-l1)' },
      compactMeta: { display: 'flex', alignItems: 'baseline', gap: 5, minWidth: 0, flexWrap: 'wrap' },
      compactControls: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, minWidth: 0, flexWrap: 'wrap' },
      sourceBadge: { display: 'inline-flex', alignItems: 'center', minHeight: 17, padding: '0 6px', borderRadius: 999, background: 'var(--dsw-alias-bg-layer-2)', color: 'var(--dsw-alias-label-secondary)', fontSize: 10, lineHeight: '16px', fontWeight: 650, whiteSpace: 'nowrap' },
      inlineHint: { color: 'var(--dsw-alias-label-secondary)', fontSize: 10, lineHeight: '16px', whiteSpace: 'nowrap' },
      compactButton: { padding: '4px 7px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 6, background: 'var(--dsw-alias-bg-layer-2)', color: 'var(--dsw-alias-label-primary)', font: 'inherit', fontSize: 11, lineHeight: '16px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
      liveCard: { gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 11px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, background: 'var(--dsw-alias-bg-layer-1)' },
      liveHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
      liveMetrics: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 5 },
      liveMetric: { minWidth: 0, padding: '5px 7px', borderRadius: 6, background: 'var(--dsw-alias-bg-layer-2)' },
      liveValue: { display: 'block', overflow: 'hidden', color: 'var(--dsw-alias-label-primary)', fontSize: 13, lineHeight: '18px', fontWeight: 680, textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      liveMeter: { height: 3, marginTop: 4, overflow: 'hidden', borderRadius: 999, background: 'var(--dsw-alias-bg-base)' },
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

    function Toggle({ label, checked, disabled, onChange, prominent = false, compact = false }) {
      if (prominent) {
        const stateColor = checked ? '--dsw-alias-state-success-primary' : '--dsw-alias-state-warn-primary';
        return h('button', {
          type: 'button', role: 'switch', 'aria-label': label, 'aria-checked': checked,
          disabled, onClick: () => { if (!disabled) onChange(!checked); },
          style: {
            display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between', gap: compact ? 6 : 8,
            flexDirection: checked ? 'row-reverse' : 'row', flex: '0 0 auto', minWidth: compact ? 70 : 86, minHeight: compact ? 28 : 34,
            padding: compact ? '4px 7px' : '6px 10px', border: `2px solid var(${stateColor})`, borderRadius: 999,
            backgroundColor: 'var(--dsw-alias-bg-layer-2)',
            background: `color-mix(in srgb, var(${stateColor}) 18%, var(--dsw-alias-bg-layer-2))`,
            color: 'var(--dsw-alias-label-primary)', font: 'inherit', fontSize: compact ? 11 : 12, fontWeight: 750,
            cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
          },
        },
        h('span', { 'aria-hidden': true, style: { width: compact ? 13 : 16, height: compact ? 13 : 16, flex: '0 0 auto', borderRadius: '50%', background: 'currentColor' } }),
        h('span', { 'aria-hidden': true }, checked ? 'ON' : 'OFF'));
      }
      return h('button', {
        type: 'button', role: 'switch', 'aria-label': label, 'aria-checked': checked,
        disabled, onClick: () => { if (!disabled) onChange(!checked); },
        style: {
          position: 'relative', width: compact ? 34 : 42, height: compact ? 20 : 24, flex: '0 0 auto', padding: 0,
          border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 999,
          background: checked ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-bg-layer-2)',
          cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
        },
      }, h('span', {
        'aria-hidden': true,
        style: {
          position: 'absolute', top: compact ? 3 : 3, left: checked ? (compact ? 17 : 21) : 3, width: compact ? 12 : 16, height: compact ? 12 : 16,
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
            h('code', { style: styles.code }, 'qdev-trajectory-drift-soup'),
            h('a', {
              href: 'https://github.com/l00p3rl00p/qdev-dsh-plugins/tree/main/plugins/qdev-soup-drift',
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
            h(Toggle, { label: 'Enable trajectory monitoring', checked: enabled, disabled: !writable, prominent: true, onChange: next => set(['enabled'], next) }),
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
      );
    }

    const SESSION_SETTINGS_PATH = '/api/qdev-soup/session-settings';
    const SESSION_FIELDS = [
      ['enabled', 'Monitoring', 'boolean'],
      ['detectorEnabled', 'Drift detector', 'boolean'],
      ['reanchoring', 'Gentle Mentor', 'boolean'],
      ['preset', 'Sensitivity', 'preset'],
      ['baselineCount', 'Baseline messages', 'number'],
      ['windowCount', 'Comparison window', 'number'],
    ];

    function useSessionLiveStatus(sessionId) {
      const [live, setLive] = useState(null);
      const [error, setError] = useState('');
      const [refreshKey, setRefreshKey] = useState(0);
      useEffect(() => {
        if (!sessionId) { setLive(null); setError(''); return undefined; }
        let active = true;
        let controller;
        let generation = 0;
        setLive(null);
        async function refresh() {
          controller?.abort();
          const requestController = new AbortController();
          controller = requestController;
          const requestGeneration = ++generation;
          const current = () => active && requestGeneration === generation && controller === requestController && !requestController.signal.aborted;
          try {
            const response = await fetch(`${SESSION_STATUS_PATH}?sessionId=${encodeURIComponent(sessionId)}`, {
              credentials: 'same-origin', signal: requestController.signal, headers: { accept: 'application/json' },
            });
            const payload = await response.json();
            if (!current()) return;
            if (!response.ok || !payload.ok) throw new Error(payload.message || payload.error || `Session status returned ${response.status}`);
            if (payload.live?.sessionId !== sessionId) throw new Error('Live status response belongs to a different chat.');
            setLive(payload.live); setError('');
          } catch (cause) {
            if (current() && cause?.name !== 'AbortError') setError(cause instanceof Error ? cause.message : String(cause));
          }
        }
        void refresh();
        const timer = window.setInterval(refresh, 5000);
        return () => { active = false; window.clearInterval(timer); controller?.abort(); };
      }, [sessionId, refreshKey]);
      return { live, error, refresh: () => setRefreshKey(value => value + 1) };
    }

    // Human-readable timestamp for the per-chat card; waits until the chat has activity.
    function formatTime(value) {
      if (typeof value !== 'number') return 'Waiting for session activity';
      return new Date(value).toLocaleString();
    }

    function SessionLiveMetric({ label, value, current, target }) {
      const percent = Number.isFinite(current) && Number.isFinite(target) && target > 0
        ? Math.min(100, Math.round((current / target) * 100)) : null;
      return h('div', { style: styles.liveMetric },
        h('span', { style: styles.inlineHint }, label),
        h('strong', { style: styles.liveValue }, value),
        percent == null ? null : h('div', { style: styles.liveMeter, role: 'progressbar', 'aria-label': label, 'aria-valuemin': 0, 'aria-valuemax': target, 'aria-valuenow': Math.min(current, target) },
          h('span', { style: { display: 'block', width: `${percent}%`, height: '100%', background: 'var(--dsw-alias-brand-primary)' } }),
        ),
      );
    }

    // Human decision after escalation: reset the qualifying-drift count or carry three strikes forward.
    // Posts to the Host's reset-drift-count action, scoped to this chat's sessionId.
    function ResetDecision({ sessionId, disabled, onChanged }) {
      const [working, setWorking] = useState('');
      const [error, setError] = useState('');
      async function choose(reset) {
        if (working || disabled) return;
        setWorking(reset ? 'reset' : 'carry');
        setError('');
        try {
          const response = await fetch('/qdev-soup-drift/status', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'content-type': 'application/json', 'x-qdev-soup-action': 'reset-drift-count' },
            body: JSON.stringify({ action: 'reset-drift-count', sessionId, reset }),
          });
          const payload = await response.json();
          if (!response.ok || !payload.ok) throw new Error(payload.error || payload.result?.reason || `Reset action returned ${response.status}`);
          onChanged?.();
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : String(cause));
        } finally {
          setWorking('');
        }
      }
      return h('div', { style: { ...styles.hero, borderColor: 'var(--dsw-alias-state-warn-primary)' } },
        h('div', { style: styles.copy },
          h('strong', { style: styles.label }, 'Reset the drift count?'),
          h('p', { style: styles.body }, 'Reset gives the corrected trajectory a fresh allowance. Keep carries three strikes forward, so the next qualifying drift escalates immediately.'),
        ),
        h('div', { style: styles.actionRow, role: 'group', 'aria-label': 'Reset accumulated drift count' },
          h('button', { type: 'button', style: { ...styles.button, borderColor: 'var(--dsw-alias-state-success-primary)' }, disabled: Boolean(working) || disabled, onClick: () => choose(true) }, 'Yes — reset to 0'),
          h('button', { type: 'button', style: { ...styles.button, borderColor: 'var(--dsw-alias-state-warn-primary)' }, disabled: Boolean(working) || disabled, onClick: () => choose(false) }, 'No — carry 3 forward'),
        ),
        error ? h('p', { role: 'alert', style: styles.error }, error) : null,
      );
    }

    function SessionLiveCard({ live, error, onChanged }) {
      if (!live) return h('section', { style: styles.liveCard, 'aria-label': 'Live trajectory status' },
        h('div', { style: styles.liveHeader },
          h('h3', { style: styles.compactCardTitle }, 'Live trajectory'),
          h('span', { style: styles.sourceBadge }, error ? 'Unavailable' : 'Loading…'),
        ),
        error ? h('p', { role: 'alert', style: styles.error }, error) : null,
      );
      const trajectory = live.trajectory ?? {};
      const detector = live.detector ?? {};
      const mentor = live.mentor ?? {};
      const effective = live.effective ?? {};
      const result = detector.lastResult;
      const summary = trajectory.state === 'disabled' ? 'Monitoring off'
        : trajectory.state === 'detached' ? 'Chat detached'
          : detector.state === 'disabled' ? 'Detector off'
            : detector.state === 'running' ? 'Evaluating'
            : detector.state === 'error' ? 'Detector error'
              : result?.driftDetected ? 'Drift detected'
                : result ? 'Within threshold'
                  : trajectory.baselineSize < effective.baselineTarget ? 'Building baseline' : 'Monitoring';
      const stateColor = summary === 'Within threshold' || summary === 'Monitoring'
        ? 'var(--dsw-alias-state-success-primary)'
        : summary === 'Drift detected' || summary === 'Detector error'
          ? 'var(--dsw-alias-state-error-primary)'
          : 'var(--dsw-alias-state-warn-primary)';
      const kl = typeof result?.klDivergence === 'number'
        ? `${result.klDivergence.toFixed(4)} / ${Number(result.threshold).toFixed(2)}`
        : `— / ${Number(effective.threshold).toFixed(2)}`;
      return h('section', { style: styles.liveCard, 'aria-label': 'Live trajectory status' },
        h('div', { style: styles.liveHeader },
          h('div', { style: styles.compactMeta },
            h('h3', { style: { ...styles.compactCardTitle, padding: 0 } }, 'Live trajectory'),
            h('strong', { role: 'status', 'aria-live': 'polite', style: { ...styles.label, fontSize: 13, color: stateColor } }, summary),
          ),
          h('span', { style: styles.sourceBadge }, live.attached ? 'Live chat' : 'Stored chat'),
        ),
        h('div', { style: styles.liveMetrics },
          h(SessionLiveMetric, { label: 'Reference', value: `${trajectory.baselineSize ?? 0} / ${effective.baselineTarget ?? '—'}`, current: trajectory.baselineSize, target: effective.baselineTarget }),
          h(SessionLiveMetric, { label: 'Live window', value: `${trajectory.windowSize ?? 0} / ${effective.windowTarget ?? '—'}`, current: trajectory.windowSize, target: effective.windowTarget }),
          h(SessionLiveMetric, { label: 'Latest KL / threshold', value: kl }),
          h(SessionLiveMetric, { label: 'Mentor', value: `${mentor.driftCount ?? 0} drift${mentor.driftCount === 1 ? '' : 's'} · ${mentor.state ?? 'unavailable'}` }),
        ),
        h('span', { style: { ...styles.inlineHint, whiteSpace: 'normal' } }, `${detector.evaluations ?? 0} calculation${detector.evaluations === 1 ? '' : 's'} · ${detector.drifts ?? 0} qualifying drift${detector.drifts === 1 ? '' : 's'} · latest activity ${formatTime(trajectory.lastEventAt)}`),
        h('span', { style: { ...styles.inlineHint, whiteSpace: 'normal' } }, `Accountability: ${mentor.driftCount ?? 0} qualifying drift${mentor.driftCount === 1 ? '' : 's'} · ${mentor.carry ?? 0} carried across turns · two reminders, then escalation`),
        h('p', { style: styles.hint }, 'KL is the difference between recent output and the baseline: 0 means closely aligned, larger values mean more change, and a value above the threshold counts as drift.'),
        detector.averageKlDivergence == null ? null : h('span', { style: { ...styles.inlineHint, whiteSpace: 'normal' } }, `Average KL ${detector.averageKlDivergence.toFixed(4)} · ${detector.averageThresholdRatio.toFixed(1)}× the active threshold`),
        mentor.decisionPending ? h(ResetDecision, { sessionId: live.sessionId, disabled: live.effective?.enabled === false, onChanged }) : null,
        result ? h('span', { style: { ...styles.inlineHint, whiteSpace: 'normal' } }, `Latest calculation: ${result.driftDetected ? 'drift detected' : 'within threshold'} at KL ${kl}`) : null,
        error ? h('p', { role: 'alert', style: styles.error }, error) : null,
      );
    }

    function SessionField({ field, label, type, settings, disabled, mutate }) {
      const overridden = Object.prototype.hasOwnProperty.call(settings.overrides, field);
      const value = overridden ? settings.overrides[field] : settings.base[field];
      const [draft, setDraft] = useState(String(value));
      useEffect(() => setDraft(String(value)), [value]);
      const display = item => typeof item === 'boolean' ? (item ? 'ON' : 'OFF') : String(item);
      const controlLabel = `Chat ${label}`;
      const source = overridden ? 'Chat override' : 'Inherited';
      const comparison = `Global ${display(settings.base[field])} · Effective ${display(settings.effective[field])}`;
      let control;
      if (type === 'boolean') {
        control = h(Toggle, { label: controlLabel, checked: value === true, disabled, prominent: field === 'enabled', compact: true, onChange: next => mutate('set', field, next) });
      } else if (type === 'preset') {
        control = h(React.Fragment, null,
          h('input', {
            type: 'range', min: 0, max: 4, step: 1, value, disabled, 'aria-label': controlLabel,
            'aria-valuetext': `Position ${value + 1} of 5, KL threshold ${THRESHOLDS[value].toFixed(2)}`,
            style: { width: 120 }, onChange: event => mutate('set', field, Number(event.target.value)),
          }),
          h('output', { style: styles.sourceBadge, 'aria-live': 'polite' }, `${value + 1} · ${THRESHOLDS[value].toFixed(2)}`),
        );
      } else {
        control = h(React.Fragment, null,
          h('input', {
            type: type === 'number' ? 'number' : 'text', value: draft, disabled,
            ...(type === 'number' ? { min: 1, max: 100, step: 1 } : {}),
            'aria-label': controlLabel,
            style: { ...styles.input, width: type === 'text' ? 'min(34vw, 320px)' : 64, padding: '4px 7px' },
            onChange: event => setDraft(event.target.value),
            onKeyDown: event => { if (event.key === 'Enter') mutate('set', field, type === 'number' ? Number(draft) : draft.trim()); },
          }),
          h('button', { type: 'button', style: styles.compactButton, disabled, 'aria-label': `Save ${label} for this chat`, onClick: () => mutate('set', field, type === 'number' ? Number(draft) : draft.trim()) }, 'Save'),
        );
      }
      return h('div', { style: styles.compactRow },
        h('div', { style: styles.compactMeta },
          h('span', { style: styles.label }, label),
          h('span', { style: styles.sourceBadge }, source),
          h('span', { style: styles.inlineHint }, comparison),
        ),
        h('div', { style: styles.compactControls },
          control,
          h('button', {
            type: 'button', style: styles.compactButton, disabled: disabled || !overridden,
            'aria-label': `Use global for ${label}`, onClick: () => mutate('unset', field),
          }, 'Use global'),
        ),
      );
    }

    // Live & Mentor: a read-only per-chat glance. It polls only while this view is mounted (every 5 s).
    // part: 'live' shows the trajectory view; 'mentor' shows the Gentle Mentor prompt. Both poll only while mounted.
    function LiveMentorView({ sessionId, part }) {
      const sessionLive = useSessionLiveStatus(sessionId);
      const live = sessionLive.live;
      const history = live?.detector?.history ?? [];
      const markers = live?.detector?.markers ?? [];
      const latest = history.length ? history[history.length - 1].kl : null;
      const threshold = live?.effective?.threshold;
      return h('div', { style: styles.sessionBody },
        h('div', { style: styles.liveHeader },
          h('h3', { style: styles.compactCardTitle }, part === 'mentor' ? 'Mentor' : 'Live'),
          live?.version ? h('span', { style: styles.sourceBadge }, `version ${live.version}`) : null,
          h('button', { type: 'button', style: styles.compactButton, onClick: () => sessionLive.refresh() }, 'Refresh'),
        ),
        part === 'live' ? h(SessionLiveCard, { live, error: sessionLive.error, onChanged: sessionLive.refresh }) : null,
        part === 'live' ? h('div', { style: styles.liveMetrics },
          h(SessionLiveMetric, { label: 'Current drift score (KL)', value: latest == null ? '—' : latest.toFixed(4) }),
          h(SessionLiveMetric, { label: 'Effective threshold', value: threshold == null ? '—' : Number(threshold).toFixed(2) }),
          h(SessionLiveMetric, { label: 'Average KL', value: typeof live?.detector?.averageKlDivergence === 'number' ? live.detector.averageKlDivergence.toFixed(4) : '—' }),
          h(SessionLiveMetric, { label: 'Session events', value: live?.trajectory?.sessionEvents ?? 0 }),
          h(SessionLiveMetric, { label: 'Assistant messages', value: live?.trajectory?.assistantMessages ?? 0 }),
          h(SessionLiveMetric, { label: 'Mentor deliveries', value: markers.filter((marker) => marker.kind !== 'crossing').length }),
        ) : null,
        part === 'live' ? (history.length ? h(KlChart, { history, markers, threshold }) : h('p', { role: 'status', style: styles.hint }, 'Waiting for measurements')) : null,
        part === 'mentor' ? h(GentleMentorSection, { sessionId, live, onSaved: sessionLive.refresh }) : null,
      );
    }

    // Inline SVG only. Colours are the existing DSH alias theme tokens used elsewhere in this file.
    function KlChart({ history, markers, threshold }) {
      const W = 300, H = 120, P = 8;
      const t = Number(threshold) || 0;
      const max = Math.max(t, ...history.map(p => p.kl), 0.0001) * 1.1;
      const x = i => P + (history.length < 2 ? 0 : (i * (W - 2 * P)) / (history.length - 1));
      const y = v => H - P - (v / max) * (H - 2 * P);
      const points = history.map((p, i) => `${x(i).toFixed(1)},${y(p.kl).toFixed(1)}`).join(' ');
      // A marker belongs to the last calculation at or before its time.
      const marks = markers.map(m => {
        let index = -1;
        history.forEach((p, i) => { if (p.at <= m.at) index = i; });
        return index < 0 ? null : { x: x(index), y: y(history[index].kl), kind: m.kind };
      }).filter(Boolean);
      return h('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'KL over recent calculations against the threshold', style: { width: '100%', height: 'auto', display: 'block' } },
        h('line', { x1: P, x2: W - P, y1: y(t), y2: y(t), stroke: 'var(--dsw-alias-state-warn-primary)', strokeDasharray: '4 3' }),
        h('polyline', { points, fill: 'none', stroke: 'var(--dsw-alias-brand-primary)', strokeWidth: 2 }),
        ...marks.map((m, i) => h('circle', { key: i, cx: m.x.toFixed(1), cy: m.y.toFixed(1), r: 3, fill: m.kind === 'crossing' ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-state-warn-primary)' })),
      );
    }

    // Feature 4: the Gentle Mentor prompt for this chat. Each field saves on an explicit click, and a failed save keeps the typed text.
    const MENTOR_ACTION_PATH = '/qdev-soup-drift/status';
    const FIRST_DRIFT_SENTENCE = 'I think what you are doing is interesting; however, I would like to return focus to the current plan.';

    async function saveMentorField(sessionId, field, value) {
      const response = await fetch(MENTOR_ACTION_PATH, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-qdev-soup-action': 'session-mentor' },
        body: JSON.stringify({ sessionId, field, value }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || payload.error || `Save returned ${response.status}`);
    }

    function MentorTextField({ label, value, customized, disabled, onSave }) {
      const [draft, setDraft] = useState(value);
      const [working, setWorking] = useState(false);
      const [error, setError] = useState('');
      async function save(next) {
        setWorking(true); setError('');
        try { await onSave(next); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setWorking(false); }
      }
      return h('div', { style: { display: 'grid', gap: 6, marginTop: 8 } },
        h('div', { style: styles.liveHeader }, h('span', { style: styles.label }, label), h('span', { style: styles.sourceBadge }, customized ? 'chat' : 'default')),
        h('textarea', { 'aria-label': label, value: draft, rows: 3, disabled: disabled || working, onChange: (event) => setDraft(event.target.value), style: { width: '100%', boxSizing: 'border-box', minHeight: 64 } }),
        h('div', { style: styles.actionRow },
          h('button', { type: 'button', style: styles.compactButton, disabled: disabled || working || draft === value, onClick: () => save(draft) }, 'Save'),
          h('button', { type: 'button', style: styles.compactButton, disabled: disabled || working || !customized, onClick: () => save(null) }, 'Use default'),
        ),
        error ? h('p', { role: 'alert', style: styles.error }, error) : null,
      );
    }

    function MentorAmendments({ items, customized, disabled, onSave }) {
      const [list, setList] = useState(items);
      const [entry, setEntry] = useState('');
      const [working, setWorking] = useState(false);
      const [error, setError] = useState('');
      async function save(next) {
        setWorking(true); setError('');
        try { await onSave(next); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setWorking(false); }
      }
      return h('div', { style: { display: 'grid', gap: 6, marginTop: 8 } },
        h('div', { style: styles.liveHeader }, h('span', { style: styles.label }, 'Plan amendments'), h('span', { style: styles.sourceBadge }, customized ? 'chat' : 'default')),
        list.length ? h('ol', { style: { margin: 0, paddingLeft: 20 } }, list.map((item, index) => h('li', { key: `${index}-${item}`, style: styles.body },
          item, ' ', h('button', { type: 'button', style: styles.compactButton, disabled: disabled || working, onClick: () => setList(list.filter((_, i) => i !== index)) }, 'Remove'),
        ))) : h('p', { style: styles.hint }, 'No amendments.'),
        h('div', { style: styles.actionRow },
          h('textarea', { 'aria-label': 'New plan amendment', rows: 3, value: entry, disabled: disabled || working, onChange: (event) => setEntry(event.target.value), style: { flex: 1, boxSizing: 'border-box' } }),
          h('button', { type: 'button', style: styles.compactButton, disabled: disabled || working || !entry.trim() || list.length >= 50, onClick: () => { setList([...list, entry.trim()]); setEntry(''); } }, 'Add'),
        ),
        h('div', { style: styles.actionRow },
          h('button', { type: 'button', style: styles.compactButton, disabled: disabled || working, onClick: () => save(list) }, 'Save amendments'),
          h('button', { type: 'button', style: styles.compactButton, disabled: disabled || working || !customized, onClick: () => save(null) }, 'Use default'),
        ),
        error ? h('p', { role: 'alert', style: styles.error }, error) : null,
      );
    }

    function GentleMentorSection({ sessionId, live, onSaved }) {
      const context = live?.mentor?.context ?? { message: '', plan: '', amendments: [], customized: {} };
      const original = live?.mentor?.originalPlan || 'Waiting for the first user message.';
      const disabled = live?.effective?.enabled === false;
      const save = (field) => async (value) => { await saveMentorField(sessionId, field, value); onSaved?.(); };
      return h('section', { style: styles.compactCard, 'aria-label': 'Gentle Mentor' },
        h('h3', { style: styles.compactCardTitle }, 'Gentle Mentor'),
        disabled ? h('p', { role: 'status', style: styles.hint }, 'Monitoring is OFF; Gentle Mentor edits are read-only.') : null,
        h('p', { style: styles.hint }, `First drift says: "${FIRST_DRIFT_SENTENCE}"`),
        h('p', { style: styles.body }, `Original plan (read-only): ${original}`),
        h(MentorTextField, { key: `message-${context.message ?? ''}`, label: 'Mentor message', value: context.message ?? '', customized: Boolean(context.customized?.message), disabled, onSave: save('message') }),
        h(MentorTextField, { key: `plan-${context.plan ?? ''}`, label: 'Current plan', value: context.plan ?? original, customized: Boolean(context.customized?.plan), disabled, onSave: save('plan') }),
        h(MentorAmendments, { key: `amend-${JSON.stringify(context.amendments ?? [])}`, items: context.amendments ?? [], customized: Boolean(context.customized?.amendments), disabled, onSave: save('amendments') }),
      );
    }

    // Details: its own tab. Telemetry for this chat, read-only, polling only while open.
    function SoupDetailsView({ sessionId }) {
      const sessionLive = useSessionLiveStatus(sessionId);
      const live = sessionLive.live;
      const detector = live?.detector ?? {};
      const trajectory = live?.trajectory ?? {};
      const mentor = live?.mentor ?? {};
      const threshold = Number(live?.effective?.threshold);
      const history = detector.history ?? [];
      const markers = detector.markers ?? [];
      const interventions = markers.filter((marker) => marker.kind !== 'crossing');
      const average = typeof detector.averageKlDivergence === 'number' ? detector.averageKlDivergence : null;
      const ratio = average != null && threshold > 0 ? average / threshold : null;
      const meterColor = ratio == null ? 'var(--dsw-alias-border-l2)' : ratio < 1 ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-state-error-primary)';
      const tile = (label, value, tone) => h('div', { key: label, style: { ...styles.liveMetric, borderLeft: `3px solid ${tone ?? 'var(--dsw-alias-border-l2)'}` } },
        h('span', { style: styles.inlineHint }, label),
        h('strong', { style: styles.liveValue }, String(value)),
      );
      const cell = { padding: '4px 6px', textAlign: 'left', borderTop: '1px solid var(--dsw-alias-border-l2)' };
      const recent = history.slice(-10).reverse();
      return h('div', { style: styles.sessionBody },
        h('div', { style: styles.liveHeader },
          h('h3', { style: styles.compactCardTitle }, 'Details'),
          h('button', { type: 'button', style: styles.compactButton, onClick: () => sessionLive.refresh() }, 'Refresh'),
        ),
        sessionLive.error ? h('p', { role: 'alert', style: styles.error }, sessionLive.error) : null,
        h('div', { style: styles.liveMetrics },
          tile('Calculations', detector.evaluations ?? 0),
          tile('Qualifying drifts', detector.drifts ?? 0, detector.drifts ? 'var(--dsw-alias-state-error-primary)' : null),
          tile('Carried drifts', mentor.carry ?? 0),
          tile('Session events', trajectory.sessionEvents ?? 0),
          tile('Assistant messages', trajectory.assistantMessages ?? 0),
          tile('Mentor deliveries', interventions.length),
        ),
        h('section', { style: styles.compactCard, 'aria-label': 'Average KL against threshold' },
          h('span', { style: styles.label }, 'Average KL against threshold'),
          h('div', { role: 'meter', 'aria-label': 'Average KL against threshold', 'aria-valuemin': 0, 'aria-valuemax': 200, 'aria-valuenow': ratio == null ? 0 : Math.min(200, Math.round(ratio * 100)), style: { height: 8, borderRadius: 4, overflow: 'hidden', background: 'var(--dsw-alias-border-l2)', marginTop: 6 } },
            h('span', { style: { display: 'block', height: '100%', width: `${ratio == null ? 0 : Math.min(100, ratio * 100)}%`, background: meterColor } }),
          ),
          h('span', { style: styles.hint }, average == null ? 'Waiting for measurements' : `${average.toFixed(4)} KL · ${ratio.toFixed(2)}× the threshold of ${threshold.toFixed(2)}`),
        ),
        history.length ? h(KlChart, { history, markers, threshold }) : null,
        h('section', { style: styles.compactCard, 'aria-label': 'Recent calculations' },
          h('span', { style: styles.label }, 'Recent calculations'),
          recent.length ? h('table', { style: { width: '100%', borderCollapse: 'collapse', marginTop: 6 } },
            h('thead', null, h('tr', null, ['Time', 'KL', 'Threshold', 'Result'].map((title) => h('th', { key: title, style: { ...cell, borderTop: 'none', ...styles.inlineHint } }, title)))),
            h('tbody', null, recent.map((point, index) => h('tr', { key: `${point.at}-${index}` },
              h('td', { style: cell }, new Date(point.at).toLocaleTimeString()),
              h('td', { style: cell }, point.kl.toFixed(4)),
              h('td', { style: cell }, point.threshold.toFixed(2)),
              h('td', { style: cell }, h('span', { style: { ...styles.sourceBadge, color: point.drift ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-state-success-primary)' } }, point.drift ? 'drift' : 'within')),
            )))) : h('p', { style: styles.hint }, 'No calculations yet.'),
        ),
        h('section', { style: styles.compactCard, 'aria-label': 'Interventions' },
          h('span', { style: styles.label }, 'Interventions'),
          interventions.length ? h('ol', { style: { margin: '6px 0 0', paddingLeft: 20 } }, interventions.slice(-10).reverse().map((marker, index) => h('li', { key: `${marker.at}-${index}`, style: styles.body },
            h('strong', null, marker.kind), ` · ${new Date(marker.at).toLocaleTimeString()}`,
          ))) : h('p', { style: styles.hint }, 'No interventions yet.'),
        ),
        h('section', { style: styles.compactCard, 'aria-label': 'Current state' },
          h('span', { style: styles.label }, 'Current state'),
          h('p', { style: styles.body }, `Trajectory ${trajectory.state ?? '—'} · Detector ${detector.state ?? '—'} · Mentor ${mentor.state ?? '—'}`),
          h('p', { style: styles.hint }, `Plan amendments: ${(live?.mentor?.context?.amendments ?? []).length || 'none'}`),
        ),
      );
    }

    // Convergence: a SOUP tab. A four-quadrant view of rolling windows over this chat's calculations.
    // Navigational and read-only: quadrants describe the pattern, they do not decide an event.
    // Measurements are normalized so the decision threshold sits at 0.5 (the appendix boundary): r = min(1, KL / (2 * threshold)).
    // Tool evidence (Appendix 11.4): DSH's own tool/call and tool/result session events, read through a uiConversation
    // event definition (the same seam the Trajectory client uses). SOUP records nothing itself.
    const SOUP_TOOLS_TARGET = 'soup-tools';
    let soupUiConversation = null;
    const soupToolDefinition = {
      kind: 'soup-tool-call',
      target: SOUP_TOOLS_TARGET,
      match: (event) => {
        if (event.type === 'tool/call') return { id: String(event.data.callId), role: 'start' };
        if (event.type === 'tool/result') return { id: String(event.data.message?.source?.callId), role: 'update' };
        return null;
      },
      start: (_context, match) => ({ callId: String(match.event.data.callId), name: match.event.data.name, startedAt: match.event.time, endedAt: null, error: false }),
      update: (context, match) => ({ ...context.state, endedAt: match.event.time, error: match.event.data.message?.isError === true }),
      publication: () => 'none',
    };
    function soupToolRecords(sessionId) {
      try {
        const snapshot = soupUiConversation?.binding(sessionId)?.target(SOUP_TOOLS_TARGET)?.getSnapshot();
        if (snapshot === undefined || snapshot === null) return null;
        const list = Array.isArray(snapshot) ? snapshot : Object.values(snapshot);
        return list.filter((record) => record && typeof record.startedAt === 'number');
      } catch (cause) {
        return null;
      }
    }
    function ToolEvidenceSection({ sessionId, chosen }) {
      const from = chosen.slice[0].at;
      const to = chosen.slice[chosen.slice.length - 1].at;
      const records = soupToolRecords(sessionId);
      if (records === null) {
        return h('section', { style: styles.compactCard, 'aria-label': 'Tool calls in this window' },
          h('span', { style: styles.label }, 'Tool calls in this window'),
          h('p', { style: styles.hint }, 'Tool evidence is not available in this view yet.'),
        );
      }
      const inWindow = records.filter((record) => record.startedAt >= from && record.startedAt <= to);
      return h('section', { style: styles.compactCard, 'aria-label': 'Tool calls in this window' },
        h('span', { style: styles.label }, 'Tool calls in this window'),
        inWindow.length
          ? h('ol', { style: { margin: '6px 0 0', paddingLeft: 20 } }, inWindow.map((record, i) => h('li', { key: `${record.callId}-${i}`, style: styles.body },
            h('strong', null, record.name), ` · ${new Date(record.startedAt).toLocaleTimeString()}`,
            record.error ? h('span', { style: styles.error }, ' · failed') : null,
          )))
          : h('p', { style: styles.hint }, 'No tool calls in this window.'),
      );
    }

    const CONVERGENCE_WINDOW = 5;
    const QUADRANT_NOTES = {
      'FOCUSED/LOW': 'Coherent and below the boundary: calm, or riding near the limit (see distance from the boundary).',
      'FOCUSED/HIGH': 'Coherent and at or above the boundary: a focused, elevated signal.',
      'SCATTERED/LOW': 'Scattered and below the boundary: ordinary variation or isolated events.',
      'SCATTERED/HIGH': 'Scattered and at or above the boundary: mixed, conflicting, or multiple events.',
    };
    function convergencePoints(history, threshold) {
      const limit = Number(threshold) > 0 ? Number(threshold) : null;
      if (!limit) return [];
      const norm = (kl) => Math.min(1, Math.max(0, kl / (2 * limit)));
      const points = [];
      for (let end = CONVERGENCE_WINDOW; end <= history.length; end += 1) {
        const slice = history.slice(end - CONVERGENCE_WINDOW, end);
        const values = slice.map((point) => norm(point.kl));
        const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
        const sigma = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
        const coherence = Math.max(0, 1 - 2 * sigma);
        points.push({
          index: points.length, at: slice[slice.length - 1].at, slice, values,
          mean, sigma, coherence, distance: 0.5 - mean,
          crossings: slice.filter((point) => point.drift).length,
          focus: coherence >= 0.5 ? 'FOCUSED' : 'SCATTERED',
          magnitude: mean >= 0.5 ? 'HIGH' : 'LOW',
        });
      }
      points.forEach((point, i) => {
        let run = 0;
        for (let j = i; j >= 0 && points[j].focus === point.focus && points[j].magnitude === point.magnitude; j -= 1) run += 1;
        point.persistence = run;
      });
      return points;
    }
    // Outlier clusters (Appendix 11.3): calculations far from this chat's typical level that agree with each other.
    // Definition used here: an outlier is at least 0.2 from the median normalized value; neighbouring outliers within 0.05 form a cluster of at least two.
    // Descriptive only: a cluster is a pattern to inspect, not an event verdict.
    const OUTLIER_DISTANCE = 0.2;
    const CLUSTER_GAP = 0.05;
    const MIN_CLUSTER = 2;
    function outlierClusters(history, threshold) {
      const limit = Number(threshold) > 0 ? Number(threshold) : null;
      if (!limit || history.length < MIN_CLUSTER) return [];
      const items = history.map((point, index) => ({ index, at: point.at, kl: point.kl, value: Math.min(1, Math.max(0, point.kl / (2 * limit))) }));
      const sorted = items.map((item) => item.value).sort((a, b) => a - b);
      const mid = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
      const outliers = items.filter((item) => Math.abs(item.value - mid) >= OUTLIER_DISTANCE).sort((a, b) => a.value - b.value);
      const groups = [];
      let current = [];
      for (const item of outliers) {
        if (current.length && item.value - current[current.length - 1].value > CLUSTER_GAP) { groups.push(current); current = []; }
        current.push(item);
      }
      if (current.length) groups.push(current);
      return groups.filter((members) => members.length >= MIN_CLUSTER).map((members) => {
        const values = members.map((member) => member.value);
        const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
        const sigma = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
        return { members, mean, median: mid, coherence: Math.max(0, 1 - 2 * sigma), side: mean >= 0.5 ? 'at or above the boundary' : 'below the boundary' };
      });
    }
    function OutlierClustersSection({ history, threshold }) {
      const clusters = outlierClusters(history, threshold);
      return h('section', { style: styles.compactCard, 'aria-label': 'Outlier clusters' },
        h('span', { style: styles.label }, 'Outlier clusters'),
        clusters.length === 0
          ? h('p', { style: styles.hint }, "No outlier cluster in this chat's calculations.")
          : clusters.map((cluster, i) => h('div', { key: i, style: styles.compactRow },
            h('span', { style: styles.body }, `${cluster.members.length} calculations, ${cluster.side}`),
            h('span', { style: styles.hint }, `mean ${cluster.mean.toFixed(3)} · coherence ${cluster.coherence.toFixed(3)} · population median ${cluster.median.toFixed(3)}`),
          )),
        h('p', { style: styles.hint }, 'Outlier: at least 0.2 from the median of normalized values. Cluster: outliers within 0.05 of each other, at least two. Descriptive only.'),
      );
    }

    function ConvergenceView({ sessionId }) {
      const sessionLive = useSessionLiveStatus(sessionId);
      const live = sessionLive.live;
      const threshold = live?.effective?.threshold;
      const history = live?.detector?.history ?? [];
      const points = convergencePoints(history, threshold);
      const [selected, setSelected] = useState(null);
      const chosen = selected != null && points[selected] ? points[selected] : points[points.length - 1] ?? null;
      const W = 300, H = 240, P = 28;
      const x = (magnitude) => P + magnitude * (W - 2 * P);
      const y = (focus) => H - P - focus * (H - 2 * P);
      const colorOf = (point) => point.magnitude === 'HIGH'
        ? (point.focus === 'FOCUSED' ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-state-warn-primary)')
        : 'var(--dsw-alias-brand-primary)';
      const key = chosen ? `${chosen.focus}/${chosen.magnitude}` : null;
      const quadrantRect = (px, py, label) => h('rect', { key: label, x: px, y: py, width: (W - 2 * P) / 2, height: (H - 2 * P) / 2, fill: 'var(--dsw-alias-border-l2)', opacity: 0.25 });
      return h('div', { style: styles.sessionBody },
        h('div', { style: styles.liveHeader },
          h('h3', { style: styles.compactCardTitle }, 'Convergence'),
          h('button', { type: 'button', style: styles.compactButton, onClick: () => sessionLive.refresh() }, 'Refresh'),
        ),
        sessionLive.error ? h('p', { role: 'alert', style: styles.error }, sessionLive.error) : null,
        points.length === 0 ? h('p', { role: 'status', style: styles.hint }, `Waiting for ${CONVERGENCE_WINDOW} calculations`) : null,
        points.length === 0 ? null : h('section', { style: styles.compactCard, 'aria-label': 'Four-quadrant view' },
          h('span', { style: styles.label }, 'Four-quadrant view'),
          h('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Focus against magnitude for rolling windows', style: { width: '100%', height: 'auto', display: 'block', marginTop: 6 } },
            quadrantRect(P, P, 'focused-low'), quadrantRect(W / 2, P, 'focused-high'),
            quadrantRect(P, H / 2, 'scattered-low'), quadrantRect(W / 2, H / 2, 'scattered-high'),
            h('line', { x1: x(0.5), x2: x(0.5), y1: P, y2: H - P, stroke: 'var(--dsw-alias-state-warn-primary)', strokeDasharray: '4 3' }),
            h('text', { x: W / 2, y: P - 8, textAnchor: 'middle', fill: 'currentColor', fontSize: 10 }, 'HIGH FOCUS'),
            h('text', { x: W / 2, y: H - 8, textAnchor: 'middle', fill: 'currentColor', fontSize: 10 }, 'LOW FOCUS'),
            h('text', { x: P, y: H - 8, fill: 'currentColor', fontSize: 10 }, 'LOWER MAGNITUDE'),
            h('text', { x: W - P, y: H - 8, textAnchor: 'end', fill: 'currentColor', fontSize: 10 }, 'HIGHER MAGNITUDE'),
            points.map((point) => h('circle', {
              key: point.index, cx: x(point.mean).toFixed(1), cy: y(point.coherence).toFixed(1),
              r: 4 + Math.min(4, point.crossings), fill: colorOf(point), stroke: chosen && chosen.index === point.index ? 'currentColor' : 'none', strokeWidth: 2,
              style: { cursor: 'pointer' }, role: 'button', 'aria-label': `window ending ${new Date(point.at).toLocaleTimeString()}`,
              onClick: () => setSelected(point.index),
            })),
          ),
        ),
        chosen ? h('section', { style: styles.compactCard, 'aria-label': 'Raw measurements' },
          h('span', { style: styles.label }, 'Raw measurements'),
          h('table', { style: { width: '100%', borderCollapse: 'collapse', marginTop: 6 } },
            h('thead', null, h('tr', null, ['Time', 'KL', 'Normalized', 'Crossed'].map((title) => h('th', { key: title, style: { ...styles.inlineHint, textAlign: 'left', padding: '4px 6px' } }, title)))),
            h('tbody', null, chosen.slice.map((point, i) => h('tr', { key: `${point.at}-${i}` },
              h('td', { style: { padding: '4px 6px' } }, new Date(point.at).toLocaleTimeString()),
              h('td', { style: { padding: '4px 6px' } }, point.kl.toFixed(4)),
              h('td', { style: { padding: '4px 6px' } }, chosen.values[i].toFixed(3)),
              h('td', { style: { padding: '4px 6px' } }, point.drift ? 'yes' : 'no'),
            ))),
          ),
        ) : null,
        chosen ? h('section', { style: styles.compactCard, 'aria-label': 'Statistical measures' },
          h('span', { style: styles.label }, 'Statistical measures'),
          h('p', { style: styles.body }, `Mean ${chosen.mean.toFixed(3)} · dispersion ${chosen.sigma.toFixed(3)} · coherence ${chosen.coherence.toFixed(3)}`),
          h('p', { style: styles.body }, `Distance from the boundary ${chosen.distance.toFixed(3)} · crossings in window ${chosen.crossings} · same quadrant for ${chosen.persistence} window${chosen.persistence === 1 ? '' : 's'}`),
        ) : null,
        chosen ? h('section', { style: styles.compactCard, 'aria-label': 'Interpretation' },
          h('span', { style: styles.label }, 'Interpretation (hypothesis, not a verified event)'),
          h('p', { style: styles.body }, QUADRANT_NOTES[key]),
          chosen.focus === 'FOCUSED' && chosen.magnitude === 'LOW' && chosen.distance < 0.05
            ? h('p', { style: styles.body }, 'Qualified near-boundary signal: focused and just below the boundary. It needs evidence beyond these numbers before it means anything.')
            : null,
          h('p', { style: styles.hint }, 'The detector is unchanged. Its binary decision is shown as crossings above.'),
        ) : null,
        chosen ? h(ToolEvidenceSection, { sessionId, chosen }) : null,
        h(OutlierClustersSection, { history, threshold }),
        chosen ? h('section', { style: styles.compactCard, 'aria-label': 'Evidence available' },
          h('span', { style: styles.label }, 'Evidence available'),
          h('p', { style: styles.hint }, 'SOUP calculations only. Tool calls, decisions, test outcomes and outlier subsets are not in this data yet.'),
        ) : null,
      );
    }

    function SessionSettingsView({ sessionId }) {
      const [settings, setSettings] = useState(null);
      const [loading, setLoading] = useState(false);
      const [working, setWorking] = useState('');
      const [error, setError] = useState('');
      const [view, setView] = useState('settings');
      const scope = React.useRef({ id: sessionId, generation: 0, alive: true, busy: false, controller: null });
      if (scope.current.id !== sessionId) {
        scope.current.controller?.abort();
        scope.current = { id: sessionId, generation: scope.current.generation + 1, alive: true, busy: false, controller: null };
      }
      const visible = settings?.sessionId === sessionId ? settings : null;
      const disabled = loading || Boolean(working) || !visible?.writable || !visible?.masterEnabled;
      const invalidate = () => { scope.current.controller?.abort(); scope.current.generation += 1; scope.current.busy = false; };
      useEffect(() => {
        scope.current.alive = true;
        return () => { scope.current.alive = false; invalidate(); };
      }, []);

      async function request(operation) {
        const owner = scope.current;
        if (!owner.alive || owner.id !== sessionId || owner.busy) return;
        if (operation && (!visible || disabled)) return;
        owner.controller?.abort();
        const controller = new AbortController();
        owner.controller = controller;
        const generation = ++owner.generation;
        const current = () => owner === scope.current && owner.alive && owner.id === sessionId && owner.generation === generation && !controller.signal.aborted;
        owner.busy = true;
        setError('');
        if (operation) setWorking(operation.field);
        else { setLoading(true); setSettings(null); }
        try {
          const response = await fetch(operation ? SESSION_SETTINGS_PATH : `${SESSION_SETTINGS_PATH}?sessionId=${encodeURIComponent(sessionId)}`, {
            credentials: 'same-origin', signal: controller.signal,
            ...(operation ? {
              method: 'POST', headers: { 'content-type': 'application/json', 'x-qdev-soup-action': 'session-settings' },
              body: JSON.stringify({ sessionId, expectedRevision: visible.revision, ...operation }),
            } : { headers: { accept: 'application/json' } }),
          });
          const payload = await response.json();
          if (!current()) return;
          if (payload.settings?.sessionId === sessionId) setSettings(payload.settings);
          if (!response.ok || !payload.ok) throw new Error(payload.message || payload.error || `Session settings returned ${response.status}`);
          if (payload.settings?.sessionId !== sessionId) throw new Error('Session settings response belongs to a different chat. Reload settings.');
        } catch (cause) {
          if (current()) setError(cause instanceof Error ? cause.message : String(cause));
        } finally {
          if (current()) { owner.busy = false; setLoading(false); setWorking(''); }
        }
      }
      useEffect(() => {
        void request();
        return invalidate;
      }, [sessionId]);
      function mutate(op, field, value) {
        if (scope.current.id !== sessionId || !scope.current.alive || scope.current.busy || disabled) return;
        if (op === 'set') {
          const type = SESSION_FIELDS.find(item => item[0] === field)?.[2];
          const valid = type === 'boolean' ? typeof value === 'boolean'
            : type === 'text' ? typeof value === 'string' && value.trim().length > 0
              : Number.isInteger(value) && value >= (type === 'preset' ? 0 : 1) && value <= (type === 'preset' ? 4 : 100);
          if (!valid) { setError(`${SESSION_FIELDS.find(item => item[0] === field)?.[1] ?? field}: enter a valid ${type === 'text' ? 'non-empty interpreter path' : 'whole number within the displayed bounds'}.`); return; }
        }
        return request({ op, field, ...(op === 'set' ? { value } : {}) });
      }
      const overrideCount = visible ? Object.keys(visible.overrides).length : 0;
      const grouped = visible ? [
        ['Controls', SESSION_FIELDS.slice(0, 3)],
        ['Detection', SESSION_FIELDS.slice(3, 6)],
      ] : [];
      return h('main', { style: styles.sessionView, 'aria-label': 'SOUP settings for this chat', 'aria-busy': loading },
        h('header', { style: styles.sessionHeader },
          h('div', { style: styles.sessionHeaderCopy },
            h('h2', { style: styles.title }, 'SOUP settings'),
            h('span', { style: styles.hint }, 'Only this chat'),
            visible ? h('span', { style: styles.sourceBadge }, `${overrideCount} override${overrideCount === 1 ? '' : 's'}`) : null,
          ),
          h('button', { type: 'button', style: styles.compactButton, disabled: loading || Boolean(working), onClick: () => { void request(); } }, loading ? 'Loading…' : 'Reload'),
        ),
        h('div', null,
          h('div', { role: 'group', 'aria-label': 'SOUP view', style: { display: 'flex', gap: 8, marginBottom: 10 } },
            h('button', { type: 'button', 'aria-pressed': view === 'settings', style: styles.compactButton, onClick: () => setView('settings') }, 'Settings'),
            h('button', { type: 'button', 'aria-pressed': view === 'live', style: styles.compactButton, onClick: () => setView('live') }, 'Live'),
            h('button', { type: 'button', 'aria-pressed': view === 'mentor', style: styles.compactButton, onClick: () => setView('mentor') }, 'Mentor'),
            h('button', { type: 'button', 'aria-pressed': view === 'details', style: styles.compactButton, onClick: () => setView('details') }, 'Details'),
            h('button', { type: 'button', 'aria-pressed': view === 'convergence', style: styles.compactButton, onClick: () => setView('convergence') }, 'Convergence'),
          ),
          view === 'convergence' ? h(ConvergenceView, { sessionId }) : view === 'details' ? h(SoupDetailsView, { sessionId }) : view === 'live' || view === 'mentor' ? h(LiveMentorView, { sessionId, part: view }) : h('div', { style: styles.sessionBody },
          loading ? h('p', { role: 'status', style: styles.body }, 'Loading chat settings…') : null,
          visible && !visible.masterEnabled ? h('p', { role: 'status', style: { ...styles.body, marginBottom: 10 } }, 'Global monitoring is OFF. Chat settings are read-only and cannot bypass the global master switch.') : visible && !visible.writable ? h('p', { role: 'status', style: { ...styles.body, marginBottom: 10 } }, 'Chat settings are read-only.') : null,
          visible ? h('div', { style: styles.sessionGrid },
            ...grouped.map(([title, fields]) => h('section', { key: title, style: title === 'Runtime' ? { ...styles.compactCard, gridColumn: '1 / -1' } : styles.compactCard, 'aria-label': `${title} settings` },
              h('h3', { style: styles.compactCardTitle }, title),
              ...fields.map(([field, label, type]) => h(SessionField, { key: field, field, label, type, settings: visible, disabled, mutate })),
              title === 'Detection' ? h('div', { style: styles.compactRow },
                h('div', { style: styles.compactMeta },
                  h('span', { style: styles.label }, 'Effective KL threshold'),
                  h('span', { style: styles.inlineHint }, 'Derived from sensitivity'),
                ),
                h('output', { 'aria-label': 'Chat effective KL threshold', 'aria-live': 'polite', style: styles.sourceBadge }, Number(visible.threshold).toFixed(2)),
              ) : null,
            )),
          ) : null,
          error ? h('p', { role: 'alert', style: { ...styles.error, marginTop: 10 } }, error) : null,
        )),
      );
    }

    function SessionSettingsTab({ sessionId }) {
      return sessionId ? h(SessionSettingsView, { key: String(sessionId), sessionId: String(sessionId) }) : null;
    }

    return {
      name: 'qdev-trajectory-drift-soup-settings',
      inject: ['slots', 'configForms', 'uiConversation'],
      apply(ctx) {
        soupUiConversation = ctx.uiConversation ?? null;
        ctx.uiConversation?.events?.register(soupToolDefinition);
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
        ctx.slots.inject('conversation.view', () => ctx.slots.register({
          name: 'conversation.view', id: 'soup-session-settings', order: 40, label: 'SOUP',
        }, SessionSettingsTab));
      },
    };
  },
});
