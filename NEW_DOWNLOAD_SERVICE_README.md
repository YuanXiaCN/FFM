# 新下载服务重写说明

## 概述

本次重写完全替换了原有的臃肿下载服务，使用全新的模块化架构，基于BMCLAPI镜像源，支持智能多线程下载和自适应并发控制。

## 主要特性

### 🚀 核心功能
- **基于BMCLAPI优先**：优先使用BMCLAPI镜像源，显著提升下载速度
- **智能多线程下载**：大于10MB的文件自动启用多线程下载（4线程）
- **自适应并发控制**：最多32并发，根据网络效率自动调整（4-32）
- **完整性自动检查**：SHA1哈希验证 + 文件大小验证
- **错误自动重试**：每个文件最多重试3次，失败后自动修复
- **实时进度反馈**：详细的下载进度和状态信息

### 🛠️ 技术改进
- **模块化设计**：各组件职责分离，易于维护
- **内存优化**：减少内存占用，避免内存泄漏
- **错误处理**：完善的错误处理和用户反馈机制
- **兼容性**：保持前端API兼容性

## 架构设计

### 核心组件

1. **NewDownloadManager** (`src/services/NewDownloadManager.cjs`)
   - 核心下载管理器
   - 支持多线程下载和并发控制
   - 自适应网络效率调整

2. **NewBMCLAPIManager** (`src/services/NewBMCLAPIManager.cjs`)
   - BMCLAPI镜像源管理
   - URL转换和源切换
   - 版本数据获取

3. **NewIntegrityService** (`src/services/NewIntegrityService.cjs`)
   - 文件完整性检查
   - 自动修复损坏文件
   - SHA1验证

4. **NewGameInitService** (`src/services/NewGameInitService.cjs`)
   - 游戏版本初始化
   - 目录结构创建
   - 配置文件生成

5. **NewMainDownloadService** (`src/services/NewMainDownloadService.cjs`)
   - 主下载服务
   - IPC通信处理
   - 事件管理

## 使用方法

### 前端API（已更新preload.cjs）

```javascript
// 获取可用版本
const versions = await window.electronAPI.getVersions('release');

// 开始下载版本
const result = await window.electronAPI.startDownload({
  versionId: '1.21.4',
  downloadOptions: {
    maxMemory: 4096,
    minMemory: 1024,
    javaPath: 'java'
  }
});

// 监听下载进度
window.electronAPI.onDownloadProgress((progress) => {
  console.log(`下载进度: ${progress.totalProgress}%`);
  console.log(`当前速度: ${progress.currentSpeed} bytes/s`);
  console.log(`已下载: ${progress.downloadedFiles}/${progress.totalFiles} 文件`);
});

// 监听下载状态
window.electronAPI.onDownloadStatus((status) => {
  console.log(`状态: ${status.status} - ${status.message}`);
});

// 监听下载完成
window.electronAPI.onDownloadCompleted((result) => {
  if (result.success) {
    console.log('下载完成!');
  } else {
    console.log('下载失败:', result.message);
  }
});

// 监听错误
window.electronAPI.onDownloadShowError((errorData) => {
  // 显示错误对话框
  console.log('下载错误:', errorData);
});

// 暂停/恢复下载
await window.electronAPI.pauseDownload();
await window.electronAPI.resumeDownload();

// 停止下载
await window.electronAPI.stopDownload();

// 检查完整性
const integrityResult = await window.electronAPI.checkIntegrity('1.21.4');

// 修复版本
const repairResult = await window.electronAPI.repairVersion('1.21.4');
```

### 下载进度数据格式

```javascript
{
  totalProgress: 75,              // 总进度百分比
  currentSpeed: 1024000,          // 当前速度 bytes/s
  downloadedFiles: 150,           // 已下载文件数
  totalFiles: 200,               // 总文件数
  downloadedSize: 50000000,      // 已下载字节数
  totalSize: 67000000,           // 总字节数
  activeTasks: 8,                // 活跃下载任务数
  queuedTasks: 42,               // 队列中任务数
  failedTasks: 0,                // 失败任务数
  estimatedTime: 120,            // 预计剩余时间（秒）
  currentFile: {                 // 当前下载文件信息
    name: "client.jar",
    progress: 45,
    speed: 512000,
    size: 25000000
  }
}
```

## 配置说明

### 下载配置
- **最大并发数**: 32（可自动调整至4-32）
- **多线程阈值**: 10MB
- **每个大文件线程数**: 4
- **重试次数**: 3
- **重试延迟**: 1秒（递增）

### 文件存放位置
```
.minecraft/
├── versions/
│   ├── {版本名}/
│   │   ├── {版本名}.jar      # 客户端JAR
│   │   └── {版本名}.json     # 版本配置
│   ├── natives/              # Native库文件
│   └── version.json          # 版本列表
├── libraries/                # 依赖库
├── assets/
│   ├── objects/             # 资源文件
│   └── indexes/             # 资源索引
└── launcher_profiles.json   # 启动器配置
```

## 错误处理

### 自动重试机制
- 每个文件最多重试3次
- 重试延迟递增（1秒、2秒、3秒）
- 失败后自动切换到官方源重试

### 完整性检查
- SHA1哈希验证
- 文件大小验证
- 自动删除损坏文件并重新下载

### 错误反馈
- 详细的错误日志
- 用户友好的错误提示
- 导出错误日志功能
- 反馈渠道

## 测试

运行测试脚本验证服务：

```bash
node test-new-download-service.cjs
```

测试包括：
- BMCLAPI连接测试
- 版本数据获取测试
- 下载任务生成测试
- 各组件初始化测试

## 迁移说明

### 已替换的文件
- `main-download-service.cjs` → 使用新的下载服务
- `src/services/AdvancedDownloadManager.cjs` → `NewDownloadManager.cjs`
- `src/services/DownloadSourceManager.cjs` → `NewBMCLAPIManager.cjs`
- `src/services/IntegrityAndRepairService.cjs` → `NewIntegrityService.cjs`

### 兼容性
- 前端API保持兼容（已更新preload.cjs）
- 配置文件格式保持不变
- 现有版本文件无需重新下载

## 注意事项

1. **首次运行**：新服务会自动初始化，无需手动配置
2. **网络环境**：BMCLAPI在中国大陆地区速度更快
3. **内存使用**：多线程下载会增加内存使用，但已优化
4. **磁盘空间**：确保有足够磁盘空间存放临时文件

## 故障排除

### 常见问题

1. **BMCLAPI连接失败**
   - 自动切换到官方源
   - 检查网络连接

2. **下载速度慢**
   - 自动调整并发数
   - 检查网络带宽

3. **文件验证失败**
   - 自动重新下载
   - 检查磁盘空间

### 日志位置
- 主日志：应用程序日志
- 下载日志：控制台输出
- 错误日志：可导出查看

## 开发说明

### 添加新功能
1. 在对应的服务组件中添加方法
2. 在`NewMainDownloadService.cjs`中添加IPC处理
3. 在`preload.cjs`中添加前端API
4. 更新测试脚本

### 调试模式
设置环境变量启用详细日志：
```bash
DEBUG=download npm run electron:dev
```

---

**重写完成！新的下载服务已就绪，具备更好的性能、稳定性和用户体验。**
