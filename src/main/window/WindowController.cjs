// 窗口控制器
const { ipcMain } = require('electron');
const { IPC_CHANNELS } = require('../../shared/constants');

class WindowController {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.registerIpcHandlers();
  }

  /**
   * 注册 IPC 处理程序
   */
  registerIpcHandlers() {
    // 窗口最小化
    ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, () => {
      this.minimize();
    });

    // 窗口最大化/还原
    ipcMain.handle(IPC_CHANNELS.WINDOW_MAXIMIZE, () => {
      this.toggleMaximize();
    });

    // 窗口关闭
    ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE, () => {
      this.close();
    });

    // 获取窗口最大化状态
    ipcMain.handle(IPC_CHANNELS.WINDOW_IS_MAXIMIZED, () => {
      return this.isMaximized();
    });
  }

  /**
   * 最小化窗口
   */
  minimize() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.minimize();
    }
  }

  /**
   * 切换最大化状态
   */
  toggleMaximize() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
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
  close() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.close();
    }
  }

  /**
   * 获取窗口最大化状态
   */
  isMaximized() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      return this.mainWindow.isMaximized();
    }
    return false;
  }

  /**
   * 显示窗口
   */
  show() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.show();
    }
  }

  /**
   * 隐藏窗口
   */
  hide() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.hide();
    }
  }

  /**
   * 聚焦窗口
   */
  focus() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.focus();
    }
  }

  /**
   * 设置窗口标题
   */
  setTitle(title) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.setTitle(title);
    }
  }

  /**
   * 设置窗口大小
   */
  setSize(width, height) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.setSize(width, height);
    }
  }

  /**
   * 设置窗口位置
   */
  setPosition(x, y) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.setPosition(x, y);
    }
  }

  /**
   * 居中显示窗口
   */
  center() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.center();
    }
  }

  /**
   * 设置窗口置顶
   */
  setAlwaysOnTop(flag) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.setAlwaysOnTop(flag);
    }
  }

  /**
   * 获取窗口边界
   */
  getBounds() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      return this.mainWindow.getBounds();
    }
    return null;
  }

  /**
   * 设置窗口边界
   */
  setBounds(bounds) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.setBounds(bounds);
    }
  }

  /**
   * 发送消息到渲染进程
   */
  sendToRenderer(channel, data) {
    if (this.mainWindow && 
        !this.mainWindow.isDestroyed() && 
        this.mainWindow.webContents) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  /**
   * 开启/关闭开发者工具
   */
  toggleDevTools() {
    if (this.mainWindow && 
        !this.mainWindow.isDestroyed() && 
        this.mainWindow.webContents) {
      if (this.mainWindow.webContents.isDevToolsOpened()) {
        this.mainWindow.webContents.closeDevTools();
      } else {
        this.mainWindow.webContents.openDevTools();
      }
    }
  }

  /**
   * 重新加载页面
   */
  reload() {
    if (this.mainWindow && 
        !this.mainWindow.isDestroyed() && 
        this.mainWindow.webContents) {
      this.mainWindow.webContents.reload();
    }
  }

  /**
   * 清理资源
   */
  cleanup() {
    // 移除所有 IPC 监听器
    ipcMain.removeAllListeners(IPC_CHANNELS.WINDOW_MINIMIZE);
    ipcMain.removeAllListeners(IPC_CHANNELS.WINDOW_MAXIMIZE);
    ipcMain.removeAllListeners(IPC_CHANNELS.WINDOW_CLOSE);
    ipcMain.removeAllListeners(IPC_CHANNELS.WINDOW_IS_MAXIMIZED);
  }
}

module.exports = WindowController;
