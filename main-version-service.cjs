// 版本管理服务 - 主进程
const { ipcMain } = require('electron')
const os = require('os')
const path = require('path')
const configService = require('./main-config-service.cjs')
const VersionManager = require('./src/services/VersionManager.cjs')

// 获取版本管理器实例
function getVersionManager() {
  const mcDirectory = configService.getConfig('mcDirectory') || path.join(os.homedir(), '.minecraft')
  return new VersionManager(mcDirectory)
}

// 获取已安装版本列表
ipcMain.handle('version:getInstalled', async () => {
  try {
    const manager = getVersionManager()
    return await manager.getInstalledVersions()
  } catch (error) {
    console.error('获取已安装版本失败:', error)
    return []
  }
})

// 获取版本详细信息
ipcMain.handle('version:getInfo', async (event, versionId) => {
  try {
    const manager = getVersionManager()
    return await manager.getVersionInfo(versionId)
  } catch (error) {
    console.error('获取版本信息失败:', error)
    return null
  }
})

// 删除版本
ipcMain.handle('version:delete', async (event, versionId) => {
  try {
    const manager = getVersionManager()
    await manager.deleteVersion(versionId)
    return { success: true }
  } catch (error) {
    console.error('删除版本失败:', error)
    return { success: false, error: error.message }
  }
})

// 获取版本大小
ipcMain.handle('version:getSize', async (event, versionId) => {
  try {
    const manager = getVersionManager()
    const size = await manager.getVersionSize(versionId)
    return {
      bytes: size,
      formatted: manager.formatSize(size)
    }
  } catch (error) {
    console.error('获取版本大小失败:', error)
    return { bytes: 0, formatted: '0 B' }
  }
})

// 检查版本完整性
ipcMain.handle('version:checkIntegrity', async (event, versionId) => {
  try {
    const manager = getVersionManager()
    const versionInfo = await manager.getVersionInfo(versionId)
    if (!versionInfo) {
      return { complete: false, error: '版本信息不存在' }
    }
    
    const complete = await manager.isVersionComplete(versionInfo, versionId)
    return { complete }
  } catch (error) {
    console.error('检查版本完整性失败:', error)
    return { complete: false, error: error.message }
  }
})

module.exports = {
  getVersionManager
}
