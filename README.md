# dsh-rainbow-activity

Author: **nzlov**

[简体中文](README.zh-CN.md)

Category-colour decoration for DSH Web's **native process-group headings**, such as “Analysis complete” and “Tools called”.

## 1.5: native summary activity

Removes the whole-row tint. Only native turn, analysis and tool summary buttons get a compact count, ordered colour strip and category legend. One non-empty native reasoning row or identifiable top-level tool call is one step. Nested calls and prose are not counted, and missing history is not guessed. Native labels, arrows, messages and disclosure are unchanged.

### 1.5.1: clearer segments and legend

The wider strip adapts to the step count and conversation pane, with transparent gaps between segments. Each category label and count takes its strip hue, adjusted towards the theme foreground for legibility. System high-contrast mode keeps the text and counts.

### 1.5.2: merge adjacent steps of the same category

Adjacent steps of the same category form one longer block, proportional to the number of steps. Gaps remain only where the category changes. Non-adjacent repeats, execution order and counts are unchanged.

### 1.5.3: half-width colour blocks

The strip's blocks and internal gaps are half as wide. Step proportions, strip height and category counts are unchanged.

### 1.5.4: compact settings

Settings retain the controls, concise feedback, and a five-step, three-category preview. The smaller preview wraps without clipping counts. The chat summaries themselves are unchanged.

## Colours

Choose preset category colours, nine custom accents (thinking, read, search, write, edit, command, web, agent, and other), or theme matching. The native activity kinds map to these accent families. Theme matching mixes category colours with DSH's public semantic accent while preserving differences between categories.

With `@nzlov/dsh-bing-wallpaper` dynamic colours enabled and successfully applied, theme matching follows the wallpaper palette. Otherwise it follows the ordinary DSH theme. The plugin only references public CSS variables; it does not read or change Bing's private state or wallpaper preferences. Host activation alone does not prove browser palette readiness.


## Settings and Agent

Preferences use standard Host settings/configForms, shared across browsers in the current profile and preserved on upgrade. The `rainbow_activity_settings` tool supports:

```json
{"action":"get"}
```

```json
{"action":"update","patch":{"palette":"theme"}}
```

```json
{"action":"update","patch":{"palette":"custom","readColor":"#60a5fa"},"expectedRevision":3}
```

```json
{"action":"reset","expectedRevision":2}
```

The optional revision fences stale writes; reset unsets overrides and restores inheritance.

The legacy fields `density`, `showTiming`, `showSummary`, `maxRows`, and `errorColor` remain accepted only for configuration compatibility. They have no rendering effect and are absent from the dedicated settings page.

## Implementation and development

Runtime range: DSH `>=0.2.2-rc.4 <0.3.0`. **Checked against the installed rc.4 implementation.** This range does not imply that every future version's heading DOM has been verified. Shared Host peers and DSH's React are reused; no second framework bundle.


Reads the public Session and Conversation projections and scopes each heading rule to its session. The plugin manages only its own stylesheet; it does not scan or rewrite Chat DOM or register Chat slots.

These attributes are confirmed in the current rc.4 source; they are **not a documented, permanent cross-version Slot contract**. An incompatible DOM change may make the decoration disappear and should prompt a compatibility review, not a fallback that rewrites messages.

The build needs only Node.js. From the project root:

```sh
npm run build
npm run check
npm pack
```

The generated `client.js` is the DSH client entry and is tracked in Git. Regenerate it after changing client sources. The `.tgz` produced by `npm pack` can be installed locally with the DSH plugin manager and is not committed.

Tests reuse a compatible DSH installation. On Linux or macOS, if the project does not already have `node_modules/@deepseek-ai`:

```sh
DSH_DIR="${DSH_INSTALL_DIR:-$(npm root -g)/@deepseek-ai/dsh}"
test -d "$DSH_DIR/node_modules/@deepseek-ai" && \
  mkdir -p node_modules && \
  ln -s "$DSH_DIR/node_modules/@deepseek-ai" node_modules/@deepseek-ai && \
  npm test
```

Set `DSH_INSTALL_DIR` to the DSH package directory if it is installed elsewhere. If the dependencies are already linked, run `npm test` directly. The dependency link is neither committed nor packaged.

## Verification boundary

Checks cover CSS selector scoping and native-rendering boundaries, the real installed Host SettingsForms path, and lazy bundle initialisation against the actual shared React runtime. They do not substitute for browser verification.

No controllable authenticated browser is available. Actual light/dark appearance, narrow-screen layout, hover/focus icon transitions, group folding, rich tool interactions, and browser console errors require verification after refreshing the existing GUI. Mock pages or static screenshots are not used as evidence of live integration.

[MIT License](LICENSE) · Copyright © 2026 nzlov.
