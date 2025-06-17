<template>
  <div class="download-progress">
    <!-- 调试信息 -->
    <div class="debug-info">
      <div class="debug-item">组件版本: {{ downloadInfo.version }}</div>
      <div class="debug-item">数据源: 
        <span :class="['data-source', dataSource]">
          {{ dataSource === 'real' ? '真实数据' : dataSource === 'simulated' ? '模拟数据' : '等待中' }}
        </span>
      </div>
      <div class="debug-item">Electron API: {{ isElectronAvailable ? '可用' : '不可用' }}</div>
      <div class="debug-actions">
        <button class="debug-btn" @click="testDownload">测试下载</button>
        <button class="debug-btn" @click="clearData">清除数据</button>
      </div>
    </div>
    
    <!-- 顶部标题和总进度 -->
    <div class="header-bar">
      <div class="title-section">
        <h1 class="download-title">Minecraft {{ downloadInfo.version }} 安装中</h1>
        <div class="overall-progress">
          <div class="progress-bar-container">
            <div class="progress-bar" :style="{ width: progress.percent + '%' }"></div>
          </div>
          <span class="progress-text">{{ Math.round(progress.percent) }}%</span>
        </div>
      </div>
    </div>

    <!-- 主内容区域：左右分栏 -->
    <div class="main-layout">
      <!-- 左侧统计面板 -->
      <div class="left-panel">
        <div class="stat-item speed-stat">
          <div class="stat-icon">📊</div>
          <div class="stat-content">
            <div class="stat-label">下载速度</div>
            <div class="stat-value">{{ formatSpeed(progress.speed) }}</div>
          </div>
        </div>
        
        <div class="stat-item files-stat">
          <div class="stat-icon">📁</div>
          <div class="stat-content">
            <div class="stat-label">剩余文件</div>
            <div class="stat-value">{{ progress.fileStats.remaining }}个</div>
          </div>
        </div>
        
        <div class="stat-item size-stat">
          <div class="stat-icon">💾</div>
          <div class="stat-content">
            <div class="stat-label">已下载</div>
            <div class="stat-value">{{ formatSize(progress.downloadedBytes) }}</div>
          </div>
        </div>
        
        <div class="stat-item time-stat">
          <div class="stat-icon">⏱️</div>
          <div class="stat-content">
            <div class="stat-label">预计剩余</div>
            <div class="stat-value">{{ formatTime(progress.estimatedTime) }}</div>
          </div>
        </div>
      </div>

      <!-- 右侧文件列表面板 -->
      <div class="right-panel">
        <div class="panel-header">
          <h3>正在下载的文件</h3>
          <span class="active-count">{{ activeDownloads.length }}个活跃</span>
        </div>
        <div class="file-list">
          <div v-for="file in activeDownloads" :key="file.id" class="file-item">
            <div class="file-info">
              <div class="file-name" :title="file.name">{{ file.name }}</div>
              <div class="file-progress-container">
                <div class="file-progress-bar">
                  <div class="file-progress-fill" :style="{ width: file.progress + '%' }"></div>
                </div>
                <span class="file-progress-text">{{ file.progress }}%</span>
              </div>
            </div>
            <div class="file-stats">
              <div class="file-speed">{{ file.speed }}</div>
              <div class="file-size">{{ formatSize(file.size) }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 自动启动提示（如果需要手动启动） -->
    <div v-if="!isDownloadStarted && !isCompleted" class="start-prompt">
      <button class="start-btn" @click="startDownload">开始下载</button>
    </div>

    <!-- 错误信息 -->
    <div v-if="hasError" class="error-message">
      {{ statusMessage }}
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'

const router = useRouter()
const route = useRoute()

// 下载配置信息
const downloadInfo = ref({
  version: route.query.version || '1.20.5',
  loader: route.query.loader || 'vanilla',
  shader: route.query.shader || 'none'
})

// 下载进度数据
const progress = ref({
  percent: 0,
  speed: 0,
  downloadedBytes: 0,
  totalBytes: 0,
  estimatedTime: 0,
  fileStats: {
    remaining: 0,
    total: 0,
    completed: 0
  }
})

// 正在下载的文件列表（右侧显示）
const activeDownloads = ref([])

// 状态管理
const statusMessage = ref('正在初始化下载...')
const hasError = ref(false)
const isCompleted = ref(false)
const isDownloadStarted = ref(false)

// 实时更新定时器
let updateTimer = null
// 数据源标识
const dataSource = ref('none') // 'none', 'real', 'simulated'
// Electron API 可用性检查
const isElectronAvailable = ref(false)
// 下载开始时间
let startTime = 0

// 安全地检查 Electron API
function checkElectronAPI() {
  try {
    return !!(typeof window !== 'undefined' && window.electron && typeof window.electron === 'object')
  } catch (error) {
    console.warn('检查 Electron API 时出错:', error)
    return false
  }
}

// 格式化下载速度
function formatSpeed(bytesPerSecond) {
  if (!bytesPerSecond || bytesPerSecond === 0) {
    return '0B/s'
  }
  if (bytesPerSecond < 1024) {
    return `${bytesPerSecond.toFixed(0)}B/s`
  } else if (bytesPerSecond < 1024 * 1024) {
    return `${(bytesPerSecond / 1024).toFixed(1)}KB/s`
  } else {
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)}MB/s`
  }
}

// 格式化文件大小
function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0B'
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`
}

// 格式化剩余时间
function formatTime(seconds) {
  if (!seconds || seconds === 0) return '--'
  if (seconds < 60) return `${Math.round(seconds)}秒`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分${Math.round(seconds % 60)}秒`
  return `${Math.floor(seconds / 3600)}小时${Math.floor((seconds % 3600) / 60)}分钟`
}

// 开始下载
function startDownload() {
  console.log('开始下载...')
  isDownloadStarted.value = true
  statusMessage.value = '正在下载...'
  startTime = Date.now() // 记录开始时间
  
  const downloadParams = {
    version: downloadInfo.value.version,
    loader: downloadInfo.value.loader,
    shader: downloadInfo.value.shader
  }
  
  console.log('下载参数:', downloadParams)
  
  // 尝试调用主进程的下载服务
  if (isElectronAvailable.value && window.electron && window.electron.startDownload) {
    console.log('检测到electron API，尝试启动真实下载...')
    window.electron.startDownload(downloadParams)
      .then(() => {
        console.log('下载请求已发送到主进程')
        // 设置一个超时检查，如果5秒内没有收到真实数据，则启动模拟
        setTimeout(() => {
          if (progress.value.percent === 0 && progress.value.speed === 0) {
            console.warn('5秒内未收到真实下载进度，启动模拟下载显示')
            simulateDownload()
          }
        }, 5000)
      })
      .catch(error => {
        console.error('启动真实下载失败:', error)
        statusMessage.value = `启动下载失败: ${error.message || error}`
        hasError.value = true
        // 如果真实下载失败，立即启动模拟下载
        console.log('真实下载失败，启动模拟下载')
        simulateDownload()
      })
  } else {
    console.warn('electron API不可用，直接使用模拟下载')
    simulateDownload()
  }
}

// 模拟下载进度（用于测试）
function simulateDownload() {
  console.log('启动模拟下载...')
  dataSource.value = 'simulated'
  
  // 初始化模拟数据
  progress.value = {
    percent: 0,
    speed: 0,
    downloadedBytes: 0,
    totalBytes: 500 * 1024 * 1024, // 500MB
    estimatedTime: 0,
    fileStats: {
      remaining: 1000,
      total: 1000,
      completed: 0
    }
  }
  
  // 初始化文件列表
  activeDownloads.value = [
    { id: 1, name: 'minecraft-client-1.20.5.jar', speed: '0MB/s', progress: 0, size: 50 * 1024 * 1024 },
    { id: 2, name: 'lwjgl-opengl-3.3.2.jar', speed: '0MB/s', progress: 0, size: 8 * 1024 * 1024 },
    { id: 3, name: 'forge-47.2.0-installer.jar', speed: '0MB/s', progress: 0, size: 12 * 1024 * 1024 },
    { id: 4, name: 'assets/minecraft/sounds/ambient/cave1.ogg', speed: '0MB/s', progress: 0, size: 2 * 1024 * 1024 },
    { id: 5, name: 'libraries/commons-io-2.11.0.jar', speed: '0MB/s', progress: 0, size: 3 * 1024 * 1024 }
  ]
  
  updateTimer = setInterval(() => {
    if (progress.value.percent < 100) {
      // 更新总体进度
      const increment = Math.random() * 2 + 0.5 // 0.5-2.5%
      progress.value.percent = Math.min(progress.value.percent + increment, 100)
      
      // 更新下载速度（随机波动）
      const baseSpeed = 8 * 1024 * 1024 // 8MB/s 基础速度
      const variation = (Math.random() - 0.5) * 4 * 1024 * 1024 // ±4MB/s 变化
      progress.value.speed = Math.max(1024 * 1024, baseSpeed + variation) // 最小1MB/s
      
      // 更新已下载字节数
      progress.value.downloadedBytes = Math.floor((progress.value.percent / 100) * progress.value.totalBytes)
      
      // 更新剩余时间
      const remainingBytes = progress.value.totalBytes - progress.value.downloadedBytes
      progress.value.estimatedTime = remainingBytes / progress.value.speed
      
      // 更新文件统计
      progress.value.fileStats.completed = Math.floor((progress.value.percent / 100) * progress.value.fileStats.total)
      progress.value.fileStats.remaining = progress.value.fileStats.total - progress.value.fileStats.completed
      
      // 更新活跃文件列表
      activeDownloads.value.forEach((file, index) => {
        // 模拟不同文件的不同进度
        const fileProgress = Math.min(100, progress.value.percent + Math.random() * 20 - 10)
        file.progress = Math.max(0, Math.round(fileProgress))
        file.speed = formatSpeed(progress.value.speed * (0.8 + Math.random() * 0.4)) // 文件速度在总速度的80%-120%之间
        
        // 随机更换完成的文件
        if (file.progress >= 100 && Math.random() > 0.7) {
          const newFileNames = [
            'natives/lwjgl-windows-x64.jar',
            'assets/textures/block/stone.png',
            'assets/lang/zh_cn.json',
            'libraries/netty-all-4.1.77.jar',
            'assets/models/block/anvil.json',
            'libraries/gson-2.8.9.jar'
          ]
          const randomName = newFileNames[Math.floor(Math.random() * newFileNames.length)]
          file.name = randomName
          file.progress = Math.floor(Math.random() * 30) // 新文件从0-30%开始
          file.size = Math.floor(Math.random() * 10 * 1024 * 1024) + 1024 * 1024 // 1-10MB
        }
      })
      
      if (progress.value.percent >= 100) {
        isCompleted.value = true
        statusMessage.value = '下载完成！'
        clearInterval(updateTimer)
        updateTimer = null
      }
    }
  }, 500) // 每500ms更新一次，提供更流畅的体验
}

onMounted(() => {
  try {
    console.log('=== DownloadProgress 组件已挂载 ===')
    console.log('路由参数:', route.query)
    console.log('下载配置:', downloadInfo.value)
    
    // 检查 Electron API 可用性
    isElectronAvailable.value = checkElectronAPI()
    console.log('检查electron API可用性:', isElectronAvailable.value)
    
    // 检查是否需要自动启动下载
    const autoStart = route.query.autoStart === 'true'
    
    if (autoStart) {
      console.log('检测到自动启动标记，准备启动下载...')
      setTimeout(() => {
        startDownload()
      }, 500)
    } else {
      statusMessage.value = '请点击"开始下载"按钮启动下载'
      isDownloadStarted.value = false
    }
    
    // 设置下载进度监听
    if (isElectronAvailable.value && window.electron && window.electron.onDownloadProgress) {
      console.log('设置electron进度监听器...')
      window.electron.onDownloadProgress((data) => {
        console.log('收到下载进度数据:', data)
        
        // 如果有模拟定时器在运行，先清除它
        if (updateTimer) {
          console.log('收到真实数据，清除模拟定时器')
          clearInterval(updateTimer)
          updateTimer = null
        }
        
        // 标记为真实数据源
        dataSource.value = 'real'
        
        if (data.error) {
          statusMessage.value = `下载错误: ${data.error}`
          hasError.value = true
          return
        }
        
        if (data.complete) {
          progress.value.percent = 100
          statusMessage.value = '下载完成！'
          isCompleted.value = true
          return
        }
        
        // 更新进度信息
        if (data.percent !== undefined) {
          progress.value.percent = Math.max(0, Math.min(100, data.percent))
        }
        
        if (data.speed !== undefined) {
          progress.value.speed = data.speed
        }
        
        if (data.downloadedBytes !== undefined) progress.value.downloadedBytes = data.downloadedBytes
        if (data.totalBytes !== undefined) progress.value.totalBytes = data.totalBytes
        if (data.downloadedSize !== undefined) progress.value.downloadedBytes = data.downloadedSize
        if (data.totalSize !== undefined) progress.value.totalBytes = data.totalSize
        if (data.estimatedTime !== undefined) progress.value.estimatedTime = data.estimatedTime
        
        // 更新文件统计
        if (data.fileStats) {
          progress.value.fileStats = data.fileStats
        } else {
          // 根据其他数据推算文件统计
          if (data.totalFiles !== undefined) progress.value.fileStats.total = data.totalFiles
          if (data.downloadedFiles !== undefined) progress.value.fileStats.completed = data.downloadedFiles
          if (data.totalFiles && data.downloadedFiles) {
            progress.value.fileStats.remaining = data.totalFiles - data.downloadedFiles
          }
        }
        
        // 更新当前下载的文件
        if (data.file || data.currentFile) {
          const fileName = data.file || data.currentFile
          const fileSpeed = formatSpeed(progress.value.speed)
          const fileProgress = data.fileProgress || Math.round(progress.value.percent)
          const fileSize = data.fileSize || 0
          
          // 更新或添加文件到活跃下载列表
          const existingIndex = activeDownloads.value.findIndex(f => f.name === fileName)
          const fileInfo = {
            id: Date.now(),
            name: fileName,
            speed: fileSpeed,
            progress: fileProgress,
            size: fileSize
          }
          
          if (existingIndex >= 0) {
            activeDownloads.value[existingIndex] = fileInfo
          } else {
            activeDownloads.value.unshift(fileInfo)
            // 限制显示的文件数量
            if (activeDownloads.value.length > 6) {
              activeDownloads.value = activeDownloads.value.slice(0, 6)
            }
          }
        }
        
        // 更新状态消息
        if (data.status) {
          statusMessage.value = data.status
        } else if (data.step) {
          statusMessage.value = data.step
        }
      })
    } else {
      console.warn('electron API不可用，将在需要时使用模拟数据')
    }
  } catch (error) {
    console.error('DownloadProgress 组件初始化失败:', error)
    statusMessage.value = '组件初始化失败'
    hasError.value = true
  }
})

// 组件卸载时清理定时器
onUnmounted(() => {
  if (updateTimer) {
    clearInterval(updateTimer)
    updateTimer = null
  }
})

// 测试下载功能
function testDownload() {
  console.log('手动测试下载')
  if (!isDownloadStarted.value) {
    startDownload()
  } else {
    console.log('下载已在进行中')
  }
}

// 清除数据功能
function clearData() {
  console.log('清除下载数据')
  if (updateTimer) {
    clearInterval(updateTimer)
    updateTimer = null
  }
  
  // 重置所有状态
  progress.value = {
    percent: 0,
    speed: 0,
    downloadedBytes: 0,
    totalBytes: 0,
    estimatedTime: 0,
    fileStats: {
      remaining: 0,
      total: 0,
      completed: 0
    }
  }
  
  activeDownloads.value = []
  statusMessage.value = '已清除数据'
  hasError.value = false
  isCompleted.value = false
  isDownloadStarted.value = false
  dataSource.value = 'none'
}
</script>

<style scoped>
.download-progress {
  min-height: 100vh;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  padding: 20px;
  display: flex;
  flex-direction: column;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

/* 调试信息面板 */
.debug-info {
  position: fixed;
  top: 10px;
  left: 10px;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(10px);
  border-radius: 8px;
  padding: 12px;
  z-index: 9999;
  border: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 12px;
  min-width: 200px;
}

.debug-item {
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: 4px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.debug-item:last-child {
  margin-bottom: 0;
}

.data-source {
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 600;
  font-size: 11px;
}

.data-source.real {
  background: rgba(76, 175, 80, 0.2);
  color: #4caf50;
  border: 1px solid rgba(76, 175, 80, 0.3);
}

.data-source.simulated {
  background: rgba(255, 152, 0, 0.2);
  color: #ff9800;
  border: 1px solid rgba(255, 152, 0, 0.3);
}

.data-source.none {
  background: rgba(158, 158, 158, 0.2);
  color: #9e9e9e;
  border: 1px solid rgba(158, 158, 158, 0.3);
}

.debug-actions {
  margin-top: 8px;
  display: flex;
  gap: 8px;
}

.debug-btn {
  background: rgba(33, 150, 243, 0.2);
  color: #2196f3;
  border: 1px solid rgba(33, 150, 243, 0.3);
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.debug-btn:hover {
  background: rgba(33, 150, 243, 0.3);
  border-color: rgba(33, 150, 243, 0.5);
}

/* 顶部标题栏 */
.header-bar {
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(20px);
  border-radius: 16px;
  padding: 24px 32px;
  margin-bottom: 20px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.title-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.download-title {
  font-size: 32px;
  font-weight: 700;
  color: #ffffff;
  margin: 0;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
  background: linear-gradient(135deg, #64b5f6, #42a5f5);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.overall-progress {
  display: flex;
  align-items: center;
  gap: 16px;
}

.progress-bar-container {
  flex: 1;
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  overflow: hidden;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.2);
}

.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #4caf50, #66bb6a, #81c784);
  border-radius: 4px;
  transition: width 0.3s ease;
  box-shadow: 0 0 10px rgba(76, 175, 80, 0.5);
}

.progress-text {
  font-size: 20px;
  font-weight: 600;
  color: #ffffff;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  min-width: 60px;
}

/* 主布局：左右分栏 */
.main-layout {
  display: flex;
  gap: 20px;
  flex: 1;
}

/* 左侧统计面板 */
.left-panel {
  flex: 0 0 320px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.stat-item {
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(20px);
  border-radius: 16px;
  padding: 20px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  gap: 16px;
  transition: all 0.3s ease;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
}

.stat-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  background: rgba(255, 255, 255, 0.12);
}

.stat-icon {
  font-size: 28px;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  flex-shrink: 0;
}

.speed-stat .stat-icon {
  background: linear-gradient(135deg, #2196f3, #1976d2);
}

.files-stat .stat-icon {
  background: linear-gradient(135deg, #ff9800, #f57c00);
}

.size-stat .stat-icon {
  background: linear-gradient(135deg, #9c27b0, #7b1fa2);
}

.time-stat .stat-icon {
  background: linear-gradient(135deg, #4caf50, #388e3c);
}

.stat-content {
  flex: 1;
}

.stat-label {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 4px;
  font-weight: 500;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #ffffff;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

/* 右侧文件列表面板 */
.right-panel {
  flex: 1;
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(20px);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 0;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.panel-header {
  padding: 20px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(255, 255, 255, 0.05);
}

.panel-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #ffffff;
}

.active-count {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.7);
  background: rgba(76, 175, 80, 0.2);
  padding: 4px 12px;
  border-radius: 12px;
  border: 1px solid rgba(76, 175, 80, 0.3);
}

.file-list {
  height: calc(100% - 80px);
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.file-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 16px 20px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  transition: all 0.3s ease;
}

.file-item:hover {
  background: rgba(255, 255, 255, 0.1);
  transform: translateX(4px);
  border-color: rgba(255, 255, 255, 0.15);
}

.file-info {
  flex: 1;
  margin-right: 16px;
}

.file-name {
  font-size: 14px;
  color: #ffffff;
  margin-bottom: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.file-progress-container {
  display: flex;
  align-items: center;
  gap: 8px;
}

.file-progress-bar {
  flex: 1;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
}

.file-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #4caf50, #66bb6a);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.file-progress-text {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
  min-width: 35px;
  text-align: right;
}

.file-stats {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.file-speed {
  font-size: 14px;
  font-weight: 600;
  color: #4caf50;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.file-size {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

/* 开始下载按钮 */
.start-prompt {
  text-align: center;
  margin-top: 20px;
}

.start-btn {
  background: linear-gradient(135deg, #4caf50, #66bb6a);
  color: white;
  border: none;
  border-radius: 25px;
  padding: 16px 48px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 20px rgba(76, 175, 80, 0.4);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.start-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(76, 175, 80, 0.5);
  background: linear-gradient(135deg, #66bb6a, #4caf50);
}

.start-btn:active {
  transform: translateY(0);
}

/* 错误信息 */
.error-message {
  background: rgba(244, 67, 54, 0.1);
  border: 1px solid rgba(244, 67, 54, 0.3);
  color: #ff5252;
  border-radius: 12px;
  padding: 16px 20px;
  margin-top: 20px;
  text-align: center;
  backdrop-filter: blur(10px);
  font-weight: 500;
}

/* 滚动条样式 */
.file-list::-webkit-scrollbar {
  width: 6px;
}

.file-list::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 3px;
}

.file-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
  transition: background 0.3s ease;
}

.file-list::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.4);
}

/* 响应式设计 */
@media (max-width: 1024px) {
  .main-layout {
    flex-direction: column;
  }
  
  .left-panel {
    flex: none;
    flex-direction: row;
    overflow-x: auto;
    gap: 12px;
    padding-bottom: 10px;
  }
  
  .stat-item {
    min-width: 200px;
    flex-shrink: 0;
  }
}

@media (max-width: 768px) {
  .download-progress {
    padding: 16px;
  }
  
  .header-bar {
    padding: 20px;
  }
  
  .download-title {
    font-size: 24px;
  }
  
  .progress-text {
    font-size: 16px;
  }
  
  .left-panel {
    flex-direction: column;
  }
  
  .stat-item {
    min-width: auto;
    padding: 16px;
  }
  
  .stat-value {
    font-size: 20px;
  }
  
  .overall-progress {
    flex-direction: column;
    gap: 12px;
  }
  
  .progress-bar-container {
    order: 2;
  }
  
  .progress-text {
    order: 1;
  }
}

/* 动画效果 */
@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}

.file-item:nth-child(even) {
  animation: pulse 2s infinite;
}

.file-item:nth-child(odd) {
  animation: pulse 2s infinite 0.5s;
}
</style>
