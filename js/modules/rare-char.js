// js/modules/rare-char.js
// 生僻字指令生成器

$(document).ready(function () {
    if ($("#RareCharTool").length === 0) return;

    const $input = $("#rareCharInput");
    const $generateBtn = $("#generateRareBtn");
    const $cmd1 = $("#cmdRare1");
    const $cmd2 = $("#cmdRare2");
    const $cmd3 = $("#cmdRare3");

    $(".copy-rare-btn").click(function () {
        const targetId = $(this).data("target");
        const textarea = $("#" + targetId);
        if (textarea.length && textarea.val()) {
            textarea.select();
            document.execCommand("copy");
            const $btn = $(this);
            const originalText = $btn.text();
            $btn.text("已复制!");
            setTimeout(() => $btn.text(originalText), 1500);
        }
    });

    function generateDotMatrix(char, size) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = '#000000';
        ctx.imageSmoothingEnabled = false;
        ctx.font = `bold ${size}px "SimSun", "宋体", "NSimSun"`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(char, 0, 0);
        const imageData = ctx.getImageData(0, 0, size, size);
        const data = imageData.data;
        const matrix = Array(size).fill().map(() => Array(size).fill(0));
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const index = (y * size + x) * 4;
                const r = data[index], g = data[index + 1], b = data[index + 2];
                const grayscale = 0.299 * r + 0.587 * g + 0.114 * b;
                if (grayscale < 128) matrix[y][x] = 1;
            }
        }
        return matrix;
    }

    function process16x16(matrix) {
        const bytes = new Array(32);
        for (let x = 0; x < 16; x++) {
            let byte = 0;
            for (let y = 0; y < 8; y++) if (matrix[y][x]) byte |= (1 << y);
            bytes[x] = byte;
        }
        for (let x = 0; x < 16; x++) {
            let byte = 0;
            for (let y = 8; y < 16; y++) if (matrix[y][x]) byte |= (1 << (y - 8));
            bytes[16 + x] = byte;
        }
        return bytes;
    }

    function process24x24(matrix) {
        const bytes = [];
        for (let y = 0; y < 24; y++) {
            for (let part = 0; part < 3; part++) {
                let byte = 0;
                for (let i = 0; i < 8; i++) {
                    const x = part * 8 + i;
                    if (x < 24 && matrix[y][x]) byte |= (1 << (7 - i));
                }
                bytes.push(byte);
            }
        }
        return bytes;
    }

    function formatBytes(bytes) {
        return bytes.map(byte => '0x' + byte.toString(16).toUpperCase().padStart(2, '0')).join(',') + ',';
    }

    function generateCommands(char) {
        const matrix16 = generateDotMatrix(char, 16);
        const bytes16 = process16x16(matrix16);
        const matrix24 = generateDotMatrix(char, 24);
        const bytesArr24 = process24x24(matrix24);
        const cmd1Str = `*#443*0*${char}*0*${formatBytes(bytes16)}#`;
        const cmd2Str = `*#443*1*${char}*0*${formatBytes(bytesArr24.slice(0, 36))}#`;
        const cmd3Str = `*#443*2*${char}*0*${formatBytes(bytesArr24.slice(36))}#`;
        return [cmd1Str, cmd2Str, cmd3Str];
    }

    $generateBtn.click(function () {
        const char = $input.val().trim();
        if (!char) { alert("请输入一个汉字"); return; }
        $cmd1.val("正在生成...");
        $cmd2.val("正在生成...");
        $cmd3.val("正在生成...");
        setTimeout(() => {
            try {
                const [c1, c2, c3] = generateCommands(char);
                $cmd1.val(c1);
                $cmd2.val(c2);
                $cmd3.val(c3);
            } catch (e) {
                console.error(e);
                $cmd1.val("生成失败: " + e.message);
                $cmd2.val("");
                $cmd3.val("");
            }
        }, 50);
    });

    $input.val("昇");
    $generateBtn.click();
});