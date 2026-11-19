import { createSettingsService, createSettingsTool } from './settings.js'

export { Config } from './settings.js'
export const name = 'rainbow-activity'
export const inject = ['tools']

/** Register only the Agent adapter; the UI uses standard Host settings/configForms. */
export function apply(ctx) {
  // Optional and fiber-owned, matching the built-in custom Settings pages. A
  // replaced Settings service re-registers this presentation policy automatically.
  ctx.inject(['settings'], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber))
  })
  // tools.register is effect-owned by the injected Cordis context, as with
  // built-in tool plugins. No separate remote, state mirror, or profile writes.
  ctx.tools.register(createSettingsTool(createSettingsService(ctx)))
}
