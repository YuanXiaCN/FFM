// main-download-service.cjs
// 主进程下载服务，负责实际文件下载、断点续传、哈希校验、进度推送
const { ipcMain } = require('electron')
const fs = require('fs')
const path = require('path')
const axios = require('axios')
const crypto = require('crypto')
const { logger } = require('./utils.cjs')
const fsPromises = fs.promises
const os = require('os')
const configService = require('./main-config-service.cjs')
const { downloadChunk } = require('./download-worker.cjs')
const fse = require('fs-extra')

// 全局常量
const CHUNK_SIZE = 1024 * 1024 * 5; // 5MB每块
const MAX_CONCURRENT_DOWNLOADS = 3; // 最大并发数

// 简单的并发控制实现
class ConcurrencyLimit {
  constructor(limit) {
    this.limit = limit;
    this.current = 0;
    this.queue = [];
  }

  async run(fn) {
    while (this.current >= this.limit) {
      await new Promise(resolve => this.queue.push(resolve));
    }
    this.current++;
    try {
      return await fn();
    } finally {
      this.current--;
      if (this.queue.length > 0) {
        this.queue.shift()();
      }
    }
  }
}
const TEMP_DIR = path.join(os.tmpdir(), 'mc-launcher-downloads');

// 全局变量
let currentDownload = null;

// 确保临时目录存在
fse.ensureDirSync(TEMP_DIR);

// 获取代理设置
function getAgent(disableSSLVerify) {
  if (!disableSSLVerify) return undefined;
  const https = require('https');
  return new https.Agent({ rejectUnauthorized: false });
}

/**
 * 分块下载文件
 * @param {string} url - 下载地址
 * @param {string} dest - 目标文件路径
 * @param {string} expectedSha1 - 预期的SHA1值
 * @param {boolean} disableSSLVerify - 是否禁用SSL验证
 * @param {Function} onProgress - 进度回调
 */
async function downloadFileMultiThread(url, dest, expectedSha1, disableSSLVerify, onProgress) {
  const startTime = Date.now();
  let totalDownloaded = 0;
  
  try {
    // 获取文件大小
    const response = await axios.head(url);
    const fileSize = parseInt(response.headers['content-length'], 10);
    
    if (!fileSize) {
      throw new Error('无法获取文件大小');
    }
    
    // 计算分块
    const chunks = [];
    for (let start = 0; start < fileSize; start += CHUNK_SIZE) {
      const end = Math.min(start + CHUNK_SIZE - 1, fileSize - 1);
      chunks.push({ start, end });
    }
    
    // 创建临时目录
    const downloadId = Date.now().toString();
    const tempDir = path.join(TEMP_DIR, downloadId);
    await fse.ensureDir(tempDir);
      // 限制并发数
    const limiter = new ConcurrencyLimit(MAX_CONCURRENT_DOWNLOADS);
    
    // 并发下载所有块
    const chunkPromises = chunks.map((chunk, index) => {
      const chunkPath = path.join(tempDir, `chunk-${index}`);
      
      return limiter.run(async () => {
        const chunkSha1 = await downloadChunk(
          url,
          chunkPath,
          chunk.start,
          chunk.end,
          (downloaded) => {
            totalDownloaded += downloaded;
            const progress = totalDownloaded / fileSize;
            const speed = totalDownloaded / ((Date.now() - startTime) / 1000);
            onProgress?.(totalDownloaded, fileSize, speed);
          }
        );
        
        return {
          index,
          path: chunkPath,
          sha1: chunkSha1
        };
      });
    });
    
    // 等待所有块下载完成
    const results = await Promise.all(chunkPromises);
    
    // 按顺序合并文件
    const writeStream = fs.createWriteStream(dest);
    const finalHash = crypto.createHash('sha1');
    
    for (let i = 0; i < results.length; i++) {
      const chunk = results.find(r => r.index === i);
      if (!chunk) {
        throw new Error(`缺少块 ${i}`);
      }
      
      const chunkData = await fsPromises.readFile(chunk.path);
      finalHash.update(chunkData);
      writeStream.write(chunkData);
    }
    
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
      writeStream.end();
    });
    
    // 验证SHA1
    const sha1 = finalHash.digest('hex');
    if (expectedSha1 && sha1 !== expectedSha1) {
      throw new Error(`文件校验失败：期望 ${expectedSha1}，实际 ${sha1}`);
    }
    
    // 清理临时文件
    await fse.remove(tempDir);
    
  } catch (error) {
    logger.error(`多线程下载失败: ${error.message}`);
    throw error;
  }
}

// 下载文件
async function downloadFile(url, dest, expectedSha1, disableSSLVerify, onProgress) {
  let startTime = Date.now()
  let downloadedSize = 0
  
  logger.info(`开始下载文件: ${url} 到 ${dest}`)
  
  try {
    // 确保目标目录存在
    await ensureDir(path.dirname(dest))
    
    // 支持断点续传
    let received = 0
    let total = 0
    let headers = {}
    if (fs.existsSync(dest)) {
      received = fs.statSync(dest).size
      headers.Range = `bytes=${received}-`
      logger.info(`文件已存在，从 ${received} 字节处继续下载`)
    }
    
    const agent = getAgent(disableSSLVerify)
    
    logger.info(`发起下载请求: ${url}`)
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'stream',
      headers,
      httpsAgent: agent,
      timeout: 30000 // 30秒超时
    })
    
    total = parseInt(response.headers['content-length'] || 0) + received
    logger.info(`文件总大小: ${total} 字节`)
    
    const fileStream = fs.createWriteStream(dest, { flags: received ? 'a' : 'w' })
    let hash = crypto.createHash('sha1')
    
    if (received) {
      // 断点续传时先校验已下载部分
      logger.info('校验已下载部分...')
      const existStream = fs.createReadStream(dest, { start: 0, end: received - 1 })
      for await (const chunk of existStream) {
        hash.update(chunk)
      }
    }
    
    return new Promise((resolve, reject) => {
      let downloaded = received
      let lastProgressUpdate = 0
      
      response.data.on('data', chunk => {
        hash.update(chunk)
        downloaded += chunk.length
        downloadedSize = downloaded
        
        // 限制进度更新频率
        const now = Date.now()
        if (now - lastProgressUpdate >= 1000 && onProgress) {
          const elapsedTime = now - startTime
          const speed = downloadedSize / (elapsedTime / 1000) // bytes per second
          onProgress(downloaded, total, speed)
          lastProgressUpdate = now
        }
      })
      
      fileStream.on('finish', () => {
        const sha1 = hash.digest('hex')
        logger.info(`下载完成，SHA1: ${sha1}`)
        if (expectedSha1 && sha1 !== expectedSha1) {
          logger.error(`文件校验失败，期望: ${expectedSha1}，实际: ${sha1}`)
          reject(new Error(`文件校验失败，期望: ${expectedSha1}，实际: ${sha1}`))
        } else {
          resolve()
        }
      })
      
      fileStream.on('error', error => {
        logger.error(`文件写入错误: ${error.message}`)
        reject(error)
      })
      
      response.data.on('error', error => {
        logger.error(`下载流错误: ${error.message}`)
        reject(error)
      })
      
      response.data.pipe(fileStream)
    })
  } catch (error) {
    logger.error(`下载失败: ${error.message}`)
    throw new Error(`下载失败: ${error.message}`)
  }
}

// 确保目录存在
async function ensureDir(dir) {
  try {
    await fsPromises.mkdir(dir, { recursive: true })
  } catch (err) {
    if (err.code !== 'EEXIST') throw err
  }
}

// 根据Minecraft Wiki教程实现的下载函数
async function downloadMinecraft(options, sender) {
  try {
    const { version, loader, shader, downloadSource } = options
    // 从配置获取Minecraft目录
    const mcDirectory = configService.getConfig('mcDirectory') || path.join(os.homedir(), '.minecraft')
    
    // 确保主目录存在
    await ensureDir(mcDirectory)
    
    // 获取版本信息JSON
    let versionJson
    try {
      sender.send('download:progress', {
        percent: 0,
        status: '正在获取版本信息...',
        file: `${version}.json`
      })
      
      // 使用选定的下载源获取版本manifest
      const manifestUrl = downloadSource?.meta?.versionManifest || 
                       'https://launchermeta.mojang.com/mc/game/version_manifest.json'
      
      const manifestResponse = await axios.get(manifestUrl)
      const versionInfo = manifestResponse.data.versions.find(v => v.id === version)
      
      if (!versionInfo) {
        throw new Error(`未找到版本 ${version} 的信息`)
      }
      
      // 获取具体版本信息
      const versionJsonResponse = await axios.get(versionInfo.url)
      versionJson = versionJsonResponse.data
      
      // 保存版本json
      const versionDir = path.join(mcDirectory, 'versions', version)
      await ensureDir(versionDir)
      await fsPromises.writeFile(
        path.join(versionDir, `${version}.json`),
        JSON.stringify(versionJson, null, 2)
      )
        // 下载客户端jar
      const clientUrl = versionJson.downloads.client.url
      const clientSha1 = versionJson.downloads.client.sha1
      const clientSize = versionJson.downloads.client.size
      const clientJarPath = path.join(versionDir, `${version}.jar`)
      
      sender.send('download:progress', {
        percent: 5,
        status: '正在下载客户端...',
        file: `${version}.jar`
      })
      
      await downloadFileMultiThread(
        clientUrl,
        clientJarPath,
        clientSha1,
        false,
        (downloaded, total, speed) => {
          const percent = 5 + (downloaded / total) * 20
          sender.send('download:progress', {
            percent,
            status: '正在下载客户端...',
            file: `${version}.jar`,
            speed,
            downloaded,
            total: clientSize,
            threads: MAX_CONCURRENT_DOWNLOADS
          })
        }
      )
      
    } catch (error) {
      throw new Error(`下载客户端失败: ${error.message}`)
    }
    
    // 全部完成
    sender.send('download:progress', {
      percent: 100,
      status: '下载完成！',
      complete: true
    })
    
    return { ok: true }
    
  } catch (error) {
    if (error.message === '下载已取消') {
      return { ok: false, error: '用户取消了下载' }
    }
    throw error
  }
}

// 开始下载处理
ipcMain.handle('download:start', async (event, options) => {
  try {
    const sender = event.sender
    
    // 取消之前的下载任务
    if (currentDownload) {
      currentDownload.isCancelled = true
    }
    
    // 创建新下载任务
    currentDownload = {
      isCancelled: false,
      status: 'initializing'
    }
    
    // 发送下载开始通知
    sender.send('download:progress', { 
      percent: 0,
      status: '正在准备下载...',
      file: '获取版本信息'
    })
    
    // 实际执行下载流程
    return await downloadMinecraft(options, sender)
    
  } catch (error) {
    logger.error('下载失败:', error)
    event.sender.send('download:progress', { 
      status: '下载失败',
      error: error.message
    })
    return { ok: false, error: error.message }
  }
})

// 取消下载
ipcMain.handle('download:cancel', (event) => {
  if (currentDownload) {
    currentDownload.isCancelled = true
    event.sender.send('download:progress', { 
      status: '下载已取消',
      error: '用户取消了下载'
    })
  }
  return { ok: true }
})

module.exports = {
  downloadFile,
  downloadMinecraft
}
