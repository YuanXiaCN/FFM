// 游戏启动服务 - 主进程
const { ipcMain } = require('electron')
const os = require('os')
const path = require('path')
const configService = require('./main-config-service.cjs')
const MinecraftLauncher = require('./src/services/MinecraftLauncher.cjs')
const { logger } = require('./utils.cjs')

// 当前游戏进程
let currentGameProcess = null

// 获取启动器实例
function getLauncher() {
  const mcDirectory = configService.getConfig('mcDirectory') || path.join(os.homedir(), '.minecraft')
  return new MinecraftLauncher(mcDirectory)
}

// 启动游戏
ipcMain.handle('game:launch', async (event, options) => {
  try {
    const {
      version,
      username,
      uuid,
      accessToken,
      userType = 'mojang',
      javaPath,
      javaArgs,
      gameArgs,
      windowSize
    } = options
    
    logger.info(`启动游戏: ${version}, 用户: ${username}`)
    
    // 如果有正在运行的游戏，先询问是否关闭
    if (currentGameProcess && !currentGameProcess.killed) {
      logger.warn('已有游戏进程在运行')
      return { success: false, error: '已有游戏进程在运行' }
    }
    
    const launcher = getLauncher()
    const mcDirectory = configService.getConfig('mcDirectory') || path.join(os.homedir(), '.minecraft')
    
    // 启动游戏
    currentGameProcess = await launcher.launchGame({
      version,
      username: username || '玩家',
      uuid: uuid || generateOfflineUUID(username || '玩家'),
      accessToken: accessToken || 'offline',
      userType,
      gameDir: mcDirectory,
      javaPath: javaPath || 'java',
      javaArgs: javaArgs || '-Xmx2G -XX:+UnlockExperimentalVMOptions -XX:+UseG1GC',
      gameArgs,
      windowSize: windowSize || { width: 854, height: 480 }
    })
    
    // 监听游戏进程事件
    currentGameProcess.stdout.on('data', (data) => {
      const output = data.toString()
      logger.info(`游戏输出: ${output}`)
      event.sender.send('game:output', { type: 'stdout', data: output })
    })
    
    currentGameProcess.stderr.on('data', (data) => {
      const output = data.toString()
      logger.error(`游戏错误: ${output}`)
      event.sender.send('game:output', { type: 'stderr', data: output })
    })
    
    currentGameProcess.on('close', (code) => {
      logger.info(`游戏进程结束，退出码: ${code}`)
      event.sender.send('game:exit', { code })
      currentGameProcess = null
    })
    
    currentGameProcess.on('error', (error) => {
      logger.error(`游戏进程错误: ${error.message}`)
      event.sender.send('game:error', { error: error.message })
      currentGameProcess = null
    })
    
    return { success: true, pid: currentGameProcess.pid }
    
  } catch (error) {
    logger.error('启动游戏失败:', error)
    return { success: false, error: error.message }
  }
})

// 关闭游戏
ipcMain.handle('game:kill', async (event) => {
  try {
    if (currentGameProcess && !currentGameProcess.killed) {
      currentGameProcess.kill('SIGTERM')
      
      // 给进程一些时间正常退出
      setTimeout(() => {
        if (currentGameProcess && !currentGameProcess.killed) {
          currentGameProcess.kill('SIGKILL')
        }
      }, 5000)
      
      return { success: true }
    }
    
    return { success: false, error: '没有正在运行的游戏进程' }
  } catch (error) {
    logger.error('关闭游戏失败:', error)
    return { success: false, error: error.message }
  }
})

// 获取游戏状态
ipcMain.handle('game:getStatus', async () => {
  return {
    running: currentGameProcess && !currentGameProcess.killed,
    pid: currentGameProcess?.pid
  }
})

// 检查Java环境
ipcMain.handle('game:checkJava', async (event, javaPath = 'java') => {
  const { spawn } = require('child_process')
  
  return new Promise((resolve) => {
    const javaProcess = spawn(javaPath, ['-version'], { stdio: 'pipe' })
    
    let output = ''
    let errorOutput = ''
    
    javaProcess.stdout.on('data', (data) => {
      output += data.toString()
    })
    
    javaProcess.stderr.on('data', (data) => {
      errorOutput += data.toString()
    })
    
    javaProcess.on('close', (code) => {
      if (code === 0) {
        // Java版本信息通常在stderr中
        const versionInfo = errorOutput || output
        const versionMatch = versionInfo.match(/version "([^"]+)"/)
        const version = versionMatch ? versionMatch[1] : 'unknown'
        
        resolve({
          available: true,
          version,
          path: javaPath,
          output: versionInfo
        })
      } else {
        resolve({
          available: false,
          error: `Java检查失败，退出码: ${code}`,
          output: errorOutput || output
        })
      }
    })
    
    javaProcess.on('error', (error) => {
      resolve({
        available: false,
        error: error.message
      })
    })
    
    // 5秒超时
    setTimeout(() => {
      if (!javaProcess.killed) {
        javaProcess.kill()
        resolve({
          available: false,
          error: 'Java检查超时'
        })
      }
    }, 5000)
  })
})

// 生成离线UUID
function generateOfflineUUID(username) {
  const crypto = require('crypto')
  const hash = crypto.createHash('md5')
  hash.update(`OfflinePlayer:${username}`)
  const hex = hash.digest('hex')
  
  // 转换为UUID格式
  return [
    hex.substr(0, 8),
    hex.substr(8, 4),
    '3' + hex.substr(13, 3), // 版本号3表示MD5哈希
    '8' + hex.substr(17, 3), // 变体位
    hex.substr(20, 12)
  ].join('-')
}

module.exports = {
  getLauncher,
  generateOfflineUUID
}
