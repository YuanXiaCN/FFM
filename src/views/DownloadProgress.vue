<template>
  <div class="download-progress">
    <h2>下载进度</h2>
    <div class="progress-container">
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: progress + '%' }"></div>
      </div>
      <span class="progress-text">{{ progress }}%</span>
    </div>
  </div>
</template>

<script>
export default {
  name: 'DownloadProgress',
  data() {
    return {
      progress: 0
    }
  }
}
</script>

<style scoped>
.download-progress {
  padding: 20px;
}

.progress-container {
  display: flex;
  align-items: center;
  gap: 10px;
}

.progress-bar {
  flex: 1;
  height: 20px;
  background-color: #f0f0f0;
  border-radius: 10px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background-color: #4CAF50;
  transition: width 0.3s ease;
}

.progress-text {
  min-width: 40px;
  text-align: right;
}
</style>
