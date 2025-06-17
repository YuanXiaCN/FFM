// 版本管理工具
const fs = require('fs')
const path = require('path')
const fsPromises = fs.promises

class VersionManager {
  constructor(mcDirectory) {
    this.mcDirectory = mcDirectory
    this.versionsDir = path.join(mcDirectory, 'versions')
  }
  
  // 获取所有已安装的版本
  async getInstalledVersions() {
    try {
      await fsPromises.access(this.versionsDir)
      const versionDirs = await fsPromises.readdir(this.versionsDir)
      const versions = []
      
      for (const versionDir of versionDirs) {
        const versionPath = path.join(this.versionsDir, versionDir)
        const stat = await fsPromises.stat(versionPath)
        
        if (stat.isDirectory()) {
          const jsonPath = path.join(versionPath, `${versionDir}.json`)
          const jarPath = path.join(versionPath, `${versionDir}.jar`)
          
          if (await this.fileExists(jsonPath)) {
            try {
              const versionJson = JSON.parse(await fsPromises.readFile(jsonPath, 'utf8'))
              const hasJar = await this.fileExists(jarPath)
              
              versions.push({
                id: versionDir,
                type: versionJson.type || 'unknown',
                releaseTime: versionJson.releaseTime,
                mainClass: versionJson.mainClass,
                hasJar,
                complete: hasJar && await this.isVersionComplete(versionJson, versionDir)
              })
            } catch (error) {
              console.warn(`解析版本 ${versionDir} 失败:`, error.message)
            }
          }
        }
      }
      
      return versions.sort((a, b) => new Date(b.releaseTime) - new Date(a.releaseTime))
    } catch (error) {
      return []
    }
  }
  
  // 检查版本是否完整
  async isVersionComplete(versionJson, versionId) {
    try {
      // 检查客户端jar
      const jarPath = path.join(this.versionsDir, versionId, `${versionId}.jar`)
      if (!await this.fileExists(jarPath)) {
        return false
      }
      
      // 检查关键依赖库
      const librariesDir = path.join(this.mcDirectory, 'libraries')
      let missingLibraries = 0
      
      if (versionJson.libraries) {
        for (const library of versionJson.libraries) {
          if (library.downloads?.artifact) {
            const libPath = path.join(librariesDir, library.downloads.artifact.path)
            if (!await this.fileExists(libPath)) {
              missingLibraries++
            }
          }
        }
      }
      
      // 允许少量依赖库缺失（可能是平台特定的）
      return missingLibraries < 5
    } catch (error) {
      return false
    }
  }
  
  // 删除版本
  async deleteVersion(versionId) {
    const versionPath = path.join(this.versionsDir, versionId)
    await this.deleteDirectory(versionPath)
  }
  
  // 获取版本信息
  async getVersionInfo(versionId) {
    const jsonPath = path.join(this.versionsDir, versionId, `${versionId}.json`)
    if (await this.fileExists(jsonPath)) {
      return JSON.parse(await fsPromises.readFile(jsonPath, 'utf8'))
    }
    return null
  }
  
  // 工具方法
  async fileExists(filePath) {
    try {
      await fsPromises.access(filePath)
      return true
    } catch {
      return false
    }
  }
  
  async deleteDirectory(dirPath) {
    if (await this.fileExists(dirPath)) {
      const files = await fsPromises.readdir(dirPath)
      
      for (const file of files) {
        const filePath = path.join(dirPath, file)
        const stat = await fsPromises.stat(filePath)
        
        if (stat.isDirectory()) {
          await this.deleteDirectory(filePath)
        } else {
          await fsPromises.unlink(filePath)
        }
      }
      
      await fsPromises.rmdir(dirPath)
    }
  }
  
  // 获取版本大小
  async getVersionSize(versionId) {
    const versionPath = path.join(this.versionsDir, versionId)
    return await this.getDirectorySize(versionPath)
  }
  
  async getDirectorySize(dirPath) {
    let totalSize = 0
    
    try {
      const files = await fsPromises.readdir(dirPath)
      
      for (const file of files) {
        const filePath = path.join(dirPath, file)
        const stat = await fsPromises.stat(filePath)
        
        if (stat.isDirectory()) {
          totalSize += await this.getDirectorySize(filePath)
        } else {
          totalSize += stat.size
        }
      }
    } catch (error) {
      // 目录不存在或无法访问
    }
    
    return totalSize
  }
  
  // 格式化大小
  formatSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB']
    let size = bytes
    let unitIndex = 0
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }
    
    return `${size.toFixed(2)} ${units[unitIndex]}`
  }
}

module.exports = VersionManager
