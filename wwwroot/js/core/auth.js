// js/core/auth.js
// 授权管理、版本检查、激活模态框

function checkLicenseOnly() {
    apiFetch('/api/check_license')
        .then(res => res.json())
        .then(data => {
            if (!data.licensed) {
                $('#machineCodeDisplay').val(data.machine_code);
                $('#activateModal').modal('show');
                $('#licenseStatus').text('');
            } else {
                const expireText = data.expire === '永久' ? '授权至：永久' : `授权至：${data.expire}`;
                $('#licenseStatus').text(expireText);
            }
        })
        .catch(err => console.error('授权检查失败:', err));
}

function checkVersionAndProceed() {
    axios.get('/api/version')
        .then(response => {
            const minRequired = response.data.min_required;
            const updateUrl = response.data.update_url;
            if (compareVersions(FRONTEND_VERSION, minRequired) < 0) {
                showForceUpdateModal(updateUrl, response.data.changelog);
                disableAllTools();
            } else {
                checkLicenseOnly();
            }
        })
        .catch(error => {
            console.error('版本检查失败:', error);
            checkLicenseOnly();
        });
}

function showForceUpdateModal(updateUrl, changelog) {
    if ($('#forceUpdateModal').length) $('#forceUpdateModal').remove();
    const releasesUrl = 'https://github.com/longyanbo1224/yuweitek-toolbox/releases';
    const akamsUrl = 'https://github.akams.cn/?url=' + encodeURIComponent(releasesUrl);
    const changelogHtml = changelog ? `<div class="mt-3"><strong>📝 更新内容：</strong><pre style="white-space: pre-wrap; font-size: 0.9rem; margin-top: 5px; background: #f8f9fa; padding: 8px; border-radius: 5px;">${escapeHtml(changelog)}</pre></div>` : '';
    const modalHtml = `
    <div class="modal fade" id="forceUpdateModal" data-bs-backdrop="static" data-bs-keyboard="false" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content">
                <div class="modal-header bg-danger text-white justify-content-center">
                    <h5 class="modal-title">版本过低，必须更新</h5>
                </div>
                <div class="modal-body">
                    <p>您当前使用的版本（${FRONTEND_VERSION}）已过时，请下载最新版本后重新使用。</p>
                    ${changelogHtml}
                    <div class="mt-3">
                        <div class="text-center mb-3">
                            <img src="img/ScreenShot_2026-06-02_092621_414.png" alt="下载操作提示" class="update-guide-img">
                        </div>
                        <div class="input-group input-group-sm mb-2">
                            <input type="text" class="form-control form-control-sm" id="forceReleasesUrlInput" value="${releasesUrl}" readonly>
                            <button class="btn btn-outline-secondary" type="button" id="forceCopyReleasesBtn" title="复制链接">
                                <i class="bi bi-clipboard"></i> 复制链接
                            </button>
                        </div>
                        <div class="text-center">
                            <a href="${akamsUrl}" class="btn btn-danger" id="forceUpdateDownloadBtn" target="_blank">打开下载页面</a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>`;
    $('body').append(modalHtml);
    const modal = new bootstrap.Modal(document.getElementById('forceUpdateModal'), { backdrop: 'static' });
    modal.show();
    // 弹窗显示后自动复制链接到剪贴板
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(releasesUrl).catch(() => fallbackCopyText(releasesUrl));
    } else {
        fallbackCopyText(releasesUrl);
    }
    $('#forceCopyReleasesBtn').on('click', function () {
        const url = $('#forceReleasesUrlInput').val();
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(() => {
                $(this).html('<i class="bi bi-check-lg"></i> 已复制');
                setTimeout(() => $(this).html('<i class="bi bi-clipboard"></i> 复制链接'), 2000);
            }).catch(() => fallbackCopyText(url));
        } else {
            fallbackCopyText(url);
        }
    });
}

function fallbackCopyText(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
}

function showRecommendUpdateModal(updateUrl, changelog, latestVersion) {
    if ($('#recommendUpdateModal').length) return;
    const releasesUrl = 'https://github.com/longyanbo1224/yuweitek-toolbox/releases';
    const akamsUrl = 'https://github.akams.cn/?url=' + encodeURIComponent(releasesUrl);
    const changelogHtml = changelog ? `<div class="mt-2"><strong>📝 更新内容：</strong><pre style="white-space: pre-wrap; font-size: 0.85rem; background: #f8f9fa; padding: 6px; border-radius: 5px;">${escapeHtml(changelog)}</pre></div>` : '';
    const modalHtml = `
        <div class="modal fade" id="recommendUpdateModal" tabindex="-1" data-bs-backdrop="static">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header bg-info text-white">
                        <h5 class="modal-title">发现新版本</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <p>当前版本：<strong>${FRONTEND_VERSION}</strong><br>最新版本：<strong>${escapeHtml(latestVersion)}</strong></p>
                        ${changelogHtml}
                        <div class="text-center my-3">
                            <img src="img/ScreenShot_2026-06-02_092621_414.png" alt="下载操作提示" class="update-guide-img">
                        </div>
                        <div class="input-group input-group-sm mb-2">
                            <input type="text" class="form-control form-control-sm" id="recommendReleasesUrlInput" value="${releasesUrl}" readonly>
                            <button class="btn btn-outline-secondary" type="button" id="recommendCopyReleasesBtn" title="复制链接">
                                <i class="bi bi-clipboard"></i> 复制链接
                            </button>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">暂不</button>
                        <a href="${akamsUrl}" class="btn btn-primary" target="_blank" id="confirmDownloadBtn">打开下载页面</a>
                    </div>
                </div>
            </div>
        </div>
    `;
    $('body').append(modalHtml);
    const modal = new bootstrap.Modal(document.getElementById('recommendUpdateModal'));
    modal.show();
    // 弹窗显示后自动复制链接到剪贴板
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(releasesUrl).catch(() => fallbackCopyText(releasesUrl));
    } else {
        fallbackCopyText(releasesUrl);
    }
    $('#recommendCopyReleasesBtn').on('click', function () {
        const url = $('#recommendReleasesUrlInput').val();
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(() => {
                $(this).html('<i class="bi bi-check-lg"></i> 已复制');
                setTimeout(() => $(this).html('<i class="bi bi-clipboard"></i> 复制链接'), 2000);
            }).catch(() => fallbackCopyText(url));
        } else {
            fallbackCopyText(url);
        }
    });
    $('#recommendUpdateModal').on('hidden.bs.modal', function () { $(this).remove(); });
}

function disableAllTools() {
    if (!$('.version-block-overlay').length) {
        $('body').append('<div class="version-block-overlay"></div>');
    }
    $('button, input, textarea, select, .dropdown-item').not('#forceUpdateDownloadBtn, #forceCopyReleasesBtn, #forceReleasesUrlInput, .modal button, .modal input').prop('disabled', true).css('pointer-events', 'none');
    if (!$('#version-warning-bar').length) {
        $('#main').prepend('<div id="version-warning-bar" class="alert alert-danger version-warning-bar">⚠️ 请更新程序后再使用本工具 ⚠️</div>');
    }
}

// 复制机器码
$('#copyMachineCodeBtn').click(function () {
    const machineCode = $('#machineCodeDisplay').val();
    if (!machineCode) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(machineCode).then(() => alert('机器码已复制到剪贴板')).catch(() => fallbackCopy(machineCode));
    } else {
        fallbackCopy(machineCode);
    }
});
function fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    alert('机器码已复制到剪贴板');
}

// 激活按钮事件
$('#activateBtn').click(function () {
    const licenseCode = $('#licenseInput').val().trim();
    if (!licenseCode) {
        $('#activateError').text('请输入授权码');
        return;
    }
    apiFetch('/api/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ license_code: licenseCode })
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                $('#activateModal').modal('hide');
                alert(`激活成功！有效期至：${data.expire}`);
                location.reload();
            } else {
                $('#activateError').text(data.error);
            }
        })
        .catch(err => $('#activateError').text('请求失败：' + err.message));
});

// 桌面端检查更新按钮事件
$('#checkUpdateBtn').on('click', function () {
    const $btn = $(this);
    const originalText = $btn.text();
    $btn.text('检查中...').prop('disabled', true);
    axios.get('/api/version')
        .then(response => {
            const latestVersion = response.data.latest_version;
            const minRequired = response.data.min_required;
            const updateUrl = response.data.update_url;
            const changelog = response.data.changelog || '';
            if (compareVersions(FRONTEND_VERSION, latestVersion) < 0) {
                const isForce = compareVersions(FRONTEND_VERSION, minRequired) < 0;
                if (isForce) {
                    showForceUpdateModal(updateUrl, changelog);
                    disableAllTools();
                } else {
                    showRecommendUpdateModal(updateUrl, changelog, latestVersion);
                }
            } else {
                showLatestVersionModal(FRONTEND_VERSION);
            }
        })
        .catch(error => {
            console.error('检查更新失败:', error);
            showUpdateErrorModal(error.message || '网络错误');
        })
        .finally(() => $btn.text(originalText).prop('disabled', false));
});

// ===== 新增：移动端检查更新按钮复用桌面端逻辑 =====
$('#checkUpdateBtnMobile').on('click', function () {
    // 触发桌面端按钮的点击事件（复用完整逻辑）
    $('#checkUpdateBtn').trigger('click');
});

// ===== 历史版本链接：复制链接到剪贴板并打开 akams 代理 =====
$('.history-version-link, .history-version-link-mobile').on('click', function () {
    var url = $(this).data('url');
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url);
    }
    window.open('https://github.akams.cn/', '_blank');
    showHistoryVersionGuide();
});

function showLatestVersionModal(version) {
    if ($('#latestVersionModal').length) return;
    const modalHtml = `
    <div class="modal fade" id="latestVersionModal" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content">
                <div class="modal-header bg-success text-white">
                    <h5 class="modal-title">✅ 已是最新版本</h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body text-center">
                    <p class="mb-0">当前版本已经是最新版本：<strong>${escapeHtml(version)}</strong></p>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">知道了</button>
                </div>
            </div>
        </div>
    </div>`;
    $('body').append(modalHtml);
    const modal = new bootstrap.Modal(document.getElementById('latestVersionModal'));
    modal.show();
    $('#latestVersionModal').on('hidden.bs.modal', function () { $(this).remove(); });
}

function showUpdateErrorModal(message) {
    if ($('#updateErrorModal').length) return;
    const modalHtml = `
    <div class="modal fade" id="updateErrorModal" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content">
                <div class="modal-header bg-danger text-white">
                    <h5 class="modal-title">检查更新失败</h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body text-center">
                    <p class="mb-0">检查更新失败，请稍后重试。<br><small class="text-muted">${escapeHtml(message)}</small></p>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">知道了</button>
                </div>
            </div>
        </div>
    </div>`;
    $('body').append(modalHtml);
    const modal = new bootstrap.Modal(document.getElementById('updateErrorModal'));
    modal.show();
    $('#updateErrorModal').on('hidden.bs.modal', function () { $(this).remove(); });
}

function showHistoryVersionGuide() {
    if ($('#historyVersionGuideModal').length) return;
    const modalHtml = `
    <div class="modal fade" id="historyVersionGuideModal" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content">
                <div class="modal-header bg-secondary text-white">
                    <h5 class="modal-title">历史版本下载</h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body text-center">
                    <p>请在已打开的页面中粘贴链接，查看历史版本。</p>
                    <img src="img/ScreenShot_2026-06-02_092621_414.png" alt="下载操作提示" class="update-guide-img">
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">知道了</button>
                </div>
            </div>
        </div>
    </div>`;
    $('body').append(modalHtml);
    const modal = new bootstrap.Modal(document.getElementById('historyVersionGuideModal'));
    modal.show();
    $('#historyVersionGuideModal').on('hidden.bs.modal', function () { $(this).remove(); });
}

// 页面加载时检查授权和版本
$(document).ready(function () {
    checkVersionAndProceed();

    // 粘贴授权码按钮（确保模态框内的按钮存在）
    $(document).on('click', '#pasteLicenseBtn', function() {
        if (navigator.clipboard && navigator.clipboard.readText) {
            navigator.clipboard.readText().then(text => {
                $('#licenseInput').val(text.trim());
            }).catch(() => {
                alert('无法读取剪贴板，请手动输入');
            });
        } else {
            // 兼容非 HTTPS 环境
            const textarea = document.createElement('textarea');
            document.body.appendChild(textarea);
            textarea.focus();
            document.execCommand('paste');
            const pasted = textarea.value;
            document.body.removeChild(textarea);
            if (pasted) {
                $('#licenseInput').val(pasted.trim());
            } else {
                alert('请手动粘贴授权码（Ctrl+V）');
            }
        }
    });
});