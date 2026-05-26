// ========== site.js - 入口文件（固定侧边栏版） ==========

$(document).ready(function () {
    // ---------- 1. jQuery 自动高度插件 ----------
    jQuery.fn.extend({
        autoHeight: function () {
            return this.each(function () {
                var $this = jQuery(this);
                if (!$this.attr('_initAdjustHeight')) {
                    $this.attr('_initAdjustHeight', $this.outerHeight());
                }
                _adjustH(this).on('input', function () { _adjustH(this); });
            });
            function _adjustH(elem) {
                var $obj = jQuery(elem);
                return $obj.css({ height: $obj.attr('_initAdjustHeight'), 'overflow-y': 'hidden' }).height(elem.scrollHeight);
            }
        }
    });

    // ---------- 2. 全局变量 ----------
    var route_state = 0;
    var $containers = $("#main > div.container");
    var $menuItems = $("[menu-type]");   // 所有带 menu-type 的菜单项（桌面+移动端）

    // 工具名称映射（搜索用）
    var toolNames = {
        'JT808Parse': 'JT808解析工具',
        'JT809Parse': 'JT809解析工具',
        'JT1078Parse': 'JT1078解析工具',
        'JT19056Parse': 'JT19056解析工具',
        'JT905Parse': 'JT905解析工具',
        'JTSBParse': '主动安全解析工具 苏标 ADAS DSM',
        'HexParse': 'Hex工具 进制转换',
        'DataTools': '数据字段处理工具',
        'LatLngQuery': '经纬度坐标查询工具 地图',
        'H264Convert': 'H264转MP4工具 视频转换',
        'AdbTool': 'ADB命令调试工具 安卓调试',
        'RareCharTool': '生僻字指令生成器 点阵'
    };

    // 分组映射
    var toolGroups = {
        'JT808Parse': '交通解析', 'JT809Parse': '交通解析', 'JT1078Parse': '交通解析',
        'JT19056Parse': '交通解析', 'JT905Parse': '交通解析', 'JTSBParse': '交通解析',
        'HexParse': '数据处理', 'DataTools': '数据处理', 'LatLngQuery': '数据处理', 'H264Convert': '数据处理',
        'AdbTool': '终端调试', 'RareCharTool': '终端调试'
    };

    // ---------- 3. 工具切换函数 ----------
    function showTool(toolId) {
        $containers.each(function () {
            var $this = $(this);
            if (this.id === toolId) {
                $this.removeClass("hide");
            } else {
                $this.addClass("hide");
            }
        });
    }

    function handleMenuSelection(menuType) {
        if (!menuType) return;

        // 高亮所有匹配的菜单项（桌面侧边栏 + 移动端 offcanvas）
        $menuItems.removeClass("active");
        $menuItems.filter(`[menu-type="${menuType}"]`).addClass("active");

        // 桌面端：高亮飞出菜单项
        $(".sidebar-flyout-item").removeClass("active");
        $(`.sidebar-flyout-item[menu-type="${menuType}"]`).addClass("active");

        // 桌面端：给父级菜单标签加 active-accent 竖条
        $(".sidebar-menu-label").removeClass("active-accent");
        var $activeItem = $(`.sidebar-flyout-item[menu-type="${menuType}"]`).closest(".sidebar-menu-item");
        if ($activeItem.length) {
            $activeItem.find(".sidebar-menu-label").first().addClass("active-accent");
        }

        // 切换工具
        showTool(menuType);

        // 关闭移动端 offcanvas
        var offcanvasEl = document.getElementById('sideMenuCanvas');
        if (offcanvasEl) {
            var offcanvas = bootstrap.Offcanvas.getInstance(offcanvasEl);
            if (offcanvas) offcanvas.hide();
        }

        // 关闭搜索结果
        $("#searchResults").removeClass("show");
        $("#searchInput").val('');
    }

    // ---------- 4. Hash 路由 ----------
    function onHashChange() {
        var hash = window.location.hash.substring(1);
        if (!hash) hash = "JT808Parse";
        if ($(`[menu-type="${hash}"]`).length > 0) {
            handleMenuSelection(hash);
        } else {
            handleMenuSelection("JT808Parse");
            window.location.hash = "JT808Parse";
        }
    }

    window.addEventListener("hashchange", onHashChange);
    if (window.location.hash) {
        onHashChange();
    } else {
        window.location.hash = "JT808Parse";
    }

    // ---------- 5. 菜单项点击 ----------
    $(document).on("click", "[menu-type]", function (e) {
        e.preventDefault();
        var menuType = $(this).attr("menu-type");
        if (!menuType) return;
        route_state = 1;
        handleMenuSelection(menuType);
        window.location.hash = menuType;
        route_state = 0;
    });

    // ---------- 6. 桌面侧边栏：飞出菜单定位 ----------
    if ($(window).width() >= 768) {
        var flyoutTimeout = null;

        $(".sidebar-menu-item").on("mouseenter", function () {
            var $item = $(this);
            var $flyout = $item.find(".sidebar-flyout");
            if (!$flyout.length) return;

            clearTimeout(flyoutTimeout);

            // 先关闭其他所有飞出菜单，防止快速滚动时多个同时展开
            $(".sidebar-menu-item").not($item).removeClass("active-flyout");

            // 计算位置：对齐菜单项顶部，右侧紧贴侧边栏
            var rect = $item[0].getBoundingClientRect();
            var flyoutHeight = $flyout.outerHeight() || 200;
            var viewportH = window.innerHeight;
            var sidebarW = 220;

            // 默认 top = 菜单项顶部
            var top = rect.top;
            // 如果底部超出视口，往上提
            if (top + flyoutHeight > viewportH - 10) {
                top = viewportH - flyoutHeight - 10;
                if (top < 10) top = 10;
            }

            $flyout.css({
                top: top + 'px',
                left: sidebarW + 'px'
            });

            $item.addClass("active-flyout");
        }).on("mouseleave", function () {
            var $item = $(this);
            flyoutTimeout = setTimeout(function () {
                $item.removeClass("active-flyout");
            }, 150);
        });

        // 飞出菜单自身也保持显示
        $(".sidebar-flyout").on("mouseenter", function () {
            clearTimeout(flyoutTimeout);
        }).on("mouseleave", function () {
            var $item = $(this).closest(".sidebar-menu-item");
            flyoutTimeout = setTimeout(function () {
                $item.removeClass("active-flyout");
            }, 150);
        });
    }

    // ---------- 7. 搜索功能 ----------
    var $searchInput = $("#searchInput");
    var $searchResults = $("#searchResults");
    var $searchToggle = $("#searchToggle");

    // 点击搜索图标聚焦输入框
    $searchToggle.on("click", function () {
        $searchInput.focus();
    });

    // 搜索过滤
    $searchInput.on("input", function () {
        var query = $(this).val().trim().toLowerCase();
        if (!query) {
            $searchResults.removeClass("show").empty();
            return;
        }

        var results = [];
        for (var toolId in toolNames) {
            var name = toolNames[toolId];
            if (toolId.toLowerCase().indexOf(query) !== -1 ||
                name.toLowerCase().indexOf(query) !== -1) {
                results.push({
                    id: toolId,
                    name: name,
                    group: toolGroups[toolId] || ''
                });
            }
        }

        if (results.length === 0) {
            $searchResults.html('<div class="search-no-result">未找到匹配的工具</div>').addClass("show");
        } else {
            var html = results.map(function (r) {
                // 找到对应的图标
                var $menuItem = $(`.sidebar-flyout-item[menu-type="${r.id}"]`);
                var iconClass = $menuItem.find("i").attr("class") || "bi bi-app";
                return '<a class="search-result-item" menu-type="' + r.id + '" href="#' + r.id + '">' +
                    '<i class="' + iconClass + '"></i>' +
                    '<span>' + r.name + '</span>' +
                    '<span class="search-result-group">' + r.group + '</span>' +
                    '</a>';
            }).join('');
            $searchResults.html(html).addClass("show");
        }
    });

    // 搜索结果点击（通过事件委托，因为是动态生成的）
    $searchResults.on("click", ".search-result-item", function (e) {
        e.preventDefault();
        var menuType = $(this).attr("menu-type");
        if (menuType) {
            handleMenuSelection(menuType);
            window.location.hash = menuType;
        }
    });

    // 点击外部关闭搜索结果
    $(document).on("click", function (e) {
        if (!$(e.target).closest("#sidebarSearch").length) {
            $searchResults.removeClass("show");
        }
    });

    // 键盘快捷键：Ctrl+K 或 / 聚焦搜索
    $(document).on("keydown", function (e) {
        // Ctrl+K 聚焦搜索
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            $searchInput.focus();
            return;
        }
        // Esc 关闭搜索
        if (e.key === 'Escape') {
            $searchResults.removeClass("show");
            $searchInput.blur();
        }
    });

    // 搜索框回车选中第一个结果
    $searchInput.on("keydown", function (e) {
        if (e.key === 'Enter') {
            var $first = $searchResults.find(".search-result-item").first();
            if ($first.length) {
                $first.trigger("click");
            }
        }
        // 上下箭头导航
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            var $items = $searchResults.find(".search-result-item");
            var $current = $items.filter(".search-hover");
            $items.removeClass("search-hover");
            var idx = $items.index($current);
            if (e.key === 'ArrowDown') {
                idx = idx < $items.length - 1 ? idx + 1 : 0;
            } else {
                idx = idx > 0 ? idx - 1 : $items.length - 1;
            }
            $items.eq(idx).addClass("search-hover");
        }
    });

    // ---------- 8. 版本号显示 ----------
    if (typeof FRONTEND_VERSION !== "undefined") {
        $("#checkUpdateBtn, #checkUpdateBtnMobile").each(function () {
            var $btn = $(this);
            var originalText = $btn.text();
            if (!originalText.includes(FRONTEND_VERSION)) {
                if ($btn.is("#checkUpdateBtnMobile") && originalText === "检查更新") {
                    $btn.text(`检查更新 v${FRONTEND_VERSION}`);
                } else if ($btn.is("#checkUpdateBtn")) {
                    $btn.text(`检查更新 v${FRONTEND_VERSION}`);
                } else {
                    $btn.text(`${originalText} v${FRONTEND_VERSION}`);
                }
            }
        });
    }

    // ---------- 9. 深色/浅色主题切换 ----------
    var $themeToggle = $("#themeToggle");
    var $themeIcon = $("#themeIcon");
    var $themeText = $("#themeText");
    var $themeToggleMobile = $("#themeToggleMobile");
    var $themeIconMobile = $("#themeIconMobile");
    var $themeToggleOffcanvas = $("#themeToggleOffcanvas");
    var $themeIconOffcanvas = $("#themeIconOffcanvas");
    var $themeTextOffcanvas = $("#themeTextOffcanvas");

    // 同步所有主题图标状态
    function syncThemeUI(isDark) {
        if (isDark) {
            $themeIcon.removeClass('bi-moon-fill').addClass('bi-sun-fill');
            $themeText.text('浅色模式');
            $themeIconMobile.removeClass('bi-moon-fill').addClass('bi-sun-fill');
            $themeIconOffcanvas.removeClass('bi-moon-fill').addClass('bi-sun-fill');
            $themeTextOffcanvas.text('浅色模式');
        } else {
            $themeIcon.removeClass('bi-sun-fill').addClass('bi-moon-fill');
            $themeText.text('深色模式');
            $themeIconMobile.removeClass('bi-sun-fill').addClass('bi-moon-fill');
            $themeIconOffcanvas.removeClass('bi-sun-fill').addClass('bi-moon-fill');
            $themeTextOffcanvas.text('深色模式');
        }
    }

    // 从 localStorage 读取主题偏好
    var savedTheme = localStorage.getItem('yuweitek-theme') || 'light';
    if (savedTheme === 'dark') {
        $('body').addClass('theme-dark');
        syncThemeUI(true);
    }

    // 桌面端主题切换
    $themeToggle.on("click", function () {
        var isDark = $('body').toggleClass('theme-dark').hasClass('theme-dark');
        syncThemeUI(isDark);
        localStorage.setItem('yuweitek-theme', isDark ? 'dark' : 'light');
    });

    // 移动端顶部栏主题切换
    $themeToggleMobile.on("click", function () {
        var isDark = $('body').toggleClass('theme-dark').hasClass('theme-dark');
        syncThemeUI(isDark);
        localStorage.setItem('yuweitek-theme', isDark ? 'dark' : 'light');
    });

    // 移动端 offcanvas 主题切换
    $themeToggleOffcanvas.on("click", function () {
        var isDark = $('body').toggleClass('theme-dark').hasClass('theme-dark');
        syncThemeUI(isDark);
        localStorage.setItem('yuweitek-theme', isDark ? 'dark' : 'light');
    });

    // ---------- 10. 搜索框键盘导航样式 ----------
    $("<style>")
        .text(".search-hover { background: #f0f5ff !important; color: #166ff1 !important; }")
        .appendTo("head");
});
