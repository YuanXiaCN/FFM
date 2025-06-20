// 渲染进程配置管理服务
// 使用预加载脚本暴露的API而不是直接导入electron

// 配置管理服务
const ConfigService = {
  /**
   * 获取配置项
   * @param {String} key - 配置键
   * @param {*} defaultValue - 默认值
   * @returns {Promise<*>} - 配置值
   */
  async get(key, defaultValue) {
    if (window.electronAPI && window.electronAPI.loadSettings) {
      const settings = await window.electronAPI.loadSettings();
      return settings[key] !== undefined ? settings[key] : defaultValue;
    }
    return defaultValue;
  },

  /**
   * 设置配置项
   * @param {String} key - 配置键
   * @param {*} value - 配置值
   * @returns {Promise<void>}
   */
  async set(key, value) {
    if (window.electronAPI && window.electronAPI.saveSettings) {
      const settings = await this.getAll();
      settings[key] = value;
      return await window.electronAPI.saveSettings(settings);
    }
    throw new Error('Electron API not available');
  },
  /**
   * 获取所有配置
   * @returns {Promise<Object>} - 所有配置
   */
  async getAll() {
    if (window.electronAPI && window.electronAPI.getAllConfig) {
      return await window.electronAPI.getAllConfig();
    }
    throw new Error('Electron API not available');
  },

  /**
   * 重置所有配置
   * @returns {Promise<void>}
   */
  async reset() {
    if (window.electronAPI && window.electronAPI.resetConfig) {
      return await window.electronAPI.resetConfig();
    }
    throw new Error('Electron API not available');
  }
};

export default ConfigService;
