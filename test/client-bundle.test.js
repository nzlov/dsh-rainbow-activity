import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import { evaluatePluginCompatibility } from '@deepseek-ai/dsh-app-boot';

// Real shared React from this installation. Module initialization is not a DOM
// mount or visual/disclosure verification.
async function installedReact() {
  const assets = new URL('../node_modules/@deepseek-ai/dsh-web-frontend/dist/assets/', import.meta.url);
  const files = await readdir(assets).catch(() => []);
  for (const file of files.filter(name => /^index-.*\.js\.map$/.test(name))) {
    const map = JSON.parse(await readFile(new URL(file, assets), 'utf8'));
    const index = map.sources.findIndex(name => /react\/cjs\/react\.production(?:\.min)?\.js$/.test(name));
    if (index < 0 || !map.sourcesContent?.[index]) continue;
    const exports = {};
    vm.runInNewContext(map.sourcesContent[index], { exports, module: { exports }, process: { env: { NODE_ENV: 'production' } } });
    return exports;
  }
}

test('browser asset stays lazy and initializes with the installed shared React', async t => {
  const React = await installedReact();
  if (!React) return t.skip('Installed DSH React source map unavailable');
  const source = await readFile(new URL('../client.js', import.meta.url), 'utf8');
  let module;
  vm.runInNewContext(source, {
    window: { __ModuleLoader__: { load(value) { module = value; } } },
  });
  assert.equal(module.id, 'dsh-rainbow-activity');
  let calls = 0;
  const plugin = module.factory(name => { calls++; assert.equal(name, 'react'); return React; });
  assert.equal(calls, 1);
  assert.equal(typeof plugin.apply, 'function');
  assert.ok(Array.from(plugin.inject).includes('configForms'));
});

test('package and both locales retain the canonical name and author', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.name, 'dsh-rainbow-activity');
  assert.equal(manifest.version, '1.5.5');
  assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-conversation'));
  assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-api-session-controller'));
  assert.equal(manifest.author, 'nzlov');
  assert.ok(!manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-tool'));
  const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8');
  assert.match(patch, /id: rainbow-activity/);
  assert.match(patch, /name: 'dsh-rainbow-activity'/);
  const locales = await Promise.all(['zh', 'en'].map(async locale =>
    JSON.parse(await readFile(new URL(`../locale/${locale}.json`, import.meta.url), 'utf8'))));
  assert.deepEqual(Object.keys(locales[0]).sort(), Object.keys(locales[1]).sort());
  for (const dictionary of locales) {
    assert.equal(dictionary.meta.title, manifest.name);
    for (const key of ['palette.rainbow', 'palette.theme', 'sample.tools', 'reset', 'loading', 'unavailable', 'saveFailed']) assert.ok(dictionary[key]);
    assert.ok(dictionary['sample.tools'].length <= 16, 'the preview title should be short in both locales');
    for (const key of ['segment.sequence', 'collapseDetail', 'showSummary', 'maxRows', 'showTiming', 'density',
      'description', 'themeHint', 'wallpaper.unknown', 'customHint', 'shared', 'preserve']) assert.ok(!(key in dictionary));
  }
});

test('shipped client has no Chat slot replacement, disclosure or per-message presentation code', async () => {
  const source = await readFile(new URL('../client.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /conversation\.chat\.|mountInlineTree|createInlineUI|cloneSlotEntry|useGroupAction|useDisclosure|usePresentation|renderSlot|renderFactorySlot/);
  assert.doesNotMatch(source, /ra-row|ra-summary|ra-sequence|foldCompletedTurns|foldedReplies|stepGrouping|until-found/);
  assert.doesNotMatch(source, /querySelector|getComputedStyle|MutationObserver|innerHTML|addEventListener/);
  const main = await readFile(new URL('../client-main.js', import.meta.url), 'utf8');
  const names = [...main.matchAll(/ctx\.slots\.(?:inject|register)\((?:\{ name: )?'([^']+)'/g)].map(match => match[1]);
  assert.deepEqual(names, ['settings.section', 'settings.section']);
  assert.match(main, /core\.mountHeaderStyles\(document, \{/);
  assert.doesNotMatch(main, /field\('(density|showTiming|showSummary|maxRows)'/);
});

test('settings preview stays compact without borrowing the Chat button layout', async () => {
  const main = await readFile(new URL('../client-main.js', import.meta.url), 'utf8');
  const preview = main.slice(main.indexOf('  function Preview('), main.indexOf('  function Settings('));
  assert.match(main, /\.ra-preview\{[^}]*flex-wrap:wrap[^}]*font-size:13px/);
  assert.doesNotMatch(main, /text-overflow|ellipsis|themeHint|customHint|refreshWallpaper|pluginInventory/);
  assert.doesNotMatch(preview, /h\('button'|summaryStyle|tabIndex/);
  assert.match(preview, /const sequence = \['command', 'command', 'read', 'edit', 'read'\]/);
  assert.match(preview, /t\('steps.total', \{ count: sequence.length \}\)/);
  assert.match(preview, /'aria-hidden': true/);
  assert.match(preview, /core\.gradientFor\(sequence, colors\)/);
  assert.match(preview, /core\.legendItems\(sequence, t\)/);
  assert.match(main, /'aria-live': 'polite'/);
});

test('DSH compatibility range and DSH peer dependencies stay aligned across 0.2.x', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.engines.dsh, '>=0.2.2-rc.4 <0.3.0-0');
  assert.equal(manifest.exports['./package.json'], './package.json');
  assert.equal(manifest.peerDependencies['@deepseek-ai/schemastery'], '^3.19.0');
  const dshPeers = Object.entries(manifest.peerDependencies)
    .filter(([pkg]) => pkg === '@deepseek-ai/dsh' || pkg.startsWith('@deepseek-ai/dsh-'));
  assert.ok(dshPeers.length > 0);
  for (const [pkg, range] of dshPeers) {
    assert.equal(range, manifest.engines.dsh, `${pkg} peer range must match engines.dsh`);
  }
  const peerOnlyManifest = { ...manifest, engines: {} };
  for (const version of ['0.2.2-rc.4', '0.2.2-rc.5', '0.2.2', '0.2.3-rc.1', '0.2.3']) {
    assert.equal(evaluatePluginCompatibility(manifest, {}, version), undefined, `engines.dsh should accept ${version}`);
    assert.equal(evaluatePluginCompatibility(peerOnlyManifest, {}, version), undefined, `dsh peers should accept ${version}`);
  }
  for (const version of ['0.2.2-rc.3', '0.3.0-alpha.1', '0.3.0']) {
    assert.ok(evaluatePluginCompatibility(manifest, {}, version), `engines.dsh should reject ${version}`);
    assert.ok(evaluatePluginCompatibility(peerOnlyManifest, {}, version), `dsh peers should reject ${version}`);
  }
});
