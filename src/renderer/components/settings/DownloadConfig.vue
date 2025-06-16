<template>
  <div class="mc-directory-config">
    <h3>Minecraft 目录配置</h3>
    <div class="directory-form">
      <div class="form-group">
        <label>Minecraft 目录:</label>
        <div class="path-display">
          <span class="path-text" :title="mcDirectory">{{ displayPath }}</span>
        </div>
        <div class="button-group">
          <button @click="selectMcDirectory" class="btn primary">选择目录</button>
          <button @click="resetToDefault" class="btn secondary">重置为默认</button>
        </div>
      </div>
      <div class="info-section" v-if="mcDirectory">
        <div class="info-item">
          <span class="info-label">当前设置:</span>
          <span class="info-value">{{ mcDirectory }}</span>
        </div>
        <p class="info-text">Minecraft所有游戏文件将被下载到此目录。包含游戏核心、资源文件、库文件等。</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import ConfigService from '@/services/ConfigService';
import { logger } from '@/services/Logger';
import path from 'path';
import os from 'os';

const mcDirectory = ref('');
const router = useRouter();

const displayPath = computed(() => {
  if (!mcDirectory.value) return '未设置';
  if (mcDirectory.value.length > 40) {
    const parts = mcDirectory.value.split(path.sep);
    if (parts.length > 4) {
      return `${parts[0]}${path.sep}...${path.sep}${parts.slice(-2).join(path.sep)}`;
    }
  }
  return mcDirectory.value;
});

onMounted(async () => {
  try {
    // 从配置服务中获取 mcDirectory
    const defaultDir = path.join(os.homedir(), '.minecraft');
    const dir = await window.electronAPI.getConfig('mcDirectory', defaultDir);
    mcDirectory.value = dir;
  } catch (error) {
    logger.error('加载Minecraft目录配置失败', error);
  }
});

async function selectMcDirectory() {
  try {
    const result = await window.electronAPI.selectFile({
      title: '选择Minecraft目录',
      properties: ['openDirectory', 'createDirectory']
    });
    
    if (!result.canceled && result.filePaths.length > 0) {
      const selectedDir = result.filePaths[0];
      mcDirectory.value = selectedDir;
      
      // 保存到配置
      await window.electronAPI.setConfig('mcDirectory', selectedDir);
      logger.info(`Minecraft目录已设置为: ${selectedDir}`);
    }
  } catch (error) {
    logger.error('选择Minecraft目录失败', error);
  }
}

async function resetToDefault() {
  try {
    const defaultDir = path.join(os.homedir(), '.minecraft');
    mcDirectory.value = defaultDir;
    
    // 保存到配置
    await window.electronAPI.setConfig('mcDirectory', defaultDir);
    logger.info(`Minecraft目录已重置为默认: ${defaultDir}`);
  } catch (error) {
    logger.error('重置Minecraft目录失败', error);
  }
}
</script>

<style scoped>
.mc-directory-config {
  margin: 20px 0;
  padding: 20px;
  border-radius: 10px;
  background: #f8f9fa;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

h3 {
  margin-top: 0;
  margin-bottom: 20px;
  font-size: 1.3rem;
  color: #333;
}

.directory-form {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.form-group label {
  font-weight: 600;
  color: #444;
}

.path-display {
  background: white;
  border: 1px solid #ddd;
  padding: 10px;
  border-radius: 5px;
  word-break: break-all;
  min-height: 40px;
  display: flex;
  align-items: center;
}

.path-text {
  font-family: monospace;
}

.button-group {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
}

.primary {
  background: #4f8cff;
  color: white;
}

.primary:hover {
  background: #3a7def;
}

.secondary {
  background: #f0f0f0;
  color: #333;
}

.secondary:hover {
  background: #e0e0e0;
}

.info-section {
  border-top: 1px solid #eee;
  padding-top: 15px;
  margin-top: 10px;
}

.info-item {
  margin-bottom: 10px;
}

.info-label {
  font-weight: 600;
  margin-right: 10px;
  color: #555;
}

.info-value {
  font-family: monospace;
  color: #333;
  word-break: break-all;
}

.info-text {
  font-size: 0.9rem;
  color: #666;
  line-height: 1.5;
  margin: 10px 0 0;
}
</style>
