// js/modules/adb-tools.js
// ADB 命令调试工具（设备管理、命令发送、日志采集、拖拽排序、分组、批量管理）

(function () {
    const API_BASE = 'http://127.0.0.1:5000/api';
    let allCommands = [];
    let sortableInstances = [];
    let selectedNames = new Set(); // 批量选择
    let _prevCmdTabActive = 'all';  // 记录快捷指令区上次选中的 Tab
    window.currentLogcatPath = null;
    let execHistory = [];           // 执行历史
    let execHistoryId = 0;         // 历史自增 ID

    // ---------- 自定义 prompt（替代浏览器原生 prompt） ----------
    function customPrompt(title, defaultValue, callback) {
        // 清理旧的
        const old = document.getElementById('customPromptModal');
        if (old) old.remove();
        const wrapper = document.createElement('div');
        wrapper.innerHTML = `
            <div class="modal fade" id="customPromptModal" tabindex="-1">
                <div class="modal-dialog modal-sm modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header py-2">
                            <h6 class="modal-title">${escapeHtml(title)}</h6>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body py-2">
                            <input type="text" id="customPromptInput" class="form-control form-control-sm" value="${escapeHtml(defaultValue || '')}">
                        </div>
                        <div class="modal-footer py-1">
                            <button type="button" class="btn btn-sm btn-secondary" data-bs-dismiss="modal">取消</button>
                            <button type="button" class="btn btn-sm btn-primary" id="customPromptOk">确定</button>
                        </div>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(wrapper);
        const modal = wrapper.querySelector('.modal');
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
        const input = document.getElementById('customPromptInput');
        input.select();
        input.addEventListener('keydown', function(e) { if (e.key === 'Enter') { document.getElementById('customPromptOk').click(); } });
        document.getElementById('customPromptOk').addEventListener('click', function () {
            const val = input.value.trim();
            bsModal.hide();
            callback(val);
        });
        modal.addEventListener('hidden.bs.modal', () => wrapper.remove());
    }

    function showConfirmModal(title, message, onConfirm, confirmClass, inputConfig) {
        confirmClass = confirmClass || 'btn-danger';
        const old = document.getElementById('confirmModal');
        if (old) old.remove();
        const wrapper = document.createElement('div');
        const inputHtml = inputConfig ? `
            <div class="mt-3 text-start">
                <label class="form-label small mb-1">${escapeHtml(inputConfig.label || '')}</label>
                <input type="text" class="form-control form-control-sm" id="confirmModalInput"
                    value="${escapeHtml(inputConfig.value || '')}"
                    placeholder="${escapeHtml(inputConfig.placeholder || '')}">
            </div>` : '';
        wrapper.innerHTML = `
            <div class="modal fade" id="confirmModal" tabindex="-1">
                <div class="modal-dialog modal-sm modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header py-2">
                            <h6 class="modal-title">${escapeHtml(title)}</h6>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body py-3">
                            <p class="mb-0 text-center">${escapeHtml(message)}</p>
                            ${inputHtml}
                        </div>
                        <div class="modal-footer py-1 justify-content-center">
                            <button type="button" class="btn btn-sm btn-secondary" data-bs-dismiss="modal">取消</button>
                            <button type="button" class="btn btn-sm ${confirmClass}" id="confirmModalOk">确定</button>
                        </div>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(wrapper);
        const modal = wrapper.querySelector('.modal');
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
        document.getElementById('confirmModalOk').addEventListener('click', function () {
            bsModal.hide();
            const inputVal = inputConfig ? document.getElementById('confirmModalInput').value.trim() : undefined;
            if (onConfirm) onConfirm(inputVal);
        });
        // 输入框回车确认
        if (inputConfig) {
            document.getElementById('confirmModalInput').addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    document.getElementById('confirmModalOk').click();
                }
            });
        }
        modal.addEventListener('hidden.bs.modal', () => wrapper.remove());
    }

    // ---------- Toast 提示 ----------
    function showToast(msg, type) {
        type = type || 'success';
        const cls = type === 'error' ? 'danger' : type;
        const toast = document.createElement('div');
        toast.className = 'position-fixed top-0 end-0 m-3 alert alert-' + cls + ' alert-dismissible fade show shadow';
        toast.style.zIndex = '99999';
        toast.style.minWidth = '200px';
        toast.innerHTML = escapeHtml(msg) + '<button type="button" class="btn-close" data-bs-dismiss="alert"></button>';
        document.body.appendChild(toast);
        setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 2500);
    }

    // ---------- 设备管理 ----------
    async function refreshDevices() {
        try {
            const res = await apiFetch(`${API_BASE}/devices`);
            const data = await res.json();
            const select = document.getElementById('deviceSelect');
            select.innerHTML = '';
            data.devices.forEach(dev => {
                const option = document.createElement('option');
                option.value = dev;
                option.text = dev;
                select.appendChild(option);
            });
            document.getElementById('adbStatus').innerText = data.devices.length ? '已连接' : '无设备';
        } catch (err) {
            console.error('刷新设备失败', err);
        }
    }

    // ---------- 按分组渲染快捷指令按钮 ----------
    function renderCommandButtons() {
        const btnContainer = document.getElementById('commandButtons');
        if (!btnContainer) return;

        // 保存当前展开的分组状态（仅在「全部」Tab 时保留，特定 Tab 时重置）
        const tabBar = document.getElementById('groupTabBar');
        const prevActiveTab = _prevCmdTabActive;
        const expandedGroups = new Set();
        if (prevActiveTab === 'all') {
            btnContainer.querySelectorAll('.command-group').forEach(el => {
                const body = el.querySelector('div[id^="cmdGrp_"]');
                if (body && body.style.display !== 'none') {
                    const name = el.getAttribute('data-group');
                    if (name) expandedGroups.add(name);
                }
            });
        }

        btnContainer.innerHTML = '';

        // 按分组归类
        const groups = {};
        allCommands.forEach(cmd => {
            const g = (cmd.group || '').trim() || '未分组';
            if (!groups[g]) groups[g] = [];
            groups[g].push(cmd);
        });
        // 合并 localStorage 中的空分组
        try {
            const emptyGroups = JSON.parse(localStorage.getItem('adb_empty_groups') || '[]');
            emptyGroups.forEach(g => { if (!groups[g]) groups[g] = []; });
        } catch(e) {}

        // 排序：未分组始终置顶，其余按自定义顺序或拼音排序
        let groupOrder = [];
        try { groupOrder = JSON.parse(localStorage.getItem('adb_group_order') || '[]'); } catch(e) {}
        const sortedKeys = Object.keys(groups).sort((a, b) => {
            if (a === '未分组') return -1;
            if (b === '未分组') return 1;
            const ia = groupOrder.indexOf(a);
            const ib = groupOrder.indexOf(b);
            if (ia !== -1 && ib !== -1) return ia - ib;
            if (ia !== -1) return -1;
            if (ib !== -1) return 1;
            return a.localeCompare(b, 'zh-CN');
        });

        // ========== 渲染横向 Tab 标签栏 ==========
        // 如果当前 activeTab 对应的分组已不存在，回退到 "all"
        let currentTab = tabBar ? (tabBar.getAttribute('data-active') || 'all') : 'all';
        if (currentTab !== 'all' && !sortedKeys.includes(currentTab)) {
            currentTab = 'all';
            if (tabBar) tabBar.setAttribute('data-active', 'all');
        }
        if (tabBar && sortedKeys.length > 0) {
            let tabHtml = '<span class="group-tab' + (currentTab === 'all' ? ' active' : '') + '" data-group="all">全部<span class="group-tab-count">' + allCommands.length + '</span></span>';
            sortedKeys.forEach(function(g) {
                tabHtml += '<span class="group-tab' + (currentTab === g ? ' active' : '') + '" data-group="' + escapeHtml(g) + '">' + escapeHtml(g) + '<span class="group-tab-count">' + groups[g].length + '</span></span>';
            });
            tabBar.innerHTML = tabHtml;
            // 绑定 Tab 点击事件
            tabBar.querySelectorAll('.group-tab').forEach(function(tab) {
                tab.addEventListener('click', function() {
                    tabBar.setAttribute('data-active', this.getAttribute('data-group'));
                    renderCommandButtons();
                });
            });
        } else if (tabBar) {
            tabBar.innerHTML = '';
        }
        // 根据当前选中的 Tab 过滤要显示的分组
        const activeTab = currentTab;

        // 销毁旧的 Sortable 实例
        sortableInstances.forEach(s => s.destroy());
        sortableInstances = [];

        sortedKeys.forEach(groupName => {
            // 如果选中了特定 Tab，只渲染该分组
            if (activeTab !== 'all' && groupName !== activeTab) return;

            const wrapper = document.createElement('div');
            wrapper.className = 'command-group mb-2';
            wrapper.setAttribute('data-group', groupName);

            // 分组标题（可点击折叠，可拖拽排序）
            const title = document.createElement('div');
            title.className = 'group-title';
            title.style.cursor = 'pointer';
            title.style.userSelect = 'none';
            title.style.display = 'flex';
            title.style.alignItems = 'center';
            title.style.gap = '4px';
            title.style.marginBottom = '4px';
            const collapseId = 'cmdGrp_' + groupName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
            const isUngrouped = groupName === '未分组';
            const dragHandle = isUngrouped ? '' : '<i class="bi bi-grip-vertical text-muted group-drag-handle" style="cursor:grab;font-size:14px;" title="拖拽排序"></i>';
            title.innerHTML = `${dragHandle}<i class="bi bi-chevron-right small toggle-icon"></i> <i class="bi bi-folder2-open text-primary"></i> <strong class="small text-primary">${escapeHtml(groupName)}</strong> <span class="text-muted small">(${groups[groupName].length})</span>`;
            title.addEventListener('click', function () {
                const body = document.getElementById(collapseId);
                const icon = this.querySelector('.toggle-icon');
                if (body.style.display === 'none') {
                    body.style.display = 'flex';
                    icon.className = 'bi bi-chevron-down small toggle-icon';
                } else {
                    body.style.display = 'none';
                    icon.className = 'bi bi-chevron-right small toggle-icon';
                }
            });
            wrapper.appendChild(title);

            // 按钮容器（可拖拽，默认折叠）
            const btnWrap = document.createElement('div');
            btnWrap.id = collapseId;
            btnWrap.style.display = 'none'; // 默认折叠
            btnWrap.style.flexWrap = 'wrap';
            btnWrap.style.gap = '4px';

            groups[groupName].forEach(cmd => {
                const btn = document.createElement('button');
                btn.innerText = cmd.name;
                btn.className = 'btn btn-outline-primary btn-sm';
                btn.setAttribute('data-name', cmd.name);
                btn.title = cmd.cmd;
                btn.addEventListener('click', function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    sendCommand(cmd.cmd);
                });
                btnWrap.appendChild(btn);
            });

            wrapper.appendChild(btnWrap);

            // 恢复之前的展开状态（选中特定 Tab 时自动展开）
            if (activeTab !== 'all' || expandedGroups.has(groupName)) {
                btnWrap.style.display = 'flex';
                const icon = title.querySelector('.toggle-icon');
                if (icon) icon.className = 'bi bi-chevron-down small toggle-icon';
            }

            btnContainer.appendChild(wrapper);

            // 每个分组容器都可以拖拽排序
            const sortable = new Sortable(btnWrap, {
                group: 'commands', // 允许跨分组拖拽
                animation: 150,
                ghostClass: 'bg-secondary',
                dragClass: 'opacity-75',
                onEnd: async function () {
                    // 收集新顺序
                    const newOrder = [];
                    btnContainer.querySelectorAll('.command-group').forEach(groupEl => {
                        const groupTitle = groupEl.querySelector('strong')?.textContent || '未分组';
                        const btns = groupEl.querySelectorAll('.btn[data-name]');
                        btns.forEach(btn => {
                            const name = btn.getAttribute('data-name');
                            const cmdObj = allCommands.find(c => c.name === name);
                            if (cmdObj) {
                                newOrder.push({
                                    ...cmdObj,
                                    group: groupTitle === '未分组' ? '' : groupTitle
                                });
                            }
                        });
                    });
                    if (newOrder.length === allCommands.length) {
                        try {
                            const res = await apiFetch(`${API_BASE}/commands/import`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(newOrder)
                            });
                            const data = await res.json();
                            if (data.error) console.error('保存顺序失败', data.error);
                            else {
                                allCommands = newOrder;
                                // 追踪拖空的分组：保留到 localStorage
                                try {
                                    let emptyGroups = JSON.parse(localStorage.getItem('adb_empty_groups') || '[]');
                                    const realGroups = new Set(newOrder.map(c => (c.group || '').trim()).filter(Boolean));
                                    // 当前 DOM 中有但 newOrder 中已无命令的分组 → 拖空了，保留为空分组
                                    btnContainer.querySelectorAll('.command-group').forEach(groupEl => {
                                        const g = groupEl.querySelector('strong')?.textContent?.trim();
                                        if (g && g !== '未分组' && !realGroups.has(g) && !emptyGroups.includes(g)) {
                                            emptyGroups.push(g);
                                        }
                                    });
                                    // 移除已有命令的分组（不再是空分组）
                                    emptyGroups = emptyGroups.filter(g => !realGroups.has(g));
                                    localStorage.setItem('adb_empty_groups', JSON.stringify(emptyGroups));
                                } catch(e) {}
                                renderCommandButtons();
                                renderCommandList();
                                loadGroupOptions();
                            }
                        } catch (err) { console.error('保存顺序出错', err); }
                    }
                }
            });
            sortableInstances.push(sortable);
        });

        // 分组级拖拽排序（整个分组拖拽，未分组固定不可拖且始终置顶）
        const groupSortable = new Sortable(btnContainer, {
            animation: 150,
            ghostClass: 'bg-secondary',
            handle: '.group-drag-handle', // 只能通过拖拽手柄拖动
            filter: '[data-group="未分组"]', // 未分组不可拖
            onMove: function (evt) {
                // 阻止其他分组插到未分组前面（但允许放到未分组后面）
                if (evt.related && evt.related.getAttribute('data-group') === '未分组' && !evt.willInsertAfter) {
                    return false;
                }
                return true;
            },
            onEnd: function () {
                const newOrder = [];
                btnContainer.querySelectorAll('.command-group').forEach(el => {
                    const g = el.getAttribute('data-group');
                    if (g && g !== '未分组') newOrder.push(g);
                });
                localStorage.setItem('adb_group_order', JSON.stringify(newOrder));
                renderCommandButtons();
            }
        });
        sortableInstances.push(groupSortable);

        // 记录本次激活的 Tab，供下次渲染判断"切回全部"
        _prevCmdTabActive = activeTab;
    }

    // ---------- 命令列表（复选框形式） ----------
    function renderCommandList(filterText) {
        const container = document.getElementById('commandListContainer');
        const emptyDiv = document.getElementById('commandListEmpty');
        if (!container) return;

        // 清空旧内容（保留 empty 提示）
        container.querySelectorAll('.cmd-item').forEach(el => el.remove());
        container.querySelectorAll('div[id^="cmdListGrp_"]').forEach(el => el.remove());

        let commands = allCommands;
        if (filterText) {
            const term = filterText.toLowerCase();
            commands = commands.filter(c =>
                c.name.toLowerCase().includes(term) ||
                c.cmd.toLowerCase().includes(term) ||
                (c.group || '').toLowerCase().includes(term)
            );
        }

        if (commands.length === 0) {
            emptyDiv.style.display = '';
            return;
        }
        emptyDiv.style.display = 'none';

        // 按分组渲染
        const groups = {};
        commands.forEach(cmd => {
            const g = (cmd.group || '').trim() || '未分组';
            if (!groups[g]) groups[g] = [];
            groups[g].push(cmd);
        });
        // 合并 localStorage 中的空分组（搜索时除外）
        if (!filterText) {
            try {
                const emptyGroups = JSON.parse(localStorage.getItem('adb_empty_groups') || '[]');
                emptyGroups.forEach(g => { if (!groups[g]) groups[g] = []; });
            } catch(e) {}
        }

        // 排序：未分组始终置顶，其余按自定义顺序或拼音排序
        let listGroupOrder = [];
        try { listGroupOrder = JSON.parse(localStorage.getItem('adb_group_order') || '[]'); } catch(e) {}
        const sortedKeys = Object.keys(groups).sort((a, b) => {
            if (a === '未分组') return -1;
            if (b === '未分组') return 1;
            const ia = listGroupOrder.indexOf(a);
            const ib = listGroupOrder.indexOf(b);
            if (ia !== -1 && ib !== -1) return ia - ib;
            if (ia !== -1) return -1;
            if (ib !== -1) return 1;
            return a.localeCompare(b, 'zh-CN');
        });

        // ========== 渲染列表 Tab 标签栏 ==========
        const listTabBar = document.getElementById('commandListTabBar');
        if (listTabBar && !filterText && sortedKeys.length > 0) {
            let listCurrentTab = listTabBar.getAttribute('data-active') || 'all';
            if (listCurrentTab !== 'all' && !sortedKeys.includes(listCurrentTab)) {
                listCurrentTab = 'all';
                listTabBar.setAttribute('data-active', 'all');
            }
            let tabHtml = '<span class="group-tab' + (listCurrentTab === 'all' ? ' active' : '') + '" data-group="all">全部<span class="group-tab-count">' + commands.length + '</span></span>';
            sortedKeys.forEach(function(g) {
                tabHtml += '<span class="group-tab' + (listCurrentTab === g ? ' active' : '') + '" data-group="' + escapeHtml(g) + '">' + escapeHtml(g) + '<span class="group-tab-count">' + groups[g].length + '</span></span>';
            });
            listTabBar.innerHTML = tabHtml;
            listTabBar.querySelectorAll('.group-tab').forEach(function(tab) {
                tab.addEventListener('click', function() {
                    listTabBar.setAttribute('data-active', this.getAttribute('data-group'));
                    renderCommandList();
                });
            });
            var listActiveTab = listCurrentTab;
        } else {
            if (listTabBar) listTabBar.innerHTML = '';
            var listActiveTab = 'all';
        }

        // 「全部」tab 默认折叠所有分组；搜索/特定tab 时展开
        var collapseAll = (listActiveTab === 'all' && !filterText);

        sortedKeys.forEach(groupName => {
            // 选中特定 Tab 时跳过其他分组
            if (listActiveTab !== 'all' && groupName !== listActiveTab) return;

            // 分组标题行（可折叠）
            var groupStartCollapsed = collapseAll;
            const header = document.createElement('div');
            header.className = 'cmd-item d-flex align-items-center gap-1 py-1 px-1 border-bottom cmd-group-header';
            header.style.cursor = 'pointer';
            header.style.userSelect = 'none';
            const listCollapseId = 'cmdListGrp_' + groupName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
            header.innerHTML = `
                <i class="bi bi-chevron-${groupStartCollapsed ? 'right' : 'down'} small toggle-icon"></i>
                <input type="checkbox" class="form-check-input group-check" data-group="${escapeHtml(groupName)}" style="margin:0;">
                <i class="bi bi-folder2-open text-primary"></i>
                <strong class="small text-primary">${escapeHtml(groupName)}</strong>
                <span class="text-muted small">(${groups[groupName].length})</span>
            `;
            // 点击标题行折叠（排除 checkbox 点击）
            header.addEventListener('click', function (e) {
                if (e.target.type === 'checkbox') return;
                const body = document.getElementById(listCollapseId);
                const icon = this.querySelector('.toggle-icon');
                if (body.style.display === 'none') {
                    body.style.display = '';
                    icon.className = 'bi bi-chevron-down small toggle-icon';
                } else {
                    body.style.display = 'none';
                    icon.className = 'bi bi-chevron-right small toggle-icon';
                }
            });
            container.appendChild(header);

            // 分组全选 checkbox 事件
            header.querySelector('.group-check').addEventListener('change', function () {
                const checked = this.checked;
                const group = this.getAttribute('data-group');
                const escapedGroup = group.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                container.querySelectorAll(`.cmd-check[data-group="${escapedGroup}"]`).forEach(cb => {
                    cb.checked = checked;
                    const n = cb.getAttribute('data-name');
                    if (checked) selectedNames.add(n); else selectedNames.delete(n);
                });
            });

            // 命令行包裹容器（可折叠）
            const groupBody = document.createElement('div');
            groupBody.id = listCollapseId;
            if (groupStartCollapsed) groupBody.style.display = 'none';
            container.appendChild(groupBody);

            // 命令行
            groups[groupName].forEach(cmd => {
                const row = document.createElement('div');
                row.className = 'cmd-item d-flex align-items-center gap-2 py-1 px-1 border-bottom cmd-row';
                row.style.cursor = 'pointer';
                row.setAttribute('data-name', cmd.name);
                const checked = selectedNames.has(cmd.name) ? 'checked' : '';
                row.innerHTML = `
                    <input type="checkbox" class="form-check-input cmd-check" data-name="${escapeHtml(cmd.name)}" data-group="${escapeHtml(groupName)}" ${checked}>
                    <span class="fw-medium flex-grow-1" style="font-size:13px;">${escapeHtml(cmd.name)}</span>
                    <code class="text-muted small text-truncate" style="max-width: 280px; font-size:11px;">${escapeHtml(cmd.cmd)}</code>
                `;
                // 点击行选中并填充表单
                row.addEventListener('click', function (e) {
                    if (e.target.type === 'checkbox') return; // 点击复选框不触发
                    // 单选：清除其他选中，只选中当前行
                    selectedNames.clear();
                    selectedNames.add(cmd.name);
                    // 同步所有复选框视觉状态
                    document.querySelectorAll('.cmd-check').forEach(cb => {
                        cb.checked = selectedNames.has(cb.getAttribute('data-name'));
                    });
                    document.querySelectorAll('.group-check').forEach(cb => { cb.checked = false; });
                    document.getElementById('cmdName').value = cmd.name;
                    document.getElementById('cmdText').value = cmd.cmd;
                    document.getElementById('cmdGroup').value = cmd.group || '';
                    // 触发 textarea 自动撑高
                    document.getElementById('cmdText').dispatchEvent(new Event('input', { bubbles: true }));
                });
                // 复选框事件
                row.querySelector('.cmd-check').addEventListener('change', function () {
                    if (this.checked) selectedNames.add(cmd.name); else selectedNames.delete(cmd.name);
                });
                groupBody.appendChild(row);
            });
        });
    }

    // ---------- 分组管理 ----------
    async function loadGroupOptions() {
        // 更新 datalist 和批量移动下拉
        try {
            const res = await apiFetch(`${API_BASE}/groups`);
            const data = await res.json();
            const groups = data.groups || [];
            // 合并本地空分组
            let emptyGroups = [];
            try { emptyGroups = JSON.parse(localStorage.getItem('adb_empty_groups') || '[]'); } catch(e) {}
            const allGroups = [...new Set([...groups, ...emptyGroups])].sort((a, b) => a.localeCompare(b, 'zh-CN'));

            // datalist（表单输入用）
            const datalist = document.getElementById('groupOptions');
            if (datalist) {
                datalist.innerHTML = '';
                allGroups.forEach(g => {
                    const opt = document.createElement('option');
                    opt.value = g;
                    datalist.appendChild(opt);
                });
            }

            // 批量移动下拉
            const select = document.getElementById('batchMoveGroup');
            if (select) {
                const currentVal = select.value;
                select.innerHTML = '<option value="">移动到分组...</option>';
                allGroups.forEach(g => {
                    const opt = document.createElement('option');
                    opt.value = g;
                    opt.text = g;
                    select.appendChild(opt);
                });
                select.innerHTML += '<option value="__new__">+ 新建分组...</option>';
                select.value = currentVal;
            }
        } catch (err) {
            console.error('加载分组失败', err);
        }
    }

    function showGroupManager() {
        // 获取当前分组列表
        apiFetch(`${API_BASE}/groups`).then(r => r.json()).then(data => {
            const groups = data.groups || [];
            const ungroupedCount = allCommands.filter(c => !(c.group || '').trim()).length;
            let emptyGroups = [];
            try { emptyGroups = JSON.parse(localStorage.getItem('adb_empty_groups') || '[]'); } catch(e) {}
            const allGroups = [...new Set([...groups, ...emptyGroups])];

            let html = '<div style="max-height:400px;overflow-y:auto;" id="groupManagerBody">';
            // 新建分组
            html += `<div class="mb-3 d-flex gap-2">
                <input type="text" id="newGroupNameInput" class="form-control form-control-sm" placeholder="输入新分组名称" style="max-width:200px;">
                <button class="btn btn-sm btn-outline-success" onclick="window._createEmptyGroup()"><i class="bi bi-plus"></i> 新建分组</button>
            </div>`;

            // 未分组
            if (ungroupedCount > 0) {
                html += `<div class="d-flex align-items-center gap-2 mb-2 p-2 border rounded bg-light">
                    <i class="bi bi-inbox text-muted"></i>
                    <span class="flex-grow-1 fw-medium text-muted">未分组</span>
                    <span class="badge bg-secondary">${ungroupedCount} 条</span>
                    <button class="btn btn-sm btn-outline-primary" onclick="window._renameGroup('')">
                        <i class="bi bi-arrow-right-circle"></i> 移至分组
                    </button>
                </div>`;
            }

            if (allGroups.length === 0 && ungroupedCount === 0) {
                html += '<p class="text-muted">暂无分组。在命令表单中输入分组名称即可自动创建，或点击上方按钮新建空分组。</p>';
            }
            allGroups.forEach(g => {
                const count = allCommands.filter(c => (c.group || '') === g).length;
                const escG = escapeHtml(g).replace(/'/g, '&#39;');
                html += `<div class="d-flex align-items-center gap-2 mb-2 p-2 border rounded">
                    <i class="bi bi-folder2 text-primary"></i>
                    <span class="flex-grow-1 fw-medium">${escapeHtml(g)}</span>
                    <span class="badge bg-primary">${count} 条</span>
                    <button class="btn btn-sm btn-outline-primary" onclick="window._renameGroup('${escG}')">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="window._deleteGroup('${escG}')">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>`;
            });
            html += '</div>';

            // 更新或创建 modal
            const existing = document.getElementById('groupManagerModal');
            if (existing && existing.classList.contains('show')) {
                // modal 已打开，只更新内容
                existing.querySelector('.modal-body').innerHTML = html;
            } else if (existing) {
                existing.querySelector('.modal-body').innerHTML = html;
                new bootstrap.Modal(existing).show();
            } else {
                const wrapper = document.createElement('div');
                wrapper.innerHTML = `
                    <div class="modal fade" id="groupManagerModal" tabindex="-1">
                        <div class="modal-dialog">
                            <div class="modal-content">
                                <div class="modal-header py-2">
                                    <h5 class="modal-title">管理分组</h5>
                                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                                </div>
                                <div class="modal-body">${html}</div>
                            </div>
                        </div>
                    </div>`;
                document.body.appendChild(wrapper);
                new bootstrap.Modal(wrapper.querySelector('.modal')).show();
                wrapper.querySelector('.modal').addEventListener('hidden.bs.modal', () => wrapper.remove());
            }
        });
    }

    window._createEmptyGroup = function () {
        const input = document.getElementById('newGroupNameInput');
        const name = (input ? input.value : '').trim();
        if (!name) { alert('请输入分组名称'); return; }
        const existing = allCommands.some(c => (c.group || '') === name);
        if (existing) { alert('该分组已存在（已有命令属于此分组）'); return; }
        let emptyGroups = [];
        try { emptyGroups = JSON.parse(localStorage.getItem('adb_empty_groups') || '[]'); } catch(e) {}
        if (!emptyGroups.includes(name)) {
            emptyGroups.push(name);
            localStorage.setItem('adb_empty_groups', JSON.stringify(emptyGroups));
        }
        showToast(`分组 "${name}" 已创建`);
        showGroupManager();
        renderCommandButtons();
        renderCommandList();
        loadGroupOptions();
    };

    window._renameGroup = async function (oldName) {
        const isUngrouped = (oldName === '');
        const promptMsg = isUngrouped ? '将"未分组"命令移至分组' : `重命名分组 "${oldName}"`;
        // 获取已有分组列表作为下拉选项
        const existingGroups = [...new Set(allCommands.map(c => c.group || '').filter(Boolean))];
        let emptyGroups = [];
        try { emptyGroups = JSON.parse(localStorage.getItem('adb_empty_groups') || '[]'); } catch(e) {}
        const allGroupOptions = [...new Set([...existingGroups, ...emptyGroups])].sort((a, b) => a.localeCompare(b, 'zh-CN'));

        // 自定义 prompt modal
        const old = document.getElementById('customPromptModal');
        if (old) old.remove();
        const datalistHtml = allGroupOptions.map(g => `<option value="${escapeHtml(g)}">`).join('');
        const wrapper = document.createElement('div');
        wrapper.innerHTML = `
            <div class="modal fade" id="customPromptModal" tabindex="-1">
                <div class="modal-dialog modal-sm modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header py-2">
                            <h6 class="modal-title">${escapeHtml(promptMsg)}</h6>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body py-2">
                            <input type="text" id="customPromptInput" class="form-control form-control-sm"
                                value="${escapeHtml(isUngrouped ? '' : oldName)}" placeholder="输入或选择分组名称"
                                list="promptGroupOptions" autocomplete="off">
                            <datalist id="promptGroupOptions">${datalistHtml}</datalist>
                        </div>
                        <div class="modal-footer py-1">
                            <button type="button" class="btn btn-sm btn-secondary" data-bs-dismiss="modal">取消</button>
                            <button type="button" class="btn btn-sm btn-primary" id="customPromptOk">确定</button>
                        </div>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(wrapper);
        const modal = wrapper.querySelector('.modal');
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
        const input = document.getElementById('customPromptInput');
        input.select();
        input.addEventListener('keydown', function(e) { if (e.key === 'Enter') { document.getElementById('customPromptOk').click(); } });
        document.getElementById('customPromptOk').addEventListener('click', async function () {
            const newName = input.value.trim();
            bsModal.hide();
            if (!newName || newName === oldName) return;
            try {
                if (isUngrouped) {
                    const names = allCommands.filter(c => !(c.group || '').trim()).map(c => c.name);
                    if (names.length === 0) { showToast('没有未分组的命令', 'error'); return; }
                    const res = await apiFetch(`${API_BASE}/commands/batch_move`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ names, group: newName })
                    });
                    const data = await res.json();
                    if (data.error) { showToast(data.error, 'error'); return; }
                    allCommands = data.commands;
                    let eg = [];
                    try { eg = JSON.parse(localStorage.getItem('adb_empty_groups') || '[]'); } catch(e) {}
                    eg = eg.filter(g => g !== newName);
                    localStorage.setItem('adb_empty_groups', JSON.stringify(eg));
                } else {
                    const res = await apiFetch(`${API_BASE}/groups/rename`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ old_name: oldName, new_name: newName })
                    });
                    const data = await res.json();
                    if (data.error) { showToast(data.error, 'error'); return; }
                    allCommands = data.commands;
                    let eg = [];
                    try { eg = JSON.parse(localStorage.getItem('adb_empty_groups') || '[]'); } catch(e) {}
                    eg = eg.map(g => g === oldName ? newName : g);
                    localStorage.setItem('adb_empty_groups', JSON.stringify(eg));
                }
                renderCommandButtons();
                renderCommandList();
                loadGroupOptions();
                showGroupManager();
            } catch (err) { showToast('操作失败：' + err.message, 'error'); }
        });
        modal.addEventListener('hidden.bs.modal', () => wrapper.remove());
    };

    window._deleteGroup = async function (groupName) {
        const count = allCommands.filter(function(c) { return (c.group || '') === groupName; }).length;
        // 空分组：只存在于 localStorage，直接从本地移除即可
        if (count === 0) {
            if (!confirm(`确定删除空分组 "${groupName}" 吗？`)) return;
            try {
                var eg = JSON.parse(localStorage.getItem('adb_empty_groups') || '[]');
                eg = eg.filter(function(g) { return g !== groupName; });
                localStorage.setItem('adb_empty_groups', JSON.stringify(eg));
            } catch(e) {}
            renderCommandButtons();
            renderCommandList();
            loadGroupOptions();
            showGroupManager();
            return;
        }
        // 非空分组：调用后端 API，组内命令将移至"未分组"
        if (!confirm(`确定删除分组 "${groupName}" 吗？\n组内 ${count} 条命令将移至"未分组"。`)) return;
        try {
            const res = await apiFetch(`${API_BASE}/groups/${encodeURIComponent(groupName)}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.error) { showToast(data.error, 'error'); return; }
            allCommands = data.commands;
            var emptyGroups = [];
            try { emptyGroups = JSON.parse(localStorage.getItem('adb_empty_groups') || '[]'); } catch(e) {}
            emptyGroups = emptyGroups.filter(function(g) { return g !== groupName; });
            localStorage.setItem('adb_empty_groups', JSON.stringify(emptyGroups));
            renderCommandButtons();
            renderCommandList();
            loadGroupOptions();
            showGroupManager(); // 刷新 modal 内容，不关闭
        } catch (err) { showToast('删除失败：' + err.message, 'error'); }
    };

    // ---------- 日志采集 ----------
    async function updateLogcatStatus() {
        try {
            const res = await apiFetch(`${API_BASE}/logcat/status`);
            const data = await res.json();
            const btnStart = document.getElementById('btnStartLogcat');
            const btnStop = document.getElementById('btnStopLogcat');
            const statusSpan = document.getElementById('logcatStatus');
            const statusText = document.getElementById('logcatStatusText');
            const detailDiv = document.getElementById('logcatDetail');
            const filenameInput = document.getElementById('logcatFilename');
            if (data.running) {
                btnStart.disabled = true;
                btnStop.disabled = false;
                filenameInput.disabled = true;
                if (statusText) { statusText.innerText = '正在采集'; statusText.className = 'badge bg-success'; }
                detailDiv.style.display = '';
                if (window.currentLogcatPath) {
                    const fileName = data.file || '未知';
                    detailDiv.innerHTML = `设备：${escapeHtml(data.device || '')}，<a href="#" onclick="window.openContainingFolder('${window.currentLogcatPath}'); return false;">文件：${escapeHtml(fileName)}</a>`;
                } else {
                    detailDiv.innerHTML = `设备：${escapeHtml(data.device || '')}，文件：${escapeHtml(data.file || '未知')}`;
                }
            } else {
                btnStart.disabled = false;
                btnStop.disabled = true;
                filenameInput.disabled = false;
                if (statusSpan) statusSpan.innerHTML = '状态：<span id="logcatStatusText" class="badge bg-danger">未运行</span>';
                detailDiv.style.display = 'none';
                detailDiv.innerHTML = '';
                window.currentLogcatPath = null;
            }
        } catch (err) { console.error('获取日志状态失败', err); }
    }

    let logcatBusy = false; // 防抖

    async function startLogcat() {
        if (logcatBusy) return;
        const device = document.getElementById('deviceSelect').value;
        if (!device) { showToast('请先选择设备', 'error'); return; }
        const filename = document.getElementById('logcatFilename').value.trim();
        const payload = { device };
        if (filename) payload.filename = filename;
        logcatBusy = true;
        try {
            const res = await apiFetch(`${API_BASE}/logcat/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.error) showToast('启动失败：' + data.error, 'error');
            else {
                showToast(`日志采集已启动`);
                window.currentLogcatPath = data.path || null;
                updateLogcatStatus();
            }
        } catch (err) { showToast('请求失败：' + err.message, 'error'); }
        finally { logcatBusy = false; }
    }

    async function stopLogcat() {
        if (logcatBusy) return;
        // 获取当前日志文件名供重命名
        var currentFilename = '';
        if (window.currentLogcatPath) {
            currentFilename = window.currentLogcatPath.replace(/^.*[\\/]/, '');
        }
        showConfirmModal('停止日志采集', '确定停止日志采集吗？', async function (newFilename) {
            logcatBusy = true;
            try {
                var body = {};
                if (newFilename && newFilename !== currentFilename) {
                    body.new_filename = newFilename;
                }
                const res = await apiFetch(`${API_BASE}/logcat/stop`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                const data = await res.json();
                if (data.error) showToast('停止失败：' + data.error, 'error');
                else {
                    showToast(`日志采集已停止`);
                    window.currentLogcatPath = null;
                    updateLogcatStatus();
                }
            } catch (err) { showToast('请求失败：' + err.message, 'error'); }
            finally { logcatBusy = false; }
        }, 'btn-danger', {
            label: '日志文件名（可编辑）',
            value: currentFilename,
            placeholder: '输入新的日志文件名'
        });
    }

    async function openFolder() {
        const pathInput = document.getElementById('logcatFilename').value.trim();
        try {
            const res = await apiFetch(`${API_BASE}/open_folder`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: pathInput === '' ? '' : pathInput })
            });
            const data = await res.json();
            if (!res.ok) showToast('打开失败：' + (data.error || res.statusText), 'error');
        } catch (err) { showToast('请求失败：' + err.message, 'error'); }
    }

    window.openContainingFolder = async function (filePath) {
        if (!filePath) return;
        const dirPath = filePath.substring(0, filePath.lastIndexOf('\\'));
        if (!dirPath) return;
        try {
            const res = await apiFetch(`${API_BASE}/open_folder`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: dirPath })
            });
            const data = await res.json();
            if (!res.ok) showToast('打开失败：' + (data.error || res.statusText), 'error');
        } catch (err) { showToast('请求失败：' + err.message, 'error'); }
    };

    // ---------- 命令管理 ----------
    async function loadCommands() {
        try {
            const res = await apiFetch(`${API_BASE}/commands`);
            const data = await res.json();
            allCommands = data.commands;
            renderCommandButtons();
            renderCommandList();
            loadGroupOptions();
        } catch (err) { console.error('加载命令失败', err); }
    }

    // ---------- 自动 shell 开关 ----------
    function isAutoShellEnabled() {
        const toggle = document.getElementById('autoShellToggle');
        return toggle ? toggle.checked : true; // 默认开启
    }

    // adb 自身子命令（不需要加 shell 前缀的）
    var ADB_DIRECT_CMDS_RE = /^(adb\s+)?(push|pull|install|uninstall|reboot|root|remount|sync|forward|reverse|usb|tcpip|connect|disconnect|exec-in|exec-out|devices|kill-server|start-server|help|version|wait-for-device|get-state|get-serialno|logcat|emu|backup|restore|bugreport|jdwp|ppp)\b/;

    function applyAutoShellSingle(cmdText) {
        // 对单条命令做自动 shell 处理
        var t = cmdText.trim();
        if (!t) return '';
        // 已有 shell / adb shell 前缀 —— 不处理
        if (/^(adb\s+)?shell\b/.test(t)) return t;
        // 已知的 adb 子命令 —— 不处理
        if (ADB_DIRECT_CMDS_RE.test(t)) return t;
        // 以 "adb " 开头但不是已知子命令 → 用户本意是 shell 命令，改写为 shell xxx
        if (/^adb\s+/.test(t)) return 'shell ' + t.replace(/^adb\s+/, '');
        // 其余情况自动加 shell
        return 'shell ' + t;
    }

    function applyAutoShell(cmdText) {
        if (!isAutoShellEnabled()) return cmdText;
        var trimmed = cmdText.trim();
        // 按 ; & 换行 拆分多命令，逐条处理后再拼回
        if (/[;&\n]/.test(trimmed)) {
            var parts = trimmed.split(/[;&\n]+/);
            return parts.map(function(p) { return applyAutoShellSingle(p); }).filter(function(x) { return x; }).join(';');
        }
        return applyAutoShellSingle(trimmed);
    }

    async function sendCommand(cmdText) {
        const device = document.getElementById('deviceSelect').value;
        const statusBanner = document.getElementById('cmdStatusBanner');
        const cmdEcho = document.getElementById('cmdEcho');
        const cmdOutput = document.getElementById('cmdOutput');
        if (!device) {
            statusBanner.style.display = 'none';
            cmdEcho.innerHTML = '<span class="text-muted">等待执行命令...</span>';
            cmdOutput.innerHTML = '<span class="text-muted">请先选择设备</span>';
            return;
        }
        // 自动加 shell 前缀
        cmdText = applyAutoShell(cmdText);
        // 构建完整命令用于显示（去除多余的 adb 前缀，避免显示 "adb -s DEVICE adb shell ..."）
        let displayCmd = cmdText.trim();
        if (/^adb\s+/.test(displayCmd)) {
            displayCmd = displayCmd.replace(/^adb\s+/, '');
        }
        // 构建多命令显示：分号分隔时每条命令换行显示
        const cmdParts = displayCmd.split(';').map(p => p.trim()).filter(p => p);
        let cmdEchoHtml;
        if (cmdParts.length > 1) {
            cmdEchoHtml = cmdParts.map(p => `<span class="cmd-prompt">$</span> ${escapeHtml(`adb -s ${device} ${p}`)}`).join('\n');
        } else {
            cmdEchoHtml = `<span class="cmd-prompt">$</span> ${escapeHtml(`adb -s ${device} ${displayCmd}`)}`;
        }
        // 命令回显区显示（紧凑模式），隐藏状态横幅
        cmdEcho.innerHTML = cmdEchoHtml;
        cmdEcho.classList.remove('expanded');
        cmdEcho.title = cmdParts.length > 1 ? '点击展开查看完整命令' : '';
        statusBanner.style.display = 'none';
        cmdOutput.innerHTML = '<span class="text-muted"><span class="spinner-border spinner-border-sm me-1" role="status"></span>正在执行...</span>';
        try {
            const res = await apiFetch(`${API_BASE}/send_command`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ device, command: cmdText, auto_shell: isAutoShellEnabled() })
            });
            const result = await res.json();
            if (result.error) {
                // 错误：红色横幅
                statusBanner.className = 'cmd-status-banner cmd-status-error';
                statusBanner.innerHTML = '<i class="bi bi-x-circle"></i> <span>执行失败</span><span class="cmd-status-ts">' + formatTimestamp() + '</span><span class="cmd-status-rc">' + escapeHtml(result.error) + '</span>';
                statusBanner.style.display = 'flex';
                cmdOutput.innerHTML = '';
                pushHistory(device, cmdText, 'error', -1, '', result.error);
            }
            else {
                const rc = result.returncode;
                const stdout = (result.stdout || '').trim();
                const stderr = (result.stderr || '').trim();
                if (rc === 0) {
                    // 成功：绿色横幅
                    statusBanner.className = 'cmd-status-banner cmd-status-success';
                    statusBanner.innerHTML = '<i class="bi bi-check-circle"></i> <span>执行成功</span><span class="cmd-status-ts">' + formatTimestamp() + '</span><span class="cmd-status-rc">返回码: 0</span>';
                    statusBanner.style.display = 'flex';
                    pushHistory(device, cmdText, 'success', 0, stdout, stderr);
                    // 合并 stdout / stderr（adb 很多命令如 push 会把正常输出写到 stderr）
                    if (stdout || stderr) {
                        let out = '';
                        if (stdout) out += formatOutputLines(stdout);
                        if (stderr) {
                            if (out) out += '\n';
                            out += formatOutputLines(stderr);
                        }
                        cmdOutput.innerHTML = out;
                    } else {
                        cmdOutput.innerHTML = '<span class="text-muted">(无输出)</span>';
                    }
                } else {
                    // 失败：红色横幅
                    statusBanner.className = 'cmd-status-banner cmd-status-error';
                    statusBanner.innerHTML = '<i class="bi bi-x-circle"></i> <span>执行异常</span><span class="cmd-status-ts">' + formatTimestamp() + '</span><span class="cmd-status-rc">返回码: ' + rc + '</span>';
                    statusBanner.style.display = 'flex';
                    pushHistory(device, cmdText, 'error', rc, stdout, stderr);
                    // 区分 stdout / stderr，stderr 标红
                    let out = '';
                    if (stdout) out += escapeHtml(stdout);
                    if (stderr) {
                        if (out) out += '\n';
                        out += '<span class="text-danger">' + escapeHtml(stderr) + '</span>';
                    }
                    cmdOutput.innerHTML = out || '<span class="text-muted">(无输出)</span>';
                }
            }
        } catch (error) {
            statusBanner.className = 'cmd-status-banner cmd-status-error';
            statusBanner.innerHTML = '<i class="bi bi-exclamation-triangle"></i> <span>请求失败</span><span class="cmd-status-ts">' + formatTimestamp() + '</span><span class="cmd-status-rc">' + escapeHtml(error.message) + '</span>';
            statusBanner.style.display = 'flex';
            cmdOutput.innerHTML = '';
            pushHistory(device, cmdText, 'error', -1, '', error.message || 'Network error');
        }
    }

    async function addCommand() {
        const name = document.getElementById('cmdName').value.trim();
        const cmd = document.getElementById('cmdText').value.trim();
        const group = document.getElementById('cmdGroup').value.trim();
        if (!name || !cmd) return alert('名称和命令不能为空');
        try {
            const res = await apiFetch(`${API_BASE}/commands`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, cmd, group })
            });
            const data = await res.json();
            if (data.error) alert(data.error);
            else {
                clearForm();
                allCommands = data.commands;
                // 如果命令有分组，从空分组列表中移除
                if (group) {
                    try {
                        let emptyGroups = JSON.parse(localStorage.getItem('adb_empty_groups') || '[]');
                        emptyGroups = emptyGroups.filter(g => g !== group);
                        localStorage.setItem('adb_empty_groups', JSON.stringify(emptyGroups));
                    } catch(e) {}
                }
                renderCommandButtons();
                renderCommandList();
                loadGroupOptions();
                showToast('命令添加成功！');
            }
        } catch (err) { alert('添加失败：' + err.message); }
    }

    async function updateCommand() {
        // 从 selectedNames 或表单中获取旧名称
        let oldName = '';
        if (selectedNames.size === 1) {
            oldName = [...selectedNames][0];
        } else {
            // 尝试用 cmdName 匹配
            const nameInput = document.getElementById('cmdName').value.trim();
            if (allCommands.find(c => c.name === nameInput)) oldName = nameInput;
        }
        if (!oldName) return alert('请在列表中选择一条命令，或输入已有命令名称');
        const newName = document.getElementById('cmdName').value.trim();
        const newCmd = document.getElementById('cmdText').value.trim();
        const newGroup = document.getElementById('cmdGroup').value.trim();
        if (!newName || !newCmd) return alert('名称和命令不能为空');
        try {
            const res = await apiFetch(`${API_BASE}/commands/${encodeURIComponent(oldName)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName, cmd: newCmd, group: newGroup })
            });
            const data = await res.json();
            if (data.error) alert(data.error);
            else { clearForm(); selectedNames.clear(); allCommands = data.commands; renderCommandButtons(); renderCommandList(); loadGroupOptions(); showToast('命令修改成功！'); }
        } catch (err) { alert('修改失败：' + err.message); }
    }

    async function deleteCommand() {
        let name = '';
        let oldCmd = null;
        if (selectedNames.size === 1) {
            name = [...selectedNames][0];
            oldCmd = allCommands.find(c => c.name === name);
        } else {
            const nameInput = document.getElementById('cmdName').value.trim();
            oldCmd = allCommands.find(c => c.name === nameInput);
            if (oldCmd) name = nameInput;
        }
        if (!name) return alert('请在列表中选择一条命令，或输入已有命令名称');
        if (!confirm(`确定删除命令"${name}"吗？`)) return;
        var deletedGroup = (oldCmd && oldCmd.group || '').trim();
        try {
            const res = await apiFetch(`${API_BASE}/commands/${encodeURIComponent(name)}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.error) alert(data.error);
            else {
                clearForm(); selectedNames.delete(name); allCommands = data.commands;
                // 如果该分组已无命令，保留到空分组列表
                if (deletedGroup && !allCommands.some(c => (c.group || '').trim() === deletedGroup)) {
                    try {
                        var eg = JSON.parse(localStorage.getItem('adb_empty_groups') || '[]');
                        if (!eg.includes(deletedGroup)) { eg.push(deletedGroup); localStorage.setItem('adb_empty_groups', JSON.stringify(eg)); }
                    } catch(e) {}
                }
                renderCommandButtons(); renderCommandList(); loadGroupOptions(); showToast('命令已删除');
            }
        } catch (err) { alert('删除失败：' + err.message); }
    }

    function clearForm() {
        document.getElementById('cmdName').value = '';
        document.getElementById('cmdText').value = '';
        document.getElementById('cmdGroup').value = '';
        // 触发 textarea 缩回最小高度
        document.getElementById('cmdText').dispatchEvent(new Event('input', { bubbles: true }));
    }

    // ---------- 批量操作 ----------
    async function batchDelete() {
        const names = [...selectedNames];
        if (names.length === 0) return alert('请先勾选要删除的命令');
        if (!confirm(`确定删除选中的 ${names.length} 条命令吗？`)) return;
        // 记录将被删除命令的分组
        var affectedGroups = new Set();
        names.forEach(function(n) {
            var c = allCommands.find(function(x) { return x.name === n; });
            if (c) affectedGroups.add((c.group || '').trim());
        });
        try {
            const res = await apiFetch(`${API_BASE}/commands/batch_delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ names })
            });
            const data = await res.json();
            if (data.error) alert(data.error);
            else {
                selectedNames.clear(); allCommands = data.commands;
                // 保留变为空的分组
                try {
                    var eg = JSON.parse(localStorage.getItem('adb_empty_groups') || '[]');
                    affectedGroups.forEach(function(g) {
                        if (g && !allCommands.some(function(c) { return (c.group || '').trim() === g; }) && !eg.includes(g)) {
                            eg.push(g);
                        }
                    });
                    localStorage.setItem('adb_empty_groups', JSON.stringify(eg));
                } catch(e) {}
                renderCommandButtons(); renderCommandList(); loadGroupOptions(); showToast(`已批量删除 ${names.length} 条命令`);
            }
        } catch (err) { alert('批量删除失败：' + err.message); }
    }

    async function batchMove() {
        const names = [...selectedNames];
        if (names.length === 0) return showToast('请先勾选要移动的命令', 'error');
        const select = document.getElementById('batchMoveGroup');
        let targetGroup = select.value;
        if (targetGroup === '__new__') {
            customPrompt('输入新分组名称', '', function(val) {
                if (!val) return;
                doBatchMove(names, val);
            });
            return;
        }
        doBatchMove(names, targetGroup);
    }

    async function doBatchMove(names, targetGroup) {
        try {
            const res = await apiFetch(`${API_BASE}/commands/batch_move`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ names, group: targetGroup })
            });
            const data = await res.json();
            if (data.error) alert(data.error);
            else {
                selectedNames.clear();
                allCommands = data.commands;
                // 清理 localStorage 中已不再为空的分组
                try {
                    let emptyGroups = JSON.parse(localStorage.getItem('adb_empty_groups') || '[]');
                    const realGroups = new Set(allCommands.map(c => (c.group || '').trim()).filter(Boolean));
                    emptyGroups = emptyGroups.filter(g => !realGroups.has(g));
                    localStorage.setItem('adb_empty_groups', JSON.stringify(emptyGroups));
                } catch(e) {}
                renderCommandButtons();
                renderCommandList();
                loadGroupOptions();
                showToast(`已移动 ${names.length} 条命令到 "${targetGroup || '未分组'}"`);
            }
        } catch (err) { alert('批量移动失败：' + err.message); }
    }

    function toggleSelectAll() {
        const checkboxes = document.querySelectorAll('.cmd-check');
        const allChecked = [...checkboxes].every(cb => cb.checked);
        checkboxes.forEach(cb => {
            cb.checked = !allChecked;
            const name = cb.getAttribute('data-name');
            if (cb.checked) selectedNames.add(name); else selectedNames.delete(name);
        });
        // 同步分组全选框
        document.querySelectorAll('.group-check').forEach(gc => {
            const group = gc.getAttribute('data-group');
            const escapedGroup = group.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            const groupCbs = document.querySelectorAll(`.cmd-check[data-group="${escapedGroup}"]`);
            gc.checked = groupCbs.length > 0 && [...groupCbs].every(cb => cb.checked);
        });
    }

    // ---------- 导入导出 ----------
    async function exportCommands() {
        customPrompt('导出文件名', 'adb_commands.json', async function(filename) {
            const downloadName = filename || 'adb_commands.json';
            const res = await apiFetch(`${API_BASE}/commands`);
            const data = await res.json();
            const blob = new Blob([JSON.stringify(data.commands, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = downloadName.endsWith('.json') ? downloadName : downloadName + '.json';
            a.click();
            URL.revokeObjectURL(url);
        });
    }

    async function importCommands(files) {
        if (files.length === 0) return;
        const file = files[0];
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const commands = JSON.parse(e.target.result);
                if (!Array.isArray(commands)) { alert('文件格式错误：应为命令数组'); return; }
                const res = await apiFetch(`${API_BASE}/commands/import`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(commands)
                });
                const result = await res.json();
                if (result.error) alert('导入失败：' + result.error);
                else { showToast('导入成功！'); allCommands = result.commands; renderCommandButtons(); renderCommandList(); loadGroupOptions(); }
            } catch (err) { alert('读取文件失败：' + err.message); }
            document.getElementById('importFile').value = '';
        };
        reader.readAsText(file);
    }

    function clearOutput() {
        document.getElementById('cmdStatusBanner').style.display = 'none';
        document.getElementById('cmdEcho').innerHTML = '<span class="text-muted">等待执行命令...</span>';
        document.getElementById('cmdOutput').innerHTML = '<span class="text-muted">命令执行结果将显示在这里...</span>';
    }

    // ---------- 执行历史 ----------
    function showExecHistory() {
        // 清理旧弹窗
        var old = document.getElementById('execHistoryModal');
        if (old) old.remove();

        var html = '<div class="modal fade" id="execHistoryModal" tabindex="-1">' +
            '<div class="modal-dialog modal-lg modal-dialog-centered">' +
            '<div class="modal-content">' +
            '<div class="modal-header py-2">' +
            '<h6 class="modal-title"><i class="bi bi-clock-history me-1"></i>执行历史' +
            (execHistory.length > 0 ? ' <span class="text-muted small">(' + execHistory.length + ' 条)</span>' : '') +
            '</h6>' +
            '<button type="button" class="btn-close" data-bs-dismiss="modal"></button>' +
            '</div>' +
            '<div class="modal-body p-0">';

        if (execHistory.length === 0) {
            html += '<p class="text-center text-muted py-5 mb-0">暂无执行记录</p>';
        } else {
            html += '<div class="exec-history-list">';
            execHistory.forEach(function(entry) {
                var statusIcon = entry.status === 'success'
                    ? '<i class="bi bi-check-circle-fill text-success"></i>'
                    : '<i class="bi bi-x-circle-fill text-danger"></i>';
                var rcText = entry.returncode >= 0 ? ('返回码: ' + entry.returncode) : '';
                var shortTime = entry.timestamp.substring(11); // HH:MM:SS
                // 命令摘要，最多 60 字符
                var cmdSummary = entry.command.length > 60 ? entry.command.substring(0, 60) + '...' : entry.command;
                html += '<div class="exec-history-item" data-id="' + entry.id + '" ' +
                    'title="' + escapeHtml(entry.timestamp) + '&#10;设备: ' + escapeHtml(entry.device) + '&#10;' + escapeHtml(entry.command) + '">' +
                    '<span class="exec-history-status">' + statusIcon + '</span>' +
                    '<span class="exec-history-time">' + escapeHtml(shortTime) + '</span>' +
                    '<span class="exec-history-cmd">' + escapeHtml(cmdSummary) + '</span>' +
                    '<span class="exec-history-meta">' + escapeHtml(entry.device) + (rcText ? ' | ' + rcText : '') + '</span>' +
                    '<button class="btn-exec-history-copy" data-id="' + entry.id + '" title="复制执行信息"><i class="bi bi-clipboard"></i></button>' +
                    '</div>';
            });
            html += '</div>';
        }

        html += '</div>' +
            '<div class="modal-footer py-2">' +
            (execHistory.length > 0 ? '<button type="button" class="btn btn-outline-danger btn-sm" id="btnClearHistory"><i class="bi bi-trash3"></i> 清空历史</button>' : '') +
            '<button type="button" class="btn btn-sm btn-secondary" data-bs-dismiss="modal">关闭</button>' +
            '</div>' +
            '</div></div></div>';

        var wrapper = document.createElement('div');
        wrapper.innerHTML = html;
        document.body.appendChild(wrapper);

        var modalEl = wrapper.querySelector('.modal');
        var bsModal = new bootstrap.Modal(modalEl);
        bsModal.show();

        // 悬浮显示简要预览（无滚动内容），点击查看完整详情
        var hoverPopup = null;
        var hoverHideTimer = null;

        function showHoverDetail(item, entry) {
            // 清除隐藏定时器
            if (hoverHideTimer) { clearTimeout(hoverHideTimer); hoverHideTimer = null; }
            // 移除旧弹窗
            if (hoverPopup) { hoverPopup.remove(); hoverPopup = null; }

            var stdout = (entry.stdout || '').trim();
            var stderr = (entry.stderr || '').trim();
            var hasOutput = stdout || stderr;

            // 命令截断显示（最长 150 字符）
            var cmdDisplay = entry.command.length > 150 ? entry.command.substring(0, 150) + '...' : entry.command;
            // 输出摘要（仅显示前 2 行，每行最多 80 字符）
            var outputPreview = '';
            if (stdout) {
                var lines = stdout.split('\n');
                var preview = lines.slice(0, 2).map(function(l) { return l.length > 80 ? l.substring(0, 80) + '...' : l; }).join('\n');
                outputPreview = '<div class="exec-history-popup-row"><span class="exec-history-popup-label">stdout 预览</span><pre class="exec-history-popup-pre exec-history-popup-pre-compact">' + escapeHtml(preview) + '</pre></div>';
            } else if (stderr) {
                var lines = stderr.split('\n');
                var preview = lines.slice(0, 2).map(function(l) { return l.length > 80 ? l.substring(0, 80) + '...' : l; }).join('\n');
                outputPreview = '<div class="exec-history-popup-row"><span class="exec-history-popup-label">stderr 预览</span><pre class="exec-history-popup-pre exec-history-popup-pre-compact text-danger">' + escapeHtml(preview) + '</pre></div>';
            }

            var detailHtml = '<div class="exec-history-popup">' +
                '<div class="exec-history-popup-row"><span class="exec-history-popup-label">时间</span><span>' + escapeHtml(entry.timestamp) + '</span></div>' +
                '<div class="exec-history-popup-row"><span class="exec-history-popup-label">设备</span><span>' + escapeHtml(entry.device) + '</span></div>' +
                '<div class="exec-history-popup-row"><span class="exec-history-popup-label">状态</span><span>' + (entry.status === 'success' ? '<span class="text-success">成功</span>' : '<span class="text-danger">失败</span>') + (entry.returncode >= 0 ? ' (返回码: ' + entry.returncode + ')' : '') + '</span></div>' +
                '<div class="exec-history-popup-row"><span class="exec-history-popup-label">完整命令</span><code class="exec-history-popup-cmd">' + escapeHtml(cmdDisplay) + '</code></div>' +
                outputPreview +
                '</div>';

            hoverPopup = document.createElement('div');
            hoverPopup.className = 'exec-history-hover-popup';
            hoverPopup.innerHTML = detailHtml;
            document.body.appendChild(hoverPopup);

            // 定位弹窗
            var rect = item.getBoundingClientRect();
            var popupW = 420;
            var left = rect.right + 10;
            if (left + popupW > window.innerWidth - 10) {
                left = rect.left - popupW - 10;
            }
            if (left < 10) left = 10;
            var top = rect.top;
            var maxTop = window.innerHeight - 10;
            hoverPopup.style.left = left + 'px';
            hoverPopup.style.top = top + 'px';
            hoverPopup.style.maxHeight = (maxTop - top) + 'px';
            hoverPopup.style.display = 'block';
        }

        function hideHoverDetail() {
            // 延迟隐藏，给用户时间移动到点击
            hoverHideTimer = setTimeout(function() {
                if (hoverPopup) { hoverPopup.remove(); hoverPopup = null; }
            }, 150);
        }

        function showHistoryEntryDetail(entry) {
            // 先隐藏悬浮弹窗
            if (hoverHideTimer) { clearTimeout(hoverHideTimer); hoverHideTimer = null; }
            if (hoverPopup) { hoverPopup.remove(); hoverPopup = null; }

            // 移除旧详情弹窗
            var old = document.getElementById('execHistoryDetailModal');
            if (old) old.remove();

            var stdout = (entry.stdout || '').trim();
            var stderr = (entry.stderr || '').trim();

            var html = '<div class="modal fade" id="execHistoryDetailModal" tabindex="-1">' +
                '<div class="modal-dialog modal-lg modal-dialog-centered">' +
                '<div class="modal-content">' +
                '<div class="modal-header py-2">' +
                '<h6 class="modal-title"><i class="bi bi-terminal me-1"></i>执行详情</h6>' +
                '<button type="button" class="btn-close" data-bs-dismiss="modal"></button>' +
                '</div>' +
                '<div class="modal-body">' +
                '<div class="exec-detail-section">' +
                '<div class="exec-detail-row"><span class="exec-detail-label">时间</span><span>' + escapeHtml(entry.timestamp) + '</span></div>' +
                '<div class="exec-detail-row"><span class="exec-detail-label">设备</span><span>' + escapeHtml(entry.device) + '</span></div>' +
                '<div class="exec-detail-row"><span class="exec-detail-label">状态</span><span>' + (entry.status === 'success' ? '<span class="text-success fw-bold">成功</span>' : '<span class="text-danger fw-bold">失败</span>') + (entry.returncode >= 0 ? ' (返回码: ' + entry.returncode + ')' : '') + '</span></div>' +
                '<div class="exec-detail-row"><span class="exec-detail-label">完整命令</span><code class="exec-detail-cmd">' + escapeHtml(entry.command) + '</code></div>' +
                (stdout ? '<div class="exec-detail-row"><span class="exec-detail-label">stdout</span><pre class="exec-detail-pre">' + escapeHtml(stdout) + '</pre></div>' : '') +
                (stderr ? '<div class="exec-detail-row"><span class="exec-detail-label">stderr</span><pre class="exec-detail-pre text-danger">' + escapeHtml(stderr) + '</pre></div>' : '') +
                (!stdout && !stderr ? '<div class="exec-detail-row"><span class="exec-detail-label">输出</span><span class="text-muted">（无输出）</span></div>' : '') +
                '</div>' +
                '</div>' +
                '<div class="modal-footer py-2">' +
                '<button type="button" class="btn btn-outline-primary btn-sm" id="btnCopyDetail"><i class="bi bi-clipboard"></i> 复制详情</button>' +
                '<button type="button" class="btn btn-sm btn-secondary" data-bs-dismiss="modal">关闭</button>' +
                '</div>' +
                '</div></div></div>';

            var wrapper = document.createElement('div');
            wrapper.innerHTML = html;
            document.body.appendChild(wrapper);

            var modalEl = wrapper.querySelector('.modal');
            var bsModal = new bootstrap.Modal(modalEl);
            bsModal.show();

            // 复制按钮
            wrapper.querySelector('#btnCopyDetail').addEventListener('click', function() {
                copyHistoryEntry(entry.id);
                showToast('已复制到剪贴板');
            });

            modalEl.addEventListener('hidden.bs.modal', function() {
                wrapper.remove();
            });
        }

        wrapper.querySelectorAll('.exec-history-item').forEach(function(item) {
            var id = parseInt(item.getAttribute('data-id'));
            var entry = execHistory.find(function(e) { return e.id === id; });
            if (!entry) return;

            item.addEventListener('mouseenter', function() {
                showHoverDetail(this, entry);
            });
            item.addEventListener('mouseleave', function() {
                hideHoverDetail();
            });
            item.addEventListener('click', function(e) {
                // 如果点击的是复制按钮，不触发详情
                if (e.target.closest('.btn-exec-history-copy')) return;
                showHistoryEntryDetail(entry);
            });
        });

        // 复制按钮 → 复制完整执行信息
        wrapper.querySelectorAll('.btn-exec-history-copy').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                var id = parseInt(this.getAttribute('data-id'));
                copyHistoryEntry(id);
            });
        });

        // 清空历史按钮
        var btnClear = wrapper.querySelector('#btnClearHistory');
        if (btnClear) {
            btnClear.addEventListener('click', function() {
                execHistory = [];
                execHistoryId = 0;
                clearOutput();
                bsModal.hide();
                showToast('执行历史已清空');
            });
        }

        modalEl.addEventListener('hidden.bs.modal', function() {
            if (hoverPopup) { hoverPopup.remove(); hoverPopup = null; }
            wrapper.remove();
        });
    }

    function copyHistoryEntry(id) {
        var entry = execHistory.find(function(e) { return e.id === id; });
        if (!entry) return;

        var text = '';
        text += '时间: ' + entry.timestamp + '\n';
        text += '设备: ' + entry.device + '\n';
        text += '命令: ' + entry.command + '\n';
        text += '状态: ' + (entry.status === 'success' ? '成功' : '失败') + '\n';
        text += '返回码: ' + entry.returncode + '\n';
        text += '--- 标准输出 ---\n';
        text += (entry.stdout || '(无输出)') + '\n';
        text += '--- 标准错误 ---\n';
        text += (entry.stderr || '(无输出)');

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function() {
                showToast('执行信息已复制到剪贴板');
            }).catch(function() {
                fallbackCopy(text);
            });
        } else {
            fallbackCopy(text);
        }
    }

    function fallbackCopy(text) {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.top = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        try {
            document.execCommand('copy');
            showToast('执行信息已复制到剪贴板');
        } catch (e) {
            showToast('复制失败，请手动复制', 'error');
        }
        document.body.removeChild(ta);
    }

    function viewHistory(id) {
        var entry = execHistory.find(function(e) { return e.id === id; });
        if (!entry) return;

        var statusBanner = document.getElementById('cmdStatusBanner');
        var cmdEcho = document.getElementById('cmdEcho');
        var cmdOutput = document.getElementById('cmdOutput');

        // 构建命令回显
        var device = entry.device;
        var cmdText = entry.command;
        var displayCmd = cmdText.trim();
        if (/^adb\s+/.test(displayCmd)) {
            displayCmd = displayCmd.replace(/^adb\s+/, '');
        }
        var cmdParts = displayCmd.split(';').map(function(p) { return p.trim(); }).filter(function(p) { return p; });
        var cmdEchoHtml;
        if (cmdParts.length > 1) {
            cmdEchoHtml = cmdParts.map(function(p) { return '<span class="cmd-prompt">$</span> ' + escapeHtml('adb -s ' + device + ' ' + p); }).join('\n');
        } else {
            cmdEchoHtml = '<span class="cmd-prompt">$</span> ' + escapeHtml('adb -s ' + device + ' ' + displayCmd);
        }
        cmdEcho.innerHTML = cmdEchoHtml;
        cmdEcho.classList.remove('expanded');
        cmdEcho.title = cmdParts.length > 1 ? '点击展开查看完整命令' : '';

        // 构建状态横幅
        if (entry.returncode < 0) {
            // 网络/其他错误
            statusBanner.className = 'cmd-status-banner cmd-status-error';
            statusBanner.innerHTML = '<i class="bi bi-x-circle"></i> <span>执行失败</span><span class="cmd-status-ts">' + escapeHtml(entry.timestamp) + '</span><span class="cmd-status-rc">' + escapeHtml(entry.stderr || '') + '</span>';
        } else if (entry.status === 'success') {
            statusBanner.className = 'cmd-status-banner cmd-status-success';
            statusBanner.innerHTML = '<i class="bi bi-check-circle"></i> <span>执行成功</span><span class="cmd-status-ts">' + escapeHtml(entry.timestamp) + '</span><span class="cmd-status-rc">返回码: ' + entry.returncode + '</span>';
        } else {
            statusBanner.className = 'cmd-status-banner cmd-status-error';
            statusBanner.innerHTML = '<i class="bi bi-x-circle"></i> <span>执行异常</span><span class="cmd-status-ts">' + escapeHtml(entry.timestamp) + '</span><span class="cmd-status-rc">返回码: ' + entry.returncode + '</span>';
        }
        statusBanner.style.display = 'flex';

        // 构建输出
        var stdout = (entry.stdout || '').trim();
        var stderr = (entry.stderr || '').trim();
        if (entry.status === 'success') {
            if (stdout || stderr) {
                var out = '';
                if (stdout) out += formatOutputLines(stdout);
                if (stderr) {
                    if (out) out += '\n';
                    out += formatOutputLines(stderr);
                }
                cmdOutput.innerHTML = out;
            } else {
                cmdOutput.innerHTML = '<span class="text-muted">(无输出)</span>';
            }
        } else {
            var out2 = '';
            if (stdout) out2 += escapeHtml(stdout);
            if (stderr) {
                if (out2) out2 += '\n';
                out2 += '<span class="text-danger">' + escapeHtml(stderr) + '</span>';
            }
            cmdOutput.innerHTML = out2 || '<span class="text-muted">(无输出)</span>';
        }
    }

    // ---------- 工具函数 ----------
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // 格式化时间戳
    function formatTimestamp() {
        var now = new Date();
        var pad = function(n) { return n < 10 ? '0' + n : '' + n; };
        return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate())
            + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
    }

    // 追加执行历史（保留最近 50 条）
    function pushHistory(device, command, status, returncode, stdout, stderr) {
        execHistoryId++;
        execHistory.unshift({
            id: execHistoryId,
            timestamp: formatTimestamp(),
            device: device,
            command: command,
            status: status,
            returncode: returncode,
            stdout: stdout || '',
            stderr: stderr || ''
        });
        if (execHistory.length > 50) execHistory.pop();
    }

    // 将多命令输出中的结果值标为绿色（以 [ 开头的行是命令头，其余行是结果值）
    function formatOutputLines(text) {
        return text.split('\n').map(function(line) {
            var trimmed = line.trim();
            if (!trimmed) return ''; // 空行保留
            if (trimmed.startsWith('[')) return escapeHtml(line); // 命令头行，普通颜色
            return '<span class="text-success fw-bold">' + escapeHtml(line) + '</span>'; // 结果值，绿色
        }).join('\n');
    }

    // ---------- 事件绑定 ----------
    function bindEvents() {
        document.getElementById('btnRefreshDevices')?.addEventListener('click', (e) => { e.preventDefault(); refreshDevices(); });
        document.getElementById('btnAddCommand')?.addEventListener('click', (e) => { e.preventDefault(); addCommand(); });
        document.getElementById('btnUpdateCommand')?.addEventListener('click', (e) => { e.preventDefault(); updateCommand(); });
        document.getElementById('btnDeleteCommand')?.addEventListener('click', (e) => { e.preventDefault(); deleteCommand(); });
        document.getElementById('btnClearForm')?.addEventListener('click', (e) => { e.preventDefault(); clearForm(); });
        document.getElementById('btnExportCommands')?.addEventListener('click', (e) => { e.preventDefault(); exportCommands(); });
        document.getElementById('btnImportCommands')?.addEventListener('click', (e) => { e.preventDefault(); document.getElementById('importFile').click(); });
        document.getElementById('importFile')?.addEventListener('change', (e) => importCommands(e.target.files));
        document.getElementById('btnManageGroups')?.addEventListener('click', (e) => { e.preventDefault(); showGroupManager(); });
        document.getElementById('btnSelectAll')?.addEventListener('click', (e) => { e.preventDefault(); toggleSelectAll(); });
        document.getElementById('btnBatchDelete')?.addEventListener('click', (e) => { e.preventDefault(); batchDelete(); });
        document.getElementById('btnBatchMove')?.addEventListener('click', (e) => { e.preventDefault(); batchMove(); });

        // 搜索
        document.getElementById('commandSearch')?.addEventListener('input', function () {
            renderCommandList(this.value);
        });

        // 清空手动命令输入框
        document.getElementById('btnClearManual')?.addEventListener('click', (e) => {
            e.preventDefault();
            const ta = document.getElementById('manualCommand');
            ta.value = '';
            ta.dispatchEvent(new Event('input', { bubbles: true }));
            ta.focus();
        });

        // 手动发送
        document.getElementById('btnSendManual')?.addEventListener('click', (e) => {
            e.preventDefault();
            const cmd = document.getElementById('manualCommand').value.trim();
            if (cmd) sendCommand(cmd);
            else showToast('请输入命令', 'error');
        });
        document.getElementById('manualCommand')?.addEventListener('keydown', function (e) {
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                const cmd = this.value.trim();
                if (cmd) sendCommand(cmd);
                else showToast('请输入命令', 'error');
            }
        });

        // 命令回显区：点击展开/折叠（多行命令时有用）
        document.getElementById('cmdEcho')?.addEventListener('click', function () {
            this.classList.toggle('expanded');
        });

        // AI 生成指令
        document.getElementById('btnGenerateCommand')?.addEventListener('click', async (e) => {
            e.preventDefault();
            const input = document.getElementById('commandInstruction');
            const instruction = input.value.trim();
            if (!instruction) { showToast('请输入操作描述', 'error'); return; }

            const btn = document.getElementById('btnGenerateCommand');
            const originalHtml = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span> 生成中...';

            try {
                const res = await apiFetch(`${API_BASE}/ai/generate_command`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ instruction })
                });
                const data = await res.json();
                if (data.success && data.command) {
                    document.getElementById('manualCommand').value = data.command;
                    // 触发 textarea 自动撑高
                    document.getElementById('manualCommand').dispatchEvent(new Event('input', { bubbles: true }));
                    showToast('AI 指令已生成');
                } else {
                    showToast('生成失败：' + (data.error || '未知错误'), 'error');
                }
            } catch (err) {
                showToast('请求失败：' + err.message, 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalHtml;
            }
        });

        // 快捷键
        document.addEventListener('keydown', function (e) {
            const adbTool = document.getElementById('AdbTool');
            if (!adbTool || adbTool.classList.contains('hide')) return;
            if (e.ctrlKey && e.altKey) {
                if (e.key === 's' || e.key === 'S') { e.preventDefault(); startLogcat(); }
                else if (e.key === 'x' || e.key === 'X') { e.preventDefault(); stopLogcat(); }
                else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); openFolder(); }
                else if (e.key === 'c' || e.key === 'C') { e.preventDefault(); clearOutput(); }
            }
        });

        // 日志相关
        document.getElementById('btnStartLogcat')?.addEventListener('click', (e) => { e.preventDefault(); startLogcat(); });
        document.getElementById('btnStopLogcat')?.addEventListener('click', (e) => { e.preventDefault(); stopLogcat(); });
        document.getElementById('btnOpenFolder')?.addEventListener('click', (e) => { e.preventDefault(); openFolder(); });
        document.getElementById('btnClearOutput')?.addEventListener('click', (e) => { e.preventDefault(); clearOutput(); });
        document.getElementById('btnExecHistory')?.addEventListener('click', (e) => { e.preventDefault(); showExecHistory(); });

        // 日志路径自动补齐尾部反斜杠
        document.getElementById('logcatFilename')?.addEventListener('blur', function() {
            var val = this.value.trim();
            if (val && !val.endsWith('\\')) {
                this.value = val + '\\';
            }
        });

        // ========== Textarea 自动撑高 ==========
        function autoGrowTextarea(el) {
            el.style.height = 'auto';
            var minH = 40; // 最小高度（约2行），防止隐藏状态下计算为0
            var maxH = 200;
            var h = Math.max(el.scrollHeight, minH);
            el.style.height = Math.min(h, maxH) + 'px';
            el.style.overflowY = h > maxH ? 'auto' : 'hidden';
        }
        ['manualCommand', 'cmdText'].forEach(function(id) {
            var ta = document.getElementById(id);
            if (ta) {
                ta.style.resize = 'none';
                ta.style.overflowY = 'hidden';
                ta.addEventListener('input', function() { autoGrowTextarea(this); });
                // 初始化时调整一次
                autoGrowTextarea(ta);
            }
        });

        // ========== Tab 栏拖拽滚动 ==========
        var tabDragState = null;
        var tabDragMoved = false;
        document.addEventListener('mousedown', function(e) {
            var bar = e.target.closest('.group-tab-bar');
            if (!bar || e.button !== 0) return;
            tabDragState = { bar: bar, startX: e.clientX, scrollLeft: bar.scrollLeft };
            tabDragMoved = false;
        });
        document.addEventListener('mousemove', function(e) {
            if (!tabDragState) return;
            var dx = e.clientX - tabDragState.startX;
            if (Math.abs(dx) > 3) {
                tabDragMoved = true;
                tabDragState.bar.classList.add('dragging');
                tabDragState.bar.scrollLeft = tabDragState.scrollLeft - dx;
            }
        });
        document.addEventListener('mouseup', function() {
            if (tabDragState) {
                tabDragState.bar.classList.remove('dragging');
                tabDragState = null;
            }
        });
        // 拖拽后阻止触发标签点击
        document.addEventListener('click', function(e) {
            if (tabDragMoved && e.target.closest('.group-tab')) {
                e.stopImmediatePropagation();
                e.preventDefault();
            }
            tabDragMoved = false;
        }, true);
    }

    // ---------- 初始化 ----------
    document.addEventListener('DOMContentLoaded', function () {
        bindEvents();
        refreshDevices();
        loadCommands();
        updateLogcatStatus();
        setInterval(updateLogcatStatus, 5000);
        document.getElementById('cmdStatusBanner').style.display = 'none';
        document.getElementById('cmdEcho').innerHTML = '<span class="text-muted">等待执行命令...</span>';
        document.getElementById('cmdOutput').innerHTML = '<span class="text-muted">命令执行结果将显示在这里...</span>';

        // 自动 shell 开关：从 localStorage 恢复状态
        const autoShellToggle = document.getElementById('autoShellToggle');
        if (autoShellToggle) {
            const saved = localStorage.getItem('adb_auto_shell');
            autoShellToggle.checked = saved !== null ? saved === 'true' : true; // 默认开启
            updateAutoShellUI();
            autoShellToggle.addEventListener('change', function () {
                localStorage.setItem('adb_auto_shell', this.checked);
                updateAutoShellUI();
            });
        }

        // ADB 工具面板每次变为可见时，刷新 Shell 提示（确保切换面板后状态同步）
        const adbToolEl = document.getElementById('AdbTool');
        if (adbToolEl) {
            const observer = new MutationObserver(function (mutations) {
                mutations.forEach(function (mutation) {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                        if (!adbToolEl.classList.contains('hide')) {
                            updateAutoShellUI();
                        }
                    }
                });
            });
            observer.observe(adbToolEl, { attributes: true, attributeFilter: ['class'] });
        }
    });

    function updateAutoShellUI() {
        const enabled = isAutoShellEnabled();
        const manualCmd = document.getElementById('manualCommand');
        const shellHint = document.getElementById('shellHint');
        if (manualCmd) {
            manualCmd.placeholder = enabled
                ? '输入命令...'
                : '输入完整 adb 命令...';
        }
        if (shellHint) {
            shellHint.innerHTML = enabled
                ? '<i class="bi bi-info-circle"></i> 已开启"Shell 模式"，无需手动输入 shell 前缀'
                : '<i class="bi bi-info-circle"></i> "Shell 模式"已关闭，shell 命令请手动加 "shell " 前缀';
        }
    }
})();
