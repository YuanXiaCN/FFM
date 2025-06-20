// 紧急修复配置 - 用于解决下载过程中的响应问题
// 临时禁用可能导致阻塞的功能

module.exports = {
  // 下载配置
  download: {
    // 降低并发数，避免系统过载
    maxConcurrentFiles: 8,
    maxThreadsPerFile: 2,
    chunkSize: 2 * 1024 * 1024, // 2MB
    
    // 进度更新频率限制
    progressThrottleMs: 500,
    
    // 禁用一些可能造成阻塞的功能
    disableRealTimeValidation: true,
    skipIntegrityCheckDuringDownload: true
  },
  
  // 完整性检查配置
  integrity: {
    // 暂时禁用完整性检查
    enabled: false,
    
    // 如果启用，使用较少的资源
    maxConcurrentChecks: 2,
    checksumTimeout: 10000 // 10秒超时
  },
  
  // 日志配置
  logging: {
    // 启用详细日志
    debugLevel: true,
    
    // 记录下载进度每个步骤
    logEveryMB: true,
    
    // 记录网络请求详情
    logNetworkRequests: true,
      // 记录文件操作
    logFileOperations: true,
    
    // 记录队列操作
    logQueueOperations: true,
    
    // 减少日志输出
    reduceVerbosity: true,
    maxLogSize: 1024 * 1024 // 1MB
  },
  
  // 下载完成检查配置
  completion: {
    // 强制使用活跃任务计数而不是依赖getStats()
    useTaskCounting: true,
    // 检查间隔（毫秒）
    checkInterval: 1000,
    // 最大等待时间（毫秒）
    maxWaitTime: 30 * 60 * 1000,
    // 卡死检测时间（毫秒）
    hangDetectionTime: 5 * 60 * 1000
  }
};
