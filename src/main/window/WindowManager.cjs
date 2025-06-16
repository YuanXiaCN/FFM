// 窗口管理器
const { BrowserWindow } = require('electron');
const path = require('path');
const WindowController = require('./WindowController');
const { APP_CONFIG } = require('../../shared/constants');

class WindowManager {
  constructor() {
    this.mainWindow = null;
    this.windowController = null;
  }

  /**
   * 创建主窗口
   */
  async createMainWindow() {
    if (this.mainWindow) {
      this.mainWindow.focus();
      return this.mainWindow;
    }

    // 创建窗口
    this.mainWindow = new BrowserWindow({
      width: APP_CONFIG.defaultWidth,
      height: APP_CONFIG.defaultHeight,
      minWidth: APP_CONFIG.minWidth,
      minHeight: APP_CONFIG.minHeight,
      frame: false,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, '../../../preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false,
        webSecurity: true
      }
    });

    // 初始化窗口控制器
    this.windowController = new WindowController(this.mainWindow);

    // 加载应用页面
    await this.loadApplication();

    // 绑定窗口事件
    this.bindWindowEvents();

    // 显示窗口
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow.show();
    });

    return this.mainWindow;
  }

  /**
   * 加载应用程序
   */
  async loadApplication() {
    const isDev = !require('electron').app.isPackaged;
    
    if (isDev) {
      // 开发环境加载本地服务器
      await this.mainWindow.loadURL('http://localhost:5173');
      this.mainWindow.webContents.openDevTools();
    } else {
      // 生产环境加载本地文件
      await this.mainWindow.loadFile(path.join(__dirname, '../../../index.html'));
    }
  }

  /**
   * 绑定窗口事件
   */
  bindWindowEvents() {
    if (!this.mainWindow) return;

    // 窗口关闭事件
    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
      this.windowController = null;
    });

    // 窗口最大化/还原事件
    this.mainWindow.on('maximize', () => {
      this.mainWindow.webContents.send('window-state-changed', { isMaximized: true });
    });

    this.mainWindow.on('unmaximize', () => {
      this.mainWindow.webContents.send('window-state-changed', { isMaximized: false });
    });

    // 窗口焦点事件
    this.mainWindow.on('focus', () => {
      this.mainWindow.webContents.send('window-focus-changed', { focused: true });
    });

    this.mainWindow.on('blur', () => {
      this.mainWindow.webContents.send('window-focus-changed', { focused: false });
    });

    // 窗口大小变化事件
    this.mainWindow.on('resize', () => {
      const [width, height] = this.mainWindow.getSize();
      this.mainWindow.webContents.send('window-resize', { width, height });
    });
  }

  /**
   * 获取主窗口
   */
  getMainWindow() {
    return this.mainWindow;
  }

  /**
   * 获取窗口控制器
   */
  getWindowController() {
    return this.windowController;
  }

  /**
   * 显示窗口
   */
  showWindow() {
    if (this.mainWindow) {
      if (this.mainWindow.isMinimized()) {
        this.mainWindow.restore();
      }
      this.mainWindow.show();
      this.mainWindow.focus();
    }
  }

  /**
   * 隐藏窗口
   */
  hideWindow() {
    if (this.mainWindow) {
      this.mainWindow.hide();
    }
  }

  /**
   * 最小化窗口
   */
  minimizeWindow() {
    if (this.mainWindow) {
      this.mainWindow.minimize();
    }
  }

  /**
   * 最大化/还原窗口
   */
  toggleMaximize() {
    if (this.mainWindow) {
      if (this.mainWindow.isMaximized()) {
        this.mainWindow.unmaximize();
      } else {
        this.mainWindow.maximize();
      }
    }
  }

  /**
   * 关闭窗口
   */
  closeWindow() {
    if (this.mainWindow) {
      this.mainWindow.close();
    }
  }

  /**
   * 重新加载窗口
   */
  reloadWindow() {
    if (this.mainWindow) {
      this.mainWindow.reload();
    }
  }

  /**
   * 发送消息到渲染进程
   */
  sendToRenderer(channel, data) {
    if (this.mainWindow && this.mainWindow.webContents) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  /**
   * 获取窗口状态
   */
  getWindowState() {
    if (!this.mainWindow) return null;

    return {
      isMaximized: this.mainWindow.isMaximized(),
      isMinimized: this.mainWindow.isMinimized(),
      isVisible: this.mainWindow.isVisible(),
      isFocused: this.mainWindow.isFocused(),
      bounds: this.mainWindow.getBounds()
    };
  }

  /**
   * 设置窗口状态
   */
  setWindowState(state) {
    if (!this.mainWindow) return;

    if (state.bounds) {
      this.mainWindow.setBounds(state.bounds);
    }

    if (state.isMaximized) {
      this.mainWindow.maximize();
    }
  }

  /**
   * 清理资源
   */
  cleanup() {
    if (this.windowController) {
      this.windowController.cleanup();
    }
    
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.close();
    }
  }
}

module.exports = WindowManager;
