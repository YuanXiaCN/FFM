<template>
  <div class="download-progress">    <!-- 调试信息 -->
    <div class="debug-info">
      <div class="debug-item">组件版本: {{ downloadInfo.version }}</div>
      <div class="debug-item">数据源: 
        <span :class="['data-source', dataSource]">
          {{ dataSource === 'real' ? '真实数据' : dataSource === 'simulated' ? '模拟数据' : '等待中' }}
        </span>
      </div>
      <div class="debug-item">Electron API: {{ isElectronAvailable ? '可用' : '不可用' }}</div>
      <div class="debug-item">节流状态: 
        <span :class="['throttle-status', throttleTimer ? 'active' : 'idle']">
          {{ throttleTimer ? '节流中' : '空闲' }}
        </span>      </div>      <div class="debug-item">活跃文件: {{ activeDownloads.length }}/{{ displayLimit }}</div>
      <div class="debug-item">队列状态: {{ queueStatusText }}</div>
      <div class="debug-item">日志数量: {{ consoleLogCount }}/{{ MAX_CONSOLE_LOGS }}</div>
      <div class="debug-item">当前速度: {{ formatSpeed(progress.speed) }}</div>
      <div class="debug-item">平均文件速度: {{ avgFileSpeedText }}</div>
      <div class="debug-item">数据更新频率: {{ updateFrequency }}次/秒</div>
      <div class="debug-item">最后更新: {{ lastUpdateTimeText }}</div>      <div class="debug-item">
        显示限制: 
        <select v-model="displayLimit" class="debug-select">
          <option :value="5">5个文件</option>
          <option :value="8">8个文件</option>
          <option :value="12">12个文件</option>
          <option :value="16">16个文件</option>
          <option :value="24">24个文件</option>
          <option :value="32">32个文件</option>
          <option :value="48">48个文件（全部）</option>
        </select>
      </div>
      <div class="debug-item">并发控制: {{ bandwidthInfo }}</div>
      <div class="debug-item">建议并发: {{ concurrencyRecommendation }}</div>
      <div class="debug-item">
        手动调整: 
        <input type="number" v-model="manualConcurrency" min="4" max="48" class="debug-input" style="width: 60px;">
        <button class="debug-btn-small" @click="applyConcurrency">应用</button>
      </div>      <div class="debug-actions">
        <button class="debug-btn" @click="testDownload">测试下载</button>
        <button class="debug-btn" @click="clearData">清除数据</button>
        <button class="debug-btn" @click="forceGC">强制GC</button>
        <button class="debug-btn" @click="testSpeedUpdate">测速度</button>
        <button class="debug-btn" @click="requestMainProcessInfo">主进程信息</button>
        <button class="debug-btn" @click="resetDownloadStats">重置统计</button>
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
            <div class="stat-value">{{ formatSize(progress.downloadedBytes) }} / {{ formatSize(progress.totalBytes) }}</div>
          </div>
        </div>
        
        <div class="stat-item time-stat">
          <div class="stat-icon">⏱️</div>
          <div class="stat-content">
            <div class="stat-label">剩余时间</div>
            <div class="stat-value">{{ formatTime(progress.estimatedTime) }}</div>
          </div>
        </div>
      </div>

      <!-- 右侧文件列表 -->
      <div class="right-panel">        <div class="panel-header">
          <h3>正在下载的文件</h3>
          <span class="file-count">{{ queueStatusText }}</span>
        </div>
        
        <div class="file-list">
          <div v-if="activeDownloads.length === 0" class="no-files">
            <div class="no-files-icon">📭</div>
            <div class="no-files-text">暂无下载文件</div>
          </div>
            <div 
            v-for="file in activeDownloads" 
            :key="file.id" 
            class="file-item"
            :class="{ 'downloading': file.progress > 0, 'waiting': file.progress === 0 }"
          >
            <div class="file-info">
              <div class="file-name" :title="file.name">
                <span class="status-indicator" :class="file.progress > 0 ? 'active' : 'waiting'"></span>
                {{ file.name }}
              </div>
              <div class="file-details">
                <span class="file-size">{{ formatSize(file.size) }}</span>
                <span class="file-speed">{{ file.speed }}</span>
              </div>
            </div>
            <div class="file-progress">
              <div class="progress-bar-small">
                <div 
                  class="progress-fill" 
                  :style="{ width: file.progress + '%' }"
                  :class="{ 'active': file.progress > 0 }"
                ></div>
              </div>
              <span class="progress-percent">{{ file.progress }}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>    <!-- 底部状态栏 -->
    <div class="footer-bar">
      <div class="status-section">
        <div class="status-text" :class="{ error: hasError, completed: isCompleted }">
          {{ statusMessage }}
        </div>
        
        <!-- 完整性检查状态 -->
        <div v-if="integrityStatus.isChecking" class="integrity-status">
          <div class="integrity-icon">🔍</div>
          <div class="integrity-info">
            <div class="integrity-message">{{ integrityStatus.message }}</div>
            <div class="integrity-progress">
              <div class="mini-progress-bar">
                <div class="mini-progress-fill" :style="{ width: integrityStatus.progress + '%' }"></div>
              </div>
              <span class="integrity-percent">{{ integrityStatus.progress }}%</span>
            </div>
          </div>
        </div>
      </div>
      
      <div class="action-section">
        <button 
          v-if="!isDownloadStarted && !isCompleted" 
          class="action-btn start-btn"
          @click="startDownload"
        >
          开始下载
        </button>
        
        <button 
          v-if="isDownloadStarted && !isCompleted" 
          class="action-btn pause-btn"
          @click="pauseDownload"
        >
          暂停下载
        </button>
        
        <button 
          v-if="isCompleted" 
          class="action-btn complete-btn"
          @click="goToHome"
        >
          完成
        </button>
        
        <button 
          v-if="hasError" 
          class="action-btn retry-btn"
          @click="retryDownload"
        >
          重试
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

// 响应式数据
const isElectronAvailable = ref(false)
const dataSource = ref('waiting')
const downloadInfo = ref({
  version: route.query.version || '1.21.6',
  loader: route.query.loader || 'vanilla'
})

const progress = ref({
  percent: 0,
  speed: 0,
  downloadedBytes: 0,
  totalBytes: 0,
  estimatedTime: 0,
  fileStats: {
    total: 0,
    completed: 0,
    remaining: 0
  }
})

const activeDownloads = ref([])
const statusMessage = ref('准备下载...')
const isDownloadStarted = ref(false)
const isCompleted = ref(false)
const hasError = ref(false)

// 完整性检查状态
const integrityStatus = ref({
  isChecking: false,
  type: '',
  message: '',
  progress: 0,
  details: null
})

let updateTimer = null

// 节流相关变量
let lastUpdateTime = 0
let pendingUpdateData = null
const throttleTimer = ref(null)
const THROTTLE_INTERVAL = 500 // 500ms节流间隔

// 性能监控相关
const updateCount = ref(0)
const updateFrequency = ref(0)
const lastUpdateTimeText = ref('未更新')
let updateCountResetTimer = null

// 事件监听器引用，用于清理
let progressHandler = null
let taskStartedHandler = null
let taskCompletedHandler = null

// 内存优化：限制文件列表最大长度
const MAX_ACTIVE_DOWNLOADS = 48 // 增加到48个，与主进程并发数一致
const MAX_CONSOLE_LOGS = 50
const consoleLogCount = ref(0)

// 动态显示限制
const displayLimit = ref(12) // 默认显示12个文件，平衡性能和可视性

// 新增：48线程优化相关数据
const mainProcessInfo = ref({
  maxConcurrent: 48,
  currentConcurrency: 12,
  efficiency: 0,
  adaptiveEnabled: true
})

const concurrencyRecommendation = ref('获取中...')
const manualConcurrency = ref(12)
const performanceStats = ref({
  bandwidth: {},
  tasks: {}
})

// 队列状态信息
const queueInfo = ref({
  downloadingCount: 0,
  queuedCount: 0,
  totalActiveCount: 0
})

// 优化的日志函数
function debugLog(message, data = null) {
  if (consoleLogCount.value < MAX_CONSOLE_LOGS) {
    if (data) {
      console.log(message, data)
    } else {
      console.log(message)
    }
    consoleLogCount.value++
  }
}

// 计算平均文件速度
const avgFileSpeedText = computed(() => {
  if (activeDownloads.value.length === 0) return '无数据'
  
  const totalSpeed = activeDownloads.value.reduce((sum, file) => {
    // 从速度文本中提取数值
    const speedText = file.speed
    if (!speedText || speedText === '0B/s') return sum
    
    const match = speedText.match(/([\d.]+)(KB|MB|GB)\/s/)
    if (match) {
      const value = parseFloat(match[1])
      const unit = match[2]
      switch (unit) {
        case 'KB': return sum + value * 1024
        case 'MB': return sum + value * 1024 * 1024
        case 'GB': return sum + value * 1024 * 1024 * 1024
        default: return sum + value
      }
    }
    return sum
  }, 0)
  
  const avgSpeed = totalSpeed / activeDownloads.value.length
  return formatSpeed(avgSpeed)
})

// 带宽信息显示
const bandwidthInfo = computed(() => {
  const info = mainProcessInfo.value
  return `${info.currentConcurrency}/${info.maxConcurrent} (${(info.efficiency * 100).toFixed(1)}%)`
})

// 队列状态显示
const queueStatusText = computed(() => {
  const info = queueInfo.value
  return `下载中:${info.downloadingCount} 排队:${info.queuedCount}`
})

// 节流函数
function throttleUpdate(data) {
  const now = Date.now()
  
  // 保存最新的数据
  pendingUpdateData = data
  
  // 如果距离上次更新时间超过节流间隔，立即更新
  if (now - lastUpdateTime >= THROTTLE_INTERVAL) {
    applyProgressUpdate(data)
    lastUpdateTime = now
    
    // 清除可能存在的延迟更新
    if (throttleTimer.value) {
      clearTimeout(throttleTimer.value)
      throttleTimer.value = null
    }
  } else {
    // 否则设置延迟更新
    if (!throttleTimer.value) {
      const remainingTime = THROTTLE_INTERVAL - (now - lastUpdateTime)
      throttleTimer.value = setTimeout(() => {
        if (pendingUpdateData) {
          applyProgressUpdate(pendingUpdateData)
          lastUpdateTime = Date.now()
          pendingUpdateData = null
        }
        throttleTimer.value = null
      }, remainingTime)
    }
  }
}

// 实际应用进度更新的函数
function applyProgressUpdate(data) {
  // 更新监控数据
  updateCount.value++
  lastUpdateTimeText.value = new Date().toLocaleTimeString()
  
  if (data.error) {
    statusMessage.value = `下载错误: ${data.error}`
    hasError.value = true
    return
  }
  
  if (data.complete) {
    progress.value.percent = 100
    statusMessage.value = '下载完成！'
    isCompleted.value = true
    // 清空文件列表释放内存
    activeDownloads.value.length = 0
    return
  }
  
  // 更新进度信息（避免创建新对象）
  if (data.percent !== undefined) {
    progress.value.percent = Math.round(Math.max(0, Math.min(100, data.percent)))
  }
    if (data.speed !== undefined) {
    progress.value.speed = data.speed
    debugLog('📊 速度更新:', {
      receivedSpeed: data.speed,
      formattedSpeed: formatSpeed(data.speed),
      isValidNumber: !isNaN(data.speed) && isFinite(data.speed)
    })
  }
  
  if (data.downloadedBytes !== undefined) progress.value.downloadedBytes = data.downloadedBytes
  if (data.totalBytes !== undefined) progress.value.totalBytes = data.totalBytes
  if (data.estimatedTime !== undefined) progress.value.estimatedTime = data.estimatedTime
  
  // 更新文件统计（避免创建新对象）
  if (data.fileStats) {
    Object.assign(progress.value.fileStats, data.fileStats)
  } else {
    if (data.totalFiles !== undefined) progress.value.fileStats.total = data.totalFiles
    if (data.downloadedFiles !== undefined) progress.value.fileStats.completed = data.downloadedFiles
    if (data.totalFiles && data.downloadedFiles) {
      progress.value.fileStats.remaining = data.totalFiles - data.downloadedFiles
    }
  }  // 更新当前下载的文件（内存优化）
  if (data.currentFile) {
    const currentFile = data.currentFile
    let existingFile = activeDownloads.value.find(f => f.name === currentFile.name)
    if (existingFile) {
      // 更新现有文件，避免创建新对象
      existingFile.progress = Math.round(currentFile.progress || 0)
      existingFile.speed = formatSpeed(currentFile.speed || 0)
      existingFile.size = currentFile.size || 0
    } else if (activeDownloads.value.length < displayLimit.value) {
      // 只在未达到显示限制时添加新文件
      activeDownloads.value.push({
        id: Date.now(),
        name: currentFile.name,
        progress: Math.round(currentFile.progress || 0),
        speed: formatSpeed(currentFile.speed || 0),
        size: currentFile.size || 0
      })
    }
    
    // 移除已完成的文件以释放内存
    activeDownloads.value = activeDownloads.value.filter(file => file.progress < 100)
  }
    // 更新队列状态信息
  if (data.queueInfo) {
    Object.assign(queueInfo.value, data.queueInfo)
  }
  
  // 如果有多个正在下载的文件，分别更新它们的速度
  if (data.activeFiles && Array.isArray(data.activeFiles)) {
    // 清空当前显示列表，重新填充（确保只显示真正在下载的文件）
    activeDownloads.value.length = 0
    
    data.activeFiles.slice(0, displayLimit.value).forEach(fileData => {
      // 只添加真正在下载的文件（进度>0或状态为downloading）
      if (fileData.status === 'downloading' || fileData.progress > 0) {
        activeDownloads.value.push({
          id: fileData.id || Date.now(),
          name: fileData.name,
          progress: Math.round(fileData.progress || 0),
          speed: formatSpeed(fileData.speed || 0),
          size: fileData.size || 0,
          status: fileData.status || 'downloading'
        })
      }
    })  } else {
    // 如果没有具体文件数据，但有当前文件信息，更新单个文件
    if (data.currentFile) {
      const currentFile = data.currentFile
      let existingFile = activeDownloads.value.find(f => f.name === currentFile.name)
      if (existingFile) {
        // 更新现有文件，避免创建新对象
        existingFile.progress = Math.round(currentFile.progress || 0)
        existingFile.speed = formatSpeed(currentFile.speed || 0)
        existingFile.size = currentFile.size || 0
      } else if (activeDownloads.value.length < displayLimit.value) {
        activeDownloads.value.push({
          id: Date.now(),
          name: currentFile.name,
          progress: Math.round(currentFile.progress || 0),
          speed: formatSpeed(currentFile.speed || 0),
          size: currentFile.size || 0,
          status: 'downloading'
        })
      }
      
      // 移除已完成的文件以释放内存
      activeDownloads.value = activeDownloads.value.filter(file => file.progress < 100)
    }
  }
  
  // 如果没有具体文件速度数据，根据总速度估算单个文件速度
  if (!data.currentFile && !data.activeFiles && data.speed > 0 && activeDownloads.value.length > 0) {
    const avgSpeedPerFile = data.speed / activeDownloads.value.length
    activeDownloads.value.forEach(file => {
      if (file.progress < 100) {
        // 添加一些随机变化，让速度显示更真实
        const variation = 0.8 + Math.random() * 0.4 // 0.8-1.2倍的变化
        file.speed = formatSpeed(avgSpeedPerFile * variation)
      }
    })
  }
}

// 完整性检查处理函数
function updateIntegrityProgress(data) {
  debugLog('完整性检查进度更新:', data)
  
  integrityStatus.value = {
    isChecking: true,
    type: data.type || '',
    message: data.status || '',
    progress: data.progress || 0,
    details: data
  }
  
  // 更新主状态消息
  if (data.status) {
    statusMessage.value = data.status
  }
  
  // 根据类型更新不同的显示信息
  switch (data.type) {
    case 'integrity-check':
      statusMessage.value = '正在检查文件完整性...'
      break
    case 'repair':
      statusMessage.value = `正在修复文件... (${data.completed || 0}/${data.total || 0})`
      break
    case 'initialize':
      statusMessage.value = '正在初始化游戏配置...'
      break
    case 'verify':
      statusMessage.value = '正在验证安装结果...'
      break
    case 'complete':
      statusMessage.value = '安装完成！'
      isCompleted.value = true
      integrityStatus.value.isChecking = false
      break
  }
  
  // 更新进度条
  if (data.progress !== undefined) {
    progress.value.percent = Math.round(data.progress)
  }
}

function handleIntegrityComplete(data) {
  debugLog('完整性检查完成:', data)
  
  integrityStatus.value.isChecking = false
  
  if (data.result && data.result.success) {
    statusMessage.value = '游戏安装完成！可以开始游戏了'
    isCompleted.value = true
    progress.value.percent = 100
    
    // 显示成功信息
    setTimeout(() => {
      statusMessage.value = `${downloadInfo.value.version} 安装成功，共修复 ${data.result.repairedFiles || 0} 个文件`
    }, 2000)
  } else {
    statusMessage.value = `安装完成，但可能存在问题: ${data.result?.message || '未知错误'}`
    hasError.value = true
  }
}

function handleIntegrityError(data) {
  debugLog('完整性检查错误:', data)
  
  integrityStatus.value.isChecking = false
  hasError.value = true
  statusMessage.value = `完整性检查失败: ${data.error || '未知错误'}`
  
  // 虽然完整性检查失败，但下载本身可能已经完成
  // 用户仍然可以尝试启动游戏
}

// 辅助函数
function checkElectronAPI() {
  try {
    return !!(typeof window !== 'undefined' && window.electron && typeof window.electron === 'object')
  } catch (error) {
    console.warn('检查 Electron API 时出错:', error)
    return false
  }
}

function formatSpeed(bytesPerSecond) {
  // 检查非法值，避免 Infinity 和 NaN
  if (!bytesPerSecond || bytesPerSecond === 0 || !isFinite(bytesPerSecond) || isNaN(bytesPerSecond)) {
    return '0B/s'
  }
  
  // 确保是正数
  const speed = Math.abs(bytesPerSecond)
  
  if (speed < 1024) {
    return `${Math.round(speed)}B/s`
  } else if (speed < 1024 * 1024) {
    return `${(speed / 1024).toFixed(1)}KB/s`
  } else {
    return `${(speed / (1024 * 1024)).toFixed(1)}MB/s`
  }
}

function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0B'
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`
}

function formatTime(seconds) {
  if (!seconds || seconds === 0) return '--'
  if (seconds < 60) return `${Math.round(seconds)}秒`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分${Math.round(seconds % 60)}秒`
  return `${Math.floor(seconds / 3600)}小时${Math.floor((seconds % 3600) / 60)}分钟`
}

// 下载控制函数
async function startDownload() {
  debugLog('开始下载...')
  isDownloadStarted.value = true
  statusMessage.value = '正在下载...'
  
  const downloadParams = {
    version: downloadInfo.value.version,
    loader: downloadInfo.value.loader,
    downloadSource: 'bmclapi'
  }
  
  if (isElectronAvailable.value && window.electron && window.electron.startDownload) {
    try {
      debugLog('使用 Electron API 启动下载:', downloadParams)
      await window.electron.startDownload(downloadParams)
      dataSource.value = 'real'
    } catch (error) {
      debugLog('启动下载失败:', error)
      statusMessage.value = `下载启动失败: ${error.message}`
      hasError.value = true
    }
  } else {
    debugLog('Electron API 不可用，启动模拟下载')
    startSimulatedDownload()
  }
}

function pauseDownload() {
  debugLog('暂停下载...')
  if (updateTimer) {
    clearInterval(updateTimer)
    updateTimer = null
  }
  statusMessage.value = '下载已暂停'
}

function retryDownload() {
  debugLog('重试下载...')
  hasError.value = false
  progress.value.percent = 0
  activeDownloads.value.length = 0 // 清空数组，释放内存
  startDownload()
}

function goToHome() {
  router.push('/')
}

function testDownload() {
  debugLog('测试下载功能...')
  clearData()
  startSimulatedDownload()
}

function forceGC() {
  debugLog('尝试强制垃圾回收...')
  
  // 清空所有可能的缓存
  activeDownloads.value.length = 0
  pendingUpdateData = null
  
  // 如果在Electron环境中，尝试调用垃圾回收
  if (window.electron && window.electron.forceGC) {
    window.electron.forceGC()
    debugLog('已请求主进程执行垃圾回收')
  } else if (window.gc) {
    window.gc()
    debugLog('已执行浏览器垃圾回收')
  } else {
    debugLog('垃圾回收不可用')
  }
  
  statusMessage.value = '已尝试清理内存'
}

function testSpeedUpdate() {
  debugLog('测试速度更新功能...')
  
  // 如果没有活跃下载，先创建一些测试文件
  if (activeDownloads.value.length === 0) {
    activeDownloads.value.push(
      { id: 1, name: 'test-client.jar', speed: '0KB/s', progress: 25, size: 50 * 1024 * 1024 },
      { id: 2, name: 'test-library.jar', speed: '0KB/s', progress: 60, size: 8 * 1024 * 1024 },
      { id: 3, name: 'test-resource.jar', speed: '0KB/s', progress: 10, size: 3 * 1024 * 1024 }
    )
  }
  
  // 模拟速度更新
  const testSpeeds = [
    500 * 1024,      // 500KB/s
    1.5 * 1024 * 1024, // 1.5MB/s
    800 * 1024,      // 800KB/s
    2.2 * 1024 * 1024  // 2.2MB/s
  ]
  
  activeDownloads.value.forEach((file, index) => {
    const speed = testSpeeds[index % testSpeeds.length]
    file.speed = formatSpeed(speed)
    file.progress = Math.min(100, file.progress + Math.random() * 10)
  })
  
  // 更新总体速度
  const totalSpeed = testSpeeds.reduce((sum, speed) => sum + speed, 0)
  progress.value.speed = totalSpeed
  statusMessage.value = '速度更新测试完成'
  debugLog('速度更新测试完成，总速度:', formatSpeed(totalSpeed))
  debugLog('当前进度对象速度值:', progress.value.speed)
  
  // 同时测试从主进程获取速度信息
  if (window.electron && window.electron.getPerformanceStats) {
    window.electron.getPerformanceStats().then(stats => {
      debugLog('📊 主进程性能统计:', stats)
    }).catch(err => {
      debugLog('❌ 获取主进程性能统计失败:', err)
    })
  }
}

function requestMainProcessInfo() {
  debugLog('请求主进程信息...')
  
  if (isElectronAvailable.value && window.electron) {
    // 获取下载基本信息
    if (window.electron.getDownloadInfo) {
      window.electron.getDownloadInfo()
        .then(response => {
          if (response.success) {
            const info = response.info
            mainProcessInfo.value = {
              maxConcurrent: info.maxConcurrent || 48,
              currentConcurrency: info.currentConcurrency || 12,
              efficiency: info.bandwidthStats?.efficiency || 0,
              adaptiveEnabled: info.enableAdaptiveConcurrency || true
            }
            debugLog('主进程下载信息:', info)
            statusMessage.value = `主进程：${info.currentConcurrency}/${info.maxConcurrent}并发，效率${(info.bandwidthStats?.efficiency * 100 || 0).toFixed(1)}%`
          }
        })
        .catch(error => {
          debugLog('获取主进程信息失败:', error)
          statusMessage.value = '获取主进程信息失败'
        })
    }
    
    // 获取性能统计
    if (window.electron.getPerformanceStats) {
      window.electron.getPerformanceStats()
        .then(response => {
          if (response.success) {
            performanceStats.value = response.stats
            debugLog('性能统计:', response.stats)
          }
        })
        .catch(error => debugLog('获取性能统计失败:', error))
    }
    
    // 获取并发建议
    if (window.electron.getConcurrencyRecommendation) {
      window.electron.getConcurrencyRecommendation()
        .then(response => {
          if (response.success) {
            const rec = response.recommendation
            concurrencyRecommendation.value = `${rec.suggested}个 (${rec.reason})`
            debugLog('并发建议:', rec)
          }
        })
        .catch(error => debugLog('获取并发建议失败:', error))
    }
  } else {
    statusMessage.value = 'Electron API不可用'
  }
}

// 应用手动设置的并发数
function applyConcurrency() {
  if (!isElectronAvailable.value || !window.electron?.setConcurrency) {
    statusMessage.value = 'API不可用'
    return
  }
  
  const newConcurrency = parseInt(manualConcurrency.value)
  if (newConcurrency < 4 || newConcurrency > 48) {
    statusMessage.value = '并发数必须在4-48之间'
    return
  }
  
  debugLog(`设置并发数为: ${newConcurrency}`)
  
  window.electron.setConcurrency(newConcurrency)
    .then(response => {
      if (response.success) {
        mainProcessInfo.value.currentConcurrency = response.newConcurrency
        statusMessage.value = `并发数已设置为: ${response.newConcurrency}`
        debugLog('并发数设置成功:', response)
        
        // 刷新主进程信息
        setTimeout(() => requestMainProcessInfo(), 1000)
      } else {
        statusMessage.value = '设置失败: ' + response.error
      }
    })
    .catch(error => {
      debugLog('设置并发数失败:', error)
      statusMessage.value = '设置并发数失败'
    })
}

// 重置下载统计
function resetDownloadStats() {
  if (!isElectronAvailable.value || !window.electron?.resetStats) {
    statusMessage.value = 'API不可用'
    return
  }
  
  debugLog('重置下载统计...')
  
  window.electron.resetStats()
    .then(response => {
      if (response.success) {
        statusMessage.value = '统计信息已重置'
        debugLog('统计重置成功')
        
        // 重置本地显示的统计信息
        performanceStats.value = { bandwidth: {}, tasks: {} }
        
        // 刷新主进程信息
        setTimeout(() => requestMainProcessInfo(), 500)
      } else {
        statusMessage.value = '重置失败: ' + (response.error || '未知错误')
      }
    })
    .catch(error => {
      debugLog('重置统计失败:', error)
      statusMessage.value = '重置统计失败'
    })
}

// 启动更新频率计算
function startUpdateFrequencyMonitor() {
  if (updateCountResetTimer) {
    clearInterval(updateCountResetTimer)
  }
  
  updateCountResetTimer = setInterval(() => {
    updateFrequency.value = updateCount.value
    updateCount.value = 0
  }, 1000) // 每秒计算一次频率
}

function clearData() {
  debugLog('清除下载数据...')
  if (updateTimer) {
    clearInterval(updateTimer)
    updateTimer = null
  }
  
  // 清理节流定时器
  if (throttleTimer.value) {
    clearTimeout(throttleTimer.value)
    throttleTimer.value = null
  }
  
  // 重置节流相关变量
  lastUpdateTime = 0
  pendingUpdateData = null
  
  // 重置进度数据（重用对象而不是创建新对象）
  progress.value.percent = 0
  progress.value.speed = 0
  progress.value.downloadedBytes = 0
  progress.value.totalBytes = 0
  progress.value.estimatedTime = 0
  progress.value.fileStats.total = 0
  progress.value.fileStats.completed = 0
  progress.value.fileStats.remaining = 0
  
  // 清空数组而不是重新赋值
  activeDownloads.value.length = 0
  statusMessage.value = '数据已清除'
  isDownloadStarted.value = false
  isCompleted.value = false
  hasError.value = false
  dataSource.value = 'waiting'
    // 重置日志计数
  consoleLogCount.value = 0
}

// 模拟下载用于测试
function startSimulatedDownload() {
  debugLog('启动模拟下载...')
  dataSource.value = 'simulated'
  
  // 重置进度（重用对象）
  progress.value.percent = 0
  progress.value.speed = 0
  progress.value.downloadedBytes = 0
  progress.value.totalBytes = 150 * 1024 * 1024 // 150MB
  progress.value.estimatedTime = 0
  progress.value.fileStats.total = 1000
  progress.value.fileStats.completed = 0
  progress.value.fileStats.remaining = 1000
  
  // 初始化文件列表（限制数量）
  activeDownloads.value.length = 0 // 清空现有数组
  activeDownloads.value.push(
    { id: 1, name: 'minecraft-client-1.21.6.jar', speed: '0MB/s', progress: 0, size: 50 * 1024 * 1024 },
    { id: 2, name: 'lwjgl-opengl-3.3.2.jar', speed: '0MB/s', progress: 0, size: 8 * 1024 * 1024 },
    { id: 3, name: 'libraries/commons-io-2.11.0.jar', speed: '0MB/s', progress: 0, size: 3 * 1024 * 1024 }
  )
    updateTimer = setInterval(() => {
    if (progress.value.percent < 100) {
      // 更新总体进度
      const increment = Math.random() * 2 + 0.5
      progress.value.percent = Math.min(progress.value.percent + increment, 100)
      
      // 更新下载速度 - 模拟真实的网络波动
      const baseSpeed = 2 * 1024 * 1024 // 基础速度2MB/s，更接近实际情况
      const variation = (Math.random() - 0.5) * 3 * 1024 * 1024 // 波动范围±3MB/s
      progress.value.speed = Math.max(100 * 1024, baseSpeed + variation) // 最低100KB/s
      
      // 更新已下载字节数
      progress.value.downloadedBytes = Math.floor((progress.value.percent / 100) * progress.value.totalBytes)
      
      // 更新剩余时间
      const remainingBytes = progress.value.totalBytes - progress.value.downloadedBytes
      progress.value.estimatedTime = remainingBytes / progress.value.speed
      
      // 更新文件统计
      progress.value.fileStats.completed = Math.floor((progress.value.percent / 100) * progress.value.fileStats.total)
      progress.value.fileStats.remaining = progress.value.fileStats.total - progress.value.fileStats.completed
      
      // 更新活跃文件列表（更真实的速度分配）
      activeDownloads.value.forEach((file, index) => {
        // 根据文件大小和下载进度计算合理的进度
        const baseProgress = progress.value.percent
        const progressVariation = (Math.random() - 0.5) * 30 // ±15%的进度变化
        const fileProgress = Math.min(100, Math.max(0, baseProgress + progressVariation))
        file.progress = Math.round(fileProgress)
        
        // 根据文件大小分配速度，大文件获得更多带宽
        const fileSizeRatio = file.size / (50 * 1024 * 1024) // 相对于50MB的比例
        const baseFileSpeed = progress.value.speed * (0.5 + fileSizeRatio * 0.3) / activeDownloads.value.length
        const speedVariation = (Math.random() - 0.5) * baseFileSpeed * 0.4 // ±20%的速度变化
        const finalSpeed = Math.max(10 * 1024, baseFileSpeed + speedVariation) // 最低10KB/s
        
        file.speed = formatSpeed(finalSpeed)
        
        // 已完成的文件速度设为0
        if (file.progress >= 100) {
          file.speed = '0B/s'
        }
      })
    } else {
      clearInterval(updateTimer)
      updateTimer = null
      statusMessage.value = '下载完成！'
      isCompleted.value = true
      activeDownloads.value.length = 0 // 清空数组释放内存
    }
  }, 500) // 与节流间隔保持一致
}

// 组件生命周期
onMounted(() => {
  try {
    debugLog('=== DownloadProgress 组件已挂载 ===')
    debugLog('路由参数:', route.query)
    debugLog('下载配置:', downloadInfo.value)
    
    // 启动更新频率监控
    startUpdateFrequencyMonitor()
    
    // 检查 Electron API 可用性
    isElectronAvailable.value = checkElectronAPI()
    debugLog('检查electron API可用性:', isElectronAvailable.value)
      // 设置下载进度监听
    if (isElectronAvailable.value && window.electron) {
      if (window.electron.onDownloadProgress) {
        debugLog('设置下载进度监听器...')
        
        // 创建监听器函数并保存引用
        progressHandler = (data) => {
          // 如果有模拟定时器在运行，先清除它
          if (updateTimer) {
            debugLog('收到真实数据，清除模拟定时器')
            clearInterval(updateTimer)
            updateTimer = null
          }
          
          // 标记为真实数据源
          dataSource.value = 'real'
          
          // 使用节流函数处理数据更新
          throttleUpdate(data)
        }
        
        window.electron.onDownloadProgress(progressHandler)
      }
      
      // 监听完整性检查进度
      if (window.electron.onIntegrityProgress) {
        debugLog('设置完整性检查进度监听器...')
        window.electron.onIntegrityProgress(updateIntegrityProgress)
      }
      
      // 监听完整性检查完成
      if (window.electron.onIntegrityComplete) {
        debugLog('设置完整性检查完成监听器...')
        window.electron.onIntegrityComplete(handleIntegrityComplete)
      }
      
      // 监听完整性检查错误
      if (window.electron.onIntegrityError) {
        debugLog('设置完整性检查错误监听器...')
        window.electron.onIntegrityError(handleIntegrityError)
      }
      
      // 监听任务开始事件
      if (window.electron.onDownloadTaskStarted) {
        taskStartedHandler = (task) => {
          debugLog('任务开始:', task)
          if (activeDownloads.value.length < displayLimit.value) {
            activeDownloads.value.push({
              id: task.taskId,
              name: task.fileName,
              progress: 0,
              speed: '0KB/s',
              size: task.size || 0
            })
          }
        }
        
        window.electron.onDownloadTaskStarted(taskStartedHandler)
      }
      
      // 监听任务完成事件
      if (window.electron.onDownloadTaskCompleted) {
        taskCompletedHandler = (task) => {
          debugLog('任务完成:', task)
          const index = activeDownloads.value.findIndex(f => f.id === task.taskId)
          if (index !== -1) {
            activeDownloads.value.splice(index, 1)
          }
        }
        
        window.electron.onDownloadTaskCompleted(taskCompletedHandler)
      }
    }
      // 检查是否需要自动启动下载
    const autoStart = route.query.autoStart === 'true'
    if (autoStart) {
      debugLog('检测到自动启动标记，准备启动下载...')
      setTimeout(() => {
        startDownload()
      }, 500)
    } else {
      statusMessage.value = '请点击"开始下载"按钮启动下载'
      isDownloadStarted.value = false
    }
    
    // 初始获取主进程信息
    setTimeout(() => {
      requestMainProcessInfo()
    }, 1000)
    
    // 定期更新主进程信息（每10秒）
    const infoUpdateTimer = setInterval(() => {
      if (isElectronAvailable.value) {
        requestMainProcessInfo()
      }
    }, 10000)
    
    // 保存定时器引用以便清理
    window.infoUpdateTimer = infoUpdateTimer
  } catch (error) {
    debugLog('DownloadProgress 组件初始化失败:', error)
    statusMessage.value = '组件初始化失败'
    hasError.value = true
  }
})

// 组件卸载时清理定时器和事件监听器
onUnmounted(() => {
  debugLog('组件卸载，清理资源...')
  
  // 清理定时器
  if (updateTimer) {
    clearInterval(updateTimer)
    updateTimer = null
  }
  
  // 清理信息更新定时器
  if (window.infoUpdateTimer) {
    clearInterval(window.infoUpdateTimer)
    window.infoUpdateTimer = null
  }
  
  // 清理节流定时器
  if (throttleTimer.value) {
    clearTimeout(throttleTimer.value)
    throttleTimer.value = null
  }
  
  // 清理更新频率监控定时器
  if (updateCountResetTimer) {
    clearInterval(updateCountResetTimer)
    updateCountResetTimer = null
  }
  
  // 清理事件监听器
  if (isElectronAvailable.value && window.electron) {
    try {
      if (window.electron.removeDownloadProgressListener && progressHandler) {
        window.electron.removeDownloadProgressListener(progressHandler)
      }
      if (window.electron.removeDownloadTaskStartedListener && taskStartedHandler) {
        window.electron.removeDownloadTaskStartedListener(taskStartedHandler)
      }
      if (window.electron.removeDownloadTaskCompletedListener && taskCompletedHandler) {
        window.electron.removeDownloadTaskCompletedListener(taskCompletedHandler)
      }
    } catch (error) {
      debugLog('清理事件监听器时出错:', error)
    }
  }
  
  // 清理引用
  progressHandler = null
  taskStartedHandler = null
  taskCompletedHandler = null
  
  // 重置节流相关变量
  lastUpdateTime = 0
  pendingUpdateData = null
  
  // 清空数组释放内存
  activeDownloads.value.length = 0
  
  debugLog('资源清理完成')
})
</script>

<style scoped>
.download-progress {
  height: 100vh;
  background: linear-gradient(135deg, #242424 0%, #242424 100%);
  display: flex;
  flex-direction: column;
  color: white;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

.debug-info {
  position: absolute;
  top: 10px;
  left: 10px;
  background: rgba(0, 0, 0, 0.5);
  padding: 10px;
  border-radius: 5px;
  font-size: 12px;
  z-index: 1000;
}

.debug-item {
  margin-bottom: 5px;
}

.data-source {
  padding: 2px 6px;
  border-radius: 3px;
  font-weight: bold;
}

.data-source.real {
  background: #28a745;
}

.data-source.simulated {
  background: #ffc107;
  color: #212529;
}

.data-source.waiting {
  background: #6c757d;
}

.throttle-status {
  padding: 2px 6px;
  border-radius: 3px;
  font-weight: bold;
}

.throttle-status.active {
  background: #ff6b6b;
}

.throttle-status.idle {
  background: #51cf66;
}

.debug-actions {
  margin-top: 10px;
}

.debug-btn {
  background: #007bff;
  color: white;
  border: none;
  padding: 4px 8px;
  margin-right: 5px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 11px;
}

.debug-btn:hover {
  background: #0056b3;
}

.debug-select {
  background: #333;
  color: white;
  border: 1px solid #555;
  border-radius: 3px;
  padding: 2px 4px;
  font-size: 11px;
  margin-left: 5px;
}

.debug-select:focus {
  outline: none;
  border-color: #007bff;
}

.debug-input {
  background: #333;
  color: white;
  border: 1px solid #555;
  border-radius: 3px;
  padding: 2px 6px;
  font-size: 11px;
  margin-right: 5px;
  width: 60px;
}

.debug-input:focus {
  outline: none;
  border-color: #007bff;
}

.debug-btn-small {
  background: rgba(0, 123, 255, 0.6);
  border: none;
  color: white;
  padding: 2px 8px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 10px;
  margin-left: 5px;
}

.debug-btn-small:hover {
  background: rgba(0, 123, 255, 0.8);
}

.header-bar {
  padding: 30px;
  text-align: center;
}

.download-title {
  font-size: 2.5rem;
  font-weight: 300;
  margin-bottom: 20px;
  text-shadow: 0 2px 4px rgba(0,0,0,0.3);
}

.overall-progress {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 15px;
}

.progress-bar-container {
  width: 400px;
  height: 8px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #4facfe 0%, #00f2fe 100%);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 1.2rem;
  font-weight: 600;
  min-width: 60px;
}

.main-layout {
  flex: 1;
  display: flex;
  gap: 30px;
  padding: 0 30px;
  overflow: hidden;
}

.left-panel {
  width: 300px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.stat-item {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 15px;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.stat-icon {
  font-size: 2rem;
}

.stat-content {
  flex: 1;
}

.stat-label {
  font-size: 0.9rem;
  opacity: 0.8;
  margin-bottom: 5px;
}

.stat-value {
  font-size: 1.2rem;
  font-weight: 600;
}

.right-panel {
  flex: 1;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  display: flex;
  flex-direction: column;
}

.panel-header {
  padding: 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.panel-header h3 {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 500;
}

.file-count {
  opacity: 0.7;
  font-size: 0.9rem;
}

.file-list {
  flex: 1;
  padding: 15px;
  overflow-y: auto;
  max-height: calc(100vh - 200px); /* 限制最大高度，确保滚动 */
}

.no-files {
  text-align: center;
  opacity: 0.6;
  padding: 40px 20px;
}

.no-files-icon {
  font-size: 3rem;
  margin-bottom: 10px;
}

.no-files-text {
  font-size: 1.1rem;
}

.file-item {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 10px; /* 减少内边距 */
  margin-bottom: 6px; /* 减少间距 */
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: background-color 0.2s ease;
}

.file-item:hover {
  background: rgba(255, 255, 255, 0.15);
}

.file-item.downloading {
  border-left: 3px solid #4facfe;
}

.file-item.waiting {
  border-left: 3px solid #ffa500;
  opacity: 0.8;
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  margin-right: 8px;
}

.status-indicator.active {
  background: #4facfe;
  animation: pulse 2s infinite;
}

.status-indicator.waiting {
  background: #ffa500;
  animation: blink 1.5s infinite;
}

@keyframes pulse {
  0% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
  100% {
    opacity: 1;
  }
}

@keyframes blink {
  0%, 50% {
    opacity: 1;
  }
  51%, 100% {
    opacity: 0.3;
  }
}

.file-info {
  margin-bottom: 8px; /* 减少间距 */
}

.file-name {
  font-weight: 500;
  margin-bottom: 4px; /* 减少间距 */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 0.9rem; /* 稍微减小字体 */
}

.file-details {
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem; /* 减小字体 */
  opacity: 0.8;
}

.file-progress {
  display: flex;
  align-items: center;
  gap: 8px; /* 减少间距 */
}

.progress-bar-small {
  flex: 1;
  height: 4px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #4facfe 0%, #00f2fe 100%);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.progress-percent {
  min-width: 40px;
  text-align: right;
  font-size: 0.8rem;
}

.footer-bar {
  padding: 30px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(0, 0, 0, 0.2);
}

.status-text {
  font-size: 1.1rem;
}

.status-text.error {
  color: #ff6b6b;
}

.status-text.completed {
  color: #51cf66;
}

.action-btn {
  padding: 12px 24px;
  border: none;
  border-radius: 6px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
}

.start-btn {
  background: #28a745;
  color: white;
}

.start-btn:hover {
  background: #218838;
}

.pause-btn {
  background: #ffc107;
  color: #212529;
}

.pause-btn:hover {
  background: #e0a800;
}

.complete-btn {
  background: #28a745;
  color: white;
}

.complete-btn:hover {
  background: #218838;
}

.retry-btn {
  background: #dc3545;
  color: white;
}

.retry-btn:hover {
  background: #c82333;
}

/* 完整性检查状态样式 */
.integrity-status {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  padding: 8px 12px;
  background: rgba(33, 150, 243, 0.1);
  border: 1px solid rgba(33, 150, 243, 0.3);
  border-radius: 6px;
  font-size: 12px;
}

.integrity-icon {
  font-size: 16px;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.integrity-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.integrity-message {
  color: #2196f3;
  font-weight: 500;
}

.integrity-progress {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mini-progress-bar {
  flex: 1;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
}

.mini-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #2196f3, #21cbf3);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.integrity-percent {
  color: #2196f3;
  font-size: 11px;
  font-weight: bold;
  min-width: 35px;
  text-align: right;
}

/* 状态区域调整 */
.status-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* 完整性检查类型特定样式 */
.integrity-status.repair .integrity-icon {
  color: #ff9800;
}

.integrity-status.repair .integrity-message {
  color: #ff9800;
}

.integrity-status.repair .mini-progress-fill {
  background: linear-gradient(90deg, #ff9800, #ffb74d);
}

.integrity-status.initialize .integrity-icon {
  color: #4caf50;
}

.integrity-status.initialize .integrity-message {
  color: #4caf50;
}

.integrity-status.initialize .mini-progress-fill {
  background: linear-gradient(90deg, #4caf50, #66bb6a);
}

.integrity-status.complete .integrity-icon {
  color: #4caf50;
  animation: none;
}

.integrity-status.error .integrity-icon {
  color: #f44336;
  animation: none;
}

.integrity-status.error .integrity-message {
  color: #f44336;
}
</style>
