// debug-config.cjs
// 下载调试配置 - 用于排查卡死问题

const fs = require('fs');
const path = require('path');

// 调试日志路径
const DEBUG_LOG_PATH = path.join(process.cwd(), 'download-debug.log');
const SESSION_LOG_PATH = path.join(process.cwd(), 'download-session.log');

/**
 * 调试日志记录器
 */
class DebugLogger {
  constructor() {
    this.sessionId = Date.now().toString();
    this.startTime = Date.now();
    this.events = [];
    
    // 清空之前的会话日志
    this.clearSessionLog();
    this.writeSessionLog(`=== 下载调试会话开始: ${this.sessionId} ===`);
    this.writeSessionLog(`开始时间: ${new Date().toISOString()}`);
    this.writeSessionLog(`进程PID: ${process.pid}`);
    this.writeSessionLog(`Node.js版本: ${process.version}`);
    this.writeSessionLog(`工作目录: ${process.cwd()}`);
    this.writeSessionLog('');
  }
  
  /**
   * 清空会话日志
   */
  clearSessionLog() {
    try {
      if (fs.existsSync(SESSION_LOG_PATH)) {
        fs.unlinkSync(SESSION_LOG_PATH);
      }
    } catch (error) {
      console.warn('清空会话日志失败:', error.message);
    }
  }
  
  /**
   * 写入会话日志
   */
  writeSessionLog(message) {
    try {
      const timestamp = new Date().toISOString();
      const logLine = `[${timestamp}] ${message}\n`;
      fs.appendFileSync(SESSION_LOG_PATH, logLine, 'utf8');
    } catch (error) {
      console.warn('写入会话日志失败:', error.message);
    }
  }
  
  /**
   * 记录调试事件
   */
  logEvent(category, event, data = {}) {
    const eventData = {
      timestamp: Date.now(),
      elapsed: Date.now() - this.startTime,
      category,
      event,
      data,
      sessionId: this.sessionId
    };
    
    this.events.push(eventData);
    
    // 写入会话日志
    const eventStr = JSON.stringify(data, null, 2).replace(/\n/g, '\n    ');
    this.writeSessionLog(`[${category}] ${event}:`);
    if (Object.keys(data).length > 0) {
      this.writeSessionLog(`    ${eventStr}`);
    }
    this.writeSessionLog('');
    
    // 保持最近1000个事件
    if (this.events.length > 1000) {
      this.events = this.events.slice(-1000);
    }
  }
  
  /**
   * 记录下载开始
   */
  logDownloadStart(options) {
    this.logEvent('DOWNLOAD', 'START', {
      version: options.version,
      loader: options.loader,
      downloadSource: options.downloadSource
    });
  }
  
  /**
   * 记录任务添加
   */
  logTaskAdded(task) {
    this.logEvent('TASK', 'ADDED', {
      id: task.id,
      dest: task.dest,
      size: task.size,
      url: task.url.substring(0, 100) + (task.url.length > 100 ? '...' : '')
    });
  }
  
  /**
   * 记录任务开始
   */
  logTaskStarted(task) {
    this.logEvent('TASK', 'STARTED', {
      id: task.id,
      dest: path.basename(task.dest),
      size: task.size
    });
  }
  
  /**
   * 记录任务进度
   */
  logTaskProgress(task, progress) {
    // 每10%记录一次
    const progressRounded = Math.floor(progress / 10) * 10;
    if (!task._lastLoggedProgress || task._lastLoggedProgress !== progressRounded) {
      if (progressRounded % 10 === 0 && progressRounded > 0) {
        this.logEvent('TASK', 'PROGRESS', {
          id: task.id,
          dest: path.basename(task.dest),
          progress: progressRounded,
          speed: Math.round((task.speed || 0) / 1024) + 'KB/s'
        });
        task._lastLoggedProgress = progressRounded;
      }
    }
  }
  
  /**
   * 记录任务完成
   */
  logTaskCompleted(task) {
    this.logEvent('TASK', 'COMPLETED', {
      id: task.id,
      dest: path.basename(task.dest),
      finalSize: task.downloadedBytes || task.size
    });
  }
  
  /**
   * 记录任务失败
   */
  logTaskFailed(task, error) {
    this.logEvent('TASK', 'FAILED', {
      id: task.id,
      dest: path.basename(task.dest),
      error: error.message,
      retryCount: task.retryCount || 0
    });
  }
  
  /**
   * 记录队列状态
   */
  logQueueStatus(activeCount, queuedCount, completedCount, failedCount) {
    this.logEvent('QUEUE', 'STATUS', {
      active: activeCount,
      queued: queuedCount,
      completed: completedCount,
      failed: failedCount,
      total: activeCount + queuedCount + completedCount + failedCount
    });
  }
  
  /**
   * 记录系统状态
   */
  logSystemStatus() {
    const memUsage = process.memoryUsage();
    this.logEvent('SYSTEM', 'STATUS', {
      memory: {
        rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB',
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB'
      },
      uptime: Math.round(process.uptime()) + 's'
    });
  }
  
  /**
   * 记录可能的卡死点
   */
  logPotentialHang(location, context = {}) {
    this.logEvent('HANG', 'POTENTIAL', {
      location,
      context,
      elapsed: Date.now() - this.startTime
    });
  }
  
  /**
   * 导出调试报告
   */
  exportDebugReport() {
    const report = {
      sessionId: this.sessionId,
      startTime: this.startTime,
      endTime: Date.now(),
      duration: Date.now() - this.startTime,
      events: this.events,
      summary: this.generateSummary()
    };
    
    try {
      fs.writeFileSync(DEBUG_LOG_PATH, JSON.stringify(report, null, 2), 'utf8');
      this.writeSessionLog(`调试报告已保存: ${DEBUG_LOG_PATH}`);
      return DEBUG_LOG_PATH;
    } catch (error) {
      console.error('导出调试报告失败:', error.message);
      return null;
    }
  }
  
  /**
   * 生成摘要
   */
  generateSummary() {
    const eventsByCategory = {};
    const eventsByType = {};
    
    this.events.forEach(event => {
      const category = event.category;
      const type = `${category}.${event.event}`;
      
      eventsByCategory[category] = (eventsByCategory[category] || 0) + 1;
      eventsByType[type] = (eventsByType[type] || 0) + 1;
    });
    
    return {
      totalEvents: this.events.length,
      eventsByCategory,
      eventsByType,
      duration: Date.now() - this.startTime
    };
  }
}

// 创建全局调试器实例
const debugLogger = new DebugLogger();

module.exports = {
  debugLogger,
  DebugLogger
};
