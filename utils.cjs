/**
 * 通用工具函数 - 统一日志系统
 */
const fs = require('fs');
const path = require('path');

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
 * 统一日志记录类
 */
class Logger {
    constructor(logLevel = LOG_LEVELS.INFO) {
        this.logLevel = logLevel;
        // 修复：使用 electron app.getPath('userData') 获取用户数据目录
        const { app } = require('electron');
        const userDataPath = app.getPath('userData');
        this.logPath = path.join(userDataPath, 'FFM.log');
          // 确保日志目录存在
        try {
            const logDir = path.dirname(this.logPath);
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }
        } catch (error) {
            // 这里仍使用console.error因为logger还未完全初始化
            console.error('创建日志目录失败:', error);
        }
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
    log(level, message, extra = null) {
        // 检查日志级别
        if (level < this.logLevel) {
            return;
        }

        const timestamp = this.getTimestamp();
        const levelName = LOG_LEVEL_NAMES[level] || 'UNKNOWN';
        
        // 构建日志消息
        let logMessage = `[${timestamp}] [${levelName}] ${message}`;
        
        // 添加额外信息
        if (extra) {
            if (typeof extra === 'object') {
                logMessage += ` | ${JSON.stringify(extra)}`;
            } else {
                logMessage += ` | ${extra}`;
            }
        }

        // 输出到控制台
        switch (level) {
            case LOG_LEVELS.DEBUG:
                console.debug(`🔍 ${logMessage}`);
                break;
            case LOG_LEVELS.INFO:
                console.info(`ℹ️ ${logMessage}`);
                break;
            case LOG_LEVELS.WARN:
                console.warn(`⚠️ ${logMessage}`);
                break;
            case LOG_LEVELS.ERROR:
                console.error(`❌ ${logMessage}`);
                break;
        }        // 写入到文件
        try {
            fs.appendFileSync(this.logPath, logMessage + '\n');
        } catch (error) {
            // 这里仍使用console.error避免无限递归
            console.error('日志写入文件失败:', error);
        }
    }

    /**
     * DEBUG 级别日志
     * @param {string} message - 日志消息
     * @param {Object} extra - 额外信息
     */
    debug(message, extra = null) {
        this.log(LOG_LEVELS.DEBUG, message, extra);
    }

    /**
     * INFO 级别日志
     * @param {string} message - 日志消息
     * @param {Object} extra - 额外信息
     */
    info(message, extra = null) {
        this.log(LOG_LEVELS.INFO, message, extra);
    }

    /**
     * WARN 级别日志
     * @param {string} message - 日志消息
     * @param {Object} extra - 额外信息
     */
    warn(message, extra = null) {
        this.log(LOG_LEVELS.WARN, message, extra);
    }

    /**
     * ERROR 级别日志
     * @param {string} message - 日志消息
     * @param {Object} extra - 额外信息
     */
    error(message, extra = null) {
        this.log(LOG_LEVELS.ERROR, message, extra);
    }

    /**
     * 清空日志文件
     */
    clearLog() {
        try {
            fs.writeFileSync(this.logPath, '');
            this.info('日志文件已清空');        } catch (error) {
            // 这里仍使用console.error避免无限递归
            console.error('清空日志文件失败:', error);
        }
    }

    /**
     * 获取日志文件内容
     * @param {number} lines - 读取最后几行，默认100行
     * @returns {string} 日志内容
     */
    getLogContent(lines = 100) {
        try {
            const content = fs.readFileSync(this.logPath, 'utf8');
            const logLines = content.split('\n').filter(line => line.trim());
            return logLines.slice(-lines).join('\n');
        } catch (error) {
            console.error('读取日志文件失败:', error);
            return '';
        }
    }
}

// 创建默认logger实例
const logger = new Logger();

// 兼容旧版本的logToFile函数
function logToFile(message) {
    logger.info(message);
}

module.exports = { 
    Logger, 
    logger, 
    logToFile, 
    LOG_LEVELS 
};
