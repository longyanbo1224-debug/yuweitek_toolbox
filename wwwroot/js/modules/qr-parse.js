// js/modules/qr-parse.js
// 二维码解析工具 - 支持图片识别和文本解析

$(document).ready(function () {
    if ($("#QrParseTool").length === 0) return;

    const $qrArea = $("#qrInputArea");
    const $parseBtn = $("#qrParseBtn");
    const $clearBtn = $("#qrClearBtn");
    const $selectBtn = $("#qrSelectFileBtn");
    const $fileInput = $("#qrFileInput");
    const $result = $("#qrResult");

    let qrCodeData = "";

    // 粘贴事件 - 检测图片粘贴
    $qrArea.on("paste", function (e) {
        const items = e.originalEvent.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf("image") !== -1) {
                e.preventDefault();
                const blob = items[i].getAsFile();
                const reader = new FileReader();
                reader.onload = function (event) {
                    const img = new Image();
                    img.onload = function () {
                        const canvas = document.createElement("canvas");
                        const ctx = canvas.getContext("2d");
                        const targetSize = 800;
                        const scale = targetSize / Math.min(img.width, img.height);
                        canvas.width = img.width * scale;
                        canvas.height = img.height * scale;
                        ctx.imageSmoothingEnabled = true;
                        ctx.imageSmoothingQuality = "high";
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                        const resizedImg = document.createElement("img");
                        resizedImg.src = canvas.toDataURL("image/jpeg", 1.0);
                        resizedImg.style.cssText = "max-width:100%;height:auto;display:block;margin:0 auto;";
                        $qrArea.empty().append(resizedImg);
                        decodeQrFromBlob(blob);
                    };
                    img.src = event.target.result;
                };
                reader.readAsDataURL(blob);
                return;
            }
        }
        // 无图片时替换全部文本内容
        e.preventDefault();
        const text = e.originalEvent.clipboardData.getData("text");
        $qrArea.text(text);
    });

    // 处理图片解码
    function decodeQrFromBlob(file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const img = new Image();
            img.onload = function () {
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");
                const targetSize = 800;
                const scale = targetSize / Math.min(img.width, img.height);
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = "high";
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

                try {
                    if (typeof jsQR === "undefined") {
                        showError("jsQR 库未能正确加载，请刷新页面重试");
                        return;
                    }
                    const code = jsQR(imageData.data, imageData.width, imageData.height);
                    if (code) {
                        qrCodeData = code.data;
                        parseAndDisplay(qrCodeData);
                    } else {
                        showError("未能识别二维码<br><br><span style='color:#3498db;'>💡 提示：您可以使用微信扫码复制内容后粘贴到此工具进行解析</span>");
                    }
                } catch (err) {
                    showError("解析错误: " + err.message);
                    console.error("QR码解析错误:", err);
                }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    // 文本解析按钮
    $parseBtn.click(function () {
        const input = $qrArea.text().trim();
        if (input) {
            qrCodeData = input;
            parseAndDisplay(qrCodeData);
        } else {
            $result.html('<div class="alert alert-warning">请粘贴二维码图片或文本内容后再解析。</div>');
        }
    });

    // 清空按钮
    $clearBtn.click(function () {
        $qrArea.empty();
        $result.html("");
        qrCodeData = "";
    });

    // 选择图片按钮
    $selectBtn.click(function () {
        $fileInput.click();
    });

    $fileInput.change(function () {
        if (this.files && this.files[0]) {
            const reader = new FileReader();
            reader.onload = function (e) {
                const img = new Image();
                img.onload = function () {
                    const canvas = document.createElement("canvas");
                    const ctx = canvas.getContext("2d");
                    const targetSize = 800;
                    const scale = targetSize / Math.min(img.width, img.height);
                    canvas.width = img.width * scale;
                    canvas.height = img.height * scale;
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = "high";
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    const resizedImg = document.createElement("img");
                    resizedImg.src = canvas.toDataURL("image/jpeg", 1.0);
                    resizedImg.style.cssText = "max-width:100%;height:auto;display:block;margin:0 auto;";
                    $qrArea.empty().append(resizedImg);
                    decodeQrFromBlob($fileInput[0].files[0]);
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(this.files[0]);
        }
    });

    function showError(msg) {
        $result.html('<div class="alert alert-info">' + msg + "</div>");
    }

    function formatDate(dateString) {
        if (dateString.length === 8) {
            return dateString.slice(0, 4) + "年" + dateString.slice(4, 6) + "月" + dateString.slice(6, 8) + "日";
        } else if (dateString.length === 6) {
            return "20" + dateString.slice(0, 2) + "年" + dateString.slice(2, 4) + "月" + dateString.slice(4, 6) + "日";
        }
        return dateString;
    }

    function parseAndDisplay(data) {
        const result = {};
        result.originalData = data;

        if (data.startsWith("http")) {
            // 规则2：http开头
            const equalIndex = data.indexOf("=");
            if (equalIndex !== -1) {
                const relevantData = data.slice(equalIndex + 1);
                result.selfDeclaredModel = relevantData.slice(0, 5);
                let terminalId = relevantData.slice(5, 13);
                if (!["10", "20", "30"].includes(terminalId.slice(0, 2))) {
                    terminalId = "10" + terminalId;
                }
                result.terminalId = terminalId;
            }
        } else {
            // 规则1：非http开头
            result.cccCode = data.slice(0, 7);

            const validModels = ["K7-G4", "K5P", "K5-T", "K8", "K4", "K5-P"];
            let modelEndIndex = 7;
            let foundValidModel = false;

            for (const model of validModels) {
                if (data.slice(7).startsWith(model)) {
                    result.deviceModel = model;
                    modelEndIndex = 7 + model.length;
                    foundValidModel = true;
                    break;
                }
            }

            if (!foundValidModel) {
                const twoByteModel = data.slice(7, 9);
                if (twoByteModel.match(/^[A-Z0-9]{2}$/)) {
                    result.deviceModel = twoByteModel;
                    modelEndIndex = 9;
                } else {
                    result.deviceModel = data.slice(7, 10);
                    modelEndIndex = 10;
                }
            }

            const dateLength = result.deviceModel.length <= 3 ? 6 : 8;
            result.productionDate = data.slice(modelEndIndex, modelEndIndex + dateLength);

            const remainingData = data.slice(modelEndIndex + dateLength);
            if (remainingData.length > 10) {
                result.terminalId = remainingData.slice(0, 8);
                result.selfDeclaredModel = remainingData.slice(8);
            } else {
                result.terminalId = remainingData;
            }

            if (result.selfDeclaredModel) {
                if (!["10", "20", "30"].includes(result.terminalId.slice(0, 2))) {
                    result.terminalId = "10" + result.terminalId;
                }
            }
        }

        // 构建结果表格
        let html = '<div class="table-responsive"><table class="table table-bordered table-striped"><thead><tr><th>项目</th><th>值</th></tr></thead><tbody>';
        html += "<tr><td><strong>原始数据</strong></td><td>" + escapeHtml(result.originalData) + "</td></tr>";
        if (result.cccCode) html += "<tr><td><strong>CCC代码</strong></td><td>" + escapeHtml(result.cccCode) + "</td></tr>";
        if (result.deviceModel) html += "<tr><td><strong>设备型号</strong></td><td>" + escapeHtml(result.deviceModel) + "</td></tr>";
        if (result.productionDate) html += "<tr><td><strong>生产日期</strong></td><td>" + formatDate(result.productionDate) + "</td></tr>";
        if (result.terminalId) html += "<tr><td><strong>终端ID</strong></td><td>" + escapeHtml(result.terminalId) + "</td></tr>";
        if (result.selfDeclaredModel) {
            if (result.selfDeclaredModel.startsWith("YW")) {
                html += "<tr><td><strong>终端厂家</strong></td><td>深圳有为</td></tr>";
                html += "<tr><td><strong>自我声明型号</strong></td><td>" + escapeHtml(result.selfDeclaredModel.slice(2)) + "</td></tr>";
            } else {
                html += "<tr><td><strong>终端厂家</strong></td><td>未知厂家</td></tr>";
                html += "<tr><td><strong>自我声明型号</strong></td><td>" + escapeHtml(result.selfDeclaredModel) + "</td></tr>";
            }
        }
        html += "</tbody></table></div>";

        // 复制按钮
        html += '<button class="btn btn-sm btn-outline-secondary mt-2" id="qrCopyResult"><i class="bi bi-clipboard"></i> 复制原始数据</button>';

        $result.html(html);

        $("#qrCopyResult").click(function () {
            if (qrCodeData) {
                navigator.clipboard.writeText(qrCodeData).then(function () {
                    const $btn = $("#qrCopyResult");
                    $btn.html('<i class="bi bi-check-lg"></i> 已复制!');
                    setTimeout(function () { $btn.html('<i class="bi bi-clipboard"></i> 复制原始数据'); }, 1500);
                }).catch(function () {
                    alert("复制失败，请手动复制");
                });
            }
        });
    }

    function escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }
});
