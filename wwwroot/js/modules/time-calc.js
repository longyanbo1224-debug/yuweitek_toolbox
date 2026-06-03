// ========== 时间计算器 ==========

$(document).ready(function () {

    // ---------- 单位换算常量（秒） ----------
    var UNIT_SEC = {
        ms: 0.001,
        s: 1,
        min: 60,
        h: 3600,
        d: 86400,
        w: 604800,
        m: 2592000,   // 30天
        y: 31536000    // 365天
    };

    // ---------- 工具函数 ----------
    function pad(n) { return n < 10 ? '0' + n : '' + n; }

    function formatDuration(ms) {
        if (ms < 0) ms = -ms;
        var sec = Math.floor(ms / 1000);
        var d = Math.floor(sec / 86400); sec %= 86400;
        var h = Math.floor(sec / 3600);  sec %= 3600;
        var m = Math.floor(sec / 60);
        var s = sec % 60;
        var parts = [];
        if (d > 0) parts.push(d + '天');
        parts.push(pad(h) + '小时');
        parts.push(pad(m) + '分钟');
        parts.push(pad(s) + '秒');
        return parts.join(' ');
    }

    function formatDateTime(date) {
        return date.getFullYear() + '年'
            + pad(date.getMonth() + 1) + '月'
            + pad(date.getDate()) + '日 '
            + pad(date.getHours()) + ':'
            + pad(date.getMinutes()) + ':'
            + pad(date.getSeconds());
    }

    function formatDate(date) {
        return date.getFullYear() + '年'
            + pad(date.getMonth() + 1) + '月'
            + pad(date.getDate()) + '日';
    }

    // 设置 datetime-local 默认值
    function setDateTime(id, val) {
        $('#' + id).val(val || '2026-01-01T00:00:00');
    }

    // 设置 date 默认值
    function setDate(id, val) {
        $('#' + id).val(val || '2026-01-01');
    }

    // 获取当前时间字符串
    function nowDateTime() {
        var now = new Date();
        return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate())
            + 'T' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
    }
    function nowDate() {
        var now = new Date();
        return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
    }

    // 初始化默认值
    setDateTime('tcRefTime');
    setDate('tcDateStart');
    setDate('tcDateEnd', nowDate());
    setDate('tcDateRef');
    setDateTime('tcTimeStart');
    setDateTime('tcTimeEnd', nowDateTime());
    setDateTime('tcTimeRef');

    // ---------- ① 距离此刻时间计算 ----------
    var refTimer = null;
    $('#tcRefTimeBtn').on('click', function () {
        if (refTimer) { clearInterval(refTimer); refTimer = null; }
        var val = $('#tcRefTime').val();
        if (!val) { showToast('请选择参考时间'); return; }
        var refDate = new Date(val);

        function update() {
            var now = new Date();
            var diff = now - refDate;
            if (diff < 0) {
                $('#tcRefTimeResult').html('<span class="text-warning">尚未到达该时间，还差 ' + formatDuration(diff) + '</span>');
            } else {
                $('#tcRefTimeResult').html('<span class="text-success">已经过去 <strong>' + formatDuration(diff) + '</strong></span>');
            }
        }
        update();
        refTimer = setInterval(update, 1000);
    });

    // ---------- ② 日期间隔计算器 ----------
    $('#tcDateDiffBtn').on('click', function () {
        var start = $('#tcDateStart').val();
        var end = $('#tcDateEnd').val();
        if (!start || !end) { showToast('请选择开始和结束日期'); return; }
        var d1 = new Date(start);
        var d2 = new Date(end);
        var diffDays = Math.round((d2 - d1) / 86400000);
        var absDays = Math.abs(diffDays);
        var sign = diffDays >= 0 ? '' : '-';
        $('#tcDateDiffResult').html('相差 <strong>' + sign + absDays + '</strong> 天');
    });

    // ---------- ③ 时间间隔计算器 ----------
    $('#tcTimeDiffBtn').on('click', function () {
        var start = $('#tcTimeStart').val();
        var end = $('#tcTimeEnd').val();
        if (!start || !end) { showToast('请选择开始和结束时间'); return; }
        var t1 = new Date(start);
        var t2 = new Date(end);
        var diff = t2 - t1;
        var prefix = diff >= 0 ? '相差 ' : '相差（负）';
        $('#tcTimeDiffResult').html(prefix + '<strong>' + formatDuration(diff) + '</strong>');
    });

    // ---------- ④ 日期推算计算器 ----------
    $('#tcDateOffsetBtn').on('click', function () {
        var ref = $('#tcDateRef').val();
        var offset = parseInt($('#tcDateOffset').val());
        if (!ref || isNaN(offset)) { showToast('请输入参考日期和日期差'); return; }
        var d = new Date(ref);
        d.setDate(d.getDate() + offset);
        $('#tcDateOffsetResult').html('推算日期 <strong>' + formatDate(d) + '</strong>');
    });

    // ---------- ⑤ 时间推算计算器 ----------
    $('#tcTimeOffsetBtn').on('click', function () {
        var ref = $('#tcTimeRef').val();
        var offset = parseFloat($('#tcTimeOffset').val());
        var unit = $('#tcTimeOffsetUnit').val();
        if (!ref || isNaN(offset)) { showToast('请输入参考时间和时间差'); return; }
        var t = new Date(ref);
        var ms = offset * UNIT_SEC[unit] * 1000;
        t = new Date(t.getTime() + ms);
        $('#tcTimeOffsetResult').html('推算时间 <strong>' + formatDateTime(t) + '</strong>');
    });

    // ---------- ⑥ 时间单位转换 ----------
    function doUnitConvert() {
        var val = parseFloat($('#tcUnitFrom').val());
        if (isNaN(val)) { $('#tcUnitTo').val(''); return; }
        var fromUnit = $('#tcUnitFromType').val();
        var toUnit = $('#tcUnitToType').val();
        var seconds = val * UNIT_SEC[fromUnit];
        var result = seconds / UNIT_SEC[toUnit];
        // 智能精度
        if (Math.abs(result) < 0.000001 && result !== 0) {
            $('#tcUnitTo').val(result.toExponential(6));
        } else {
            $('#tcUnitTo').val(parseFloat(result.toPrecision(12)));
        }
    }

    $('#tcUnitFrom').on('input', doUnitConvert);
    $('#tcUnitFromType').on('change', doUnitConvert);
    $('#tcUnitToType').on('change', doUnitConvert);

    // 交换单位
    $('#tcSwapUnit').on('click', function () {
        var fromType = $('#tcUnitFromType').val();
        var toType = $('#tcUnitToType').val();
        $('#tcUnitFromType').val(toType);
        $('#tcUnitToType').val(fromType);
        // 交换数值
        var fromVal = $('#tcUnitFrom').val();
        var toVal = $('#tcUnitTo').val();
        $('#tcUnitFrom').val(toVal);
        doUnitConvert();
    });

    // 初始化转换
    doUnitConvert();
});
