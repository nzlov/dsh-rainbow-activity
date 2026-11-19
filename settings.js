import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'

/** Public Host settings namespace: entry.options.id, not Loader's include-prefixed id. */
export const ENTRY_ID = 'rainbow-activity'
export const PALETTES = Object.freeze(['rainbow', 'theme', 'custom'])
export const DENSITIES = Object.freeze(['compact', 'comfortable'])
export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  palette: 'rainbow',
  density: 'compact',
  showTiming: true,
  showSummary: true,
  maxRows: 8,
  thinkingColor: '#a78bfa',
  readColor: '#60a5fa',
  searchColor: '#38bdf8',
  writeColor: '#34d399',
  editColor: '#fbbf24',
  commandColor: '#fb923c',
  webColor: '#2dd4bf',
  agentColor: '#f472b6',
  otherColor: '#94a3b8',
  errorColor: '#f87171',
})
export const SETTING_KEYS = Object.freeze(Object.keys(DEFAULT_SETTINGS))
export const COLOR_KEYS = Object.freeze(SETTING_KEYS.filter(key => key.endsWith('Color')))

const colorSchema = value => z.string().pattern(/^#[0-9a-fA-F]{6}$/).default(value).volatile()

/** Live Host settings. Legacy layout keys remain accepted for upgrade compatibility
 * only; the native-header client never uses them or changes presentation policy. */
export const Config = z.object({
  enabled: z.boolean().default(DEFAULT_SETTINGS.enabled).volatile(),
  palette: z.union([...PALETTES]).default(DEFAULT_SETTINGS.palette).volatile(),
  density: z.union([...DENSITIES]).default(DEFAULT_SETTINGS.density).volatile(),
  showTiming: z.boolean().default(DEFAULT_SETTINGS.showTiming).volatile(),
  showSummary: z.boolean().default(DEFAULT_SETTINGS.showSummary).volatile(),
  maxRows: z.number().step(1).min(3).max(30).default(DEFAULT_SETTINGS.maxRows).volatile(),
  ...Object.fromEntries(COLOR_KEYS.map(key => [key, colorSchema(DEFAULT_SETTINGS[key])])),
})

function assertObject(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new TypeError(`${label} must be a plain object`)
  }
}

function assertRevision(value) {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
    throw new TypeError('expectedRevision must be a non-negative safe integer')
  }
}

/**
 * One adapter over the same SettingsForms service that Client configForms writes.
 * The Host validates complete candidates and persists through configEditor; this
 * adapter deliberately never writes profile files or maintains a second state.
 */
export function createSettingsService(ctx) {
  function owner() {
    const settings = ctx.get('settings')
    if (settings === undefined) throw new Error('Host settings service is unavailable; Rainbow activity settings were not saved')
    const entryId = ctx.fiber?.entry?.options?.id
    if (typeof entryId !== 'string' || entryId.length === 0) {
      throw new Error('Rainbow activity has no profile-owned Host entry; settings cannot be read or saved')
    }
    return { settings, entryId }
  }

  function get() {
    const { settings, entryId } = owner()
    const descriptor = settings.describe().find(item => item.ns === entryId)
    if (descriptor === undefined) throw new Error(`No active configurable Host entry "${entryId}"`)
    return structuredClone({
      entryId,
      value: descriptor.value,
      base: descriptor.base ?? {},
      user: descriptor.user ?? {},
      revision: descriptor.revision,
      writable: settings.writable,
    })
  }

  async function mutate(ops, expectedRevision) {
    assertRevision(expectedRevision)
    const { settings, entryId } = owner()
    // Fence the read/modify/write even when the caller did not supply a revision.
    const before = get()
    if (!before.writable) throw new Error(`Host settings for "${entryId}" are read-only`)
    await settings.mutate(entryId, ops, expectedRevision ?? before.revision)
    return get()
  }

  return Object.freeze({
    get,
    async update(patch, expectedRevision) {
      assertObject(patch, 'patch')
      const keys = Object.keys(patch)
      if (keys.length === 0) throw new TypeError('update requires at least one setting in patch')
      for (const key of keys) {
        if (!SETTING_KEYS.includes(key)) throw new TypeError(`Unknown Rainbow activity setting "${key}"`)
        if (patch[key] === undefined) throw new TypeError(`Setting "${key}" cannot be undefined; use reset to restore inheritance`)
      }
      return mutate(keys.map(key => ({ op: 'set', path: [key], value: patch[key] })), expectedRevision)
    },
    async reset(expectedRevision) {
      // Unset, rather than hard-code defaults: composition values must re-inherit.
      return mutate(SETTING_KEYS.map(key => ({ op: 'unset', path: [key] })), expectedRevision)
    },
  })
}

const valueProperties = Object.fromEntries(SETTING_KEYS.map(key => {
  if (key === 'palette') return [key, { type: 'string', enum: [...PALETTES] }]
  const legacy = 'Legacy compatibility field only. Ignored by native-header decoration; never changes native messages or folding.'
  if (key === 'density') return [key, { type: 'string', enum: [...DENSITIES], description: legacy }]
  if (key === 'maxRows') return [key, { type: 'integer', description: legacy }]
  if (['showTiming', 'showSummary'].includes(key)) return [key, { type: 'boolean', description: legacy }]
  if (key === 'errorColor') return [key, { type: 'string', description: legacy }]
  if (COLOR_KEYS.includes(key)) return [key, { type: 'string', description: 'Custom color in #RRGGBB hexadecimal form; used with the custom palette.' }]
  return [key, { type: 'boolean' }]
}))

/** Real installed dsh-tools defineTool DSL, with Host Config enforcing range/pattern constraints. */
export function createSettingsTool(service) {
  return defineTool({
    name: 'rainbow_activity_settings',
    description: 'Read, update, or reset the activity display on native summaries (enabled, palette, nine category colours). Does not change messages or folding. Legacy layout fields are accepted but ignored. Reset restores inherited settings. Changes apply live to all connected clients.',
    parameters: {
      action: { type: 'string', required: true, enum: ['get', 'update', 'reset'] },
      patch: {
        type: 'object',
        additionalProperties: false,
        properties: valueProperties,
        description: 'Required and non-empty for update only. Supply only the fields to change.',
      },
      expectedRevision: {
        type: 'integer',
        description: 'Optional non-negative revision from get for update or reset. A stale revision rejects the write.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          entryId: { type: 'string', required: true },
          value: {
            type: 'object',
            required: true,
            additionalProperties: false,
            properties: Object.fromEntries(Object.entries(valueProperties).map(([key, schema]) => [key, { ...schema, required: true }])),
          },
          base: { type: 'object', required: true, additionalProperties: true },
          user: { type: 'object', required: true, additionalProperties: true },
          revision: { type: 'integer', required: true },
          writable: { type: 'boolean', required: true },
        },
      },
      render: (_args, result) => [{ type: 'text', text: JSON.stringify(result) }],
    },
    isConcurrencySafe: args => args.action === 'get',
    async execute(args, exec) {
      exec.signal.throwIfAborted()
      if (args.action !== 'update' && args.patch !== undefined) throw new TypeError('patch is only valid for action update')
      if (args.action === 'get') {
        if (args.expectedRevision !== undefined) throw new TypeError('expectedRevision is only valid for update or reset')
        return service.get()
      }
      if (args.action === 'update') return service.update(args.patch, args.expectedRevision)
      if (args.action === 'reset') return service.reset(args.expectedRevision)
      throw new TypeError(`Unknown settings action "${String(args.action)}"`)
    },
  })
}
