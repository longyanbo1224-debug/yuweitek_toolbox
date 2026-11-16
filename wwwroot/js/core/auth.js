// js/core/auth.js
// 授权管理、版本检查、激活模态框

// 缓存远程引导图地址，供 showHistoryVersionGuide 等无 API 响应上下文的函数使用
let cachedGuideImage = '';

/**
 * 生成引导图 HTML（来自 update.json 的 guide_image），为空时不显示
 * @param {string} guideImage - 引导图 URL
 */
function buildGuideImageHtml(guideImage) {
    if (guideImage && guideImage.trim()) {
        return `<img src="${escapeHtml(guideImage)}" alt="下载操作提示" class="update-guide-img w-100">`;
    }
    return '';
}

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
            const guideImage = response.data.guide_image || '';
            cachedGuideImage = guideImage;
            if (compareVersions(FRONTEND_VERSION, minRequired) < 0) {
                showForceUpdateModal(updateUrl, response.data.changelog, guideImage);
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

function showForceUpdateModal(updateUrl, changelog, guideImage) {
    if ($('#forceUpdateModal').length) $('#forceUpdateModal').remove();
    const releasesUrl = updateUrl || 'https://github.com/longyanbo1224-debug/yuweitek_toolbox/releases';
    const akamsUrl = releasesUrl.indexOf('github.com') !== -1
        ? 'https://github.akams.cn/?url=' + encodeURIComponent(releasesUrl)
        : releasesUrl;
    const changelogHtml = changelog ? `
        <div class="update-changelog">
            <strong>📝 更新内容</strong>
            <pre>${escapeHtml(changelog)}</pre>
        </div>` : '';
    const modalHtml = `
    <div class="modal fade update-modal force-modal" id="forceUpdateModal" data-bs-backdrop="static" data-bs-keyboard="false" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content">
                <div class="modal-body">
                    <div class="update-icon icon-danger"><i class="bi bi-exclamation-triangle-fill"></i></div>
                    <div class="update-title">版本过低，必须更新</div>
                    <div class="update-subtitle">当前版本已不受支持，请下载最新版本后继续使用</div>
                    <div class="update-version-row">
                        <div><span class="version-label">当前版本</span><span class="version-value">${FRONTEND_VERSION}</span></div>
                        <div><span class="version-label">需要更新</span><span class="version-value" style="color:#dc3545">立即下载</span></div>
                    </div>
                    ${changelogHtml}
                    ${buildGuideImageHtml(guideImage)}
                    <div class="update-link-box">
                        <input type="text" id="forceReleasesUrlInput" value="${releasesUrl}" readonly>
                        <button class="btn btn-sm btn-outline-secondary" type="button" id="forceCopyReleasesBtn" title="复制链接">
                            <i class="bi bi-clipboard"></i>
                        </button>
                    </div>
                    <div class="update-actions">
                        <a href="${akamsUrl}" class="update-btn-danger text-center text-decoration-none" id="forceUpdateDownloadBtn" target="_blank">
                            <i class="bi bi-download me-1"></i> 打开下载页面
                        </a>
                    </div>
                </div>
            </div>
        </div>
    </div>`;
    $('body').append(modalHtml);
    const modal = new bootstrap.Modal(document.getElementById('forceUpdateModal'), { backdrop: 'static' });
    modal.show();
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(releasesUrl).catch(() => fallbackCopyText(releasesUrl));
    } else {
        fallbackCopyText(releasesUrl);
    }
    $('#forceCopyReleasesBtn').on('click', function () {
        const url = $('#forceReleasesUrlInput').val();
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(() => {
                $(this).html('<i class="bi bi-check-lg"></i>');
                setTimeout(() => $(this).html('<i class="bi bi-clipboard"></i>'), 2000);
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

function showRecommendUpdateModal(updateUrl, changelog, latestVersion, guideImage) {
    if ($('#recommendUpdateModal').length) return;
    const releasesUrl = updateUrl || 'https://github.com/longyanbo1224-debug/yuweitek_toolbox/releases';
    const akamsUrl = releasesUrl.indexOf('github.com') !== -1
        ? 'https://github.akams.cn/?url=' + encodeURIComponent(releasesUrl)
        : releasesUrl;
    const changelogHtml = changelog ? `
        <div class="update-changelog">
            <strong>📝 更新内容</strong>
            <pre>${escapeHtml(changelog)}</pre>
        </div>` : '';
    const modalHtml = `
        <div class="modal fade update-modal" id="recommendUpdateModal" tabindex="-1" data-bs-backdrop="static">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-body">
                        <button type="button" class="btn-close position-absolute top-0 end-0 m-3" data-bs-dismiss="modal"></button>
                        <div class="update-icon icon-info"><i class="bi bi-rocket-takeoff-fill"></i></div>
                        <div class="update-title">发现新版本</div>
                        <div class="update-subtitle">建议更新以获得最佳体验</div>
                        <div class="update-version-row">
                            <div><span class="version-label">当前版本</span><span class="version-value">${FRONTEND_VERSION}</span></div>
                            <div><span class="version-label">最新版本</span><span class="version-value" style="color:#0ea5e9">${escapeHtml(latestVersion)}</span></div>
                        </div>
                        ${changelogHtml}
                        ${buildGuideImageHtml(guideImage)}
                        <div class="update-link-box">
                            <input type="text" id="recommendReleasesUrlInput" value="${releasesUrl}" readonly>
                            <button class="btn btn-sm btn-outline-secondary" type="button" id="recommendCopyReleasesBtn" title="复制链接">
                                <i class="bi bi-clipboard"></i>
                            </button>
                        </div>
                        <div class="update-actions">
                            <a href="${akamsUrl}" class="update-btn-primary text-center text-decoration-none" id="confirmDownloadBtn" target="_blank">
                                <i class="bi bi-download me-1"></i> 打开下载页面
                            </a>
                            <button type="button" class="update-btn-secondary" data-bs-dismiss="modal">暂不更新</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    $('body').append(modalHtml);
    const modal = new bootstrap.Modal(document.getElementById('recommendUpdateModal'));
    modal.show();
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(releasesUrl).catch(() => fallbackCopyText(releasesUrl));
    } else {
        fallbackCopyText(releasesUrl);
    }
    $('#recommendCopyReleasesBtn').on('click', function () {
        const url = $('#recommendReleasesUrlInput').val();
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(() => {
                $(this).html('<i class="bi bi-check-lg"></i>');
                setTimeout(() => $(this).html('<i class="bi bi-clipboard"></i>'), 2000);
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
}

// 复制机器码
$('#copyMachineCodeBtn').click(function () {
    const machineCode = $('#machineCodeDisplay').val();
    if (!machineCode) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(machineCode).then(() => showCopySuccessModal()).catch(() => fallbackCopy(machineCode));
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
    showCopySuccessModal();
}
function showCopySuccessModal() {
    if ($('#copySuccessModal').length) return;
    const modalHtml = `
    <div class="modal fade update-modal" id="copySuccessModal" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered modal-sm">
            <div class="modal-content">
                <div class="modal-body">
                    <div class="update-icon icon-success"><i class="bi bi-check-lg" style="font-size:2rem"></i></div>
                    <div class="update-title">复制成功</div>
                    <div class="update-subtitle">机器码已复制到剪贴板</div>
                    <div class="update-actions" style="margin-top:1.25rem">
                        <button type="button" class="update-btn-secondary" data-bs-dismiss="modal">知道了</button>
                    </div>
                </div>
            </div>
        </div>
    </div>`;
    $('body').append(modalHtml);
    const modal = new bootstrap.Modal(document.getElementById('copySuccessModal'));
    modal.show();
    $('#copySuccessModal').on('hidden.bs.modal', function () { $(this).remove(); });
}
function showActivateSuccessModal(expire) {
    if ($('#activateSuccessModal').length) return;
    const modalHtml = `
    <div class="modal fade update-modal" id="activateSuccessModal" tabindex="-1" data-bs-backdrop="static">
        <div class="modal-dialog modal-dialog-centered modal-sm">
            <div class="modal-content">
                <div class="modal-body">
                    <div class="update-icon icon-success"><i class="bi bi-check-lg" style="font-size:2rem"></i></div>
                    <div class="update-title">激活成功</div>
                    <div class="update-subtitle">有效期至：<strong>${escapeHtml(expire)}</strong></div>
                    <div class="update-actions" style="margin-top:1.25rem">
                        <button type="button" class="update-btn-primary" data-bs-dismiss="modal">确定</button>
                    </div>
                </div>
            </div>
        </div>
    </div>`;
    $('body').append(modalHtml);
    const modal = new bootstrap.Modal(document.getElementById('activateSuccessModal'));
    modal.show();
    $('#activateSuccessModal').on('hidden.bs.modal', function () { $(this).remove(); location.reload(); });
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
                showActivateSuccessModal(data.expire);
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
            const guideImage = response.data.guide_image || '';
            cachedGuideImage = guideImage;
            if (compareVersions(FRONTEND_VERSION, latestVersion) < 0) {
                const isForce = compareVersions(FRONTEND_VERSION, minRequired) < 0;
                if (isForce) {
                    showForceUpdateModal(updateUrl, changelog, guideImage);
                    disableAllTools();
                } else {
                    showRecommendUpdateModal(updateUrl, changelog, latestVersion, guideImage);
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

// ===== 历史版本链接：复制链接到剪贴板并打开 akams 代理（带预填URL） =====
$('.history-version-link, .history-version-link-mobile').on('click', function () {
    var url = $(this).data('url');
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url);
    }
    window.open('https://github.akams.cn/?url=' + encodeURIComponent(url), '_blank');
});

function showLatestVersionModal(version) {
    if ($('#latestVersionModal').length) return;
    const modalHtml = `
    <div class="modal fade update-modal" id="latestVersionModal" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered modal-sm">
            <div class="modal-content">
                <div class="modal-body">
                    <div class="update-icon icon-success"><i class="bi bi-check-lg" style="font-size:2rem"></i></div>
                    <div class="update-title">已是最新版本</div>
                    <div class="update-subtitle">当前版本 <strong>${escapeHtml(version)}</strong> 已是最新</div>
                    <div class="update-actions" style="margin-top:1.25rem">
                        <button type="button" class="update-btn-secondary" data-bs-dismiss="modal">知道了</button>
                    </div>
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
    <div class="modal fade update-modal" id="updateErrorModal" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered modal-sm">
            <div class="modal-content">
                <div class="modal-body">
                    <div class="update-icon icon-danger"><i class="bi bi-wifi-off"></i></div>
                    <div class="update-title">检查更新失败</div>
                    <div class="update-subtitle">请检查网络后重试<br><small>${escapeHtml(message)}</small></div>
                    <div class="update-actions" style="margin-top:1.25rem">
                        <button type="button" class="update-btn-secondary" data-bs-dismiss="modal">知道了</button>
                    </div>
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
    <div class="modal fade update-modal" id="historyVersionGuideModal" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content">
                <div class="modal-body">
                    <button type="button" class="btn-close position-absolute top-0 end-0 m-3" data-bs-dismiss="modal"></button>
                    <div class="update-icon icon-warning"><i class="bi bi-clock-history"></i></div>
                    <div class="update-title">历史版本下载</div>
                    <div class="update-subtitle">请在已打开的页面中粘贴链接，查看历史版本</div>
                    ${buildGuideImageHtml(cachedGuideImage)}
                    <div class="update-actions">
                        <button type="button" class="update-btn-secondary" data-bs-dismiss="modal">知道了</button>
                    </div>
                </div>
            </div>
        </div>
    </div>`;
    $('body').append(modalHtml);
    const modal = new bootstrap.Modal(document.getElementById('historyVersionGuideModal'));
    modal.show();
    $('#historyVersionGuideModal').on('hidden.bs.modal', function () { $(this).remove(); });
}

function showClipboardErrorModal(message) {
    if ($('#clipboardErrorModal').length) return;
    const modalHtml = `
    <div class="modal fade update-modal" id="clipboardErrorModal" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered modal-sm">
            <div class="modal-content">
                <div class="modal-body">
                    <button type="button" class="btn-close position-absolute top-0 end-0 m-3" data-bs-dismiss="modal"></button>
                    <div class="update-icon icon-warning"><i class="bi bi-clipboard-x"></i></div>
                    <div class="update-title">剪贴板不可用</div>
                    <div class="update-subtitle">${escapeHtml(message)}</div>
                    <div class="update-actions" style="margin-top:1.25rem">
                        <button type="button" class="update-btn-secondary" data-bs-dismiss="modal">知道了</button>
                    </div>
                </div>
            </div>
        </div>
    </div>`;
    $('body').append(modalHtml);
    const modal = new bootstrap.Modal(document.getElementById('clipboardErrorModal'));
    modal.show();
    $('#clipboardErrorModal').on('hidden.bs.modal', function () { $(this).remove(); });
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
                showClipboardErrorModal('无法读取剪贴板，请手动输入授权码');
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
                showClipboardErrorModal('请手动粘贴授权码（Ctrl+V）');
            }
        }
    });
});
