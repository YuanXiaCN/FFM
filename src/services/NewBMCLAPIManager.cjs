// src/services/NewBMCLAPIManager.cjs
// 新的BMCLAPI管理器 - 专注于BMCLAPI镜像源
const axios = require('axios');
const path = require('path');
const { logger } = require('../../utils.cjs');

/**
 * BMCLAPI镜像源配置
 */
const BMCLAPI_CONFIG = {
  baseUrl: 'https://bmclapi2.bangbang93.com',
  endpoints: {
    versionManifest: '/mc/game/version_manifest.json',
    version: '/version/{version}/json',
    client: '/version/{version}/client',
    server: '/version/{version}/server',
    assets: '/assets',
    libraries: '/maven',
    forge: '/forge/list',
    fabric: '/fabric-meta/v2/versions/loader',
    neoforge: '/maven/net/neoforged',
    optifine: '/optifine/{version}'
  },
  timeout: 15000,
  retries: 3
};

/**
 * 官方源配置（备用）
 */
const OFFICIAL_CONFIG = {
  baseUrl: 'https://piston-meta.mojang.com',
  endpoints: {
    versionManifest: '/mc/game/version_manifest.json',
    assets: 'https://resources.download.minecraft.net',
    libraries: 'https://libraries.minecraft.net'
  },
  timeout: 30000,
  retries: 2
};

/**
 * 新的BMCLAPI管理器
 */
class NewBMCLAPIManager {
  constructor() {
    this.primarySource = BMCLAPI_CONFIG;
    this.fallbackSource = OFFICIAL_CONFIG;
    this.useFallback = false;
    this.versionManifest = null;
    this.versionCache = new Map();
    
    // 创建axios实例
    this.axios = axios.create({
      timeout: this.primarySource.timeout,
      headers: {
        'User-Agent': 'MinecraftLauncher/1.0'
      }
    });
  }

  /**
   * 获取版本清单
   */
  async getVersionManifest() {
    if (this.versionManifest) {
      return this.versionManifest;
    }

    try {
      const url = this.getCurrentSource().baseUrl + 
                 this.getCurrentSource().endpoints.versionManifest;
      
      logger.info(`Fetching version manifest from: ${url}`);
      
      const response = await this.axios.get(url);
      this.versionManifest = response.data;
      
      logger.info(`Version manifest loaded: ${this.versionManifest.versions.length} versions`);
      return this.versionManifest;
      
    } catch (error) {
      logger.error(`Failed to get version manifest: ${error.message}`);
      
      if (!this.useFallback) {
        logger.info('Trying fallback source...');
        this.useFallback = true;
        return this.getVersionManifest();
      }
      
      throw new Error(`Cannot load version manifest: ${error.message}`);
    }
  }

  /**
   * 获取版本详细信息
   */
  async getVersionDetails(versionId) {
    if (this.versionCache.has(versionId)) {
      return this.versionCache.get(versionId);
    }

    try {
      const manifest = await this.getVersionManifest();
      const versionInfo = manifest.versions.find(v => v.id === versionId);
      
      if (!versionInfo) {
        throw new Error(`Version ${versionId} not found`);
      }

      // 转换URL为BMCLAPI URL
      const versionUrl = this.transformUrl(versionInfo.url);
      logger.info(`Fetching version details from: ${versionUrl}`);
      
      const response = await this.axios.get(versionUrl);
      const versionData = response.data;
      
      // 缓存版本数据
      this.versionCache.set(versionId, versionData);
      
      logger.info(`Version details loaded for ${versionId}`);
      return versionData;
      
    } catch (error) {
      logger.error(`Failed to get version details for ${versionId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取下载任务列表
   */
  async getDownloadTasks(versionId) {
    const versionData = await this.getVersionDetails(versionId);
    const tasks = [];

    try {
      // 1. 客户端JAR文件
      if (versionData.downloads && versionData.downloads.client) {
        const client = versionData.downloads.client;
        tasks.push({
          id: `client-${versionId}`,
          url: this.transformUrl(client.url),
          dest: path.join(process.cwd(), '.minecraft', 'versions', versionId, `${versionId}.jar`),
          size: client.size,
          sha1: client.sha1,
          type: 'client',
          priority: 10 // 最高优先级
        });
      }

      // 2. 依赖库文件
      if (versionData.libraries) {
        for (const lib of versionData.libraries) {
          if (this.shouldDownloadLibrary(lib)) {
            const libTask = this.createLibraryTask(lib);
            if (libTask) {
              tasks.push(libTask);
            }
          }
        }
      }

      // 3. 资源文件
      if (versionData.assetIndex) {
        const assetIndexTask = await this.createAssetTasks(versionData.assetIndex);
        tasks.push(...assetIndexTask);
      }

      logger.info(`Generated ${tasks.length} download tasks for ${versionId}`);
      return tasks;

    } catch (error) {
      logger.error(`Failed to generate download tasks: ${error.message}`);
      throw error;
    }
  }

  /**
   * 判断是否需要下载库文件
   */
  shouldDownloadLibrary(lib) {
    // 检查规则
    if (lib.rules) {
      for (const rule of lib.rules) {
        if (rule.action === 'disallow') {
          if (rule.os && rule.os.name === 'windows') {
            return false;
          }
        }
      }
    }

    // 检查natives（Windows平台）
    if (lib.natives && lib.natives.windows) {
      return true;
    }

    // 普通库文件
    return lib.downloads && lib.downloads.artifact;
  }

  /**
   * 创建库文件下载任务
   */
  createLibraryTask(lib) {
    let download = null;
    let isNative = false;

    // 优先下载natives版本
    if (lib.natives && lib.natives.windows && lib.downloads.classifiers) {
      const nativeKey = lib.natives.windows.replace('${arch}', '64');
      download = lib.downloads.classifiers[nativeKey];
      isNative = true;
    } else if (lib.downloads.artifact) {
      download = lib.downloads.artifact;
    }

    if (!download) return null;

    const libPath = isNative ? 
      path.join(process.cwd(), '.minecraft', 'versions', 'natives', path.basename(download.path)) :
      path.join(process.cwd(), '.minecraft', 'libraries', download.path);

    return {
      id: `lib-${lib.name}-${isNative ? 'native' : 'jar'}`,
      url: this.transformUrl(download.url),
      dest: libPath,
      size: download.size,
      sha1: download.sha1,
      type: isNative ? 'native' : 'library',
      priority: isNative ? 8 : 5
    };
  }

  /**
   * 创建资源文件下载任务
   */
  async createAssetTasks(assetIndex) {
    const tasks = [];

    try {
      // 下载资源索引文件
      const indexUrl = this.transformUrl(assetIndex.url);
      const indexResponse = await this.axios.get(indexUrl);
      const assets = indexResponse.data.objects;

      // 资源索引文件本身
      tasks.push({
        id: `asset-index-${assetIndex.id}`,
        url: indexUrl,
        dest: path.join(process.cwd(), '.minecraft', 'assets', 'indexes', `${assetIndex.id}.json`),
        size: assetIndex.size,
        sha1: assetIndex.sha1,
        type: 'asset-index',
        priority: 9
      });

      // 资源文件
      for (const [name, asset] of Object.entries(assets)) {
        const hash = asset.hash;
        const subdir = hash.substring(0, 2);
        
        tasks.push({
          id: `asset-${hash}`,
          url: this.transformUrl(`https://resources.download.minecraft.net/${subdir}/${hash}`),
          dest: path.join(process.cwd(), '.minecraft', 'assets', 'objects', subdir, hash),
          size: asset.size,
          sha1: hash,
          type: 'asset',
          priority: 3
        });
      }

      logger.info(`Generated ${tasks.length} asset tasks`);
      return tasks;

    } catch (error) {
      logger.error(`Failed to create asset tasks: ${error.message}`);
      return [tasks[0]]; // 至少返回索引文件任务
    }
  }

  /**
   * 转换URL为BMCLAPI URL
   */
  transformUrl(originalUrl) {
    if (!originalUrl) return originalUrl;

    const source = this.getCurrentSource();
    
    // 如果使用官方源，直接返回
    if (source === this.fallbackSource) {
      return originalUrl;
    }

    // 版本清单和元数据
    if (originalUrl.includes('launchermeta.mojang.com') || 
        originalUrl.includes('piston-meta.mojang.com')) {
      return originalUrl.replace(
        /https:\/\/(launchermeta|piston-meta)\.mojang\.com/,
        source.baseUrl
      );
    }

    // 资源文件
    if (originalUrl.includes('resources.download.minecraft.net')) {
      return originalUrl.replace(
        'https://resources.download.minecraft.net',
        source.baseUrl + '/assets'
      );
    }

    // 库文件
    if (originalUrl.includes('libraries.minecraft.net')) {
      return originalUrl.replace(
        'https://libraries.minecraft.net',
        source.baseUrl + '/maven'
      );
    }

    return originalUrl;
  }

  /**
   * 获取当前源
   */
  getCurrentSource() {
    return this.useFallback ? this.fallbackSource : this.primarySource;
  }

  /**
   * 测试源连接
   */
  async testConnection(sourceConfig = null) {
    const source = sourceConfig || this.getCurrentSource();
    
    try {
      const testUrl = source.baseUrl + source.endpoints.versionManifest;
      const response = await axios.get(testUrl, { timeout: 5000 });
      
      return {
        success: true,
        latency: response.headers['response-time'] || 'unknown',
        source: source.baseUrl
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        source: source.baseUrl
      };
    }
  }

  /**
   * 切换到备用源
   */
  switchToFallback() {
    this.useFallback = true;
    this.versionManifest = null; // 清除缓存
    this.versionCache.clear();
    
    logger.info('Switched to fallback source (Official)');
  }

  /**
   * 重置到主源
   */
  resetToPrimary() {
    this.useFallback = false;
    this.versionManifest = null;
    this.versionCache.clear();
    
    logger.info('Reset to primary source (BMCLAPI)');
  }

  /**
   * 获取可用版本列表
   */
  async getAvailableVersions(type = 'all') {
    const manifest = await this.getVersionManifest();
    
    if (type === 'all') {
      return manifest.versions;
    }
    
    return manifest.versions.filter(v => v.type === type);
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.versionManifest = null;
    this.versionCache.clear();
    logger.info('Cache cleared');
  }
}

module.exports = NewBMCLAPIManager;
