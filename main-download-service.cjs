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
const TEMP_DIR = path.join(process.cwd(), 'temp'); // 下载目录：./temp/
const MINECRAFT_DIR = path.join(process.cwd(), '.minecraft'); // 安装目录：./.minecraft/

// 全局变量
let currentDownload = null;

// 确保临时目录和安装目录存在
fse.ensureDirSync(TEMP_DIR);
fse.ensureDirSync(MINECRAFT_DIR);

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

// 获取带镜像支持的下载URL
function getMirroredUrl(originalUrl, downloadSource) {
  if (!downloadSource || downloadSource.name === '官方源') {
    return originalUrl
  }
  
  // 替换不同类型的URL
  if (originalUrl.includes('launchermeta.mojang.com') || originalUrl.includes('piston-meta.mojang.com')) {
    return originalUrl.replace(/https:\/\/(launchermeta|piston-meta)\.mojang\.com/, downloadSource.baseUrl)
  }
  
  if (originalUrl.includes('resources.download.minecraft.net')) {
    return originalUrl.replace('https://resources.download.minecraft.net', downloadSource.meta.assets)
  }
  
  if (originalUrl.includes('libraries.minecraft.net')) {
    return originalUrl.replace('https://libraries.minecraft.net', downloadSource.meta.libraries)
  }
  
  return originalUrl
}

// 根据Minecraft Wiki教程实现的下载函数
async function downloadMinecraft(options, sender) {
  try {
    const { version, loader, shader, downloadSource } = options
    // 使用统一的安装目录
    const mcDirectory = MINECRAFT_DIR
    
    // 确保主目录存在
    await ensureDir(mcDirectory)
    
    let versionJson
    let totalFiles = 0
    let downloadedFiles = 0
    let totalSize = 0
    let downloadedSize = 0
    
    // 下载步骤定义
    const downloadSteps = [
      '获取版本信息',
      '下载客户端文件', 
      '下载依赖库',
      '下载资源文件',
      '下载配置文件',
      '创建启动器配置',
      '完成安装'
    ]
    let currentStepIndex = 0
    
    function updateStep(stepName, stepIndex = null) {
      if (stepIndex !== null) {
        currentStepIndex = stepIndex
      }
      sender.send('download:progress', {
        step: stepName,
        stepIndex: currentStepIndex + 1,
        totalSteps: downloadSteps.length,
        currentFile: stepName
      })
    }
    
    try {
      // 步骤1: 获取版本清单和版本JSON
      updateStep('获取版本信息', 0)
      sender.send('download:progress', {
        percent: 0,
        status: '正在获取版本信息...',
        file: `${version}.json`,
        step: '获取版本信息',
        stepIndex: 1,
        totalSteps: downloadSteps.length
      })
      
      const manifestUrl = downloadSource?.meta?.versionManifest || 
                       'https://piston-meta.mojang.com/mc/game/version_manifest.json'
      
      const manifestResponse = await axios.get(manifestUrl)
      const versionInfo = manifestResponse.data.versions.find(v => v.id === version)
      
      if (!versionInfo) {
        throw new Error(`未找到版本 ${version} 的信息`)
      }
      
      const versionJsonResponse = await axios.get(versionInfo.url)
      versionJson = versionJsonResponse.data
      
      // 保存版本json
      const versionDir = path.join(mcDirectory, 'versions', version)
      await ensureDir(versionDir)
      await fsPromises.writeFile(
        path.join(versionDir, `${version}.json`),
        JSON.stringify(versionJson, null, 2)
      )
      
      // 计算总文件数和大小
      totalFiles = 1 + // 客户端jar
                  (versionJson.libraries?.length || 0) + // 依赖库
                  1 + // 资源索引
                  1 // log4j配置
      
      // 计算总下载大小
      totalSize = versionJson.downloads?.client?.size || 0
      if (versionJson.libraries) {
        for (const lib of versionJson.libraries) {
          if (lib.downloads?.artifact?.size) {
            totalSize += lib.downloads.artifact.size
          }
        }
      }
      
      sender.send('download:progress', {
        percent: 5,
        status: `准备下载 ${totalFiles} 个文件...`,
        file: `${version}.json`,
        step: '获取版本信息',
        stepIndex: 1,
        totalSteps: downloadSteps.length,
        fileStats: {
          downloaded: 1,
          remaining: totalFiles - 1,
          total: totalFiles
        },
        sizeInfo: {
          downloaded: 0,
          total: totalSize
        }
      })
      
      // 步骤2: 下载客户端JAR
      updateStep('下载客户端文件', 1)
      await downloadClientJar(versionJson, version, versionDir, sender, downloadedFiles++, totalFiles, downloadSource, (size) => {
        downloadedSize += size
      })
      
      // 步骤3: 下载依赖库文件
      updateStep('下载依赖库', 2)
      await downloadLibraries(versionJson, mcDirectory, sender, downloadedFiles, totalFiles, downloadSource, (size) => {
        downloadedSize += size
      })
      downloadedFiles += versionJson.libraries?.length || 0
      
      // 步骤4: 下载资源文件
      updateStep('下载资源文件', 3)
      await downloadAssets(versionJson, mcDirectory, sender, downloadedFiles++, totalFiles, downloadSource, (size) => {
        downloadedSize += size
      })
      
      // 步骤5: 下载log4j配置（如果存在）
      if (versionJson.logging?.client?.file) {
        updateStep('下载配置文件', 4)
        await downloadLogging(versionJson, mcDirectory, sender, downloadedFiles++, totalFiles, downloadSource, (size) => {
          downloadedSize += size
        })
      } else {
        currentStepIndex = 4 // 跳过配置文件步骤
      }
      
      // 步骤6: 创建启动器配置文件
      updateStep('创建启动器配置', 5)
      try {
        const LauncherProfileManager = require('./src/services/LauncherProfileManager.cjs')
        const profileManager = new LauncherProfileManager(mcDirectory)
        await profileManager.addProfile(version, `Minecraft ${version}`, {
          javaArgs: "-Xmx2G -XX:+UnlockExperimentalVMOptions -XX:+UseG1GC -XX:G1NewSizePercent=20 -XX:G1ReservePercent=20 -XX:MaxGCPauseMillis=50 -XX:G1HeapRegionSize=32M"
        })
        
        sender.send('download:progress', {
          percent: 95,
          status: '正在创建启动器配置...',
          file: 'launcher_profiles.json',
          step: '创建启动器配置',
          stepIndex: 6,
          totalSteps: downloadSteps.length,
          fileStats: {
            downloaded: totalFiles,
            remaining: 0,
            total: totalFiles
          },
          sizeInfo: {
            downloaded: downloadedSize,
            total: totalSize
          }
        })
      } catch (error) {
        logger.error('创建启动器配置失败:', error.message)
        // 配置创建失败不应该中断下载流程
      }
      
    } catch (error) {
      throw new Error(`下载失败: ${error.message}`)
    }
    
    // 全部完成
    updateStep('完成安装', 6)
    sender.send('download:progress', {
      percent: 100,
      status: '下载完成！',
      complete: true,
      step: '完成安装',
      stepIndex: 7,
      totalSteps: downloadSteps.length,
      fileStats: {
        downloaded: totalFiles,
        remaining: 0,
        total: totalFiles
      },
      sizeInfo: {
        downloaded: downloadedSize,
        total: totalSize
      }
    })
      return { ok: true }
    
  } catch (error) {
    if (error.message === '下载已取消') {
      return { ok: false, error: '用户取消了下载' }
    }
    throw error
  }
}

// 下载客户端JAR文件
async function downloadClientJar(versionJson, version, versionDir, sender, currentFile, totalFiles, downloadSource, onSizeUpdate) {
  const clientInfo = versionJson.downloads.client
  const clientJarPath = path.join(versionDir, `${version}.jar`)
  
  const basePercent = (currentFile / totalFiles) * 80
  const filePercent = (1 / totalFiles) * 80
  
  sender.send('download:progress', {
    percent: basePercent,
    status: '正在下载客户端...',
    file: `${version}.jar`
  })
    await downloadFileMultiThread(
    getMirroredUrl(clientInfo.url, downloadSource),
    clientJarPath,
    clientInfo.sha1,
    false,
    (downloaded, total, speed) => {
      const currentPercent = basePercent + (downloaded / total) * filePercent
      sender.send('download:progress', {
        percent: currentPercent,
        status: '正在下载客户端...',
        file: `${version}.jar`,
        speed,
        downloaded,
        total: clientInfo.size,
        threads: MAX_CONCURRENT_DOWNLOADS
      })
    }
  )
}

// 下载依赖库文件
async function downloadLibraries(versionJson, mcDirectory, sender, startFile, totalFiles, downloadSource, onSizeUpdate) {
  if (!versionJson.libraries || versionJson.libraries.length === 0) {
    return
  }
  
  const librariesDir = path.join(mcDirectory, 'libraries')
  const nativesDir = path.join(mcDirectory, 'versions', versionJson.id, 'natives')
  await ensureDir(librariesDir)
  await ensureDir(nativesDir)
  
  const limiter = new ConcurrencyLimit(MAX_CONCURRENT_DOWNLOADS)
  const downloadPromises = []
  
  for (let i = 0; i < versionJson.libraries.length; i++) {
    const library = versionJson.libraries[i]
    const currentFile = startFile + i
    
    // 检查规则是否允许下载
    if (!shouldDownloadLibrary(library)) {
      continue
    }
    
    downloadPromises.push(
      limiter.run(async () => {
        try {          // 下载普通库文件
          if (library.downloads?.artifact) {
            await downloadLibraryArtifact(library, librariesDir, sender, currentFile, totalFiles, downloadSource)
          }
          
          // 处理natives库文件
          if (library.downloads?.classifiers) {
            await downloadAndExtractNatives(library, librariesDir, nativesDir, sender, currentFile, totalFiles, downloadSource)
          }
        } catch (error) {
          logger.error(`下载库文件失败 ${library.name}: ${error.message}`)
          throw error
        }
      })
    )
  }
  
  await Promise.all(downloadPromises)
}

// 检查是否应该下载库文件（根据规则）
function shouldDownloadLibrary(library) {
  if (!library.rules) return true
  
  for (const rule of library.rules) {
    if (rule.action === 'allow') {
      if (!rule.os) return true
      if (rule.os.name === 'windows' && process.platform === 'win32') return true
      if (rule.os.name === 'osx' && process.platform === 'darwin') return true
      if (rule.os.name === 'linux' && process.platform === 'linux') return true
    } else if (rule.action === 'disallow') {
      if (!rule.os) return false
      if (rule.os.name === 'windows' && process.platform === 'win32') return false
      if (rule.os.name === 'osx' && process.platform === 'darwin') return false
      if (rule.os.name === 'linux' && process.platform === 'linux') return false
    }
  }
  
  return false
}

// 下载普通库文件
async function downloadLibraryArtifact(library, librariesDir, sender, currentFile, totalFiles, downloadSource) {
  const artifact = library.downloads.artifact
  const filePath = path.join(librariesDir, artifact.path)
  
  await ensureDir(path.dirname(filePath))
  
  const basePercent = (currentFile / totalFiles) * 80
  
  sender.send('download:progress', {
    percent: basePercent,
    status: '正在下载依赖库...',
    file: path.basename(artifact.path)
  })
  
  await downloadFile(getMirroredUrl(artifact.url, downloadSource), filePath, artifact.sha1, false, null)
}

// 下载并解压natives库文件
async function downloadAndExtractNatives(library, librariesDir, nativesDir, sender, currentFile, totalFiles, downloadSource) {
  const classifiers = library.downloads.classifiers
  let nativeClassifier = null
  
  // 根据操作系统选择natives
  if (process.platform === 'win32') {
    nativeClassifier = classifiers['natives-windows'] || classifiers['natives-windows-64']
  } else if (process.platform === 'darwin') {
    nativeClassifier = classifiers['natives-osx'] || classifiers['natives-macos']
  } else if (process.platform === 'linux') {
    nativeClassifier = classifiers['natives-linux']
  }
  
  if (!nativeClassifier) return
  
  const filePath = path.join(librariesDir, nativeClassifier.path)
  await ensureDir(path.dirname(filePath))
  
  const basePercent = (currentFile / totalFiles) * 80
  
  sender.send('download:progress', {
    percent: basePercent,
    status: '正在下载natives库...',
    file: path.basename(nativeClassifier.path)
  })
    // 下载natives jar文件
  await downloadFile(getMirroredUrl(nativeClassifier.url, downloadSource), filePath, nativeClassifier.sha1, false, null)
  
  // 解压natives文件
  try {
    const JSZip = require('jszip')
    const zipData = await fsPromises.readFile(filePath)
    const zip = await JSZip.loadAsync(zipData)
      for (const [filename, file] of Object.entries(zip.files)) {
      if (!file.dir && !filename.includes('META-INF')) {
        // 只提取dll、so、dylib等natives文件
        const isNative = filename.endsWith('.dll') || 
                        filename.endsWith('.so') || 
                        filename.endsWith('.dylib') ||
                        filename.endsWith('.jnilib')
        
        if (isNative) {
          const content = await file.async('nodebuffer')
          const extractPath = path.join(nativesDir, path.basename(filename))
          await fsPromises.writeFile(extractPath, content)
        }
      }
    }
  } catch (error) {
    logger.error(`解压natives失败: ${error.message}`)
    // natives解压失败不应该中断整个下载过程
  }
}

// 下载资源文件
async function downloadAssets(versionJson, mcDirectory, sender, currentFile, totalFiles, downloadSource, onSizeUpdate) {
  if (!versionJson.assetIndex) return
  
  const assetsDir = path.join(mcDirectory, 'assets')
  const indexesDir = path.join(assetsDir, 'indexes')
  const objectsDir = path.join(assetsDir, 'objects')
  
  await ensureDir(indexesDir)
  await ensureDir(objectsDir)
  
  const basePercent = (currentFile / totalFiles) * 80
  
  sender.send('download:progress', {
    percent: basePercent,
    status: '正在下载资源索引...',
    file: `${versionJson.assetIndex.id}.json`
  })
    // 下载资源索引文件
  const indexPath = path.join(indexesDir, `${versionJson.assetIndex.id}.json`)
  await downloadFile(getMirroredUrl(versionJson.assetIndex.url, downloadSource), indexPath, versionJson.assetIndex.sha1, false, null)
  
  // 读取资源索引
  const indexData = JSON.parse(await fsPromises.readFile(indexPath, 'utf8'))
  const objects = indexData.objects
  
  if (!objects) return
  
  // 限制同时下载的资源文件数量
  const assetLimiter = new ConcurrencyLimit(MAX_CONCURRENT_DOWNLOADS)
  const assetPromises = []
  
  let processedAssets = 0
  const totalAssets = Object.keys(objects).length
  
  for (const [assetName, assetInfo] of Object.entries(objects)) {
    assetPromises.push(
      assetLimiter.run(async () => {
        const hash = assetInfo.hash
        const hashPrefix = hash.substring(0, 2)
        const objectPath = path.join(objectsDir, hashPrefix, hash)
        
        // 检查文件是否已存在且正确
        if (fs.existsSync(objectPath)) {
          try {
            const existingHash = crypto.createHash('sha1')
              .update(await fsPromises.readFile(objectPath))
              .digest('hex')
            if (existingHash === hash) {
              processedAssets++
              return // 文件已存在且正确
            }
          } catch (error) {
            // 文件损坏，需要重新下载
          }
        }
          await ensureDir(path.dirname(objectPath))
        
        const assetUrl = getMirroredUrl(`https://resources.download.minecraft.net/${hashPrefix}/${hash}`, downloadSource)
        await downloadFile(assetUrl, objectPath, hash, false, null)
        
        processedAssets++
        
        // 更新进度
        const assetPercent = basePercent + (processedAssets / totalAssets) * (80 / totalFiles)
        sender.send('download:progress', {
          percent: assetPercent,
          status: `正在下载资源文件... (${processedAssets}/${totalAssets})`,
          file: assetName
        })
      })
    )
  }
  
  await Promise.all(assetPromises)
}

// 下载log4j配置文件
async function downloadLogging(versionJson, mcDirectory, sender, currentFile, totalFiles, downloadSource, onSizeUpdate) {
  const loggingInfo = versionJson.logging.client.file
  const loggingDir = path.join(mcDirectory, 'assets', 'log_configs')
  await ensureDir(loggingDir)
  
  const loggingPath = path.join(loggingDir, loggingInfo.id)
  
  const basePercent = (currentFile / totalFiles) * 80
  
  sender.send('download:progress', {
    percent: basePercent,
    status: '正在下载日志配置...',
    file: loggingInfo.id
  })
  
  await downloadFile(getMirroredUrl(loggingInfo.url, downloadSource), loggingPath, loggingInfo.sha1, false, null)
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
