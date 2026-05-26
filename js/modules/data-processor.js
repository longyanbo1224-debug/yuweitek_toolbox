// js/modules/data-processor.js
// 数据字段处理工具（7E/2323 提取）

function extract7EPackets(inputText) {
    const result = inputText.split('\n')
        .map(line => {
            let cleanedLine = line
                .replace(/^\S+\s\S+\s+/g, '')
                .replace(/(Text|Hand|命令\w+)\s*/gi, '')
                .replace(/-/g, '')
                .replace(/[^0-9A-Fa-f]/g, '')
                .trim();
            return (cleanedLine.startsWith('7E') || cleanedLine.length > 0) ? cleanedLine : '';
        })
        .filter(line => line.length > 0)
        .join('');
    const packets = result.match(/7E([0-9A-F]+)7E/gi);
    if (!packets || packets.length === 0) return null;
    return packets.map(packet => {
        const data = packet.slice(2, -2);
        const formatted = data.match(/.{2}/g).join(' ');
        return `7E ${formatted} 7E`;
    }).join('\n');
}

function extract2323Data(inputText) {
    const lines = inputText.split('\n');
    let result = '', currentData = '', isCollecting = false;
    for (const line of lines) {
        const has2323 = line.includes('2323');
        const isCommandLine = isCommandLineDetected(line);
        if (isCommandLine && isCollecting) {
            if (currentData.length > 0) {
                const formatted = formatHexData(currentData);
                if (result) result += '\n';
                result += formatted;
                currentData = '';
                isCollecting = false;
            }
            continue;
        }
        if (has2323 && !isCollecting) isCollecting = true;
        if (isCollecting) {
            const hexFromLine = extractHexFromLine(line);
            if (hexFromLine) currentData += hexFromLine;
        }
    }
    if (currentData.length > 0) {
        const formatted = formatHexData(currentData);
        if (result) result += '\n';
        result += formatted;
    }
    return result || null;
}

function extractHexFromLine(line) {
    if (isCommandLineDetected(line)) return '';
    const hexMatches = line.match(/([0-9A-Fa-f]{2,}(?:-[0-9A-Fa-f]{2,})*)/g);
    if (!hexMatches) return '';
    const validHexMatches = hexMatches.filter(match => {
        const cleanMatch = match.replace(/-/g, '');
        return cleanMatch.length >= 4 && cleanMatch.match(/^[0-9A-Fa-f]+$/);
    });
    if (validHexMatches.length === 0) return '';
    return validHexMatches.join('').replace(/-/g, '').toUpperCase();
}

function isCommandLineDetected(line) {
    const cleanedLine = line
        .replace(/^(串\d+\s+\d+:\d+:\d+\s+\S+|\S+\s+\d+:\d+:\d+\s+\S+|\S+\s+\S+)\s*/g, '')
        .trim();
    if (cleanedLine.startsWith('命令')) return true;
    const commandKeywords = ['命令', '长度', '跟踪@', '校验', 'SendIpData', 'RevIpData', 'RPC out', 'RPC in', 'tk=', 'Data='];
    for (const keyword of commandKeywords) if (line.includes(keyword)) return true;
    return false;
}

function formatHexData(hexString) {
    const startIndex = hexString.indexOf('2323');
    if (startIndex < 0) return '';
    const cleanData = hexString.substring(startIndex);
    return cleanData.match(/.{2}/g).join(' ');
}

function processText() {
    const inputText = document.getElementById('input').value;
    const format = document.getElementById('packetFormat').value;
    if (format === '7E') {
        const result7E = extract7EPackets(inputText);
        if (result7E) { document.getElementById('output').value = result7E; return; }
        const result2323 = extract2323Data(inputText);
        if (result2323) { document.getElementById('output').value = result2323; return; }
    } else {
        const result2323 = extract2323Data(inputText);
        if (result2323) { document.getElementById('output').value = result2323; return; }
        const result7E = extract7EPackets(inputText);
        if (result7E) { document.getElementById('output').value = result7E; return; }
    }
    showToast('未找到有效数据', 'warning');
    document.getElementById('output').value = '';
}

function removeSpaces() {
    const inputText = document.getElementById('input').value;
    document.getElementById('output').value = inputText.replace(/\s/g, '').toUpperCase();
}
function clearAll() {
    document.getElementById('input').value = '';
    document.getElementById('output').value = '';
}
function copyResult() {
    const output = document.getElementById('output');
    output.select();
    if (navigator.clipboard) {
        navigator.clipboard.writeText(output.value).then(() => showToast('已复制到剪贴板！')).catch(() => showToast('复制失败，请手动选择复制'));
    } else {
        document.execCommand('copy');
        showToast('已复制到剪贴板！');
    }
}

$(document).ready(function () {
    $("#processBtn").on("click", processText);
    $("#delSpaceBtn").on("click", removeSpaces);
    $("#copyBtn").on("click", copyResult);
    $("#clearBtn").on("click", clearAll);
});