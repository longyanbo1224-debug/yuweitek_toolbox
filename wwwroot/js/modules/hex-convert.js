// js/modules/hex-convert.js
// 十六进制/ASCII 转换工具（原 HexParse 相关功能）

$(document).ready(function () {
    // 补零大写处理
    function applyPadResult(result) {
        if (!$('#hexSinglePad7').is(':checked')) return result;
        var lines = Array.isArray(result) ? result : result.split('\n');
        return lines.map(function (line) {
            return String(line).split(' ').map(function (token) {
                return token.padStart(7, '0').toUpperCase();
            }).join(' ');
        }).join('\n');
    }

    // 实时转换逻辑
    function handleRealTimeConversion() {
        const inputValue = $('#input_value').val().trim();
        const fromRadix = $('input[name="input_"]:checked').val();
        const toRadix = $('input[name="output_"]:checked').val();

        if (!inputValue) {
            $('#output_value').val('');
            return;
        }

        try {
            let result;
            if (fromRadix === 'ascii' && toRadix === 'ascii') {
                result = inputValue;
            } else if (fromRadix === 'ascii') {
                const lines = inputValue.split('\n');
                result = lines.map(line => {
                    return line.split('').map(c => {
                        const charCode = c.charCodeAt(0);
                        return toRadix === '16' ?
                            charCode.toString(16).padStart(2, '0') :
                            charCode.toString(parseInt(toRadix));
                    }).join(' ');
                }).join('\n');
            } else if (toRadix === 'ascii') {
                result = hexToString(inputValue);
            } else {
                result = convertMultipleLines(inputValue, fromRadix, toRadix);
            }
            if (toRadix !== 'ascii') result = applyPadResult(result);
            if (Array.isArray(result)) result = result.join('\n');
            $('#output_value').val(result);
        } catch (e) {
            $('#output_value').val(`转换错误: ${e.message}`);
        }
    }

    function initHexConversion() {
        $('#input_value').off('input').on('input', handleRealTimeConversion);
        $('input[name="input_"]').off('change').on('change', handleRealTimeConversion);
        $('input[name="output_"]').off('change').on('change', handleRealTimeConversion);
        $('#hexSinglePad7').off('change').on('change', handleRealTimeConversion);
        handleRealTimeConversion();
    }

    initHexConversion();
    $(window).on('resize', function () { initHexConversion(); });

    // 进制转换功能（原 convertRadix 相关）
    let n = 50, shurukuang = "", flag = "";
    function convertRadix(a) {
        if ($("#input_value").val() != flag || a) {
            flag = $("#input_value").val();
            if ($("#input_num").selectedIndex < n) {
                $("#input_value").val("");
                $("#output_value").val("");
            } else {
                var e = $("#input_value").val();
                var u = e.match(zhengze($("#input_num").val()));
                if (u) {
                    var t = u[0].indexOf(".") == -1 ? parseInt(u, $("#input_num").val()) : pxparseFloat(u, $("#input_num").val());
                    t = t.toString($("#output_num").val());
                    $("#output_value").val(t);
                    shurukuang = e;
                } else {
                    $("#input_value").val(shurukuang);
                }
            }
            n = $("#input_num").selectedIndex;
        }
        if ($("#input_value").val() == "") $("#output_value").val("");
    }
    function pxparseFloat(a, e) {
        a = a.toString();
        var t = a.split(".");
        var n = t[1].split("");
        var r = 0;
        for (var c = 0; c < t[1].length; c++) r += n[c] * Math.pow(e, -1 * (c + 1));
        return parseInt(t[0], e) + r;
    }
    function zhengze(a) {
        var e;
        a = parseInt(a);
        if (a <= 10) {
            e = new RegExp("^[+\\-]?[0-" + (a - 1) + "]*[.]?[0-" + (a - 1) + "]*$", "gi");
        } else {
            var u = "";
            switch (a) {
                case 11: u = "a"; break; case 12: u = "b"; break; case 13: u = "c"; break; case 14: u = "d"; break;
                case 15: u = "e"; break; case 16: u = "f"; break; case 17: u = "g"; break; case 18: u = "h"; break;
                case 19: u = "i"; break; case 20: u = "j"; break; case 21: u = "k"; break; case 22: u = "l"; break;
                case 23: u = "m"; break; case 24: u = "n"; break; case 25: u = "o"; break; case 26: u = "p"; break;
                case 27: u = "q"; break; case 28: u = "r"; break; case 29: u = "s"; break; case 30: u = "t"; break;
                case 31: u = "u"; break; case 32: u = "v"; break; case 33: u = "w"; break; case 34: u = "x"; break;
                case 35: u = "y"; break; case 36: u = "z"; break;
            }
            e = new RegExp("^[+\\-]?[0-9a-" + u + "]*[.]?[0-9a-" + u + "]*$", "gi");
        }
        return e;
    }

    $('[name="input_"]').click(function () {
        $("#input_num").val($(this).val());
        handleRealTimeConversion();
    });
    $('[name="output_"]').click(function () {
        $("#output_num").val($(this).val());
        handleRealTimeConversion();
    });
    $("#input_num").change(function () {
        $("input[name='input_']").removeAttr("checked");
        var a = $(this).val();
        $("input[name='input_'][value=" + a + "]").attr("checked", "checked");
        handleRealTimeConversion();
    });
    $("#output_num").change(function () {
        $("input[name='output_']").removeAttr("checked");
        var a = $(this).val();
        $("input[name='output_'][value=" + a + "]").attr("checked", "checked");
        handleRealTimeConversion();
    });

    $("#HexToolsDemo").on("click", function () {
        $("#input_value").val("255");
        handleRealTimeConversion();
    });
    $("#HexToolsClear").on("click", function () {
        $("#input_value").val("");
        $("#output_value").val("");
    });
    $("#HexToolsCopy").on("click", function () {
        var text = $("#output_value").val();
        if (!text) { showToast('没有可复制的内容'); return; }
        var ta = document.getElementById('output_value');
        ta.select();
        document.execCommand('copy');
        var btn = document.getElementById('HexToolsCopy');
        btn.innerHTML = '<i class="bi bi-check-lg"></i> 已复制!';
        setTimeout(function () { btn.innerHTML = '<i class="bi bi-clipboard"></i> 复制结果'; }, 1500);
    });

    // ============ 批量转换 ============
    var batchData = [];      // 解析后的原始数据（字符串数组）
    var batchHeaders = [];   // CSV/Excel 表头
    var batchResults = [];   // 转换结果
    var batchFileName = '';

    // 文件上传区点击（用原生click，jQuery trigger对file input不可靠）
    var fileInput = document.getElementById('hexBatchFile');
    $('#hexBatchDropZone').on('click', function (e) {
        // 防止file input自身的click冒泡导致重复触发
        if (e.target === fileInput) return;
        fileInput.value = '';  // 重置，允许重复选同一文件
        fileInput.click();
    });

    // 拖拽事件
    var dropZone = document.getElementById('hexBatchDropZone');
    if (dropZone) {
        dropZone.addEventListener('dragover', function (e) { e.preventDefault(); $(this).addClass('border-primary'); });
        dropZone.addEventListener('dragleave', function () { $(this).removeClass('border-primary'); });
        dropZone.addEventListener('drop', function (e) {
            e.preventDefault();
            $(this).removeClass('border-primary');
            if (e.dataTransfer.files.length) handleBatchFile(e.dataTransfer.files[0]);
        });
    }

    // 文件选择
    if (fileInput) {
        fileInput.addEventListener('change', function () {
            if (this.files.length) handleBatchFile(this.files[0]);
        });
    }

    // 移除文件
    $('#hexBatchFileRemove').on('click', function () {
        resetBatchState();
    });

    // Sheet切换（Excel）
    $('#hexBatchSheetSelect').on('change', function () {
        parseExcelSheet(batchFileBuffer, $(this).val());
    });

    // 开始转换
    $('#hexBatchConvert').on('click', function () { startBatchConvert(); });

    // 下载结果
    $('#hexBatchDownload').on('click', function () { downloadBatchResults(); });

    var batchFileBuffer = null; // ArrayBuffer for Excel

    function resetBatchState() {
        batchData = []; batchHeaders = []; batchResults = []; batchFileBuffer = null; batchFileName = '';
        $('#hexBatchFile').val('');
        $('#hexBatchFileInfo').addClass('d-none');
        $('#hexBatchSheetGroup').addClass('d-none');
        $('#hexBatchColGroup').addClass('d-none');
        $('#hexBatchConvert').prop('disabled', true);
        $('#hexBatchDownload').addClass('d-none');
        $('#hexBatchProgress').addClass('d-none');
        $('#hexBatchPreview').addClass('d-none');
        hideBatchLoading();
    }

    function showBatchLoading(text) {
        $('#hexBatchLoadingText').text(text || '正在解析文件...');
        $('#hexBatchLoading').removeClass('d-none');
    }
    function hideBatchLoading() {
        $('#hexBatchLoading').addClass('d-none');
    }

    function handleBatchFile(file) {
        resetBatchState();
        batchFileName = file.name;
        var ext = file.name.split('.').pop().toLowerCase();

        if (ext === 'txt') {
            showBatchLoading('正在读取文件...');
            var reader = new FileReader();
            reader.onload = function (e) {
                var lines = e.target.result.split(/\r?\n/).filter(function (l) { return l.trim() !== ''; });
                batchData = lines;
                batchHeaders = [];
                showFileInfo(file.name, lines.length);
                $('#hexBatchConvert').prop('disabled', false);
                hideBatchLoading();
            };
            reader.onerror = function () { hideBatchLoading(); showToast('文件读取失败'); };
            reader.readAsText(file);
        } else if (ext === 'csv') {
            showBatchLoading('正在解析CSV...');
            var reader = new FileReader();
            reader.onload = function (e) {
                parseCSV(e.target.result);
                showFileInfo(file.name, batchData.length);
                $('#hexBatchConvert').prop('disabled', false);
                hideBatchLoading();
            };
            reader.onerror = function () { hideBatchLoading(); showToast('文件读取失败'); };
            reader.readAsText(file);
        } else if (ext === 'xlsx' || ext === 'xls') {
            if (typeof XLSX === 'undefined') {
                showToast('Excel解析库未加载，请检查网络连接');
                return;
            }
            showBatchLoading('正在解析Excel...');
            var reader = new FileReader();
            reader.onload = function (e) {
                batchFileBuffer = e.target.result;
                var wb = XLSX.read(batchFileBuffer, { type: 'array' });
                var $sel = $('#hexBatchSheetSelect').empty();
                wb.SheetNames.forEach(function (name) {
                    $sel.append($('<option>').val(name).text(name));
                });
                $('#hexBatchSheetGroup').removeClass('d-none');
                parseExcelSheet(batchFileBuffer, wb.SheetNames[0]);
                showFileInfo(file.name, batchData.length);
                $('#hexBatchConvert').prop('disabled', false);
                hideBatchLoading();
            };
            reader.onerror = function () { hideBatchLoading(); showToast('文件读取失败'); };
            reader.readAsArrayBuffer(file);
        } else {
            showToast('不支持的文件格式');
        }
    }

    function parseCSV(text) {
        var lines = text.split(/\r?\n/);
        if (lines.length === 0) return;
        // 检测是否有表头：如果第一行包含非数字非hex字符，视为表头
        var firstLine = lines[0].trim();
        var hasHeader = firstLine.split(',').some(function (cell) {
            cell = cell.trim();
            return cell !== '' && !/^[0-9a-fA-F\s.,\-]+$/.test(cell) && !/^\d+$/.test(cell);
        });
        if (hasHeader) {
            batchHeaders = parseCSVLine(lines[0]);
            batchData = [];
            for (var i = 1; i < lines.length; i++) {
                if (lines[i].trim() === '') continue;
                batchData.push(lines[i]);
            }
            showColumnSelector(batchHeaders);
        } else {
            batchHeaders = [];
            batchData = lines.filter(function (l) { return l.trim() !== ''; });
            $('#hexBatchColGroup').addClass('d-none');
        }
    }

    function parseCSVLine(line) {
        // Simple CSV parser (handles quoted fields)
        var result = [];
        var current = '';
        var inQuotes = false;
        for (var i = 0; i < line.length; i++) {
            var ch = line[i];
            if (ch === '"') {
                inQuotes = !inQuotes;
            } else if (ch === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += ch;
            }
        }
        result.push(current.trim());
        return result;
    }

    function parseExcelSheet(buffer, sheetName) {
        var wb = XLSX.read(buffer, { type: 'array' });
        var ws = wb.Sheets[sheetName];
        var json = XLSX.utils.sheet_to_json(ws, { header: 1 });
        if (json.length === 0) { batchData = []; return; }
        // 检测表头
        var firstRow = json[0];
        var hasHeader = firstRow.some(function (cell) {
            if (cell === null || cell === undefined) return false;
            var s = String(cell).trim();
            return s !== '' && !/^[0-9a-fA-F\s.,\-]+$/.test(s) && !/^\d+$/.test(s);
        });
        if (hasHeader) {
            batchHeaders = firstRow.map(function (c) { return c ? String(c) : ''; });
            batchData = [];
            for (var i = 1; i < json.length; i++) {
                var row = json[i];
                if (!row || row.every(function (c) { return c === null || c === undefined || String(c).trim() === ''; })) continue;
                batchData.push(row.map(function (c) { return c !== null && c !== undefined ? String(c) : ''; }).join(','));
            }
            showColumnSelector(batchHeaders);
        } else {
            batchHeaders = [];
            batchData = [];
            for (var i = 0; i < json.length; i++) {
                var row = json[i];
                if (!row || row.every(function (c) { return c === null || c === undefined || String(c).trim() === ''; })) continue;
                batchData.push(row.map(function (c) { return c !== null && c !== undefined ? String(c) : ''; }).join(','));
            }
            $('#hexBatchColGroup').addClass('d-none');
        }
    }

    function showColumnSelector(headers) {
        var $sel = $('#hexBatchColSelect').empty();
        headers.forEach(function (h, i) {
            var label = h || ('第' + (i + 1) + '列');
            $sel.append($('<option>').val(i).text(label));
        });
        $('#hexBatchColGroup').removeClass('d-none');
    }

    function showFileInfo(name, count) {
        $('#hexBatchFileName').text(name + '（' + count + '行数据）');
        $('#hexBatchFileInfo').removeClass('d-none');
    }

    function getBatchInputValues() {
        var values = [];
        if (batchHeaders.length > 0) {
            // CSV/Excel有表头，按列提取
            var colIdx = parseInt($('#hexBatchColSelect').val()) || 0;
            var ext = batchFileName.split('.').pop().toLowerCase();
            batchData.forEach(function (row) {
                var cells;
                if (ext === 'xlsx' || ext === 'xls') {
                    cells = row.split(',');
                } else {
                    cells = parseCSVLine(row);
                }
                var val = (cells[colIdx] || '').trim();
                if (val !== '') values.push(val);
            });
        } else {
            // TXT，每行一个值
            values = batchData.slice();
        }
        return values;
    }

    function startBatchConvert() {
        var fromRadix = $('#hexBatchFrom').val();
        var toRadix = $('#hexBatchTo').val();
        var padResult = $('#hexBatchPad7').is(':checked');
        var values = getBatchInputValues();
        if (values.length === 0) {
            showToast('没有可转换的数据');
            return;
        }

        batchResults = [];
        $('#hexBatchProgress').removeClass('d-none');
        $('#hexBatchDownload').addClass('d-none');
        $('#hexBatchPreview').addClass('d-none');

        var total = values.length;
        var batchSize = 200;
        var index = 0;

        function processBatch() {
            var end = Math.min(index + batchSize, total);
            for (var i = index; i < end; i++) {
                try {
                    var converted = convertSingle(values[i], fromRadix, toRadix, padResult);
                    batchResults.push({ original: values[i], result: converted });
                } catch (e) {
                    batchResults.push({ original: values[i], result: 'ERROR: ' + e.message });
                }
            }
            index = end;
            var pct = Math.round(index / total * 100);
            $('#hexBatchProgress .progress-bar').css('width', pct + '%').text(pct + '%');
            $('#hexBatchStatus').text('已处理 ' + index + ' / ' + total + ' 条');

            if (index < total) {
                setTimeout(processBatch, 0);
            } else {
                $('#hexBatchProgress .progress-bar').removeClass('progress-bar-animated').addClass('bg-success');
                $('#hexBatchStatus').text('转换完成，共 ' + total + ' 条');
                $('#hexBatchDownload').removeClass('d-none');
                showBatchPreview();
            }
        }
        // 重置进度条
        $('#hexBatchProgress .progress-bar').addClass('progress-bar-animated').removeClass('bg-success').css('width', '0%').text('0%');
        $('#hexBatchStatus').text('正在转换...');
        processBatch();
    }

    function convertSingle(value, fromRadix, toRadix, padResult) {
        value = value.trim();
        if (value === '') return '';
        if (fromRadix === 'ascii' && toRadix === 'ascii') return value;
        var result;
        if (fromRadix === 'ascii') {
            var hex = stringToHex(value);
            var num = parseInt(hex, 16);
            result = num.toString(parseInt(toRadix));
        } else if (toRadix === 'ascii') {
            if (fromRadix === '16') return hexToString(value);
            var num = parseInt(value, parseInt(fromRadix));
            return hexToString(num.toString(16));
        } else {
            var num = parseInt(value, parseInt(fromRadix));
            if (isNaN(num)) throw new Error('无效输入');
            result = num.toString(parseInt(toRadix));
        }
        if (padResult && result) {
            result = result.padStart(7, '0').toUpperCase();
        }
        return result;
    }

    function showBatchPreview() {
        var $head = $('#hexBatchPreviewHead').empty();
        var $body = $('#hexBatchPreviewBody').empty();

        if (batchHeaders.length > 0) {
            var colIdx = parseInt($('#hexBatchColSelect').val()) || 0;
            var colName = batchHeaders[colIdx] || ('第' + (colIdx + 1) + '列');
            $head.html('<tr><th>序号</th><th>' + escapeHtml(colName) + '（原值）</th><th>转换结果</th></tr>');
        } else {
            $head.html('<tr><th>序号</th><th>原值</th><th>转换结果</th></tr>');
        }

        var previewCount = Math.min(batchResults.length, 10);
        for (var i = 0; i < previewCount; i++) {
            $body.append('<tr><td>' + (i + 1) + '</td><td>' + escapeHtml(batchResults[i].original) + '</td><td>' + escapeHtml(batchResults[i].result) + '</td></tr>');
        }
        if (batchResults.length > 10) {
            $body.append('<tr><td colspan="3" class="text-muted">... 共 ' + batchResults.length + ' 条，下载查看全部</td></tr>');
        }
        $('#hexBatchPreview').removeClass('d-none');
    }

    // 防止Excel把内容误判为科学计数法或数字，用="..."格式强制当文本
    function csvEscape(val) {
        return '="' + String(val).replace(/"/g, '""') + '"';
    }

    function downloadBatchResults() {
        if (batchResults.length === 0) return;
        var fromRadix = $('#hexBatchFrom').val();
        var toRadix = $('#hexBatchTo').val();
        var csv = '﻿'; // BOM for Excel中文兼容
        csv += '序号,原值(' + fromRadix + '进制),转换结果(' + toRadix + '进制)\n';
        batchResults.forEach(function (r, i) {
            csv += (i + 1) + ',' + csvEscape(r.original) + ',' + csvEscape(r.result) + '\n';
        });
        var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        var baseName = batchFileName.replace(/\.[^.]+$/, '');
        a.download = baseName + '_转换结果.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
});