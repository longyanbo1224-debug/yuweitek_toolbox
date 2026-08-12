// js/modules/jt-parse.js
// 交通协议解析（JT808/JT809/JT1078/JT19056/JT905/JTSB）

$(document).ready(function () {
    // 示例数据
    const JT808HexData = "7E 02 00 00 26 12 34 56 78 90 12 00 7D 02 00 00 00 01 00 00 00 02 00 BA 7F 0E 07 E4 F1 1C 00 28 00 3C 00 00 18 10 15 10 10 10 01 04 00 00 00 64 02 02 00 7D 01 13 7E";
    const JT8082013ForceHexData = "7e0102400c01003000068109024a3130303330303030363831857e";
    const JT808JT1078HexData = "7E120523A204066657506200EB00020001015A00000023012012191042052012191050190000000000000000000101064446D10120121910221720121910420500000000000000000001010F1FE8EB0120121910023420121910221700000000000000000001010F182D5C0120121909471120121910015500000000000000000001010B38F2430120121909274020121909471100000000000000000001010F056DB40120121909080920121909274000000000000000000001010F0724380120121908483820121909080900000000000000000001010F0530AB0120121908290720121908483800000000000000000001010F05896C0120121908093720121908290700000000000000000001010F02CD3B0120121907500520121908093700000000000000000001010F056FEF0120121907303420121907500500000000000000000001010F043C3401201219072541201219073034000000000000000000010103C26C5F0120121907061120121907254100000000000000000001010F03F0C10120121906464220121907061100000000000000000001010F02F6330120121906271220121906464200000000000000000001010F02E43B0120121906074220121906271200000000000000000001010F033D670120121905481120121906074200000000000000000001010F088BF20120121905284120121905481100000000000000000001010F03F9FE0120121905091020121905284100000000000000000001010F05B1040120121904494020121905091000000000000000000001010F02B3540120121904301020121904494000000000000000000001010F0417B00120121904103920121904301000000000000000000001010F0538970120121903510820121904103900000000000000000001010F054E9E0120121903313820121903510800000000000000000001010F016ECB0120121903120820121903313800000000000000000001010F0333C00120121902523820121903120700000000000000000001010F029D230120121902330720121902523700000000000000000001010F0354E40120121902133720121902330700000000000000000001010F03303D0120121901540720121902133700000000000000000001010F04981E0120121901343720121901540700000000000000000001010F02AD940120121901150820121901343700000000000000000001010EFFD7CF0120121900553720121901150800000000000000000001010F07D9330120121900360720121900553700000000000000000001010F040E740C7E\n7E1205203804066657506200EC000200020120121900163320121900360700000000000000000001010F0CE4CD0120121900002220121900163300000000000000000001010C6F9E7B5D7E";
    const JT808YueBiaoHexData = "7E0200405C01000000000012345678913CC400000000008C0003015198CF06C158C5000801F200E52203151206110104000716E30302000014040000000015040000000016040000000017020000180300000025040000000030011F310117EF0D49249200000049249011000003DE7E\n7E0200405C01000000000012345678913CC400000000008C0003015198CF06C158C5000801F200E52203151206110104000716E30302000014040000000015040000000016040000000017020000180300000025040000000030011F310117EF0D49249200000049249011000003DE7E";
    const JT808GPS51HexData = "7e020000470412106280030233000000000000200201d365df072f15d500280000002d21091719155801040002a10f2a0200042b049203a46f520103eb06000100ce0a5730011b31010951080000000000000000ca7e";
    const JT19056UpHexData = "55 7A C4 00 00 00 EB";
    const JT19056DownHexData = "55 7A C4 00 14 00 20 03 25 10 26 01 20 03 25 10 26 01 00 00 12 34 00 12 34 56 A9";
    const JT905HexData = "7E02000023103456789012007D02000000010000000200BA7F0E07E4F11C003C002110152110100104000000640202007D01347E";
    const JTSBHexData = "30 31 63 64 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 61 6C 61 72 6D 2E 78 6C 73 78 00 00 00 01 00 00 00 05 01 02 03 04 05";
    const JT1078HexData = "30 31 63 64 81 E2 10 88 01 12 34 56 78 10 01 10 00 00 01 6B B3 92 CA 7C 02 80 00 28 00 2E 00 00 00 01 61 E1 A2 BF 00 98 CF C0 EE 1E 17 28 34 07 78 8E 39 A4 03 FD DB D1 D5 46 BF B0 63 01 3F 59 AC 34 C9 7A 02 1A B9 6A 28 A4 2C 08";
    const JT809HexData2011 = "5B 00 00 00 92 00 00 06 82 94 00 01 33 EF B8 01 00 00 00 00 00 27 0F D4 C1 41 31 32 33 34 35 00 00 00 00 00 00 00 00 00 00 00 00 00 02 94 01 00 00 00 5C 01 00 02 00 00 00 00 5A 01 AC 3F 40 12 3F FA A1 00 00 00 00 5A 01 AC 4D 50 03 73 6D 61 6C 6C 63 68 69 00 00 00 00 00 00 00 00 31 32 33 34 35 36 37 38 39 30 31 00 00 00 00 00 00 00 00 00 31 32 33 34 35 36 40 71 71 2E 63 6F 6D 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 BA D8 5D";
    const JT809HexData2019 = "5B 00 00 00 C9 00 00 06 82 17 00 01 34 15 F4 01 00 00 00 00 00 27 0F 00 00 00 00 5E 02 A5 07 B8 D4 C1 41 31 32 33 34 35 00 00 00 00 00 00 00 00 00 00 00 00 00 02 17 01 00 00 00 8B 01 02 03 04 05 06 07 08 09 10 11 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 E7 D3 5D";

    // 初始化示例数据
    $("#JT808_Hex").val(JT808HexData);
    $("#JT809_Hex").val(JT809HexData2011);
    $("#JT19056_Hex").val(JT19056UpHexData);
    $("#JT905_Hex").val(JT905HexData);
    $("#JTSB_Hex").val(JTSBHexData);
    $("#JT1078_Hex").val(JT1078HexData);

    // 协议类型变更
    $("#JT808_ProtocolType").on("change", function () {
        var protocolType = $(this).val();
        var hexData = JT808HexData;
        if (protocolType == "JT808_JT1078") hexData = JT808JT1078HexData;
        else if (protocolType == "JT808_YueBiao") hexData = JT808YueBiaoHexData;
        else if (protocolType == "JT2013Force") hexData = JT8082013ForceHexData;
        else if (protocolType == "JT808_GPS51") hexData = JT808GPS51HexData;
        $("#JT808_Hex").val(hexData);
        $("#JT808_Hex").autoHeight();
    });
    $("#JT809_ProtocolType").on("change", function () {
        var selectedValue = $(this).val();
        if (selectedValue == "2011") $("#JT809_Hex").val(JT809HexData2011);
        else $("#JT809_Hex").val(JT809HexData2019);
        $("#JT809_Result").text("");
    });
    $("#JT809_EncryptType").on("change", function () {
        if ($(this).val() == "none") $("#JT809_Encrypt_Group").fadeOut();
        else $("#JT809_Encrypt_Group").fadeIn();
    });
    $("#JT19056_ProtocolType").on("change", function () {
        var selectedValue = $(this).val();
        if (selectedValue == "up") $("#JT19056_Hex").val(JT19056UpHexData);
        else $("#JT19056_Hex").val(JT19056DownHexData);
        $("#JT19056_Result").text("");
    });

    // 滚动时隐藏浮动标签，避免遮挡文字
    $("#JT808Parse .form-floating textarea").on("scroll", function () {
        var label = $(this).siblings("label");
        if (this.scrollTop > 5) {
            label.css("opacity", "0");
        } else {
            label.css("opacity", "1");
        }
    });

    // ========== 原始日志模式 ==========
    function setupRawLogMode(toolId, hexId) {
        var toggle = $("#" + toolId + "_RawLogMode");
        var options = $("#" + toolId + "_RawLogOptions");
        var wrapper = $("#" + toolId + "_ExtractResult_Wrapper");
        var extractArea = $("#" + toolId + "_ExtractResult");

        toggle.on("change", function () {
            if ($(this).is(":checked")) {
                options.slideDown(200);
                wrapper.slideDown(200);
                // 触发提取（如果已有数据）
                setTimeout(function () { $("#" + hexId).trigger("input"); }, 250);
            } else {
                options.slideUp(200);
                wrapper.slideUp(200);
                extractArea.val("");
            }
        });

        // 实时预览：输入变化时自动提取
        var debounceTimer = null;
        $("#" + hexId).on("input", function () {
            if (!toggle.is(":checked")) return;
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(function () {
                var input = $("#" + hexId).val();
                var format = $("#" + toolId + "_PacketFormat").val();
                var extracted = "";
                if (format === "remote-monitor") {
                    extracted = extractRemoteMonitorData(input);
                } else if (format === "7E") {
                    extracted = extract7EPackets(input);
                    if (!extracted) extracted = extract2323Data(input);
                } else {
                    extracted = extract2323Data(input);
                    if (!extracted) extracted = extract7EPackets(input);
                }
                if (extracted) {
                    extractArea.val(extracted);
                    extractArea.removeClass("text-danger");
                } else {
                    extractArea.val("⚠️ 未找到有效数据包，请检查原始日志格式或切换格式");
                    extractArea.addClass("text-danger");
                }
            }, 300);
        });

        // 格式切换时重新提取
        $("#" + toolId + "_PacketFormat").on("change", function () {
            if (toggle.is(":checked")) {
                $("#" + hexId).trigger("input");
            }
        });
    }

    setupRawLogMode("JT808", "JT808_Hex");
    setupRawLogMode("JT809", "JT809_Hex");
    setupRawLogMode("JT1078", "JT1078_Hex");
    setupRawLogMode("JT19056", "JT19056_Hex");
    setupRawLogMode("JT905", "JT905_Hex");
    setupRawLogMode("JTSB", "JTSB_Hex");

    // 获取解析用的Hex值（原始日志模式下用提取结果，否则用原始输入）
    function getHexForParse(toolId, hexId) {
        if ($("#" + toolId + "_RawLogMode").is(":checked")) {
            var extracted = $("#" + toolId + "_ExtractResult").val();
            if (extracted && !extracted.startsWith("⚠️")) {
                return extracted;
            }
            return null; // 提取失败
        }
        return $("#" + hexId).val();
    }

    // JT808 解析
    $("#JT808_Parse").on("click", function () {
        var hex = getHexForParse("JT808", "JT808_Hex");
        if (hex === null) { alert("原始日志提取失败，请检查输入数据或切换格式"); return; }
        axios.post("/jtt/JT808/Analyze", {
            Hex: hex,
            ProtocolType: $("#JT808_ProtocolType").val()
        }).then((res) => {
            if (res.data.Code == 200) {
                $('#JT808_Accordion_Result').html("");
                if (res.data.Result.Packages) {
                    if (res.data.Result.IsSubpackage) {
                        $.each(res.data.Result.Packages, function (index, item) {
                            var accordionHeader_content = '';
                            accordionHeader_content += '<span class="badge text-bg-primary">终端号：' + item.TerminalPhoneNo + '</span>';
                            accordionHeader_content += '<span class="badge text-bg-secondary">消息Id：' + item.MsgId + '</span>';
                            accordionHeader_content += '<span class="badge text-bg-success">消息流水号：' + item.MsgNum + '</span>';
                            accordionHeader_content += '<span class="badge text-bg-danger">设备版本号：' + item.ProtocolVersion + '</span>';
                            accordionHeader_content += '<span class="badge text-bg-warning">总分包数：' + item.PackgeCount + '</span>';
                            accordionHeader_content += '<span class="badge text-bg-info">当前页：' + item.PackageIndex + '</span>';
                            accordionHeader_content += '<span class="badge text-bg-dark">数据体长度：' + item.DataLength + '</span>';
                            accordionHeader_content += '<span class="badge text-bg-light">是否加密：' + (item.Encrypt ? '是' : '否') + '</span>';
                            var accordionHeader = '<h2 class="accordion-header"><button class="accordion-button" type="button" data-bs-target="#collapse' + index + '" aria-expanded="false" aria-controls="collapse' + index + '">' + '序号:' + item.Order + accordionHeader_content + '</button></h2>';
                            var accordionBody = '<div id="collapse' + index + '" class="accordion-collapse collapse"><div class="accordion-body"><pre>' + item.Body + '</pre></div></div>';
                            var accordionItem = '<div class="accordion-item">' + accordionHeader + accordionBody + '</div>';
                            $('#JT808_Accordion_Result').append(accordionItem);
                        });
                        var index = res.data.Result.Packages.length + 1;
                        var accordionHeader = '<h2 class="accordion-header"><button class="accordion-button" type="button" data-bs-target="#collapse' + index + '" aria-expanded="false" aria-controls="collapse' + index + '">合并数据体</button></h2>';
                        var accordionBody = '<div id="collapse' + index + '" class="accordion-collapse collapse"><div class="accordion-body"><pre>' + res.data.Result.JsonValue + '</pre></div></div>';
                        var accordionItem = '<div class="accordion-item">' + accordionHeader + accordionBody + '</div>';
                        $('#JT808_Accordion_Result').append(accordionItem);
                    } else {
                        $.each(res.data.Result.Packages, function (index, item) {
                            if (item.PackgeCount > 0) {
                                var accordionHeader_content = '';
                                accordionHeader_content += '<span class="badge text-bg-primary">终端号：' + item.TerminalPhoneNo + '</span>';
                                accordionHeader_content += '<span class="badge text-bg-secondary">消息Id：' + item.MsgId + '</span>';
                                accordionHeader_content += '<span class="badge text-bg-success">消息流水号：' + item.MsgNum + '</span>';
                                accordionHeader_content += '<span class="badge text-bg-danger">设备版本号：' + item.ProtocolVersion + '</span>';
                                accordionHeader_content += '<span class="badge text-bg-warning">总分包数：' + item.PackgeCount + '</span>';
                                accordionHeader_content += '<span class="badge text-bg-info">当前页：' + item.PackageIndex + '</span>';
                                accordionHeader_content += '<span class="badge text-bg-dark">数据体长度：' + item.DataLength + '</span>';
                                accordionHeader_content += '<span class="badge text-bg-light">是否加密：' + (item.Encrypt ? '是' : '否') + '</span>';
                                var accordionHeader = '<h2 class="accordion-header"><button class="accordion-button" type="button" data-bs-target="#collapse' + index + '" aria-expanded="false" aria-controls="collapse' + index + '">' + '序号:' + item.Order + accordionHeader_content + '</button></h2>';
                                var accordionBody = '<div id="collapse' + index + '" class="accordion-collapse collapse"><div class="accordion-body"><pre>' + item.Body + '</pre></div></div>';
                                var accordionItem = '<div class="accordion-item">' + accordionHeader + accordionBody + '</div>';
                                $('#JT808_Accordion_Result').append(accordionItem);
                            } else {
                                var accordionHeader = '<h2 class="accordion-header"><button class="accordion-button" type="button" data-bs-target="#collapse' + index + '" aria-expanded="false" aria-controls="collapse' + index + '">' + '序号:' + item.Order + '</button></h2>';
                                var accordionBody = '<div id="collapse' + index + '" class="accordion-collapse collapse"><div class="accordion-body"><pre>' + item.JsonValue + '</pre></div></div>';
                                var accordionItem = '<div class="accordion-item">' + accordionHeader + accordionBody + '</div>';
                                $('#JT808_Accordion_Result').append(accordionItem);
                            }
                        });
                    }
                    $('#JT808_Accordion_Result div.accordion-collapse').addClass('show');
                } else {
                    $('#JT808_Accordion_Result').html("处理异常，请检测对应Hex数据包");
                }
            } else {
                $("#JT808_Accordion_Result").html(res.data.Message);
            }
        });
    });

    // JT809 解析
    $("#JT809_Parse").on("click", function () {
        var hex = getHexForParse("JT809", "JT809_Hex");
        if (hex === null) { alert("原始日志提取失败，请检查输入数据或切换格式"); return; }
        axios.post("/jtt/JT809/Analyze", {
            Hex: hex,
            ProtocolType: $("#JT809_ProtocolType").val(),
            IsEncrypt: $("#JT809_EncryptType").val() != "none",
            M1: parseInt($("#JT809_M1_Value").val()),
            IA1: parseInt($("#JT809_IA1_Value").val()),
            IC1: parseInt($("#JT809_IC1_Value").val())
        }).then((res) => {
            if (res.data.Code == 200) $("#JT809_Result").text(res.data.Result.JsonValue);
            else $("#JT809_Result").text(res.data.Message);
        });
    });

    // JT19056 解析
    $("#JT19056_Parse").on("click", function () {
        var hex = getHexForParse("JT19056", "JT19056_Hex");
        if (hex === null) { alert("原始日志提取失败，请检查输入数据或切换格式"); return; }
axios.post("/jtt/JT19056/Analyze", {
            Hex: hex,
            ProtocolType: $("#JT19056_ProtocolType").val()
        }).then((res) => {
            if (res.data.Code == 200) $("#JT19056_Result").text(res.data.Result.JsonValue);
            else $("#JT19056_Result").text(res.data.Message);
        });
    });

    // JT905 解析
    $("#JT905_Parse").on("click", function () {
        var hex = getHexForParse("JT905", "JT905_Hex");
        if (hex === null) { alert("原始日志提取失败，请检查输入数据或切换格式"); return; }
axios.post("/jtt/JT905/Analyze", {
            Hex: hex
        }).then((res) => {
            if (res.data.Code == 200) $("#JT905_Result").text(res.data.Result.JsonValue);
            else $("#JT905_Result").text(res.data.Message);
        });
    });

    // 主动安全解析
    $("#JTSB_Parse").on("click", function () {
        var hex = getHexForParse("JTSB", "JTSB_Hex");
        if (hex === null) { alert("原始日志提取失败，请检查输入数据或切换格式"); return; }
        axios.post("/jtt/JTActiveSafety/Analyze", {
            Hex: hex
        }).then((res) => {
            if (res.data.Code == 200) $("#JTSB_Result").text(res.data.Result.JsonValue);
            else $("#JTSB_Result").text(res.data.Message);
        });
    });

    // JT1078 解析
    $("#JT1078_Parse").on("click", function () {
        var hex = getHexForParse("JT1078", "JT1078_Hex");
        if (hex === null) { alert("原始日志提取失败，请检查输入数据或切换格式"); return; }
axios.post("/jtt/JT1078/Analyze", {
            Hex: hex
        }).then((res) => {
            if (res.data.Code == 200) $("#JT1078_Result").text(res.data.Result.JsonValue);
            else $("#JT1078_Result").text(res.data.Message);
        });
    });

    // ========== AI 智能解析（JT808_Diagnose） ==========
    $("#JT808_Diagnose").off("click").on("click", function (e) {
        e.preventDefault();
        const hex = getHexForParse("JT808", "JT808_Hex") || "";
        const protocol = $("#JT808_ProtocolType").val();
        if (!hex.trim()) {
            alert("请输入要解析的数据");
            return;
        }

        let abortController = null;
        let isCompleted = false;
        let timeoutId = null;

        $("#JT808_Accordion_Result").html(`
        <div class="d-flex flex-column align-items-center justify-content-center" style="min-height: 200px;">
            <div class="spinner-border text-primary mb-2" role="status">
                <span class="visually-hidden">加载中...</span>
            </div>
            <div class="mb-2">AI 正在解析数据，请稍候...</div>
            <button class="btn btn-sm btn-outline-secondary" id="cancelParseBtn">取消</button>
        </div>
        `);

        $(document).off("click", "#cancelParseBtn").on("click", "#cancelParseBtn", function () {
            if (abortController && !isCompleted) {
                abortController.abort();
                isCompleted = true;
                if (timeoutId) clearTimeout(timeoutId);
                $("#JT808_Accordion_Result").html(`
                <div class="alert alert-info text-center" role="alert">
                    <i class="fas fa-ban me-2"></i> 用户已取消请求<br>
                    <button class="btn btn-sm btn-outline-primary mt-2" id="retryParseBtn">重新解析</button>
                </div>
                `);
                $("#retryParseBtn").off("click").on("click", function () { $("#JT808_Diagnose").click(); });
            }
        });

        function handleTimeout() {
            if (isCompleted) return;
            if (abortController) abortController.abort();
            isCompleted = true;
            $("#JT808_Accordion_Result").html(`
            <div class="alert alert-warning text-center" role="alert">
                <i class="fas fa-clock me-2"></i> AI 响应超时（超过180秒）<br>
                <button class="btn btn-sm btn-outline-primary mt-2" id="parseRetryBtn">重新解析</button>
            </div>
            `);
            $("#parseRetryBtn").off("click").on("click", function () { $("#JT808_Diagnose").click(); });
        }

        timeoutId = setTimeout(handleTimeout, 185000);
        abortController = new AbortController();

        apiFetch("/api/ai/parse", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ hex, protocol }),
            signal: abortController.signal
        })
        .then(res => res.json())
        .then(data => {
            clearTimeout(timeoutId);
            if (isCompleted) return;
            isCompleted = true;
            if (data.success) {
                $("#JT808_Accordion_Result").html(`
                <div class="alert alert-info">
                    <h5>🔍 智能解析</h5>
                    <pre style="white-space: pre-wrap;">${escapeHtml(data.answer)}</pre>
                </div>
                `);
            } else {
                $("#JT808_Accordion_Result").html(`<div class="alert alert-danger">${escapeHtml(data.error || "解析失败")}</div>`);
            }
        })
        .catch(err => {
            clearTimeout(timeoutId);
            if (isCompleted) return;
            isCompleted = true;
            if (err.name === 'AbortError') return;
            $("#JT808_Accordion_Result").html(`<div class="alert alert-danger">请求失败：${escapeHtml(err.message)}</div>`);
        });
    });
});