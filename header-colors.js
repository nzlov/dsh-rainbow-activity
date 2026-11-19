// Read the host's published Chat projection. Never replace its view or read its DOM.
export const CATEGORIES = Object.freeze(['thinking', 'read', 'search', 'write', 'edit', 'command', 'web', 'agent', 'other']);
export const DEFAULT_COLORS = Object.freeze({
  thinking: '#a78bfa', read: '#60a5fa', search: '#38bdf8', write: '#34d399',
  edit: '#fbbf24', command: '#fb923c', web: '#2dd4bf', agent: '#f472b6', other: '#94a3b8',
});
export const DEFAULT_VIEW = Object.freeze({ enabled: true, palette: 'rainbow' });
export const HEADER_SELECTOR = '[data-step-process] > div > button[data-process-activity]';
export const TURN_SELECTOR = 'button[data-turn-process-messages]';

export function colorVariables(settings = {}) {
  return Object.fromEntries(CATEGORIES.map(category => {
    const fallback = DEFAULT_COLORS[category];
    const saved = settings[`${category}Color`];
    const base = settings.palette === 'theme'
      ? `color-mix(in srgb, ${fallback} 70%, var(--dsw-alias-brand-primary, ${fallback}))`
      : settings.palette === 'custom' && typeof saved === 'string' && /^#[0-9a-f]{6}$/i.test(saved) ? saved : fallback;
    return [`--ra-${category}`, base];
  }));
}

export function toolCategory(name) {
  if (['read', 'read_image'].includes(name)) return 'read';
  if (['grep', 'glob', 'search'].includes(name) || name.endsWith('_inspect')) return 'search';
  if (name === 'write') return 'write';
  if (['edit', 'apply_patch'].includes(name)) return 'edit';
  if (['bash', 'pwsh', 'exec_command', 'write_stdin', 'run_code'].includes(name) || name.startsWith('terminal_')) return 'command';
  if (['web_search', 'web_fetch'].includes(name)) return 'web';
  if (['subagent', 'subagent_fork', 'workflow'].includes(name)) return 'agent';
  return 'other';
}

// The input is already ordered by the native activity anchor, not by category
// or result time. One native reasoning row or top-level tool call is one step.
export function orderedActivities(nodes, entries) {
  const sequence = [];
  const seen = new Set();
  for (const { key, groupPart } of entries) {
    if (groupPart === 'response' || seen.has(key)) continue;
    seen.add(key);
    const node = nodes.get(key);
    if (!node || node.visibility === 'hidden') continue;
    if (node.kind === 'assistant-step' && node.data.blocks.some(block => block.kind === 'reasoning' && block.text.trim() !== '')) {
      sequence.push('thinking');
    } else if (node.kind === 'tool-call') {
      const root = node.data.root;
      const name = root.kind === 'tool-result' ? root.call?.name : root.name;
      if (typeof name === 'string' && name !== '') sequence.push(toolCategory(name));
    }
  }
  return sequence;
}

export function collectSummaries(views) {
  const chat = views.get('chat');
  if (!chat) return [];
  const grouped = views.grouped('chat');
  const summaries = [];
  for (const entry of grouped?.entries ?? []) {
    if (entry.kind !== 'group') continue;
    const group = grouped.groupSource(entry.key).getSnapshot();
    if (!group) continue;
    const sequence = orderedActivities(chat.nodes, group.members);
    if (sequence.length) summaries.push({ group: entry.key, sequence, partial: !chat.timeline.turns.get(group.data.turn)?.start });
  }
  // Only native turn-process nodes get a top-level badge, never arbitrary rows.
  for (const turn of chat.timeline.turnOrder) {
    const keys = chat.locations.getTurn(turn);
    if (!keys.some(key => chat.nodes.get(key)?.kind === 'turn-process')) continue;
    const sequence = orderedActivities(chat.nodes, keys.map(key => ({ key })));
    if (sequence.length) summaries.push({ turn, sequence, partial: !chat.timeline.turns.get(turn)?.start });
  }
  return summaries;
}

// CSS string quoting for session and group identities and localized copy. These
// rules are installed via textContent, never HTML or arbitrary user-supplied CSS.
function cssString(value) {
  return `"${String(value).replace(/["\\\u0000-\u001f\u007f]/g, char => `\\${char.codePointAt(0).toString(16)} `)}"`;
}

// Horizontal scale applies to both the strip and its internal gutters, so
// each painted block retains the same share of the available width.
const STRIP_SCALE = 0.5;

export function gradientFor(sequence, colors) {
  if (!sequence.length) return 'none';
  const stops = [];
  let startIndex = 0;
  // Merge only consecutive steps of the same category. Positions still use
  // the original step indices, so a run's width reflects how many it covers.
  for (let endIndex = 1; endIndex <= sequence.length; endIndex++) {
    const category = sequence[startIndex];
    const last = endIndex === sequence.length;
    if (!last && sequence[endIndex] === category) continue;
    const color = colors[`--ra-${category}`] ?? colors['--ra-other'];
    if (last && startIndex === 0) return `linear-gradient(to right,${color},${color})`;
    const start = startIndex * 100 / sequence.length;
    const end = endIndex * 100 / sequence.length;
    if (last) {
      stops.push(`${color} ${start}% ${end}%`);
    } else {
      // Open a gutter only at a category change. Keep it narrower than one
      // step so a short run is not swallowed in a dense history.
      const edge = `calc(${end}% - min(${1.5 * STRIP_SCALE}px,${48 / sequence.length}%))`;
      stops.push(`${color} ${start}% ${edge}`, `transparent ${edge} ${end}%`);
    }
    startIndex = endIndex;
  }
  return `linear-gradient(to right,${stops.join(',')})`;
}

const LEGEND_FONT = 'system-ui,sans-serif';
const LEGEND_WEIGHT = 600;
const LEGEND_SEPARATOR = ' · ';
const LABEL_PRIMARY = 'var(--dsw-alias-label-primary,#18202a)';
const LABEL_SECONDARY = 'var(--dsw-alias-label-secondary,#54616e)';

export function stripIdealWidth(stepCount) {
  return STRIP_SCALE * Math.min(248, Math.max(24, stepCount * 10));
}

export function legendItems(sequence, t) {
  const counts = new Map();
  for (const category of sequence) counts.set(category, (counts.get(category) ?? 0) + 1);
  return [...counts].map(([category, total]) => ({ category, text: `${t(`legend.${category}`)} ${total}` }));
}

export function legendColor(category, colors) {
  const base = colors[`--ra-${category}`] ?? colors['--ra-other'];
  return `color-mix(in srgb,${base} 54%,${LABEL_PRIMARY})`;
}

// Measure our own generated copy only. The canvas is never mounted and reads
// no Chat element or pixels. Measurements are in em so browser zoom and the
// native chat font-size still scale the legend, and so clipping can't shift hues.
export function createLegendMeasure(document) {
  let context;
  try { context = document.createElement('canvas').getContext('2d'); }
  catch { return undefined; }
  if (!context) return undefined;
  context.font = `${LEGEND_WEIGHT} 16px ${LEGEND_FONT}`;
  context.fontKerning = 'none';
  const widths = new Map();
  return text => {
    if (widths.has(text)) return widths.get(text);
    const width = context.measureText(text).width / 16;
    if (widths.size >= 512) widths.clear();
    widths.set(text, width);
    return width;
  };
}

export function legendPaint(items, colors, measure) {
  if (!measure || !items.length) return '';
  const stops = [];
  let prefix = '';
  let cursor = 0;
  for (const { category, text } of items) {
    if (prefix) {
      prefix += LEGEND_SEPARATOR;
      const edge = measure(prefix);
      stops.push(`${LABEL_SECONDARY} ${cursor.toFixed(4)}em ${edge.toFixed(4)}em`);
      cursor = edge;
    }
    prefix += text;
    const edge = measure(prefix);
    // Keep the strip's category hue, with a higher-contrast text tone on light
    // and dark themes. Leave the separators neutral.
    const color = legendColor(category, colors);
    stops.push(`${color} ${cursor.toFixed(4)}em ${edge.toFixed(4)}em`);
    cursor = edge;
  }
  if (!Number.isFinite(cursor) || cursor <= 0) return '';
  // A trailing stop also keeps a one-category legend a valid gradient.
  stops.push(`${LABEL_SECONDARY} ${cursor.toFixed(4)}em`);
  return `background-image:linear-gradient(to right,${stops.join(',')});background-repeat:no-repeat;background-size:${(cursor + 1).toFixed(4)}em 100%;background-position:left center;-webkit-background-clip:text;background-clip:text;color:transparent`;
}

export function summaryStyle(selector, summary, colors, t, measure) {
  const { sequence, partial } = summary;
  if (!sequence.length) return '';
  const count = t(partial ? 'steps.partial' : 'steps.total', { count: sequence.length });
  const items = legendItems(sequence, t);
  const legend = items.map(item => item.text).join(LEGEND_SEPARATOR);
  const paint = legendPaint(items, colors, measure);
  const width = stripIdealWidth(sequence.length);
  // Append two non-interactive fragments to the existing flex button, after
  // all native children (including the arrow). No styles on the button itself.
  const common = 'pointer-events:none;font-size:.82em;line-height:1.25;white-space:nowrap;min-inline-size:0;overflow:hidden;text-overflow:ellipsis;';
  const spacing = summary.turn !== undefined ? 'margin-inline-start:.6em;' : '';
  const stripWidth = unit => `min(${width}px,clamp(${22 * STRIP_SCALE}px,calc(${32 * STRIP_SCALE}${unit} - ${36 * STRIP_SCALE}px),${248 * STRIP_SCALE}px))`;
  return `${selector}::before{content:${cssString(count)};order:1;${common}${spacing}flex:0 15 auto;font-weight:600;color:var(--dsw-alias-label-primary,currentColor);--ra-strip-width:${stripWidth('vw')};padding-inline-end:calc(var(--ra-strip-width) + 8px);background-image:${gradientFor(sequence, colors)};background-repeat:no-repeat;background-position:right center;background-size:var(--ra-strip-width) 7px}`
    + `\n@supports (inline-size:1cqi){${selector}::before{--ra-strip-width:${stripWidth('cqi')}}}`
    + `\n${selector}::after{content:${cssString(legend)};order:2;${common}${spacing}flex:0 999 auto;max-inline-size:45%;font-family:${LEGEND_FONT};font-weight:${LEGEND_WEIGHT};font-kerning:none;letter-spacing:normal;text-transform:none;direction:ltr;unicode-bidi:isolate;color:${LABEL_SECONDARY}}`
    + (paint ? `\n@media (forced-colors:none){@supports ((background-clip:text) or (-webkit-background-clip:text)) and (color:color-mix(in srgb,red,blue)){${selector}::after{${paint}}}}` : '')
    + `\n${selector}:dir(rtl)::before{background-position:left center}`
    + `\n@media (forced-colors:active){${selector}::before{background-image:none;padding-inline-end:0}}`;
}

export function summaryStyles(sessionId, summaries, colors, t, measure) {
  const session = `[data-conversation-session=${cssString(sessionId)}] `;
  return summaries.map(summary => {
    const selector = summary.group !== undefined
      ? `${session}[data-chat-group-key=${cssString(summary.group)}]${HEADER_SELECTOR}`
      : `${session}${TURN_SELECTOR}[data-turn-process=${cssString(summary.turn)}]`;
    return summaryStyle(selector, summary, colors, t, measure);
  }).join('\n');
}

export function mountHeaderStyles(document, { form, locale, sessions, uiConversation, translate, measureLegend }) {
  const style = document.createElement('style');
  style.dataset.rainbowActivity = 'native-headers';
  document.head.append(style);
  const bindings = new Map();
  const cleanups = [];
  let queued = false;
  let stopped = false;
  function paint() {
    const settings = form.getSnapshot();
    const colors = colorVariables(settings.value);
    const next = settings.status !== 'ready' || settings.value?.enabled === false ? '' : [...bindings].map(([id, record]) =>
      summaryStyles(id, collectSummaries(record.source.getSnapshot().views), colors, translate, measureLegend)).join('\n');
    if (style.textContent !== next) style.textContent = next;
  }
  // Snapshot stores also publish live streaming updates. Coalesce repeated
  // synchronous notifications, and skip stylesheet replacement if unchanged.
  function schedule() {
    if (queued || stopped) return;
    queued = true;
    queueMicrotask(() => { queued = false; if (!stopped) paint(); });
  }
  function reconcile() {
    if (stopped) return;
    const state = form.getSnapshot();
    const active = new Map();
    if (state.status === 'ready' && state.value?.enabled !== false) {
      for (const [id, row] of Object.entries(sessions.list.getSnapshot().byId)) {
        // Skip sessions only retained for commands, projections, or gateway work.
        if (!['mainView', 'sidebarView', 'sidebarChat'].some(source => row.retainedBy?.[source] > 0)) continue;
        const binding = sessions.binding(id);
        if (binding !== undefined) active.set(id, binding);
      }
    }
    for (const [id, record] of bindings) {
      if (active.get(id) === record.binding) continue;
      record.off();
      bindings.delete(id);
    }
    for (const [id, binding] of active) {
      if (bindings.has(id)) continue;
      // Borrow the existing binding. Subscribe to the overall publication;
      // subscribing to a target directly would activate it as a side effect.
      const source = uiConversation.binding(binding).snapshot;
      bindings.set(id, { binding, source, off: source.subscribe(schedule) });
    }
    schedule();
  }
  function dispose() {
    stopped = true;
    for (const off of cleanups) off();
    for (const { off } of bindings.values()) off();
    bindings.clear();
    style.remove();
  }
  try {
    cleanups.push(form.subscribe(reconcile));
    cleanups.push(locale.subscribe(schedule));
    cleanups.push(sessions.list.subscribe(reconcile));
    reconcile();
  } catch (error) { dispose(); throw error; }
  return dispose;
}
