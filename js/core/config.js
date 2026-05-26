// js/core/config.js
// 全局常量、axios 配置

const FRONTEND_VERSION = "1.3.0";   // 必须与后端 APP_VERSION 保持一致

// 配置 axios 基础 URL
axios.defaults.baseURL = "http://127.0.0.1:5000";

// 请求拦截器：添加客户端版本头
axios.interceptors.request.use(config => {
    config.headers['X-Client-Version'] = FRONTEND_VERSION;
    return config;
});

// 响应拦截器：自动处理未授权（401）
axios.interceptors.response.use(
    response => response,
    error => {
        if (error.response && error.response.status === 401) {
            $('#activateModal').modal('show');
        }
        return Promise.reject(error);
    }
);
