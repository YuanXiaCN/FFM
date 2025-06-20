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
      const result = await this.checkVersionIntegrity(versionJson, versionId)
      return result.isComplete
    } catch (error) {
      return false
    }
  }

  // 详细的完整性检查
  async checkVersionIntegrity(versionJson, versionId) {
    const result = {
      isComplete: true,
      missingFiles: [],
      corruptedFiles: [],
      totalFiles: 0,
      checkedFiles: 0,
      details: {
        client: { exists: false, valid: false },
        libraries: { total: 0, missing: 0, corrupted: 0 },
        assets: { total: 0, missing: 0, corrupted: 0 },
        configs: { exists: false, valid: false }
      }
    }

    try {
      // 1. 检查客户端jar文件
      const jarPath = path.join(this.versionsDir, versionId, `${versionId}.jar`)
      result.totalFiles++
      
      if (await this.fileExists(jarPath)) {
        result.details.client.exists = true
        result.checkedFiles++
        
        // 验证SHA1（如果有的话）
        if (versionJson.downloads?.client?.sha1) {
          const actualSha1 = await this.calculateFileSha1(jarPath)
          result.details.client.valid = actualSha1 === versionJson.downloads.client.sha1
          if (!result.details.client.valid) {
            result.corruptedFiles.push({
              path: jarPath,
              type: 'client',
              expected: versionJson.downloads.client.sha1,
              actual: actualSha1
            })
          }
        } else {
          result.details.client.valid = true
        }
      } else {
        result.isComplete = false
        result.missingFiles.push({
          path: jarPath,
          type: 'client',
          url: versionJson.downloads?.client?.url,
          sha1: versionJson.downloads?.client?.sha1,
          size: versionJson.downloads?.client?.size
        })
      }

      // 2. 检查依赖库文件
      const librariesDir = path.join(this.mcDirectory, 'libraries')
      if (versionJson.libraries) {
        for (const library of versionJson.libraries) {
          if (this.shouldDownloadLibrary(library) && library.downloads?.artifact) {
            result.details.libraries.total++
            result.totalFiles++
            
            const libPath = path.join(librariesDir, library.downloads.artifact.path)
            
            if (await this.fileExists(libPath)) {
              result.checkedFiles++
              
              // 验证SHA1
              if (library.downloads.artifact.sha1) {
                const actualSha1 = await this.calculateFileSha1(libPath)
                if (actualSha1 !== library.downloads.artifact.sha1) {
                  result.details.libraries.corrupted++
                  result.corruptedFiles.push({
                    path: libPath,
                    type: 'library',
                    name: library.name,
                    expected: library.downloads.artifact.sha1,
                    actual: actualSha1,
                    url: library.downloads.artifact.url,
                    size: library.downloads.artifact.size
                  })
                }
              }
            } else {
              result.details.libraries.missing++
              result.missingFiles.push({
                path: libPath,
                type: 'library',
                name: library.name,
                url: library.downloads.artifact.url,
                sha1: library.downloads.artifact.sha1,
                size: library.downloads.artifact.size
              })
            }
          }
        }
      }

      // 3. 检查资源文件索引
      if (versionJson.assetIndex) {
        const assetIndexPath = path.join(this.mcDirectory, 'assets', 'indexes', `${versionJson.assetIndex.id}.json`)
        result.totalFiles++
        
        if (await this.fileExists(assetIndexPath)) {
          result.checkedFiles++
          
          // 验证资源索引SHA1
          if (versionJson.assetIndex.sha1) {
            const actualSha1 = await this.calculateFileSha1(assetIndexPath)
            if (actualSha1 !== versionJson.assetIndex.sha1) {
              result.corruptedFiles.push({
                path: assetIndexPath,
                type: 'asset-index',
                expected: versionJson.assetIndex.sha1,
                actual: actualSha1,
                url: versionJson.assetIndex.url,
                size: versionJson.assetIndex.size
              })
            }
          }
        } else {
          result.missingFiles.push({
            path: assetIndexPath,
            type: 'asset-index',
            url: versionJson.assetIndex.url,
            sha1: versionJson.assetIndex.sha1,
            size: versionJson.assetIndex.size
          })
        }
      }

      // 4. 检查版本配置文件
      const versionConfigPath = path.join(this.versionsDir, versionId, `${versionId}.json`)
      if (await this.fileExists(versionConfigPath)) {
        result.details.configs.exists = true
        result.details.configs.valid = true
      }

      // 判断整体完整性
      result.isComplete = result.missingFiles.length === 0 && result.corruptedFiles.length === 0

      return result
    } catch (error) {
      result.isComplete = false
      result.error = error.message
      return result
    }
  }

  // 检查是否应该下载该库（适配不同操作系统）
  shouldDownloadLibrary(library) {
    if (!library.rules) return true
    
    let allow = false
    
    for (const rule of library.rules) {
      if (rule.action === 'allow') {
        if (!rule.os || this.matchesCurrentOS(rule.os)) {
          allow = true
        }
      } else if (rule.action === 'disallow') {
        if (!rule.os || this.matchesCurrentOS(rule.os)) {
          allow = false
        }
      }
    }
    
    return allow
  }

  // 检查操作系统匹配
  matchesCurrentOS(osRule) {
    const platform = process.platform
    
    if (osRule.name) {
      switch (osRule.name) {
        case 'windows':
          return platform === 'win32'
        case 'linux':
          return platform === 'linux'
        case 'osx':
          return platform === 'darwin'
        default:
          return false
      }
    }
    
    return true
  }
  // 计算文件SHA1 - 异步分块读取避免阻塞
  async calculateFileSha1(filePath) {
    const crypto = require('crypto')
    const fs = require('fs')
    
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha1')
      const stream = fs.createReadStream(filePath, { 
        highWaterMark: 64 * 1024 // 64KB chunks to avoid blocking
      })
      
      stream.on('data', data => {
        hash.update(data)
        // 让出执行权，避免阻塞事件循环
        setImmediate(() => {})
      })
      
      stream.on('end', () => resolve(hash.digest('hex')))
      stream.on('error', reject)
      
      // 超时保护
      setTimeout(() => {
        stream.destroy()
        reject(new Error('SHA1计算超时'))
      }, 30000) // 30秒超时
    })
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
