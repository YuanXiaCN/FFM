// 主应用程序类
const { app } = require('electron');
const path = require('path');
const WindowManager = require('../window/WindowManager');
const Logger = require('./Logger');
const SecurityManager = require('./Security');
const ConfigService = require('../services/ConfigService');

class App {
  constructor() {
    this.isDev = !app.isPackaged;
    this.userDataPath = app.getPath('userData');
    this.windowManager = null;
    this.logger = null;
    this.securityManager = null;
    this.configService = null;
    
    this.bindEvents();
  }
  /**
   * 初始化应用程序
   */
  async initialize() {
    try {
      // 初始化日志系统
      this.logger = new Logger();
      this.logger.info('应用程序启动中...');

      // 初始化安全管理器
      this.securityManager = new SecurityManager(this.userDataPath);
      await this.securityManager.initialize();

      // 初始化配置服务
      this.configService = new ConfigService(this.userDataPath);

      // 初始化窗口管理器
      this.windowManager = new WindowManager();
      
      this.logger.info('应用程序初始化完成');
    } catch (error) {
      console.error('应用程序初始化失败:', error);
      app.quit();
    }
  }

  /**
   * 创建主窗口
   */
  async createMainWindow() {
    if (!this.windowManager) {
      throw new Error('窗口管理器未初始化');
    }
    
    await this.windowManager.createMainWindow();
    this.logger.info('主窗口创建完成');
  }

  /**
   * 绑定应用程序事件
   */
  bindEvents() {
    // 当所有窗口关闭时退出应用
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        this.cleanup();
        app.quit();
      }
    });

    // macOS 下点击 dock 图标重新激活应用
    app.on('activate', async () => {
      if (this.windowManager && this.windowManager.getMainWindow() === null) {
        await this.createMainWindow();
      }
    });

    // 应用准备就绪
    app.whenReady().then(async () => {
      await this.initialize();
      await this.createMainWindow();
    });

    // 应用即将退出时的清理工作
    app.on('before-quit', () => {
      this.cleanup();
    });
  }
  /**
   * 清理资源
   */
  cleanup() {
    if (this.logger) {
      this.logger.info('应用程序正在退出...');
    }
    
    if (this.configService) {
      this.configService.cleanup();
    }
    
    if (this.windowManager) {
      this.windowManager.cleanup();
    }
    
    if (this.securityManager) {
      this.securityManager.cleanup();
    }
  }

  /**
   * 获取应用信息
   */
  getAppInfo() {
    return {
      name: app.getName(),
      version: app.getVersion(),
      isDev: this.isDev,
      userDataPath: this.userDataPath,
      platform: process.platform
    };
  }
}

module.exports = App;
