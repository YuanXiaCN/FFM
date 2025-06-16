<template>
  <div class="download-progress-container">
    <div class="download-card">
      <h2>正在下载</h2>
      <div class="download-info">
        <div class="version-info">
          <span class="info-label">版本:</span>
          <span class="info-value">{{ downloadInfo.version }}</span>
        </div>
        <div class="loader-info">
          <span class="info-label">加载器:</span>
          <span class="info-value">{{ getLoaderName(downloadInfo.loader) }}</span>
        </div>
        <div class="shader-info">
          <span class="info-label">光影:</span>
          <span class="info-value">{{ getShaderName(downloadInfo.shader) }}</span>
        </div>
      </div>

      <div class="progress-container">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: `${progress.percent}%` }"></div>
        </div>
        <div class="progress-text">
          <span>{{ progress.percent.toFixed(1) }}%</span>
          <span v-if="progress.speed">{{ formatSpeed(progress.speed) }}</span>
        </div>
      </div>

      <div class="current-file">
        <span class="file-label">当前文件:</span>
        <span class="file-name">{{ progress.currentFile || '准备中...' }}</span>
      </div>

      <div class="status-message" :class="{ 'error': hasError }">
        {{ statusMessage }}
      </div>

      <div class="action-buttons">
        <button class="cancel-btn" @click="cancelDownload">取消下载</button>
        <button v-if="isCompleted" class="complete-btn" @click="finishDownload">完成</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useRoute } from 'vue-router'

const router = useRouter()
const route = useRoute()

const downloadInfo = ref({
  version: route.query.version || '',
  loader: route.query.loader || '',
  shader: route.query.shader || ''
})

const progress = ref({
  percent: 0,
  currentFile: '',
  speed: 0,
  size: 0,
  downloaded: 0,
  total: 0
})

const statusMessage = ref('正在初始化下载...')
const hasError = ref(false)
const isCompleted = ref(false)

// 根据类型获取加载器名称
function getLoaderName(type) {
  const loaderMap = {
    'vanilla': '原版',
    'forge': 'Forge',
    'fabric': 'Fabric'
  }
  return loaderMap[type] || type
}

// 根据类型获取光影加载器名称
function getShaderName(type) {
  const shaderMap = {
    'none': '无',
    'optifine': 'OptiFine',
    'iris': 'Iris'
  }
  return shaderMap[type] || type
}

// 格式化下载速度
function formatSpeed(bytesPerSecond) {
  if (bytesPerSecond < 1024) {
    return `${bytesPerSecond.toFixed(1)} B/s`
  } else if (bytesPerSecond < 1024 * 1024) {
    return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`
  } else {
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`
  }
}

// 取消下载
function cancelDownload() {
  if (confirm('确定要取消下载吗？')) {
    import('@/services/DownloadManager').then(dm => {
      dm.default.cancelDownload()
      router.push('/home')
    })
  }
}

// 完成下载
function finishDownload() {
  router.push('/home')
}

onMounted(() => {
  // 监听下载进度
  import('@/services/DownloadManager').then(dm => {
    dm.default.onProgress((data) => {
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
      
      progress.value.percent = data.percent || 0
      progress.value.currentFile = data.file || ''
      progress.value.speed = data.speed || 0
      progress.value.downloaded = data.downloaded || 0
      progress.value.total = data.total || 0
      
      if (data.status) {
        statusMessage.value = data.status
      }
    })
  })
})

onUnmounted(() => {
  // 卸载时移除监听器
  import('@/services/DownloadManager').then(dm => {
    dm.default.removeProgressListener()
  })
})
</script>

<style scoped>
.download-progress-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: calc(100vh - 80px);
  padding: 20px;
}

.download-card {
  background: #333;
  border-radius: 16px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.08);
  padding: 30px;
  width: 100%;
  max-width: 600px;
}

h2 {
  margin-top: 0;
  color: #333;
  font-size: 1.6rem;
  margin-bottom: 24px;
  text-align: center;
}

.download-info {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 15px;
  margin-bottom: 30px;
}

.info-label {
  color: #666;
  font-size: 0.9rem;
  display: block;
  margin-bottom: 5px;
}

.info-value {
  font-weight: bold;
  color: #333;
  font-size: 1.1rem;
}

.progress-container {
  margin-bottom: 25px;
}

.progress-bar {
  height: 12px;
  background: #333;
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 10px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #4f8cff 0%, #6ad1ff 100%);
  border-radius: 10px;
  transition: width 0.3s ease;
}

.progress-text {
  display: flex;
  justify-content: space-between;
  font-size: 0.95rem;
  color: #666;
}

.current-file {
  background: #f9fafc;
  padding: 15px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.file-label {
  color: #666;
  margin-right: 10px;
}

.file-name {
  font-family: monospace;
  word-break: break-all;
}

.status-message {
  text-align: center;
  padding: 10px;
  margin-bottom: 20px;
  color: #666;
}

.status-message.error {
  color: #e74c3c;
  background: #ffeaea;
  border-radius: 8px;
}

.action-buttons {
  display: flex;
  justify-content: center;
  gap: 15px;
}

.cancel-btn, .complete-btn {
  padding: 10px 20px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  font-size: 1rem;
  transition: all 0.2s;
}

.cancel-btn {
  background: #f4f6f8;
  color: #666;
}

.cancel-btn:hover {
  background: #e8ecf1;
}

.complete-btn {
  background: linear-gradient(90deg, #4f8cff 60%, #6ad1ff 100%);
  color: #333;
}

.complete-btn:hover {
  opacity: 0.9;
}
</style>
