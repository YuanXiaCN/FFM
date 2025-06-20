// 完整性检查和修复主服务 - 整合所有相关功能
const { ipcMain } = require('electron')
const path = require('path')
const { logger } = require('../../utils.cjs')
const configService = require('../../main-config-service.cjs')

// 导入服务
const VersionManager = require('./VersionManager.cjs')
const FileRepairService = require('./FileRepairService.cjs')
const GameInitializationService = require('./GameInitializationService.cjs')
const AdvancedDownloadManager = require('./AdvancedDownloadManager.cjs')
const DownloadSourceManager = require('./DownloadSourceManager.cjs')

class IntegrityAndRepairService {
  constructor() {
    this.mcDirectory = configService.getConfig('mcDirectory') || path.join(process.cwd(), '.minecraft')
    this.versionManager = new VersionManager(this.mcDirectory)
    this.gameInitService = new GameInitializationService(this.mcDirectory)
    
    // 下载管理器实例（延迟初始化）
    this.downloadManager = null
    this.sourceManager = null
    this.fileRepairService = null
    
    this.isProcessing = false
    this.currentOperation = null
  }

  /**
   * 初始化下载管理器
   */
  initializeManagers() {
    if (!this.downloadManager) {
      this.downloadManager = new AdvancedDownloadManager({
        maxConcurrentFiles: 24,
        largeFileThreshold: 5 * 1024 * 1024,
        maxThreadsPerFile: 4,
        chunkSize: 4 * 1024 * 1024,
        tempDir: path.join(process.cwd(), 'temp'),
        enableAdaptiveConcurrency: true,
        bandwidthMonitor: true
      })
    }

    if (!this.sourceManager) {
      this.sourceManager = new DownloadSourceManager()
    }

    if (!this.fileRepairService) {
      this.fileRepairService = new FileRepairService(this.downloadManager, this.sourceManager)
    }
  }

  /**
   * 检查版本完整性
   * @param {string} versionId - 版本ID
   * @returns {Object} 完整性检查结果
   */
  async checkVersionIntegrity(versionId) {
    try {
      logger.info(`开始检查版本 ${versionId} 的完整性`)

      const versionInfo = await this.versionManager.getVersionInfo(versionId)
      if (!versionInfo) {
        throw new Error(`版本 ${versionId} 不存在`)
      }

      const integrityResult = await this.versionManager.checkVersionIntegrity(versionInfo, versionId)
      
      logger.info(`版本 ${versionId} 完整性检查完成: ${integrityResult.isComplete ? '完整' : '不完整'}`)
      
      return {
        success: true,
        versionId,
        ...integrityResult
      }

    } catch (error) {
      logger.error(`版本完整性检查失败: ${error.message}`)
      return {
        success: false,
        error: error.message,
        versionId
      }
    }
  }

  /**
   * 修复版本文件
   * @param {string} versionId - 版本ID  
   * @param {Function} progressCallback - 进度回调
   * @returns {Object} 修复结果
   */
  async repairVersion(versionId, progressCallback) {
    if (this.isProcessing) {
      throw new Error('已有操作正在进行中')
    }

    this.isProcessing = true
    this.currentOperation = 'repair'

    try {
      logger.info(`开始修复版本 ${versionId}`)

      // 初始化管理器
      this.initializeManagers()

      // 1. 检查完整性
      if (progressCallback) {
        progressCallback({
          type: 'integrity-check',
          progress: 0,
          status: '检查文件完整性...'
        })
      }

      const integrityResult = await this.checkVersionIntegrity(versionId)
      
      if (!integrityResult.success) {
        throw new Error(`完整性检查失败: ${integrityResult.error}`)
      }

      if (integrityResult.isComplete) {
        logger.info(`版本 ${versionId} 文件完整，无需修复`)
        return {
          success: true,
          versionId,
          repairedFiles: 0,
          message: '文件完整，无需修复'
        }
      }

      // 2. 执行文件修复
      if (progressCallback) {
        progressCallback({
          type: 'repair',
          progress: 20,
          status: '开始修复文件...',
          missingFiles: integrityResult.missingFiles.length,
          corruptedFiles: integrityResult.corruptedFiles.length
        })
      }

      const versionInfo = await this.versionManager.getVersionInfo(versionId)
      const repairResult = await this.fileRepairService.repairVersion(
        integrityResult,
        versionInfo,
        versionId,
        (progress) => {
          if (progressCallback) {
            progressCallback({
              ...progress,
              progress: 20 + (progress.progress * 0.6) // 20% - 80%
            })
          }
        }
      )

      // 3. 重新检查完整性
      if (progressCallback) {
        progressCallback({
          type: 'verify',
          progress: 85,
          status: '验证修复结果...'
        })
      }

      const finalCheck = await this.checkVersionIntegrity(versionId)

      // 4. 如果修复成功，重新初始化游戏
      if (finalCheck.success && finalCheck.isComplete) {
        if (progressCallback) {
          progressCallback({
            type: 'initialize',
            progress: 90,
            status: '重新初始化游戏配置...'
          })
        }

        await this.gameInitService.initializeGameVersion(versionId, versionInfo, {
          maxMemory: 4096,
          minMemory: 1024
        })
      }

      if (progressCallback) {
        progressCallback({
          type: 'complete',
          progress: 100,
          status: '修复完成'
        })
      }

      logger.info(`版本 ${versionId} 修复完成`)

      return {
        success: repairResult.success,
        versionId,
        repairedFiles: repairResult.repairedFiles,
        failedFiles: repairResult.failedFiles,
        isComplete: finalCheck.isComplete,
        message: finalCheck.isComplete ? '修复成功' : '部分文件修复失败'
      }

    } catch (error) {
      logger.error(`版本修复失败: ${error.message}`)
      throw error
    } finally {
      this.isProcessing = false
      this.currentOperation = null
    }
  }

  /**
   * 完整的下载后处理流程
   * @param {string} versionId - 版本ID
   * @param {Object} versionJson - 版本JSON数据
   * @param {Object} options - 选项
   * @param {Function} progressCallback - 进度回调
   */
  async postDownloadProcess(versionId, versionJson, options = {}, progressCallback) {
    if (this.isProcessing) {
      throw new Error('已有操作正在进行中')
    }

    this.isProcessing = true
    this.currentOperation = 'post-download'

    try {
      logger.info(`开始执行版本 ${versionId} 的下载后处理`)

      // 1. 检查完整性
      if (progressCallback) {
        progressCallback({
          type: 'integrity-check',
          progress: 0,
          status: '检查下载完整性...'
        })
      }

      const integrityResult = await this.versionManager.checkVersionIntegrity(versionJson, versionId)

      // 2. 如果不完整，自动修复
      if (!integrityResult.isComplete) {
        logger.info(`检测到 ${integrityResult.missingFiles.length + integrityResult.corruptedFiles.length} 个文件需要修复`)
        
        if (progressCallback) {
          progressCallback({
            type: 'repair',
            progress: 20,
            status: '自动修复缺失文件...',
            missingFiles: integrityResult.missingFiles.length,
            corruptedFiles: integrityResult.corruptedFiles.length
          })
        }

        // 初始化管理器
        this.initializeManagers()

        await this.fileRepairService.repairVersion(
          integrityResult,
          versionJson,
          versionId,
          (progress) => {
            if (progressCallback) {
              progressCallback({
                ...progress,
                progress: 20 + (progress.progress * 0.5) // 20% - 70%
              })
            }
          }
        )
      }

      // 3. 初始化游戏配置
      if (progressCallback) {
        progressCallback({
          type: 'initialize',
          progress: 75,
          status: '初始化游戏配置...'
        })
      }

      const initResult = await this.gameInitService.initializeGameVersion(versionId, versionJson, {
        maxMemory: options.maxMemory || 4096,
        minMemory: options.minMemory || 1024,
        windowWidth: options.windowWidth || 854,
        windowHeight: options.windowHeight || 480,
        fullscreen: options.fullscreen || false,
        javaPath: options.javaPath,
        extraArgs: options.extraArgs || ""
      })

      // 4. 最终验证
      if (progressCallback) {
        progressCallback({
          type: 'verify',
          progress: 90,
          status: '最终验证...'
        })
      }

      const finalValidation = await this.gameInitService.validateInitialization(versionId)

      if (progressCallback) {
        progressCallback({
          type: 'complete',
          progress: 100,
          status: '游戏安装完成'
        })
      }

      logger.info(`版本 ${versionId} 下载后处理完成`)

      return {
        success: finalValidation.isValid,
        versionId,
        integrityCheck: integrityResult,
        initialization: initResult,
        validation: finalValidation,
        message: finalValidation.isValid ? '游戏安装成功，可以开始游戏' : '安装过程中出现问题'
      }

    } catch (error) {
      logger.error(`下载后处理失败: ${error.message}`)
      throw error
    } finally {
      this.isProcessing = false
      this.currentOperation = null
    }
  }

  /**
   * 获取当前处理状态
   */
  getProcessingStatus() {
    return {
      isProcessing: this.isProcessing,
      currentOperation: this.currentOperation,
      repairStatus: this.fileRepairService ? this.fileRepairService.getRepairStatus() : null
    }
  }

  /**
   * 取消当前操作
   */
  async cancelCurrentOperation() {
    if (!this.isProcessing) {
      return { success: true, message: '没有正在进行的操作' }
    }

    try {
      if (this.currentOperation === 'repair' && this.fileRepairService) {
        await this.fileRepairService.cancelRepair()
      }

      this.isProcessing = false
      this.currentOperation = null

      logger.info('已取消当前操作')
      return { success: true, message: '操作已取消' }

    } catch (error) {
      logger.error(`取消操作失败: ${error.message}`)
      return { success: false, error: error.message }
    }
  }
}

// 创建全局实例
const integrityService = new IntegrityAndRepairService()

// IPC 事件处理
ipcMain.handle('integrity:check', async (event, versionId) => {
  try {
    return await integrityService.checkVersionIntegrity(versionId)
  } catch (error) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('integrity:repair', async (event, versionId) => {
  try {
    return await integrityService.repairVersion(versionId, (progress) => {
      event.sender.send('integrity:repairProgress', progress)
    })
  } catch (error) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('integrity:postDownload', async (event, versionId, versionJson, options) => {
  try {
    return await integrityService.postDownloadProcess(versionId, versionJson, options, (progress) => {
      event.sender.send('integrity:postDownloadProgress', progress)
    })
  } catch (error) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('integrity:getStatus', async () => {
  try {
    return { success: true, status: integrityService.getProcessingStatus() }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('integrity:cancel', async () => {
  try {
    return await integrityService.cancelCurrentOperation()
  } catch (error) {
    return { success: false, error: error.message }
  }
})

module.exports = IntegrityAndRepairService
