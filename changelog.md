# Changelog

- 修复订阅页无法读取现有订阅源的问题：`filters:` 后不带值（块序列写法）被误判为空列表，导致刷新后列表为空，且新增订阅时会覆盖掉原有条目
- Fixed the subscription page failing to read existing sources: a bare `filters:` line (block-sequence style) was mistaken for an empty list, so the list showed empty after a refresh and adding a new source overwrote the existing entries
- 修复开关打开时滑块停在中部的问题，滑块现在按 MD3 规范停在轨道末端
- Fixed the switch knob resting in the middle when enabled; it now sits at the end of the track as MD3 specifies
- 运行状态指示器改为只显示在顶部应用栏（状态 + 版本同一行），不再在每个分页重复；服务控制按钮移入“设置”分页
- The run status indicator now lives only in the app bar (status and version on one line) instead of repeating on every tab; the service controls moved into the Settings tab
- 项目更名为 AdGuardHomeForFree，模块名称、Release 下载地址与更新检查地址同步指向新仓库
- Renamed the project to AdGuardHomeForFree; the module name, release download URL and update-check URL now point at the new repository
- 新增模块管理页“订阅”分页：可直接增删改 `AdGuardHome.yaml` 中的过滤规则订阅（拦截规则与白名单），支持启用/停用、内置常用规则源一键填入，点击“应用”时自动停止核心、备份为 `.bak`、写入配置并重启核心
- Add a "Sources" tab to the module web UI: manage the filter list subscriptions in `AdGuardHome.yaml` (block and allow), enable or disable each entry, fill in popular lists with one tap, and apply by stopping the core, backing up as `.bak`, writing the config and restarting the core automatically
- 写入前由 `scripts/filters.sh` 校验暂存文件（体积、关键段、必需字段），校验失败不会覆盖现有配置，核心也不会被留在停止状态
- `scripts/filters.sh` validates the staged file (size, required sections, required keys) before replacing the config, so a failed write never clobbers the live config and never leaves the core stopped
- 模块管理页重构为 Material Design 3 风格：底部导航、顶部应用栏、MD3 卡片/按钮/开关/对话框与 Snackbar，并随系统自动切换浅色与深色主题
- Rebuilt the module web UI in Material Design 3 style: bottom navigation, app bar, MD3 cards/buttons/switches/dialogs and snackbars, following the system light or dark theme
- 语言切换改为顶部应用栏按钮，支持 `data-i18n-aria-label`，补齐新增界面的中英文文案
- Language switching moved to an app bar button, added `data-i18n-aria-label` support and completed the Chinese/English strings for the new screens
