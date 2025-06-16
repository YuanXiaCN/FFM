// 主进程配置管理服务
const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { IPC_CHANNELS } = require('../../shared/constants');

class ConfigService {
  constructor(userDataPath) {
    this.configPath = path.join(userDataPath, 'config', 'app.ini');
    this.backupPath = path.join(userDataPath, 'config', 'app.ini.backup');
    
    // 默认配置
    this.defaultConfig = {
      mcDirectory: path.join(os.homedir(), '.minecraft'),
      javaPath: '',
      memoryMin: '1G',
      memoryMax: '2G',
      downloadSource: 'official',
      disableSSLVerify: false,
      language: 'zh-CN',
      theme: 'light',
      autoUpdate: true,
      showPreRelease: false,
      maxDownloads: 5,
      downloadTimeout: 30000
    };
    
    this.currentConfig = { ...this.defaultConfig };
    this.configWatchers = new Set();
    
    this.initialize();
  }

  /**
   * 初始化配置服务
   */
  initialize() {
    this.ensureConfigDirectory();
    this.loadConfig();
    this.registerIpcHandlers();
  }

  /**
   * 确保配置目录存在
   */
  ensureConfigDirectory() {
    const configDir = path.dirname(this.configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
  }

  /**
   * 加载配置
   */
  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf8');
        const loadedConfig = this.parseIni(configData);
        this.currentConfig = { ...this.defaultConfig, ...loadedConfig };
        
        // 验证配置
        this.validateConfig();
      } else {
        // 首次运行，创建默认配置文件
        this.saveConfig();
      }
    } catch (error) {
      console.error('加载配置失败:', error);
      this.loadBackupConfig();
    }
  }

  /**
   * 加载备份配置
   */
  loadBackupConfig() {
    try {
      if (fs.existsSync(this.backupPath)) {
        const configData = fs.readFileSync(this.backupPath, 'utf8');
        const loadedConfig = this.parseIni(configData);
        this.currentConfig = { ...this.defaultConfig, ...loadedConfig };
        
        // 恢复主配置文件
        this.saveConfig();
        console.log('已从备份恢复配置');
      } else {
        this.currentConfig = { ...this.defaultConfig };
        this.saveConfig();
        console.log('已重置为默认配置');
      }
    } catch (error) {
      console.error('加载备份配置失败:', error);
      this.currentConfig = { ...this.defaultConfig };
    }
  }

  /**
   * 验证配置
   */
  validateConfig() {
    // 验证内存设置
    if (this.currentConfig.memoryMin && this.currentConfig.memoryMax) {
      const minMem = this.parseMemoryValue(this.currentConfig.memoryMin);
      const maxMem = this.parseMemoryValue(this.currentConfig.memoryMax);
      
      if (minMem > maxMem) {
        this.currentConfig.memoryMin = this.defaultConfig.memoryMin;
        this.currentConfig.memoryMax = this.defaultConfig.memoryMax;
      }
    }

    // 验证路径
    if (this.currentConfig.mcDirectory && !this.isValidPath(this.currentConfig.mcDirectory)) {
      this.currentConfig.mcDirectory = this.defaultConfig.mcDirectory;
    }

    if (this.currentConfig.javaPath && !this.isValidPath(this.currentConfig.javaPath)) {
      this.currentConfig.javaPath = this.defaultConfig.javaPath;
    }
  }

  /**
   * 解析内存值
   */
  parseMemoryValue(value) {
    const match = value.match(/^(\d+)([GMK]?)$/i);
    if (!match) return 0;
    
    const num = parseInt(match[1]);
    const unit = match[2].toUpperCase();
    
    switch (unit) {
      case 'G': return num * 1024;
      case 'M': return num;
      case 'K': return num / 1024;
      default: return num;
    }
  }

  /**
   * 验证路径
   */
  isValidPath(filePath) {
    try {
      return path.isAbsolute(filePath) && fs.existsSync(path.dirname(filePath));
    } catch {
      return false;
    }
  }

  /**
   * 保存配置
   */
  saveConfig() {
    try {
      // 创建备份
      if (fs.existsSync(this.configPath)) {
        fs.copyFileSync(this.configPath, this.backupPath);
      }
      
      // 保存配置
      const configData = this.stringifyIni(this.currentConfig);
      fs.writeFileSync(this.configPath, configData, 'utf8');
      
      // 通知配置变更
      this.notifyConfigChange();
    } catch (error) {
      console.error('保存配置失败:', error);
      throw error;
    }
  }

  /**
   * 解析INI格式
   */
  parseIni(data) {
    const config = {};
    const lines = data.split('\n');
    
    for (let line of lines) {
      line = line.trim();
      if (line.startsWith(';') || line.startsWith('#') || line === '') continue;
      
      const equalIndex = line.indexOf('=');
      if (equalIndex === -1) continue;
      
      const key = line.substring(0, equalIndex).trim();
      const value = line.substring(equalIndex + 1).trim();
      
      if (key && value !== undefined) {
        // 尝试解析布尔值和数字
        if (value === 'true') {
          config[key] = true;
        } else if (value === 'false') {
          config[key] = false;
        } else if (!isNaN(value) && !isNaN(parseFloat(value))) {
          config[key] = parseFloat(value);
        } else {
          config[key] = value;
        }
      }
    }
    
    return config;
  }

  /**
   * 转换为INI格式
   */
  stringifyIni(config) {
    let result = '; Minecraft Launcher 配置文件\n';
    result += `; 生成时间: ${new Date().toISOString()}\n\n`;
    
    for (const [key, value] of Object.entries(config)) {
      result += `${key}=${value}\n`;
    }
    
    return result;
  }

  /**
   * 注册IPC处理程序
   */
  registerIpcHandlers() {
    ipcMain.handle(IPC_CHANNELS.CONFIG_GET, (event, key, defaultValue) => {
      return this.get(key, defaultValue);
    });

    ipcMain.handle(IPC_CHANNELS.CONFIG_SET, (event, key, value) => {
      return this.set(key, value);
    });

    ipcMain.handle(IPC_CHANNELS.CONFIG_GET_ALL, () => {
      return this.getAll();
    });

    ipcMain.handle(IPC_CHANNELS.CONFIG_RESET, () => {
      return this.reset();
    });
  }

  /**
   * 获取配置项
   */
  get(key, defaultValue) {
    return this.currentConfig[key] !== undefined ? this.currentConfig[key] : defaultValue;
  }

  /**
   * 设置配置项
   */
  set(key, value) {
    const oldValue = this.currentConfig[key];
    this.currentConfig[key] = value;
    
    try {
      this.saveConfig();
      return true;
    } catch (error) {
      // 回滚
      this.currentConfig[key] = oldValue;
      throw error;
    }
  }

  /**
   * 获取所有配置
   */
  getAll() {
    return { ...this.currentConfig };
  }

  /**
   * 重置配置
   */
  reset() {
    this.currentConfig = { ...this.defaultConfig };
    this.saveConfig();
    return true;
  }

  /**
   * 批量设置配置
   */
  setMultiple(configs) {
    const oldConfig = { ...this.currentConfig };
    
    try {
      Object.assign(this.currentConfig, configs);
      this.saveConfig();
      return true;
    } catch (error) {
      // 回滚
      this.currentConfig = oldConfig;
      throw error;
    }
  }

  /**
   * 监听配置变更
   */
  watch(callback) {
    this.configWatchers.add(callback);
    return () => this.configWatchers.delete(callback);
  }

  /**
   * 通知配置变更
   */
  notifyConfigChange() {
    for (const callback of this.configWatchers) {
      try {
        callback(this.currentConfig);
      } catch (error) {
        console.error('配置变更通知失败:', error);
      }
    }
  }

  /**
   * 获取配置文件路径
   */
  getConfigPath() {
    return this.configPath;
  }

  /**
   * 导出配置
   */
  exportConfig(filePath) {
    try {
      const configData = this.stringifyIni(this.currentConfig);
      fs.writeFileSync(filePath, configData, 'utf8');
      return true;
    } catch (error) {
      console.error('导出配置失败:', error);
      return false;
    }
  }

  /**
   * 导入配置
   */
  importConfig(filePath) {
    try {
      const configData = fs.readFileSync(filePath, 'utf8');
      const importedConfig = this.parseIni(configData);
      
      // 验证导入的配置
      const validConfig = {};
      for (const [key, value] of Object.entries(importedConfig)) {
        if (this.defaultConfig.hasOwnProperty(key)) {
          validConfig[key] = value;
        }
      }
      
      this.currentConfig = { ...this.defaultConfig, ...validConfig };
      this.validateConfig();
      this.saveConfig();
      return true;
    } catch (error) {
      console.error('导入配置失败:', error);
      return false;
    }
  }

  /**
   * 清理资源
   */
  cleanup() {
    this.configWatchers.clear();
    
    // 移除IPC监听器
    ipcMain.removeAllListeners(IPC_CHANNELS.CONFIG_GET);
    ipcMain.removeAllListeners(IPC_CHANNELS.CONFIG_SET);
    ipcMain.removeAllListeners(IPC_CHANNELS.CONFIG_GET_ALL);
    ipcMain.removeAllListeners(IPC_CHANNELS.CONFIG_RESET);
  }
}

module.exports = ConfigService;
