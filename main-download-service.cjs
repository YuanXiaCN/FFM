// main-download-service-new.cjs
// 新的主进程下载服务 - 支持高级下载管理和BMCLAPI镜像
const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { logger } = require('./utils.cjs');
const configService = require('./main-config-service.cjs');
const fse = require('fs-extra');

// 导入紧急修复配置
const emergencyConfig = require('./emergency-fix.cjs');

// 导入调试配置
const { debugLogger } = require('./debug-config.cjs');

// 导入新的下载管理器
const AdvancedDownloadManager = require('./src/services/AdvancedDownloadManager.cjs');
const DownloadSourceManager = require('./src/services/DownloadSourceManager.cjs');

// 全局常量
const TEMP_DIR = path.join(process.cwd(), 'temp');
const MINECRAFT_DIR = path.join(process.cwd(), '.minecraft');

// 全局实例
let downloadManager = null;
let sourceManager = null;
let currentDownloadSession = null;

// 确保目录存在
fse.ensureDirSync(TEMP_DIR);
fse.ensureDirSync(MINECRAFT_DIR);

/**
 * 初始化下载管理器
 */
function initializeDownloadManagers() {
  logger.debug(`[DownloadService] Initializing download managers - Current state: downloadManager=${!!downloadManager}, sourceManager=${!!sourceManager}`);
  
  // 记录当前配置
  logger.info('=== 下载服务配置摘要 ===');
  logger.info(`并发文件数: ${emergencyConfig.download.maxConcurrentFiles}`);
  logger.info(`每文件线程数: ${emergencyConfig.download.maxThreadsPerFile}`);
  logger.info(`块大小: ${emergencyConfig.download.chunkSize / 1024 / 1024}MB`);
  logger.info(`进度更新间隔: ${emergencyConfig.download.progressThrottleMs}ms`);
  logger.info(`完整性检查: ${emergencyConfig.integrity.enabled ? '启用' : '禁用'}`);
  logger.info(`调试日志: ${emergencyConfig.logging?.debugLevel ? '启用' : '禁用'}`);
  logger.info('========================');
  
  if (!downloadManager) {
    // 使用紧急修复配置
    const downloadConfig = emergencyConfig.download;
    logger.debug(`[DownloadService] Creating AdvancedDownloadManager with config: ${JSON.stringify(downloadConfig)}`);
    
    downloadManager = new AdvancedDownloadManager({
      maxConcurrentFiles: downloadConfig.maxConcurrentFiles,
      largeFileThreshold: 5 * 1024 * 1024,
      maxThreadsPerFile: downloadConfig.maxThreadsPerFile,
      chunkSize: downloadConfig.chunkSize,
      tempDir: TEMP_DIR,
      enableAdaptiveConcurrency: true,
      bandwidthMonitor: true
    });
    
    logger.debug(`[DownloadService] AdvancedDownloadManager created successfully`);
      // 监听下载事件
    downloadManager.on('progress', (data) => {
      if (currentDownloadSession) {
        const { task, totalProgress, stats } = data;
        
        // Debug日志：记录所有进度事件
        logger.debug(`[DownloadManager] Progress event - Task: ${task?.dest ? path.basename(task.dest) : 'Unknown'}, Total: ${totalProgress}%, Stats: ${JSON.stringify(stats)}`);
        
        // 节流处理，避免频繁的IPC通信
        if (!currentDownloadSession.lastProgressTime || 
            Date.now() - currentDownloadSession.lastProgressTime > emergencyConfig.download.progressThrottleMs) {
          
          currentDownloadSession.lastProgressTime = Date.now();
          logger.debug(`[DownloadManager] Throttled progress update - LastTime: ${currentDownloadSession.lastProgressTime}`);
          
            // 获取正在下载的任务（不包括队列中的）
          const downloadingTasks = downloadManager.getActiveTasks();
          const queuedTasks = downloadManager.getQueuedTasks();
          
          logger.debug(`[DownloadManager] Queue status - Downloading: ${downloadingTasks.length}, Queued: ${queuedTasks.length}`);
          
          const activeFiles = downloadingTasks.map(activeTask => ({
            id: activeTask.id,
            name: path.basename(activeTask.dest),
            progress: Math.round(activeTask.progress || 0),
            speed: activeTask.speed || 0,
            size: activeTask.size || 0,
            status: activeTask.status || 'downloading'
          }));
            logger.debug(`[DownloadManager] Active files: ${JSON.stringify(activeFiles.map(f => ({ name: f.name, progress: f.progress, speed: f.speed })))}`);
          
          logger.debug(`[DownloadManager] Getting bandwidth stats...`);
          const bandwidthStats = downloadManager.getBandwidthStats ? downloadManager.getBandwidthStats() : {};
          logger.debug(`[DownloadManager] Bandwidth stats: ${JSON.stringify(bandwidthStats)}`);
          
          // 计算当前总速度（改进的逻辑）
          let currentTotalSpeed = 0;
        if (task && task.speed > 0) {
          currentTotalSpeed = task.speed;
          logger.debug(`[DownloadManager] Using task speed: ${currentTotalSpeed}`);
        } else {
          // 如果单个任务速度为0，计算所有活跃任务的总速度
          currentTotalSpeed = downloadManager.calculateTotalSpeed();
          logger.debug(`[DownloadManager] Calculated total speed: ${currentTotalSpeed}`);
        }
          // 如果仍然为0，使用带宽统计中的速度
        if (currentTotalSpeed === 0 && bandwidthStats.currentSpeed) {
          currentTotalSpeed = bandwidthStats.currentSpeed;
          logger.debug(`[DownloadManager] Using bandwidth speed: ${currentTotalSpeed}`);
        }
        
        logger.debug(`[DownloadManager] Final speed: ${currentTotalSpeed}`);
        
        console.log('📊 速度计算调试:', {
          taskSpeed: task?.speed || 0,
          calculateTotalSpeed: downloadManager.calculateTotalSpeed(),
          bandwidthSpeed: bandwidthStats.currentSpeed || 0,
          finalSpeed: currentTotalSpeed
        });
        
        // 转换数据格式为前端期望的格式
        const progressData = {
          percent: totalProgress || 0,
          speed: currentTotalSpeed,
          downloadedBytes: stats?.downloadedSize || 0,
          totalBytes: stats?.totalSize || 0,
          downloadedFiles: stats?.completedFiles || 0,
          totalFiles: stats?.totalFiles || 0,
          fileStats: {
            completed: stats?.completedFiles || 0,
            total: stats?.totalFiles || 0,
            remaining: (stats?.totalFiles || 0) - (stats?.completedFiles || 0)
          },
          currentFile: task ? {
            name: path.basename(task.dest),
            progress: task.progress || 0,
            speed: task.speed || 0,
            size: task.size || 0
          } : null,
          activeFiles: activeFiles, // 只包含正在下载的文件
          queueInfo: {
            downloadingCount: downloadingTasks.length,
            queuedCount: queuedTasks.length,
            totalActiveCount: downloadingTasks.length + queuedTasks.length
          },
          bandwidthStats: bandwidthStats, // 带宽监控信息
          session: currentDownloadSession.id
        };
          // 计算剩余时间
        if (progressData.speed > 0) {
          const remainingBytes = progressData.totalBytes - progressData.downloadedBytes;
          progressData.estimatedTime = remainingBytes / progressData.speed;
          logger.debug(`[DownloadManager] Estimated time: ${progressData.estimatedTime}s, Remaining: ${remainingBytes} bytes`);
        }
        
        logger.debug(`[DownloadManager] Sending progress to renderer: ${JSON.stringify({
          percent: progressData.percent,
          speed: progressData.speed,
          downloadedFiles: progressData.downloadedFiles,
          totalFiles: progressData.totalFiles,
          currentFile: progressData.currentFile?.name || 'Unknown'
        })}`);
        
        console.log('发送下载进度数据:', progressData);
        currentDownloadSession.sender.send('download:progress', progressData);
        }
      }
    });    downloadManager.on('taskStarted', (task) => {
      logger.debug(`[DownloadManager] Task started event - File: ${task.dest}, Size: ${task.size}, URL: ${task.url}`);
      logger.info(`开始下载文件: ${task.dest}`);
      
      // 调试记录
      debugLogger.logTaskStarted(task);
      
      if (currentDownloadSession) {
        // 发送任务开始事件
        const taskData = {
          taskId: task.id,
          fileName: path.basename(task.dest),
          size: task.size,
          session: currentDownloadSession.id
        };
        logger.debug(`[DownloadManager] Sending taskStarted event: ${JSON.stringify(taskData)}`);
        console.log('发送任务开始事件:', taskData);
        currentDownloadSession.sender.send('download:taskStarted', taskData);
      }
    });    downloadManager.on('taskCompleted', (task) => {
      logger.debug(`[DownloadManager] Task completed event - File: ${task.dest}, Size: ${task.size}`);
      logger.info(`文件下载完成: ${task.dest}`);
      
      // 调试记录
      debugLogger.logTaskCompleted(task);
      
      if (currentDownloadSession) {
        // 发送任务完成事件
        const taskData = {
          taskId: task.id,
          fileName: path.basename(task.dest),
          session: currentDownloadSession.id
        };
        logger.debug(`[DownloadManager] Sending taskCompleted event: ${JSON.stringify(taskData)}`);
        console.log('发送任务完成事件:', taskData);
        currentDownloadSession.sender.send('download:taskCompleted', taskData);
      }
    });    downloadManager.on('taskFailed', (task, error) => {
      logger.debug(`[DownloadManager] Task failed event - File: ${task.dest}, Error: ${error.message}, Stack: ${error.stack}`);
      logger.error(`文件下载失败: ${task.dest}, 错误: ${error.message}`);
      
      // 调试记录
      debugLogger.logTaskFailed(task, error);
      
      if (currentDownloadSession) {
        // 发送任务失败事件
        const taskData = {
          taskId: task.id,
          fileName: path.basename(task.dest),
          error: error.message,
          session: currentDownloadSession.id
        };
        logger.debug(`[DownloadManager] Sending taskFailed event: ${JSON.stringify(taskData)}`);
        currentDownloadSession.sender.send('download:taskFailed', taskData);
      }
    });
  }
    if (!sourceManager) {
    logger.debug(`[DownloadService] Creating DownloadSourceManager`);
    sourceManager = new DownloadSourceManager();
    logger.debug(`[DownloadService] DownloadSourceManager created successfully`);
  }
  
  logger.debug(`[DownloadService] Download managers initialization completed`);
}

/**
 * 下载会话类
 */
class DownloadSession {
  constructor(options, sender) {
    this.id = Date.now().toString();
    this.options = options;
    this.sender = sender;
    this.startTime = Date.now();
    this.lastProgressTime = 0; // 添加进度更新时间戳
    this.status = 'preparing';
    this.stats = {
      totalFiles: 0,
      completedFiles: 0,
      failedFiles: 0,
      totalSize: 0,
      downloadedSize: 0
    };
  }
}

/**
 * 主要的Minecraft下载函数
 * @param {Object} options - 下载选项
 * @param {Object} sender - IPC发送器
 */
async function downloadMinecraft(options, sender) {
  logger.debug(`[DownloadService] Starting downloadMinecraft with options: ${JSON.stringify(options)}`);
  
  // 调试记录下载开始
  debugLogger.logDownloadStart(options);
  
  initializeDownloadManagers();
  
  // 创建下载会话
  const session = new DownloadSession(options, sender);
  currentDownloadSession = session;
  logger.debug(`[DownloadService] Created download session: ${session.id}`);
  
  try {
    const { version, loader, downloadSource } = options;
    logger.debug(`[DownloadService] Extracted options - version: ${version}, loader: ${loader}, downloadSource: ${downloadSource}`);
    
    // 设置下载源
    if (downloadSource) {
      logger.debug(`[DownloadService] Setting download source: ${downloadSource}`);
      sourceManager.setCurrentSource(downloadSource);
    }
    
    logger.info(`开始下载Minecraft ${version}`);
    logger.debug(`[DownloadService] Sending download:started event`);
    session.sender.send('download:started', { session: session.id });
      // 1. 获取版本信息
    logger.debug(`[DownloadService] Step 1: Getting version information`);
    session.sender.send('download:step', { step: '获取版本信息', progress: 0 });
    
    logger.debug(`[DownloadService] Fetching version manifest...`);
    const versionManifest = await sourceManager.getVersionManifest();
    logger.debug(`[DownloadService] Version manifest loaded, found ${versionManifest.versions.length} versions`);
    
    const versionInfo = versionManifest.versions.find(v => v.id === version);
    logger.debug(`[DownloadService] Looking for version ${version}, found: ${JSON.stringify(versionInfo)}`);
    
    if (!versionInfo) {
      logger.error(`[DownloadService] Version ${version} not found in manifest`);
      throw new Error(`未找到版本 ${version}`);
    }
    
    logger.debug(`[DownloadService] Fetching version JSON from: ${versionInfo.url}`);
    const versionJson = await sourceManager.getVersionJson(versionInfo.url);
    logger.debug(`[DownloadService] Version JSON loaded, has ${Object.keys(versionJson).length} properties`);
    
    // 保存版本JSON
    const versionDir = path.join(MINECRAFT_DIR, 'versions', version);
    logger.debug(`[DownloadService] Ensuring version directory: ${versionDir}`);
    await fse.ensureDir(versionDir);
    
    const versionJsonPath = path.join(versionDir, `${version}.json`);
    logger.debug(`[DownloadService] Writing version JSON to: ${versionJsonPath}`);
    await fs.promises.writeFile(
      versionJsonPath,
      JSON.stringify(versionJson, null, 2)
    );
    logger.debug(`[DownloadService] Version JSON saved successfully`);
      // 2. 构建下载任务列表
    logger.debug(`[DownloadService] Step 2: Building download tasks`);
    session.sender.send('download:step', { step: '分析下载任务', progress: 10 });
    
    logger.debug(`[DownloadService] Calling buildDownloadTasks with version: ${version}, loader: ${loader}`);
    const downloadTasks = await buildDownloadTasks(versionJson, version, loader);
    logger.debug(`[DownloadService] Built ${downloadTasks.length} download tasks`);
    
    // 统计信息
    session.stats.totalFiles = downloadTasks.length;
    session.stats.totalSize = downloadTasks.reduce((sum, task) => sum + (task.size || 0), 0);
    logger.debug(`[DownloadService] Download statistics - Files: ${session.stats.totalFiles}, Total size: ${session.stats.totalSize} bytes`);
    
    // 记录前几个下载任务的详细信息
    const sampleTasks = downloadTasks.slice(0, 5);
    logger.debug(`[DownloadService] Sample download tasks: ${JSON.stringify(sampleTasks.map(t => ({ url: t.url, dest: t.dest, size: t.size })))}`);
    
    // 3. 开始批量下载
    logger.debug(`[DownloadService] Step 3: Starting batch download`);
    session.sender.send('download:step', { step: '下载文件', progress: 20 });
      // 添加所有任务到下载管理器
    logger.debug(`[DownloadService] Adding ${downloadTasks.length} tasks to download manager`);
    downloadTasks.forEach((task, index) => {
      const transformedUrl = sourceManager.transformUrl(task.url);
      logger.debug(`[DownloadService] Adding task ${index + 1}/${downloadTasks.length}: ${path.basename(task.dest)} (${task.size} bytes) from ${transformedUrl}`);
      
      // 调试记录任务添加
      debugLogger.logTaskAdded({
        id: `${index + 1}`,
        dest: task.dest,
        size: task.size,
        url: transformedUrl
      });
      
      downloadManager.addTask({
        ...task,
        url: transformedUrl,
        metadata: { session: session.id }
      });
    });
    
    logger.debug(`[DownloadService] All tasks added to download manager, waiting for completion`);
    // 等待所有下载完成
    await waitForDownloadCompletion(session);// 4. 后处理
    session.sender.send('download:step', { step: '后处理', progress: 90 });
    await postProcessDownload(versionJson, version);
    
    // 5. 完整性检查和游戏初始化（临时禁用以避免阻塞）
    session.sender.send('download:step', { step: '准备完成', progress: 95 });
    
    // 检查是否启用完整性检查
    if (emergencyConfig.integrity.enabled) {
      // 延迟执行完整性检查，避免阻塞主进程
      setTimeout(async () => {
        try {
          session.sender.send('download:step', { step: '检查完整性并初始化游戏', progress: 95 });
          
          // 导入完整性服务
          const IntegrityService = require('./src/services/IntegrityAndRepairService.cjs');
          const integrityService = new IntegrityService();
          
          // 执行下载后处理（包括完整性检查、修复、初始化）
          const postProcessResult = await integrityService.postDownloadProcess(
            version, 
            versionJson, 
            {
              maxMemory: 4096,
              minMemory: 1024,
              windowWidth: 854,
              windowHeight: 480
            },
            (progress) => {
              // 转发进度到前端
              session.sender.send('download:integrityProgress', {
                session: session.id,
                ...progress
              });
            }
          );
          
          if (!postProcessResult.success) {
            logger.warn(`游戏初始化警告: ${postProcessResult.message}`);
          }
          
          session.sender.send('download:integrityComplete', {
            session: session.id,
            result: postProcessResult
          });
          
        } catch (error) {
          logger.error(`完整性检查和初始化失败: ${error.message}`);
          // 不影响主下载流程，只记录警告
          session.sender.send('download:integrityError', {
            session: session.id,
            error: error.message
          });
        }
      }, 100); // 100ms延迟，让下载完成事件先发送
    } else {
      logger.info('完整性检查已禁用（紧急修复模式）');
      // 发送简单的完成通知
      session.sender.send('download:integrityComplete', {
        session: session.id,
        result: {
          success: true,
          message: '下载完成（跳过完整性检查）',
          versionId: version
        }
      });
    }

    // 6. 完成
    session.sender.send('download:completed', {
      session: session.id,
      stats: session.stats,
      duration: Date.now() - session.startTime
    });
    
    logger.info(`Minecraft ${version} 下载完成`);
    
  } catch (error) {
    logger.error(`下载失败: ${error.message}`);
    session.sender.send('download:error', {
      session: session.id,
      error: error.message,
      stack: error.stack
    });
    
    throw error;
  } finally {
    currentDownloadSession = null;
  }
}

/**
 * 构建下载任务列表
 * @param {Object} versionJson - 版本JSON
 * @param {string} version - 版本号
 * @param {Object} loader - 模组加载器配置
 * @returns {Array} - 下载任务列表
 */
async function buildDownloadTasks(versionJson, version, loader) {
  logger.debug(`[BuildTasks] Starting buildDownloadTasks for version ${version} with loader ${loader}`);
  const tasks = [];
  
  // 1. 客户端JAR文件
  logger.debug(`[BuildTasks] Processing client JAR`);
  if (versionJson.downloads?.client) {
    const clientDownload = versionJson.downloads.client;
    const clientTask = {
      id: `client-${version}`,
      url: clientDownload.url,
      dest: path.join(MINECRAFT_DIR, 'versions', version, `${version}.jar`),
      expectedSha1: clientDownload.sha1,
      size: clientDownload.size,
      priority: 10, // 高优先级
      type: 'client'
    };
    logger.debug(`[BuildTasks] Added client task: ${JSON.stringify({ url: clientTask.url, dest: clientTask.dest, size: clientTask.size })}`);
    tasks.push(clientTask);
  } else {
    logger.warn(`[BuildTasks] No client download info found in version JSON`);
  }
  
  // 2. 依赖库文件
  logger.debug(`[BuildTasks] Processing libraries`);
  if (versionJson.libraries) {
    logger.debug(`[BuildTasks] Found ${versionJson.libraries.length} libraries`);
    for (const [index, library] of versionJson.libraries.entries()) {
      logger.debug(`[BuildTasks] Processing library ${index + 1}/${versionJson.libraries.length}: ${library.name}`);
      
      if (shouldDownloadLibrary(library)) {
        logger.debug(`[BuildTasks] Library ${library.name} should be downloaded`);
        
        if (library.downloads?.artifact) {
          const artifact = library.downloads.artifact;
          const libraryTask = {
            id: `library-${library.name}`,
            url: artifact.url,
            dest: path.join(MINECRAFT_DIR, 'libraries', artifact.path),
            expectedSha1: artifact.sha1,
            size: artifact.size,
            priority: 5,
            type: 'library'
          };
          logger.debug(`[BuildTasks] Added library task: ${JSON.stringify({ name: library.name, url: libraryTask.url, size: libraryTask.size })}`);
          tasks.push(libraryTask);
        }
        
        // natives库
        if (library.downloads?.classifiers) {
          logger.debug(`[BuildTasks] Processing natives for library ${library.name}`);
          const natives = getNativesForPlatform(library.downloads.classifiers);
          if (natives) {
            const nativesTask = {
              id: `natives-${library.name}`,
              url: natives.url,
              dest: path.join(MINECRAFT_DIR, 'libraries', natives.path),
              expectedSha1: natives.sha1,
              size: natives.size,
              priority: 5,
              type: 'natives'
            };
            logger.debug(`[BuildTasks] Added natives task: ${JSON.stringify({ name: library.name, url: nativesTask.url, size: nativesTask.size })}`);
            tasks.push(nativesTask);
          } else {
            logger.debug(`[BuildTasks] No natives found for current platform for library ${library.name}`);
          }
        }
      } else {
        logger.debug(`[BuildTasks] Skipping library ${library.name} (rules don't match)`);
      }
    }
  } else {
    logger.warn(`[BuildTasks] No libraries found in version JSON`);
  }
    // 3. 资源文件
  logger.debug(`[BuildTasks] Processing assets`);
  if (versionJson.assetIndex) {
    const assetIndex = versionJson.assetIndex;
    logger.debug(`[BuildTasks] Found asset index: ${assetIndex.id}`);
    
    // 下载资源索引
    const assetIndexTask = {
      id: `asset-index-${assetIndex.id}`,
      url: assetIndex.url,
      dest: path.join(MINECRAFT_DIR, 'assets', 'indexes', `${assetIndex.id}.json`),
      expectedSha1: assetIndex.sha1,
      size: assetIndex.size,
      priority: 8,
      type: 'asset-index'
    };
    logger.debug(`[BuildTasks] Added asset index task: ${JSON.stringify({ id: assetIndex.id, url: assetIndexTask.url, size: assetIndexTask.size })}`);
    tasks.push(assetIndexTask);
    
    // 获取资源文件列表
    try {
      logger.debug(`[BuildTasks] Fetching asset index data from: ${assetIndex.url}`);
      const assetIndexData = await sourceManager.getAssetIndex(assetIndex.url);
      
      const assetCount = Object.keys(assetIndexData.objects).length;
      logger.debug(`[BuildTasks] Found ${assetCount} assets in index`);
      
      let processedAssets = 0;
      for (const [assetPath, assetInfo] of Object.entries(assetIndexData.objects)) {
        processedAssets++;
        if (processedAssets <= 10) { // Log first 10 assets for debugging
          logger.debug(`[BuildTasks] Processing asset ${processedAssets}/${assetCount}: ${assetPath} (${assetInfo.size} bytes)`);
        }
        
        const hash = assetInfo.hash;
        const hashPrefix = hash.substring(0, 2);
        
        const assetTask = {
          id: `asset-${hash}`,
          url: `https://resources.download.minecraft.net/${hashPrefix}/${hash}`,
          dest: path.join(MINECRAFT_DIR, 'assets', 'objects', hashPrefix, hash),
          expectedSha1: hash,
          size: assetInfo.size,
          priority: 1,
          type: 'asset',
          metadata: { assetPath }
        };
        tasks.push(assetTask);
      }
      logger.debug(`[BuildTasks] Added ${processedAssets} asset tasks`);
    } catch (error) {
      logger.error(`[BuildTasks] Failed to get asset index: ${error.message}, Stack: ${error.stack}`);
      logger.warn(`获取资源索引失败: ${error.message}`);
    }
  } else {
    logger.warn(`[BuildTasks] No asset index found in version JSON`);
  }
  
  // 4. 日志配置文件
  logger.debug(`[BuildTasks] Processing logging config`);
  if (versionJson.logging?.client?.file) {
    const loggingFile = versionJson.logging.client.file;
    const loggingTask = {
      id: `logging-${loggingFile.id}`,
      url: loggingFile.url,
      dest: path.join(MINECRAFT_DIR, 'assets', 'log_configs', loggingFile.id),
      expectedSha1: loggingFile.sha1,
      size: loggingFile.size,
      priority: 3,
      type: 'logging'
    };
    logger.debug(`[BuildTasks] Added logging task: ${JSON.stringify({ id: loggingFile.id, url: loggingTask.url, size: loggingTask.size })}`);
    tasks.push(loggingTask);
  } else {
    logger.debug(`[BuildTasks] No logging config found in version JSON`);
  }
  
  logger.debug(`[BuildTasks] Completed buildDownloadTasks with ${tasks.length} total tasks`);
  const taskSummary = tasks.reduce((acc, task) => {
    acc[task.type] = (acc[task.type] || 0) + 1;
    return acc;
  }, {});
  logger.debug(`[BuildTasks] Task summary by type: ${JSON.stringify(taskSummary)}`);
  
  return tasks;
}

/**
 * 检查是否应该下载该库
 * @param {Object} library - 库信息
 * @returns {boolean} - 是否下载
 */
function shouldDownloadLibrary(library) {
  if (!library.rules) return true;
  
  let allow = false;
  
  for (const rule of library.rules) {
    if (rule.action === 'allow') {
      if (!rule.os || matchesCurrentOS(rule.os)) {
        allow = true;
      }
    } else if (rule.action === 'disallow') {
      if (!rule.os || matchesCurrentOS(rule.os)) {
        allow = false;
      }
    }
  }
  
  return allow;
}

/**
 * 检查操作系统匹配
 * @param {Object} osRule - 操作系统规则
 * @returns {boolean} - 是否匹配
 */
function matchesCurrentOS(osRule) {
  const platform = process.platform;
  
  if (osRule.name) {
    switch (osRule.name) {
      case 'windows':
        return platform === 'win32';
      case 'linux':
        return platform === 'linux';
      case 'osx':
        return platform === 'darwin';
      default:
        return false;
    }
  }
  
  return true;
}

/**
 * 获取当前平台的natives库
 * @param {Object} classifiers - 分类器对象
 * @returns {Object|null} - natives库信息
 */
function getNativesForPlatform(classifiers) {
  const platform = process.platform;
  
  // 构建平台标识符
  const platformMappings = {
    'win32': 'natives-windows',
    'linux': 'natives-linux',
    'darwin': 'natives-macos'
  };
  
  const platformKey = platformMappings[platform];
  if (!platformKey || !classifiers[platformKey]) {
    return null;
  }
  
  return classifiers[platformKey];
}

/**
 * 等待下载完成
 * @param {DownloadSession} session - 下载会话
 */
async function waitForDownloadCompletion(session) {
  logger.debug(`[DownloadService] Starting waitForDownloadCompletion for session ${session.id}`);
  
  return new Promise((resolve, reject) => {
    let checkCount = 0;
    const checkInterval = setInterval(() => {
      checkCount++;
      logger.debug(`[DownloadService] Completion check #${checkCount} for session ${session.id}`);      const stats = downloadManager.getStats();
      logger.debug(`[DownloadService] Download stats: ${JSON.stringify(stats)}`);
      
      // 直接从下载管理器获取状态，避免getStats()方法可能的问题
      const activeTasks = downloadManager.activeTasks || new Map();
      const taskQueue = downloadManager.taskQueue || [];
      const completedTasks = downloadManager.completedTasks || new Map();
      const failedTasks = downloadManager.failedTasks || new Map();
      
      const activeCount = activeTasks.size;
      const queuedCount = taskQueue.length;
      const completedCount = completedTasks.size;
      const failedCount = failedTasks.size;
      
      logger.debug(`[DownloadService] Direct task counts - Active: ${activeCount}, Queued: ${queuedCount}, Completed: ${completedCount}, Failed: ${failedCount}`);
      
      // 调试记录队列状态 - 使用直接计数
      debugLogger.logQueueStatus(activeCount, queuedCount, completedCount, failedCount);
        // 定期记录系统状态
      if (checkCount % 10 === 0) {
        debugLogger.logSystemStatus();
        // 验证任务状态一致性
        const stateValidation = downloadManager.validateTaskState();
        logger.debug(`[DownloadService] Task state validation: ${JSON.stringify(stateValidation)}`);
      }// 更新会话统计 - 使用直接计数
      session.stats = {
        ...session.stats,
        completedFiles: completedCount,
        failedFiles: failedCount,
        downloadedSize: stats.downloadedSize || 0
      };
      
      logger.debug(`[DownloadService] Updated session stats: ${JSON.stringify(session.stats)}`);
      
      // 发送进度更新 - 使用直接计数
      const progressData = {
        session: session.id,
        stats: session.stats,
        totalProgress: (stats.downloadedSize / stats.totalSize) * 100,
        speed: stats.speed || 0,
        activeFiles: activeCount,
        queuedFiles: queuedCount
      };
      
      logger.debug(`[DownloadService] Sending progress update: ${JSON.stringify(progressData)}`);
      session.sender.send('download:progress', progressData);        // 检查是否完成 - 使用直接计数
      logger.debug(`[DownloadService] Checking completion - Active: ${activeCount}, Queued: ${queuedCount}, Failed: ${failedCount}`);
      
      if (activeCount === 0 && queuedCount === 0) {
        logger.debug(`[DownloadService] Download completion detected for session ${session.id}`);
        
        // 导出调试报告
        const reportPath = debugLogger.exportDebugReport();
        if (reportPath) {
          logger.info(`调试报告已保存: ${reportPath}`);
        }
        
        clearInterval(checkInterval);        
        if (failedCount > 0) {
          logger.error(`[DownloadService] Download failed with ${failedCount} failed files`);
          reject(new Error(`${failedCount} 个文件下载失败`));
        } else {
          logger.debug(`[DownloadService] Download completed successfully for session ${session.id}`);
          resolve();
        }
      } else {
        logger.debug(`[DownloadService] Download still in progress - Active: ${activeCount}, Queued: ${queuedCount}`);
        
        // 检查是否可能卡死（超过5分钟没有活动）
        if (activeCount > 0 && checkCount > 300) { // 5分钟
          debugLogger.logPotentialHang('waitForDownloadCompletion', {
            activeFiles: activeCount,
            queuedFiles: queuedCount,
            checkCount,
            elapsed: checkCount * 1000
          });
        }
      }
    }, 1000);
    
    // 设置超时（30分钟）
    setTimeout(() => {
      logger.error(`[DownloadService] Download timeout for session ${session.id} after 30 minutes`);
      clearInterval(checkInterval);
      reject(new Error('下载超时'));
    }, 30 * 60 * 1000);
  });
}

/**
 * 下载后处理
 * @param {Object} versionJson - 版本JSON
 * @param {string} version - 版本号
 */
async function postProcessDownload(versionJson, version) {
  // 1. 解压natives库
  await extractNatives(versionJson, version);
  
  // 2. 创建虚拟资源文件（老版本需要）
  await createVirtualAssets(versionJson);
  
  // 3. 创建启动器配置
  await createLauncherProfile(version);
}

/**
 * 解压natives库
 * @param {Object} versionJson - 版本JSON
 * @param {string} version - 版本号
 */
async function extractNatives(versionJson, version) {
  const nativesDir = path.join(MINECRAFT_DIR, 'versions', version, 'natives');
  await fse.ensureDir(nativesDir);
  
  // 这里可以实现natives解压逻辑
  logger.info('Natives解压完成');
}

/**
 * 创建虚拟资源文件
 * @param {Object} versionJson - 版本JSON
 */
async function createVirtualAssets(versionJson) {
  // 实现虚拟资源创建逻辑
  logger.info('虚拟资源创建完成');
}

/**
 * 创建启动器配置
 * @param {string} version - 版本号
 */
async function createLauncherProfile(version) {
  const profilesPath = path.join(MINECRAFT_DIR, 'launcher_profiles.json');
  
  let profiles = {};
  if (fs.existsSync(profilesPath)) {
    try {
      const content = await fs.promises.readFile(profilesPath, 'utf8');
      profiles = JSON.parse(content);
    } catch (error) {
      logger.warn('读取启动器配置失败，将创建新配置');
    }
  }
  
  // 确保profiles结构存在
  if (!profiles.profiles) {
    profiles.profiles = {};
  }
  
  // 添加新版本配置
  profiles.profiles[version] = {
    created: new Date().toISOString(),
    gameDir: MINECRAFT_DIR,
    lastUsed: new Date().toISOString(),
    lastVersionId: version,
    name: version,
    type: 'custom'
  };
  
  profiles.selectedProfile = version;
  
  await fs.promises.writeFile(
    profilesPath,
    JSON.stringify(profiles, null, 2)
  );
}

// IPC事件处理程序
ipcMain.handle('download:start', async (event, options) => {
  logger.debug(`[IPC] Received download:start request with options: ${JSON.stringify(options)}`);
  
  try {
    logger.debug(`[IPC] Starting downloadMinecraft...`);
    await downloadMinecraft(options, event.sender);
    logger.debug(`[IPC] downloadMinecraft completed successfully`);
    return { success: true };
  } catch (error) {
    logger.error(`[IPC] Download failed: ${error.message}`);
    logger.debug(`[IPC] Download error stack: ${error.stack}`);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('download:pause', async (event) => {
  try {
    if (downloadManager) {
      downloadManager.pauseAll();
      return { success: true };
    }
    return { success: false, error: '下载管理器未初始化' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('download:resume', async (event) => {
  try {
    if (downloadManager) {
      downloadManager.resumeAll();
      return { success: true };
    }
    return { success: false, error: '下载管理器未初始化' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('download:cancel', async (event) => {
  try {
    if (downloadManager) {
      await downloadManager.cleanup();
      downloadManager = null;
      currentDownloadSession = null;
      return { success: true };
    }
    return { success: false, error: '没有正在进行的下载' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('download:getStats', async (event) => {
  try {
    if (downloadManager) {
      return {
        success: true,
        stats: downloadManager.getStats(),
        session: currentDownloadSession?.id || null
      };
    }
    return { success: false, error: '下载管理器未初始化' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 下载源管理
ipcMain.handle('downloadSource:getAll', async (event) => {
  try {
    initializeDownloadManagers();
    return {
      success: true,
      sources: sourceManager.getAllSources(),
      current: sourceManager.currentSource
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('downloadSource:setCurrent', async (event, sourceKey) => {
  try {
    initializeDownloadManagers();
    sourceManager.setCurrentSource(sourceKey);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('downloadSource:test', async (event, sourceKey) => {
  try {
    initializeDownloadManagers();
    const result = await sourceManager.testSource(sourceKey);
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('downloadSource:testAll', async (event) => {
  try {
    initializeDownloadManagers();
    const results = await sourceManager.testAllSources();
    return { success: true, results };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('downloadSource:selectBest', async (event) => {
  try {
    initializeDownloadManagers();
    const bestSource = await sourceManager.selectBestSource();
    return { success: true, bestSource };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 获取版本信息
ipcMain.handle('version:getManifest', async (event) => {
  try {
    initializeDownloadManagers();
    const manifest = await sourceManager.getVersionManifest();
    return { success: true, manifest };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('version:getForgeVersions', async (event, mcVersion) => {
  try {
    initializeDownloadManagers();
    const versions = await sourceManager.getForgeVersions(mcVersion);
    return { success: true, versions };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('version:getFabricVersions', async (event, mcVersion) => {
  try {
    initializeDownloadManagers();
    const versions = await sourceManager.getFabricVersions(mcVersion);
    return { success: true, versions };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('version:getOptiFineVersions', async (event, mcVersion) => {
  try {
    initializeDownloadManagers();
    const versions = await sourceManager.getOptiFineVersions(mcVersion);
    return { success: true, versions };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 获取下载管理器信息
ipcMain.handle('download:getInfo', async () => {
  try {
    initializeDownloadManagers();
    const bandwidthStats = downloadManager.getBandwidthStats ? downloadManager.getBandwidthStats() : {};
    return {
      success: true,
      info: {
        maxConcurrent: downloadManager.maxConcurrentFiles,
        maxThreads: downloadManager.maxThreadsPerFile,
        chunkSize: downloadManager.chunkSize,
        largeFileThreshold: downloadManager.largeFileThreshold,
        enableAdaptiveConcurrency: downloadManager.enableAdaptiveConcurrency,
        currentConcurrency: bandwidthStats.currentConcurrency || downloadManager.maxConcurrentFiles,
        bandwidthStats: bandwidthStats
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 手动调整并发数
ipcMain.handle('download:setConcurrency', async (event, newConcurrency) => {
  try {    initializeDownloadManagers();
    if (downloadManager.setConcurrency) {
      const result = downloadManager.setConcurrency(newConcurrency);
      return { success: true, ...result };
    }
    return { success: false, error: '不支持动态调整并发数' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 获取性能统计信息
ipcMain.handle('download:getPerformanceStats', async () => {
  try {
    initializeDownloadManagers();
    const bandwidthStats = downloadManager.getBandwidthStats ? downloadManager.getBandwidthStats() : {};
    return {
      success: true,
      stats: {
        bandwidth: bandwidthStats,
        tasks: {
          active: downloadManager.activeTasks ? downloadManager.activeTasks.size : 0,
          queued: downloadManager.taskQueue ? downloadManager.taskQueue.length : 0,
          completed: downloadManager.completedTasks ? downloadManager.completedTasks.size : 0,
          failed: downloadManager.failedTasks ? downloadManager.failedTasks.size : 0
        }
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 重置性能统计
ipcMain.handle('download:resetStats', async () => {
  try {
    initializeDownloadManagers();
    if (downloadManager.performanceStats) {
      downloadManager.performanceStats.concurrencyHistory = [];
      downloadManager.performanceStats.adjustmentHistory = [];
    }
    if (downloadManager.bandwidthStats) {
      downloadManager.bandwidthStats.sessionStartTime = Date.now();
      downloadManager.bandwidthStats.totalTransferred = 0;
      downloadManager.bandwidthStats.peakSpeed = 0;
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 获取并发优化建议
ipcMain.handle('download:getConcurrencyRecommendation', async () => {
  try {
    initializeDownloadManagers();
    const bandwidthStats = downloadManager.getBandwidthStats ? downloadManager.getBandwidthStats() : {};
    
    let recommendation = {
      suggested: bandwidthStats.currentConcurrency || 12,
      reason: '当前设置合理',
      canIncrease: false,
      canDecrease: false
    };
    
    if (bandwidthStats.efficiency > 0.8 && bandwidthStats.currentConcurrency < downloadManager.maxConcurrentFiles) {
      recommendation.suggested = Math.min(bandwidthStats.currentConcurrency + 4, downloadManager.maxConcurrentFiles);
      recommendation.reason = '网络效率较高，建议增加并发数';
      recommendation.canIncrease = true;
    } else if (bandwidthStats.efficiency < 0.5 && bandwidthStats.currentConcurrency > 8) {
      recommendation.suggested = Math.max(bandwidthStats.currentConcurrency - 2, 8);
      recommendation.reason = '网络效率较低，建议减少并发数';
      recommendation.canDecrease = true;
    }
    
    return { success: true, recommendation };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 导出主要函数
module.exports = {
  downloadMinecraft,
  initializeDownloadManagers
};

logger.info('高级下载服务已初始化 - 支持最多48个文件并发，智能自适应并发控制');
