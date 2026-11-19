# dsh-rainbow-activity

作者：**nzlov**

为 DSH Web 原版“已完成分析”“已调用工具”等**活动分组标题**添加分类配色。

## 1.5：原生汇总进度

撤销整行底色。只在原生分析、工具分组和回合汇总标题后附加步数、按执行顺序排列的多色短条，以及分类计数。每个非空原生思考项、每个可识别的顶层工具调用计一步；不把嵌套调用与正文算进去。历史未加载时不猜测缺失步骤。保留原生文案、箭头、消息和折叠。

### 1.5.1：更清晰的色段和图例

色条随步数和对话区域宽度伸缩，色段之间留出透明间隔。分类名称和数字沿用对应色段的色调，并向主题前景色调整以提升可读性。系统高对比模式仍保留文字和计数。

### 1.5.2：合并连续同类色块

连续同类步骤合并为一个较长色块，长度仍按实际步数计算。间隔只出现在类别切换处；被其他类别隔开的同类步骤不合并，步数和分类计数不变。

### 1.5.3：色块长度减半

彩虹条的色块和内部间隔水平减半，原有步数比例、色条高度和分类计数不变。

### 1.5.4：精简设置页

设置页只保留控件、简短状态与预览。预览使用小字号和五步三分类示例，窄时换行，不会省略步数。聊天里的汇总样式不变。

## 配色

1. **彩色分类**：使用预设分类色。
2. **自定义分类色**：可分别设置思考、读取、搜索、写入、修改、命令、网络、子任务与其他九种分类色；原生活动类别映射到这些配色组。
3. **跟随主题 / 匹配壁纸**：将分类色与 DSH 公开主题强调色混合，跟随主题同时保留分类差异。

安装 `@nzlov/dsh-bing-wallpaper`，开启动态取色并成功加载后，选择第三项即可匹配壁纸主题。未安装、禁用或没有动态配色时使用普通 DSH 主题。本插件仅引用公开 CSS 语义变量，不读取 Bing 私有状态，也不修改它的设置。Host 启用提示不代表浏览器已成功取色。


## 设置与 Agent

配置通过标准 Host `settings` / Client `configForms` 保存到当前 profile，多浏览器共享，升级保留已有设置。工具名为 `rainbow_activity_settings`：

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

`expectedRevision` 可选，过期写入拒绝；`reset` 清除用户覆盖并恢复继承配置。

旧字段 `density`、`showTiming`、`showSummary`、`maxRows`、`errorColor` 仅为兼容已有配置而保留，不参与渲染，也不出现在专用设置页。

## 实现与开发

运行时范围保持为 DSH `>=0.2.2-rc.4 <0.3.0`，**已按当前安装版 rc.4 核对**，不代表已验证这个范围内所有未来版本的标题 DOM。复用 DSH 的 React，不打包第二份框架。


通过公共会话与对话投影读取已加载活动，每个会话限定自己的标题选择器。插件只管理自己的样式，不扫描或改写聊天 DOM，不注册 Chat Slot。

这些 DOM 钩子已在当前 rc.4 源码中确认，但**不是文档承诺的跨版本永久 Slot 契约**。如果未来原生结构变化，装饰可能不再出现，应重新核对兼容性，而不是回退到改写消息的方案。

构建只需要 Node.js；在项目根目录运行：

```sh
npm run build
npm run check
npm pack
```

生成的 `client.js` 是 DSH 客户端入口，随 Git 源码保留。构建或修改客户端源码后，请重新生成它。`npm pack` 生成的 `.tgz` 可通过 DSH 插件管理器本地安装，不提交到 Git。

测试复用兼容的 DSH 安装。以下是在 Linux / macOS 上、项目尚无 `node_modules/@deepseek-ai` 时的准备方式：

```sh
DSH_DIR="${DSH_INSTALL_DIR:-$(npm root -g)/@deepseek-ai/dsh}"
test -d "$DSH_DIR/node_modules/@deepseek-ai" && \
  mkdir -p node_modules && \
  ln -s "$DSH_DIR/node_modules/@deepseek-ai" node_modules/@deepseek-ai && \
  npm test
```

如果 DSH 安装在别处，先将 `DSH_INSTALL_DIR` 指向 DSH 包目录；已有可用的依赖链接时，直接运行 `npm test`。依赖链接不随源码或安装包发布。

## 验证边界

检查范围包括 CSS 选择器限定和原生渲染边界、真实安装版 Host SettingsForms 配置路径，以及基于实际共享 React 的客户端懒加载初始化。这些检查不等同于浏览器视觉验收。

环境没有可控制的已登录浏览器：实际浅 / 深色、窄屏、悬停 / 焦点图标切换、分组折叠、富工具交互及浏览器控制台仍需在现有 GUI 刷新后验收。不会用模拟页面或静态截图冒充实机验证。

[MIT 协议](LICENSE) · 版权所有 © 2026 nzlov。
