// 游戏初始化服务 - 负责在下载完成后初始化游戏配置
const fs = require('fs')
const path = require('path')
const fse = require('fs-extra')
const { logger } = require('../../utils.cjs')

class GameInitializationService {
  constructor(mcDirectory) {
    this.mcDirectory = mcDirectory
    this.versionsDir = path.join(mcDirectory, 'versions')
  }

  /**
   * 初始化游戏版本
   * @param {string} versionId - 版本ID
   * @param {Object} versionJson - 版本JSON数据
   * @param {Object} options - 初始化选项
   */
  async initializeGameVersion(versionId, versionJson, options = {}) {
    try {
      logger.info(`开始初始化游戏版本: ${versionId}`)

      // 1. 创建版本目录结构
      await this.createVersionDirectories(versionId)

      // 2. 创建或更新版本配置文件
      await this.createVersionConfig(versionId, versionJson, options)

      // 3. 更新全局版本列表
      await this.updateGlobalVersionList(versionId, versionJson)

      // 4. 创建启动配置
      await this.createLaunchProfile(versionId, versionJson, options)

      // 5. 设置默认游戏选项
      await this.setupGameOptions(versionId, options)

      logger.info(`游戏版本 ${versionId} 初始化完成`)
      
      return {
        success: true,
        versionId,
        configFiles: await this.getCreatedFiles(versionId)
      }

    } catch (error) {
      logger.error(`游戏版本初始化失败: ${error.message}`)
      throw error
    }
  }

  /**
   * 创建版本目录结构
   */
  async createVersionDirectories(versionId) {
    const versionDir = path.join(this.versionsDir, versionId)
    const nativesDir = path.join(versionDir, 'natives')

    await fse.ensureDir(versionDir)
    await fse.ensureDir(nativesDir)

    logger.info(`已创建版本目录: ${versionDir}`)
  }

  /**
   * 创建版本配置文件
   */
  async createVersionConfig(versionId, versionJson, options) {
    const versionDir = path.join(this.versionsDir, versionId)
    const configPath = path.join(versionDir, `${versionId}.json`)

    // 创建启动器特定的版本配置
    const launcherConfig = {
      id: versionId,
      type: versionJson.type || 'vanilla',
      settings: {
        memory: {
          max: options.maxMemory || 4096,
          min: options.minMemory || 1024
        },
        window: {
          width: options.windowWidth || 854,
          height: options.windowHeight || 480
        },
        fullscreen: options.fullscreen || false,
        useJava: options.javaPath || this.detectJavaPath(),
        startParameters: options.extraArgs || ""
      },
      version: {
        minecraft: this.extractMinecraftVersion(versionJson)
      },
      lastModified: new Date().toISOString()
    }

    // 如果原版本JSON不存在，也保存一份
    const originalJsonPath = path.join(versionDir, `${versionId}.json`)
    if (!await this.fileExists(originalJsonPath)) {
      await fs.promises.writeFile(originalJsonPath, JSON.stringify(versionJson, null, 2), 'utf8')
    }

    // 保存启动器配置（使用不同的文件名避免冲突）
    const launcherConfigPath = path.join(versionDir, `${versionId}_launcher.json`)
    await fs.promises.writeFile(launcherConfigPath, JSON.stringify(launcherConfig, null, 2), 'utf8')

    logger.info(`已创建版本配置: ${launcherConfigPath}`)
  }

  /**
   * 更新全局版本列表
   */
  async updateGlobalVersionList(versionId, versionJson) {
    const versionListPath = path.join(this.versionsDir, 'version.json')
    let versionList = []

    // 读取现有版本列表
    if (await this.fileExists(versionListPath)) {
      try {
        const content = await fs.promises.readFile(versionListPath, 'utf8')
        versionList = JSON.parse(content)
      } catch (error) {
        logger.warn('读取版本列表失败，将创建新的版本列表')
        versionList = []
      }
    }

    // 检查版本是否已存在
    const existingIndex = versionList.findIndex(v => v.id === versionId)
    const versionEntry = {
      id: versionId,
      type: versionJson.type || 'vanilla',
      url: `/${versionId}/${versionId}.json`,
      time: new Date().toISOString(),
      version: {
        minecraft: this.extractMinecraftVersion(versionJson)
      },
      favourite: false,
      lastplay: new Date().toISOString(),
      installed: true,
      complete: true
    }

    if (existingIndex >= 0) {
      // 更新现有版本
      versionList[existingIndex] = { ...versionList[existingIndex], ...versionEntry }
    } else {
      // 添加新版本
      versionList.push(versionEntry)
    }

    // 按时间排序（最新的在前面）
    versionList.sort((a, b) => new Date(b.time) - new Date(a.time))

    // 保存版本列表
    await fs.promises.writeFile(versionListPath, JSON.stringify(versionList, null, 2), 'utf8')
    
    logger.info(`已更新全局版本列表: ${versionListPath}`)
  }

  /**
   * 创建启动配置文件
   */
  async createLaunchProfile(versionId, versionJson, options) {
    const profilesPath = path.join(this.mcDirectory, 'launcher_profiles.json')
    let profiles = {
      profiles: {},
      settings: {
        enableAdvanced: false,
        enableAnalytics: false,
        enableHistorical: false,
        enableReleases: true,
        enableSnapshots: false,
        keepLauncherOpen: false,
        showGameLog: false,
        showMenu: false,
        soundOn: false
      },
      version: 3
    }

    // 读取现有配置
    if (await this.fileExists(profilesPath)) {
      try {
        const content = await fs.promises.readFile(profilesPath, 'utf8')
        profiles = { ...profiles, ...JSON.parse(content) }
      } catch (error) {
        logger.warn('读取启动器配置失败，将创建新配置')
      }
    }

    // 创建或更新版本配置
    const profileId = `${versionId}_profile`
    profiles.profiles[profileId] = {
      created: new Date().toISOString(),
      icon: this.getVersionIcon(versionJson.type),
      lastUsed: new Date().toISOString(),
      lastVersionId: versionId,
      name: `Minecraft ${versionId}`,
      type: "custom",
      javaArgs: options.extraArgs || "",
      javaDir: options.javaPath || this.detectJavaPath(),
      resolution: {
        width: options.windowWidth || 854,
        height: options.windowHeight || 480
      }
    }

    // 保存配置
    await fs.promises.writeFile(profilesPath, JSON.stringify(profiles, null, 2), 'utf8')
    
    logger.info(`已创建启动配置: ${profilesPath}`)
  }

  /**
   * 设置默认游戏选项
   */
  async setupGameOptions(versionId, options) {
    // 创建基本的options.txt文件
    const optionsContent = [
      'version:3465',
      'autoJump:false',
      'autoSuggestions:true',
      'chatColors:true',
      'chatLinks:true',
      'chatLinksPrompt:true',
      'enableVsync:true',
      'entityShadows:true',
      'forceUnicodeFont:false',
      'discrete_mouse_scroll:false',
      'invertYMouse:false',
      'realmsNotifications:true',
      'reducedDebugInfo:false',
      'showSubtitles:false',
      'touchscreen:false',
      'fullscreen:false',
      'bobView:true',
      'toggleCrouch:false',
      'toggleSprint:false',
      'mouseSensitivity:0.5',
      'fov:0.0',
      'screenEffectScale:1.0',
      'fovEffectScale:1.0',
      'gamma:0.0',
      'renderDistance:12',
      'simulationDistance:12',
      'entityDistanceScaling:1.0',
      'guiScale:0',
      'particles:0',
      'maxFps:120',
      'difficulty:2',
      'graphicsMode:1',
      'ao:2',
      'prioritizeChunkUpdates:0',
      'biomeBlendRadius:2',
      'renderClouds:true',
      'resourcePacks:[]',
      'incompatibleResourcePacks:[]',
      'lastServer:',
      'lang:zh_cn',
      'soundDevice:'
    ].join('\n')

    // 这个文件通常在首次运行时由游戏创建，这里只是预设一些合理的默认值
    logger.info(`已准备游戏选项配置`)
  }

  /**
   * 获取版本图标
   */
  getVersionIcon(versionType) {
    const iconMap = {
      'release': 'Grass_Block',
      'snapshot': 'Crafting_Table',
      'old_beta': 'Brick',
      'old_alpha': 'Cobblestone'
    }
    return iconMap[versionType] || 'Grass_Block'
  }

  /**
   * 提取Minecraft版本号
   */
  extractMinecraftVersion(versionJson) {
    // 从版本ID中提取版本号
    if (versionJson.id) {
      // 处理快照版本 (如: 21w03a -> 1.17)
      if (versionJson.id.match(/^\d{2}w\d{2}[a-z]$/)) {
        // 这是快照版本，需要映射到对应的正式版本
        return this.mapSnapshotToRelease(versionJson.id)
      }
      // 普通版本直接返回
      return versionJson.id
    }
    return 'unknown'
  }

  /**
   * 映射快照版本到正式版本
   */
  mapSnapshotToRelease(snapshotId) {
    // 简化的映射逻辑，实际可能需要更复杂的映射表
    const year = parseInt(snapshotId.substring(0, 2))
    const week = parseInt(snapshotId.substring(3, 5))
    
    // 根据年份和周数推测版本
    if (year >= 21) {
      return '1.17+'
    } else if (year >= 20) {
      return '1.16+'
    } else {
      return '1.15+'
    }
  }

  /**
   * 检测Java路径
   */
  detectJavaPath() {
    // 优先使用系统Java
    const commonJavaPaths = [
      'java', // 系统PATH中的java
      'C:/Program Files/Java/jdk-17/bin/java.exe',
      'C:/Program Files/Java/jdk-11/bin/java.exe',
      'C:/Program Files/Java/jdk-8/bin/java.exe',
      'C:/Program Files (x86)/Java/jre1.8.0_XXX/bin/java.exe'
    ]

    // 这里可以实现更复杂的Java检测逻辑
    return commonJavaPaths[0] // 暂时返回默认的java命令
  }

  /**
   * 获取创建的文件列表
   */
  async getCreatedFiles(versionId) {
    const files = []
    const versionDir = path.join(this.versionsDir, versionId)

    const checkFile = async (filePath, description) => {
      if (await this.fileExists(filePath)) {
        files.push({
          path: filePath,
          description,
          size: (await fs.promises.stat(filePath)).size
        })
      }
    }

    await checkFile(path.join(versionDir, `${versionId}.json`), '版本配置文件')
    await checkFile(path.join(versionDir, `${versionId}_launcher.json`), '启动器配置文件')
    await checkFile(path.join(this.versionsDir, 'version.json'), '全局版本列表')
    await checkFile(path.join(this.mcDirectory, 'launcher_profiles.json'), '启动器配置')

    return files
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
   * 验证版本初始化结果
   */
  async validateInitialization(versionId) {
    const validationResult = {
      isValid: true,
      missingFiles: [],
      errors: []
    }

    try {
      const versionDir = path.join(this.versionsDir, versionId)
      const requiredFiles = [
        path.join(versionDir, `${versionId}.json`),
        path.join(versionDir, `${versionId}.jar`)
      ]

      for (const filePath of requiredFiles) {
        if (!await this.fileExists(filePath)) {
          validationResult.isValid = false
          validationResult.missingFiles.push(filePath)
        }
      }

    } catch (error) {
      validationResult.isValid = false
      validationResult.errors.push(error.message)
    }

    return validationResult
  }
}

module.exports = GameInitializationService
