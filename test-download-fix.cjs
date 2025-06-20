// 测试修复后的下载管理器
const { AdvancedDownloadManager } = require('./src/services/AdvancedDownloadManager.cjs');
const path = require('path');

async function testDownloadManager() {
  console.log('🧪 测试修复后的下载管理器...');
  
  const downloadManager = new AdvancedDownloadManager({
    maxConcurrentFiles: 4,
    enableAdaptiveConcurrency: true,
    tempDir: path.join(__dirname, 'temp')
  });
  
  // 监听事件
  downloadManager.on('taskStarted', (task) => {
    console.log(`✅ 任务开始: ${task.id} - ${path.basename(task.dest)}`);
  });
  
  downloadManager.on('taskCompleted', (task) => {
    console.log(`✅ 任务完成: ${task.id} - ${path.basename(task.dest)}`);
  });
  
  downloadManager.on('taskFailed', (task, error) => {
    console.log(`❌ 任务失败: ${task.id} - ${error.message}`);
  });
  
  downloadManager.on('progress', (data) => {
    const { totalProgress, stats } = data;
    if (Math.floor(totalProgress) % 10 === 0) {
      console.log(`📊 总进度: ${totalProgress.toFixed(1)}% (${stats.completedFiles}/${stats.totalFiles})`);
    }
  });
  
  // 添加一些测试任务（使用公共API）
  const testTasks = [
    {
      id: 'test-1',
      url: 'https://httpbin.org/bytes/1024',
      dest: path.join(__dirname, 'temp', 'test-1.bin'),
      size: 1024,
      expectedSha1: null,
      priority: 1
    },
    {
      id: 'test-2',
      url: 'https://httpbin.org/bytes/2048', 
      dest: path.join(__dirname, 'temp', 'test-2.bin'),
      size: 2048,
      expectedSha1: null,
      priority: 2
    },
    {
      id: 'test-3',
      url: 'https://httpbin.org/bytes/1024',
      dest: path.join(__dirname, 'temp', 'test-3.bin'),
      size: 1024,
      expectedSha1: null,
      priority: 1
    }
  ];
  
  console.log('📋 添加测试任务...');
  testTasks.forEach(task => {
    downloadManager.addTask(task);
  });
  
  // 测试重复任务（应该被过滤）
  console.log('🔄 测试重复任务过滤...');
  downloadManager.addTask(testTasks[0]); // 重复任务
  
  // 等待完成
  let completed = false;
  downloadManager.on('allCompleted', () => {
    completed = true;
    console.log('🎉 所有任务完成！');
  });
  
  // 定期检查状态
  const checkInterval = setInterval(() => {
    const stats = downloadManager.getStats();
    console.log(`📈 状态检查 - 活跃: ${stats.activeFiles}, 队列: ${stats.queuedFiles}, 完成: ${stats.completedFiles}, 失败: ${stats.failedFiles}`);
    
    if (stats.completedFiles + stats.failedFiles >= testTasks.length) {
      clearInterval(checkInterval);
      completed = true;
    }
  }, 2000);
  
  // 最大等待时间
  setTimeout(() => {
    if (!completed) {
      console.log('⏰ 测试超时，强制结束');
      clearInterval(checkInterval);
      completed = true;
    }
  }, 30000);
  
  // 等待测试完成
  while (!completed) {
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  const finalStats = downloadManager.getStats();
  console.log('📊 最终统计:', finalStats);
  console.log('✅ 测试完成');
}

// 运行测试
if (require.main === module) {
  testDownloadManager().catch(console.error);
}

module.exports = { testDownloadManager };
