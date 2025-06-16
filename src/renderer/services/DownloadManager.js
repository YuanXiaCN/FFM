// DownloadManager.js
// 渲染进程下载管理器，负责与主进程通信，发起下载任务、接收进度

let progressCallback = null;
let cleanupListener = null;

export default {
  /**
   * 发起下载任务
   * @param {Object} options - { version, loader, shader }
   * @returns {Promise}
   */
  startDownload(options) {
    return window.electronAPI.startDownload(options)
  },

  /**
   * 监听下载进度
   * @param {Function} callback - (progress) => void
   */
  onProgress(callback) {
    // 先移除旧的监听器
    if (cleanupListener) {
      cleanupListener();
      cleanupListener = null;
    }

    progressCallback = callback;
    cleanupListener = window.electronAPI.onDownloadProgress((progress) => {
      if (progressCallback) {
        progressCallback(progress);
      }
    });
  },

  /**
   * 取消下载
   */
  cancelDownload() {
    return window.electronAPI.cancelDownload()
  },
  
  /**
   * 移除进度监听器
   */
  removeProgressListener() {
    if (cleanupListener) {
      cleanupListener();
      cleanupListener = null;
    }
    progressCallback = null;
  }
}
