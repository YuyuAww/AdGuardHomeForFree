# Changelog

- 项目更名为 **AdGuardHomeForFree**，仓库地址迁移至 `YuyuAww/AdGuardHomeForFree`，模块显示名、打包产物名（`AdGuardHomeForFree_<arch>.zip`）与文档链接同步更新
- Rename the project to **AdGuardHomeForFree** and move the repository to `YuyuAww/AdGuardHomeForFree`; the module display name, packaged ZIP names (`AdGuardHomeForFree_<arch>.zip`) and all documentation links follow the new name
- 模块 id 同步改为 `AdGuardHomeForFree`，安装目录变为 `/data/adb/modules/AdGuardHomeForFree`，按全新模块安装，不再与旧模块共用 id
- The module id is now `AdGuardHomeForFree` and it installs to `/data/adb/modules/AdGuardHomeForFree`; install it as a brand-new module instead of sharing the old id
- WebUI 新增“订阅源”分页：可直接添加、启用/停用、删除 AdGuardHome 的黑名单订阅（写入 `AdGuardHome.yaml` 的 `filters` 段，写入前自动备份为 `.bak`；核心运行时会自动重启核心使配置生效）
- Add a "Subscriptions" tab to the web UI: add, enable/disable and delete AdGuardHome blocklist subscriptions (written to the `filters` section of `AdGuardHome.yaml`, backed up as `.bak` first; the core is restarted automatically while it is running so the change takes effect)
- 移除“密码计算”分页及内置的 bcrypt 实现（`bcrypt.js`），忘记后台密码时改为手动停止核心后编辑配置文件
- Remove the "Password" tab and the built-in bcrypt implementation (`bcrypt.js`); resetting a forgotten panel password now means stopping the core and editing the config file by hand

- 修复软重启后启停模块可能误杀系统进程的严重问题：瞬态 AdGuardHome 进程的 PID 会覆盖 agh.pid，该 PID 被复用到系统进程后，关闭模块会向它发送 SIGTERM（实测击中 system_server）导致设备重启 (#85)
- Fix a critical bug where starting/stopping the module after a soft reboot could kill a system process: a transient AdGuardHome PID overwrote agh.pid, the PID was later reused by a system process, and stopping the module sent it SIGTERM (system_server in practice), rebooting the device (#85)
- 进程身份改为按 /proc/<pid>/comm 校验：重入检测不再依赖 ps，软重启后直接接管仍在运行的核心；确认进程存活后才写入 PID；停止时只终止真正的 AdGuardHome 进程 (#85)
- Identify processes by /proc/<pid>/comm: the re-entry check no longer relies on ps, a core that survived a soft reboot is adopted instead of respawned, the PID is written only after the process is confirmed, and stop only signals real AdGuardHome processes (#85)
- 监听就绪检测先校验进程存活；service.sh 启动前清理残留的 inotifyd；修复 ksud 更新模块描述缺少 KSU_MODULE；安装器不再用 pkill -f 误杀自身 (#85)
- Check process liveness before the DNS listener check, clean up stale inotifyd instances in service.sh, pass KSU_MODULE when updating the module description via ksud, and stop the installer's pkill -f from matching itself (#85)
- 文档拆分为中文 / 英文两个目录，统一以 docs/index.md 作为双语索引
- Split the docs into Chinese / English directories with docs/index.md as the shared bilingual index
- CI 不再上传 Actions 产物，改由单个任务直接打包并发布，安装包统一从 Releases 获取
- CI no longer uploads Actions artifacts; a single job builds and publishes directly, so install packages come only from Releases
