// js/modules/ai-assistant.js
// AI 智能助手（悬浮窗问答）

$(document).ready(function () {
    // 悬浮窗控制
    function closeFloatWindow() {
        $("#qaFloatWindow").removeClass("open");
        $(document).off("click.qaFloat");
    }

    $("#qaFloatButton").click(function (e) {
        e.stopPropagation();
        $("#qaFloatWindow").toggleClass("open");
        if ($("#qaFloatWindow").hasClass("open")) {
            $(document).on("click.qaFloat", function (e) {
                if (!$(e.target).closest("#qaFloatWindow").length) closeFloatWindow();
            });
        } else {
            $(document).off("click.qaFloat");
        }
    });

    $(".qa-float-close").click(function (e) {
        e.stopPropagation();
        closeFloatWindow();
    });

    $("#qaClearLink").click(function (e) {
        e.stopPropagation();
        if (confirm("确定要清空历史对话吗？")) {
            $("#qaQuestion").val("");
            $("#qaAnswer").html(`
                <div class="qa-welcome">
                    <div class="qa-welcome-icon">🤖</div>
                    <p class="qa-welcome-text">你好！我是你的智能助手<br>有什么可以帮你的吗？</p>
                </div>
            `);
        }
    });

    // AI 提问（SSE 流式）
    $("#btnAsk").off("click").on("click", function (e) {
        e.stopPropagation();
        const question = $("#qaQuestion").val().trim();
        if (!question) {
            alert("请输入问题");
            return;
        }
        $("#qaAnswer").html(`
            <div class="d-flex flex-column justify-content-center align-items-center" style="min-height: 150px;">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">加载中...</span>
                </div>
                <p class="mt-2 mb-0">AI 思考中...</p>
            </div>
        `);

        const eventSource = new EventSource(`/api/ai/ask?question=${encodeURIComponent(question)}&client_version=${FRONTEND_VERSION}`);
        let answerHtml = '';

        eventSource.onmessage = function (event) {
            const data = JSON.parse(event.data);
            if (data.status === 'start') {
                // 保持 loading
            } else if (data.status === 'end') {
                eventSource.close();
            } else if (data.chunk) {
                if (answerHtml === '') $("#qaAnswer").html('');
                answerHtml += data.chunk;
                let displayHtml = answerHtml.replace(/\n/g, '<br>');
                displayHtml = displayHtml.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                $("#qaAnswer").html(displayHtml);
                const answerDiv = $("#qaAnswer")[0];
                answerDiv.scrollTop = answerDiv.scrollHeight;
            } else if (data.error) {
                $("#qaAnswer").html(`<div class="alert alert-danger">${escapeHtml(data.error)}</div>`);
                eventSource.close();
            }
        };
        eventSource.onerror = function () {
            $("#qaAnswer").html(`<div class="alert alert-danger">连接中断，请重试</div>`);
            eventSource.close();
        };
    });

    // 按回车发送
    $("#qaQuestion").on("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            $("#btnAsk").click();
        }
    });
});