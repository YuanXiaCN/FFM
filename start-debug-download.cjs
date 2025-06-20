// start-debug-download.cjs
// 启动调试模式的下载服务

const { app } = require('electron');
const { logger } = require('./utils.cjs');
const { debugLogger } = require('./debug-config.cjs');

// 在应用启动时记录调试信息
function setupDebugLogging() {
  logger.info('=== 启动下载调试模式 ===');
  
  // 记录系统信息
  debugLogger.logEvent('SYSTEM', 'STARTUP', {
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    nodeVersion: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    memory: process.getSystemMemoryInfo?.() || 'unknown'
  });
  
  // 监听未捕获的异常
  process.on('uncaughtException', (error) => {
    debugLogger.logEvent('ERROR', 'UNCAUGHT_EXCEPTION', {
      message: error.message,
      stack: error.stack
    });
    logger.error('未捕获的异常:', error);
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    debugLogger.logEvent('ERROR', 'UNHANDLED_REJECTION', {
      reason: reason?.toString() || 'unknown',
      promise: promise?.toString() || 'unknown'
    });
    logger.error('未处理的Promise拒绝:', reason);
  });
  
  // 监听应用事件
  app.on('ready', () => {
    debugLogger.logEvent('APP', 'READY', {});
    logger.info('Electron应用已就绪');
  });
  
  app.on('window-all-closed', () => {
    debugLogger.logEvent('APP', 'WINDOW_ALL_CLOSED', {});
    logger.info('所有窗口已关闭');
    
    // 导出最终的调试报告
    const reportPath = debugLogger.exportDebugReport();
    if (reportPath) {
      logger.info(`最终调试报告已保存: ${reportPath}`);
    }
  });
  
  // 定期记录系统状态
  setInterval(() => {
    debugLogger.logSystemStatus();
  }, 30000); // 每30秒记录一次
  
  logger.info('调试日志记录器已设置完成');
}

module.exports = {
  setupDebugLogging
};
