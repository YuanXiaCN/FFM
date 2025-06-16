/**
 * 渲染进程日志服务
 * 通过IPC与主进程通信来记录日志
 */

// 日志级别枚举
const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3
};

// 日志级别名称映射
const LOG_LEVEL_NAMES = {
    0: 'DEBUG',
    1: 'INFO',
    2: 'WARN',
    3: 'ERROR'
};

/**
 * 渲染进程日志记录类
 */
class RendererLogger {
    constructor(logLevel = LOG_LEVELS.INFO) {
        this.logLevel = logLevel;
        this.isElectron = window.electronAPI !== undefined;
    }

    /**
     * 设置日志级别
     * @param {number} level - 日志级别
     */
    setLogLevel(level) {
        this.logLevel = level;
    }

    /**
     * 获取格式化的时间戳
     * @returns {string} 格式化的时间戳
     */
    getTimestamp() {
        const now = new Date();
        return now.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
    }

    /**
     * 核心日志记录方法
     * @param {number} level - 日志级别
     * @param {string} message - 日志消息
     * @param {Object} extra - 额外信息
     */
    async log(level, message, extra = null) {
        // 检查日志级别
        if (level < this.logLevel) {
            return;
        }

        const timestamp = this.getTimestamp();
        const levelName = LOG_LEVEL_NAMES[level] || 'UNKNOWN';
        
        // 构建日志消息
        let logMessage = `[RENDERER] ${message}`;
        
        // 添加额外信息
        if (extra) {
            if (typeof extra === 'object') {
                logMessage += ` | ${JSON.stringify(extra)}`;
            } else {
                logMessage += ` | ${extra}`;
            }
        }

        // 输出到控制台
        const consoleMessage = `[${timestamp}] [${levelName}] ${logMessage}`;
        switch (level) {
            case LOG_LEVELS.DEBUG:
                console.debug(`🔍 ${consoleMessage}`);
                break;
            case LOG_LEVELS.INFO:
                console.info(`ℹ️ ${consoleMessage}`);
                break;
            case LOG_LEVELS.WARN:
                console.warn(`⚠️ ${consoleMessage}`);
                break;
            case LOG_LEVELS.ERROR:
                console.error(`❌ ${consoleMessage}`);
                break;
        }

        // 如果在Electron环境中，通过IPC发送到主进程记录
        if (this.isElectron && window.electronAPI && window.electronAPI.logToMain) {
            try {
                await window.electronAPI.logToMain({
                    level: levelName,
                    message: logMessage,
                    timestamp
                });
            } catch (error) {
                console.error('发送日志到主进程失败:', error);
            }
        }
    }

    /**
     * DEBUG 级别日志
     * @param {string} message - 日志消息
     * @param {Object} extra - 额外信息
     */
    debug(message, extra = null) {
        return this.log(LOG_LEVELS.DEBUG, message, extra);
    }

    /**
     * INFO 级别日志
     * @param {string} message - 日志消息
     * @param {Object} extra - 额外信息
     */
    info(message, extra = null) {
        return this.log(LOG_LEVELS.INFO, message, extra);
    }

    /**
     * WARN 级别日志
     * @param {string} message - 日志消息
     * @param {Object} extra - 额外信息
     */
    warn(message, extra = null) {
        return this.log(LOG_LEVELS.WARN, message, extra);
    }

    /**
     * ERROR 级别日志
     * @param {string} message - 日志消息
     * @param {Object} extra - 额外信息
     */
    error(message, extra = null) {
        return this.log(LOG_LEVELS.ERROR, message, extra);
    }

    /**
     * 获取日志内容
     * @param {number} lines - 读取最后几行，默认100行
     * @returns {Promise<string>} 日志内容
     */
    async getLogContent(lines = 100) {
        if (this.isElectron && window.electronAPI && window.electronAPI.getLogContent) {
            try {
                return await window.electronAPI.getLogContent(lines);
            } catch (error) {
                console.error('获取日志内容失败:', error);
                return '';
            }
        }
        return '';
    }

    /**
     * 清空日志文件
     */
    async clearLog() {
        if (this.isElectron && window.electronAPI && window.electronAPI.clearLog) {
            try {
                await window.electronAPI.clearLog();
                this.info('日志文件已清空');
            } catch (error) {
                console.error('清空日志文件失败:', error);
            }
        }
    }
}

// 创建默认logger实例
const logger = new RendererLogger();

export { 
    RendererLogger, 
    logger, 
    LOG_LEVELS 
};
