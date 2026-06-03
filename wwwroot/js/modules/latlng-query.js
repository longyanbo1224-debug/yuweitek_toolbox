// js/modules/latlng-query.js
// 经纬度坐标查询工具（天地图、坐标转换）

var map, marker, zoom = 12;
var tk = "485f0753096883fe9ddb2c1e2ffc49da";

function initLatLngMap() {
    if (map) return;
    try {
        map = new T.Map('mapDiv');
        map.centerAndZoom(new T.LngLat(116.4074, 39.9042), zoom);
        marker = new T.Marker(new T.LngLat(116.4074, 39.9042));
        map.addOverLay(marker);
        map.addEventListener("click", function (e) {
            var lnglat = e.lnglat;
            marker.setLngLat(lnglat);
            updateCoordinateDisplay(lnglat.lng, lnglat.lat);
            reverseGeocode(lnglat.lng, lnglat.lat);
        });
        $("#mapDiv .map-placeholder").hide();
        console.log("地图初始化成功");
    } catch (error) {
        console.error("地图初始化失败:", error);
        $("#mapDiv .map-placeholder").html(`
            <div class="map-error text-center p-4">
                <i class="fas fa-exclamation-triangle mb-3" style="font-size: 48px;"></i>
                <h4>地图加载失败</h4>
                <p>请检查天地图API密钥和网络连接</p>
                <button class="btn btn-primary mt-3" id="retry-map">重新加载</button>
            </div>
        `);
        $("#retry-map").click(initLatLngMap);
    }
}

function updateCoordinateDisplay(lng, lat) {
    $("#current-coordinate").text(lat.toFixed(6) + ", " + lng.toFixed(6));
    $("#coordinate-input").val(lat.toFixed(6) + ", " + lng.toFixed(6));
    // 同步到 localStorage，供 GPS 指令生成等工具读取
    try { localStorage.setItem("yuweitek_last_latlng", lat.toFixed(6) + "," + lng.toFixed(6)); } catch (e) {}
}

function moveMapToLocation(lng, lat) {
    if (map && marker) {
        map.centerAndZoom(new T.LngLat(lng, lat), 15);
        marker.setLngLat(new T.LngLat(lng, lat));
        updateCoordinateDisplay(lng, lat);
    }
}

function geocode(address) {
    showLoading();
    const params = { keyWord: address };
    const ds = encodeURIComponent(JSON.stringify(params));
    const url = `https://api.tianditu.gov.cn/geocoder?ds=${ds}&tk=${tk}`;
    fetch(url)
        .then(response => response.json())
        .then(data => {
            hideLoading();
            if (data.status === "0" && data.location) {
                const lng = parseFloat(data.location.lon);
                const lat = parseFloat(data.location.lat);
                $("#geocode-result").text(lat.toFixed(6) + ", " + lng.toFixed(6));
                moveMapToLocation(lng, lat);
                showToast("地理编码成功！");
            } else {
                $("#geocode-result").text("未知");
                showToast(data.msg || "无法找到该地址");
            }
        })
        .catch(error => {
            hideLoading();
            console.error("地理编码失败:", error);
            $("#geocode-result").text("未知");
            showToast("地理编码失败，请稍后再试");
        });
}

function reverseGeocode(lng, lat) {
    showLoading();
    const params = { lon: lng, lat: lat, ver: 1 };
    const postStr = encodeURIComponent(JSON.stringify(params));
    const url = `https://api.tianditu.gov.cn/geocoder?postStr=${postStr}&type=geocode&tk=${tk}`;
    fetch(url)
        .then(response => response.json())
        .then(data => {
            hideLoading();
            if (data.status === "0" && data.result) {
                let address = data.result.formatted_address || data.result.address;
                if (!address && data.result.addressComponent) {
                    const comp = data.result.addressComponent;
                    address = [comp.nation, comp.province, comp.city, comp.county, comp.town, comp.poi].filter(Boolean).join(' ');
                }
                $("#reverse-result").text(address || "未知位置");
                showToast("反向地理编码成功！");
            } else {
                $("#reverse-result").text("未知位置");
                showToast(data.msg || "无法获取地址信息");
            }
        })
        .catch(error => {
            hideLoading();
            console.error("反向地理编码失败:", error);
            $("#reverse-result").text("未知位置");
            showToast("反向地理编码失败，请稍后再试");
        });
}

function convertCoordinateFormat(input) {
    input = input.trim();
    const ddRegex = /^\s*(-?\d+(?:\.\d+)?)\s*[,，\s;]\s*(-?\d+(?:\.\d+)?)\s*$/;
    const ddMatch = input.match(ddRegex);
    if (ddMatch) {
        const lat = parseFloat(ddMatch[1]), lng = parseFloat(ddMatch[2]);
        if (!isNaN(lat) && !isNaN(lng)) return { dd: { lat, lng }, dms: convertDDtoDMS(lat, lng), dmm: convertDDtoDMM(lat, lng) };
    }
    const dmsRegex = /(-?\d{1,3})°\s*(\d{1,2})'\s*(\d{1,2}(?:\.\d+)?)"\s*([NSEW])?/gi;
    const dmsMatches = [...input.matchAll(dmsRegex)];
    if (dmsMatches.length === 2) {
        let latDeg = parseFloat(dmsMatches[0][1]), latMin = parseFloat(dmsMatches[0][2]), latSec = parseFloat(dmsMatches[0][3]), latDir = dmsMatches[0][4] || 'N';
        let lngDeg = parseFloat(dmsMatches[1][1]), lngMin = parseFloat(dmsMatches[1][2]), lngSec = parseFloat(dmsMatches[1][3]), lngDir = dmsMatches[1][4] || 'E';
        let lat = latDeg + latMin / 60 + latSec / 3600; if (latDir === 'S') lat = -lat;
        let lng = lngDeg + lngMin / 60 + lngSec / 3600; if (lngDir === 'W') lng = -lng;
        return { dd: { lat, lng }, dms: convertDDtoDMS(lat, lng), dmm: convertDDtoDMM(lat, lng) };
    }
    const dmmRegex = /(-?\d{1,3})°\s*(\d{1,2}(?:\.\d+)?)'\s*([NSEW])?/gi;
    const dmmMatches = [...input.matchAll(dmmRegex)];
    if (dmmMatches.length === 2) {
        let latDeg = parseFloat(dmmMatches[0][1]), latMin = parseFloat(dmmMatches[0][2]), latDir = dmmMatches[0][3] || 'N';
        let lngDeg = parseFloat(dmmMatches[1][1]), lngMin = parseFloat(dmmMatches[1][2]), lngDir = dmmMatches[1][3] || 'E';
        let lat = latDeg + latMin / 60; if (latDir === 'S') lat = -lat;
        let lng = lngDeg + lngMin / 60; if (lngDir === 'W') lng = -lng;
        return { dd: { lat, lng }, dms: convertDDtoDMS(lat, lng), dmm: convertDDtoDMM(lat, lng) };
    }
    return null;
}

function convertDDtoDMS(lat, lng) {
    const latDir = lat >= 0 ? 'N' : 'S', lngDir = lng >= 0 ? 'E' : 'W';
    const absLat = Math.abs(lat), absLng = Math.abs(lng);
    const latDeg = Math.floor(absLat), latMin = Math.floor((absLat - latDeg) * 60), latSec = ((absLat - latDeg) * 60 - latMin) * 60;
    const lngDeg = Math.floor(absLng), lngMin = Math.floor((absLng - lngDeg) * 60), lngSec = ((absLng - lngDeg) * 60 - lngMin) * 60;
    return { lat: `${latDeg}°${latMin}'${latSec.toFixed(2)}"${latDir}`, lng: `${lngDeg}°${lngMin}'${lngSec.toFixed(2)}"${lngDir}` };
}

function convertDDtoDMM(lat, lng) {
    const latDir = lat >= 0 ? 'N' : 'S', lngDir = lng >= 0 ? 'E' : 'W';
    const absLat = Math.abs(lat), absLng = Math.abs(lng);
    const latDeg = Math.floor(absLat), latMin = (absLat - latDeg) * 60;
    const lngDeg = Math.floor(absLng), lngMin = (absLng - lngDeg) * 60;
    return { lat: `${latDeg}°${latMin.toFixed(6)}'${latDir}`, lng: `${lngDeg}°${lngMin.toFixed(6)}'${lngDir}` };
}

function showLoading() {
    $("#LatLngQuery .btn-primary").prop("disabled", true).append('<span class="spinner-border spinner-border-sm ms-1"></span>');
}
function hideLoading() {
    $("#LatLngQuery .spinner-border").remove();
    $("#LatLngQuery .btn-primary").prop("disabled", false);
}

// 批量处理
function downloadSampleFile() {
    const sampleContent = `深圳市南山区科技园\n22.576118, 114.054606\n北京市朝阳区建国门外大街1号\n39.9042, 116.4074\n上海市黄浦区南京东路100号`;
    const blob = new Blob([sampleContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample_addresses.txt';
    a.click();
    URL.revokeObjectURL(url);
    showToast("示例文件已下载");
}

async function processBatchFile(file) {
    if (!file) { showToast("请选择文件"); return; }
    const reader = new FileReader();
    reader.onload = async (e) => {
        const content = e.target.result;
        const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
        if (lines.length === 0) { showToast("文件为空"); return; }
        showToast(`开始处理 ${lines.length} 条数据...`);
        const results = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            let result = { input: line, output: '', status: '' };
            try {
                if (line.includes(',')) {
                    const parts = line.split(',').map(s => parseFloat(s.trim()));
                    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                        const [lat, lng] = parts;
                        const address = await batchReverseGeocode(lng, lat);
                        result.output = address || '未知位置';
                        result.status = '成功';
                    } else {
                        const coord = await batchGeocode(line);
                        result.output = coord || '未知坐标';
                        result.status = coord ? '成功' : '失败';
                    }
                } else {
                    const coord = await batchGeocode(line);
                    result.output = coord || '未知坐标';
                    result.status = coord ? '成功' : '失败';
                }
            } catch (err) {
                console.error("处理行失败:", line, err);
                result.output = '处理异常';
                result.status = '失败';
            }
            results.push(result);
            if ((i + 1) % 10 === 0) showToast(`已处理 ${i + 1}/${lines.length} 条`);
        }
        const csvHeader = '原始输入,查询结果,状态\n';
        const csvRows = results.map(r => {
            const input = r.input.includes(',') ? `"${r.input}"` : r.input;
            const output = r.output.includes(',') ? `"${r.output}"` : r.output;
            return `${input},${output},${r.status}`;
        }).join('\n');
        const blob = new Blob(['\uFEFF' + csvHeader + csvRows], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'batch_results.csv';
        a.click();
        URL.revokeObjectURL(url);
        showToast(`处理完成，共 ${lines.length} 条，结果已下载`);
    };
    reader.readAsText(file, 'UTF-8');
}

function batchGeocode(address) {
    return new Promise((resolve, reject) => {
        const params = { keyWord: address };
        const ds = encodeURIComponent(JSON.stringify(params));
        const url = `https://api.tianditu.gov.cn/geocoder?ds=${ds}&tk=${tk}`;
        fetch(url).then(res => res.json()).then(data => {
            if (data.status === "0" && data.location) {
                const lng = parseFloat(data.location.lon);
                const lat = parseFloat(data.location.lat);
                resolve(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
            } else resolve(null);
        }).catch(reject);
    });
}

function batchReverseGeocode(lng, lat) {
    return new Promise((resolve, reject) => {
        const params = { lon: lng, lat: lat, ver: 1 };
        const postStr = encodeURIComponent(JSON.stringify(params));
        const url = `https://api.tianditu.gov.cn/geocoder?postStr=${postStr}&type=geocode&tk=${tk}`;
        fetch(url).then(res => res.json()).then(data => {
            if (data.status === "0" && data.result) {
                let address = data.result.formatted_address || data.result.address;
                if (!address && data.result.addressComponent) {
                    const comp = data.result.addressComponent;
                    address = [comp.nation, comp.province, comp.city, comp.county, comp.town, comp.poi].filter(Boolean).join(' ');
                }
                resolve(address || null);
            } else resolve(null);
        }).catch(reject);
    });
}

$(document).ready(function () {
    if (typeof T === 'undefined') {
        var script = document.createElement('script');
        script.src = 'https://api.tianditu.gov.cn/api?v=4.0&tk=' + tk;
        script.onload = function () { if (!$('#LatLngQuery').hasClass('hide')) initLatLngMap(); };
        document.head.appendChild(script);
    } else {
        if (!$('#LatLngQuery').hasClass('hide')) initLatLngMap();
    }
    $('[menu-type="LatLngQuery"]').on('click', function () {
        setTimeout(function () {
            if (typeof T !== 'undefined') initLatLngMap();
            else {
                var checkInterval = setInterval(function () {
                    if (typeof T !== 'undefined') { clearInterval(checkInterval); initLatLngMap(); }
                }, 100);
            }
        }, 100);
    });
    $("#geocode-btn").click(function () { var address = $("#address-input").val(); address ? geocode(address) : showToast("请输入地址"); });
    $("#reverse-geocode-btn").click(function () {
        var coord = $("#coordinate-input").val();
        if (!coord) { showToast("请输入经纬度坐标"); return; }
        var result = convertCoordinateFormat(coord);
        if (result) { moveMapToLocation(result.dd.lng, result.dd.lat); reverseGeocode(result.dd.lng, result.dd.lat); }
        else showToast("无法识别坐标格式，请检查输入");
    });
    $("#convert-btn").click(function () {
        var input = $("#convert-input").val();
        if (!input) { showToast("请输入坐标"); return; }
        var result = convertCoordinateFormat(input);
        if (result) {
            $("#result-dd").text(result.dd.lat.toFixed(6) + ", " + result.dd.lng.toFixed(6));
            $("#result-dms").text(result.dms.lat + ", " + result.dms.lng);
            $("#result-dmm").text(result.dmm.lat + ", " + result.dmm.lng);
            moveMapToLocation(result.dd.lng, result.dd.lat);
            showToast("坐标转换成功！");
        } else showToast("无法识别坐标格式，请检查输入");
    });
    $("#copy-coordinate").click(function () {
        var coord = $("#geocode-result").text();
        var $temp = $("<input>");
        $("body").append($temp);
        $temp.val(coord).select();
        document.execCommand("copy");
        $temp.remove();
        showToast("坐标已复制");
        $(this).html('<i class="fas fa-check"></i> 已复制');
        setTimeout(() => $(this).html('<i class="fas fa-copy"></i> 复制'), 2000);
    });
    $("#locate-btn").click(function () {
        if (!navigator.geolocation) {
            showToast("浏览器不支持定位");
            return;
        }
        showToast("正在获取位置...");
        navigator.geolocation.getCurrentPosition(function (pos) {
            var lat = pos.coords.latitude;
            var lng = pos.coords.longitude;
            moveMapToLocation(lng, lat);
            updateCoordinateDisplay(lng, lat);
            reverseGeocode(lng, lat);
            showToast("已定位到当前位置");
        }, function (err) {
            showToast("定位失败: " + err.message);
        }, { enableHighAccuracy: true, timeout: 10000 });
    });
    $("#download-sample-btn").click(downloadSampleFile);
    $("#upload-btn").click(function () {
        const fileInput = document.getElementById('batch-file');
        if (fileInput.files.length === 0) { showToast("请先选择文件"); return; }
        processBatchFile(fileInput.files[0]);
    });
});