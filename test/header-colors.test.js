import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  colorVariables, orderedActivities, collectSummaries, gradientFor, summaryStyles, mountHeaderStyles,
  createLegendMeasure, legendPaint, summaryStyle,
} from '../header-colors.js';

const thinking = { kind: 'assistant-step', data: { blocks: [{ kind: 'reasoning', text: 'thinking' }] } };
const tool = name => ({ kind: 'tool-call', data: { root: { kind: 'tool-result', call: { name }, subCalls: [{ name: 'read' }] } } });
const ordered = ['a', 'b', 'c', 'd', 'e', 'header'];
const sequence = ['thinking', 'command', 'read', 'command', 'edit'];
const groupKey = '["process","same-group-key",null]';
const turn = 42;
const makeViews = (nodes, start = {}) => ({
  get: target => target === 'chat' ? { nodes, locations: { getTurn: () => ordered }, timeline: { turnOrder: [turn], turns: new Map([[turn, { start }]]) } } : undefined,
  grouped: () => ({ entries: [{ kind: 'group', key: groupKey }], groupSource: () => ({ getSnapshot: () => ({ data: { turn }, members: ordered.slice(0, 5).map(key => ({ key })) }) }) }),
});
const nodes = new Map([['a', thinking], ['b', tool('bash')], ['c', tool('read')], ['d', tool('bash')], ['e', tool('edit')], ['header', { kind: 'turn-process' }]]);
const labels = (key, args) => key === 'steps.total' ? `${args.count} 步` : key === 'steps.partial' ? `已载入 ${args.count} 步` : ({ thinking: '思考', command: '命令', read: '读取', edit: '编辑' }[key.split('.')[1]] ?? key);

test('counts loaded activities in native anchor order without regrouping or nested calls', () => {
  const view = makeViews(nodes);
  assert.deepEqual(collectSummaries(view), [{ group: groupKey, sequence, partial: false }, { turn, sequence, partial: false }]);
  assert.deepEqual(orderedActivities(nodes, [{ key: 'a', groupPart: 'response' }, { key: 'b' }, { key: 'a', groupPart: 'reasoning' }, { key: 'b' }]), ['command', 'thinking']);
  const extra = new Map(nodes);
  extra.set('hidden', { ...tool('read'), visibility: 'hidden' });
  extra.set('missingStart', { kind: 'tool-call', data: { root: { kind: 'tool-result', call: null } } });
  extra.set('empty', { kind: 'assistant-step', data: { blocks: [{ kind: 'reasoning', text: '  ' }, { kind: 'text', text: 'not reasoning' }] } });
  assert.deepEqual(orderedActivities(extra, ['hidden', 'missingStart', 'empty'].map(key => ({ key }))), []);
});

test('distinguishes partial history and does not fabricate a turn or an absent Chat view', () => {
  const incomplete = makeViews(nodes, null);
  assert.equal(collectSummaries(incomplete)[1].partial, true);
  const noTurn = new Map(nodes); noTurn.delete('header');
  assert.equal(collectSummaries(makeViews(noTurn)).length, 1);
  assert.deepEqual(collectSummaries({ get: () => undefined }), []);
});

test('preset, custom and theme modes validate colours and use live semantic theme', () => {
  assert.equal(colorVariables({})['--ra-read'], '#60a5fa');
  assert.equal(colorVariables({ palette: 'custom', readColor: '#A1b2C3' })['--ra-read'], '#A1b2C3');
  for (const value of ['red', '#abc', 'var(--inject)', '#ff0000;background:red', '</style><script>', ['#ffffff']]) {
    assert.equal(colorVariables({ palette: 'custom', readColor: value })['--ra-read'], '#60a5fa');
  }
  assert.match(colorVariables({ palette: 'theme' })['--ra-thinking'], /color-mix.*var\(--dsw-alias-brand-primary/);
});

test('strip segments remain in execution order; non-consecutive repeats stay separated', () => {
  const colors = colorVariables({});
  const strip = gradientFor(sequence, colors);
  assert.deepEqual(strip.match(/#[a-f\d]{6}/gi), sequence.map(kind => colors[`--ra-${kind}`]));
  assert.match(strip, /transparent/);
  assert.equal(gradientFor([], colors), 'none');
  assert.equal(gradientFor(['thinking'], colors), 'linear-gradient(to right,#a78bfa,#a78bfa)');
});

test('adjacent equal categories merge with weighted widths, without changing counts', () => {
  const steps = ['read', 'read', 'command', 'read', 'read'];
  const colors = colorVariables();
  const strip = gradientFor(steps, colors);
  assert.equal(strip, 'linear-gradient(to right,#60a5fa 0% calc(40% - min(0.75px,9.6%)),transparent calc(40% - min(0.75px,9.6%)) 40%,#fb923c 40% calc(60% - min(0.75px,9.6%)),transparent calc(60% - min(0.75px,9.6%)) 60%,#60a5fa 60% 100%)');
  assert.equal(gradientFor(['read', 'read'], colors), 'linear-gradient(to right,#60a5fa,#60a5fa)');
  const sameColor = colorVariables({ palette: 'custom', readColor: '#123456', commandColor: '#123456' });
  assert.equal(gradientFor(steps, sameColor).match(/transparent /g).length, 2, 'merge by category, not by configured color');
  const css = summaryStyle('.sample', { sequence: steps }, colors, labels);
  assert.match(css, /content:"5 步"/);
  assert.match(css, /content:"读取 4 · 命令 1"/);
});

test('a 129-step strip keeps its order, visible gutter budget, and pane-relative width', () => {
  const long = Array.from({ length: 129 }, (_, i) => sequence[i % sequence.length]);
  const colors = colorVariables();
  const strip = gradientFor(long, colors);
  assert.deepEqual(strip.match(/#[a-f\d]{6}/gi), long.map(kind => colors[`--ra-${kind}`]));
  assert.equal(strip.match(/transparent /g).length, 128);
  assert.match(strip, /min\(0\.75px,0\.372093/);
  const css = summaryStyle('.sample', { sequence: long }, colors, labels);
  assert.match(css, /--ra-strip-width:min\(124px,clamp\(11px,calc\(16cqi - 18px\),124px\)\)/);
  assert.match(css, /--ra-strip-width:min\(124px,clamp\(11px,calc\(16vw - 18px\),124px\)\)/);
  assert.match(css, /background-size:var\(--ra-strip-width\) 7px/);
  assert.match(css, /padding-inline-end:calc\(var\(--ra-strip-width\) \+ 8px\)/);
  assert.match(summaryStyle('.sample', { sequence: ['read'] }, colors, labels), /--ra-strip-width:min\(12px,/);
  assert.match(summaryStyle('.sample', { sequence }, colors, labels), /--ra-strip-width:min\(25px,/);
});

test('legend uses shared category colours at exact measured label boundaries', () => {
  const seen = [];
  const measure = text => { seen.push(text); return text.length / 2; };
  const items = [{ category: 'read', text: '读取 12' }, { category: 'command', text: '命令 3' }];
  const colors = colorVariables({ palette: 'custom', readColor: '#2468ad', commandColor: '#b96424' });
  const paint = legendPaint(items, colors, measure);
  assert.deepEqual(seen, ['读取 12', '读取 12 · ', '读取 12 · 命令 3']);
  assert.match(paint, /#2468ad 54%.* 0\.0000em 2\.5000em/);
  assert.match(paint, /--dsw-alias-label-secondary,#54616e\) 2\.5000em 4\.0000em/);
  assert.match(paint, /#b96424 54%.* 4\.0000em 6\.0000em/);
  assert.match(paint, /background-size:7\.0000em 100%/);
  assert.match(paint, /background-clip:text;color:transparent/);
  assert.match(legendPaint(items, colorVariables({ palette: 'theme' }), measure), /--dsw-alias-brand-primary/);
  assert.equal(legendPaint(items, colors, undefined), '');
  assert.equal(legendPaint(items, colors, () => 0), '');
});

test('font measurement is limited to detached text, cached, and optional', () => {
  let calls = 0;
  const context = { measureText(text) { calls++; return { width: text.length * 8 }; } };
  const measure = createLegendMeasure({ createElement(tag) {
    assert.equal(tag, 'canvas');
    return { getContext(mode) { assert.equal(mode, '2d'); return context; } };
  } });
  assert.equal(context.font, '600 16px system-ui,sans-serif');
  assert.equal(context.fontKerning, 'none');
  assert.equal(measure('读取 12'), 2.5);
  assert.equal(measure('读取 12'), 2.5);
  assert.equal(calls, 1);
  assert.equal(createLegendMeasure({ createElement: () => ({ getContext: () => null }) }), undefined);
});

test('CSS only adds compact fragments to session-specific native summary buttons', () => {
  const colors = colorVariables({});
  const summaries = collectSummaries(makeViews(nodes));
  const css = summaryStyles('alpha', summaries, colors, labels, text => text.length / 2);
  assert.match(css, /content:"5 步"/);
  assert.match(css, /content:"思考 1 · 命令 2 · 读取 1 · 编辑 1"/);
  assert.equal(css.split('\n').length, 12);
  for (const rule of css.split('\n')) {
    assert.match(rule, /^(?:@[^{}]+\{)*\[data-conversation-session="alpha"\][^{}]+button\[data-(process-activity|turn-process-messages)\][^{}]*::(before|after)\{/);
  }
  assert.match(css, /@media \(forced-colors:none\).*background-clip:text/);
  assert.match(css, /@media \(forced-colors:active\).*padding-inline-end:0/);
  assert.doesNotMatch(css, /data-step-process-body|data-chat-node|box-shadow|background-color|opacity|!important/);
  const other = summaryStyles('beta', summaries, colors, labels);
  assert.notEqual(css, other);
  assert.doesNotMatch(other, /alpha/);
  assert.match(summaryStyles('beta', collectSummaries(makeViews(nodes, null)), colors, labels), /已载入 5 步/);
});

test('quoted identifiers and labels cannot escape generated strings', () => {
  const css = summaryStyles('x"\n[bad]', [{ group: 'y"\\', sequence: ['read'] }], colorVariables(), () => 'a"\nb');
  assert.match(css, /data-conversation-session="x\\22 \\a \[bad\]"/);
  assert.match(css, /data-chat-group-key="y\\22 \\5c "/);
  assert.match(css, /content:"a\\22 \\a b"/);
});

test('installed rc.4 has the matching host selectors and ordered projection contracts', async () => {
  const root = new URL('../node_modules/@deepseek-ai/', import.meta.url);
  const chat = new URL('dsh-client-ui-chat/src/client/', root);
  const conv = new URL('dsh-client-ui-conversation/src/client/', root);
  const [group, turnView, content, projection, groupContract, css] = await Promise.all([
    new URL('chat/ChatGroupSeat.tsx', chat), new URL('chat/TurnProcessNodeView.tsx', chat), new URL('skeleton/ConversationContent.tsx', conv),
    new URL('contract/snapshot.ts', chat), new URL('contract/groups.ts', conv), new URL('chat/ChatGroupSeat.module.css', chat),
  ].map(file => readFile(file, 'utf8')));
  assert.match(group, /data-chat-group-key=\{groupKey\}/);
  assert.match(group, /data-step-process/);
  assert.match(group, /data-process-activity=\{activity\}/);
  assert.match(group, /data-step-process-body/);
  assert.match(turnView, /data-turn-process=\{node.data.turn\}/);
  assert.match(turnView, /data-turn-process-messages=/);
  assert.match(content, /data-conversation-session=\{sessionId\}/);
  assert.match(projection, /ordered Chat Node keys in the turn/);
  assert.match(groupContract, /ordered, non-nested Node references/);
  assert.match(css, /\.title\s*\{\s*display: flex/);
});

function store(initial) {
  let value = initial;
  const listeners = new Set();
  return { listeners, getSnapshot: () => value, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    set(next) { value = next; for (const listener of listeners) listener(); } };
}

test('resource lifecycle syncs settings, loaded snapshots and retained bindings without retaining sessions', async () => {
  let removed = 0;
  const style = { dataset: {}, textContent: '', remove() { removed++; } };
  const document = { createElement(tag) { assert.equal(tag, 'style'); return style; }, head: { append(node) { assert.equal(node, style); } } };
  const form = store({ status: 'loading' });
  const locale = store(null);
  const list = store({ byId: { abc: { retainedBy: { mainView: 1 } }, dormant: { retainedBy: {} }, headless: { retainedBy: { controllerOperation: 1 } } } });
  const snapshot = store({ views: { get: () => undefined } });
  const binding = { sessionId: 'abc' };
  const stop = mountHeaderStyles(document, { form, locale, translate: labels,
    sessions: { list, binding: id => id === 'abc' ? binding : assert.fail(id) },
    uiConversation: { binding: received => { assert.equal(received, binding); return { snapshot }; } },
  });
  await Promise.resolve();
  assert.equal(style.textContent, '');
  form.set({ status: 'ready', value: { enabled: true, palette: 'theme' } });
  await Promise.resolve();
  assert.equal(style.textContent, '');
  assert.equal(snapshot.listeners.size, 1);
  snapshot.set({ views: makeViews(nodes) });
  await Promise.resolve();
  assert.match(style.textContent, /data-conversation-session="abc"/);
  assert.match(style.textContent, /--dsw-alias-brand-primary/);
  list.set({ byId: {} });
  await Promise.resolve();
  assert.equal(snapshot.listeners.size, 0);
  assert.equal(style.textContent, '');
  stop();
  assert.equal(removed, 1);
  assert.equal(form.listeners.size + list.listeners.size + locale.listeners.size, 0);
});
