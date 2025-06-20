// src/services/NewMainDownloadService.cjs
// 新的主下载服务 - 整合所有下载相关功能
const { ipcMain } = require('electron');
const path = require('path');
const { logger } = require('../../utils.cjs');

// 导入新的服务组件
const NewDownloadManager = require('./NewDownloadManager.cjs');
const NewBMCLAPIManager = require('./NewBMCLAPIManager.cjs');
const NewIntegrityService = require('./NewIntegrityService.cjs');
const NewGameInitService = require('./NewGameInitService.cjs');

/**
 * 新的主下载服务
 */
class NewMainDownloadService {
  constructor() {
    this.downloadManager = null;
    this.bmclapiManager = null;
    this.integrityService = null;
    this.gameInitService = null;
    
    this.currentSession = null;
    this.isInitialized = false;
    
    this.init();
  }

  /**
   * 初始化所有服务
   */
  init() {
    try {
      // 初始化各个管理器
      this.downloadManager = new NewDownloadManager({
        maxConcurrency: 32,
        minConcurrency: 4
      });
      
      this.bmclapiManager = new NewBMCLAPIManager();
      this.integrityService = new NewIntegrityService(this.bmclapiManager, this.downloadManager);
      this.gameInitService = new NewGameInitService();
      
      // 设置事件监听
      this.setupEventHandlers();
      
      // 设置IPC处理器
      this.setupIPCHandlers();
      
      this.isInitialized = true;
      logger.info('New download service initialized successfully');
      
    } catch (error) {
      logger.error(`Failed to initialize download service: ${error.message}`);
      throw error;
    }
  }

  /**
   * 设置事件处理器
   */
  setupEventHandlers() {
    // 下载进度事件
    this.downloadManager.on('progress', (progressData) => {
      if (this.currentSession) {
        this.sendToRenderer('download:progress', {
          ...progressData,
          sessionId: this.currentSession.id
        });
      }
    });

    // 任务开始事件
    this.downloadManager.on('taskStarted', (task) => {
      logger.info(`Download started: ${path.basename(task.dest)}`);
      if (this.currentSession) {
        this.sendToRenderer('download:taskStarted', {
          taskId: task.id,
          fileName: path.basename(task.dest),
          size: task.size,
          sessionId: this.currentSession.id
        });
      }
    });

    // 任务完成事件
    this.downloadManager.on('taskCompleted', (task) => {
      logger.info(`Download completed: ${path.basename(task.dest)}`);
      if (this.currentSession) {
        this.sendToRenderer('download:taskCompleted', {
          taskId: task.id,
          fileName: path.basename(task.dest),
          sessionId: this.currentSession.id
        });
      }
    });

    // 任务失败事件
    this.downloadManager.on('taskFailed', (task) => {
      logger.error(`Download failed: ${path.basename(task.dest)} - ${task.error}`);
      if (this.currentSession) {
        this.sendToRenderer('download:taskFailed', {
          taskId: task.id,
          fileName: path.basename(task.dest),
          error: task.error,
          sessionId: this.currentSession.id
        });
      }
    });

    // 全部完成事件
    this.downloadManager.on('allCompleted', (stats) => {
      logger.info(`All downloads completed: ${stats.completed}/${stats.total} files`);
      
      if (this.currentSession) {
        this.handleDownloadComplete(stats);
      }
    });
  }

  /**
   * 设置IPC处理器
   */
  setupIPCHandlers() {
    // 获取可用版本
    ipcMain.handle('download:getVersions', async (event, type = 'all') => {
      try {
        const versions = await this.bmclapiManager.getAvailableVersions(type);
        return { success: true, versions };
      } catch (error) {
        logger.error(`Failed to get versions: ${error.message}`);
        return { success: false, error: error.message };
      }
    });

    // 开始下载版本
    ipcMain.handle('download:startVersion', async (event, options) => {
      try {
        const result = await this.startVersionDownload(options, event.sender);
        return result;
      } catch (error) {
        logger.error(`Failed to start download: ${error.message}`);
        return { success: false, error: error.message };
      }
    });

    // 暂停下载
    ipcMain.handle('download:pause', async (event) => {
      try {
        this.downloadManager.pause();
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    // 恢复下载
    ipcMain.handle('download:resume', async (event) => {
      try {
        this.downloadManager.resume();
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    // 停止下载
    ipcMain.handle('download:stop', async (event) => {
      try {
        this.downloadManager.stop();
        this.currentSession = null;
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    // 检查版本完整性
    ipcMain.handle('download:checkIntegrity', async (event, versionId) => {
      try {
        const results = await this.integrityService.checkVersionIntegrity(versionId);
        return { success: true, results };
      } catch (error) {
        logger.error(`Integrity check failed: ${error.message}`);
        return { success: false, error: error.message };
      }
    });

    // 修复版本
    ipcMain.handle('download:repairVersion', async (event, versionId) => {
      try {
        const results = await this.integrityService.repairVersion(versionId);
        return { success: true, results };
      } catch (error) {
        logger.error(`Version repair failed: ${error.message}`);
        return { success: false, error: error.message };
      }
    });

    // 获取已安装版本
    ipcMain.handle('download:getInstalledVersions', async (event) => {
      try {
        const versions = await this.gameInitService.getInstalledVersions();
        return { success: true, versions };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    // 删除版本
    ipcMain.handle('download:deleteVersion', async (event, versionId) => {
      try {
        const result = await this.gameInitService.deleteVersion(versionId);
        return { success: true, result };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    // 测试下载源连接
    ipcMain.handle('download:testConnection', async (event) => {
      try {
        const bmclTest = await this.bmclapiManager.testConnection();
        return { success: true, bmclapi: bmclTest };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * 开始版本下载
   */
  async startVersionDownload(options, sender) {
    const { versionId, downloadOptions = {} } = options;
    
    logger.info(`Starting download for version ${versionId}`);
    
    try {
      // 重置下载管理器
      this.downloadManager.reset();
      
      // 创建下载会话
      this.currentSession = {
        id: Date.now().toString(),
        versionId,
        sender,
        startTime: Date.now(),
        options: downloadOptions
      };

      // 1. 获取版本数据
      this.sendToRenderer('download:status', { 
        status: 'fetching-version-data', 
        message: '正在获取版本信息...' 
      });
      
      const versionData = await this.bmclapiManager.getVersionDetails(versionId);

      // 2. 初始化版本
      this.sendToRenderer('download:status', { 
        status: 'initializing', 
        message: '正在初始化版本...' 
      });
      
      await this.gameInitService.initializeVersion(versionId, versionData, downloadOptions);

      // 3. 生成下载任务
      this.sendToRenderer('download:status', { 
        status: 'generating-tasks', 
        message: '正在生成下载任务...' 
      });
      
      const downloadTasks = await this.bmclapiManager.getDownloadTasks(versionId);
      
      logger.info(`Generated ${downloadTasks.length} download tasks`);

      // 4. 开始下载
      this.sendToRenderer('download:status', { 
        status: 'downloading', 
        message: '开始下载文件...' 
      });
      
      this.downloadManager.addTasks(downloadTasks);

      return {
        success: true,
        sessionId: this.currentSession.id,
        totalTasks: downloadTasks.length,
        versionId
      };

    } catch (error) {
      logger.error(`Download start failed: ${error.message}`);
      
      if (this.currentSession) {
        this.sendToRenderer('download:error', {
          error: error.message,
          sessionId: this.currentSession.id
        });
        this.currentSession = null;
      }
      
      throw error;
    }
  }

  /**
   * 处理下载完成
   */
  async handleDownloadComplete(stats) {
    if (!this.currentSession) return;

    const { versionId } = this.currentSession;
    
    try {
      if (stats.failed > 0) {
        // 有文件下载失败
        logger.error(`Download completed with ${stats.failed} failed files`);
        
        this.sendToRenderer('download:completed', {
          success: false,
          stats,
          sessionId: this.currentSession.id,
          message: `下载完成，但有 ${stats.failed} 个文件下载失败`
        });

        // 显示错误对话框
        this.sendToRenderer('download:showError', {
          title: '下载失败',
          message: `版本 ${versionId} 下载过程中有 ${stats.failed} 个文件下载失败。`,
          details: '请检查网络连接或尝试重新下载。',
          sessionId: this.currentSession.id,
          failedCount: stats.failed,
          actions: ['exportLog', 'feedback', 'retry']
        });

      } else {
        // 下载成功，进行完整性检查
        logger.info('All files downloaded successfully, checking integrity...');
        
        this.sendToRenderer('download:status', { 
          status: 'verifying', 
          message: '正在验证文件完整性...' 
        });

        const integrityResults = await this.integrityService.checkVersionIntegrity(versionId);
        
        if (integrityResults.missingFiles.length === 0 && integrityResults.corruptedFiles.length === 0) {
          // 完整性检查通过
          await this.gameInitService.markVersionComplete(versionId);
          
          logger.info(`Version ${versionId} download and verification completed successfully`);
          
          this.sendToRenderer('download:completed', {
            success: true,
            stats,
            integrityResults,
            sessionId: this.currentSession.id,
            message: `版本 ${versionId} 下载完成！`
          });

        } else {
          // 需要修复文件
          logger.warn('Integrity check failed, starting repair...');
          
          this.sendToRenderer('download:status', { 
            status: 'repairing', 
            message: '正在修复损坏的文件...' 
          });

          const repairResults = await this.integrityService.repairVersion(versionId);
          
          if (repairResults.success) {
            await this.gameInitService.markVersionComplete(versionId);
            
            this.sendToRenderer('download:completed', {
              success: true,
              stats,
              repairResults,
              sessionId: this.currentSession.id,
              message: `版本 ${versionId} 下载并修复完成！`
            });
          } else {
            this.sendToRenderer('download:completed', {
              success: false,
              stats,
              repairResults,
              sessionId: this.currentSession.id,
              message: `版本 ${versionId} 修复失败`
            });
          }
        }
      }

    } catch (error) {
      logger.error(`Post-download processing failed: ${error.message}`);
      
      this.sendToRenderer('download:error', {
        error: error.message,
        sessionId: this.currentSession.id
      });
    } finally {
      // 清理会话
      setTimeout(() => {
        this.currentSession = null;
      }, 5000); // 5秒后清理会话
    }
  }

  /**
   * 发送消息到渲染进程
   */
  sendToRenderer(channel, data) {
    if (this.currentSession && this.currentSession.sender) {
      this.currentSession.sender.send(channel, data);
    }
  }

  /**
   * 获取下载统计
   */
  getDownloadStats() {
    if (!this.downloadManager) return null;
    
    return this.downloadManager.getStats();
  }

  /**
   * 获取当前会话信息
   */
  getCurrentSession() {
    return this.currentSession;
  }

  /**
   * 清理资源
   */
  cleanup() {
    if (this.downloadManager) {
      this.downloadManager.stop();
    }
    
    this.currentSession = null;
    
    // 移除IPC处理器
    ipcMain.removeAllListeners('download:getVersions');
    ipcMain.removeAllListeners('download:startVersion');
    ipcMain.removeAllListeners('download:pause');
    ipcMain.removeAllListeners('download:resume');
    ipcMain.removeAllListeners('download:stop');
    ipcMain.removeAllListeners('download:checkIntegrity');
    ipcMain.removeAllListeners('download:repairVersion');
    ipcMain.removeAllListeners('download:getInstalledVersions');
    ipcMain.removeAllListeners('download:deleteVersion');
    ipcMain.removeAllListeners('download:testConnection');
    
    logger.info('Download service cleaned up');
  }
}

// 导出单例
let instance = null;

module.exports = {
  getInstance() {
    if (!instance) {
      instance = new NewMainDownloadService();
    }
    return instance;
  },
  
  cleanup() {
    if (instance) {
      instance.cleanup();
      instance = null;
    }
  }
};
