(function () {
    let It = null, rr = 0;
    const ii = "/data/adb/agh";
    const settingsPath = ii + "/settings.conf";
    const binLogPath = ii + "/bin.log";
    const historyLogPath = ii + "/history.log";
    const scriptTool = ii + "/scripts/tool.sh";
    const scriptDebug = ii + "/scripts/debug.sh";
    const debugLogPath = ii + "/debug.log";
    const pidFile = ii + "/bin/agh.pid";
    const yamlPath = ii + "/bin/AdGuardHome.yaml";

    if (typeof ksu < "u" && typeof ksu.exec == "function") { It = ksu; }
    else if (typeof ap < "u" && typeof ap.exec == "function") { It = ap; }

    function exec(cmd) {
        return new Promise((resolve) => {
            if (!It) { resolve({ e: -1, s: "" }); return; }
            const cb = "_mc" + rr++;
            window[cb] = (code, out, err) => {
                delete window[cb];
                resolve({ e: code || 0, s: (out || "").replace(/\r/g, "") });
            };
            It.exec(cmd, "{}", cb);
        });
    }

    const $ = id => document.getElementById(id);
    const t = (key) => window.i18n?.t(key) || key;
    let currentStatus = "checking";
    const elements = {
        statusText: $('status-text'),
        statusContainer: $('status-container'),
        pidBadge: $('pid-badge'),
        version: $('agh-version'),
        logContent: $('log-content'),
        linkPanel: $('btn-link-panel'),
        fields: {
            enable_iptables: $('conf-enable_iptables'),
            block_ipv6_dns: $('conf-block_ipv6_dns'),
            redir_port: $('conf-redir_port'),
            adg_user: $('conf-adg_user'),
            adg_group: $('conf-adg_group')
        }
    };

    function showToast(msg) {
        const t = document.createElement('div');
        t.className = 'toast';
        t.textContent = msg;
        $('toast-container').appendChild(t);
        setTimeout(() => t.remove(), 3000);
    }

    async function refresh() {
        const marker = "::SPLIT::";
        const cmd = `
            [ -f ${pidFile} ] && cat ${pidFile} || echo ""; echo "${marker}";
            cat ${settingsPath} 2>/dev/null; echo "${marker}";
            grep -m1 "address:" ${yamlPath} | sed 's/.*address: *//'; echo "${marker}";
            /data/adb/agh/bin/AdGuardHome --version | head -1 | sed 's/.*version //'
        `;
        const res = await exec(cmd);
        const parts = res.s.split(marker).map(p => p.trim());

        const pid = parts[0];
        const isRunning = pid && /^\d+$/.test(pid);
        document.body.className = isRunning ? 'running' : 'stopped';
        currentStatus = isRunning ? "running" : "stopped";
        elements.statusText.textContent = t(`status.${currentStatus}`);
        if (isRunning) {
            elements.pidBadge.textContent = "PID: " + pid;
            elements.pidBadge.classList.remove('hidden');
        } else {
            elements.pidBadge.classList.add('hidden');
        }

        if (!window._loaded) {
            const conf = {};
            parts[1].split('\n').forEach(l => {
                const kv = l.split('=');
                if (kv.length === 2) conf[kv[0].trim()] = kv[1].trim();
            });
            for (let k in elements.fields) {
                const el = elements.fields[k];
                if (el.type === 'checkbox') el.checked = conf[k] === 'true';
                else el.value = conf[k] || "";
            }
            window._loaded = true;
        }

        window._webAddr = parts[2] || "127.0.0.1:3000";
        elements.version.textContent = (parts[3] || "...");
    }

    $('btn-start').onclick = async () => {
        showToast(t("toast.starting"));
        await exec(`${scriptTool} start`);
        refresh();
    };

    $('btn-stop').onclick = async () => {
        showToast(t("toast.stopping"));
        await exec(`${scriptTool} stop`);
        refresh();
    };

    $('btn-save').onclick = async () => {
        let cmd = "";
        for (let k in elements.fields) {
            const el = elements.fields[k];
            const v = el.type === 'checkbox' ? el.checked : el.value;
            cmd += `sed -i "s/^${k}=.*/${k}=${v}/" ${settingsPath}; `;
        }
        await exec(cmd);
        showToast(t("toast.saved"));
    };

    elements.linkPanel.onclick = () => {
        let addr = window._webAddr || "127.0.0.1:3000";
        if (addr.startsWith(":")) addr = "127.0.0.1" + addr;
        if (addr.startsWith("0.0.0.0")) addr = addr.replace("0.0.0.0", "127.0.0.1");
        window.open(`http://${addr}`, '_blank');
    };

    document.querySelectorAll('[data-tab]').forEach(b => {
        b.onclick = () => {
            document.querySelectorAll('.tab-btn, .tab-content').forEach(el => el.classList.remove('active'));
            b.classList.add('active');
            $('tab-' + b.dataset.tab).classList.add('active');
            if (b.dataset.tab === 'logs') loadLog();
            if (b.dataset.tab === 'subs') loadSubs();
        };
    });

    let logType = 'bin';
    async function loadLog() {
        elements.logContent.textContent = t("toast.loading");
        const path = logType === 'bin' ? binLogPath : historyLogPath;
        const res = await exec(`tail -n 100 ${path}`);
        if (!res.s) {
            elements.logContent.textContent = t("toast.no_logs");
            return;
        }

        // Apply simple highlighting
        const lines = res.s.split('\n').map(line => {
            if (!line.trim()) return "";
            // Highlight Timestamps
            line = line.replace(/^(\d{4}[-/]\d{2}[-/]\d{2}\s\d{2}:\d{2}:\d{2}(\.\d+)?)/, '<span style="color:#888">$1</span>');
            // Highlight Levels
            line = line.replace(/\[(info|INFO|debug|DEBUG)\]/, '[<span style="color:#4CAF50">$1</span>]');
            line = line.replace(/\[(warn|WARN|warning|WARNING)\]/, '[<span style="color:#FFC107">$1</span>]');
            line = line.replace(/\[(error|ERROR|fatal|FATAL)\]/, '[<span style="color:#F44336">$1</span>]');
            // Status icons in history log
            line = line.replace(/(🟢|🔴|🧹|LOG)/g, '<span style="filter:drop-shadow(0 0 2px rgba(255,255,255,0.3))">$1</span>');
            return `<div>${line}</div>`;
        });

        elements.logContent.innerHTML = lines.join('');
        elements.logContent.scrollTop = elements.logContent.scrollHeight;
    }

    document.querySelectorAll('[data-log]').forEach(b => {
        b.onclick = () => {
            document.querySelectorAll('[data-log]').forEach(el => el.classList.remove('active'));
            b.classList.add('active');
            logType = b.dataset.log;
            loadLog();
        };
    });

    $('btn-refresh-log').onclick = loadLog;

    $('btn-debug').onclick = async () => {
        showToast(t("toast.generating"));
        await exec(`${scriptDebug}`);
        showToast(`${t("toast.generated")} ${debugLogPath}`);
    };

    $('btn-open-debug').onclick = async () => {
        // Use system action to open the file instead of internal viewer
        await exec(`am start -a android.intent.action.VIEW -d "file://${debugLogPath}" -t "text/plain" || am start -a android.intent.action.VIEW -d "content://com.android.externalstorage.documents/document/primary%3A${debugLogPath.replace(/^\/data\/adb\//, 'adb/')}" -t "text/plain"`);
        showToast(t("toast.opening_file"));
    };

    // ==================== 订阅源 (AdGuardHome.yaml · filters) ====================

    const subsEl = {
        list: $('subs-list'),
        url: $('sub-url'),
        name: $('sub-name'),
        add: $('btn-sub-add')
    };

    /** 当前解析出的 filters 段：{ range, items }，range 为 null 表示文件里没有该段 */
    let subState = null;
    let subBusy = false;
    let subDelArmed = 0;

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[c]);
    }

    async function readYamlLines() {
        const res = await exec(`cat ${yamlPath}`);
        if (!res.s) return null;
        return res.s.split('\n');
    }

    /** 取出 YAML 标量的值：去掉成对引号（含转义）与行内注释 */
    function yamlValue(raw) {
        let v = String(raw == null ? '' : raw).trim();
        const q = v.charAt(0);
        const end = v.lastIndexOf(q);
        if ((q === '"' || q === "'") && end > 0) {
            const inner = v.slice(1, end);
            // 单引号标量里 '' 表示一个字面单引号；双引号标量里是反斜杠转义
            if (q === "'") return inner.replace(/''/g, "'");
            return inner.replace(/\\(["'\\ntr])/g, (m, c) => (
                { '"': '"', "'": "'", '\\': '\\', n: '\n', r: '\r', t: '\t' }[c]
            ));
        }
        const c = v.indexOf(' #');
        if (c >= 0) v = v.slice(0, c);
        return v.trim();
    }

    /** 输出成合法的 YAML 标量：只有安全的普通标量才不加引号 */
    function yamlScalar(v) {
        v = String(v == null ? '' : v);
        if (v === '') return '""';
        const plain = /^[A-Za-z0-9_./:%@?&=+-]+$/.test(v);
        const reserved = /^[-+]?\d+(\.\d+)?$/.test(v) || /^(true|false|null|yes|no|on|off)$/i.test(v);
        if (plain && !reserved) return v;
        return "'" + v.replace(/'/g, "''") + "'";
    }

    /** 定位 filters 段：start 为 "filters:" 所在行，end 为下一段起始行 */
    function findFiltersRange(lines) {
        let start = -1;
        for (let i = 0; i < lines.length; i++) {
            if (/^filters:([ \t]*\[\s*\])?[ \t]*(#.*)?$/.test(lines[i])) { start = i; break; }
        }
        if (start < 0) return null;

        let end = lines.length;
        for (let i = start + 1; i < lines.length; i++) {
            if (/^[^\s#]/.test(lines[i])) { end = i; break; }
        }
        return { start: start, end: end };
    }

    function setFilterField(item, key, raw) {
        const v = yamlValue(raw);
        if (key === 'enabled') item.enabled = v === 'true';
        else if (key === 'url') item.url = v;
        else if (key === 'name') item.name = v;
        else if (key === 'id') item.id = v;
        else return false;
        return true;
    }

    /**
     * 解析 filters 段里的每个订阅
     * extra 保留本页不认识的字段（原样回写），避免丢配置
     */
    function parseFilters(lines, range) {
        const items = [];
        let cur = null;
        for (let i = range.start + 1; i < range.end; i++) {
            const line = lines[i];
            if (!line.trim() || /^[ \t]*#/.test(line)) continue;

            let m = /^[ \t]*-[ \t]*(\w+)[ \t]*:[ \t]*(.*)$/.exec(line);
            if (m) {
                cur = { enabled: false, url: '', name: '', id: '', extra: [] };
                items.push(cur);
                if (!setFilterField(cur, m[1], m[2])) cur.extra.push('    ' + m[1] + ': ' + m[2]);
                continue;
            }
            m = /^[ \t]+(\w+)[ \t]*:[ \t]*(.*)$/.exec(line);
            if (m && cur && !setFilterField(cur, m[1], m[2])) cur.extra.push(line);
        }
        return items;
    }

    /** 新订阅的 id：AdGuardHome 用秒级时间戳做 id，重复会撞缓存文件名 */
    function newFilterId(items) {
        let id = Math.floor(Date.now() / 1000);
        const used = {};
        items.forEach((it) => { used[String(it.id)] = true; });
        while (used[String(id)]) id++;
        return id;
    }

    /** 把订阅列表重新序列化成 filters 段的行 */
    function buildFiltersLines(items) {
        if (!items.length) return ['filters: []'];

        const out = ['filters:'];
        items.forEach((it) => {
            out.push('  - enabled: ' + (it.enabled ? 'true' : 'false'));
            out.push('    url: ' + yamlScalar(it.url));
            out.push('    name: ' + yamlScalar(it.name));
            out.push('    id: ' + (it.id || newFilterId(items)));
            it.extra.forEach((l) => out.push(l));
        });
        return out;
    }

    /** 用新的 filters 段替换旧段；文件里没有 filters 时插到 whitelist_filters 前 */
    function spliceFilters(lines, range, items) {
        const section = buildFiltersLines(items);
        if (range) return lines.slice(0, range.start).concat(section, lines.slice(range.end));

        let idx = -1;
        for (let i = 0; i < lines.length; i++) {
            if (/^whitelist_filters:/.test(lines[i])) { idx = i; break; }
        }
        if (idx < 0) idx = lines.length;

        const head = lines.slice(0, idx);
        if (head.length && head[head.length - 1].trim() !== '') head.push('');
        return head.concat(section, lines.slice(idx));
    }

    function normText(s) {
        return String(s == null ? '' : s).replace(/\r/g, '').replace(/\s+$/, '');
    }

    function utf8Len(s) {
        if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s).length;
        return unescape(encodeURIComponent(s)).length;
    }

    /** 校验刚写入的配置是否与预期完全一致（先比字节数，再逐字比对） */
    async function verifyYaml(content) {
        const want = utf8Len(content);
        const wc = await exec(`wc -c < '${yamlPath}'`);
        const got = parseInt((wc.s.match(/\d+/) || [''])[0], 10);
        if (got === want) return true;
        const back = await exec(`cat '${yamlPath}'`);
        return normText(back.s) === normText(content);
    }

    /**
     * 把要写入的内容变成一个单行的 printf 实参：
     * 先做 %b 层转义（反斜杠加倍、换行/回车变成 \n \r），再做 shell 单引号转义，
     * 这样整条命令没有任何换行，环境把命令按行拆开也照样能写对。
     */
    function shellPrintfArg(content) {
        return "'" + String(content)
            .replace(/\\/g, '\\\\')
            .replace(/\r/g, '\\r')
            .replace(/\n/g, '\\n')
            .replace(/'/g, "'\\''") + "'";
    }

    /**
     * 覆写配置文件，写完校验，对不上就从 .bak 还原，
     * 绝不给 AdGuardHome 留下半截配置。
     * 先用 heredoc（内容原样写入，最直观）；个别环境会把命令按行拆开导致
     * heredoc 失效，此时退回单行 printf 再写一次。
     */
    async function writeYamlFile(content) {
        const delim = 'DSH_YAML_EOF_' + Date.now().toString(36) + Math.floor(Math.random() * 1e9).toString(36);
        await exec(`cp -f '${yamlPath}' '${yamlPath}.bak'`);

        await exec(`cat > '${yamlPath}' <<'${delim}'\n${content}${delim}\n`);
        if (await verifyYaml(content)) return true;

        await exec(`printf '%b' ${shellPrintfArg(content)} > '${yamlPath}'`);
        if (await verifyYaml(content)) return true;

        await exec(`cp -f '${yamlPath}.bak' '${yamlPath}'`);
        return false;
    }

    function renderSubs() {
        const items = subState ? subState.items : [];
        if (!items.length) {
            subsEl.list.innerHTML = `<div class="desc subs-empty">${escapeHtml(t('subs.empty'))}</div>`;
            return;
        }

        subsEl.list.innerHTML = items.map((it, i) => `
            <div class="setting-row sub-item">
                <div class="sub-head">
                    <input type="checkbox" class="checkbox sub-toggle" data-i="${i}"${it.enabled ? ' checked' : ''}>
                    <span class="sub-name">${escapeHtml(it.name || it.url || '#' + (it.id || i))}</span>
                </div>
                <div class="desc sub-url">${escapeHtml(it.url)}</div>
                <button class="btn btn-danger btn-sm btn-inline sub-del" data-i="${i}">${escapeHtml(t('subs.delete'))}</button>
            </div>`).join('');
    }

    /** 读取配置并渲染订阅列表（切入分页时调用） */
    async function loadSubs() {
        const lines = await readYamlLines();
        if (!lines) {
            subState = null;
            subsEl.list.innerHTML = `<div class="desc subs-empty">${escapeHtml(t('toast.sub_yaml_read'))}</div>`;
            return;
        }
        const range = findFiltersRange(lines);
        subState = { range: range, items: range ? parseFilters(lines, range) : [] };
        renderSubs();
    }

    /**
     * 把订阅列表写回 AdGuardHome.yaml。
     * 核心运行时不能直接改这个文件：AdGuardHome 退出时会用内存里的配置把它覆写掉，
     * 所以核心在跑时先停止、写完文件再启动。
     */
    async function saveFilters(items) {
        if (subBusy) return;
        subBusy = true;
        subsEl.add.disabled = true;

        let needRestart = false;
        try {
            // 先刷一次状态：核心可能刚被外部启停，拿旧状态判断会写错时机
            await refresh();
            const wasRunning = currentStatus === 'running';

            if (wasRunning) {
                showToast(t('toast.sub_stopping'));
                await exec(`${scriptTool} stop`);
                await refresh();
                if (currentStatus === 'running') { showToast(t('toast.sub_stop_fail')); return; }
                needRestart = true;
            }

            const lines = await readYamlLines();
            if (!lines) { showToast(t('toast.sub_yaml_read')); return; }

            const next = spliceFilters(lines, findFiltersRange(lines), items);
            const ok = await writeYamlFile(next.join('\n') + '\n');
            if (!ok) { showToast(t('toast.sub_write_fail')); return; }

            if (needRestart) {
                needRestart = false;
                await exec(`${scriptTool} start`);
                showToast(t('toast.sub_saved_restart'));
            } else {
                showToast(t('toast.sub_saved'));
            }
        } finally {
            // 中途失败也要把核心拉回来，不能因为改配置把设备的 DNS 弄没
            if (needRestart) await exec(`${scriptTool} start`);
            subBusy = false;
            subsEl.add.disabled = false;
            await refresh();
            await loadSubs();
        }
    }

    function defaultFilterName(url) {
        try {
            const u = new URL(url);
            const seg = u.pathname.split('/').filter(Boolean).pop() || u.hostname;
            return decodeURIComponent(seg).replace(/\.(txt|list|rules?|json|ya?ml)$/i, '') || u.hostname;
        } catch (err) {
            return url;
        }
    }

    subsEl.add.onclick = async () => {
        if (!subState || subBusy) return;
        const url = subsEl.url.value.trim();
        if (!/^https?:\/\/[^\s]+$/.test(url)) { showToast(t('toast.sub_bad_url')); return; }
        if (subState.items.some((it) => it.url === url)) { showToast(t('toast.sub_dup')); return; }

        const items = subState.items.concat([{
            enabled: true,
            url: url,
            name: subsEl.name.value.trim() || defaultFilterName(url),
            id: newFilterId(subState.items),
            extra: []
        }]);
        subsEl.url.value = '';
        subsEl.name.value = '';
        await saveFilters(items);
    };

    subsEl.list.addEventListener('change', (e) => {
        const box = e.target && e.target.closest ? e.target.closest('.sub-toggle') : null;
        if (!box || !subState) return;
        if (subBusy) { loadSubs(); return; }
        const i = parseInt(box.dataset.i, 10);
        if (!subState.items[i]) return;
        saveFilters(subState.items.map((it, idx) =>
            idx === i ? Object.assign({}, it, { enabled: box.checked }) : it));
    });

    subsEl.list.addEventListener('click', (e) => {
        const btn = e.target && e.target.closest ? e.target.closest('.sub-del') : null;
        if (!btn || !subState || subBusy) return;
        const i = parseInt(btn.dataset.i, 10);
        if (!subState.items[i]) return;

        // 删除属于危险操作：5 秒内连续点击两次才会真正写入
        if (Date.now() - subDelArmed > 5000) {
            subDelArmed = Date.now();
            showToast(t('toast.sub_del_confirm'));
            return;
        }
        subDelArmed = 0;
        saveFilters(subState.items.filter((_, idx) => idx !== i));
    });

    document.addEventListener("languageChanged", () => {
        if (currentStatus === "running" || currentStatus === "stopped") {
            elements.statusText.textContent = t(`status.${currentStatus}`);
        }

        if (elements.logContent.textContent === t("toast.no_logs")) {
            elements.logContent.textContent = t("logs.waiting");
        }

        if (subState) renderSubs();
    });

    if (It) {
        refresh();
        setInterval(refresh, 5000);
    } else {
        elements.statusText.textContent = t("toast.open_manager");
    }
})();
