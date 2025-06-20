<template>
  <div class="download-page">
    <h1 class="page-title">版本下载</h1>
    <p class="description">从官方源或镜像站下载 Minecraft 版本</p>    <div class="filters">
      <!-- 下载源状态 -->
      <div class="source-status">
        <span class="source-label">当前源：</span>
        <span class="source-name">{{ DOWNLOAD_SOURCES[currentSourceIndex]?.label || '检测中...' }}</span>
        <button class="refresh-btn" @click="fetchVersions" :disabled="loading">
          {{ loading ? '加载中...' : '刷新' }}
        </button>
      </div>
        
      <div class="filter-row">
        <div class="filter-group">
          <label>版本类型：</label>
          <div class="filter-buttons">
            <button 
              :class="['filter-btn', versionType === 'all' ? 'active' : '']"
              @click="versionType = 'all'"
            >
              所有
            </button>
            <button 
              :class="['filter-btn', versionType === 'release' ? 'active' : '']"
              @click="versionType = 'release'"
            >
              稳定版
            </button>
            <button 
              :class="['filter-btn', versionType === 'snapshot' ? 'active' : '']"
              @click="versionType = 'snapshot'"
            >
              快照版
            </button>
            <button 
              :class="['filter-btn', versionType === 'old_beta' ? 'active' : '']"
              @click="versionType = 'old_beta'"
            >
              Beta版
            </button>
            <button 
              :class="['filter-btn', versionType === 'old_alpha' ? 'active' : '']"
              @click="versionType = 'old_alpha'"
            >
              Alpha版
            </button>
          </div>
        </div>
        
        <div class="search-box">
          <input 
            type="text" 
            v-model="searchQuery" 
            placeholder="搜索版本..." 
            class="search-input" 
          />
        </div>
      </div>
    </div>    <div class="versions-container">
      <div v-if="loading" class="loading-indicator">
        <div class="spinner"></div>
        <span>正在加载版本列表...</span>
      </div>
      <div v-else-if="errorMessage" class="error-message">
        <div class="error-icon">⚠️</div>
        <div class="error-text">{{ errorMessage }}</div>
        <button class="retry-btn" @click="fetchVersions">重试</button>
      </div>
      <div v-else-if="filteredVersions.length === 0" class="no-versions">
        没有找到匹配的版本
      </div>
      <div v-else class="version-grid">
        <div 
          v-for="version in filteredVersions" 
          :key="version.id"
          class="version-card"
          @click="selectVersion(version)"
        >
          <div class="version-header">
            <span class="version-id">{{ version.id }}</span>
            <span :class="['version-type-badge', version.type]">{{ getVersionTypeLabel(version.type) }}</span>
          </div>
          <div class="version-date">
            {{ formatDate(version.releaseTime) }}
          </div>
          <div class="download-btn">
            <svg t="1748985620959" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="3819">
              <path d="M896 597.333333a42.666667 42.666667 0 0 1 42.666667 42.666667v170.666667a128 128 0 0 1-128 128H213.333333a128 128 0 0 1-128-128v-170.666667a42.666667 42.666667 0 0 1 85.333334 0v170.666667a42.538667 42.538667 0 0 0 36.864 42.24L213.333333 853.333333h597.333334a42.538667 42.538667 0 0 0 42.24-36.864L853.333333 810.666667v-170.666667a42.666667 42.666667 0 0 1 42.666667-42.666667zM512 85.333333a42.666667 42.666667 0 0 1 42.666667 42.666667l-0.042667 408.96 138.410667-138.325333a42.666667 42.666667 0 1 1 60.330666 60.330666l-211.2 211.2a42.453333 42.453333 0 0 1-22.613333 11.818667l-5.034667 0.597333h-5.034666a42.496 42.496 0 0 1-27.648-12.373333l-211.2-211.2a42.666667 42.666667 0 1 1 60.330666-60.373333L469.333333 536.917333 469.333333 128a42.666667 42.666667 0 0 1 42.666667-42.666667z" p-id="3820"></path>
            </svg>
            <span>下载</span>
          </div>
        </div>
      </div>
    </div>

    <DownloadSelect v-if="showDownloadSelect" :selectedVersion="selectedVersion" @close="showDownloadSelect = false" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import { DOWNLOAD_SOURCES } from '@/services/downloadSources.js';
import DownloadSelect from './DownloadSelect.vue';

const loading = ref(true);
const versions = ref([]);
const versionType = ref('all');
const searchQuery = ref('');
const showDownloadSelect = ref(false);
const selectedVersion = ref(null);
const currentSourceIndex = ref(1); // 默认使用 BMCLAPI 镜像源 (索引1)
const errorMessage = ref(''); // 错误消息

// 获取版本列表，支持多源重试
async function fetchVersions() {
  loading.value = true;
  errorMessage.value = ''; // 清除之前的错误消息
  
  // 尝试所有下载源
  for (let i = 0; i < DOWNLOAD_SOURCES.length; i++) {
    const sourceIndex = (currentSourceIndex.value + i) % DOWNLOAD_SOURCES.length;
    const source = DOWNLOAD_SOURCES[sourceIndex];
    
    try {
      console.log(`尝试使用 ${source.label} 获取版本列表...`);
      const manifestUrl = source.meta.versionManifest;
      const res = await axios.get(manifestUrl, { timeout: 10000 }); // 10秒超时
      versions.value = res.data.versions;
      currentSourceIndex.value = sourceIndex; // 记录成功的源
      console.log(`成功从 ${source.label} 获取版本列表，共 ${res.data.versions.length} 个版本`);
      loading.value = false;
      return;
    } catch (error) {
      console.warn(`从 ${source.label} 获取版本列表失败:`, error.message);
      if (i === DOWNLOAD_SOURCES.length - 1) {
        // 所有源都失败了
        console.error('所有下载源都无法访问，请检查网络连接');
        errorMessage.value = '无法连接到任何下载源，请检查网络连接或稍后重试';
      }
    }
  }
  
  loading.value = false;
}

// 版本类型过滤
const filteredVersions = computed(() => {
  let result = versions.value;
  
  // 类型过滤
  if (versionType.value !== 'all') {
    result = result.filter(v => v.type === versionType.value);
  }
  
  // 搜索过滤
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    result = result.filter(v => v.id.toLowerCase().includes(query));
  }
  
  return result;
});

// 格式化日期
function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
  });
}

// 获取版本类型的中文标签
function getVersionTypeLabel(type) {
  const labels = {
    'release': '正式版',
    'snapshot': '快照版',
    'old_beta': 'Beta版',
    'old_alpha': 'Alpha版'
  };
  return labels[type] || type;
}

// 选择版本
function selectVersion(version) {
  selectedVersion.value = version;
  showDownloadSelect.value = true;
}

// 页面加载时获取版本列表
onMounted(fetchVersions);
</script>

<style scoped>
.download-page {
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.page-title {
  font-size: 1.8rem;
  font-weight: 700;
  color: #333;
  margin-bottom: 8px;
}

.description {
  color: #666;
  margin-bottom: 24px;
}

.filters {
  display: flex;
  flex-direction: column;
  margin-bottom: 24px;
  gap: 16px;
}

.source-status {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  font-size: 0.9rem;
}

.source-label {
  color: #aaa;
}

.source-name {
  color: #4f8cff;
  font-weight: 500;
}

.refresh-btn {
  padding: 6px 12px;
  background: #4f8cff;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: background 0.2s;
  margin-left: auto;
}

.refresh-btn:hover:not(:disabled) {
  background: #3d7ae8;
}

.refresh-btn:disabled {
  background: #666;
  cursor: not-allowed;
}

.filter-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.filter-buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.filter-btn {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid #e0e0e0;
  background: #333;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.filter-btn.active {
  background: #4f8cff;
  color: #333;
  border-color: #4f8cff;
}

.search-box {
  flex: 1;
  max-width: 300px;
}

.search-input {
  width: 100%;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid #e0e0e0;
  font-size: 0.95rem;
}

.versions-container {
  min-height: 400px;
}

.loading-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 0;
  color: #666;
  gap: 16px;
}

.error-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 0;
  color: #ff6b6b;
  gap: 16px;
  text-align: center;
}

.error-icon {
  font-size: 3rem;
}

.error-text {
  font-size: 1.1rem;
  max-width: 400px;
}

.retry-btn {
  padding: 10px 20px;
  background: #4f8cff;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: background 0.2s;
}

.retry-btn:hover {
  background: #3d7ae8;
}

.no-versions {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 0;
  color: #666;
  gap: 16px;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid rgba(79, 140, 255, 0.2);
  border-radius: 50%;
  border-top-color: #4f8cff;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.no-versions {
  text-align: center;
  padding: 48px 0;
  color: #666;
  font-size: 1.1rem;
}

.version-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}

.version-card {
  background: #333;
  border-radius: 10px;
  padding: 16px;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.05);
  transition: all 0.2s;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 120px;
}

.version-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 6px 15px rgba(79, 140, 255, 0.1);
}

.version-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.version-id {
  font-weight: bold;
  font-size: 1.1rem;
}

.version-type-badge {
  font-size: 0.75rem;
  padding: 3px 8px;
  border-radius: 100px;
  color: #333;
}

.version-type-badge.release {
  background: #4caf50;
}

.version-type-badge.snapshot {
  background: #ff9800;
}

.version-type-badge.old_beta {
  background: #9c27b0;
}

.version-type-badge.old_alpha {
  background: #795548;
}

.version-date {
  color: #777;
  font-size: 0.9rem;
  margin-bottom: 16px;
}

.download-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 0;
  border-radius: 6px;
  background: #444;
  color: #4f8cff;
  font-weight: 500;
  transition: all 0.2s;
  gap: 8px;
}

.download-btn:hover {
  background: #555;
}

.download-btn .icon {
  width: 16px;
  height: 16px;
  fill: currentColor;
}
</style>
