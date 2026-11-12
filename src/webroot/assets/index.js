(function () {
    let It = null, rr = 0;
    const ADB_DIR = "/data/adb/agh";
    const settingsPath = ADB_DIR + "/settings.conf";
    const binLogPath = ADB_DIR + "/bin.log";
    const historyLogPath = ADB_DIR + "/history.log";
    const scriptTool = ADB_DIR + "/scripts/tool.sh";
    const scriptDebug = ADB_DIR + "/scripts/debug.sh";
    const scriptFilters = ADB_DIR + "/scripts/filters.sh";
    const debugLogPath = ADB_DIR + "/debug.log";
    const pidFile = ADB_DIR + "/bin/agh.pid";
    const yamlPath = ADB_DIR + "/bin/AdGuardHome.yaml";
    const yamlStagingPath = ADB_DIR + "/bin/.AdGuardHome.yaml.new";

    if (typeof ksu < "u" && typeof ksu.exec == "function") { It = ksu; }
    else if (typeof ap < "u" && typeof ap.exec == "function") { It = ap; }

    function exec(cmd) {
        return new Promise((resolve) => {
            if (!It) { resolve({ e: -1, s: "" }); return; }
            const cb = "_mc" + rr++;
            window[cb] = (code, out, err) => {
                delete window[cb];
                const num = Number(code);
                resolve({ e: Number.isFinite(num) ? num : 0, s: (out || "").replace(/\r/g, "") });
            };
            It.exec(cmd, "{}", cb);
        });
    }

    const $ = id => document.getElementById(id);
    const t = (key) => window.i18n?.t(key) || key;
    const esc = (s) => String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    let currentStatus = "checking";
    const elements = {
        statusText: $('status-text'),
        pidBadge: $('pid-badge'),
        version: $('agh-version'),
        logContent: $('log-content'),
        linkPanel: $('btn-link-panel'),
        filterList: $('filter-list'),
        filterApplyBar: $('filter-apply-bar'),
        fields: {
            enable_iptables: $('conf-enable_iptables'),
            block_ipv6_dns: $('conf-block_ipv6_dns'),
            redir_port: $('conf-redir_port'),
            adg_user: $('conf-adg_user'),
            adg_group: $('conf-adg_group')
        }
    };

    function showToast(msg) {
        const node = document.createElement('div');
        node.className = 'toast';
        node.textContent = msg;
        $('toast-container').appendChild(node);
        setTimeout(() => node.remove(), 3200);
    }

    /* ============================== Status ============================== */

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
        const isRunning = !!pid && /^\d+$/.test(pid);
        document.body.classList.toggle('running', isRunning);
        document.body.classList.toggle('stopped', !isRunning);
        currentStatus = isRunning ? "running" : "stopped";
        elements.statusText.textContent = t(`status.${currentStatus}`);
        elements.pidBadge.textContent = isRunning ? "PID " + pid : t("control.pid_none");

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
        elements.version.textContent = parts[3] ? "v" + parts[3] : "v...";
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

    $('btn-restart').onclick = async () => {
        showToast(t("toast.restarting"));
        await exec(`${scriptTool} stop`);
        await exec(`${scriptTool} start`);
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

    /* =============================== Tabs =============================== */

    document.querySelectorAll('.nav-item[data-tab]').forEach(b => {
        b.onclick = () => {
            document.querySelectorAll('.nav-item, .tab-content').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.nav-item[data-tab]').forEach(el => el.setAttribute('aria-selected', 'false'));
            b.classList.add('active');
            b.setAttribute('aria-selected', 'true');
            document.body.dataset.tab = b.dataset.tab;
            $('tab-' + b.dataset.tab).classList.add('active');
            if (b.dataset.tab === 'logs') loadLog();
            if (b.dataset.tab === 'password') loadYamlUser();
            if (b.dataset.tab === 'subscriptions') loadFilters();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        };
    });

    /* ============================== Logs ============================== */

    let logType = 'bin';

    function highlight(line) {
        let out = esc(line);
        out = out.replace(/^(\d{4}[-/]\d{2}[-/]\d{2}\s\d{2}:\d{2}:\d{2}(?:\.\d+)?)/,
            '<span class="log-time">$1</span>');
        out = out.replace(/\[(?:info|INFO|debug|DEBUG)\]/, (m) => `<span class="log-info">${m}</span>`);
        out = out.replace(/\[(?:warn|WARN|warning|WARNING)\]/, (m) => `<span class="log-warn">${m}</span>`);
        out = out.replace(/\[(?:error|ERROR|fatal|FATAL)\]/, (m) => `<span class="log-error">${m}</span>`);
        return out;
    }

    async function loadLog() {
        const path = logType === 'bin' ? binLogPath : historyLogPath;
        const res = await exec(`tail -n 100 ${path}`);
        const text = res.s.replace(/\s+$/, '');

        if (!text.trim()) {
            elements.logContent.textContent = '';
            const empty = document.createElement('div');
            empty.className = 'log-empty';
            empty.textContent = t("logs.empty");
            elements.logContent.appendChild(empty);
            return;
        }

        elements.logContent.innerHTML = text
            .split('\n')
            .map(l => `<div>${highlight(l) || '&nbsp;'}</div>`)
            .join('');
        elements.logContent.scrollTop = elements.logContent.scrollHeight;
    }

    document.querySelectorAll('[data-log]').forEach(b => {
        b.onclick = () => {
            document.querySelectorAll('[data-log]').forEach(el => el.classList.remove('selected'));
            b.classList.add('selected');
            logType = b.dataset.log;
            loadLog();
        };
    });

    $('btn-refresh-log').onclick = loadLog;

    /* =========================== Maintenance =========================== */

    $('btn-debug').onclick = async () => {
        showToast(t("toast.generating"));
        await exec(`${scriptDebug}`);
        showToast(`${t("toast.generated")} ${debugLogPath}`);
    };

    $('btn-open-debug').onclick = async () => {
        await exec(`am start -a android.intent.action.VIEW -d "file://${debugLogPath}" -t "text/plain" || am start -a android.intent.action.VIEW -d "content://com.android.externalstorage.documents/document/primary%3A${debugLogPath.replace(/^\/data\/adb\//, 'adb/')}" -t "text/plain"`);
        showToast(t("toast.opening_file"));
    };

    /* ========================== Confirm dialog ========================== */

    let confirmResolve = null;

    function askConfirm(title, text) {
        $('confirm-title').textContent = title;
        $('confirm-text').textContent = text;
        $('dlg-confirm').classList.remove('hidden');
        return new Promise((resolve) => { confirmResolve = resolve; });
    }

    function closeConfirm(answer) {
        $('dlg-confirm').classList.add('hidden');
        if (confirmResolve) {
            const fn = confirmResolve;
            confirmResolve = null;
            fn(answer);
        }
    }

    $('confirm-yes').onclick = () => closeConfirm(true);
    $('confirm-no').onclick = () => closeConfirm(false);
    $('dlg-confirm').onclick = (e) => { if (e.target === $('dlg-confirm')) closeConfirm(false); };

    /* ======================= Filter subscriptions ======================= */

    const PRESETS = {
        block: [
            { name: "AWAvenue Ads Rule", url: "https://raw.githubusercontent.com/TG-Twilight/AWAvenue-Ads-Rule/main/AWAvenue-Ads-Rule.txt" },
            { name: "CHN: anti-AD", url: "https://anti-ad.net/adguard.txt" },
            { name: "CHN: AdRules DNS List", url: "https://raw.githubusercontent.com/Cats-Team/AdRules/main/dns.txt" },
            { name: "AdGuard DNS filter", url: "https://adguardteam.github.io/AdGuardSDNSFilter/Filters/filter.txt" },
            { name: "OISD Blocklist Small", url: "https://small.oisd.nl/" },
            { name: "1Hosts (Lite)", url: "https://cdn.jsdelivr.net/gh/badmojr/1Hosts@master/Lite/adblock.txt" },
            { name: "HaGeZi's Normal Blocklist", url: "https://cdn.jsdelivr.net/gh/hagezi/dns-blocklists@latest/adblock/multi.txt" },
            { name: "Steven Black's List", url: "https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts" }
        ],
        allow: [
            { name: "HaGeZi's Allowlist Referral", url: "https://cdn.jsdelivr.net/gh/hagezi/dns-blocklists@latest/adblock/whitelist-referral.txt" }
        ]
    };

    const filterState = {
        block: [],
        allow: [],
        loaded: false,
        loading: false,
        dirty: false,
        snapshot: ''
    };

    const filterEl = {
        scrim: $('dlg-filter'),
        title: $('filter-dialog-title'),
        typeBlock: $('filter-type-block'),
        typeAllow: $('filter-type-allow'),
        name: $('filter-name'),
        url: $('filter-url'),
        enabled: $('filter-enabled'),
        presets: $('filter-presets'),
        hint: $('filter-dialog-hint'),
        del: $('filter-delete'),
        cancel: $('filter-cancel'),
        save: $('filter-save')
    };

    let dlgMode = 'add';
    let dlgType = 'block';
    let dlgIndex = -1;

    function allFilters() {
        return filterState.block.concat(filterState.allow);
    }

    function nextId() {
        const used = new Set(allFilters().map(f => Number(f.id) || 0));
        let id = Math.floor(Date.now() / 1000);
        while (used.has(id) || id <= 0) id++;
        return id;
    }

    function snapshotFilters() {
        return JSON.stringify({ block: filterState.block, allow: filterState.allow });
    }

    function markDirty() {
        filterState.dirty = snapshotFilters() !== filterState.snapshot;
        elements.filterApplyBar.classList.toggle('hidden', !filterState.dirty);
    }

    /* --------------------------- YAML parsing --------------------------- */

    function findSection(lines, key) {
        const re = new RegExp('^' + key + ':[ \\t]*(.*)$');
        for (let i = 0; i < lines.length; i++) {
            const m = re.exec(lines[i]);
            if (!m) continue;
            let end = lines.length;
            for (let j = i + 1; j < lines.length; j++) {
                if (!lines[j].trim()) continue;
                if (/^[^\s#]/.test(lines[j])) { end = j; break; }
            }
            return { start: i, end: end, inline: m[1] };
        }
        return null;
    }

    function unquote(value) {
        const v = value.trim();
        if (v.length >= 2 && v[0] === '"' && v[v.length - 1] === '"') {
            const inner = v.slice(1, -1);
            let out = '';
            for (let i = 0; i < inner.length; i++) {
                const c = inner[i];
                if (c === '\\' && i + 1 < inner.length) {
                    const n = inner[++i];
                    if (n === 'n') out += '\n';
                    else if (n === 't') out += '\t';
                    else out += n;
                } else {
                    out += c;
                }
            }
            return out;
        }
        if (v.length >= 2 && v[0] === "'" && v[v.length - 1] === "'") {
            return v.slice(1, -1).replace(/''/g, "'");
        }
        return v;
    }

    function parseEntryLines(lines, from, to) {
        const entries = [];
        let cur = null;

        const take = (text) => {
            const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*?)\s*$/.exec(text);
            if (!m || !cur) return;
            if (m[2] !== '') cur[m[1]] = unquote(m[2]);
        };

        for (let i = from; i < to; i++) {
            const line = lines[i];
            if (!line.trim() || /^\s*#/.test(line)) continue;

            const item = /^\s*-\s*(.*)$/.exec(line);
            if (item) {
                if (cur) entries.push(cur);
                cur = {};
                take(item[1]);
            } else {
                take(line);
            }
        }
        if (cur) entries.push(cur);

        // Every entry AdGuardHome writes has a url. An entry without one means the
        // section uses a shape this parser does not model; rewriting it would drop
        // data, so report the whole section as unparsable instead.
        if (entries.some(e => !e.url)) return null;

        return entries.map(e => ({
            enabled: e.enabled === undefined ? true : String(e.enabled).toLowerCase() === 'true',
            url: e.url,
            name: e.name || '',
            id: Number(e.id) || 0
        }));
    }

    /** Inline flow syntax (e.g. `filters: [{...}]`) is not produced by
     *  AdGuardHome itself. Editing it would silently drop entries, so treat it
     *  as unsupported and let the UI report a parse failure instead. */
    function unsupportedInline(inline) {
        const v = (inline || '').trim();
        return v.startsWith('[') && v !== '[]';
    }

    function parseFiltersYaml(lines) {
        const block = findSection(lines, 'filters');
        if (!block) return null;
        if (unsupportedInline(block.inline)) return null;

        const allow = findSection(lines, 'whitelist_filters');
        if (allow && unsupportedInline(allow.inline)) return null;

        const result = { block: [], allow: [] };

        // An empty inline value means the block sequence follows on the next
        // lines, which is how AdGuardHome writes a non-empty list:
        //   filters:
        //     - enabled: true
        // Only an explicit `[]` means the list really is empty.
        if (block.inline !== '[]') {
            const parsed = parseEntryLines(lines, block.start, block.end);
            if (!parsed) return null;
            result.block = parsed;
        }

        if (allow && allow.inline !== '[]') {
            const parsed = parseEntryLines(lines, allow.start, allow.end);
            if (!parsed) return null;
            result.allow = parsed;
        }

        return result;
    }

    function yamlQuote(value) {
        const s = String(value);
        if (s === '') return '""';
        return '"' + s
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\t/g, '\\t')
            .replace(/\n/g, '\\n') + '"';
    }

    function buildBlock(key, entries) {
        if (!entries.length) return [`${key}: []`];

        const out = [`${key}:`];
        for (const f of entries) {
            out.push(`  - enabled: ${f.enabled ? 'true' : 'false'}`);
            out.push(`    url: ${yamlQuote(f.url)}`);
            out.push(`    name: ${yamlQuote(f.name || '')}`);
            out.push(`    id: ${Number(f.id) || 0}`);
        }
        return out;
    }

    function spliceFilters(lines) {
        const out = lines.slice();

        let range = findSection(out, 'filters');
        if (!range) return null;
        out.splice(range.start, range.end - range.start, ...buildBlock('filters', filterState.block));

        range = findSection(out, 'whitelist_filters');
        if (range) {
            out.splice(range.start, range.end - range.start, ...buildBlock('whitelist_filters', filterState.allow));
        } else {
            const after = findSection(out, 'filters');
            out.splice(after.end, 0, ...buildBlock('whitelist_filters', filterState.allow));
        }

        return out;
    }

    /* ---------------------------- Rendering ---------------------------- */

    function filterRow(item, type, index) {
        const row = document.createElement('div');
        row.className = 'filter-row';
        row.dataset.type = type;
        row.dataset.index = String(index);

        const toggle = document.createElement('label');
        toggle.className = 'switch';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = item.enabled;
        input.setAttribute('aria-label', item.name || item.url);
        const track = document.createElement('span');
        track.className = 'switch-track';
        toggle.appendChild(input);
        toggle.appendChild(track);

        const main = document.createElement('div');
        main.className = 'filter-main';

        const name = document.createElement('div');
        name.className = 'filter-name';
        name.textContent = item.name || item.url;

        const url = document.createElement('div');
        url.className = 'filter-url';
        url.textContent = item.url;

        const tag = document.createElement('span');
        tag.className = 'filter-tag' + (type === 'allow' ? ' allow' : '');
        tag.textContent = t(type === 'allow' ? 'filter.type.allow' : 'filter.type.block');

        main.appendChild(name);
        main.appendChild(url);
        main.appendChild(tag);

        row.appendChild(toggle);
        row.appendChild(main);

        toggle.onclick = (e) => e.stopPropagation();

        input.onclick = (e) => {
            e.stopPropagation();
            item.enabled = input.checked;
            markDirty();
        };

        row.onclick = () => openFilterDialog('edit', type, index);

        return row;
    }

    function renderFilters() {
        const list = elements.filterList;
        list.innerHTML = '';

        const items = filterState.block.map((f, i) => ['block', f, i])
            .concat(filterState.allow.map((f, i) => ['allow', f, i]));

        if (!items.length) {
            const empty = document.createElement('div');
            empty.className = 'filter-empty';
            empty.textContent = t('filter.empty');
            list.appendChild(empty);
            return;
        }

        items.forEach(([type, item, index]) => {
            list.appendChild(filterRow(item, type, index));
        });
    }

    async function readYamlLines() {
        const res = await exec(`cat ${yamlPath}`);
        if (!res.s) return null;
        return res.s.split('\n');
    }

    async function loadFilters(force) {
        if (filterState.loading) return;
        if (filterState.loaded && !force) return;
        if (filterState.dirty && !force) return;

        filterState.loading = true;
        const lines = await readYamlLines();
        filterState.loading = false;

        if (!lines) {
            elements.filterList.innerHTML = '';
            const err = document.createElement('div');
            err.className = 'filter-empty';
            err.textContent = t('filter.read_fail');
            elements.filterList.appendChild(err);
            return;
        }

        const parsed = parseFiltersYaml(lines);
        if (!parsed) {
            elements.filterList.innerHTML = '';
            const err = document.createElement('div');
            err.className = 'filter-empty';
            err.textContent = t('filter.parse_fail');
            elements.filterList.appendChild(err);
            return;
        }

        filterState.block = parsed.block;
        filterState.allow = parsed.allow;
        filterState.loaded = true;
        filterState.snapshot = snapshotFilters();
        filterState.dirty = false;
        elements.filterApplyBar.classList.add('hidden');
        renderFilters();
    }

    /* ----------------------------- Dialog ----------------------------- */

    function setDlgType(type) {
        dlgType = type;
        filterEl.typeBlock.classList.toggle('selected', type === 'block');
        filterEl.typeAllow.classList.toggle('selected', type === 'allow');
        renderPresets();
    }

    /* The block/allowlist choice decides which YAML section the entry lives in.
       Changing it while editing would need a move between arrays, so the two
       segmented buttons only respond while adding a new subscription. */
    function setTypeLocked(locked) {
        [filterEl.typeBlock, filterEl.typeAllow].forEach((b) => {
            b.classList.toggle('locked', locked);
            b.setAttribute('aria-disabled', locked ? 'true' : 'false');
        });
    }

    function renderPresets() {
        filterEl.presets.innerHTML = '';
        (PRESETS[dlgType] || []).forEach((p) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'chip-action';
            chip.textContent = p.name;
            chip.onclick = () => {
                filterEl.name.value = p.name;
                filterEl.url.value = p.url;
            };
            filterEl.presets.appendChild(chip);
        });
    }

    function openFilterDialog(mode, type, index) {
        dlgMode = mode;
        dlgType = type;
        dlgIndex = index;

        filterEl.title.textContent = t(mode === 'add' ? 'filter.dialog_add' : 'filter.dialog_edit');
        filterEl.del.classList.toggle('hidden', mode !== 'edit');
        filterEl.hint.textContent = t(mode === 'edit' ? 'filter.dialog_hint_locked' : 'filter.dialog_hint');

        if (mode === 'edit') {
            const item = filterState[type][index];
            filterEl.name.value = item.name || '';
            filterEl.url.value = item.url || '';
            filterEl.enabled.checked = item.enabled;
        } else {
            filterEl.name.value = '';
            filterEl.url.value = '';
            filterEl.enabled.checked = true;
        }

        setDlgType(type);
        setTypeLocked(mode === 'edit');
        filterEl.scrim.classList.remove('hidden');
        setTimeout(() => filterEl.name.focus(), 30);
    }

    function closeFilterDialog() {
        filterEl.scrim.classList.add('hidden');
    }

    function validUrl(url) {
        return /^https?:\/\/[^\s]+$/i.test(url);
    }

    function saveFilterDialog() {
        const url = filterEl.url.value.trim();
        const name = filterEl.name.value.trim();

        if (!url) { showToast(t('filter.err_url')); return; }
        if (!validUrl(url)) { showToast(t('filter.err_url_invalid')); return; }

        const self = dlgMode === 'edit' ? filterState[dlgType][dlgIndex] : null;
        const duplicate = allFilters().some((f) =>
            f !== self && f.url.toLowerCase() === url.toLowerCase());

        if (dlgMode === 'add') {
            if (duplicate) { showToast(t('filter.err_duplicate')); return; }
            filterState[dlgType].push({
                enabled: filterEl.enabled.checked,
                url: url,
                name: name,
                id: nextId()
            });
        } else {
            const item = filterState[dlgType][dlgIndex];
            item.url = url;
            item.name = name;
            item.enabled = filterEl.enabled.checked;
        }

        closeFilterDialog();
        renderFilters();
        markDirty();
    }

    async function deleteFilter() {
        const item = filterState[dlgType][dlgIndex];
        closeFilterDialog();

        const ok = await askConfirm(t('filter.delete_title'), t('filter.delete_text').replace('{name}', item.name || item.url));
        if (!ok) return;

        filterState[dlgType].splice(dlgIndex, 1);
        renderFilters();
        markDirty();
    }

    filterEl.typeBlock.onclick = () => { if (dlgMode === 'add') setDlgType('block'); };
    filterEl.typeAllow.onclick = () => { if (dlgMode === 'add') setDlgType('allow'); };
    filterEl.cancel.onclick = closeFilterDialog;
    filterEl.save.onclick = saveFilterDialog;
    filterEl.del.onclick = deleteFilter;
    filterEl.scrim.onclick = (e) => { if (e.target === filterEl.scrim) closeFilterDialog(); };

    $('btn-add-filter').onclick = () => openFilterDialog('add', 'block', -1);

    $('btn-filter-discard').onclick = async () => {
        filterState.dirty = false;
        await loadFilters(true);
        showToast(t('filter.discarded'));
    };

    /* ----------------------------- Apply ----------------------------- */

    function toBase64(text) {
        const bytes = new TextEncoder().encode(text);
        let binary = '';
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        return btoa(binary);
    }

    /* The staged file is transferred as base64 so that no YAML byte can be
       mangled by the shell. Chunks keep every exec argument well below the
       kernel's ARG_MAX, which a large configuration could otherwise exceed. */
    const B64_CHUNK = 1200;

    async function writeStaging(b64) {
        const tmp = yamlStagingPath;
        const decoder = 'base64 -d';
        let offset = 0;
        let first = true;

        await exec(`rm -f '${tmp}'`);

        while (offset < b64.length) {
            const part = b64.slice(offset, offset + B64_CHUNK);
            offset += B64_CHUNK;

            const op = first ? '>' : '>>';
            await exec(`printf '%s' '${part}' | ${decoder} ${op} '${tmp}'`);
            first = false;
        }

        let size = await exec(`wc -c < '${tmp}' 2>/dev/null | tr -d ' '`);
        if (!size.s.trim() || size.s.trim() === '0') {
            offset = 0;
            first = true;
            await exec(`rm -f '${tmp}'`);
            while (offset < b64.length) {
                const part = b64.slice(offset, offset + B64_CHUNK);
                offset += B64_CHUNK;
                const op = first ? '>' : '>>';
                await exec(`printf '%s' '${part}' | busybox ${decoder} ${op} '${tmp}'`);
                first = false;
            }
            size = await exec(`wc -c < '${tmp}' 2>/dev/null | tr -d ' '`);
        }

        const bytes = Number(size.s.trim());
        if (!bytes || bytes < 100) return { ok: false, reason: 'decode' };
        return { ok: true, bytes: bytes };
    }

    async function applyFilters() {
        const wasRunning = currentStatus === 'running';
        const applyBtn = $('btn-filter-apply');
        applyBtn.disabled = true;

        try {
            // Stop first: AdGuardHome writes its own copy of the config on exit,
            // so a file read before the stop could be overwritten moments later.
            if (wasRunning) {
                showToast(t('toast.stopping'));
                await exec(`${scriptTool} stop`);
            }

            const lines = await readYamlLines();
            if (!lines) { showToast(t('filter.read_fail')); return; }

            if (!parseFiltersYaml(lines)) { showToast(t('filter.parse_fail')); return; }

            const next = spliceFilters(lines);
            if (!next) { showToast(t('filter.parse_fail')); return; }

            const staged = await writeStaging(toBase64(next.join('\n')));
            if (!staged.ok) { showToast(t('filter.err_write')); return; }

            const res = await exec(`sh '${scriptFilters}' install 2>&1`);
            if (res.e !== 0) { showToast(t('filter.err_write')); return; }

            filterState.snapshot = snapshotFilters();
            filterState.dirty = false;
            elements.filterApplyBar.classList.add('hidden');
            filterState.loaded = false;
            showToast(t('toast.filter_applied'));
        } finally {
            applyBtn.disabled = false;

            // Always restart: the core was stopped before the write and must not
            // be left down because the staged file failed validation.
            if (wasRunning) {
                showToast(t('toast.starting'));
                await exec(`${scriptTool} start`);
            }
            refresh();
        }
    }

    $('btn-filter-apply').onclick = applyFilters;

    /* ==================== 密码计算 (AdGuardHome.yaml · bcrypt) ==================== */

    const pwEl = {
        user: $('pw-user'),
        plain: $('pw-plain'),
        confirm: $('pw-confirm'),
        cost: $('pw-cost'),
        result: $('pw-result'),
        status: $('pw-status'),
        generate: $('btn-pw-generate'),
        clear: $('btn-pw-clear'),
        copy: $('btn-pw-copy'),
        apply: $('btn-pw-apply')
    };

    // bcrypt 哈希形如 $2b$12$<22 字符盐><31 字符摘要>
    const HASH_RE = /^\$2[abxy]\$[0-9]{2}\$[./A-Za-z0-9]{53}$/;
    let pwBusy = false;
    let pwApplyArmed = 0;

    function setPwStatus(msg) {
        pwEl.status.textContent = msg || '';
    }

    /** users 段的行号范围（左闭右开，不含 users: 自身与下一段的起始行） */
    function usersRange(lines) {
        let start = -1;
        for (let i = 0; i < lines.length; i++) {
            if (/^users:[ \t]*$/.test(lines[i])) { start = i + 1; break; }
        }
        if (start < 0) return null;

        let end = lines.length;
        for (let i = start; i < lines.length; i++) {
            if (/^[^\s#]/.test(lines[i])) { end = i; break; }
        }
        return { start: start, end: end };
    }

    /**
     * 列出 users 段中的所有用户
     * nameLine / pwLine 为 1 基行号；pwLine 为 -1 表示该条目没有 password 行
     */
    function listUsers(lines) {
        const range = usersRange(lines);
        if (!range) return [];

        const users = [];
        let entry = -1;
        for (let i = range.start; i <= range.end; i++) {
            const isEntry = i < range.end && /^\s*-\s*name:/.test(lines[i]);
            if (!isEntry && i !== range.end) continue;

            if (entry >= 0) {
                const m = /^\s*-\s*name:\s*(.+?)\s*$/.exec(lines[entry]);
                if (m) {
                    let pwLine = -1;
                    for (let j = entry + 1; j < i; j++) {
                        if (/^\s*password:/.test(lines[j])) { pwLine = j + 1; break; }
                    }
                    users.push({
                        name: m[1].replace(/^["']|["']$/g, ''),
                        nameLine: entry + 1,
                        pwLine: pwLine
                    });
                }
            }
            entry = i;
        }
        return users;
    }

    /** 切入密码页时，用配置文件里的用户名预填输入框 */
    async function loadYamlUser() {
        if (pwEl.user.value) return;
        const lines = await readYamlLines();
        const users = lines ? listUsers(lines) : [];
        pwEl.user.value = users.length ? users[0].name : 'root';
    }

    async function generatePwHash() {
        if (pwBusy) return;
        if (!window.bcrypt) { showToast(t('toast.pw_no_lib')); return; }

        const plain = pwEl.plain.value;
        if (!plain) { showToast(t('toast.pw_empty')); return; }
        if (plain !== pwEl.confirm.value) { showToast(t('toast.pw_mismatch')); return; }

        const cost = parseInt(pwEl.cost.value, 10);
        if (!(cost >= window.bcrypt.MIN_COST && cost <= window.bcrypt.MAX_COST)) {
            showToast(`${t('toast.pw_cost')} ${window.bcrypt.MIN_COST}-${window.bcrypt.MAX_COST}`);
            return;
        }

        pwBusy = true;
        pwEl.generate.disabled = true;
        pwEl.result.value = '';
        setPwStatus(t('toast.pw_computing'));
        const started = Date.now();
        try {
            pwEl.result.value = await window.bcrypt.hash(plain, cost, (progress) => {
                setPwStatus(`${t('toast.pw_computing')} ${Math.round(progress * 100)}%`);
            });
            setPwStatus(`${t('toast.pw_done')} (${((Date.now() - started) / 1000).toFixed(2)}s)`);
            showToast(t('toast.pw_done'));
        } catch (err) {
            setPwStatus('');
            showToast(err && err.message === 'BCRYPT_PASSWORD_TOO_LONG'
                ? t('toast.pw_too_long')
                : t('toast.pw_fail'));
        } finally {
            pwBusy = false;
            pwEl.generate.disabled = false;
        }
    }

    async function copyPwHash() {
        const hash = pwEl.result.value;
        if (!hash) { showToast(t('toast.pw_empty')); return; }

        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(hash);
                showToast(t('toast.pw_copied'));
                return;
            }
        } catch (err) {
            // 剪贴板 API 不可用（非安全上下文）时回退到 execCommand
        }

        pwEl.result.focus();
        pwEl.result.setSelectionRange(0, hash.length);
        let ok = false;
        try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
        showToast(ok ? t('toast.pw_copied') : t('toast.pw_copy_fail'));
    }

    /** 把哈希写回 AdGuardHome.yaml 中该用户的 password 行 */
    async function applyPwHash() {
        const hash = pwEl.result.value.trim();
        const user = pwEl.user.value.trim();
        if (!HASH_RE.test(hash)) { showToast(t('toast.pw_empty')); return; }
        if (!user) { showToast(t('toast.pw_user')); return; }

        const lines = await readYamlLines();
        if (!lines) { showToast(t('toast.pw_yaml_read')); return; }

        const entry = listUsers(lines).find((u) => u.name === user);
        if (!entry) { showToast(t('toast.pw_user_missing')); return; }
        if (entry.pwLine < 0) { showToast(t('toast.pw_no_field')); return; }

        // 属于危险操作：5 秒内连续点击两次才会真正写入
        if (Date.now() - pwApplyArmed > 5000) {
            pwApplyArmed = Date.now();
            setPwStatus(t('toast.pw_confirm'));
            showToast(t('toast.pw_confirm'));
            return;
        }
        pwApplyArmed = 0;

        // 单引号包 sed 脚本：bcrypt 哈希里的 $ 在双引号里会被 shell 当变量展开，
        // 必须用单引号才能原样写入；哈希只含 ./A-Za-z0-9，不会破坏 sed 语法
        const indent = (/^\s*/.exec(lines[entry.pwLine - 1]) || [''])[0];
        const newLine = indent + 'password: ' + hash;

        await exec(`cp -f '${yamlPath}' '${yamlPath}.bak'`);
        const res = await exec(`sed -i '${entry.pwLine}s|.*|${newLine}|' '${yamlPath}'`);
        const written = res.e === 0
            ? (await exec(`sed -n '${entry.pwLine}p' '${yamlPath}'`)).s.trim()
            : '';

        if (written !== newLine.trim()) {
            setPwStatus('');
            showToast(t('toast.pw_apply_fail'));
            return;
        }
        setPwStatus(`${t('toast.pw_applied')} · ${t('toast.pw_restart')}`);
        showToast(t('toast.pw_applied'));
    }

    pwEl.generate.onclick = generatePwHash;
    pwEl.copy.onclick = copyPwHash;
    pwEl.apply.onclick = applyPwHash;
    pwEl.clear.onclick = () => {
        pwEl.plain.value = '';
        pwEl.confirm.value = '';
        pwEl.result.value = '';
        pwEl.cost.value = window.bcrypt ? window.bcrypt.DEFAULT_COST : 12;
        pwApplyArmed = 0;
        setPwStatus('');
    };

    /* ============================== i18n ============================== */

    document.addEventListener("languageChanged", () => {
        if (currentStatus === "running" || currentStatus === "stopped") {
            elements.statusText.textContent = t(`status.${currentStatus}`);
            if (currentStatus === "stopped") elements.pidBadge.textContent = t("control.pid_none");
        }
        if (filterState.loaded) renderFilters();
        if (filterEl.scrim.classList.contains('hidden') === false) {
            filterEl.title.textContent = t(dlgMode === 'add' ? 'filter.dialog_add' : 'filter.dialog_edit');
            filterEl.hint.textContent = t(dlgMode === 'edit' ? 'filter.dialog_hint_locked' : 'filter.dialog_hint');
            renderPresets();
        }
        if (!$('tab-logs').classList.contains('active') && elements.logContent.querySelector('.log-empty')) {
            elements.logContent.querySelector('.log-empty').textContent = t('logs.empty');
        }
    });

    /* ============================== Boot ============================== */

    if (It) {
        refresh();
        setInterval(refresh, 5000);
    } else {
        elements.statusText.textContent = t("toast.open_manager");
    }
})();
