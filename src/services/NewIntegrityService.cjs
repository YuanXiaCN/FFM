// src/services/NewIntegrityService.cjs
// 新的文件完整性检查和修复服务
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const fse = require('fs-extra');
const { logger } = require('../../utils.cjs');

/**
 * 文件完整性检查和修复服务
 */
class NewIntegrityService {
  constructor(bmclapiManager, downloadManager) {
    this.bmclapiManager = bmclapiManager;
    this.downloadManager = downloadManager;
    this.minecraftDir = path.join(process.cwd(), '.minecraft');
  }

  /**
   * 检查版本完整性
   */
  async checkVersionIntegrity(versionId) {
    logger.info(`Starting integrity check for version ${versionId}`);
    
    const results = {
      version: versionId,
      clientJar: { valid: false, exists: false, size: 0, sha1: null },
      libraries: { valid: 0, invalid: 0, missing: 0, total: 0 },
      assets: { valid: 0, invalid: 0, missing: 0, total: 0 },
      missingFiles: [],
      corruptedFiles: [],
      totalFiles: 0,
      validFiles: 0
    };

    try {
      const versionData = await this.bmclapiManager.getVersionDetails(versionId);
      
      // 检查客户端JAR
      await this.checkClientJar(versionId, versionData, results);
      
      // 检查库文件
      await this.checkLibraries(versionData, results);
      
      // 检查资源文件
      await this.checkAssets(versionData, results);
      
      // 计算总体统计
      results.totalFiles = results.libraries.total + results.assets.total + 1; // +1 for client jar
      results.validFiles = results.libraries.valid + results.assets.valid + (results.clientJar.valid ? 1 : 0);
      
      logger.info(`Integrity check completed: ${results.validFiles}/${results.totalFiles} files valid`);
      
      return results;
      
    } catch (error) {
      logger.error(`Integrity check failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * 检查客户端JAR文件
   */
  async checkClientJar(versionId, versionData, results) {
    if (!versionData.downloads || !versionData.downloads.client) {
      return;
    }

    const client = versionData.downloads.client;
    const clientPath = path.join(this.minecraftDir, 'versions', versionId, `${versionId}.jar`);
    
    results.clientJar.exists = fs.existsSync(clientPath);
    
    if (!results.clientJar.exists) {
      results.missingFiles.push({
        type: 'client',
        path: clientPath,
        url: client.url,
        size: client.size,
        sha1: client.sha1
      });
      return;
    }

    // 检查文件大小
    const stats = fs.statSync(clientPath);
    results.clientJar.size = stats.size;
    
    if (stats.size !== client.size) {
      results.corruptedFiles.push({
        type: 'client',
        path: clientPath,
        reason: 'Size mismatch',
        expected: client.size,
        actual: stats.size
      });
      return;
    }

    // 检查SHA1
    const actualSha1 = await this.calculateSHA1(clientPath);
    results.clientJar.sha1 = actualSha1;
    
    if (actualSha1 !== client.sha1) {
      results.corruptedFiles.push({
        type: 'client',
        path: clientPath,
        reason: 'SHA1 mismatch',
        expected: client.sha1,
        actual: actualSha1
      });
      return;
    }

    results.clientJar.valid = true;
    logger.debug(`Client JAR is valid: ${clientPath}`);
  }

  /**
   * 检查库文件
   */
  async checkLibraries(versionData, results) {
    if (!versionData.libraries) return;

    for (const lib of versionData.libraries) {
      if (!this.shouldCheckLibrary(lib)) continue;
      
      results.libraries.total++;
      
      const libResult = await this.checkLibraryFile(lib);
      
      if (libResult.valid) {
        results.libraries.valid++;
      } else if (libResult.missing) {
        results.libraries.missing++;
        results.missingFiles.push(libResult.fileInfo);
      } else {
        results.libraries.invalid++;
        results.corruptedFiles.push(libResult.fileInfo);
      }
    }
  }

  /**
   * 检查单个库文件
   */
  async checkLibraryFile(lib) {
    let download = null;
    let isNative = false;
    let libPath = '';

    // 确定使用哪个下载信息
    if (lib.natives && lib.natives.windows && lib.downloads.classifiers) {
      const nativeKey = lib.natives.windows.replace('${arch}', '64');
      download = lib.downloads.classifiers[nativeKey];
      isNative = true;
      libPath = path.join(this.minecraftDir, 'versions', 'natives', path.basename(download.path));
    } else if (lib.downloads.artifact) {
      download = lib.downloads.artifact;
      libPath = path.join(this.minecraftDir, 'libraries', download.path);
    }

    if (!download) {
      return { valid: false, missing: true, fileInfo: null };
    }

    const exists = fs.existsSync(libPath);
    
    if (!exists) {
      return {
        valid: false,
        missing: true,
        fileInfo: {
          type: isNative ? 'native' : 'library',
          path: libPath,
          url: download.url,
          size: download.size,
          sha1: download.sha1,
          name: lib.name
        }
      };
    }

    // 检查文件大小
    const stats = fs.statSync(libPath);
    if (stats.size !== download.size) {
      return {
        valid: false,
        missing: false,
        fileInfo: {
          type: isNative ? 'native' : 'library',
          path: libPath,
          reason: 'Size mismatch',
          expected: download.size,
          actual: stats.size,
          name: lib.name
        }
      };
    }

    // 检查SHA1
    const actualSha1 = await this.calculateSHA1(libPath);
    if (actualSha1 !== download.sha1) {
      return {
        valid: false,
        missing: false,
        fileInfo: {
          type: isNative ? 'native' : 'library',
          path: libPath,
          reason: 'SHA1 mismatch',
          expected: download.sha1,
          actual: actualSha1,
          name: lib.name
        }
      };
    }

    return { valid: true, missing: false, fileInfo: null };
  }

  /**
   * 检查资源文件
   */
  async checkAssets(versionData, results) {
    if (!versionData.assetIndex) return;

    try {
      const assetIndex = versionData.assetIndex;
      const indexPath = path.join(this.minecraftDir, 'assets', 'indexes', `${assetIndex.id}.json`);
      
      // 检查索引文件
      if (!fs.existsSync(indexPath)) {
        results.missingFiles.push({
          type: 'asset-index',
          path: indexPath,
          url: assetIndex.url,
          size: assetIndex.size,
          sha1: assetIndex.sha1
        });
        return;
      }

      // 读取资源索引
      const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
      const assets = indexData.objects;
      
      // 检查部分资源文件（避免检查过多文件）
      const assetEntries = Object.entries(assets);
      const sampleSize = Math.min(100, assetEntries.length); // 最多检查100个资源文件
      const sampleAssets = assetEntries.slice(0, sampleSize);
      
      for (const [name, asset] of sampleAssets) {
        results.assets.total++;
        
        const hash = asset.hash;
        const subdir = hash.substring(0, 2);
        const assetPath = path.join(this.minecraftDir, 'assets', 'objects', subdir, hash);
        
        if (!fs.existsSync(assetPath)) {
          results.assets.missing++;
          results.missingFiles.push({
            type: 'asset',
            path: assetPath,
            url: `https://resources.download.minecraft.net/${subdir}/${hash}`,
            size: asset.size,
            sha1: hash,
            name: name
          });
          continue;
        }

        // 检查文件大小
        const stats = fs.statSync(assetPath);
        if (stats.size !== asset.size) {
          results.assets.invalid++;
          results.corruptedFiles.push({
            type: 'asset',
            path: assetPath,
            reason: 'Size mismatch',
            expected: asset.size,
            actual: stats.size,
            name: name
          });
          continue;
        }

        results.assets.valid++;
      }

      logger.info(`Checked ${sampleSize} asset files out of ${assetEntries.length} total`);
      
    } catch (error) {
      logger.error(`Failed to check assets: ${error.message}`);
    }
  }

  /**
   * 修复版本文件
   */
  async repairVersion(versionId) {
    logger.info(`Starting repair for version ${versionId}`);
    
    const integrityResults = await this.checkVersionIntegrity(versionId);
    const repairTasks = [];

    // 收集需要修复的文件
    for (const file of integrityResults.missingFiles) {
      repairTasks.push({
        url: this.bmclapiManager.transformUrl(file.url),
        dest: file.path,
        size: file.size,
        sha1: file.sha1,
        type: file.type,
        priority: this.getRepairPriority(file.type)
      });
    }

    for (const file of integrityResults.corruptedFiles) {
      // 删除损坏的文件
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
        logger.info(`Deleted corrupted file: ${file.path}`);
      }

      // 添加到修复任务
      if (file.expected && file.actual !== undefined) {
        repairTasks.push({
          url: this.bmclapiManager.transformUrl(file.url || this.reconstructUrl(file)),
          dest: file.path,
          size: file.expected,
          sha1: file.sha1,
          type: file.type,
          priority: this.getRepairPriority(file.type)
        });
      }
    }

    if (repairTasks.length === 0) {
      logger.info('No files need repair');
      return { success: true, repairedFiles: 0 };
    }

    logger.info(`Starting repair download for ${repairTasks.length} files`);
    
    // 使用下载管理器修复文件
    const taskIds = this.downloadManager.addTasks(repairTasks);
    
    return new Promise((resolve, reject) => {
      const repairedFiles = [];
      const failedFiles = [];

      this.downloadManager.on('taskCompleted', (task) => {
        if (taskIds.includes(task.id)) {
          repairedFiles.push(task.dest);
          logger.info(`Repaired file: ${task.dest}`);
        }
      });

      this.downloadManager.on('taskFailed', (task) => {
        if (taskIds.includes(task.id)) {
          failedFiles.push({ path: task.dest, error: task.error });
          logger.error(`Failed to repair file: ${task.dest} - ${task.error}`);
        }
      });

      this.downloadManager.on('allCompleted', () => {
        if (repairedFiles.length + failedFiles.length >= repairTasks.length) {
          resolve({
            success: failedFiles.length === 0,
            repairedFiles: repairedFiles.length,
            failedFiles: failedFiles.length,
            failures: failedFiles
          });
        }
      });

      // 超时处理
      setTimeout(() => {
        reject(new Error('Repair timeout'));
      }, 300000); // 5分钟超时
    });
  }

  /**
   * 计算文件SHA1
   */
  calculateSHA1(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha1');
      const stream = fs.createReadStream(filePath);
      
      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * 判断是否需要检查库文件
   */
  shouldCheckLibrary(lib) {
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

    return lib.downloads && (lib.downloads.artifact || 
           (lib.natives && lib.natives.windows && lib.downloads.classifiers));
  }

  /**
   * 获取修复优先级
   */
  getRepairPriority(fileType) {
    switch (fileType) {
      case 'client': return 10;
      case 'native': return 8;
      case 'library': return 5;
      case 'asset-index': return 9;
      case 'asset': return 3;
      default: return 1;
    }
  }

  /**
   * 重构URL（用于损坏文件修复）
   */
  reconstructUrl(file) {
    // 根据文件类型和路径重构URL
    switch (file.type) {
      case 'library':
      case 'native':
        return `https://libraries.minecraft.net/${path.basename(file.path)}`;
      case 'asset':
        const hash = path.basename(file.path);
        const subdir = hash.substring(0, 2);
        return `https://resources.download.minecraft.net/${subdir}/${hash}`;
      default:
        return null;
    }
  }

  /**
   * 创建版本目录结构
   */
  async createVersionDirectories(versionId) {
    const versionDir = path.join(this.minecraftDir, 'versions', versionId);
    const nativesDir = path.join(this.minecraftDir, 'versions', 'natives');
    const librariesDir = path.join(this.minecraftDir, 'libraries');
    const assetsDir = path.join(this.minecraftDir, 'assets');
    const objectsDir = path.join(assetsDir, 'objects');
    const indexesDir = path.join(assetsDir, 'indexes');

    await fse.ensureDir(versionDir);
    await fse.ensureDir(nativesDir);
    await fse.ensureDir(librariesDir);
    await fse.ensureDir(objectsDir);
    await fse.ensureDir(indexesDir);

    logger.info(`Created directory structure for version ${versionId}`);
  }

  /**
   * 获取版本完整性摘要
   */
  async getVersionSummary(versionId) {
    try {
      const results = await this.checkVersionIntegrity(versionId);
      
      return {
        version: versionId,
        isComplete: results.missingFiles.length === 0 && results.corruptedFiles.length === 0,
        totalFiles: results.totalFiles,
        validFiles: results.validFiles,
        missingCount: results.missingFiles.length,
        corruptedCount: results.corruptedFiles.length,
        clientJarValid: results.clientJar.valid,
        librariesValid: results.libraries.valid,
        librariesTotal: results.libraries.total,
        assetsValid: results.assets.valid,
        assetsTotal: results.assets.total
      };
    } catch (error) {
      return {
        version: versionId,
        error: error.message,
        isComplete: false
      };
    }
  }
}

module.exports = NewIntegrityService;
