// js/modules/adb-tools.js
// ADB 命令调试工具（设备管理、命令发送、日志采集、拖拽排序、分组、批量管理）

(function () {
    const API_BASE = 'http://127.0.0.1:5000/api';
    let allCommands = [];
    let sortableInstances = [];
    let selectedNames = new Set(); // 批量选择
    window.currentLogcatPath = null;

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

        // 保存当前展开的分组状态
        const expandedGroups = new Set();
        btnContainer.querySelectorAll('.command-group').forEach(el => {
            const body = el.querySelector('div[id^="cmdGrp_"]');
            if (body && body.style.display !== 'none') {
                const name = el.getAttribute('data-group');
                if (name) expandedGroups.add(name);
            }
        });

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

        // 销毁旧的 Sortable 实例
        sortableInstances.forEach(s => s.destroy());
        sortableInstances = [];

        sortedKeys.forEach(groupName => {
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

            // 恢复之前的展开状态
            if (expandedGroups.has(groupName)) {
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
            }
        });
        sortableInstances.push(groupSortable);
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

        sortedKeys.forEach(groupName => {
            // 分组标题行（可折叠）
            const header = document.createElement('div');
            header.className = 'cmd-item d-flex align-items-center gap-1 py-1 px-1 border-bottom cmd-group-header';
            header.style.cursor = 'pointer';
            header.style.userSelect = 'none';
            const listCollapseId = 'cmdListGrp_' + groupName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
            header.innerHTML = `
                <i class="bi bi-chevron-down small toggle-icon"></i>
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
                container.querySelectorAll(`.cmd-check[data-group="${group}"]`).forEach(cb => {
                    cb.checked = checked;
                    const n = cb.getAttribute('data-name');
                    if (checked) selectedNames.add(n); else selectedNames.delete(n);
                });
            });

            // 命令行包裹容器（可折叠）
            const groupBody = document.createElement('div');
            groupBody.id = listCollapseId;
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
                html += `<div class="d-flex align-items-center gap-2 mb-2 p-2 border rounded">
                    <i class="bi bi-folder2 text-primary"></i>
                    <span class="flex-grow-1 fw-medium">${escapeHtml(g)}</span>
                    <span class="badge bg-primary">${count} 条</span>
                    <button class="btn btn-sm btn-outline-primary" onclick="window._renameGroup('${escapeHtml(g)}')">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="window._deleteGroup('${escapeHtml(g)}')">
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
        if (!confirm(`确定删除分组 "${groupName}" 吗？\n组内命令将移至"未分组"。`)) return;
        try {
            const res = await apiFetch(`${API_BASE}/groups/${encodeURIComponent(groupName)}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.error) { showToast(data.error, 'error'); return; }
            allCommands = data.commands;
            let emptyGroups = [];
            try { emptyGroups = JSON.parse(localStorage.getItem('adb_empty_groups') || '[]'); } catch(e) {}
            emptyGroups = emptyGroups.filter(g => g !== groupName);
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
                statusSpan.innerHTML = '状态：<span id="logcatStatusText" class="badge bg-danger">未运行</span>';
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
        if (!confirm('确定停止日志采集吗？')) return;
        logcatBusy = true;
        try {
            const res = await apiFetch(`${API_BASE}/logcat/stop`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
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

    async function sendCommand(cmdText) {
        const device = document.getElementById('deviceSelect').value;
        const outputDiv = document.getElementById('commandOutput');
        if (!device) { outputDiv.innerText = '错误：请先选择设备'; return; }
        outputDiv.innerText = '正在执行命令，请稍候...';
        try {
            const res = await apiFetch(`${API_BASE}/send_command`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ device, command: cmdText })
            });
            const result = await res.json();
            if (result.error) outputDiv.innerText = '错误：' + result.error;
            else {
                let output = '';
                if (result.stdout) output += result.stdout;
                if (result.stderr) output += '\n' + result.stderr;
                if (output.trim() === '') output = '命令执行成功，无输出。';
                outputDiv.innerText = output;
            }
        } catch (error) { outputDiv.innerText = '请求失败：' + error.message; }
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
        if (selectedNames.size === 1) {
            name = [...selectedNames][0];
        } else {
            const nameInput = document.getElementById('cmdName').value.trim();
            if (allCommands.find(c => c.name === nameInput)) name = nameInput;
        }
        if (!name) return alert('请在列表中选择一条命令，或输入已有命令名称');
        if (!confirm(`确定删除命令"${name}"吗？`)) return;
        try {
            const res = await apiFetch(`${API_BASE}/commands/${encodeURIComponent(name)}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.error) alert(data.error);
            else { clearForm(); selectedNames.delete(name); allCommands = data.commands; renderCommandButtons(); renderCommandList(); loadGroupOptions(); showToast('命令已删除'); }
        } catch (err) { alert('删除失败：' + err.message); }
    }

    function clearForm() {
        document.getElementById('cmdName').value = '';
        document.getElementById('cmdText').value = '';
        document.getElementById('cmdGroup').value = '';
    }

    // ---------- 批量操作 ----------
    async function batchDelete() {
        const names = [...selectedNames];
        if (names.length === 0) return alert('请先勾选要删除的命令');
        if (!confirm(`确定删除选中的 ${names.length} 条命令吗？`)) return;
        try {
            const res = await apiFetch(`${API_BASE}/commands/batch_delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ names })
            });
            const data = await res.json();
            if (data.error) alert(data.error);
            else { selectedNames.clear(); allCommands = data.commands; renderCommandButtons(); renderCommandList(); loadGroupOptions(); showToast(`已批量删除 ${names.length} 条命令`); }
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
            const groupCbs = document.querySelectorAll(`.cmd-check[data-group="${group}"]`);
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
        document.getElementById('commandOutput').innerText = '命令执行结果将显示在这里...';
    }

    // ---------- 工具函数 ----------
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
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

        // 手动发送
        document.getElementById('btnSendManual')?.addEventListener('click', (e) => {
            e.preventDefault();
            const cmd = document.getElementById('manualCommand').value.trim();
            if (cmd) sendCommand(cmd);
            else alert('请输入命令');
        });
        document.getElementById('manualCommand')?.addEventListener('keydown', function (e) {
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                const cmd = this.value.trim();
                if (cmd) sendCommand(cmd);
                else alert('请输入命令');
            }
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
    }

    // ---------- 初始化 ----------
    document.addEventListener('DOMContentLoaded', function () {
        bindEvents();
        refreshDevices();
        loadCommands();
        updateLogcatStatus();
        setInterval(updateLogcatStatus, 5000);
        document.getElementById('commandOutput').innerText = '命令执行结果将显示在这里...';
    });
})();
