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
        converting = true;
        $kmInput.val(nmiVal);
        $nmiInput.val(kmVal);
        converting = false;
        // 触发换算
        if (nmiVal) $kmInput.trigger("input");
        else if (kmVal) $nmiInput.trigger("input");
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
        var nmiVal = parseFloat($nmiInput.val());
        if (!isNaN(kmVal)) {
            converting = true;
            $nmiInput.val((kmVal * KM_TO_NMI).toFixed(precision));
            converting = false;
        } else if (!isNaN(nmiVal)) {
            converting = true;
            $kmInput.val((nmiVal * NMI_TO_KM).toFixed(precision));
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
            showToast("请先输入速度（km/h）");
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

    // ==================== 地图选点 ====================

    var pickMap = null;
    var pickMarker = null;
    var pickLat = null;
    var pickLng = null;
    var pickTk = "485f0753096883fe9ddb2c1e2ffc49da";
    var pickApiReady = false; // 天地图 API 是否已就绪

    // 页面加载时立即开始加载天地图 API（与 latlng-query.js 并行，不重复加载）
    (function preloadTiandituApi() {
        if (typeof T !== 'undefined') { pickApiReady = true; return; }
        if (document.querySelectorAll('script[src*="tianditu.gov.cn"]').length > 0) {
            // 已有 script 标签（latlng-query.js 加载的），等它加载完
            var wait = setInterval(function () {
                if (typeof T !== 'undefined') { pickApiReady = true; clearInterval(wait); }
            }, 100);
            setTimeout(function () { clearInterval(wait); }, 15000);
            return;
        }
        var s = document.createElement('script');
        s.src = 'https://api.tianditu.gov.cn/api?v=4.0&tk=' + pickTk;
        s.onload = function () { pickApiReady = true; };
        s.onerror = function () { console.warn("天地图 API 预加载失败"); };
        document.head.appendChild(s);
    })();

    // 等待天地图 API 就绪
    function waitForTianditu(callback) {
        if (typeof T !== 'undefined' || pickApiReady) return callback();
        var check = setInterval(function () {
            if (typeof T !== 'undefined' || pickApiReady) { clearInterval(check); callback(); }
        }, 100);
        setTimeout(function () { clearInterval(check); }, 15000);
    }

    // 向指定坐标添加/移动标记
    function setPickMarker(lng, lat) {
        pickLng = lng;
        pickLat = lat;
        var lnglat = new T.LngLat(lng, lat);
        if (!pickMarker) {
            pickMarker = new T.Marker(lnglat);
            pickMap.addOverLay(pickMarker);
        } else {
            pickMarker.setLngLat(lnglat);
        }
        pickMarker.show();
        $("#mapPickCoord").text(lat.toFixed(6) + ", " + lng.toFixed(6))
            .removeClass("bg-secondary").addClass("bg-success text-white");
        $("#mapPickConfirm").prop("disabled", false);
    }

    // 创建地图并初始化
    function buildPickMap() {
        var container = document.getElementById('mapPickContainer');
        if (!container) return;

        // 确保容器干净
        container.innerHTML = '';
        container.offsetWidth; // 强制 reflow

        // 创建地图实例
        pickMap = new T.Map(container);
        pickMap.enableScrollWheelZoom();

        // 默认中心：中国
        pickMap.centerAndZoom(new T.LngLat(104.19, 35.86), 5);

        // 等浏览器完成布局后，再 checkResize + 设定正确中心
        setTimeout(function () {
            if (!pickMap) return;
            pickMap.checkResize();

            var lat = parseFloat($("#gpsLat").val());
            var lng = parseFloat($("#gpsLng").val());
            // 输入框为空时，从 localStorage 读取上次坐标
            if (isNaN(lat) || isNaN(lng)) {
                try {
                    var saved = localStorage.getItem("yuweitek_last_latlng") || "";
                    if (saved) {
                        var p = saved.split(",");
                        if (p.length >= 2) { lat = parseFloat(p[0]); lng = parseFloat(p[1]); }
                    }
                } catch (e) {}
            }
            if (!isNaN(lat) && !isNaN(lng)) {
                pickMap.centerAndZoom(new T.LngLat(lng, lat), 15);
                setPickMarker(lng, lat);
            } else {
                pickLat = null;
                pickLng = null;
                $("#mapPickCoord").text("点击地图选择坐标").removeClass("bg-success text-white").addClass("bg-secondary");
                $("#mapPickConfirm").prop("disabled", true);
            }
        }, 300);

        // 天地图 API 点击事件
        pickMap.addEventListener("click", function (e) {
            if (e && e.lnglat) {
                setPickMarker(e.lnglat.lng, e.lnglat.lat);
            }
        });
    }

    // 销毁地图
    function destroyPickMap() {
        pickMap = null;
        pickMarker = null;
        pickLat = null;
        pickLng = null;
        var container = document.getElementById('mapPickContainer');
        if (container) container.innerHTML = '';
    }

    // 地址搜索（天地图地理编码）
    function searchPickAddress(address) {
        if (!address) { showToast("请输入地址"); return; }
        if (!pickMap) { showToast("地图尚未加载完成"); return; }
        var params = { keyWord: address };
        var ds = encodeURIComponent(JSON.stringify(params));
        var url = 'https://api.tianditu.gov.cn/geocoder?ds=' + ds + '&tk=' + pickTk;
        fetch(url)
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.status === "0" && data.location) {
                    var lng = parseFloat(data.location.lon);
                    var lat = parseFloat(data.location.lat);
                    var lnglat = new T.LngLat(lng, lat);
                    pickMap.centerAndZoom(lnglat, 16);
                    setPickMarker(lng, lat);
                    showToast("已定位到: " + address);
                } else {
                    showToast(data.msg || "未找到该地址");
                }
            })
            .catch(function () {
                showToast("搜索失败，请检查网络连接");
            });
    }

    // 点击"地图选点"按钮
    $("#gpsMapPick").on("click", function () {
        waitForTianditu(function () {
            var modalEl = document.getElementById('mapPickModal');
            var modal = bootstrap.Modal.getOrCreateInstance(modalEl);
            modal.show();
            // Modal 动画结束后，等一帧让浏览器完成布局，再创建地图
            $(modalEl).one('shown.bs.modal', function () {
                requestAnimationFrame(function () {
                    buildPickMap();
                });
            });
        });
    });

    // Modal 关闭时销毁地图
    $('#mapPickModal').on('hidden.bs.modal', function () {
        destroyPickMap();
    });

    // 地址搜索按钮
    $("#mapPickSearchBtn").on("click", function () {
        searchPickAddress($("#mapPickSearch").val().trim());
    });

    // 地址搜索回车
    $("#mapPickSearch").on("keydown", function (e) {
        if (e.key === "Enter") {
            e.preventDefault();
            searchPickAddress($(this).val().trim());
        }
    });

    // 确认选点
    $("#mapPickConfirm").on("click", function () {
        if (pickLat !== null && pickLng !== null) {
            $("#gpsLat").val(pickLat.toFixed(6));
            $("#gpsLng").val(pickLng.toFixed(6));
            try { localStorage.setItem("yuweitek_last_latlng", pickLat.toFixed(6) + "," + pickLng.toFixed(6)); } catch (e) {}
            showToast("已选取坐标: " + pickLat.toFixed(6) + ", " + pickLng.toFixed(6));
            bootstrap.Modal.getInstance(document.getElementById('mapPickModal')).hide();
        }
    });
});
