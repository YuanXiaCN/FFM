// src/services/NewGameInitService.cjs
// 新的游戏初始化服务 - 负责创建配置文件和目录结构
const fs = require('fs');
const path = require('path');
const fse = require('fs-extra');
const { logger } = require('../../utils.cjs');

/**
 * 游戏初始化服务
 */
class NewGameInitService {
  constructor() {
    this.minecraftDir = path.join(process.cwd(), '.minecraft');
    this.versionsDir = path.join(this.minecraftDir, 'versions');
  }

  /**
   * 初始化版本
   */
  async initializeVersion(versionId, versionData, options = {}) {
    logger.info(`Initializing version ${versionId}`);
    
    try {
      // 1. 创建目录结构
      await this.createDirectories(versionId);
      
      // 2. 创建版本配置文件
      await this.createVersionConfig(versionId, versionData, options);
      
      // 3. 更新全局版本列表
      await this.updateVersionList(versionId, versionData);
      
      // 4. 创建launcher_profiles.json
      await this.createLauncherProfiles();
      
      logger.info(`Version ${versionId} initialized successfully`);
      
      return {
        success: true,
        versionId,
        paths: {
          versionDir: path.join(this.versionsDir, versionId),
          configFile: path.join(this.versionsDir, versionId, `${versionId}.json`),
          jarFile: path.join(this.versionsDir, versionId, `${versionId}.jar`)
        }
      };
      
    } catch (error) {
      logger.error(`Failed to initialize version ${versionId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * 创建目录结构
   */
  async createDirectories(versionId) {
    const directories = [
      this.minecraftDir,
      this.versionsDir,
      path.join(this.versionsDir, versionId),
      path.join(this.versionsDir, 'natives'),
      path.join(this.minecraftDir, 'libraries'),
      path.join(this.minecraftDir, 'assets'),
      path.join(this.minecraftDir, 'assets', 'objects'),
      path.join(this.minecraftDir, 'assets', 'indexes'),
      path.join(this.minecraftDir, 'saves'),
      path.join(this.minecraftDir, 'resourcepacks'),
      path.join(this.minecraftDir, 'shaderpacks'),
      path.join(this.minecraftDir, 'mods')
    ];

    for (const dir of directories) {
      await fse.ensureDir(dir);
    }

    logger.debug(`Created directory structure for ${versionId}`);
  }

  /**
   * 创建版本配置文件
   */
  async createVersionConfig(versionId, versionData, options) {
    const versionDir = path.join(this.versionsDir, versionId);
    const configPath = path.join(versionDir, `${versionId}.json`);
    
    // 默认Java路径检测
    const defaultJavaPath = await this.detectJavaPath(versionData);
    
    const config = {
      id: versionId,
      type: versionData.type || 'vanilla',
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
        useJava: options.javaPath || defaultJavaPath,
        startParameters: options.startParameters || ""
      },
      version: {
        minecraft: versionData.id
      },
      lastModified: new Date().toISOString()
    };

    await fse.writeJson(configPath, config, { spaces: 2 });
    logger.debug(`Created version config: ${configPath}`);
  }

  /**
   * 更新版本列表
   */
  async updateVersionList(versionId, versionData) {
    const versionListPath = path.join(this.versionsDir, 'version.json');
    
    let versionList = {};
    
    // 读取现有版本列表
    if (fs.existsSync(versionListPath)) {
      try {
        versionList = await fse.readJson(versionListPath);
      } catch (error) {
        logger.warn(`Failed to read version list, creating new one: ${error.message}`);
        versionList = {};
      }
    }

    // 添加新版本
    versionList[versionId] = {
      id: versionId,
      type: versionData.type || 'vanilla',
      url: `/${versionId}/${versionId}.json`,
      time: new Date().toISOString(),
      version: {
        minecraft: versionData.id
      },
      favourite: false,
      lastplay: new Date().toISOString(),
      installed: true,
      complete: false // 将在下载完成后更新
    };

    await fse.writeJson(versionListPath, versionList, { spaces: 2 });
    logger.debug(`Updated version list with ${versionId}`);
  }

  /**
   * 创建launcher_profiles.json
   */
  async createLauncherProfiles() {
    const profilesPath = path.join(this.minecraftDir, 'launcher_profiles.json');
    
    if (fs.existsSync(profilesPath)) {
      return; // 已存在，不覆盖
    }

    const profiles = {
      profiles: {
        "default": {
          name: "Default",
          type: "latest-release",
          created: new Date().toISOString(),
          lastUsed: new Date().toISOString(),
          icon: "Grass_Block",
          gameDir: this.minecraftDir,
          javaArgs: "-Xmx2G -XX:+UnlockExperimentalVMOptions -XX:+UseG1GC -XX:G1NewSizePercent=20 -XX:G1ReservePercent=20 -XX:MaxGCPauseMillis=50 -XX:G1HeapRegionSize=32M"
        }
      },
      settings: {
        enableSnapshots: false,
        enableAdvanced: false,
        enableAnalytics: false,
        enableHistorical: false,
        showGameLog: false,
        showMenu: false,
        soundOn: false
      },
      version: 3
    };

    await fse.writeJson(profilesPath, profiles, { spaces: 2 });
    logger.debug('Created launcher_profiles.json');
  }

  /**
   * 检测Java路径
   */
  async detectJavaPath(versionData) {
    // 根据MC版本推荐Java版本
    const mcVersion = versionData.id;
    const versionParts = mcVersion.split('.');
    const majorVersion = parseInt(versionParts[1]);
    
    let recommendedJava = 'java'; // 默认使用系统Java
    
    if (majorVersion >= 17) {
      // 1.17+ 推荐Java 17
      recommendedJava = this.findJavaInstallation('17') || 'java';
    } else if (majorVersion >= 16) {
      // 1.16+ 推荐Java 11
      recommendedJava = this.findJavaInstallation('11') || 'java';
    } else {
      // 1.15及以下推荐Java 8
      recommendedJava = this.findJavaInstallation('8') || 'java';
    }
    
    return recommendedJava;
  }

  /**
   * 查找Java安装
   */
  findJavaInstallation(version) {
    const possiblePaths = [
      `C:\\Program Files\\Java\\jdk-${version}\\bin\\java.exe`,
      `C:\\Program Files\\Java\\jre-${version}\\bin\\java.exe`,
      `C:\\Program Files (x86)\\Java\\jdk-${version}\\bin\\java.exe`,
      `C:\\Program Files (x86)\\Java\\jre-${version}\\bin\\java.exe`,
      `C:\\Program Files\\Eclipse Adoptium\\jdk-${version}\\bin\\java.exe`,
      `C:\\Program Files\\Eclipse Foundation\\jdk-${version}\\bin\\java.exe`
    ];

    for (const javaPath of possiblePaths) {
      if (fs.existsSync(javaPath)) {
        logger.info(`Found Java ${version} at: ${javaPath}`);
        return javaPath;
      }
    }

    return null;
  }

  /**
   * 标记版本完成
   */
  async markVersionComplete(versionId) {
    const versionListPath = path.join(this.versionsDir, 'version.json');
    
    if (!fs.existsSync(versionListPath)) {
      return;
    }

    try {
      const versionList = await fse.readJson(versionListPath);
      
      if (versionList[versionId]) {
        versionList[versionId].complete = true;
        versionList[versionId].lastplay = new Date().toISOString();
        
        await fse.writeJson(versionListPath, versionList, { spaces: 2 });
        logger.info(`Marked version ${versionId} as complete`);
      }
    } catch (error) {
      logger.error(`Failed to mark version complete: ${error.message}`);
    }
  }

  /**
   * 获取已安装版本列表
   */
  async getInstalledVersions() {
    const versionListPath = path.join(this.versionsDir, 'version.json');
    
    if (!fs.existsSync(versionListPath)) {
      return {};
    }

    try {
      return await fse.readJson(versionListPath);
    } catch (error) {
      logger.error(`Failed to read installed versions: ${error.message}`);
      return {};
    }
  }

  /**
   * 删除版本
   */
  async deleteVersion(versionId) {
    try {
      // 删除版本目录
      const versionDir = path.join(this.versionsDir, versionId);
      if (fs.existsSync(versionDir)) {
        await fse.remove(versionDir);
        logger.info(`Deleted version directory: ${versionDir}`);
      }

      // 从版本列表中移除
      const versionListPath = path.join(this.versionsDir, 'version.json');
      if (fs.existsSync(versionListPath)) {
        const versionList = await fse.readJson(versionListPath);
        delete versionList[versionId];
        await fse.writeJson(versionListPath, versionList, { spaces: 2 });
        logger.info(`Removed ${versionId} from version list`);
      }

      return { success: true, deletedVersion: versionId };
      
    } catch (error) {
      logger.error(`Failed to delete version ${versionId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * 清理临时文件
   */
  async cleanupTempFiles() {
    const tempDir = path.join(process.cwd(), 'temp');
    
    if (fs.existsSync(tempDir)) {
      try {
        await fse.remove(tempDir);
        await fse.ensureDir(tempDir);
        logger.info('Cleaned up temporary files');
      } catch (error) {
        logger.error(`Failed to cleanup temp files: ${error.message}`);
      }
    }
  }

  /**
   * 验证版本完整性
   */
  async validateVersion(versionId) {
    const versionDir = path.join(this.versionsDir, versionId);
    const jarPath = path.join(versionDir, `${versionId}.jar`);
    const configPath = path.join(versionDir, `${versionId}.json`);

    const validation = {
      versionId,
      isValid: true,
      issues: []
    };

    // 检查版本目录
    if (!fs.existsSync(versionDir)) {
      validation.isValid = false;
      validation.issues.push('Version directory not found');
    }

    // 检查JAR文件
    if (!fs.existsSync(jarPath)) {
      validation.isValid = false;
      validation.issues.push('Client JAR not found');
    }

    // 检查配置文件
    if (!fs.existsSync(configPath)) {
      validation.isValid = false;
      validation.issues.push('Version config not found');
    }

    return validation;
  }

  /**
   * 创建版本快照
   */
  async createVersionSnapshot(versionId) {
    const versionDir = path.join(this.versionsDir, versionId);
    const snapshotPath = path.join(this.versionsDir, `${versionId}-snapshot-${Date.now()}.zip`);

    // 这里可以添加创建ZIP快照的逻辑
    logger.info(`Version snapshot would be created at: ${snapshotPath}`);
    
    return {
      success: true,
      snapshotPath,
      versionId
    };
  }

  /**
   * 获取版本信息
   */
  async getVersionInfo(versionId) {
    const versionDir = path.join(this.versionsDir, versionId);
    const configPath = path.join(versionDir, `${versionId}.json`);
    
    if (!fs.existsSync(configPath)) {
      throw new Error(`Version ${versionId} not found`);
    }

    try {
      const config = await fse.readJson(configPath);
      const jarPath = path.join(versionDir, `${versionId}.jar`);
      const jarExists = fs.existsSync(jarPath);
      
      let jarSize = 0;
      if (jarExists) {
        const stats = fs.statSync(jarPath);
        jarSize = stats.size;
      }

      return {
        ...config,
        jarExists,
        jarSize,
        directory: versionDir
      };
      
    } catch (error) {
      throw new Error(`Failed to read version info: ${error.message}`);
    }
  }
}

module.exports = NewGameInitService;
