// ========== 公里海里转换工具 ==========

$(document).ready(function () {
    // 换算常量（国际标准）
    var KM_TO_NMI = 0.5399568034557236;  // 1 km = 1/1.852 nmi
    var NMI_TO_KM = 1.852;               // 1 nmi = 1.852 km
    var precision = 6;
    var converting = false; // 防止循环触发

    var $kmInput = $("#kmInput");
    var $nmiInput = $("#nmiInput");
    var $precisionRange = $("#precisionRange");
    var $precisionValue = $("#precisionValue");

    // ---------- 公里 → 海里 ----------
    $kmInput.on("input", function () {
        if (converting) return;
        var km = parseFloat($(this).val());
        if (!isNaN(km)) {
            converting = true;
            $nmiInput.val((km * KM_TO_NMI).toFixed(precision));
            converting = false;
        } else {
            converting = true;
            $nmiInput.val("");
            converting = false;
        }
    });

    // ---------- 海里 → 公里 ----------
    $nmiInput.on("input", function () {
        if (converting) return;
        var nmi = parseFloat($(this).val());
        if (!isNaN(nmi)) {
            converting = true;
            $kmInput.val((nmi * NMI_TO_KM).toFixed(precision));
            converting = false;
        } else {
            converting = true;
            $kmInput.val("");
            converting = false;
        }
    });

    // ---------- 交换按钮 ----------
    $("#swapKmNmi").on("click", function () {
        var kmVal = $kmInput.val();
        var nmiVal = $nmiInput.val();
        $kmInput.val(nmiVal);
        $nmiInput.val(kmVal);
        // 添加旋转动画
        $(this).find("i").css("transform", "rotate(180deg)");
        setTimeout(function () {
            $("#swapKmNmi i").css("transform", "");
        }, 300);
    });

    // ---------- 精度滑块 ----------
    $precisionRange.on("input", function () {
        precision = parseInt($(this).val());
        $precisionValue.text(precision);
        recalculate();
    });

    function recalculate() {
        var kmVal = parseFloat($kmInput.val());
        if (!isNaN(kmVal)) {
            converting = true;
            $nmiInput.val((kmVal * KM_TO_NMI).toFixed(precision));
            converting = false;
        }
    }

    // ---------- 快捷按钮 ----------
    $(".km-nmi-quick-btn").on("click", function () {
        var val = $(this).data("value");
        var dir = $(this).data("dir");
        if (dir === "km") {
            $kmInput.val(val).trigger("input");
        } else {
            $nmiInput.val(val).trigger("input");
        }
    });

    // ---------- 清空按钮 ----------
    $("#clearKmNmi").on("click", function () {
        $kmInput.val("");
        $nmiInput.val("");
        $kmInput.focus();
    });

    // ---------- 复制按钮（使用 ClipboardJS） ----------
    var clipboardKm = new ClipboardJS('.km-nmi-copy-btn', {
        text: function (trigger) {
            var target = $(trigger).data("target");
            return $(target).val() || "";
        }
    });

    clipboardKm.on("success", function (e) {
        if (e.text) {
            showToast("已复制: " + e.text);
            var $btn = $(e.trigger);
            var icon = $btn.find("i");
            icon.removeClass("bi-clipboard").addClass("bi-check-lg");
            setTimeout(function () {
                icon.removeClass("bi-check-lg").addClass("bi-clipboard");
            }, 1500);
        } else {
            showToast("没有可复制的值");
        }
        e.clearSelection();
    });

    clipboardKm.on("error", function () {
        showToast("复制失败，请手动复制");
    });

    // ==================== GPS 指令生成 ====================

    var $gpsSpeedKm = $("#gpsSpeedKm");
    var $gpsSpeedNmi = $("#gpsSpeedNmi");

    // 尝试从 localStorage 获取经纬度工具的坐标，或使用浏览器定位
    (function initGpsCoords() {
        // 优先读 localStorage
        var saved = "";
        try { saved = localStorage.getItem("yuweitek_last_latlng") || ""; } catch (e) {}
        if (saved) {
            var parts = saved.split(",");
            if (parts.length >= 2) {
                $("#gpsLat").val(parseFloat(parts[0]).toFixed(6));
                $("#gpsLng").val(parseFloat(parts[1]).toFixed(6));
                return;
            }
        }
        // 降级：浏览器定位
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(function (pos) {
                $("#gpsLat").val(pos.coords.latitude.toFixed(6));
                $("#gpsLng").val(pos.coords.longitude.toFixed(6));
            }, function () { /* 定位失败不处理 */ }, { enableHighAccuracy: true, timeout: 8000 });
        }
    })();

    // km/h → nmi/h 自动换算
    $gpsSpeedKm.on("input", function () {
        var km = parseFloat($(this).val());
        if (!isNaN(km)) {
            $gpsSpeedNmi.val((km * KM_TO_NMI).toFixed(2));
        } else {
            $gpsSpeedNmi.val("");
        }
    });

    // 从经纬度坐标查询工具获取（从 localStorage 读取最近一次坐标）
    $("#gpsGetLatLng").on("click", function () {
        // 优先从 localStorage 读取，其次从 DOM 读取
        var raw = "";
        try { raw = localStorage.getItem("yuweitek_last_latlng") || ""; } catch (e) {}
        if (!raw) {
            raw = ($("#coordinate-input").val() || "").trim();
        }
        if (!raw) {
            showToast("暂无坐标数据，请先使用经纬度坐标查询工具查询");
            return;
        }
        // 格式: "纬度,经度" 或 "纬度, 经度"
        var parts = raw.split(",");
        if (parts.length >= 2) {
            var lat = parseFloat(parts[0].trim());
            var lng = parseFloat(parts[1].trim());
            if (!isNaN(lat) && !isNaN(lng)) {
                $("#gpsLat").val(lat.toFixed(6));
                $("#gpsLng").val(lng.toFixed(6));
                showToast("已获取坐标: " + lat.toFixed(6) + ", " + lng.toFixed(6));
            } else {
                showToast("经纬度格式无效");
            }
        } else {
            showToast("经纬度格式无效");
        }
    });

    // 生成指令
    $("#gpsGenerateBtn").on("click", function () {
        var lng = parseFloat($("#gpsLng").val());
        var lat = parseFloat($("#gpsLat").val());
        if (isNaN(lng) || isNaN(lat)) {
            showToast("请输入有效的经纬度");
            $("#gpsLng").addClass("is-invalid");
            $("#gpsLat").addClass("is-invalid");
            return;
        }
        $("#gpsLng").removeClass("is-invalid");
        $("#gpsLat").removeClass("is-invalid");

        var flag = $("#gpsFlag").val();
        var mode = $("#gpsMode").val();
        var satellite = parseInt($("#gpsSatellite").val());
        var heading = parseFloat($("#gpsHeading").val());
        var speedNmi = parseFloat($gpsSpeedNmi.val());

        // 参数校验
        if (isNaN(satellite)) {
            showToast("请输入卫星数");
            $("#gpsSatellite").addClass("is-invalid");
            return;
        }
        $("#gpsSatellite").removeClass("is-invalid");

        if (isNaN(heading)) {
            showToast("请输入运动方向");
            $("#gpsHeading").addClass("is-invalid");
            return;
        }
        $("#gpsHeading").removeClass("is-invalid");

        if (isNaN(speedNmi)) {
            showToast("请输入速度（km/h）");
            $gpsSpeedKm.addClass("is-invalid");
            return;
        }
        $gpsSpeedKm.removeClass("is-invalid");

        // 构建指令: *#27*lng*lat*flag*mode*speed*satellite*heading#
        var cmd = "*#27*";
        cmd += lng.toFixed(6) + "*";
        cmd += lat.toFixed(6);
        cmd += "*" + flag;
        cmd += "*" + mode;
        cmd += "*" + (isNaN(speedNmi) ? "0.00" : speedNmi.toFixed(2));
        cmd += "*" + (isNaN(satellite) ? "0" : satellite);
        cmd += "*" + (isNaN(heading) ? "0.00" : heading.toFixed(2));
        cmd += "#";

        $("#gpsCmdOutput").val(cmd);
        showToast("指令已生成");
    });

    // 清空
    $("#gpsClearBtn").on("click", function () {
        $("#gpsLng").val("");
        $("#gpsLat").val("");
        $gpsSpeedKm.val("");
        $gpsSpeedNmi.val("");
        $("#gpsSatellite").val("13");
        $("#gpsHeading").val("90.01");
        $("#gpsFlag").val("0");
        $("#gpsMode").val("3");
        $("#gpsCmdOutput").val("");
    });

    // 复制指令
    var clipboardGps = new ClipboardJS('#gpsCmdCopy', {
        text: function () {
            return $("#gpsCmdOutput").val() || "";
        }
    });

    clipboardGps.on("success", function (e) {
        if (e.text) {
            showToast("已复制: " + e.text);
            var icon = $(e.trigger).find("i");
            icon.removeClass("bi-clipboard").addClass("bi-check-lg");
            setTimeout(function () { icon.removeClass("bi-check-lg").addClass("bi-clipboard"); }, 1500);
        } else {
            showToast("没有可复制的指令");
        }
        e.clearSelection();
    });

    clipboardGps.on("error", function () {
        showToast("复制失败，请手动复制");
    });
});
