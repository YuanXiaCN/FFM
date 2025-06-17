// 预加载脚本
const { contextBridge, ipcRenderer } = require('electron');

// 用于存储事件清理函数
const cleanupCallbacks = new Map();

// 处理事件监听的辅助函数
function handleEventListener(channel, callback) {
    const wrappedCallback = () => callback();
    ipcRenderer.on(channel, wrappedCallback);
    
    // 存储清理函数
    if (!cleanupCallbacks.has(channel)) {
        cleanupCallbacks.set(channel, []);
    }
    cleanupCallbacks.get(channel).push(wrappedCallback);
    
    // 返回清理函数
    return () => {
        ipcRenderer.removeListener(channel, wrappedCallback);
        const callbacks = cleanupCallbacks.get(channel);
        const index = callbacks.indexOf(wrappedCallback);
        if (index > -1) {
            callbacks.splice(index, 1);
        }
    };
}

// 暴露API给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
    // 窗口控制
    windowMin: () => {
        console.log('preload: windowMin 被调用');
        ipcRenderer.send('window-min');
    },
    windowMax: () => {
        console.log('preload: windowMax 被调用');
        ipcRenderer.send('window-max');
    },
    windowClose: () => {
        console.log('preload: windowClose 被调用');
        ipcRenderer.send('window-close');
    },
    
    // 下载相关API
    startDownload: (options) => ipcRenderer.invoke('download:start', options),
    cancelDownload: () => ipcRenderer.invoke('download:cancel'),
    onDownloadProgress: (callback) => {
        const wrappedCallback = (event, progress) => callback(progress);
        ipcRenderer.on('download:progress', wrappedCallback);
        return () => ipcRenderer.removeListener('download:progress', wrappedCallback);
    },
    
    // 版本管理API
    getInstalledVersions: () => ipcRenderer.invoke('version:getInstalled'),
    getVersionInfo: (versionId) => ipcRenderer.invoke('version:getInfo', versionId),
    deleteVersion: (versionId) => ipcRenderer.invoke('version:delete', versionId),
    getVersionSize: (versionId) => ipcRenderer.invoke('version:getSize', versionId),
    checkVersionIntegrity: (versionId) => ipcRenderer.invoke('version:checkIntegrity', versionId),
    
    // 游戏启动API
    launchGame: (options) => ipcRenderer.invoke('game:launch', options),
    killGame: () => ipcRenderer.invoke('game:kill'),
    getGameStatus: () => ipcRenderer.invoke('game:getStatus'),
    checkJava: (javaPath) => ipcRenderer.invoke('game:checkJava', javaPath),
    onGameOutput: (callback) => {
        const wrappedCallback = (event, output) => callback(output);
        ipcRenderer.on('game:output', wrappedCallback);
        return () => ipcRenderer.removeListener('game:output', wrappedCallback);
    },
    onGameExit: (callback) => {
        const wrappedCallback = (event, data) => callback(data);
        ipcRenderer.on('game:exit', wrappedCallback);
        return () => ipcRenderer.removeListener('game:exit', wrappedCallback);
    },
    onGameError: (callback) => {
        const wrappedCallback = (event, data) => callback(data);
        ipcRenderer.on('game:error', wrappedCallback);
        return () => ipcRenderer.removeListener('game:error', wrappedCallback);
    },
    
    // 事件监听
    onMaximized: (callback) => handleEventListener('window-maximized', callback),
    onUnmaximized: (callback) => handleEventListener('window-unmaximized', callback),
    onWindowMove: (callback) => handleEventListener('window-move', callback),
    onWindowMoveEnd: (callback) => handleEventListener('window-move-end', callback),
    
    // JRE相关
    findJRE: () => ipcRenderer.invoke('find-jre'),
    
    // 设置相关
    loadSettings: () => ipcRenderer.invoke('load-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
    
    // Java相关API
    searchJava: () => ipcRenderer.invoke('searchJava'),
    importJava: (path) => ipcRenderer.invoke('importJava', path),
    getJavaConfigs: () => ipcRenderer.invoke('getJavaConfigs'),
    
    // Minecraft账号管理API
    getMinecraftAccounts: () => ipcRenderer.invoke('getMinecraftAccounts'),
    getSelectedAccount: () => ipcRenderer.invoke('getSelectedAccount'),
    setSelectedAccount: (accountId) => ipcRenderer.invoke('setSelectedAccount', accountId),
    saveMinecraftAccount: (account) => ipcRenderer.invoke('saveMinecraftAccount', account),
    deleteMinecraftAccount: (accountId) => ipcRenderer.invoke('deleteMinecraftAccount', accountId),
    cleanupDuplicateAccounts: () => ipcRenderer.invoke('cleanupDuplicateAccounts'),
    startMicrosoftLogin: () => ipcRenderer.invoke('startMicrosoftLogin'),
    refreshMinecraftAccount: (accountId) => ipcRenderer.invoke('refreshMinecraftAccount', accountId),
    
    // 文件选择对话框
    selectFile: (options) => ipcRenderer.invoke('dialog:openFile', options),
    
    // 配置服务
    getConfig: (key, defaultValue) => ipcRenderer.invoke('config:get', key, defaultValue),
    setConfig: (key, value) => ipcRenderer.invoke('config:set', key, value),
    getAllConfig: () => ipcRenderer.invoke('config:getAll'),
    resetConfig: () => ipcRenderer.invoke('config:reset'),
    
    // 日志相关API
    logToMain: (logData) => ipcRenderer.invoke('logToMain', logData),
    getLogContent: (lines) => ipcRenderer.invoke('getLogContent', lines),
    clearLog: () => ipcRenderer.invoke('clearLog'),
    
    // Microsoft登录事件监听
    onMicrosoftLoginSuccess: (callback) => {
        const wrappedCallback = (event, account) => callback(account);
        ipcRenderer.on('microsoft-login-success', wrappedCallback);
        return () => ipcRenderer.removeListener('microsoft-login-success', wrappedCallback);
    },
    onMicrosoftLoginCancelled: (callback) => {
        const wrappedCallback = (event) => callback();
        ipcRenderer.on('microsoft-login-cancelled', wrappedCallback);
        return () => ipcRenderer.removeListener('microsoft-login-cancelled', wrappedCallback);
    },
    
    // 清理所有事件监听器
    removeAllListeners: (channel) => {
        if (channel) {
            ipcRenderer.removeAllListeners(channel);
            if (cleanupCallbacks.has(channel)) {
                cleanupCallbacks.delete(channel);
            }
        } else {
            // 清理所有记录的监听器
            for (const [ch, callbacks] of cleanupCallbacks) {
                for (const callback of callbacks) {
                    ipcRenderer.removeListener(ch, callback);
                }
            }
            cleanupCallbacks.clear();
        }
    }
});

// 暴露electron对象（兼容旧代码）
contextBridge.exposeInMainWorld('electron', {
    startDownload: (options) => ipcRenderer.invoke('download:start', options),
    cancelDownload: () => ipcRenderer.invoke('download:cancel'),
    onDownloadProgress: (callback) => {
        const wrappedCallback = (event, progress) => callback(progress);
        ipcRenderer.on('download:progress', wrappedCallback);
        return () => ipcRenderer.removeListener('download:progress', wrappedCallback);
    },
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});
