import assert from 'node:assert/strict'
import { isDeepStrictEqual } from 'node:util'
import test from 'node:test'
import z from '@deepseek-ai/schemastery'
import SettingsForms from '@deepseek-ai/dsh-settings'
import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import { apply, Config as HostConfig, inject, name } from '../index.js'
import {
  COLOR_KEYS, Config, DEFAULT_SETTINGS, ENTRY_ID, SETTING_KEYS,
  createSettingsService, createSettingsTool,
} from '../settings.js'

const plain = config => Object.fromEntries(Object.entries(config).map(([key, value]) => [key, value.get()]))
const runContext = () => ({ signal: new AbortController().signal })
// Cordis FiberState is a TypeScript const enum, not a JavaScript export. The
// installed SettingsForms runtime checks ACTIVE = 2 in its public entry seam.
const ACTIVE = 2

/**
 * Real installed SettingsForms + an in-memory ConfigEditor seam. This exercises
 * exactly the standard Host form validation/revision paths without touching the
 * active profile, installing a plugin, or starting a server.
 */
function fixture(inherited = {}, initialUser = {}) {
  const effects = []
  const events = []
  const ctx = {
    effect(register) { const dispose = register(); if (dispose) effects.push(dispose); return dispose },
    on() { return () => {} },
    emit(...args) { events.push(args) },
    // No startup/legacy import: tests explicitly drive the real form methods.
    root: { loader: { await: () => new Promise(() => {}) } },
    reflect: { provide(key, value) { ctx[key] = value } },
    get(key) { return this[key] },
  }
  let raw = { ...structuredClone(inherited), ...structuredClone(initialUser) }
  let user = structuredClone(initialUser)
  const entry = {
    id: `include:${ENTRY_ID}`,
    options: { id: ENTRY_ID, name: 'dsh-rainbow-activity', config: raw },
    fiber: {
      uid: 1, state: ACTIVE, runtime: { Config }, ctx,
      effectiveConfig: Config(structuredClone(raw)),
    },
  }
  ctx.fiber = entry.fiber
  ctx.fiber.entry = entry
  let tail = Promise.resolve()
  const editor = {
    writes: 0,
    error: undefined,
    documentPath: '/unused-test-profile/cordis.patch.yml',
    entries: () => [entry],
    configuration: () => [{ entry, inherited: structuredClone(inherited), override: structuredClone(user) }],
    edit(candidate, change) {
      const operation = tail.then(() => {
        assert.equal(candidate, entry)
        if (editor.error) throw editor.error
        const next = change(structuredClone(raw), structuredClone(inherited))
        // The real config editor validates the complete candidate before saving.
        const effective = Config(structuredClone(next))
        raw = structuredClone(next)
        user = isDeepStrictEqual(next, inherited) ? {} : structuredClone(next)
        entry.options.config = raw
        entry.fiber.effectiveConfig = effective
        editor.writes += 1
      })
      tail = operation.catch(() => {})
      return operation
    },
  }
  ctx.configEditor = editor
  const settings = new SettingsForms(ctx)
  const service = createSettingsService(ctx)
  const tool = createSettingsTool(service)
  return { ctx, settings, service, tool, editor, entry, effects, events }
}

test('Host entry exports the exact package entry name and Config schema', () => {
  assert.equal(name, ENTRY_ID)
  assert.equal(HostConfig, Config)
  assert.deepEqual(inject, ['tools'])
  assert.deepEqual(plain(Config({})), DEFAULT_SETTINGS)
})

test('all 16 preferences are volatile and survive the serialized schema round-trip', () => {
  assert.equal(SETTING_KEYS.length, 16)
  assert.equal(COLOR_KEYS.length, 10)
  for (const field of Object.values(Config.dict)) assert.equal(field.meta.volatile, true)
  const hydrated = new z(JSON.parse(JSON.stringify(Config.toJSON())))
  assert.deepEqual(plain(hydrated({})), DEFAULT_SETTINGS)
  assert.throws(() => hydrated({ maxRows: 4.5 }), /multiple/)
  assert.throws(() => hydrated({ readColor: 'red' }), /match/)
})

test('Config enforces booleans, enum membership, integer row bounds and six-digit hex colors', () => {
  for (const candidate of [
    { enabled: 'yes' }, { showTiming: 0 }, { showSummary: 'false' },
    { palette: 'monochrome' }, { density: 'dense' },
    { maxRows: 2 }, { maxRows: 31 }, { maxRows: 8.1 }, { maxRows: '8' }, { maxRows: Infinity },
    ...COLOR_KEYS.flatMap(key => [{ [key]: '#fff' }, { [key]: '#abcdex' }, { [key]: 'red' }, { [key]: 123 }]),
  ]) assert.throws(() => Config(candidate), undefined, JSON.stringify(candidate))
  for (const maxRows of [3, 30]) assert.equal(Config({ maxRows }).maxRows.get(), maxRows)
  assert.equal(Config({ readColor: '#Aa12fF' }).readColor.get(), '#Aa12fF')
})

test('real Host Settings describes the plain entry namespace and all live fields', () => {
  const { settings } = fixture()
  const [descriptor] = settings.describe()
  assert.equal(descriptor.ns, 'rainbow-activity')
  assert.notEqual(descriptor.ns, 'include:rainbow-activity')
  assert.equal(descriptor.applies, 'live')
  assert.deepEqual(descriptor.value, DEFAULT_SETTINGS)
  const schema = new z(descriptor.schema)
  for (const field of Object.values(schema.dict)) assert.notEqual(field.meta.volatile, true)
  assert.deepEqual(schema({}), DEFAULT_SETTINGS)
  assert.throws(() => schema({ maxRows: 31 }))
  assert.throws(() => schema({ thinkingColor: 'url(https://invalid.example)' }))
})

test('get returns detached resolved/base/user data without any writes', () => {
  const { service, editor } = fixture({ palette: 'theme', maxRows: 12 }, { enabled: false })
  const result = service.get()
  assert.equal(result.entryId, ENTRY_ID)
  assert.equal(result.value.enabled, false)
  assert.equal(result.value.maxRows, 12)
  assert.equal(result.base.enabled, true)
  assert.equal(result.base.palette, 'theme')
  assert.deepEqual(result.user, { enabled: false })
  result.value.palette = 'custom'
  result.base.maxRows = 30
  assert.equal(service.get().value.palette, 'theme')
  assert.equal(service.get().base.maxRows, 12)
  assert.equal(editor.writes, 0)
})

test('Agent update uses one atomic Host mutation and preserves unrelated fields', async () => {
  const { service, editor, settings } = fixture()
  const before = service.get()
  const result = await service.update({ enabled: false, palette: 'custom', readColor: '#123456' })
  assert.equal(editor.writes, 1)
  assert.equal(result.value.enabled, false)
  assert.equal(result.value.palette, 'custom')
  assert.equal(result.value.readColor, '#123456')
  assert.equal(result.value.maxRows, 8)
  assert.ok(result.revision > before.revision)
  assert.deepEqual(settings.describe()[0].value, result.value)
})

test('UI standard mutate and Agent tool read/write the same Host state', async () => {
  const { tool, settings, editor } = fixture()
  const before = settings.describe()[0]
  // Equivalent Host operation issued by configForms.set/mutate.
  await settings.mutate(ENTRY_ID, [{ op: 'set', path: ['density'], value: 'comfortable' }], before.revision)
  const read = await tool.execute({ action: 'get' }, runContext())
  assert.equal(read.value.density, 'comfortable')
  const written = await tool.execute({ action: 'update', patch: { showTiming: false, maxRows: 15 } }, runContext())
  assert.deepEqual(written.value, settings.describe()[0].value)
  assert.equal(written.value.showTiming, false)
  assert.equal(written.value.maxRows, 15)
  assert.equal(written.value.density, 'comfortable')
  assert.equal(editor.writes, 2)
})

test('reset restores inherited non-default composition values, not hard-coded defaults', async () => {
  const { service, editor } = fixture({ maxRows: 12, palette: 'theme', readColor: '#111111' })
  await service.update({ maxRows: 25, palette: 'custom', readColor: '#222222', enabled: false })
  const result = await service.reset()
  assert.equal(editor.writes, 2)
  assert.equal(result.value.maxRows, 12)
  assert.equal(result.value.palette, 'theme')
  assert.equal(result.value.readColor, '#111111')
  assert.equal(result.value.enabled, true)
  assert.deepEqual(result.user, {})
})

test('stale Agent and UI revisions reject without saving', async () => {
  const { service, settings, editor } = fixture()
  const stale = service.get().revision
  await service.update({ enabled: false })
  await assert.rejects(service.update({ maxRows: 30 }, stale), { code: 'SETTINGS_CONFLICT' })
  await assert.rejects(service.reset(stale), { code: 'SETTINGS_CONFLICT' })
  await assert.rejects(settings.mutate(ENTRY_ID, [{ op: 'set', path: ['palette'], value: 'theme' }], stale), { code: 'SETTINGS_CONFLICT' })
  assert.equal(editor.writes, 1)
  assert.equal(service.get().value.maxRows, 8)
  assert.equal(service.get().value.enabled, false)
})

test('concurrent callers cannot silently overwrite the same revision', async () => {
  const { service, editor } = fixture()
  const results = await Promise.allSettled([
    service.update({ enabled: false }), service.update({ maxRows: 20 }),
  ])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  const rejected = results.find(result => result.status === 'rejected')
  assert.equal(rejected.reason.code, 'SETTINGS_CONFLICT')
  assert.equal(editor.writes, 1)
})

test('invalid values fail the same complete Host Config validation and remain atomic', async () => {
  const { service, settings, editor } = fixture()
  for (const patch of [{ maxRows: 31 }, { maxRows: 3.5 }, { readColor: 'red' }, { enabled: 'yes' }]) {
    await assert.rejects(service.update(patch))
    await assert.rejects(settings.mutate(ENTRY_ID, Object.entries(patch).map(([key, value]) => ({ op: 'set', path: [key], value }))))
  }
  await assert.rejects(service.update({ enabled: false, maxRows: 31 }))
  assert.deepEqual(service.get().value, DEFAULT_SETTINGS)
  assert.equal(editor.writes, 0)
})

test('adapter rejects empty, unknown or malformed patches and invalid revisions', async () => {
  const { service, editor } = fixture()
  for (const patch of [undefined, null, [], new Map(), {}, { unknown: true }, { enabled: undefined }]) {
    await assert.rejects(service.update(patch))
  }
  for (const revision of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(service.update({ enabled: false }, revision), /expectedRevision/)
    await assert.rejects(service.reset(revision), /expectedRevision/)
  }
  assert.equal(editor.writes, 0)
})

test('configuration-editor rejection propagates rather than claiming a successful save', async () => {
  const { service, editor } = fixture()
  editor.error = new Error('Configuration is overridden by a home patch or command-line overlay')
  await assert.rejects(service.update({ enabled: false }), /overridden/)
  await assert.rejects(service.reset(), /overridden/)
  assert.equal(editor.writes, 0)
  assert.deepEqual(service.get().value, DEFAULT_SETTINGS)
})

test('missing services, missing entry, unavailable namespace and read-only state are explicit failures', async () => {
  const { ctx, service, entry, settings, editor } = fixture()
  ctx.settings = undefined
  assert.throws(service.get, /Host settings service is unavailable/)
  await assert.rejects(service.update({ enabled: false }), /unavailable/)
  ctx.settings = settings
  ctx.fiber.entry = undefined
  assert.throws(service.get, /no profile-owned Host entry/)
  ctx.fiber.entry = entry
  entry.fiber.state = 0
  assert.throws(service.get, /No active configurable Host entry/)
  entry.fiber.state = ACTIVE
  Object.defineProperty(settings, 'writable', { value: false })
  await assert.rejects(service.update({ enabled: false }), /read-only/)
  assert.equal(editor.writes, 0)
})

test('real installed defineTool accepts the schema and validates action/patch arguments', async () => {
  const { tool, editor } = fixture()
  assert.equal(tool.name, 'rainbow_activity_settings')
  assert.equal(tool.parameters.properties.patch.additionalProperties, false)
  assert.equal(tool.parameters.properties.patch.properties.maxRows.type, 'integer')
  for (const args of [
    {}, { action: 'other' }, { action: 'update' },
    { action: 'update', patch: {} }, { action: 'update', patch: { other: true } },
    { action: 'update', patch: { enabled: 'false' } },
    { action: 'update', patch: { palette: 'monochrome' } },
    { action: 'update', patch: { maxRows: 4.5 } },
    { action: 'update', patch: { maxRows: 31 } },
    { action: 'update', patch: { readColor: '#fff' } },
    { action: 'get', patch: { enabled: true } },
    { action: 'get', expectedRevision: 0 },
    { action: 'reset', patch: { enabled: true } },
    { action: 'reset', expectedRevision: -1 },
  ]) await assert.rejects(tool.execute(args, runContext()), undefined, JSON.stringify(args))
  assert.equal(editor.writes, 0)
})

test('get/update/reset tool results conform to the installed tool output schema', async () => {
  const { tool } = fixture()
  for (const args of [
    { action: 'get' },
    { action: 'update', patch: { palette: 'custom', thinkingColor: '#abcdef' } },
    { action: 'reset' },
  ]) {
    const value = await tool.execute(args, runContext())
    assert.deepEqual(validateJsonSchemaValue(tool.output.schema, value, ''), [])
    assert.deepEqual(JSON.parse(tool.output.render(args, value)[0].text), value)
  }
  assert.equal(tool.isConcurrencySafe({ action: 'get' }), true)
  assert.equal(tool.isConcurrencySafe({ action: 'update', patch: { enabled: true } }), false)
})

test('tool cancellation is observed before reading or writing preferences', async () => {
  const { tool, editor } = fixture()
  const controller = new AbortController()
  controller.abort(new Error('test canceled'))
  await assert.rejects(tool.execute({ action: 'update', patch: { enabled: false } }, { signal: controller.signal }), /test canceled/)
  assert.equal(editor.writes, 0)
})

test('apply registers the Agent tool and fiber-owned custom-settings policy, with cleanup', () => {
  const { ctx, settings, effects } = fixture()
  const tools = []
  ctx.tools = { register(tool) { tools.push(tool) } }
  ctx.inject = (required, callback) => {
    assert.deepEqual(required, ['settings'])
    callback(ctx)
  }
  apply(ctx)
  assert.equal(tools.length, 1)
  assert.equal(tools[0].name, 'rainbow_activity_settings')
  assert.equal(settings.describe()[0].autoGenerate, false)
  for (const dispose of effects.toReversed()) dispose()
  assert.equal(settings.describe()[0].autoGenerate, true)
})
