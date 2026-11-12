# Changelog

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
