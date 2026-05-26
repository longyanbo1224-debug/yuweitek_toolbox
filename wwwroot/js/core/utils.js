// js/core/utils.js
// 通用工具函数

// 统一的 fetch 封装，自动添加版本头
async function apiFetch(url, options = {}) {
    const headers = {
        'X-Client-Version': FRONTEND_VERSION,
        ...(options.headers || {})
    };
    const response = await fetch(url, { ...options, headers });
    if (!response.ok && response.status === 426) {
        console.warn(`请求 ${url} 被拒绝，版本过低`);
    }
    return response;
}

// 防止 XSS
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function (m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// 优雅的 Toast 提示（无弹窗）
function showToast(message, duration = 3000) {
    let toastEl = document.getElementById('global-toast') || document.querySelector('.toast');
    if (!toastEl) {
        toastEl = document.createElement('div');
        toastEl.id = 'global-toast';
        toastEl.style.position = 'fixed';
        toastEl.style.top = '20px';
        toastEl.style.left = '50%';
        toastEl.style.transform = 'translateX(-50%)';
        toastEl.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        toastEl.style.color = '#fff';
        toastEl.style.padding = '10px 20px';
        toastEl.style.borderRadius = '5px';
        toastEl.style.zIndex = '9999';
        toastEl.style.transition = 'opacity 0.3s';
        toastEl.style.display = 'none';
        document.body.appendChild(toastEl);
    }
    toastEl.textContent = message;
    toastEl.style.display = 'block';
    toastEl.style.opacity = '1';
    setTimeout(() => {
        toastEl.style.opacity = '0';
        setTimeout(() => {
            toastEl.style.display = 'none';
        }, 300);
    }, duration);
}

// 十六进制转 ASCII（支持多行）
function hexToString(hexStr) {
    try {
        const lines = hexStr.split('\n');
        let results = [];
        for (const line of lines) {
            const cleanLine = line.replace(/[^0-9a-fA-F\s]/g, '');
            if (!cleanLine.trim()) {
                results.push('');
                continue;
            }
            const hexBytes = cleanLine.includes(' ') ?
                cleanLine.split(' ').filter(byte => byte.trim() !== '') :
                cleanLine.match(/.{1,2}/g) || [];
            let asciiLine = '';
            for (const byte of hexBytes) {
                if (!byte) continue;
                const byteStr = byte.length === 1 ? `0${byte}` : byte;
                try {
                    const charCode = parseInt(byteStr, 16);
                    if (charCode === 10) asciiLine += '\n';
                    else if (charCode >= 32 && charCode <= 126) asciiLine += String.fromCharCode(charCode);
                    else asciiLine += '.';
                } catch {
                    asciiLine += '.';
                }
            }
            results.push(asciiLine);
        }
        return results.join('\n');
    } catch (e) {
        console.error('转换错误:', e);
        return '转换错误';
    }
}

// ASCII 转十六进制
function stringToHex(str) {
    let hex = '';
    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        if (char === '\n') hex += '0a';
        else hex += char.charCodeAt(0).toString(16).padStart(2, '0');
    }
    return hex;
}

// 多行进制转换辅助
function convertMultipleLines(input, fromRadix, toRadix) {
    const lines = input.split('\n');
    let results = [];
    for (const line of lines) {
        if (!line.trim()) continue;
        try {
            if (fromRadix === 'ascii' && toRadix === 'ascii') {
                results.push(line);
            } else if (fromRadix === 'ascii') {
                const hex = stringToHex(line);
                const num = parseInt(hex, 16);
                results.push(num.toString(parseInt(toRadix)));
            } else if (toRadix === 'ascii') {
                if (fromRadix === '16') {
                    results.push(hexToString(line));
                } else {
                    const num = parseInt(line, parseInt(fromRadix));
                    results.push(hexToString(num.toString(16)));
                }
            } else {
                const num = parseInt(line, parseInt(fromRadix));
                results.push(num.toString(parseInt(toRadix)));
            }
        } catch (e) {
            results.push(`转换错误: ${e.message}`);
        }
    }
    return results;
}

// 比较版本号
function compareVersions(v1, v2) {
    const toNum = (v) => v.split('.').map(n => parseInt(n, 10));
    const arr1 = toNum(v1);
    const arr2 = toNum(v2);
    for (let i = 0; i < Math.max(arr1.length, arr2.length); i++) {
        const n1 = arr1[i] || 0;
        const n2 = arr2[i] || 0;
        if (n1 !== n2) return n1 - n2;
    }
    return 0;
}

// 导出到全局（供其他模块使用）
window.apiFetch = apiFetch;
window.escapeHtml = escapeHtml;
window.showToast = showToast;
window.hexToString = hexToString;
window.stringToHex = stringToHex;
window.convertMultipleLines = convertMultipleLines;
window.compareVersions = compareVersions;