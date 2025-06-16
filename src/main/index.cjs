// 主进程入口文件
const { app } = require('electron');
const App = require('./core/App');

// 创建应用实例
const mainApp = new App();

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
  if (mainApp.logger) {
    mainApp.logger.error('未捕获的异常', error);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的 Promise 拒绝:', reason);
  if (mainApp.logger) {
    mainApp.logger.error('未处理的 Promise 拒绝', { reason, promise });
  }
});

// 防止应用被垃圾回收
global.mainApp = mainApp;
