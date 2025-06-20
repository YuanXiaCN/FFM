// src/services/DownloadSourceManager.cjs
// 下载源管理器 - 集成BMCLAPI镜像支持
const axios = require('axios');

// 下载源配置

const DOWNLOAD_SOURCES = {
  official: {
    name: '官方源',
    baseUrl: 'https://piston-meta.mojang.com',
    meta: {
      versionManifest: 'https://piston-meta.mojang.com/mc/game/version_manifest.json',
      assets: 'https://resources.download.minecraft.net',
      libraries: 'https://libraries.minecraft.net'
    },
    priority: 1,
    timeout: 30000
  },
  
  bmclapi: {
    name: 'BMCLAPI镜像',
    baseUrl: 'https://bmclapi2.bangbang93.com',
    meta: {
      versionManifest: 'https://bmclapi2.bangbang93.com/mc/game/version_manifest.json',
      assets: 'https://bmclapi2.bangbang93.com/assets',
      libraries: 'https://bmclapi2.bangbang93.com/maven',
      forge: 'https://bmclapi2.bangbang93.com/maven',
      fabric: 'https://bmclapi2.bangbang93.com/fabric-meta',
      neoforge: 'https://bmclapi2.bangbang93.com/maven/net/neoforged',
      optifine: 'https://bmclapi2.bangbang93.com/optifine'
    },
    priority: 2,
    timeout: 15000
  }
};

/**
 * 下载源管理器
 */
class DownloadSourceManager {
  constructor() {
    this.sources = { ...DOWNLOAD_SOURCES };
    this.currentSource = 'bmclapi'; // 默认使用BMCLAPI
    this.fallbackEnabled = true;
  }
  
  /**
   * 获取当前下载源
   * @returns {Object} - 当前下载源配置
   */
  getCurrentSource() {
    return this.sources[this.currentSource];
  }
  
  /**
   * 设置当前下载源
   * @param {string} sourceKey - 下载源键名
   */
  setCurrentSource(sourceKey) {
    if (this.sources[sourceKey]) {
      this.currentSource = sourceKey;
    }
  }
  
  /**
   * 获取所有下载源
   * @returns {Array} - 下载源列表
   */
  getAllSources() {
    return Object.entries(this.sources).map(([key, source]) => ({
      key,
      ...source
    }));
  }
  
  /**
   * 转换URL为镜像URL
   * @param {string} originalUrl - 原始URL
   * @param {string} sourceKey - 指定的下载源（可选）
   * @returns {string} - 转换后的URL
   */
  transformUrl(originalUrl, sourceKey = null) {
    const source = sourceKey ? this.sources[sourceKey] : this.getCurrentSource();
    
    if (!source || source.name === '官方源') {
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
        source.meta.assets
      );
    }
    
    // 依赖库
    if (originalUrl.includes('libraries.minecraft.net')) {
      return originalUrl.replace(
        'https://libraries.minecraft.net',
        source.meta.libraries
      );
    }
    
    // Forge相关
    if (originalUrl.includes('files.minecraftforge.net/maven')) {
      return originalUrl.replace(
        'https://files.minecraftforge.net/maven',
        source.meta.forge
      );
    }
    
    // Fabric相关
    if (originalUrl.includes('meta.fabricmc.net')) {
      return originalUrl.replace(
        'https://meta.fabricmc.net',
        source.meta.fabric
      );
    }
    
    if (originalUrl.includes('maven.fabricmc.net')) {
      return originalUrl.replace(
        'https://maven.fabricmc.net',
        source.meta.libraries
      );
    }
    
    // NeoForge相关
    if (originalUrl.includes('maven.neoforged.net/releases/net/neoforged')) {
      return originalUrl.replace(
        'https://maven.neoforged.net/releases/net/neoforged',
        source.meta.neoforge
      );
    }
    
    return originalUrl;
  }
  
  /**
   * 测试下载源可用性
   * @param {string} sourceKey - 下载源键名
   * @returns {Promise<Object>} - 测试结果
   */
  async testSource(sourceKey) {
    const source = this.sources[sourceKey];
    if (!source) {
      throw new Error(`未找到下载源: ${sourceKey}`);
    }
    
    const startTime = Date.now();
    
    try {
      const response = await axios.get(source.meta.versionManifest, {
        timeout: source.timeout,
        family: 4
      });
      
      const endTime = Date.now();
      const latency = endTime - startTime;
      
      return {
        success: true,
        latency,
        status: response.status,
        message: `连接成功，延迟 ${latency}ms`
      };
    } catch (error) {
      const endTime = Date.now();
      const latency = endTime - startTime;
      
      return {
        success: false,
        latency,
        status: error.response?.status || 0,
        message: error.message,
        error
      };
    }
  }
  
  /**
   * 测试所有下载源
   * @returns {Promise<Array>} - 所有测试结果
   */
  async testAllSources() {
    const results = [];
    
    for (const [key, source] of Object.entries(this.sources)) {
      try {
        const result = await this.testSource(key);
        results.push({
          key,
          name: source.name,
          ...result
        });
      } catch (error) {
        results.push({
          key,
          name: source.name,
          success: false,
          latency: 0,
          status: 0,
          message: error.message,
          error
        });
      }
    }
    
    return results;
  }
  
  /**
   * 自动选择最佳下载源
   * @returns {Promise<string>} - 最佳下载源键名
   */
  async selectBestSource() {
    const results = await this.testAllSources();
    
    // 过滤可用的下载源
    const availableSources = results.filter(result => result.success);
    
    if (availableSources.length === 0) {
      throw new Error('没有可用的下载源');
    }
    
    // 按延迟排序，选择最快的
    availableSources.sort((a, b) => a.latency - b.latency);
    const bestSource = availableSources[0];
    
    this.setCurrentSource(bestSource.key);
    return bestSource.key;
  }
  
  /**
   * 带回退的下载请求
   * @param {string} url - 下载URL
   * @param {Object} options - axios选项
   * @returns {Promise} - axios响应
   */
  async downloadWithFallback(url, options = {}) {
    const sources = this.fallbackEnabled ? 
      Object.keys(this.sources) : 
      [this.currentSource];
    
    let lastError = null;
    
    for (const sourceKey of sources) {
      try {
        const transformedUrl = this.transformUrl(url, sourceKey);
        const source = this.sources[sourceKey];
        
        const response = await axios({
          ...options,
          url: transformedUrl,
          timeout: source.timeout,
          family: 4
        });
        
        return response;
      } catch (error) {
        lastError = error;
        console.warn(`下载源 ${sourceKey} 失败:`, error.message);
        continue;
      }
    }
    
    throw lastError || new Error('所有下载源都失败了');
  }
  
  /**
   * 获取版本清单
   * @returns {Promise<Object>} - 版本清单数据
   */
  async getVersionManifest() {
    const response = await this.downloadWithFallback(
      'https://piston-meta.mojang.com/mc/game/version_manifest.json'
    );
    return response.data;
  }
  
  /**
   * 获取版本JSON
   * @param {string} versionUrl - 版本JSON URL
   * @returns {Promise<Object>} - 版本JSON数据
   */
  async getVersionJson(versionUrl) {
    const response = await this.downloadWithFallback(versionUrl);
    return response.data;
  }
  
  /**
   * 获取资源索引
   * @param {string} assetIndexUrl - 资源索引URL
   * @returns {Promise<Object>} - 资源索引数据
   */
  async getAssetIndex(assetIndexUrl) {
    const response = await this.downloadWithFallback(assetIndexUrl);
    return response.data;
  }
  
  /**
   * 获取Forge版本列表
   * @param {string} mcVersion - Minecraft版本
   * @returns {Promise<Array>} - Forge版本列表
   */
  async getForgeVersions(mcVersion) {
    try {
      const response = await this.downloadWithFallback(
        `https://bmclapi2.bangbang93.com/forge/minecraft/${mcVersion}`
      );
      return response.data;
    } catch (error) {
      console.warn('获取Forge版本失败:', error.message);
      return [];
    }
  }
  
  /**
   * 获取Fabric版本列表
   * @param {string} mcVersion - Minecraft版本
   * @returns {Promise<Array>} - Fabric版本列表
   */
  async getFabricVersions(mcVersion) {
    try {
      const response = await this.downloadWithFallback(
        `https://bmclapi2.bangbang93.com/fabric-meta/v2/versions/loader/${mcVersion}`
      );
      return response.data;
    } catch (error) {
      console.warn('获取Fabric版本失败:', error.message);
      return [];
    }
  }
  
  /**
   * 获取OptiFine版本列表
   * @param {string} mcVersion - Minecraft版本
   * @returns {Promise<Array>} - OptiFine版本列表
   */
  async getOptiFineVersions(mcVersion) {
    try {
      const response = await this.downloadWithFallback(
        `https://bmclapi2.bangbang93.com/optifine/${mcVersion}`
      );
      return response.data;
    } catch (error) {
      console.warn('获取OptiFine版本失败:', error.message);
      return [];
    }
  }
  
  /**
   * 启用/禁用自动回退
   * @param {boolean} enabled - 是否启用
   */
  setFallbackEnabled(enabled) {
    this.fallbackEnabled = enabled;
  }
  
  /**
   * 添加自定义下载源
   * @param {string} key - 下载源键名
   * @param {Object} sourceConfig - 下载源配置
   */
  addCustomSource(key, sourceConfig) {
    this.sources[key] = sourceConfig;
  }
  
  /**
   * 移除下载源
   * @param {string} key - 下载源键名
   */
  removeSource(key) {
    if (key !== 'official' && key !== 'bmclapi') {
      delete this.sources[key];
      
      // 如果删除的是当前源，切换到默认源
      if (this.currentSource === key) {
        this.currentSource = 'bmclapi';
      }
    }
  }
}

module.exports = DownloadSourceManager;
