// 渲染进程配置管理服务
import { ipcRenderer } from 'electron';

// 配置管理服务
const ConfigService = {
  /**
   * 获取配置项
   * @param {String} key - 配置键
   * @param {*} defaultValue - 默认值
   * @returns {Promise<*>} - 配置值
   */
  async get(key, defaultValue) {
    return await ipcRenderer.invoke('config:get', key, defaultValue);
  },

  /**
   * 设置配置项
   * @param {String} key - 配置键
   * @param {*} value - 配置值
   * @returns {Promise<void>}
   */
  async set(key, value) {
    return await ipcRenderer.invoke('config:set', key, value);
  },

  /**
   * 获取所有配置
   * @returns {Promise<Object>} - 所有配置
   */
  async getAll() {
    return await ipcRenderer.invoke('config:getAll');
  },

  /**
   * 重置所有配置
   * @returns {Promise<void>}
   */
  async reset() {
    return await ipcRenderer.invoke('config:reset');
  }
};

export default ConfigService;
