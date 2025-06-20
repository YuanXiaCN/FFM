// 文件修复服务 - 负责修复缺失或损坏的Minecraft文件
const fs = require('fs')
const path = require('path')
const fse = require('fs-extra')
const { logger } = require('../../utils.cjs')

class FileRepairService {
  constructor(downloadManager, sourceManager) {
    this.downloadManager = downloadManager
    this.sourceManager = sourceManager
    this.repairTasks = []
    this.isRepairing = false
  }

  /**
   * 修复版本文件
   * @param {Object} integrityResult - 完整性检查结果
   * @param {Object} versionJson - 版本JSON
   * @param {string} versionId - 版本ID
   * @param {Function} progressCallback - 进度回调
   */
  async repairVersion(integrityResult, versionJson, versionId, progressCallback) {
    if (this.isRepairing) {
      throw new Error('文件修复正在进行中')
    }

    this.isRepairing = true
    this.repairTasks = []

    try {
      logger.info(`开始修复版本 ${versionId}，需要修复 ${integrityResult.missingFiles.length + integrityResult.corruptedFiles.length} 个文件`)

      // 构建修复任务列表
      await this.buildRepairTasks(integrityResult, versionJson, versionId)

      if (this.repairTasks.length === 0) {
        logger.info('没有需要修复的文件')
        return { success: true, repairedFiles: 0 }
      }

      // 执行修复
      const result = await this.executeRepairTasks(progressCallback)
      
      logger.info(`文件修复完成，成功修复 ${result.repairedFiles} 个文件`)
      return result

    } catch (error) {
      logger.error(`文件修复失败: ${error.message}`)
      throw error
    } finally {
      this.isRepairing = false
      this.repairTasks = []
    }
  }

  /**
   * 构建修复任务列表
   */
  async buildRepairTasks(integrityResult, versionJson, versionId) {
    // 处理缺失文件
    for (const missingFile of integrityResult.missingFiles) {
      if (missingFile.url) {
        this.repairTasks.push({
          id: `repair-missing-${Date.now()}-${Math.random()}`,
          type: 'missing',
          originalType: missingFile.type,
          url: this.sourceManager.transformUrl(missingFile.url),
          dest: missingFile.path,
          expectedSha1: missingFile.sha1,
          size: missingFile.size,
          priority: this.getRepairPriority(missingFile.type),
          name: missingFile.name || path.basename(missingFile.path)
        })
      }
    }

    // 处理损坏文件
    for (const corruptedFile of integrityResult.corruptedFiles) {
      if (corruptedFile.url) {
        // 先删除损坏的文件
        try {
          if (await this.fileExists(corruptedFile.path)) {
            await fs.promises.unlink(corruptedFile.path)
            logger.info(`已删除损坏文件: ${corruptedFile.path}`)
          }
        } catch (error) {
          logger.warn(`删除损坏文件失败: ${error.message}`)
        }

        this.repairTasks.push({
          id: `repair-corrupted-${Date.now()}-${Math.random()}`,
          type: 'corrupted',
          originalType: corruptedFile.type,
          url: this.sourceManager.transformUrl(corruptedFile.url),
          dest: corruptedFile.path,
          expectedSha1: corruptedFile.expected,
          size: corruptedFile.size,
          priority: this.getRepairPriority(corruptedFile.type),
          name: corruptedFile.name || path.basename(corruptedFile.path)
        })
      }
    }

    logger.info(`构建了 ${this.repairTasks.length} 个修复任务`)
  }

  /**
   * 执行修复任务
   */
  async executeRepairTasks(progressCallback) {
    let repairedFiles = 0
    let failedFiles = 0
    const totalFiles = this.repairTasks.length

    // 按优先级排序
    this.repairTasks.sort((a, b) => b.priority - a.priority)

    // 添加任务到下载管理器
    for (const task of this.repairTasks) {
      await fse.ensureDir(path.dirname(task.dest))
      this.downloadManager.addTask({
        ...task,
        metadata: { isRepair: true }
      })
    }

    // 监听下载进度
    return new Promise((resolve, reject) => {
      const completedTasks = new Set()
      const failedTasks = new Set()

      const checkProgress = () => {
        const completed = completedTasks.size
        const failed = failedTasks.size
        const total = totalFiles
        const progress = total > 0 ? (completed + failed) / total * 100 : 100

        if (progressCallback) {
          progressCallback({
            type: 'repair',
            progress: Math.round(progress),
            completed,
            failed,
            total,
            status: `修复文件中... (${completed}/${total})`
          })
        }

        // 检查是否完成
        if (completed + failed >= total) {
          resolve({
            success: failed === 0,
            repairedFiles: completed,
            failedFiles: failed,
            totalFiles: total
          })
        }
      }

      // 监听下载事件
      const onTaskCompleted = (task) => {
        if (task.metadata?.isRepair && this.repairTasks.find(t => t.id === task.id)) {
          completedTasks.add(task.id)
          repairedFiles++
          logger.info(`文件修复完成: ${task.dest}`)
          checkProgress()
        }
      }

      const onTaskFailed = (task, error) => {
        if (task.metadata?.isRepair && this.repairTasks.find(t => t.id === task.id)) {
          failedTasks.add(task.id)
          failedFiles++
          logger.error(`文件修复失败: ${task.dest}, 错误: ${error.message}`)
          checkProgress()
        }
      }

      // 添加事件监听器
      this.downloadManager.on('taskCompleted', onTaskCompleted)
      this.downloadManager.on('taskFailed', onTaskFailed)

      // 设置超时
      setTimeout(() => {
        this.downloadManager.off('taskCompleted', onTaskCompleted)
        this.downloadManager.off('taskFailed', onTaskFailed)
        reject(new Error('文件修复超时'))
      }, 10 * 60 * 1000) // 10分钟超时

      // 开始检查进度
      checkProgress()
    })
  }

  /**
   * 获取修复优先级
   */
  getRepairPriority(fileType) {
    const priorities = {
      'client': 10,
      'library': 8,
      'asset-index': 7,
      'asset': 5,
      'logging': 3,
      'natives': 6
    }
    return priorities[fileType] || 1
  }

  /**
   * 检查文件是否存在
   */
  async fileExists(filePath) {
    try {
      await fs.promises.access(filePath)
      return true
    } catch {
      return false
    }
  }

  /**
   * 获取修复状态
   */
  getRepairStatus() {
    return {
      isRepairing: this.isRepairing,
      totalTasks: this.repairTasks.length,
      activeTasks: this.downloadManager ? this.downloadManager.getActiveTasks().filter(t => t.metadata?.isRepair).length : 0
    }
  }

  /**
   * 取消修复
   */
  async cancelRepair() {
    if (!this.isRepairing) {
      return
    }

    logger.info('正在取消文件修复...')
    
    // 取消所有修复任务
    for (const task of this.repairTasks) {
      try {
        await this.downloadManager.cancelTask(task.id)
      } catch (error) {
        logger.warn(`取消修复任务失败: ${error.message}`)
      }
    }

    this.isRepairing = false
    this.repairTasks = []
    
    logger.info('文件修复已取消')
  }
}

module.exports = FileRepairService
