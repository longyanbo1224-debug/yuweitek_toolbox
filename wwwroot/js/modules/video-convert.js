// js/modules/video-convert.js
// H264 转 MP4 工具（单文件 + 批量转换）

let currentSSE = null;
let currentTaskId = null;
let batchSSE = null;
let currentBatchSessionId = null;

function closeSSE() {
    if (currentSSE) {
        currentSSE.close();
        currentSSE = null;
    }
}

function closeBatchSSE() {
    if (batchSSE) {
        batchSSE.close();
        batchSSE = null;
    }
}

function finishConversion() {
    $('#startConvertBtn').prop('disabled', false);
    $('#cancelConvertBtn').hide();
    currentTaskId = null;
    closeSSE();
}

function finishBatch() {
    $('#startBatchConvertBtn').prop('disabled', false);
    $('#cancelBatchConvertBtn').hide();
    currentBatchSessionId = null;
    closeBatchSSE();
}

function addConvertLog(message, isError = false) {
    const logDiv = $('#convertLog');
    const color = isError ? 'text-danger' : 'text-success';
    logDiv.append(`<div class="${color}">${new Date().toLocaleTimeString()} - ${escapeHtml(message)}</div>`);
    logDiv.scrollTop(logDiv[0].scrollHeight);
}

function addBatchLog(message, isError = false) {
    const logDiv = $('#batchLog');
    const color = isError ? 'text-danger' : 'text-success';
    logDiv.append(`<div class="${color}">${new Date().toLocaleTimeString()} - ${escapeHtml(message)}</div>`);
    logDiv.scrollTop(logDiv[0].scrollHeight);
}

$(document).ready(function () {
    // 单文件转换：显示/隐藏 CRF 滑块
    $('#reencodeCheck').change(function () {
        $('#crfGroup').toggle(this.checked);
    });
    $('#crfSlider').on('input', function () {
        $('#crfValue').text(this.value);
    });
    // 批量转换：显示/隐藏 CRF 滑块
    $('#batchReencodeCheck').change(function () {
        $('#batchCrfGroup').toggle(this.checked);
    });
    $('#batchCrfSlider').on('input', function () {
        $('#batchCrfValue').text(this.value);
    });

    // 初始同步（确保页面加载时滑块状态正确）
    $('#crfGroup').toggle($('#reencodeCheck').is(':checked'));
    $('#batchCrfGroup').toggle($('#batchReencodeCheck').is(':checked'));

    // “浏览”按钮（模拟选择输出路径）
    $('#browseOutputBtn').click(function () {
        const source = $('#sourcePath').val().trim();
        let defaultName = 'output.mp4';
        if (source) {
            defaultName = source.replace(/\.(264|h264)$/i, '.mp4');
        }
        const newPath = prompt('请输入输出文件完整路径（例如 D:\\videos\\output.mp4）', defaultName);
        if (newPath) {
            $('#outputPath').val(newPath);
        }
    });

    // 开始单文件转换
    $('#startConvertBtn').click(async function () {
        const inputPath = $('#sourcePath').val().trim();
        const outputPath = $('#outputPath').val().trim();
        if (!inputPath || !outputPath) {
            alert('请填写源文件路径和输出路径');
            return;
        }
        const reencode = $('#reencodeCheck').is(':checked');
        const crf = parseInt($('#crfSlider').val());

        addConvertLog('正在启动转换任务...');
        $('#startConvertBtn').prop('disabled', true);
        $('#cancelConvertBtn').show();
        closeSSE();

        try {
            const res = await axios.post('/api/video/convert_async', {
                input_path: inputPath,
                output_path: outputPath,
                reencode: reencode,
                crf: crf
            });
            currentTaskId = res.data.task_id;
            addConvertLog(`任务已创建，ID: ${currentTaskId}`);

            currentSSE = new EventSource(`/api/video/task_stream/${currentTaskId}?client_version=${FRONTEND_VERSION}`);
            currentSSE.onmessage = function (event) {
                const data = JSON.parse(event.data);
                if (data.event === 'progress') {
                    $('#convertProgress').css('width', data.progress + '%').text(data.progress + '%');
                    addConvertLog(data.message);
                    if (data.status === 'completed') {
                        addConvertLog(`✅ 转换完成！输出文件：${data.output_path || outputPath}`);
                        finishConversion();
                    } else if (data.status === 'failed') {
                        addConvertLog(`❌ 转换失败：${data.message}`, true);
                        finishConversion();
                    } else if (data.status === 'cancelled') {
                        addConvertLog(`⚠️ 转换已取消`, true);
                        finishConversion();
                    }
                }
            };
            currentSSE.onerror = function () {
                addConvertLog('SSE 连接中断，请检查网络', true);
                finishConversion();
            };
        } catch (err) {
            addConvertLog(`请求失败：${err.message}`, true);
            finishConversion();
        }
    });

    // 取消单文件转换
    $('#cancelConvertBtn').click(async function () {
        if (!currentTaskId) return;
        addConvertLog('正在取消转换...');
        try {
            await axios.post(`/api/video/cancel/${currentTaskId}`);
            addConvertLog('已发送取消请求，正在终止进程...');
            closeSSE();
            finishConversion();
        } catch (err) {
            addConvertLog(`取消失败：${err.message}`, true);
        }
    });

    // 开始批量转换
    $('#startBatchConvertBtn').click(async function () {
        const folderPath = $('#batchFolderPath').val().trim();
        if (!folderPath) {
            alert('请填写文件夹路径');
            return;
        }
        const reencode = $('#batchReencodeCheck').is(':checked');
        const crf = parseInt($('#batchCrfSlider').val());
        const overwrite = $('#batchOverwrite').is(':checked');

        addBatchLog('正在启动批量转换...');
        $('#startBatchConvertBtn').prop('disabled', true);
        $('#cancelBatchConvertBtn').show();
        closeBatchSSE();

        try {
            const res = await axios.post('/api/video/batch_convert_start', {
                folder_path: folderPath,
                reencode: reencode,
                crf: crf,
                overwrite: overwrite
            });
            currentBatchSessionId = res.data.session_id;
            addBatchLog(`批量转换会话已创建，ID: ${currentBatchSessionId}`);

            batchSSE = new EventSource(`/api/video/batch_stream/${currentBatchSessionId}?client_version=${FRONTEND_VERSION}`);
            batchSSE.onmessage = function (event) {
                const data = JSON.parse(event.data);
                if (data.event === 'start') {
                    addBatchLog(`找到 ${data.total} 个视频文件，开始批量转换...`);
                    $('#batchProgress').css('width', '0%').text('0%');
                } else if (data.event === 'file_start') {
                    addBatchLog(`[${data.index}/${data.total}] 正在转换: ${data.filename}`);
                    let completedFiles = data.index - 1;
                    let totalProgress = completedFiles / data.total * 100;
                    $('#batchProgress').css('width', totalProgress + '%').text(Math.floor(totalProgress) + '%');
                } else if (data.event === 'file_progress') {
                    let completedFiles = data.index - 1;
                    let currentFilePercent = (data.progress || 0) / 100;
                    let totalProgress = (completedFiles + currentFilePercent) / data.total * 100;
                    totalProgress = Math.min(100, Math.max(0, totalProgress));
                    $('#batchProgress').css('width', totalProgress + '%').text(Math.floor(totalProgress) + '%');
                    addBatchLog(`[${data.index}/${data.total}] ${data.filename}: ${data.message}`);
                } else if (data.event === 'file_end') {
                    if (data.status === 'success') {
                        addBatchLog(`[${data.index}/${data.total}] 转换成功: ${data.filename} -> ${data.output}`);
                    } else if (data.status === 'failed') {
                        addBatchLog(`[${data.index}/${data.total}] 转换失败: ${data.filename} - ${data.error}`, true);
                    }
                    let totalProgress = data.index / data.total * 100;
                    $('#batchProgress').css('width', totalProgress + '%').text(Math.floor(totalProgress) + '%');
                } else if (data.event === 'skip') {
                    addBatchLog(`[${data.index}/${data.total}] 跳过: ${data.filename} (${data.message})`);
                    const percent = Math.floor(data.index / data.total * 100);
                    $('#batchProgress').css('width', percent + '%').text(percent + '%');
                } else if (data.event === 'cancelled') {
                    addBatchLog(`批量转换已取消`, true);
                    finishBatch();
                } else if (data.event === 'end') {
                    addBatchLog(`批量转换完成！成功: ${data.success_count}，失败: ${data.fail_count}`);
                    finishBatch();
                }
            };
            batchSSE.onerror = function () {
                addBatchLog('SSE 连接中断，请检查网络', true);
                finishBatch();
            };
        } catch (err) {
            addBatchLog(`请求失败：${err.message}`, true);
            finishBatch();
        }
    });

    // 取消批量转换
    $('#cancelBatchConvertBtn').click(async function () {
        if (!currentBatchSessionId) return;
        addBatchLog('正在取消批量转换...');
        try {
            await axios.post(`/api/video/batch_cancel/${currentBatchSessionId}`);
            addBatchLog('已发送取消请求，正在终止...');
            closeBatchSSE();
            finishBatch();
        } catch (err) {
            addBatchLog(`取消失败：${err.message}`, true);
        }
    });

    // 切换菜单时关闭所有 SSE 连接
    $(document).on('click', '.dropdown-item', function () {
        closeSSE();
        closeBatchSSE();
    });
});