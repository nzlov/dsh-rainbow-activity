export function createPlugin(React, core, dictionaries) {
  const h = React.createElement;
  const NS = 'rainbow-activity';
  // All layout rules below belong to our Settings page, never the transcript.
  const css = `
.ra-page{color:var(--dsw-alias-label-primary);font:inherit;line-height:1.5;max-width:760px;padding:0 0 24px}
.ra-page *{box-sizing:border-box}.ra-page button,.ra-page select,.ra-page input{font:inherit;color:inherit}
.ra-page button,.ra-page input[type=color]{cursor:pointer}.ra-page button:disabled{cursor:default;opacity:.55}
.ra-page button:focus-visible,.ra-page input:focus-visible,.ra-page select:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:3px}
.ra-page h2{font-size:20px;margin:0 0 8px}.ra-page h3{font-size:14px;margin:0 0 8px}
.ra-card{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:12px 16px;margin:12px 0;background:var(--dsw-alias-bg-layer-1)}
.ra-options{padding-block:4px}
.ra-setting{display:flex;align-items:center;justify-content:space-between;gap:20px;min-height:46px;padding:8px 0;border-bottom:1px solid var(--dsw-alias-border-l1)}
.ra-setting:last-child{border-bottom:0}.ra-setting label{flex:1}.ra-setting select{max-width:55%;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:var(--dsw-alias-bg-layer-2);padding:5px 8px}
.ra-page input[type=checkbox]{width:16px;height:16px;accent-color:var(--dsw-alias-brand-primary)}
.ra-colors{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 18px}.ra-colors input[type=color]{width:38px;height:28px;border:1px solid var(--dsw-alias-border-l2);border-radius:5px;background:none;padding:2px}
.ra-notice,.ra-feedback{font-size:12px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.ra-preview{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;font-size:13px;line-height:1.45;text-align:start}
.ra-preview-title{color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.ra-preview-steps{display:inline-flex;align-items:center;gap:6px;font-weight:600;white-space:nowrap}
.ra-preview-strip{display:block;block-size:7px;flex:none}
.ra-preview-category{font-weight:600;white-space:nowrap}
@media(forced-colors:active){.ra-preview-strip{display:none}}
.ra-foot{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.ra-action{border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-2);padding:5px 9px}
@media(max-width:480px){.ra-colors{grid-template-columns:1fr}.ra-page .ra-setting{gap:10px}}
`;
  function Preview({ settings, t }) {
    const sequence = ['command', 'command', 'read', 'edit', 'read'];
    const colors = core.colorVariables(settings);
    const title = h('span', { className: 'ra-preview-title' }, t('sample.tools'));
    if (!settings.enabled) return h('div', { className: 'ra-preview' }, title);
    return h('div', { className: 'ra-preview' }, title,
      h('span', { className: 'ra-preview-steps' }, t('steps.total', { count: sequence.length }),
        h('span', { className: 'ra-preview-strip', 'aria-hidden': true,
          style: { inlineSize: core.stripIdealWidth(sequence.length), backgroundImage: core.gradientFor(sequence, colors) } })),
      ...core.legendItems(sequence, t).map(({ category, text }) =>
        h('span', { key: category, className: 'ra-preview-category', style: { color: core.legendColor(category, colors) } }, text)));
  }
  function Settings({ usePreferences, saveSetting, resetSettings, t }) {
    const snapshot = usePreferences(s => s);
    const prefs = { ...core.DEFAULT_VIEW, ...snapshot.value };
    const [busy, setBusy] = React.useState(false), [message, setMessage] = React.useState('');
    const group = React.useId();
    const commit = async (operation) => {
      setBusy(true); setMessage(t('saving'));
      try { const accepted = await operation(); setMessage(accepted ? t('saved') : t('refused')); return accepted; }
      catch (error) { setMessage(`${t('saveFailed')} ${error instanceof Error ? error.message : String(error)}`); return false; }
      finally { setBusy(false); }
    };
    const ready = snapshot.status === 'ready' && snapshot.writable;
    const field = (key, control) => h('div', { key, className: 'ra-setting' }, h('label', { htmlFor: `${group}-${key}` }, t(key.startsWith('color.') ? `category.${key.slice(6)}` : key)), control);
    return h('section', { className: 'ra-page', 'aria-label': t('title') }, h('style', null, css),
      h('h2', null, t('title')),
      !ready && h('p', { role: 'status', className: 'ra-notice' }, t(snapshot.status === 'loading' ? 'loading' : 'unavailable')),
      h('div', { className: 'ra-card ra-options' },
        field('enabled', h('input', { id: `${group}-enabled`, type: 'checkbox', checked: Boolean(prefs.enabled), disabled: !ready || busy, onChange: e => void commit(() => saveSetting('enabled', e.target.checked)) })),
        field('palette', h('select', { id: `${group}-palette`, value: prefs.palette, disabled: !ready || busy, onChange: e => void commit(() => saveSetting('palette', e.target.value)) },
          ...['rainbow', 'theme', 'custom'].map(value => h('option', { key: value, value }, t(`palette.${value}`)))))),
      prefs.palette === 'custom' && h('div', { className: 'ra-card' }, h('h3', null, t('customColors')),
        h('div', { className: 'ra-colors' }, ...core.CATEGORIES.map(category => field(`color.${category}`,
          h('input', { id: `${group}-color.${category}`, type: 'color', value: prefs[`${category}Color`] || core.DEFAULT_COLORS[category],
            disabled: !ready || busy, onChange: e => void commit(() => saveSetting(`${category}Color`, e.target.value)) }))))),
      h('div', { className: 'ra-card' }, h('h3', null, t('preview')), h(Preview, { settings: prefs, t })),
      h('div', { className: 'ra-foot' }, h('button', { className: 'ra-action', type: 'button', disabled: !ready || busy, onClick: () => void commit(resetSettings) }, t('reset')),
        h('span', { className: 'ra-feedback', role: 'status', 'aria-live': 'polite' }, message)));
  }
  return {
    inject: ['slots', 'locale', 'configForms', 'sessions', 'uiConversation'],
    apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, dictionaries));
      const form = ctx.configForms.get(NS);
      const measureLegend = core.createLegendMeasure(document);
      const preferences = { getSnapshot: () => form.getSnapshot(), subscribe: listener => form.subscribe(listener) };
      const inject = () => ({ hooks: { preferences },
        saveSetting: (key, value) => form.set(key, value),
        resetSettings: () => form.mutate(['enabled', 'palette', 'density', 'showTiming', 'showSummary', 'maxRows', 'errorColor', ...core.CATEGORIES.map(key => `${key}Color`)].map(key => ({ op: 'unset', path: [key] }))) });
      ctx.effect(() => core.mountHeaderStyles(document, {
        form, locale: ctx.locale, sessions: ctx.sessions, uiConversation: ctx.uiConversation, translate: ctx.locale.bind(NS), measureLegend,
      }));
      ctx.effect(() => {
        const t = ctx.locale.bind(NS);
        const register = () => ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: NS, order: 26, label: () => t('title'), locale: NS, inject }, Settings));
        let stop = register();
        const off = ctx.locale.subscribe(() => { stop(); stop = register(); });
        return () => { off(); stop(); };
      });
    },
  };
}
