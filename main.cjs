// 主进程入口文件 main.cjs
const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const { exec } = require('child_process')
const fs = require('fs')
const path = require('path')
const iconv = require('iconv-lite');
const { logger, LOG_LEVELS, logToFile } = require('./utils.cjs');

// 导入调试启动器
const { setupDebugLogging } = require('./start-debug-download.cjs');

// 设置调试日志记录
setupDebugLogging();

// 自动更新（仅在生产环境中使用）
let autoUpdater = null;
try {
    if (app.isPackaged) {
        autoUpdater = require('electron-updater').autoUpdater;
    }
} catch (error) {
    logToFile(`自动更新模块加载失败: ${error.message}`);
}

// 全局错误处理
process.on('uncaughtException', (error) => {
    logToFile(`未捕获的异常: ${error.message}`);
    console.error('未捕获的异常:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    logToFile(`未处理的Promise拒绝: ${reason}`);
    console.error('未处理的Promise拒绝:', reason);
});

// 导入服务
try {
    require('./main-config-service.cjs');
    // 使用新的下载服务
    const newDownloadService = require('./src/services/NewMainDownloadService.cjs');
    newDownloadService.getInstance(); // 初始化新的下载服务
    
    require('./main-version-service.cjs');
    require('./main-launch-service.cjs');
    // 注释掉旧的服务
    // require('./main-download-service.cjs');
    // require('./src/services/IntegrityAndRepairService.cjs');
} catch (error) {
    logToFile(`服务导入错误: ${error.message}`);
    console.error('服务导入错误:', error);
}

// 获取应用数据目录
const isDev = !app.isPackaged;
const userDataPath = app.getPath('userData');
const cachePath = path.join(userDataPath, 'Cache');
const gpuCachePath = path.join(userDataPath, 'GPUCache');
const diskCachePath = path.join(userDataPath, 'DiskCache');

// Windows上的权限处理
function setFullPermissions(dirPath) {
  try {
    if (process.platform === 'win32') {
      // 使用 icacls 设置完全权限
      const command = `icacls "${dirPath}" /grant Everyone:F /T`;
      exec(command, (error, stdout, stderr) => {
        if (error) {
          logToFile(`设置权限失败: ${dirPath}, ${error.message}`);
        }
      });
    } else {
      // 在其他平台上使用 chmod
      fs.chmodSync(dirPath, 0o777);
    }
  } catch (error) {
    logToFile(`设置权限失败: ${dirPath}, ${error.message}`);
  }
}

// 确保目录存在并具有正确的权限
function ensureDirectoryWithPermissions(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    setFullPermissions(dirPath);
  } catch (error) {
    logToFile(`创建目录失败: ${dirPath}, ${error.message}`);
  }
}

// 确保所有缓存目录存在且有正确权限
const cacheDirs = [userDataPath, cachePath, gpuCachePath, diskCachePath];
cacheDirs.forEach(dir => ensureDirectoryWithPermissions(dir));

// 清理缓存目录
const fse = require('fs-extra');

function clearCacheDirectory(dirPath) {
  try {
    if (fs.existsSync(dirPath)) {
      // 使用 fs-extra 的 emptyDirSync，它会处理所有文件和子目录，并且更安全
      fse.emptyDirSync(dirPath);
    }
  } catch (error) {
    if (error.code === 'EBUSY' || error.code === 'ENOTEMPTY') {
      // 如果目录或文件正在使用，我们等待一会儿再试
      setTimeout(() => {
        try {
          fse.emptyDirSync(dirPath);
        } catch (retryError) {
          logToFile(`重试清理缓存失败: ${dirPath}, ${retryError.message}`);
        }
      }, 1000);
    } else {
      logToFile(`清理缓存失败: ${dirPath}, ${error.message}`);
    }
  }
}

// 应用启动时清理并重建缓存目录
app.on('ready', () => {
  // 在应用启动时，确保目录存在并具有正确权限
  cacheDirs.forEach(dir => {
    ensureDirectoryWithPermissions(dir);
  });
  
  // 在应用完全启动后再清理缓存，避免与其他进程冲突
  setTimeout(() => {
    cacheDirs.forEach(dir => {
      clearCacheDirectory(dir);
    });
  }, 2000);
});

// 安全的文件存在检查函数
function safeExistsSync(filePath) {
    try {
        return fs.existsSync(filePath);    } catch (error) {
        logToFile(`检查文件存在失败: ${error.message}`);
        return false;
    }
}

// 初始化配置文件 - 从应用目录复制到用户数据目录
function initializeConfigFiles() {
    const configFiles = ['mc.ini', 'FFM.json'];
    
    configFiles.forEach(filename => {
        const appConfigPath = path.join(__dirname, filename);
        const userConfigPath = path.join(userDataPath, filename);
        
        // 如果用户数据目录中不存在配置文件，但应用目录中存在，则复制过去
        if (!fs.existsSync(userConfigPath) && fs.existsSync(appConfigPath)) {
            try {
                fs.copyFileSync(appConfigPath, userConfigPath);
                logToFile(`已复制配置文件: ${filename} 到用户数据目录`);
            } catch (error) {
                logToFile(`复制配置文件失败 ${filename}: ${error.message}`);
            }
        }
    });
}

// 初始化配置文件
initializeConfigFiles();

// 使用PowerShell搜索MFT
function searchWithMFT() {
    return new Promise((resolve) => {
        // PowerShell命令来搜索所有java.exe文件
        const command = `
            $drives = Get-WmiObject Win32_LogicalDisk | Where-Object { $_.DriveType -eq 3 } | Select-Object -ExpandProperty DeviceID;
            foreach ($drive in $drives) {
                $fsutil = & fsutil usn readdata $drive;
                $fsutil | Select-String -Pattern 'java\\.exe$' -AllMatches | 
                ForEach-Object { $_.Line.Split('|')[3].Trim() } |
                Where-Object { $_ -match '\\\\bin\\\\java\\.exe$' }
            }
        `;

        logToFile('开始使用MFT搜索Java');
        exec(`powershell -Command "${command}"`, (error, stdout) => {
            if (error) {
                logToFile(`MFT搜索出错: ${error.message}`);
                resolve([]);
                return;
            }

            const paths = stdout.trim().split('\n')
                .map(line => line.trim())
                .filter(Boolean)
                .filter(path => path.toLowerCase().includes('\\bin\\java.exe'));

            logToFile(`MFT搜索找到的路径: ${JSON.stringify(paths)}`);
            resolve(paths);
        });
    });
}

// 查找JRE路径
async function findJRE() {
    return new Promise(async (resolve) => {
        if (process.platform === 'win32') {
            logToFile('开始搜索Java - Windows系统');
            try {
                // 首先尝试使用MFT搜索
                const mftResults = await searchWithMFT();
                if (mftResults.length > 0) {
                    logToFile('使用MFT找到Java路径');
                    resolve(mftResults);
                    return;
                }
                // 如果MFT搜索失败，回退到where命令
                logToFile('MFT搜索无结果，尝试使用where命令');
                // 关键：用 Buffer 捕获原始输出
                const { spawn } = require('child_process');
                const child = spawn('cmd', ['/c', 'where', '/r', 'c:\\', 'java.exe'], { encoding: 'buffer' });
                let stdoutBuf = Buffer.alloc(0);
                child.stdout.on('data', (data) => { stdoutBuf = Buffer.concat([stdoutBuf, data]); });
                child.on('close', (code) => {
                    // 先尝试 utf8 解码
                    let stdout = stdoutBuf.toString('utf8');
                    // 若包含乱码，再尝试 GBK 解码
                    if (stdout.includes('���')) {
                        const gbkDecoded = iconv.decode(stdoutBuf, 'gbk');
                        logToFile(`where命令原始Buffer(utf8): ${JSON.stringify(stdout)}`);
                        logToFile(`where命令GBK解码: ${JSON.stringify(gbkDecoded)}`);
                        stdout = gbkDecoded;
                    } else {
                        logToFile(`where命令原始Buffer(utf8): ${JSON.stringify(stdout)}`);
                    }
                    const paths = stdout.trim().split(/\r?\n/)
                        .filter(Boolean)
                        .filter(p => p.toLowerCase().includes('bin\\java.exe'));
                    logToFile(`where命令找到的Java路径: ${JSON.stringify(paths)}`);
                    if (paths.length > 0) {
                        resolve(paths);
                    } else {
                        resolve(['未找到JRE']);
                    }
                });
            } catch (error) {
                logToFile(`搜索过程出错: ${error.message}`);
                resolve(['未找到JRE']);
            }
        } else {
            // Mac/Linux系统
            exec('which java || find /usr -name java -type f -executable 2>/dev/null | head -n 1',
                (error, stdout) => {
                    resolve(error ? '未找到JRE' : stdout.trim())
                })
        }
    })
}

// 检测Java版本（使用Promise.all进行并行检测）
async function getJavaVersion(javaPath) {
    logToFile(`开始检测Java版本: ${javaPath}`);
    return new Promise((resolve) => {
        exec(`"${javaPath}" -version 2>&1`, (error, stdout, stderr) => {
            if (error) {
                logToFile(`版本检测失败: ${error.message}`);
                resolve({ path: javaPath, version: 'unknown', error: error.message });
                return;
            }
            // Java版本信息可能在stdout或stderr中
            const output = stdout || stderr;
            logToFile(`版本检测输出: ${output}`);
            const versionMatch = output.match(/version "(.+?)"/);
            const version = versionMatch ? versionMatch[1] : 'unknown';
            logToFile(`解析到的版本: ${version}`);
            resolve({ path: javaPath, version, output });
        });
    });
}

// 自动搜索Java路径
async function searchJavaOnSystem() {
    logToFile('开始系统Java搜索');
    const javaList = await findJRE();
    logToFile(`findJRE返回结果: ${JSON.stringify(javaList)}`);
    if (!Array.isArray(javaList) || javaList.includes('未找到JRE') || javaList.includes('无法获取磁盘列表')) {
        logToFile('Java列表无效或为空');
        return [];
    }
    // 并行检测所有Java版本
    const versionChecks = javaList.map(async (javaPath) => {        logToFile(`检查Java路径: ${javaPath}`);
        if (safeExistsSync(javaPath)) {
            // 检测版本并增强信息
            const versionInfo = await getJavaVersion(javaPath);
            if (versionInfo.version !== 'unknown') {
                // 读取版本输出日志
                const versionOutput = versionInfo.output || '';
                const info = parseJavaInfo(javaPath, versionInfo.version, versionOutput);
                return { ...versionInfo, ...info, path: javaPath };
            }
        }
        logToFile(`路径不存在: ${javaPath}`);
        return null;
    });
    const results = (await Promise.all(versionChecks))
        .filter(result => result && result.version !== 'unknown');
    logToFile(`搜索完成，找到 ${results.length} 个有效的Java安装`);
    return results;
}

let win = null;
let animationTimer = null;

// 默认配置
const defaultSettings = {
    theme: 'system',
    scale: 1,
    lang: 'zh',
    opacity: 100,
    defaultHome: 'settings',
    devMode: false,
    debugMode: false,
    logLevel: 'info',
    versionIsolation: 'none',
    gameFolder: '',
    cacheFolder: '',
    autoCleanDays: 7,
    cacheLimitValue: 1024,
    cacheLimitUnit: 'MB',
    memoryMode: 'auto',
    memorySize: 2048,
    javaConfig: 'auto',
    jvmArgs: '',
    highPerfGPU: false,
    downloadSource: 'official',
    threadLimit: 8,
    speedLimit: ''
}

// 获取配置文件路径 - 使用用户数据目录
const configPath = path.join(userDataPath, 'mc.ini')

// 动画函数 - 移到外部避免重复定义
function animateWindow(win, from, to, duration, onComplete) {
    if (animationTimer) {
        clearTimeout(animationTimer)
        animationTimer = null
    }

    const startTime = Date.now()

    function update() {
        const currentTime = Date.now()
        const elapsed = currentTime - startTime
        const progress = Math.min(elapsed / duration, 1)
        const eased = 1 - Math.pow(1 - progress, 3)

        const current = {
            width: Math.floor(from.width + (to.width - from.width) * eased),
            height: Math.floor(from.height + (to.height - from.height) * eased),
            x: Math.floor(from.x + (to.x - from.x) * eased),
            y: Math.floor(from.y + (to.y - from.y) * eased)
        }

        win.setBounds(current)

        if (progress < 1) {
            animationTimer = setTimeout(update, 1000 / 60)
        } else {
            animationTimer = null
            if (onComplete) onComplete()
        }
    }

    update()
}

function createWindow() {    
    const preloadPath = path.join(__dirname, 'preload.cjs');
    logToFile(`预加载脚本路径: ${preloadPath}`);
    logToFile(`预加载脚本是否存在: ${fs.existsSync(preloadPath)}`);
    
    win = new BrowserWindow({
        width: 1100,
        height: 690,
        frame: false,
        webPreferences: {
            preload: preloadPath,
            nodeIntegration: true,
            contextIsolation: true,
            enableRemoteModule: true,
            sandbox: false
        }
    })
    
    // 添加错误处理
    win.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        logToFile(`页面加载失败: ${errorCode} - ${errorDescription} - ${validatedURL}`);
        console.error('页面加载失败:', errorCode, errorDescription, validatedURL);
    });
    
    win.webContents.on('crashed', (event) => {
        logToFile('渲染进程崩溃');
        console.error('渲染进程崩溃');
    });
    
    // 根据环境加载页面
    if (isProd) {
        // 生产环境加载打包后的dist/index.html
        const indexPath = path.join(__dirname, 'dist/index.html');
        logToFile(`尝试加载文件: ${indexPath}`);
        logToFile(`文件是否存在: ${fs.existsSync(indexPath)}`);
        win.loadFile(indexPath).catch(err => {
            logToFile(`加载文件失败: ${err.message}`);
            console.error('加载文件失败:', err);
        });
    } else {
        // 开发环境加载Vite服务器
        logToFile('开发环境，加载 http://localhost:5173');
        win.loadURL('http://localhost:5173').catch(err => {
            logToFile(`加载URL失败: ${err.message}`);
            console.error('加载URL失败:', err);
        });
    }    // 开启开发者工具（调试模式）
    if (isProd) {
        // 在生产环境中也临时开启开发者工具进行调试
        // win.webContents.openDevTools()
    } else {
        win.webContents.openDevTools()
    }

    // 窗口最大化/最小化事件
    win.on('maximize', () => win.webContents.send('window-maximized'))
    win.on('unmaximize', () => win.webContents.send('window-unmaximized'))

    // 窗口移动动画逻辑
    let isMoving = false
    let originalSize = null

    win.on('will-move', () => {
        if (!isMoving) {
            isMoving = true
            const bounds = win.getBounds()
            originalSize = {
                width: bounds.width,
                height: bounds.height,
                x: bounds.x,
                y: bounds.y
            }
            win.webContents.send('window-move')
        }
    })

    win.on('moved', () => {
        if (isMoving && originalSize) {
            const currentBounds = win.getBounds()
            animateWindow(
                win,
                currentBounds,
                {
                    width: originalSize.width,
                    height: originalSize.height,
                    x: currentBounds.x,
                    y: currentBounds.y
                },
                150,
                () => {
                    isMoving = false
                    originalSize = null
                }
            )
            win.webContents.send('window-move-end')
        }
    })
}

// IPC事件监听
ipcMain.on('window-min', () => {
    logToFile('收到最小化窗口请求');
    if (win) {
        win.minimize();
        logToFile('窗口已最小化');
    } else {
        logToFile('错误：窗口对象不存在');
    }
})
ipcMain.on('window-max', () => {
    logToFile('收到最大化/还原窗口请求');
    if (win) {
        const wasMaximized = win.isMaximized();
        win.isMaximized() ? win.unmaximize() : win.maximize();
        logToFile(`窗口状态变更: ${wasMaximized ? '还原' : '最大化'}`);
    } else {
        logToFile('错误：窗口对象不存在');
    }
})
ipcMain.on('window-close', () => {
    logToFile('收到关闭窗口请求');
    if (win) {
        win.close();
        logToFile('窗口已关闭');
    } else {
        logToFile('错误：窗口对象不存在');
    }
})

// 文件选择对话框处理
ipcMain.handle('dialog:openFile', async (event, options) => {
    const result = await dialog.showOpenDialog(win, options);
    return result;
});

// 设置相关的IPC处理
ipcMain.handle('load-settings', () => {
    try {
        // 如果配置文件存在，直接读取
        if (fs.existsSync(configPath)) {
            const settings = JSON.parse(fs.readFileSync(configPath, 'utf8'))
            // 只补充缺失的设置项，不覆盖已有设置
            const fullSettings = { ...defaultSettings }
            // 遍历用户的设置，更新默认值
            Object.keys(settings).forEach(key => {
                if (key in defaultSettings) {
                    fullSettings[key] = settings[key]                }
            });
            return fullSettings
        } else {
            // 如果配置文件不存在，创建默认配置
            fs.writeFileSync(configPath, JSON.stringify(defaultSettings, null, 2))
            return defaultSettings
        }
    } catch (error) {
        logger.error('加载设置失败', error)
        return defaultSettings
    }
})

ipcMain.handle('save-settings', (event, settings) => {
    try {
        fs.writeFileSync(configPath, JSON.stringify(settings, null, 2));
        return true
    } catch (error) {
        logger.error('保存设置失败', error)
        return false
    }
})

// 解析主版本号和类型
function parseJavaInfo(javaPath, version, versionOutput) {
    let majorVersion = '未知';
    let type = 'JRE';
    // 1.8.x → 8，其他如 17.0.8 → 17
    if (version.startsWith('1.8')) {
        majorVersion = '8';
    } else {
        const m = version.match(/^(\d{1,2})\./);
        if (m) majorVersion = m[1];
    }
    // 路径优先判断 JDK/JRE
    const lower = javaPath.toLowerCase();
    if (lower.includes('jdk')) type = 'JDK';
    else if (lower.includes('jre')) type = 'JRE';
    // 版本输出兜底判断
    if (/jdk/i.test(versionOutput)) type = 'JDK';
    else if (/jre/i.test(versionOutput)) type = 'JRE';
    // 生成友好 displayName
    const displayName = `${type} ${majorVersion} (${version})  ${javaPath}`;
    return { type, majorVersion, displayName };
}

// IPC处理 - 搜索Java并保存配置
ipcMain.handle('searchJava', async () => {
    try {
        const results = await searchJavaOnSystem();
        // 保存找到的Java到配置文件
        for (const java of results) {
            if (java.version !== 'unknown') {
                saveJavaConfig(java.path, java.version, {
                    type: java.type,
                    majorVersion: java.majorVersion,
                    displayName: java.displayName
                });
            }
        }
        return results;
    } catch (error) {
        console.error('搜索Java失败:', error);
        return [];
    }
});

// 保存Java配置到mc.ini
function saveJavaConfig(javaPath, version, info) {
    try {
        let config = {};
        if (fs.existsSync('mc.ini')) {
            const content = fs.readFileSync('mc.ini', 'utf8');
            config = JSON.parse(content);
        }
        
        // 确保java配置部分存在
        if (!config.java) {
            config.java = { installations: [] };
        }
        
        // 检查是否已存在该路径
        const index = config.java.installations.findIndex(item => item.path === javaPath);
        // 准备完整的Java信息
        const javaInfo = {
            path: javaPath,
            version: version,
            type: info?.type || 'JRE',
            majorVersion: info?.majorVersion || '',
            displayName: info?.displayName || `${info?.type || 'JRE'} ${version} ${javaPath}`
        };
        
        if (index === -1) {
            config.java.installations.push(javaInfo);
        } else {
            config.java.installations[index] = javaInfo;
        }
        
        fs.writeFileSync('mc.ini', JSON.stringify(config, null, 2));
        return true;
    } catch (error) {
        console.error('保存Java配置失败:', error);
        return false;
    }
}

// 获取已保存的Java配置
function getJavaConfigs() {
    try {
        if (fs.existsSync('mc.ini')) {
            const content = fs.readFileSync('mc.ini', 'utf8');
            const config = JSON.parse(content);
            return config.java?.installations || [];
        }
        return [];
    } catch (error) {
        console.error('读取Java配置失败:', error);
        return [];
    }
}

// IPC处理 - 导入Java
ipcMain.handle('importJava', async (event, javaPath) => {
    const versionInfo = await getJavaVersion(javaPath);
    if (versionInfo.version !== 'unknown') {
        // 添加解析Java信息
        const versionOutput = versionInfo.output || '';
        const info = parseJavaInfo(javaPath, versionInfo.version, versionOutput);
        const fullInfo = { ...versionInfo, ...info };
        
        // 保存完整信息
        saveJavaConfig(javaPath, versionInfo.version, {
            type: info.type,
            majorVersion: info.majorVersion,
            displayName: info.displayName
        });
        
        return fullInfo;
    }
    return versionInfo;
});

// 检查管理员权限并提示
function isElevated() {
    // 仅在 Windows 下检测
    if (process.platform !== 'win32') return true;
    try {
        // whoami /groups | findstr S-1-16-12288 检查是否为高完整性级别
        const { execSync } = require('child_process');
        const output = execSync('whoami /groups', { encoding: 'utf8' });
        return output.includes('S-1-16-12288');
    } catch (e) {
        return false;
    }
}

// 判断是否为生产环境（打包后）
const isProd = process.defaultApp === undefined || process.env.NODE_ENV === 'production';

// 自动提权运行主进程（仅Windows下生效，且仅生产环境）
const Sudoer = require('electron-sudo').default || require('electron-sudo');

function relaunchAsAdminIfNeeded() {
    if (process.platform !== 'win32' || !isProd) return false;
    try {
        const { execSync } = require('child_process');
        const output = execSync('whoami /groups', { encoding: 'utf8' });
        if (!output.includes('S-1-16-12288')) {
            logToFile('检测到非管理员权限，尝试自动提权重启...');
            
            // 在打包环境中，直接使用当前可执行文件路径
            const executablePath = process.execPath;
            logToFile(`可执行文件路径: ${executablePath}`);
            
            const sudoer = new Sudoer({
                name: 'FLC For MC Launcher',
                icns: undefined,
                process: {
                    options: {
                        env: process.env
                    }
                }
            });
            
            // 直接启动当前的可执行文件
            sudoer.spawn(
                `"${executablePath}"`,
                { 
                    detached: true, 
                    stdio: 'ignore', 
                    shell: true 
                }
            ).then(() => {
                logToFile('提权启动成功，当前进程退出');
                app.quit();
            }).catch(error => {
                logToFile(`提权启动失败: ${error.message}`);
                // 如果提权失败，继续以普通权限运行
                return false;
            });
            
            return true;
        }
    } catch (e) {
        logToFile('自动提权检测失败: ' + e.message);
    }
    return false;
}

// 检查并自动提权
app.whenReady().then(() => {
    logToFile('应用程序已准备就绪');
    logToFile(`运行环境: ${isProd ? '生产环境' : '开发环境'}`);
    logToFile(`平台: ${process.platform}`);
    logToFile(`应用路径: ${__dirname}`);
    
    // 检查管理员权限但不强制提权，只记录状态
    if (process.platform === 'win32') {
        if (isElevated()) {
            logToFile('以管理员身份运行');
        } else {
            logToFile('以普通用户身份运行（部分功能可能需要管理员权限）');
        }
    }
      // 检查更新（仅生产环境）
    if (isProd && autoUpdater) {
        try {
            autoUpdater.checkForUpdatesAndNotify();
        } catch (e) {
            logToFile('检查更新失败: ' + e.message);
        }
    } else if (isProd) {
        logToFile('自动更新模块未可用');
    }

    logToFile('开始创建窗口');
    createWindow()

    app.on('activate', function () {
        logToFile('应用激活事件');
        if (BrowserWindow.getAllWindows().length === 0) {
            logToFile('没有打开的窗口，重新创建');
            createWindow()
        }
    })
}).catch(error => {
    logToFile(`应用初始化失败: ${error.message}`);
    console.error('应用初始化失败:', error);
})

app.on('window-all-closed', () => {
    logToFile('所有窗口已关闭');
    
    // 清理新的下载服务
    try {
        const newDownloadService = require('./src/services/NewMainDownloadService.cjs');
        newDownloadService.cleanup();
        logToFile('新下载服务已清理');
    } catch (error) {
        logToFile(`清理下载服务失败: ${error.message}`);
    }
    
    if (process.platform !== 'darwin') {
        logToFile('非macOS平台，准备退出应用');
        app.quit()
    }
})

app.on('before-quit', () => {
    logToFile('应用准备退出');
    
    // 清理新的下载服务
    try {
        const newDownloadService = require('./src/services/NewMainDownloadService.cjs');
        newDownloadService.cleanup();
        logToFile('下载服务清理完成');
    } catch (error) {
        logToFile(`下载服务清理失败: ${error.message}`);
    }
})

app.on('will-quit', (event) => {
    logToFile('应用即将退出');
})

app.on('quit', () => {
    logToFile('应用已退出');
})

// IPC处理 - 获取Java配置
ipcMain.handle('getJavaConfigs', () => {
    return getJavaConfigs();
});

// 账号管理相关函数
// 获取FFM.json文件路径 - 使用用户数据目录
const ffmJsonPath = path.join(userDataPath, 'FFM.json');

// 获取保存的账号列表
function getMinecraftAccounts() {
    try {
        // 优先从FFM.json读取
        if (fs.existsSync(ffmJsonPath)) {
            const content = fs.readFileSync(ffmJsonPath, 'utf8');
            const ffmData = JSON.parse(content);
            
            // 确保账号配置部分存在
            if (Array.isArray(ffmData.accounts)) {
                return ffmData.accounts;
            }
            
            // 如果FFM.json不符合预期结构，则尝试从mc.ini迁移
            if (fs.existsSync('mc.ini')) {
                const mcIniContent = fs.readFileSync('mc.ini', 'utf8');
                const mcConfig = JSON.parse(mcIniContent);
                if (Array.isArray(mcConfig.accounts)) {
                    // 创建FFM.json并写入数据
                    const ffmConfig = {
                        accounts: mcConfig.accounts,
                        selectedAccountId: mcConfig.selectedAccountId || null
                    };
                    fs.writeFileSync(ffmJsonPath, JSON.stringify(ffmConfig, null, 2));
                    return mcConfig.accounts;
                }
            }
            
            // 默认结构
            return [];
        } else if (fs.existsSync('mc.ini')) {
            // 尝试从mc.ini读取并迁移
            const content = fs.readFileSync('mc.ini', 'utf8');
            const config = JSON.parse(content);
            
            if (config.accounts) {
                // 创建FFM.json并写入数据
                const ffmConfig = {
                    accounts: config.accounts,
                    selectedAccountId: config.selectedAccountId || null
                };
                fs.writeFileSync(ffmJsonPath, JSON.stringify(ffmConfig, null, 2));
                return config.accounts;
            }
        }
        
        // 如果两个配置文件都不存在，则创建FFM.json
        const ffmConfig = {
            accounts: [],
            selectedAccountId: null
        };
        fs.writeFileSync(ffmJsonPath, JSON.stringify(ffmConfig, null, 2));
        return [];
    } catch (error) {
        console.error('读取账号配置失败:', error);
        logToFile(`读取账号配置失败: ${error.message}`);
        return [];
    }
}

// 保存账号配置
function saveMinecraftAccount(account) {
    try {
        let ffmConfig = {
            accounts: [],
            selectedAccountId: null
        };
        
        // 读取现有配置
        if (fs.existsSync(ffmJsonPath)) {
            const content = fs.readFileSync(ffmJsonPath, 'utf8');
            ffmConfig = JSON.parse(content);
            
            if (!Array.isArray(ffmConfig.accounts)) {
                ffmConfig.accounts = [];
            }
        }
        
        // 先检查是否已存在UUID相同的账号（Microsoft和第三方账号）
        if (account.uuid) {
            const uuidIndex = ffmConfig.accounts.findIndex(item => 
                item.uuid === account.uuid && 
                item.type === account.type
            );
            
            if (uuidIndex !== -1) {
                // 找到了相同UUID的账号，更新它
                logToFile(`发现相同UUID的账号，更新而不是创建新账号: ${account.username} (${account.uuid})`);
                const existingAccount = ffmConfig.accounts[uuidIndex];
                const addedTime = existingAccount.addedTime;
                
                // 更新账号，保留原ID和添加时间
                ffmConfig.accounts[uuidIndex] = {
                    ...account,
                    id: existingAccount.id,
                    addedTime: addedTime || Date.now()
                };
                
                // 写入配置
                fs.writeFileSync(ffmJsonPath, JSON.stringify(ffmConfig, null, 2));
                
                // 同时更新mc.ini来保持兼容性
                updateMcIniAccounts(ffmConfig.accounts, ffmConfig.selectedAccountId);
                
                return true;
            }
        }
        
        // 如果没有找到相同UUID的账号，再按ID检查
        const index = ffmConfig.accounts.findIndex(item => item.id === account.id);
        
        if (index === -1) {
            // 如果是新账号，为其添加ID和创建时间
            if (!account.id) {
                account.id = Date.now().toString();
            }
            if (!account.addedTime) {
                account.addedTime = Date.now();
            }
            ffmConfig.accounts.push(account);
        } else {
            // 更新现有账号，但保留创建时间
            const addedTime = ffmConfig.accounts[index].addedTime;
            ffmConfig.accounts[index] = {
                ...account,
                addedTime: addedTime || Date.now()
            };
        }
        
        // 写入配置
        fs.writeFileSync(ffmJsonPath, JSON.stringify(ffmConfig, null, 2));
        
        // 同时更新mc.ini来保持兼容性
        updateMcIniAccounts(ffmConfig.accounts, ffmConfig.selectedAccountId);
        
        return true;
    } catch (error) {
        console.error('保存账号配置失败:', error);
        logToFile(`保存账号配置失败: ${error.message}`);
        return false;
    }
}

// 删除账号
function deleteMinecraftAccount(accountId) {
    try {
        // 从FFM.json中删除
        let ffmConfig = {
            accounts: [],
            selectedAccountId: null
        };
        
        if (fs.existsSync(ffmJsonPath)) {
            const content = fs.readFileSync(ffmJsonPath, 'utf8');
            ffmConfig = JSON.parse(content);
            
            if (!Array.isArray(ffmConfig.accounts)) {
                ffmConfig.accounts = [];
                return false;
            }
            
            // 过滤掉要删除的账号
            ffmConfig.accounts = ffmConfig.accounts.filter(account => account.id !== accountId);
            
            // 如果删除的是当前选中的账号，重置selectedAccountId
            if (ffmConfig.selectedAccountId === accountId) {
                ffmConfig.selectedAccountId = ffmConfig.accounts.length > 0 ? ffmConfig.accounts[0].id : null;
            }
            
            fs.writeFileSync(ffmJsonPath, JSON.stringify(ffmConfig, null, 2));
            
            // 同步更新mc.ini
            updateMcIniAccounts(ffmConfig.accounts, ffmConfig.selectedAccountId);
            
            return true;
        }
        
        // 如果FFM.json不存在，尝试从mc.ini删除
        return deleteFromMcIni(accountId);
    } catch (error) {
        console.error('删除账号失败:', error);
        logToFile(`删除账号失败: ${error.message}`);
        return false;
    }
}

// 从mc.ini删除账号（兼容性功能）
function deleteFromMcIni(accountId) {
    try {
        if (fs.existsSync('mc.ini')) {
            const content = fs.readFileSync('mc.ini', 'utf8');
            const config = JSON.parse(content);
            
            if (!Array.isArray(config.accounts)) {
                return false;
            }
            
            // 过滤掉要删除的账号
            config.accounts = config.accounts.filter(account => account.id !== accountId);
            
            // 如果删除的是当前选中的账号，重置selectedAccountId
            if (config.selectedAccountId === accountId) {
                config.selectedAccountId = config.accounts.length > 0 ? config.accounts[0].id : null;
            }
            
            fs.writeFileSync('mc.ini', JSON.stringify(config, null, 2));
            return true;
        }
        return false;
    } catch (error) {
        console.error('从mc.ini删除账号失败:', error);
        return false;
    }
}

// 更新mc.ini中的账号（保持兼容性）
function updateMcIniAccounts(accounts, selectedAccountId) {
    try {
        if (fs.existsSync('mc.ini')) {
            const content = fs.readFileSync('mc.ini', 'utf8');
            const config = JSON.parse(content);
            
            config.accounts = accounts;
            if (selectedAccountId) {
                config.selectedAccountId = selectedAccountId;
            }
            
            fs.writeFileSync('mc.ini', JSON.stringify(config, null, 2));
        }
    } catch (error) {
        console.error('更新mc.ini账号数据失败:', error);
        logToFile(`更新mc.ini账号数据失败: ${error.message}`);
    }
}

// 获取当前选中的账号
function getSelectedAccount() {
    try {
        if (fs.existsSync(ffmJsonPath)) {
            const content = fs.readFileSync(ffmJsonPath, 'utf8');
            const ffmConfig = JSON.parse(content);
            
            if (ffmConfig.selectedAccountId && Array.isArray(ffmConfig.accounts)) {
                const selectedAccount = ffmConfig.accounts.find(account => account.id === ffmConfig.selectedAccountId);
                return selectedAccount || null;
            }
        }
        return null;
    } catch (error) {
        console.error('获取选中账号失败:', error);
        logToFile(`获取选中账号失败: ${error.message}`);
        return null;
    }
}

// 设置当前选中的账号
function setSelectedAccount(accountId) {
    try {
        if (fs.existsSync(ffmJsonPath)) {
            const content = fs.readFileSync(ffmJsonPath, 'utf8');
            const ffmConfig = JSON.parse(content);
            
            // 确保账号存在
            if (Array.isArray(ffmConfig.accounts) && 
                ffmConfig.accounts.some(account => account.id === accountId)) {
                ffmConfig.selectedAccountId = accountId;
                fs.writeFileSync(ffmJsonPath, JSON.stringify(ffmConfig, null, 2));
                
                // 同步更新mc.ini
                updateMcIniAccounts(ffmConfig.accounts, accountId);
                return true;
            }
        }        return false;
    } catch (error) {
        logger.error('设置选中账号失败', error);
        return false;
    }
}

// IPC处理 - 获取账号配置
ipcMain.handle('getMinecraftAccounts', () => {
    return getMinecraftAccounts();
});

// IPC处理 - 获取当前选中的账号
ipcMain.handle('getSelectedAccount', () => {
    return getSelectedAccount();
});

// IPC处理 - 设置当前选中的账号
ipcMain.handle('setSelectedAccount', (event, accountId) => {
    return setSelectedAccount(accountId);
});

// IPC处理 - 日志相关功能
ipcMain.handle('logToMain', async (event, logData) => {
    try {
        const { level, message, timestamp } = logData;
        const logMessage = `[${timestamp}] [${level}] ${message}`;
        
        // 根据级别输出到控制台
        switch (level.toUpperCase()) {
            case 'DEBUG':
                console.debug(`🔍 ${logMessage}`);
                break;
            case 'INFO':
                console.info(`ℹ️ ${logMessage}`);
                break;
            case 'WARN':
                console.warn(`⚠️ ${logMessage}`);
                break;
            case 'ERROR':
                console.error(`❌ ${logMessage}`);
                break;
            default:
                console.log(logMessage);
        }
          // 写入到文件
        const levelValue = LOG_LEVELS[level.toUpperCase()] || LOG_LEVELS.INFO;
        logger.log(levelValue, message);
        return { success: true };
    } catch (error) {
        console.error('处理渲染进程日志失败:', error);
        return { success: false, error: error.message };
    }
});

// IPC处理 - 获取日志内容
ipcMain.handle('getLogContent', async (event, lines = 100) => {
    try {
        return logger.getLogContent(lines);
    } catch (error) {
        console.error('获取日志内容失败:', error);
        return '';
    }
});

// IPC处理 - 清空日志文件
ipcMain.handle('clearLog', async () => {
    try {
        logger.clearLog();
        return { success: true };
    } catch (error) {
        console.error('清空日志文件失败:', error);
        return { success: false, error: error.message };
    }
});

// 清理重复账号
function cleanupDuplicateAccounts() {
    try {
        if (fs.existsSync(ffmJsonPath)) {
            logToFile(`开始清理重复账号...`);
            const content = fs.readFileSync(ffmJsonPath, 'utf8');
            const ffmConfig = JSON.parse(content);
            
            if (!Array.isArray(ffmConfig.accounts) || ffmConfig.accounts.length <= 1) {
                logToFile(`没有找到需要清理的账号`);
                return { success: true, message: '没有找到重复账号', removed: 0 };
            }
            
            // 用于记录已处理的UUID
            const processedUUIDs = new Map();
            // 用于存储保留的账号
            const uniqueAccounts = [];
            // 删除的账号数
            let removedCount = 0;
            
            for (const account of ffmConfig.accounts) {
                // 只对有UUID的账号（Microsoft、第三方）进行去重
                const key = account.uuid ? `${account.type}-${account.uuid}` : `${account.type}-${account.username}-${account.id}`;
                
                if (!account.uuid || !processedUUIDs.has(key)) {
                    // 这是首次出现的UUID，保留并记录
                    uniqueAccounts.push(account);
                    if (account.uuid) {
                        processedUUIDs.set(key, account.id);
                    }
                } else {
                    // 这是重复的UUID
                    logToFile(`发现重复账号: ${account.username} (${account.uuid})`);
                    removedCount++;
                    
                    // 如果被删除的是当前选中的账号，需要更新选中账号ID
                    if (ffmConfig.selectedAccountId === account.id) {
                        ffmConfig.selectedAccountId = processedUUIDs.get(key);
                        logToFile(`更新选中账号ID: ${ffmConfig.selectedAccountId}`);
                    }
                }
            }
            
            // 只有找到了重复账号才进行更新
            if (removedCount > 0) {
                ffmConfig.accounts = uniqueAccounts;
                fs.writeFileSync(ffmJsonPath, JSON.stringify(ffmConfig, null, 2));
                
                // 同时更新mc.ini来保持兼容性
                updateMcIniAccounts(ffmConfig.accounts, ffmConfig.selectedAccountId);
                
                logToFile(`成功清理 ${removedCount} 个重复账号`);
                return { success: true, message: `已清理 ${removedCount} 个重复账号`, removed: removedCount };
            }
            
            return { success: true, message: '没有找到重复账号', removed: 0 };
        }
        
        return { success: false, message: '配置文件不存在', removed: 0 };
    } catch (error) {
        logToFile(`清理重复账号失败: ${error.message}`);
        return { success: false, error: error.message, removed: 0 };
    }
}

// IPC处理 - 清理重复账号
ipcMain.handle('cleanupDuplicateAccounts', () => {
    return cleanupDuplicateAccounts();
});

// 刷新Minecraft账号令牌
async function refreshMinecraftAccount(account) {
    try {
        if (!account || account.type !== 'Microsoft' || !account.refreshToken) {
            return { success: false, error: '无效的账号或缺少刷新令牌' };
        }
        
        logToFile(`开始刷新账号 ${account.username} 的令牌`);
        
        // 使用验证服务刷新账号
        const updatedAccount = await minecraftAuthService.refreshAccount(account);
        
        // 保存更新后的账号信息
        saveMinecraftAccount(updatedAccount);
        
        logToFile(`成功刷新账号 ${updatedAccount.username} 的令牌`);
        
        return { success: true, account: updatedAccount };
    } catch (error) {
        logToFile(`刷新令牌失败: ${error.message}`);
        return { success: false, error: error.message };
    }
}

// IPC处理 - 刷新账号令牌
ipcMain.handle('refreshMinecraftAccount', async (event, accountId) => {
    try {
        // 获取账号信息
        const accounts = getMinecraftAccounts();
        const account = accounts.find(acc => acc.id === accountId);
        
        if (!account) {
            return { success: false, error: '找不到指定的账号' };
        }
        
        return await refreshMinecraftAccount(account);
    } catch (error) {
        logToFile(`处理刷新令牌请求失败: ${error.message}`);
        return { success: false, error: error.message };
    }
});

// 导入授权服务
const minecraftAuthService = require('./main-auth-service.cjs');

// IPC处理 - Microsoft登录流程
ipcMain.handle('startMicrosoftLogin', async () => {  
  try {
    // 记录日志
    logToFile('开始Microsoft登录流程');
      // 微软OAuth参数 - 使用Minecraft Launcher的客户端ID
    const clientId = "00000000402b5328"; // Minecraft官方客户端ID
    const redirectUrl = "https://login.live.com/oauth20_desktop.srf";
    const scope = "XboxLive.signin offline_access";
    
    // 构建授权URL - 添加prompt=select_account参数强制用户选择账号
    const authUrl = `https://login.live.com/oauth20_authorize.srf` + 
      `?client_id=${clientId}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(scope)}` +
      `&redirect_uri=${encodeURIComponent(redirectUrl)}` +
      `&prompt=select_account`; // 强制显示账号选择界面
      
    // 创建新的浏览器窗口用于OAuth登录
    const authWindow = new BrowserWindow({
      width: 800,
      height: 600,
      parent: win,
      modal: true,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        partition: `microsoft-login-${Date.now()}` // 使用唯一的会话分区
      }
    });
    
    // 隐藏菜单栏
    authWindow.setMenuBarVisibility(false);
    
    let authResult = null;
    
    // 监听URL变化，捕获授权码
    authWindow.webContents.on('will-navigate', (event, url) => {
      handleCallback(url);
    });
    
    authWindow.webContents.on('will-redirect', (event, url) => {
      handleCallback(url);
    });
      
    // 处理重定向URL
    function handleCallback(url) {
      if (url.startsWith(redirectUrl)) {
        // 检查URL中是否包含错误信息
        const errorMatch = /error=([^&]*)/.exec(url);
        const errorDescMatch = /error_description=([^&]*)/.exec(url);
        
        if (errorMatch && errorMatch.length > 1) {
          // 捕获错误信息
          const error = errorMatch[1];
          const errorDesc = (errorDescMatch && errorDescMatch.length > 1) 
            ? decodeURIComponent(errorDescMatch[1].replace(/\+/g, ' ')) 
            : '未知错误';
          
          logToFile(`OAuth错误: ${error} - ${errorDesc}`);
          authResult = { error, errorDesc };
          authWindow.close();
          return;
        }
        
        // 如果没有错误，尝试提取授权码
        const rawCode = /code=([^&]*)/.exec(url) || null;
        const code = (rawCode && rawCode.length > 1) ? rawCode[1] : null;
        
        if (code) {
          authResult = { code };
          authWindow.close();
        }
      }
    }
    
    // 窗口关闭事件
    authWindow.on('closed', async () => {
      try {
        // 检查是否有错误
        if (authResult && authResult.error) {
          logToFile(`Microsoft登录失败: ${authResult.error} - ${authResult.errorDesc}`);
          win.webContents.send('microsoft-login-error', { 
            error: authResult.error,
            description: authResult.errorDesc
          });
          return;
        }
        
        // 如果有授权码，则处理登录
        if (authResult && authResult.code) {
          logToFile('获取到授权码，正在进行Microsoft验证流程...');
          
          try {
            // 使用授权码完成完整的登录流程
            const account = await minecraftAuthService.completeLoginProcess(authResult.code);
            
            // 保存账号
            saveMinecraftAccount(account);
            
            // 通知渲染进程登录成功
            win.webContents.send('microsoft-login-success', account);
            
            logToFile(`Microsoft登录成功: ${account.username}`);
          } catch (error) {
            logToFile(`验证流程失败: ${error.message}`);
            win.webContents.send('microsoft-login-error', { 
              error: '验证失败', 
              description: error.message 
            });
          }
        } else {
          // 用户取消登录
          logToFile('用户取消了Microsoft登录');
          win.webContents.send('microsoft-login-cancelled');
        }
      } catch (err) {
        logToFile(`登录过程中出错: ${err.message}`);
        win.webContents.send('microsoft-login-error', { error: err.message });
      }
    });
    
    // 显示窗口并加载授权URL
    authWindow.loadURL(authUrl);
    // 登录弹窗动画：先缩小再弹性放大
    const targetBounds = { width: 800, height: 600 };
    const parentBounds = win.getBounds();
    const centerX = parentBounds.x + Math.floor((parentBounds.width - targetBounds.width) / 2);
    const centerY = parentBounds.y + Math.floor((parentBounds.height - targetBounds.height) / 2);
    authWindow.setBounds({ width: 100, height: 60, x: centerX + 350, y: centerY + 270 });
    authWindow.show();
    animateWindow(
      authWindow,
      { width: 100, height: 60, x: centerX + 350, y: centerY + 270 },
      { width: 800, height: 600, x: centerX, y: centerY },
      420 // 动画时长与设置同步，默认0.42s
    );

    authWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      logToFile(`页面加载失败: ${errorCode} - ${errorDescription}`);
      win.webContents.send('microsoft-login-error', { 
        error: 'page_load_failed',
        description: `页面加载失败: ${errorDescription}`
      });
      authWindow.close();
    });
    
    return { 
      success: true, 
      message: '正在进行Microsoft登录，请等待...',
      account: null // 账号将通过事件返回
    };    } catch (error) {
        logger.error('Microsoft登录失败', error);
        logger.info(`Microsoft登录失败: ${error.message}`);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('deleteMinecraftAccount', (event, accountId) => {
    return deleteMinecraftAccount(accountId);
});

// 示例：Device Code轮询错误处理（请将此片段集成到你的device code轮询逻辑中）
async function pollDeviceCodeStatus(pollFn, notifyError) {
  let shouldContinue = true;
  while (shouldContinue) {
    try {
      const result = await pollFn(); // pollFn应返回{error, ...}或{access_token, ...}
      if (result.access_token) {
        // 登录成功，处理access_token
        return result;
      }
      if (result.error) {
        if (result.error === 'authorization_pending' || result.error === 'slow_down') {
          // 继续轮询
          await new Promise(r => setTimeout(r, 2000));
        } else {
          // 其它错误，停止轮询并提示
          shouldContinue = false;
          notifyError(result.error, result.error_description || '未知错误');
          break;
        }
      }
    } catch (err) {
      shouldContinue = false;
      notifyError('exception', err.message);
      break;
    }
  }
}