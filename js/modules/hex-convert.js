// js/modules/hex-convert.js
// 十六进制/ASCII 转换工具（原 HexParse 相关功能）

$(document).ready(function () {
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
            $('#output_value').val(result);
        } catch (e) {
            $('#output_value').val(`转换错误: ${e.message}`);
        }
    }

    function initHexConversion() {
        $('#input_value').off('input').on('input', handleRealTimeConversion);
        $('input[name="input_"]').off('change').on('change', handleRealTimeConversion);
        $('input[name="output_"]').off('change').on('change', handleRealTimeConversion);
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
        $("#input_value").val("");
        $("#output_value").val("");
    });
    $('[name="output_"]').click(function () {
        $("#output_num").val($(this).val());
        convertRadix(1);
    });
    $("#input_num").change(function () {
        $("input[name='input_']").removeAttr("checked");
        var a = $(this).val();
        $("input[name='input_'][value=" + a + "]").attr("checked", "checked");
        $("#input_value").val("");
        $("#output_value").val("");
    });
    $("#output_num").change(function () {
        $("input[name='output_']").removeAttr("checked");
        var a = $(this).val();
        $("input[name='output_'][value=" + a + "]").attr("checked", "checked");
        convertRadix(1);
    });

    $("#HexToolsDemo").on("click", function () {
        $("#input_value").val("255");
        convertRadix(1);
    });
    $("#HexToolsClear").on("click", function () {
        $("#input_value").val("");
        $("#output_value").val("");
    });
});