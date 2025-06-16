// 主进程配置管理服务
const { ipcMain } = require('electron')
const fs = require('fs')
const path = require('path')
const os = require('os')

// 配置文件路径
const configPath = path.join(process.cwd(), 'mc.ini')

// 默认配置
const defaultConfig = {
  mcDirectory: path.join(os.homedir(), '.minecraft'),
  javaPath: '',
  memoryMin: '1G',
  memoryMax: '2G',
  downloadSource: 'official',
  disableSSLVerify: false
}

// 当前配置
let currentConfig = { ...defaultConfig }

// 加载配置
function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, 'utf8')
      const loadedConfig = parseIni(configData)
      currentConfig = { ...defaultConfig, ...loadedConfig }
    }
  } catch (err) {
    console.error('加载配置失败:', err)
  }
}

// 保存配置
function saveConfig() {
  try {
    const configData = stringifyIni(currentConfig)
    fs.writeFileSync(configPath, configData, 'utf8')
  } catch (err) {
    console.error('保存配置失败:', err)
  }
}

// 解析INI格式
function parseIni(data) {
  const config = {}
  const lines = data.split('\n')
  
  for (let line of lines) {
    line = line.trim()
    if (line.startsWith(';') || line === '') continue
    const [key, value] = line.split('=').map(s => s.trim())
    if (key && value !== undefined) {
      config[key] = value
    }
  }
  
  return config
}

// 转换为INI格式
function stringifyIni(config) {
  let result = '; Minecraft Launcher配置\n'
  for (const [key, value] of Object.entries(config)) {
    result += `${key}=${value}\n`
  }
  return result
}

// 初始化
loadConfig()

// 注册IPC处理程序
ipcMain.handle('config:get', (event, key, defaultValue) => {
  return currentConfig[key] !== undefined ? currentConfig[key] : defaultValue
})

ipcMain.handle('config:set', (event, key, value) => {
  currentConfig[key] = value
  saveConfig()
  return true
})

ipcMain.handle('config:getAll', () => {
  return { ...currentConfig }
})

ipcMain.handle('config:reset', () => {
  currentConfig = { ...defaultConfig }
  saveConfig()
  return true
})

// 导出配置服务
module.exports = {
  getConfig: (key) => currentConfig[key],
  setConfig: (key, value) => {
    currentConfig[key] = value
    saveConfig()
  },
  resetConfig: () => {
    currentConfig = { ...defaultConfig }
    saveConfig()
  }
}
