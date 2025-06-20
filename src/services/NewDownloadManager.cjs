// src/services/NewDownloadManager.cjs
// 全新的下载管理器 - 基于BMCLAPI，支持智能多线程和自适应并发
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const fse = require('fs-extra');

/**
 * 下载任务类
 */
class DownloadTask {
  constructor(options) {
    this.id = options.id || Date.now().toString();
    this.url = options.url;
    this.dest = options.dest;
    this.size = options.size || 0;
    this.sha1 = options.sha1;
    this.priority = options.priority || 0;
    this.retryCount = 0;
    this.maxRetries = 3;
    this.progress = 0;
    this.speed = 0;
    this.status = 'pending';
    this.startTime = null;
    this.endTime = null;
    this.error = null;
  }

  isLargeFile() {
    return this.size > 10 * 1024 * 1024; // 10MB阈值
  }
}

/**
 * 多线程下载器
 */
class MultiThreadDownloader {
  constructor(task, threads = 4) {
    this.task = task;
    this.threads = threads;
    this.chunks = [];
    this.completed = 0;
    this.speeds = new Array(threads).fill(0);
  }

  async download() {
    const chunkSize = Math.ceil(this.task.size / this.threads);
    const promises = [];

    for (let i = 0; i < this.threads; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize - 1, this.task.size - 1);
      
      promises.push(this.downloadChunk(i, start, end));
    }

    await Promise.all(promises);
    await this.mergeChunks();
  }

  async downloadChunk(index, start, end) {
    const tempFile = `${this.task.dest}.part${index}`;
    const startTime = Date.now();

    try {
      const response = await axios({
        method: 'GET',
        url: this.task.url,
        headers: {
          'Range': `bytes=${start}-${end}`
        },
        responseType: 'stream',
        timeout: 60000
      });

      const writer = fs.createWriteStream(tempFile);
      let downloaded = 0;

      response.data.on('data', (chunk) => {
        downloaded += chunk.length;
        this.completed += chunk.length;
        
        // 计算速度
        const elapsed = (Date.now() - startTime) / 1000;
        this.speeds[index] = downloaded / elapsed;
        
        // 更新总进度
        this.task.progress = (this.completed / this.task.size) * 100;
        this.task.speed = this.speeds.reduce((sum, speed) => sum + speed, 0);
      });

      return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
        response.data.pipe(writer);
      });
    } catch (error) {
      throw new Error(`Chunk ${index} download failed: ${error.message}`);
    }
  }

  async mergeChunks() {
    const writer = fs.createWriteStream(this.task.dest);
    
    for (let i = 0; i < this.threads; i++) {
      const chunkFile = `${this.task.dest}.part${i}`;
      const reader = fs.createReadStream(chunkFile);
      
      await new Promise((resolve, reject) => {
        reader.on('end', resolve);
        reader.on('error', reject);
        reader.pipe(writer, { end: false });
      });
      
      // 删除临时文件
      fs.unlinkSync(chunkFile);
    }
    
    writer.end();
  }
}

/**
 * 新的下载管理器
 */
class NewDownloadManager extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.maxConcurrency = options.maxConcurrency || 32;
    this.minConcurrency = 4;
    this.currentConcurrency = Math.min(16, this.maxConcurrency); // 初始并发数
    
    this.downloadQueue = [];
    this.activeTasks = new Map();
    this.completedTasks = [];
    this.failedTasks = [];
    
    this.totalFiles = 0;
    this.totalSize = 0;
    this.downloadedSize = 0;
    this.downloadedFiles = 0;
    
    this.speedHistory = [];
    this.bandwidthMonitor = null;
    this.adaptiveTimer = null;
    
    this.isPaused = false;
    this.isStopped = false;
    
    this.startBandwidthMonitor();
    this.startAdaptiveConcurrency();
  }

  /**
   * 添加下载任务
   */
  addTask(options) {
    const task = new DownloadTask(options);
    this.downloadQueue.push(task);
    this.totalFiles++;
    this.totalSize += task.size;
    
    this.emit('taskAdded', task);
    this.processQueue();
    
    return task.id;
  }

  /**
   * 添加多个任务
   */
  addTasks(taskList) {
    const taskIds = [];
    for (const taskOptions of taskList) {
      taskIds.push(this.addTask(taskOptions));
    }
    return taskIds;
  }

  /**
   * 处理下载队列
   */
  async processQueue() {
    if (this.isPaused || this.isStopped) return;
    
    while (this.downloadQueue.length > 0 && 
           this.activeTasks.size < this.currentConcurrency) {
      
      const task = this.downloadQueue.shift();
      this.activeTasks.set(task.id, task);
      
      this.downloadTask(task).catch(error => {
        console.error(`Task ${task.id} failed:`, error);
      });
    }
  }

  /**
   * 下载单个任务
   */
  async downloadTask(task) {
    task.status = 'downloading';
    task.startTime = Date.now();
    
    this.emit('taskStarted', task);
    
    try {
      // 确保目录存在
      await fse.ensureDir(path.dirname(task.dest));
      
      if (task.isLargeFile()) {
        // 大文件使用多线程下载
        const downloader = new MultiThreadDownloader(task, 4);
        await downloader.download();
      } else {
        // 小文件单线程下载
        await this.downloadSingleThread(task);
      }
      
      // 验证文件完整性
      if (task.sha1) {
        const isValid = await this.verifyFile(task.dest, task.sha1);
        if (!isValid) {
          throw new Error('File integrity check failed');
        }
      }
      
      task.status = 'completed';
      task.endTime = Date.now();
      task.progress = 100;
      
      this.downloadedFiles++;
      this.downloadedSize += task.size;
      
      this.completedTasks.push(task);
      this.activeTasks.delete(task.id);
      
      this.emit('taskCompleted', task);
      this.emit('progress', this.getProgress());
      
      // 继续处理队列
      this.processQueue();
      
      // 检查是否全部完成
      if (this.isAllCompleted()) {
        this.emit('allCompleted', this.getStats());
      }
      
    } catch (error) {
      await this.handleTaskError(task, error);
    }
  }

  /**
   * 单线程下载
   */
  async downloadSingleThread(task) {
    const startTime = Date.now();
    
    const response = await axios({
      method: 'GET',
      url: task.url,
      responseType: 'stream',
      timeout: 30000
    });
    
    const writer = fs.createWriteStream(task.dest);
    let downloaded = 0;
    
    response.data.on('data', (chunk) => {
      downloaded += chunk.length;
      const elapsed = (Date.now() - startTime) / 1000;
      
      task.progress = (downloaded / task.size) * 100;
      task.speed = downloaded / elapsed;
      
      this.emit('progress', this.getProgress());
    });
    
    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
      response.data.pipe(writer);
    });
  }

  /**
   * 处理任务错误
   */
  async handleTaskError(task, error) {
    task.retryCount++;
    task.error = error.message;
    
    if (task.retryCount <= task.maxRetries) {
      // 重试
      console.log(`Retrying task ${task.id}, attempt ${task.retryCount}`);
      await new Promise(resolve => setTimeout(resolve, 1000 * task.retryCount));
      
      return this.downloadTask(task);
    } else {
      // 失败
      task.status = 'failed';
      task.endTime = Date.now();
      
      this.failedTasks.push(task);
      this.activeTasks.delete(task.id);
      
      this.emit('taskFailed', task);
      
      // 继续处理其他任务
      this.processQueue();
    }
  }

  /**
   * 验证文件SHA1
   */
  async verifyFile(filePath, expectedSha1) {
    return new Promise((resolve) => {
      const hash = crypto.createHash('sha1');
      const stream = fs.createReadStream(filePath);
      
      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => {
        const actualSha1 = hash.digest('hex');
        resolve(actualSha1.toLowerCase() === expectedSha1.toLowerCase());
      });
      stream.on('error', () => resolve(false));
    });
  }

  /**
   * 获取下载进度
   */
  getProgress() {
    const totalProgress = this.totalSize > 0 ? 
      (this.downloadedSize / this.totalSize) * 100 : 0;
    
    const currentSpeed = Array.from(this.activeTasks.values())
      .reduce((sum, task) => sum + (task.speed || 0), 0);
    
    return {
      totalProgress: Math.round(totalProgress),
      currentSpeed,
      downloadedFiles: this.downloadedFiles,
      totalFiles: this.totalFiles,
      downloadedSize: this.downloadedSize,
      totalSize: this.totalSize,
      activeTasks: this.activeTasks.size,
      queuedTasks: this.downloadQueue.length,
      failedTasks: this.failedTasks.length
    };
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      completed: this.completedTasks.length,
      failed: this.failedTasks.length,
      total: this.totalFiles,
      totalSize: this.totalSize,
      downloadedSize: this.downloadedSize,
      averageSpeed: this.calculateAverageSpeed(),
      concurrency: this.currentConcurrency
    };
  }

  /**
   * 计算平均速度
   */
  calculateAverageSpeed() {
    if (this.speedHistory.length === 0) return 0;
    
    const sum = this.speedHistory.reduce((a, b) => a + b, 0);
    return sum / this.speedHistory.length;
  }

  /**
   * 带宽监控
   */
  startBandwidthMonitor() {
    this.bandwidthMonitor = setInterval(() => {
      const currentSpeed = Array.from(this.activeTasks.values())
        .reduce((sum, task) => sum + (task.speed || 0), 0);
      
      this.speedHistory.push(currentSpeed);
      if (this.speedHistory.length > 10) {
        this.speedHistory.shift();
      }
    }, 2000);
  }

  /**
   * 自适应并发控制
   */
  startAdaptiveConcurrency() {
    this.adaptiveTimer = setInterval(() => {
      if (this.activeTasks.size === 0) return;
      
      const avgSpeed = this.calculateAverageSpeed();
      const efficiency = this.calculateEfficiency();
      
      if (efficiency < 0.8 && this.currentConcurrency > this.minConcurrency) {
        // 降低并发
        this.currentConcurrency = Math.max(
          this.minConcurrency, 
          this.currentConcurrency - 2
        );
        console.log(`Reducing concurrency to ${this.currentConcurrency}`);
      } else if (efficiency > 0.9 && this.currentConcurrency < this.maxConcurrency) {
        // 增加并发
        this.currentConcurrency = Math.min(
          this.maxConcurrency, 
          this.currentConcurrency + 2
        );
        console.log(`Increasing concurrency to ${this.currentConcurrency}`);
      }
    }, 5000);
  }

  /**
   * 计算下载效率
   */
  calculateEfficiency() {
    if (this.speedHistory.length < 3) return 1;
    
    const recent = this.speedHistory.slice(-3);
    const older = this.speedHistory.slice(-6, -3);
    
    if (older.length === 0) return 1;
    
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
    
    return olderAvg > 0 ? recentAvg / olderAvg : 1;
  }

  /**
   * 检查是否全部完成
   */
  isAllCompleted() {
    return this.downloadQueue.length === 0 && 
           this.activeTasks.size === 0 && 
           this.totalFiles > 0;
  }

  /**
   * 暂停下载
   */
  pause() {
    this.isPaused = true;
    this.emit('paused');
  }

  /**
   * 恢复下载
   */
  resume() {
    this.isPaused = false;
    this.emit('resumed');
    this.processQueue();
  }

  /**
   * 停止下载
   */
  stop() {
    this.isStopped = true;
    this.activeTasks.clear();
    this.downloadQueue.length = 0;
    
    if (this.bandwidthMonitor) {
      clearInterval(this.bandwidthMonitor);
    }
    if (this.adaptiveTimer) {
      clearInterval(this.adaptiveTimer);
    }
    
    this.emit('stopped');
  }

  /**
   * 重置管理器
   */
  reset() {
    this.stop();
    
    this.downloadQueue = [];
    this.activeTasks.clear();
    this.completedTasks = [];
    this.failedTasks = [];
    
    this.totalFiles = 0;
    this.totalSize = 0;
    this.downloadedSize = 0;
    this.downloadedFiles = 0;
    
    this.speedHistory = [];
    this.currentConcurrency = Math.min(16, this.maxConcurrency);
    
    this.isPaused = false;
    this.isStopped = false;
    
    this.startBandwidthMonitor();
    this.startAdaptiveConcurrency();
    
    this.emit('reset');
  }
}

module.exports = NewDownloadManager;
