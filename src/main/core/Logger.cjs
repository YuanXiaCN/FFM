// 日志管理器
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class Logger {
  constructor() {
    this.logPath = path.join(app.getPath('userData'), 'logs');
    this.logFile = path.join(this.logPath, 'app.log');
    this.maxLogSize = 10 * 1024 * 1024; // 10MB
    this.maxLogFiles = 5;
    
    this.ensureLogDirectory();
  }

  /**
   * 确保日志目录存在
   */
  ensureLogDirectory() {
    if (!fs.existsSync(this.logPath)) {
      fs.mkdirSync(this.logPath, { recursive: true });
    }
  }

  /**
   * 格式化日志消息
   */
  formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      data
    };
    
    return JSON.stringify(logEntry) + '\n';
  }

  /**
   * 写入日志文件
   */
  writeToFile(formattedMessage) {
    try {
      // 检查文件大小，如果超过限制则轮转
      if (fs.existsSync(this.logFile)) {
        const stats = fs.statSync(this.logFile);
        if (stats.size > this.maxLogSize) {
          this.rotateLogFile();
        }
      }
      
      fs.appendFileSync(this.logFile, formattedMessage);
    } catch (error) {
      console.error('写入日志文件失败:', error);
    }
  }

  /**
   * 轮转日志文件
   */
  rotateLogFile() {
    try {
      // 删除最老的日志文件
      const oldestLog = path.join(this.logPath, `app.log.${this.maxLogFiles}`);
      if (fs.existsSync(oldestLog)) {
        fs.unlinkSync(oldestLog);
      }
      
      // 重命名现有日志文件
      for (let i = this.maxLogFiles - 1; i >= 1; i--) {
        const oldPath = path.join(this.logPath, `app.log.${i}`);
        const newPath = path.join(this.logPath, `app.log.${i + 1}`);
        
        if (fs.existsSync(oldPath)) {
          fs.renameSync(oldPath, newPath);
        }
      }
      
      // 重命名当前日志文件
      if (fs.existsSync(this.logFile)) {
        const backupPath = path.join(this.logPath, 'app.log.1');
        fs.renameSync(this.logFile, backupPath);
      }
    } catch (error) {
      console.error('日志文件轮转失败:', error);
    }
  }

  /**
   * 记录日志
   */
  log(level, message, data = null) {
    const formattedMessage = this.formatMessage(level, message, data);
    
    // 输出到控制台
    console.log(`[${level.toUpperCase()}] ${message}`, data || '');
    
    // 写入文件
    this.writeToFile(formattedMessage);
  }

  /**
   * 错误日志
   */
  error(message, data = null) {
    this.log('error', message, data);
  }

  /**
   * 警告日志
   */
  warn(message, data = null) {
    this.log('warn', message, data);
  }

  /**
   * 信息日志
   */
  info(message, data = null) {
    this.log('info', message, data);
  }

  /**
   * 调试日志
   */
  debug(message, data = null) {
    this.log('debug', message, data);
  }

  /**
   * 获取日志文件路径
   */
  getLogPath() {
    return this.logFile;
  }

  /**
   * 获取所有日志文件
   */
  getLogFiles() {
    try {
      const files = fs.readdirSync(this.logPath);
      return files
        .filter(file => file.startsWith('app.log'))
        .map(file => path.join(this.logPath, file));
    } catch (error) {
      this.error('获取日志文件列表失败', error);
      return [];
    }
  }

  /**
   * 清理旧日志
   */
  cleanOldLogs(daysToKeep = 7) {
    try {
      const files = this.getLogFiles();
      const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
      
      files.forEach(file => {
        const stats = fs.statSync(file);
        if (stats.mtime.getTime() < cutoffTime) {
          fs.unlinkSync(file);
          this.info(`清理旧日志文件: ${file}`);
        }
      });
    } catch (error) {
      this.error('清理旧日志失败', error);
    }
  }
}

module.exports = Logger;
