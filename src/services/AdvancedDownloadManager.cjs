// src/services/AdvancedDownloadManager.cjs
// 高级下载管理器 - 支持多线程下载和并发控制

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const fse = require('fs-extra');
const { logger } = require('../../utils.cjs');
const { debugLogger } = require('../../debug-config.cjs');

// 常量配置 - 48线程优化 + 超时优化
const CHUNK_SIZE = 1024 * 1024 * 8; // 8MB每块，减少网络请求
const MAX_CONCURRENT_FILES = 48; // 最大并发文件数，充分利用带宽
const LARGE_FILE_THRESHOLD = 5 * 1024 * 1024; // 5MB阈值，更多文件使用多线程
const MAX_THREADS_PER_FILE = 8; // 每个大文件最大线程数
const RETRY_ATTEMPTS = 3; // 重试次数
const RETRY_DELAY = 1000; // 重试延迟(ms)
const MAX_TOTAL_THREADS = 48; // 全局最大线程数限制

// 自适应并发控制常量
const MIN_CONCURRENT_FILES = 4; // 最小并发文件数
const CONCURRENCY_ADJUSTMENT_STEP = 2; // 并发调整步长
const BANDWIDTH_MONITOR_INTERVAL = 2000; // 带宽监控间隔(ms)
const SPEED_HISTORY_SIZE = 10; // 速度历史记录数量
const EFFICIENCY_THRESHOLD = 0.8; // 效率阈值，低于此值会调整并发数

// 超时和速度控制常量
const SMALL_FILE_TIMEOUT = 15000; // 小文件超时15秒
const LARGE_FILE_TIMEOUT = 60000; // 大文件超时60秒
const MIN_SPEED_THRESHOLD = 1024; // 最小速度阈值1KB/s
const SPEED_CHECK_INTERVAL = 5000; // 速度检查间隔5秒
const STALLED_TIMEOUT = 10000; // 停滞超时10秒

/**
 * 下载任务状态枚举
 */
const TaskStatus = {
  PENDING: 'pending',
  DOWNLOADING: 'downloading',
  COMPLETED: 'completed',
  FAILED: 'failed',
  PAUSED: 'paused'
};

/**
 * 下载任务类
 */
class DownloadTask {
  constructor(options) {
    this.id = options.id || Date.now().toString();
    this.url = options.url;
    this.dest = options.dest;
    this.expectedSha1 = options.expectedSha1;
    this.size = options.size || 0;
    this.status = TaskStatus.PENDING;
    this.progress = 0;
    this.speed = 0;
    this.error = null;
    this.retryCount = 0;
    this.priority = options.priority || 0;
    this.metadata = options.metadata || {};
    this.downloadedBytes = 0;
    this.chunkProgress = {};
    
    // 新增：超时和速度监控
    this.startTime = null;
    this.lastProgressTime = null;
    this.lastProgressBytes = 0;
    this.stallTimer = null;
    this.speedCheckTimer = null;
    this.isStalled = false;
  }
  
  /**
   * 开始下载监控
   */
  startMonitoring() {
    this.startTime = Date.now();
    this.lastProgressTime = Date.now();
    this.lastProgressBytes = 0;
    this.isStalled = false;
    
    // 定期检查下载速度
    this.speedCheckTimer = setInterval(() => {
      this.checkDownloadSpeed();
    }, SPEED_CHECK_INTERVAL);
  }
  
  /**
   * 检查下载速度
   */
  checkDownloadSpeed() {
    const now = Date.now();
    const timeDiff = now - this.lastProgressTime;
    const bytesDiff = this.downloadedBytes - this.lastProgressBytes;
    
    if (timeDiff > 0) {
      const currentSpeed = (bytesDiff / timeDiff) * 1000; // bytes/sec
      this.speed = currentSpeed;
      
      // 检查是否停滞
      if (currentSpeed < MIN_SPEED_THRESHOLD && timeDiff > STALLED_TIMEOUT) {
        this.isStalled = true;
        console.warn(`任务 ${this.id} 下载速度过慢: ${currentSpeed.toFixed(0)}B/s`);
      }
      
      this.lastProgressTime = now;
      this.lastProgressBytes = this.downloadedBytes;
    }
  }
  
  /**
   * 停止监控
   */
  stopMonitoring() {
    if (this.speedCheckTimer) {
      clearInterval(this.speedCheckTimer);
      this.speedCheckTimer = null;
    }
    if (this.stallTimer) {
      clearTimeout(this.stallTimer);
      this.stallTimer = null;
    }
  }
  
  /**
   * 更新进度
   */
  updateProgress(bytes) {
    this.downloadedBytes = bytes;
    if (this.size > 0) {
      this.progress = Math.round((bytes / this.size) * 100);
    }
    this.lastProgressTime = Date.now();
  }
}

/**
 * 高级下载管理器
 */
class AdvancedDownloadManager extends EventEmitter {  constructor(options = {}) {
    super();
    this.maxConcurrentFiles = options.maxConcurrentFiles || MAX_CONCURRENT_FILES;
    this.largeFileThreshold = options.largeFileThreshold || LARGE_FILE_THRESHOLD;
    this.maxThreadsPerFile = options.maxThreadsPerFile || MAX_THREADS_PER_FILE;
    this.chunkSize = options.chunkSize || CHUNK_SIZE;
    this.tempDir = options.tempDir || path.join(process.cwd(), 'temp');
    
    // 高级功能配置
    this.enableAdaptiveConcurrency = options.enableAdaptiveConcurrency !== false; // 默认启用
    this.bandwidthMonitor = options.bandwidthMonitor !== false; // 默认启用
    this.maxTotalThreads = options.maxTotalThreads || MAX_TOTAL_THREADS;
    
    // 自适应并发控制 - 48线程优化
    this.currentConcurrency = Math.min(12, this.maxConcurrentFiles); // 起始并发数提升到12
    this.minConcurrency = Math.min(MIN_CONCURRENT_FILES, this.maxConcurrentFiles);
    this.lastSpeedCheck = Date.now();
    this.speedHistory = [];
    this.adaptiveCheckInterval = 3000; // 3秒检查一次，更频繁的调整
    this.lastAdjustmentTime = Date.now();
    this.adjustmentCooldown = 5000; // 调整冷却时间5秒
    
    // 带宽监控 - 增强版
    this.bandwidthStats = {
      currentSpeed: 0,
      averageSpeed: 0,
      peakSpeed: 0,
      efficiency: 0,
      totalTransferred: 0,
      sessionStartTime: Date.now(),
      lastMeasurementTime: Date.now(),
      measurementInterval: BANDWIDTH_MONITOR_INTERVAL
    };
    
    // 性能监控
    this.performanceStats = {
      activeThreads: 0,
      totalThreadsUsed: 0,
      concurrencyHistory: [],
      adjustmentHistory: []
    };
    
    // 任务队列和状态
    this.taskQueue = [];
    this.activeTasks = new Map();
    this.completedTasks = new Map();
    this.failedTasks = new Map();
    
    // 统计信息
    this.stats = {
      totalFiles: 0,
      completedFiles: 0,
      failedFiles: 0,
      totalSize: 0,
      downloadedSize: 0,
      startTime: null,
      endTime: null
    };
      // 确保临时目录存在
    fse.ensureDirSync(this.tempDir);
    
    // 绑定方法
    this.processQueue = this.processQueue.bind(this);
    
    // 启动停滞任务检测器
    this.startStalledTaskDetector();
  }
  /**
   * 添加下载任务
   * @param {Object} taskOptions - 任务选项
   * @returns {string} - 任务ID
   */  addTask(taskOptions) {
    const task = new DownloadTask(taskOptions);
    
    // 检查任务是否已存在（防重复）
    const existingInQueue = this.taskQueue.find(t => t.dest === task.dest);
    const existingInActive = Array.from(this.activeTasks.values()).find(t => t.dest === task.dest);
    const existingInCompleted = this.completedTasks.has(task.dest);
    
    if (existingInQueue || existingInActive || existingInCompleted) {
      logger.debug(`[AdvancedDownloadManager] Task already exists for ${task.dest}, skipping duplicate`);
      return existingInQueue?.id || existingInActive?.id || task.dest;
    }
    
    logger.debug(`[AdvancedDownloadManager] Adding task: ${task.id} - ${path.basename(task.dest)} (${task.size} bytes) from ${task.url}`);
    
    this.taskQueue.push(task);
    this.stats.totalFiles++;
    this.stats.totalSize += task.size;
    
    logger.debug(`[AdvancedDownloadManager] Task queue now has ${this.taskQueue.length} tasks, total files: ${this.stats.totalFiles}, total size: ${this.stats.totalSize}`);
    
    this.emit('taskAdded', task);
    this.processQueue();
    
    return task.id;
  }

  /**
   * 批量添加任务
   * @param {Array} tasks - 任务数组
   */
  addTasks(tasks) {
    tasks.forEach(taskOptions => this.addTask(taskOptions));
  }  /**
   * 处理任务队列 - 支持自适应并发控制
   */
  async processQueue() {
    logger.debug(`[AdvancedDownloadManager] Processing queue - Queue: ${this.taskQueue.length}, Active: ${this.activeTasks.size}`);
    
    // 清理重复任务
    this.cleanupDuplicateTasks();
    
    // 自适应并发控制
    const effectiveConcurrency = this.enableAdaptiveConcurrency ? 
      this.currentConcurrency : this.maxConcurrentFiles;
    
    logger.debug(`[AdvancedDownloadManager] Effective concurrency: ${effectiveConcurrency} (adaptive: ${this.enableAdaptiveConcurrency})`);
    
    // 检查是否有空闲槽位
    if (this.activeTasks.size >= effectiveConcurrency) {
      logger.debug(`[AdvancedDownloadManager] No free slots - Active: ${this.activeTasks.size}, Max: ${effectiveConcurrency}`);
      return;
    }
    
    // 按优先级排序任务队列
    this.taskQueue.sort((a, b) => b.priority - a.priority);
    logger.debug(`[AdvancedDownloadManager] Queue sorted by priority`);
    
    // 启动新任务
    const availableSlots = effectiveConcurrency - this.activeTasks.size;
    logger.debug(`[AdvancedDownloadManager] Available slots: ${availableSlots}`);
    
    const startedTasks = [];
    while (this.activeTasks.size < effectiveConcurrency && this.taskQueue.length > 0) {
      const task = this.taskQueue.shift();
      
      // 再次检查是否重复（防止并发问题）
      if (this.activeTasks.has(task.id) || this.completedTasks.has(task.dest)) {
        logger.debug(`[AdvancedDownloadManager] Skipping duplicate task: ${task.id}`);
        continue;
      }
      
      logger.debug(`[AdvancedDownloadManager] Starting task from queue: ${task.id} - ${path.basename(task.dest)}`);
      startedTasks.push(this.startTask(task));
    }
    
    // 并发启动任务，但限制并发数
    if (startedTasks.length > 0) {
      await Promise.allSettled(startedTasks);
    }
    
    logger.debug(`[AdvancedDownloadManager] After processing queue - Queue: ${this.taskQueue.length}, Active: ${this.activeTasks.size}`);
    
    // 定期检查并调整并发数
    if (this.enableAdaptiveConcurrency && Date.now() - this.lastSpeedCheck > this.adaptiveCheckInterval) {
      logger.debug(`[AdvancedDownloadManager] Adjusting concurrency (last check was ${Date.now() - this.lastSpeedCheck}ms ago)`);
      this.adjustConcurrency();
    }
  }/**
   * 启动单个任务
   * @param {DownloadTask} task - 下载任务
   */
  async startTask(task) {
    // 检查任务是否已经在运行
    if (this.activeTasks.has(task.id)) {
      logger.debug(`[AdvancedDownloadManager] Task ${task.id} is already active, skipping`);
      return;
    }
    
    logger.debug(`[AdvancedDownloadManager] Starting task: ${task.id} - ${path.basename(task.dest)} (${task.size} bytes)`);
    
    this.activeTasks.set(task.id, task);
    task.status = TaskStatus.DOWNLOADING;
    task.startMonitoring();
    
    logger.debug(`[AdvancedDownloadManager] Task ${task.id} added to active tasks, total active: ${this.activeTasks.size}`);
    
    this.emit('taskStarted', task);
    
    try {
      logger.debug(`[AdvancedDownloadManager] Beginning download for task ${task.id}`);
      await this.downloadTask(task);
      logger.debug(`[AdvancedDownloadManager] Download completed for task ${task.id}`);
      await this.onTaskCompleted(task);
    } catch (error) {
      logger.debug(`[AdvancedDownloadManager] Download failed for task ${task.id}: ${error.message}`);
      await this.onTaskFailed(task, error);
    }
  }

  /**
   * 下载单个任务
   * @param {DownloadTask} task - 下载任务
   */  async downloadTask(task) {
    logger.debug(`[AdvancedDownloadManager] Starting downloadTask for ${task.id} - ${path.basename(task.dest)}`);
    
    // 确保目标目录存在
    const targetDir = path.dirname(task.dest);
    logger.debug(`[AdvancedDownloadManager] Ensuring directory exists: ${targetDir}`);
    await fse.ensureDir(targetDir);
    
    // 检查文件是否已存在且校验通过
    logger.debug(`[AdvancedDownloadManager] Checking if file already exists and is valid: ${task.dest}`);
    if (await this.isFileValid(task.dest, task.expectedSha1)) {
      logger.debug(`[AdvancedDownloadManager] File ${task.dest} already exists and is valid, skipping download`);
      task.progress = 100;
      return;
    }
    
    // 获取文件大小
    if (!task.size) {
      logger.debug(`[AdvancedDownloadManager] Getting file size for ${task.url}`);
      task.size = await this.getFileSize(task.url);
      logger.debug(`[AdvancedDownloadManager] File size: ${task.size} bytes`);
    }
    
    // 根据文件大小选择下载方式
    if (task.size > this.largeFileThreshold) {
      logger.debug(`[AdvancedDownloadManager] Using multi-thread download for large file (${task.size} bytes > ${this.largeFileThreshold})`);
      await this.downloadLargeFile(task);
    } else {
      logger.debug(`[AdvancedDownloadManager] Using single-thread download for small file (${task.size} bytes)`);
      await this.downloadSmallFile(task);
    }
    
    logger.debug(`[AdvancedDownloadManager] Download task completed: ${task.id}`);
  }  /**
   * 下载小文件（单线程）- 优化版本
   * @param {DownloadTask} task - 下载任务
   */
  async downloadSmallFile(task) {
    logger.debug(`[AdvancedDownloadManager] Starting small file download for ${task.id} - ${path.basename(task.dest)} (${task.size} bytes)`);
    
    // 开始监控
    task.startMonitoring();
    
    const timeout = task.size > LARGE_FILE_THRESHOLD ? LARGE_FILE_TIMEOUT : SMALL_FILE_TIMEOUT;
    logger.debug(`[AdvancedDownloadManager] Using timeout: ${timeout}ms for task ${task.id}`);
    
    try {
      logger.debug(`[AdvancedDownloadManager] Making HTTP request for ${task.url}`);
      const response = await axios({
        url: task.url,
        method: 'GET',
        responseType: 'stream',
        timeout: timeout,
        family: 4,
        // 添加请求头优化
        headers: {
          'User-Agent': 'Minecraft-Launcher/1.0',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive'
        }
      });      
      logger.debug(`[AdvancedDownloadManager] HTTP response received for ${task.id}, status: ${response.status}, content-length: ${response.headers['content-length']}`);
      
      logger.debug(`[AdvancedDownloadManager] Creating write stream for ${task.dest}`);
      const writeStream = fs.createWriteStream(task.dest);
      const hash = crypto.createHash('sha1');
      let downloaded = 0;
      const startTime = Date.now();
      let lastSpeedUpdate = startTime;
      
      return new Promise((resolve, reject) => {
        // 设置整体超时
        const overallTimeout = setTimeout(() => {
          logger.debug(`[AdvancedDownloadManager] Download timeout for ${task.id} after ${timeout}ms`);
          task.stopMonitoring();
          response.data.destroy();
          writeStream.destroy();
          reject(new Error(`下载超时: ${task.dest}`));
        }, timeout);
        
        // 设置停滞检测超时
        let stallTimeout = setTimeout(() => {
          if (downloaded === 0) {
            logger.debug(`[AdvancedDownloadManager] Download stalled for ${task.id} (no data received in ${STALLED_TIMEOUT}ms)`);
            task.stopMonitoring();
            response.data.destroy();
            writeStream.destroy();
            reject(new Error(`下载停滞: ${task.dest}`));
          }
        }, STALLED_TIMEOUT);
          response.data.on('data', chunk => {
          hash.update(chunk);
          downloaded += chunk.length;
          
          // 更新进度（减少频繁调用）
          const now = Date.now();
          if (now - lastSpeedUpdate >= 1000) {
            task.updateProgress(downloaded);
            const elapsed = (now - startTime) / 1000;
            task.speed = downloaded / elapsed;
            lastSpeedUpdate = now;
            
            // 只在特定进度节点记录日志，避免重复
            const progressPercent = Math.floor((downloaded / task.size) * 100);
            if (progressPercent % 10 === 0 && progressPercent !== task._lastLoggedProgress) {
              logger.debug(`[AdvancedDownloadManager] Task ${task.id} progress: ${progressPercent}% (${downloaded}/${task.size} bytes)`);
              task._lastLoggedProgress = progressPercent;
            }
          }
          
          // 重置停滞超时
          clearTimeout(stallTimeout);
          stallTimeout = setTimeout(() => {
            const timeSinceLastData = Date.now() - now;
            logger.debug(`[AdvancedDownloadManager] Download stalled for ${task.id} (no data for ${timeSinceLastData}ms)`);
            task.stopMonitoring();
            response.data.destroy();
            writeStream.destroy();
            reject(new Error(`下载停滞: ${task.dest}`));
          }, STALLED_TIMEOUT);
          
          // 间隔更新任务进度统计
          if (now - lastSpeedUpdate >= 500) {
            this.updateTaskProgress(task, downloaded);
          }
        });
          response.data.on('end', () => {
          logger.debug(`[AdvancedDownloadManager] Data stream ended for ${task.id}, downloaded: ${downloaded} bytes`);
          clearTimeout(overallTimeout);
          clearTimeout(stallTimeout);
          task.stopMonitoring();
          
          const calculatedSha1 = hash.digest('hex');
          logger.debug(`[AdvancedDownloadManager] SHA1 check for ${task.id} - Expected: ${task.expectedSha1}, Actual: ${calculatedSha1}`);
          
          if (task.expectedSha1 && calculatedSha1 !== task.expectedSha1) {
            logger.debug(`[AdvancedDownloadManager] SHA1 mismatch for ${task.id}`);
            reject(new Error(`SHA1校验失败: 期望 ${task.expectedSha1}, 实际 ${calculatedSha1}`));
          } else {
            logger.debug(`[AdvancedDownloadManager] SHA1 check passed for ${task.id}`);
            resolve();
          }
        });
        
        response.data.on('error', error => {
          logger.debug(`[AdvancedDownloadManager] Data stream error for ${task.id}: ${error.message}`);
          clearTimeout(overallTimeout);
          clearTimeout(stallTimeout);
          task.stopMonitoring();
          reject(error);
        });
          writeStream.on('error', error => {
          logger.debug(`[AdvancedDownloadManager] Write stream error for ${task.id}: ${error.message}`);
          clearTimeout(overallTimeout);
          clearTimeout(stallTimeout);
          task.stopMonitoring();
          reject(error);
        });
        
        writeStream.on('finish', () => {
          logger.debug(`[AdvancedDownloadManager] Write stream finished for ${task.id}`);
        });
        
        logger.debug(`[AdvancedDownloadManager] Piping response data to write stream for ${task.id}`);
        response.data.pipe(writeStream);      });
    } catch (error) {
      logger.debug(`[AdvancedDownloadManager] Exception in downloadSmallFile for ${task.id}: ${error.message}`);
      task.stopMonitoring();
      throw error;
    }
  }

  /**
   * 下载大文件（多线程）
   * @param {DownloadTask} task - 下载任务
   */
  async downloadLargeFile(task) {
    const chunksCount = Math.min(
      Math.ceil(task.size / this.chunkSize),
      this.maxThreadsPerFile
    );
    
    const chunkSize = Math.ceil(task.size / chunksCount);
    const chunks = [];
    const tempDir = path.join(this.tempDir, task.id);
    
    await fse.ensureDir(tempDir);
    
    // 创建分块任务
    for (let i = 0; i < chunksCount; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize - 1, task.size - 1);
      
      chunks.push({
        index: i,
        start,
        end,
        size: end - start + 1,
        tempPath: path.join(tempDir, `chunk-${i}`)
      });
    }
    
    // 并发下载所有分块
    const downloadPromises = chunks.map(chunk => 
      this.downloadChunk(task, chunk)
    );
    
    await Promise.all(downloadPromises);
    
    // 合并文件
    await this.mergeChunks(task, chunks);
    
    // 清理临时文件
    await fse.remove(tempDir);
  }

  /**
   * 下载单个分块
   * @param {DownloadTask} task - 主任务
   * @param {Object} chunk - 分块信息
   */
  async downloadChunk(task, chunk) {
    const response = await axios({
      url: task.url,
      method: 'GET',
      responseType: 'stream',
      headers: {
        Range: `bytes=${chunk.start}-${chunk.end}`
      },
      timeout: 30000,
      family: 4
    });
    
    const writeStream = fs.createWriteStream(chunk.tempPath);
    let downloaded = 0;
    
    return new Promise((resolve, reject) => {
      response.data.on('data', chunkData => {
        downloaded += chunkData.length;
        this.updateChunkProgress(task, chunk.index, downloaded, chunk.size);
      });
      
      response.data.on('end', resolve);
      response.data.on('error', reject);
      writeStream.on('error', reject);
      response.data.pipe(writeStream);
    });
  }

  /**
   * 合并文件分块
   * @param {DownloadTask} task - 下载任务
   * @param {Array} chunks - 分块数组
   */
  async mergeChunks(task, chunks) {
    const writeStream = fs.createWriteStream(task.dest);
    const hash = crypto.createHash('sha1');
    
    // 按顺序合并分块
    for (const chunk of chunks.sort((a, b) => a.index - b.index)) {
      const chunkData = await fs.promises.readFile(chunk.tempPath);
      hash.update(chunkData);
      writeStream.write(chunkData);
    }
    
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
      writeStream.end();
    });
    
    // 校验SHA1
    const calculatedSha1 = hash.digest('hex');
    if (task.expectedSha1 && calculatedSha1 !== task.expectedSha1) {
      throw new Error(`SHA1校验失败: 期望 ${task.expectedSha1}, 实际 ${calculatedSha1}`);
    }
  }

  /**
   * 获取文件大小
   * @param {string} url - 文件URL
   * @returns {number} - 文件大小
   */  async getFileSize(url) {
    logger.debug(`[AdvancedDownloadManager] Getting file size for: ${url}`);
    
    try {
      const response = await axios.head(url, {
        timeout: 10000,
        family: 4
      });
      
      const size = parseInt(response.headers['content-length'] || '0', 10);
      logger.debug(`[AdvancedDownloadManager] File size retrieved: ${size} bytes for ${url}`);
      return size;
    } catch (error) {
      logger.debug(`[AdvancedDownloadManager] Failed to get file size for ${url}: ${error.message}`);
      return 0;
    }
  }
  /**
   * 检查文件是否有效
   * @param {string} filePath - 文件路径
   * @param {string} expectedSha1 - 期望的SHA1
   * @returns {boolean} - 是否有效
   */
  async isFileValid(filePath, expectedSha1) {
    logger.debug(`[AdvancedDownloadManager] Checking file validity: ${filePath}, expected SHA1: ${expectedSha1}`);
    
    if (!fs.existsSync(filePath)) {
      logger.debug(`[AdvancedDownloadManager] File does not exist: ${filePath}`);
      return false;
    }
    
    if (!expectedSha1) {
      logger.debug(`[AdvancedDownloadManager] No expected SHA1 provided for ${filePath}, assuming valid`);
      return true;
    }
    
    try {
      logger.debug(`[AdvancedDownloadManager] Calculating SHA1 for ${filePath}`);
      const hash = crypto.createHash('sha1');
      const stream = fs.createReadStream(filePath);
      
      for await (const chunk of stream) {
        hash.update(chunk);
      }
      
      const calculatedSha1 = hash.digest('hex');
      const isValid = calculatedSha1 === expectedSha1;
      
      logger.debug(`[AdvancedDownloadManager] SHA1 validation result for ${filePath}: ${isValid} (calculated: ${calculatedSha1}, expected: ${expectedSha1})`);
      return isValid;
    } catch (error) {
      logger.debug(`[AdvancedDownloadManager] Error validating file ${filePath}: ${error.message}`);
      return false;
    }
  }

  /**
   * 更新任务进度
   * @param {DownloadTask} task - 任务
   * @param {number} downloaded - 已下载字节数
   */  updateTaskProgress(task, downloaded) {
    const previousDownloaded = task.downloadedBytes || 0;
    this.stats.downloadedSize += downloaded - previousDownloaded;
    task.downloadedBytes = downloaded;
    
    // 计算进度百分比
    task.progress = task.size > 0 ? (downloaded / task.size) * 100 : 0;
    
    // 计算总进度
    const totalProgress = this.stats.totalSize > 0 ? (this.stats.downloadedSize / this.stats.totalSize) * 100 : 0;
    
    // 定期记录进度（每10%记录一次）
    const progressRounded = Math.floor(task.progress / 10) * 10;
    if (!task._lastLoggedProgress || task._lastLoggedProgress !== progressRounded) {
      if (progressRounded % 10 === 0 && progressRounded > 0) {
        logger.debug(`[AdvancedDownloadManager] Task ${task.id} progress: ${progressRounded}% (${downloaded}/${task.size} bytes)`);
        task._lastLoggedProgress = progressRounded;
      }
    }
    
    this.emit('progress', {
      task,
      totalProgress,
      stats: this.stats
    });
  }

  /**
   * 更新分块进度
   * @param {DownloadTask} task - 主任务
   * @param {number} chunkIndex - 分块索引
   * @param {number} downloaded - 分块已下载字节数
   * @param {number} total - 分块总字节数
   */
  updateChunkProgress(task, chunkIndex, downloaded, total) {
    if (!task.chunkProgress) {
      task.chunkProgress = {};
    }
    
    const prevDownloaded = task.chunkProgress[chunkIndex] || 0;
    task.chunkProgress[chunkIndex] = downloaded;
    
    // 计算总进度
    const totalChunkDownloaded = Object.values(task.chunkProgress).reduce((sum, val) => sum + val, 0);
    task.progress = (totalChunkDownloaded / task.size) * 100;
    
    this.updateTaskProgress(task, totalChunkDownloaded);
  }
  /**
   * 任务完成处理
   * @param {DownloadTask} task - 任务
   */  async onTaskCompleted(task) {
    logger.debug(`[AdvancedDownloadManager] Task completed: ${task.id} - ${path.basename(task.dest)}`);
    
    task.status = TaskStatus.COMPLETED;
    task.progress = 100;
    task.stopMonitoring(); // 停止监控
    
    // 确保任务从活跃列表中移除
    if (this.activeTasks.has(task.id)) {
      this.activeTasks.delete(task.id);
      logger.debug(`[AdvancedDownloadManager] Task ${task.id} removed from active tasks`);
    }
    
    // 添加到完成列表（使用 dest 作为键防重复）
    this.completedTasks.set(task.dest, task);
    this.stats.completedFiles++;
    
    logger.debug(`[AdvancedDownloadManager] Task ${task.id} moved to completed, stats: ${this.stats.completedFiles}/${this.stats.totalFiles}`);
    logger.debug(`[AdvancedDownloadManager] Current counts - Active: ${this.activeTasks.size}, Queued: ${this.taskQueue.length}, Completed: ${this.completedTasks.size}`);
    
    this.emit('taskCompleted', task);
    
    // 延迟处理队列，避免重复启动
    setTimeout(() => this.processQueue(), 50);
  }/**
   * 任务失败处理 - 优化版本
   * @param {DownloadTask} task - 任务
   * @param {Error} error - 错误信息
   */  async onTaskFailed(task, error) {
    logger.debug(`[AdvancedDownloadManager] Task failed: ${task.id} - ${path.basename(task.dest)}, Error: ${error.message}, Retry count: ${task.retryCount}`);
    
    // 立即清理任务监控
    task.stopMonitoring();
    task.error = error.message;
    task.retryCount++;
    
    // 确保任务从活跃任务中移除，释放线程槽位
    if (this.activeTasks.has(task.id)) {
      this.activeTasks.delete(task.id);
      logger.debug(`[AdvancedDownloadManager] Task ${task.id} removed from active tasks`);
    }
    
    logger.debug(`[AdvancedDownloadManager] Task ${task.id} retry count: ${task.retryCount}/${RETRY_ATTEMPTS}`);
    logger.debug(`[AdvancedDownloadManager] Current counts after failure - Active: ${this.activeTasks.size}, Queued: ${this.taskQueue.length}`);
    console.warn(`任务失败: ${task.dest}, 错误: ${error.message}, 重试次数: ${task.retryCount}`);
      if (task.retryCount < RETRY_ATTEMPTS) {
      // 重试 - 使用更短的延迟
      logger.debug(`[AdvancedDownloadManager] Scheduling retry for task ${task.id} in ${Math.min(RETRY_DELAY * task.retryCount, 5000)}ms`);
      task.status = TaskStatus.PENDING;
      setTimeout(() => {
        logger.debug(`[AdvancedDownloadManager] Retrying task ${task.id} (attempt ${task.retryCount + 1}/${RETRY_ATTEMPTS})`);
        this.taskQueue.unshift(task); // 重新加入队列头部
        this.processQueue(); // 立即处理队列
      }, Math.min(RETRY_DELAY * task.retryCount, 5000)); // 最大延迟5秒
    } else {
      // 彻底失败
      logger.debug(`[AdvancedDownloadManager] Task ${task.id} permanently failed after ${task.retryCount} attempts`);
      task.status = TaskStatus.FAILED;
      this.failedTasks.set(task.id, task);
      this.stats.failedFiles++;
      
      console.error(`任务彻底失败: ${task.dest}, 已重试 ${task.retryCount} 次`);
      this.emit('taskFailed', task, error);
    }
    
    // 立即处理队列，启动新任务
    setTimeout(() => this.processQueue(), 100);
  }

  /**
   * 暂停所有下载
   */
  pauseAll() {
    this.activeTasks.forEach(task => {
      task.status = TaskStatus.PAUSED;
    });
    this.emit('paused');
  }

  /**
   * 恢复所有下载
   */
  resumeAll() {
    this.activeTasks.forEach(task => {
      if (task.status === TaskStatus.PAUSED) {
        task.status = TaskStatus.DOWNLOADING;
      }
    });
    this.processQueue();
    this.emit('resumed');
  }

  /**
   * 获取下载统计
   * @returns {Object} - 统计信息
   */  /**
   * 计算总下载速度
   * @returns {number} - 总速度(bytes/s)
   */
  calculateTotalSpeed() {
    let totalSpeed = 0;
    let activeTaskCount = 0;
    
    this.activeTasks.forEach(task => {
      if (task.status === TaskStatus.DOWNLOADING && task.speed > 0) {
        totalSpeed += task.speed;
        activeTaskCount++;
      }
    });
    
    // 如果没有活跃任务有速度，尝试从带宽监控获取
    if (totalSpeed === 0 && this.bandwidthMonitor) {
      const bandwidthStats = this.getBandwidthStats();
      totalSpeed = bandwidthStats.currentSpeed || 0;
    }
    
    console.log('📊 calculateTotalSpeed调试:', {
      totalSpeed,
      activeTaskCount,
      totalActiveTasks: this.activeTasks.size
    });
    
    return totalSpeed;
  }
  /**
   * 获取活跃任务列表 - 只返回真正在下载的任务
   * @returns {Array} - 活跃任务数组
   */
  getActiveTasks() {
    return Array.from(this.activeTasks.values()).filter(task => 
      task.status === TaskStatus.DOWNLOADING
    );
  }

  /**
   * 获取所有任务列表（包括等待中的）
   * @returns {Array} - 所有活跃任务数组
   */
  getAllActiveTasks() {
    return Array.from(this.activeTasks.values());
  }

  /**
   * 获取队列中的任务
   * @returns {Array} - 队列任务数组
   */  getQueuedTasks() {
    return [...this.taskQueue];
  }  /**
   * 验证任务状态一致性
   */
  validateTaskState() {
    const activeCount = this.activeTasks.size;
    const queuedCount = this.taskQueue.length;
    const completedCount = this.completedTasks.size;
    const failedCount = this.failedTasks.size;
    
    logger.debug(`[AdvancedDownloadManager] Task state validation - Active: ${activeCount}, Queued: ${queuedCount}, Completed: ${completedCount}, Failed: ${failedCount}`);
    
    // 检查是否有重复的任务ID
    const activeIds = new Set(this.activeTasks.keys());
    const queuedIds = new Set(this.taskQueue.map(task => task.id));
    const completedIds = new Set(this.completedTasks.keys());
    const failedIds = new Set(this.failedTasks.keys());
    
    // 检查重复
    const allIds = [...activeIds, ...queuedIds, ...completedIds, ...failedIds];
    const uniqueIds = new Set(allIds);
    
    if (allIds.length !== uniqueIds.size) {
      logger.warn(`[AdvancedDownloadManager] Duplicate task IDs detected! Total: ${allIds.length}, Unique: ${uniqueIds.size}`);
    }
    
    return {
      activeCount,
      queuedCount,
      completedCount,
      failedCount,
      totalTasks: this.stats.totalFiles,
      hasDuplicates: allIds.length !== uniqueIds.size
    };
  }

  /**
   * 获取下载统计信息 - 完整版本
   * @returns {Object} - 统计信息
   */
  getStats() {
    // 实时计算状态，确保准确性
    const activeCount = this.activeTasks.size;
    const queuedCount = this.taskQueue.length;
    const completedCount = this.completedTasks.size;
    const failedCount = this.failedTasks.size;
    
    // 调试日志
    logger.debug(`[AdvancedDownloadManager] getStats() - Active: ${activeCount}, Queued: ${queuedCount}, Completed: ${completedCount}, Failed: ${failedCount}`);
    
    return {
      ...this.stats,
      activeFiles: activeCount,
      queuedFiles: queuedCount,
      completedFiles: completedCount,
      failedFiles: failedCount,
      speed: this.calculateTotalSpeed()
    };
  }
  /**
   * 自适应并发控制 - 48线程优化版本
   */
  adjustConcurrency() {
    if (!this.enableAdaptiveConcurrency) return;
    
    const now = Date.now();
    // 添加调整冷却时间，避免频繁调整
    if (now - this.lastAdjustmentTime < this.adjustmentCooldown) {
      return;
    }
    
    const currentSpeed = this.calculateTotalSpeed();
    this.speedHistory.push(currentSpeed);
    
    // 保持速度历史记录在合理范围内
    if (this.speedHistory.length > SPEED_HISTORY_SIZE) {
      this.speedHistory.shift();
    }
    
    // 更新带宽统计
    this.updateBandwidthStats(currentSpeed);
    
    // 需要至少3个数据点才能进行调整
    if (this.speedHistory.length < 3) return;
    
    const averageSpeed = this.speedHistory.reduce((sum, speed) => sum + speed, 0) / this.speedHistory.length;
    const recentSpeed = this.speedHistory.slice(-3).reduce((sum, speed) => sum + speed, 0) / 3;
    
    // 计算效率指标
    const theoreticalMaxSpeed = this.currentConcurrency * 2 * 1024 * 1024; // 假设每个连接2MB/s
    const efficiency = averageSpeed / theoreticalMaxSpeed;
    
    // 记录并发历史
    this.performanceStats.concurrencyHistory.push({
      time: now,
      concurrency: this.currentConcurrency,
      speed: currentSpeed,
      efficiency: efficiency
    });
    
    // 保持历史记录在合理范围内
    if (this.performanceStats.concurrencyHistory.length > 20) {
      this.performanceStats.concurrencyHistory.shift();
    }
    
    let shouldAdjust = false;
    let newConcurrency = this.currentConcurrency;
    let adjustmentReason = '';
    
    // 智能并发调整算法
    if (efficiency > 0.85 && recentSpeed > averageSpeed * 1.1 && this.currentConcurrency < this.maxConcurrentFiles) {
      // 效率高且速度在提升，积极增加并发
      const step = Math.min(CONCURRENCY_ADJUSTMENT_STEP * 2, this.maxConcurrentFiles - this.currentConcurrency);
      newConcurrency = Math.min(this.currentConcurrency + step, this.maxConcurrentFiles);
      adjustmentReason = `高效率增加并发 (效率: ${(efficiency * 100).toFixed(1)}%)`;
      shouldAdjust = true;
    } else if (efficiency > 0.7 && this.currentConcurrency < this.maxConcurrentFiles * 0.8) {
      // 中等效率，适度增加并发
      newConcurrency = Math.min(this.currentConcurrency + CONCURRENCY_ADJUSTMENT_STEP, this.maxConcurrentFiles);
      adjustmentReason = `中等效率增加并发 (效率: ${(efficiency * 100).toFixed(1)}%)`;
      shouldAdjust = true;
    } else if (efficiency < 0.5 && recentSpeed < averageSpeed * 0.8 && this.currentConcurrency > this.minConcurrency) {
      // 效率低且速度下降，减少并发
      const step = Math.max(CONCURRENCY_ADJUSTMENT_STEP, Math.floor(this.currentConcurrency * 0.2));
      newConcurrency = Math.max(this.currentConcurrency - step, this.minConcurrency);
      adjustmentReason = `低效率减少并发 (效率: ${(efficiency * 100).toFixed(1)}%)`;
      shouldAdjust = true;
    } else if (this.activeTasks.size === 0 && this.taskQueue.length > 0) {
      // 没有活跃任务但有等待任务，可能是并发数太保守
      newConcurrency = Math.min(this.currentConcurrency + CONCURRENCY_ADJUSTMENT_STEP, this.maxConcurrentFiles);
      adjustmentReason = '无活跃任务，增加并发';
      shouldAdjust = true;
    }
    
    if (shouldAdjust && newConcurrency !== this.currentConcurrency) {
      const oldConcurrency = this.currentConcurrency;
      this.currentConcurrency = newConcurrency;
      this.lastAdjustmentTime = now;
      
      // 记录调整历史
      this.performanceStats.adjustmentHistory.push({
        time: now,
        from: oldConcurrency,
        to: newConcurrency,
        reason: adjustmentReason,
        efficiency: efficiency,
        speed: currentSpeed
      });
      
      console.log(`🔧 并发调整: ${oldConcurrency} → ${newConcurrency} (${adjustmentReason})`);
      
      // 如果增加了并发数，立即尝试处理队列
      if (newConcurrency > oldConcurrency) {
        setTimeout(() => this.processQueue(), 100);
      }
    }
    
    this.lastSpeedCheck = now;
  }

  /**
   * 更新带宽统计信息
   */
  updateBandwidthStats(currentSpeed) {
    const now = Date.now();
    
    this.bandwidthStats.currentSpeed = currentSpeed;
    this.bandwidthStats.lastMeasurementTime = now;
    
    // 更新峰值速度
    if (currentSpeed > this.bandwidthStats.peakSpeed) {
      this.bandwidthStats.peakSpeed = currentSpeed;
    }
    
    // 计算平均速度（会话开始以来）
    const sessionTime = (now - this.bandwidthStats.sessionStartTime) / 1000;
    if (sessionTime > 0) {
      this.bandwidthStats.averageSpeed = this.bandwidthStats.totalTransferred / sessionTime;
    }
    
    // 计算效率（当前速度 vs 理论最大速度）
    const theoreticalMaxSpeed = this.currentConcurrency * 3 * 1024 * 1024; // 假设每连接3MB/s
    this.bandwidthStats.efficiency = theoreticalMaxSpeed > 0 ? currentSpeed / theoreticalMaxSpeed : 0;
  }
  /**
   * 获取增强的带宽监控信息
   */
  getBandwidthStats() {
    return {
      ...this.bandwidthStats,
      currentConcurrency: this.currentConcurrency,
      maxConcurrency: this.maxConcurrentFiles,
      minConcurrency: this.minConcurrency,
      activeThreads: this.activeTasks.size,
      queuedTasks: this.taskQueue.length,
      completedTasks: this.completedTasks.size,
      failedTasks: this.failedTasks.size,
      performanceStats: this.performanceStats,
      adaptiveEnabled: this.enableAdaptiveConcurrency,
      lastAdjustment: this.performanceStats.adjustmentHistory.slice(-1)[0] || null
    };
  }

  /**
   * 手动设置并发数（用于测试和前端控制）
   */
  setConcurrency(newConcurrency) {
    if (newConcurrency < this.minConcurrency || newConcurrency > this.maxConcurrentFiles) {
      throw new Error(`并发数必须在 ${this.minConcurrency} 到 ${this.maxConcurrentFiles} 之间`);
    }
    
    const oldConcurrency = this.currentConcurrency;
    this.currentConcurrency = newConcurrency;
    this.lastAdjustmentTime = Date.now();
    
    // 记录手动调整
    this.performanceStats.adjustmentHistory.push({
      time: Date.now(),
      from: oldConcurrency,
      to: newConcurrency,
      reason: '手动调整',
      manual: true
    });
    
    console.log(`🎛️ 手动设置并发数: ${oldConcurrency} → ${newConcurrency}`);
    
    // 立即处理队列
    this.processQueue();
    
    return { success: true, oldConcurrency, newConcurrency };
  }
  /**
   * 启动停滞任务检测器
   */
  startStalledTaskDetector() {
    this.stalledTaskTimer = setInterval(() => {
      this.checkStalledTasks();
    }, SPEED_CHECK_INTERVAL);
  }

  /**
   * 检测并清理停滞任务
   */
  checkStalledTasks() {
    const now = Date.now();
    const stalledTasks = [];
    
    for (const [taskId, task] of this.activeTasks) {
      if (task.status === TaskStatus.DOWNLOADING) {
        // 检查任务是否已经运行太长时间
        const taskRunTime = now - (task.startTime || now);
        const maxRunTime = task.size > LARGE_FILE_THRESHOLD ? LARGE_FILE_TIMEOUT : SMALL_FILE_TIMEOUT;
        
        // 检查是否超时或停滞
        if (taskRunTime > maxRunTime || task.isStalled) {
          console.warn(`检测到停滞任务: ${task.dest}, 运行时间: ${taskRunTime}ms, 速度: ${task.speed}B/s`);
          stalledTasks.push(task);
        }
        
        // 检查是否长时间无进度更新
        if (task.lastProgressTime && (now - task.lastProgressTime) > STALLED_TIMEOUT) {
          console.warn(`检测到无进度任务: ${task.dest}, 无进度时间: ${now - task.lastProgressTime}ms`);
          stalledTasks.push(task);
        }
      }
    }
    
    // 清理停滞任务
    for (const task of stalledTasks) {
      console.log(`清理停滞任务: ${task.dest}`);
      this.onTaskFailed(task, new Error('任务停滞超时'));
    }
    
    // 如果清理了任务，立即处理队列
    if (stalledTasks.length > 0) {
      setTimeout(() => this.processQueue(), 100);
    }
  }

  /**
   * 清理资源
   */
  async cleanup() {
    // 清理定时器
    if (this.stalledTaskTimer) {
      clearInterval(this.stalledTaskTimer);
      this.stalledTaskTimer = null;
    }
    
    // 停止所有任务监控
    for (const [taskId, task] of this.activeTasks) {
      task.stopMonitoring();
    }
    
    // 清理临时目录
    try {
      await fse.remove(this.tempDir);
    } catch (error) {
      // 忽略清理错误
    }
  }

  /**
   * 重置所有状态和计数器
   */
  resetStats() {
    logger.debug(`[AdvancedDownloadManager] Resetting all stats and counters`);
    
    this.stats = {
      totalFiles: 0,
      completedFiles: 0,
      failedFiles: 0,
      totalSize: 0,
      downloadedSize: 0,
      startTime: null,
      endTime: null
    };
    
    this.taskQueue = [];
    this.activeTasks.clear();
    this.completedTasks.clear();
    this.failedTasks.clear();
    
    this.speedHistory = [];
    this.lastSpeedCheck = Date.now();
    this.currentConcurrency = Math.min(12, this.maxConcurrentFiles);
    
    logger.debug(`[AdvancedDownloadManager] Stats reset completed`);
  }

  /**
   * 检查并清理重复任务
   */
  cleanupDuplicateTasks() {
    const seenDests = new Set();
    const duplicateTasks = [];
    
    // 检查活跃任务中的重复
    for (const [taskId, task] of this.activeTasks) {
      if (seenDests.has(task.dest)) {
        duplicateTasks.push(taskId);
        logger.debug(`[AdvancedDownloadManager] Found duplicate active task: ${taskId} for ${task.dest}`);
      } else {
        seenDests.add(task.dest);
      }
    }
    
    // 移除重复的活跃任务
    duplicateTasks.forEach(taskId => {
      const task = this.activeTasks.get(taskId);
      if (task) {
        task.stopMonitoring();
        this.activeTasks.delete(taskId);
        logger.debug(`[AdvancedDownloadManager] Removed duplicate active task: ${taskId}`);
      }
    });
    
    // 检查队列中的重复
    const originalQueueLength = this.taskQueue.length;
    const destSet = new Set();
    this.taskQueue = this.taskQueue.filter(task => {
      if (destSet.has(task.dest) || seenDests.has(task.dest)) {
        logger.debug(`[AdvancedDownloadManager] Removed duplicate queued task: ${task.id} for ${task.dest}`);
        return false;
      }
      destSet.add(task.dest);
      return true;
    });
    
    const removedCount = originalQueueLength - this.taskQueue.length + duplicateTasks.length;
    if (removedCount > 0) {
      logger.debug(`[AdvancedDownloadManager] Cleaned up ${removedCount} duplicate tasks`);
    }
  }
}

module.exports = AdvancedDownloadManager;