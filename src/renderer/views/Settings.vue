<template>
  <div class="settings-modern">
    <div class="settings-modern-sidebar">
      <div v-for="item in sidebarList" :key="item.key" :class="['modern-sidebar-item', currentTab===item.key ? 'active' : '']" @click="currentTab=item.key">
        <span class="modern-sidebar-icon" v-html="item.icon"></span>
        <span class="modern-sidebar-label">{{ item.label }}</span>
      </div>
    </div>
    <div class="settings-modern-content">
      <transition name="settings-fade" mode="out-in">
        <component :is="currentComponent" :key="currentTab">
          <!-- 启动器设置 -->
          <template v-if="currentTab === 'launcher'">
            <div class="modern-card">
              <div class="modern-card-title">启动器设置</div>
              <div class="modern-card-section">
                <div class="modern-section-title">个性化</div>
                <div class="modern-setting-grid">
                  <div class="modern-setting-block">
                    <div class="modern-setting-label">主题切换</div>
                    <select v-model="theme" class="modern-select wide">
                      <option v-for="opt in themeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                    </select>
                  </div>
                  <div class="modern-setting-block">
                    <div class="modern-setting-label">界面缩放</div>
                    <input type="range" min="1" max="4" step="1" v-model="scale" class="modern-slider wide" />
                    <span>{{ scale }}x</span>
                  </div>
                  <div class="modern-setting-block">
                    <div class="modern-setting-label">语言</div>
                    <select v-model="lang" class="modern-select wide">
                      <option value="zh">中文</option>
                      <option value="en">English</option>
                    </select>
                  </div>
                  <div class="modern-setting-block">
                    <div class="modern-setting-label">缓存大小限制</div>
                    <div style="display: flex; align-items: center;">
                      <input type="number" min="1" v-model="cacheLimitValue" class="modern-input wide" />
                      <select v-model="cacheLimitUnit" class="modern-select unit-select">
                        <option value="MB">MB</option>
                        <option value="GB">GB</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div class="modern-card-section">
                  <div class="modern-section-title">内存设置</div>
                  <div class="modern-setting-block">
                    <label><input type="radio" v-model="memoryMode" value="auto" /> 自动配置</label>
                    <label><input type="radio" v-model="memoryMode" value="manual" /> 手动配置</label>
                    <div v-if="memoryMode === 'manual'" style="display: flex; align-items: center;">
                      <input type="number" min="512" max="16384" v-model="memorySize" class="modern-input" /> MB
                    </div>
                  </div>
                </div>
              </div>
              <div class="modern-card-section">
                <div class="modern-section-title">开发者模式</div>
                <label class="modern-switch">
                  <input type="checkbox" v-model="devMode" />
                  <span class="modern-switch-slider"></span>
                  <span class="modern-switch-label">开发者模式</span>
                </label>
                <div v-if="devMode" class="modern-setting-block">
                  <label class="modern-switch">
                    <input type="checkbox" v-model="debugMode" />
                    <span class="modern-switch-slider"></span>
                    <span class="modern-switch-label">调试模式</span>
                  </label>                  <div class="modern-setting-label">日志记录级别</div>
                  <select v-model="logLevel" class="modern-select">
                    <option value="debug">Debug (最详细)</option>
                    <option value="info">Info (标准)</option>
                    <option value="warn">Warning (警告)</option>
                    <option value="error">Error (仅错误)</option>
                  </select>
                </div>
              </div>
            </div>
          </template>          <!-- 游戏设置 -->
          <template v-else-if="currentTab === 'game'">
            <div class="modern-card">
              <div class="modern-card-title">游戏设置</div>
              
              <!-- Minecraft目录配置组件 -->
              <DownloadConfig />
              
              <div class="modern-card-section">
                <div class="modern-section-title">文件设置</div>
                <div class="modern-setting-grid">
                  <div class="modern-setting-block">
                    <div class="modern-setting-label">版本隔离</div>
                    <select v-model="versionIsolation" class="modern-select">
                      <option value="none">无</option>
                      <option value="byVersion">按版本</option>
                    </select>
                  </div>
                  <div class="modern-setting-block">
                    <div class="modern-setting-label">默认游戏文件夹</div>
                    <button class="modern-btn wide" @click="selectGameFolder">选择路径</button>
                    <div v-if="gameFolder" class="modern-path" :title="gameFolder" @click="copyPath(gameFolder)" @dblclick="editPath('game')">{{ showPath(gameFolder) }}</div>
                    <input v-if="editingPath==='game'" class="modern-input wide" v-model="gameFolder" @blur="editingPath=''" @keyup.enter="editingPath=''" />
                  </div>
                  <div class="modern-setting-block">
                    <div class="modern-setting-label">缓存文件夹</div>
                    <button class="modern-btn wide" @click="selectCacheFolder">选择路径</button>
                    <div v-if="cacheFolder" class="modern-path" :title="cacheFolder" @click="copyPath(cacheFolder)" @dblclick="editPath('cache')">{{ showPath(cacheFolder) }}</div>
                    <input v-if="editingPath==='cache'" class="modern-input wide" v-model="cacheFolder" @blur="editingPath=''" @keyup.enter="editingPath=''" />
                  </div>
                  <div class="modern-setting-block">
                    <div class="modern-setting-label">缓存清理</div>
                    <div style="display: flex; align-items: center;">
                      <input type="number" min="1" max="30" v-model="autoCleanDays" class="modern-input" />
                      <span>天自动清理</span>
                      <button class="modern-btn" @click="cleanCache">立即清理</button>
                    </div>
                  </div>
                  <div class="modern-setting-block">
                    <div class="modern-setting-label">缓存大小限制</div>
                    <input type="number" min="1" v-model="cacheLimitValue" class="modern-input wide" />
                    <select v-model="cacheLimitUnit" class="modern-select unit-select">
                      <option value="MB">MB</option>
                      <option value="GB">GB</option>
                    </select>
                  </div>
                  <div class="modern-setting-block">
                    <div class="modern-setting-label">动画时长</div>
                    <input type="range" min="0.15" max="1.2" step="0.01" v-model="transitionDuration" class="modern-slider wide" />
                    <span>{{ (transitionDuration * 1000).toFixed(0) }} ms</span>
                  </div>
                </div>
              </div>
              <div class="modern-card-section">
                <div class="modern-section-title">内存设置</div>
                <div class="modern-setting-block">
                  <label><input type="radio" v-model="memoryMode" value="auto" /> 自动配置</label>
                  <label><input type="radio" v-model="memoryMode" value="manual" /> 手动配置</label>
                  <div v-if="memoryMode === 'manual'">
                    <input type="number" min="512" max="16384" v-model="memorySize" class="modern-input" /> MB
                  </div>
                </div>
              </div>
              <div class="modern-card-section">
                <div class="modern-section-title">环境设置</div>
                <div class="modern-setting-block">
                  <div class="modern-setting-label">Java配置</div>
                  <select v-model="selectedJava" class="modern-select wide">
                    <option value="">请选择Java运行时</option>
                    <option v-for="java in javaList" :key="java.path" :value="java.path">
                      {{ java.displayName || `${java.type || ''} ${java.majorVersion || ''} (${java.version})` }}
                    </option>
                  </select>
                  <div class="button-group">
                    <button class="modern-btn" @click="searchJava" :disabled="isSearching">{{ isSearching ? '搜索中...' : '自动搜索' }}</button>
                    <button class="modern-btn" @click="importJava">手动导入</button>
                  </div>
                  <div v-if="javaList.length > 0 && devMode && debugMode" class="jre-results">
                    <div v-for="java in javaList" :key="java.path" class="jre-item">
                      <span class="java-version">{{ java.displayName || `${java.type || 'JRE'} ${java.majorVersion || ''} (${java.version})` }}</span>
                      <span class="java-path" :title="java.path">{{ showPath(java.path) }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </template>
          <!-- 高级设置 -->
          <template v-else-if="currentTab === 'advanced'">
            <div class="modern-card">
              <div class="modern-card-title">高级设置</div>
              <div class="modern-card-section">
                <div class="modern-section-title">JVM参数</div>
                <div class="modern-setting-block">
                  <input type="text" v-model="jvmArgs" placeholder="-Xmx2G ..." class="modern-input" />
                </div>          <div class="modern-setting-inline">
                  <input type="checkbox" v-model="highPerfGPU" class="modern-checkbox" id="highPerfGPU" />
                  <label for="highPerfGPU" class="modern-setting-label">使Java使用高性能显卡</label>
                </div>
              </div>
              <div class="modern-card-section">
                <div class="modern-section-title">下载设置</div>
                <div class="modern-setting-grid">
                  <div class="modern-setting-block">
                    <div class="modern-setting-label">文件下载源</div>
                    <select v-model="downloadSource" class="modern-select">
                      <option v-for="source in downloadSourceOptions" :key="source.value" :value="source.value">{{ source.label }}</option>
                    </select>
                  </div>
                  <div class="modern-setting-block">
                    <div class="modern-setting-label">线程限制</div>
                    <input type="number" min="1" max="128" v-model="threadLimit" class="modern-input" />
                  </div>
                  <div class="modern-setting-block">
                    <div class="modern-setting-label">速度限制</div>
                    <input type="number" min="1" v-model="speedLimit" placeholder="无限制" class="modern-input" />
                  </div>
                </div>
              </div>
              <div class="modern-card-section">
                <div class="modern-section-title">网络与下载</div>
                <div class="modern-setting-grid">
                  <div class="modern-setting-block">
                    <div class="modern-setting-label">禁用SSL证书验证</div>
                    <label class="modern-switch">
                      <input type="checkbox" :checked="disableSSLVerify" @change="onSSLCheckboxChange" />
                      <span class="modern-switch-slider"></span>
                      <span class="modern-switch-label">禁用SSL证书验证</span>
                    </label>
                  </div>
                  <div class="modern-setting-block">
                    <div class="modern-setting-label">文件下载源</div>
                    <select v-model="downloadSource" class="modern-select">
                      <option v-for="opt in downloadSourceOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                    </select>
                  </div>
                </div>
              </div>
              <div class="modern-card-section">
                <div class="modern-section-title">SSL证书验证</div>
                <label class="modern-switch">
                  <input type="checkbox" v-model="disableSSLVerify" @change="onSSLCheckboxChange" />
                  <span class="modern-switch-slider"></span>
                  <span class="modern-switch-label">禁用SSL证书验证</span>
                </label>
                <CustomDialog v-if="showSSLDialog" @confirm="onSSLDialogConfirm" @cancel="onSSLDialogCancel">
                  <template #title>
                    <div class="dialog-title">警告</div>
                  </template>
                  <template #content>
                    <div class="dialog-content">
                      <p>禁用SSL证书验证可能会导致安全风险，您确定要继续吗？</p>
                    </div>
                  </template>
                </CustomDialog>
              </div>
            </div>
          </template>
        </component>
      </transition>
    </div>
  </div>
</template>

<script setup>
import { ref, watchEffect, onMounted, watch, computed, defineComponent, h } from 'vue'
import { logger } from '@/services/Logger.js'
import CustomDialog from '@/components/settings/CustomDialog.vue'
import DownloadConfig from '@/components/settings/DownloadConfig.vue'
import { DOWNLOAD_SOURCES } from '@/services/downloadSources.js'

// 添加一个包装组件来处理内容切换
const currentComponent = computed(() => {
  return defineComponent({
    render() {
      return h('div', { class: 'settings-card-container' }, this.$slots.default())
    }
  })
})

// 添加防抖函数
function debounce(fn, delay) {
  let timeoutId
  return function (...args) {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn.apply(this, args), delay)
  }
}

// 设置的响应式变量
const currentTab = ref('launcher')
const theme = ref('light')
const scale = ref(1)
const lang = ref('zh')
const opacity = ref(100)
const defaultHome = ref('settings')
const devMode = ref(false)
const debugMode = ref(false)
const logLevel = ref('info')
const versionIsolation = ref('none')
const gameFolder = ref('')
const cacheFolder = ref('')
const autoCleanDays = ref(7)
const cacheLimitValue = ref(1024)
const cacheLimitUnit = ref('MB')
const memoryMode = ref('auto')
const memorySize = ref(2048)
const javaConfig = ref('auto')
const jrePaths = ref([])
const jvmArgs = ref('')
const highPerfGPU = ref(false)
const downloadSource = ref('official')
const threadLimit = ref(8)
const speedLimit = ref('')
const bgPath = ref('')
const editingPath = ref('')
const selectedJava = ref('')
const javaList = ref([])
const isSearching = ref(false)
const transitionDuration = ref(0.4)

// SSL证书验证设置
const disableSSLVerify = ref(false)
const showSSLDialog = ref(false)

function onSSLCheckboxChange(e) {
  if (e.target.checked) {
    showSSLDialog.value = true
  } else {
    disableSSLVerify.value = false
  }
}
function onSSLDialogConfirm() {
  disableSSLVerify.value = true
  showSSLDialog.value = false
}
function onSSLDialogCancel() {
  disableSSLVerify.value = false
  showSSLDialog.value = false
}

// 下载源选项
const downloadSourceOptions = DOWNLOAD_SOURCES.map(s => ({ value: s.key, label: s.label }))

// 使用防抖来避免频繁保存
const saveSettingsDebounced = debounce(async (settings) => {
  try {
    await window.electronAPI.saveSettings(settings)
    logger.info('设置已保存')
  } catch (error) {
    logger.error('保存设置失败', error)
  }
}, 500)

// 监听所有设置变化并保存
watchEffect(() => {
  const settings = {
    theme: theme.value,
    scale: scale.value,
    lang: lang.value,
    opacity: opacity.value,
    defaultHome: defaultHome.value,
    devMode: devMode.value,
    debugMode: debugMode.value,
    logLevel: logLevel.value,
    versionIsolation: versionIsolation.value,
    gameFolder: gameFolder.value,
    cacheFolder: cacheFolder.value,
    autoCleanDays: autoCleanDays.value,
    cacheLimitValue: cacheLimitValue.value,
    cacheLimitUnit: cacheLimitUnit.value,
    memoryMode: memoryMode.value,
    memorySize: memorySize.value,
    javaConfig: javaConfig.value,
    jvmArgs: jvmArgs.value,
    highPerfGPU: highPerfGPU.value,
    downloadSource: downloadSource.value,
    threadLimit: threadLimit.value,
    speedLimit: speedLimit.value,
    transitionDuration: transitionDuration.value,
  }
  saveSettingsDebounced(settings)
})

// 组件加载时读取设置
onMounted(async () => {
  const settings = await window.electronAPI.loadSettings()
  theme.value = settings.theme
  scale.value = settings.scale
  lang.value = settings.lang
  opacity.value = settings.opacity
  defaultHome.value = settings.defaultHome
  devMode.value = settings.devMode
  debugMode.value = settings.debugMode || false
  logLevel.value = settings.logLevel
  versionIsolation.value = settings.versionIsolation
  gameFolder.value = settings.gameFolder
  cacheFolder.value = settings.cacheFolder
  autoCleanDays.value = settings.autoCleanDays
  cacheLimitValue.value = settings.cacheLimitValue
  cacheLimitUnit.value = settings.cacheLimitUnit
  memoryMode.value = settings.memoryMode
  memorySize.value = settings.memorySize
  javaConfig.value = settings.javaConfig
  jvmArgs.value = settings.jvmArgs
  highPerfGPU.value = settings.highPerfGPU
  downloadSource.value = settings.downloadSource
  threadLimit.value = settings.threadLimit
  speedLimit.value = settings.speedLimit
  transitionDuration.value = settings.transitionDuration || 0.4
  disableSSLVerify.value = settings.disableSSLVerify || false

  const configs = await window.electronAPI.getJavaConfigs()
  javaList.value = configs
  if (configs.length > 0) {
    selectedJava.value = configs[0].path
  }

  // 设置CSS变量
  document.documentElement.style.setProperty('--transition-duration', transitionDuration.value + 's')
})

watch(transitionDuration, (val) => {
  document.documentElement.style.setProperty('--transition-duration', val + 's')
})

const sidebarList = [
  { key: 'launcher', label: '软件设置',  },
  { key: 'game', label: '游戏设置',  },
  { key: 'advanced', label: '高级设置',  },
]
const themeOptions = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'oled', label: 'OLED' },
  { value: 'system', label: '跟随系统' },
]

function showPath(path) {
  if (!path) return ''
  if (path.length > 32) return path.slice(0, 14) + '...' + path.slice(-14)
  return path
}
function copyPath(path) {
  navigator.clipboard.writeText(path)
}
function editPath(type) {
  editingPath.value = type
}
function selectGameFolder() {
  // TODO: 调用 Electron/Node API 选择文件夹
  alert('选择路径功能待实现')
}
function selectCacheFolder() {
  alert('选择路径功能待实现')
}
function selectBg() {
  alert('选择图片功能待实现')
}
function cleanCache() {
  // 这里可以实现缓存清理逻辑
  alert('缓存已清理！')
}

async function searchJava() {
  try {
    isSearching.value = true
    const results = await window.electronAPI.searchJava()
    
    // 合并搜索结果和现有列表，去重
    const existingPaths = new Set(javaList.value.map(java => java.path))
    const newJavas = results.filter(java => !existingPaths.has(java.path))
    
    if (newJavas.length > 0) {
      javaList.value = [...javaList.value, ...newJavas]
      if (!selectedJava.value) {
        selectedJava.value = newJavas[0].path
      }    }
  } catch (error) {
    logger.error('搜索Java失败', error)
  } finally {
    isSearching.value = false
  }
}

async function importJava() {
  const result = await window.electronAPI.selectFile({
    title: '选择Java运行时',
    filters: [
      { name: 'Java可执行文件', extensions: ['exe'] }
    ],
    properties: ['openFile']
  })
  
  if (!result.canceled && result.filePaths.length > 0) {
    const javaPath = result.filePaths[0]
    const versionInfo = await window.electronAPI.importJava(javaPath)
    if (versionInfo.version !== 'unknown') {
      const exists = javaList.value.some(java => java.path === javaPath)
      if (!exists) {
        javaList.value.push(versionInfo)
      }
      selectedJava.value = javaPath
    }
  }
}

// 监听Java配置变化
watchEffect(() => {
  const settings = {
    theme: theme.value,
    scale: scale.value,
    lang: lang.value,
    opacity: opacity.value,
    defaultHome: defaultHome.value,
    devMode: devMode.value,
    logLevel: logLevel.value,
    versionIsolation: versionIsolation.value,
    gameFolder: gameFolder.value,
    cacheFolder: cacheFolder.value,
    autoCleanDays: autoCleanDays.value,
    cacheLimitValue: cacheLimitValue.value,
    cacheLimitUnit: cacheLimitUnit.value,
    memoryMode: memoryMode.value,
    memorySize: memorySize.value,
    javaConfig: javaConfig.value,
    jvmArgs: jvmArgs.value,
    highPerfGPU: highPerfGPU.value,
    downloadSource: downloadSource.value,
    threadLimit: threadLimit.value,
    speedLimit: speedLimit.value,
    selectedJava: selectedJava.value,
    transitionDuration: transitionDuration.value,
  }
  saveSettingsDebounced(settings)
})

// 监听日志级别变化并更新logger
watch(logLevel, (newLevel) => {
  const levelMap = {
    'debug': 0,
    'info': 1,
    'warn': 2,
    'error': 3
  };
  const numericLevel = levelMap[newLevel] || 1;
  logger.setLogLevel(numericLevel);
  logger.info(`日志级别已更改为: ${newLevel.toUpperCase()}`);
});

// 监听SSL证书验证设置变化并保存
watch(disableSSLVerify, (val) => {
  const settings = {
    theme: theme.value,
    scale: scale.value,
    lang: lang.value,
    opacity: opacity.value,
    defaultHome: defaultHome.value,
    devMode: devMode.value,
    logLevel: logLevel.value,
    versionIsolation: versionIsolation.value,
    gameFolder: gameFolder.value,
    cacheFolder: cacheFolder.value,
    autoCleanDays: autoCleanDays.value,
    cacheLimitValue: cacheLimitValue.value,
    cacheLimitUnit: cacheLimitUnit.value,
    memoryMode: memoryMode.value,
    memorySize: memorySize.value,
    javaConfig: javaConfig.value,
    jvmArgs: jvmArgs.value,
    highPerfGPU: highPerfGPU.value,
    downloadSource: downloadSource.value,
    threadLimit: threadLimit.value,
    speedLimit: speedLimit.value,
    disableSSLVerify: val
  }
  saveSettingsDebounced(settings)
})
</script>

<style scoped>
.jre-results {
  margin-top: 10px;
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid #eee;
  border-radius: 4px;
  padding: 5px;
}
.jre-results .modern-path {
  padding: 5px;
  margin: 2px 0;
  background: #f8f8f8;
  border-radius: 3px;
}
.button-group {
  margin-top: 10px;
}
.java-version {
  font-weight: bold;
}
.java-path {
  color: #555;
}
/**** 动画时长滑块样式可适当美化 ****/
.modern-setting-block input[type="range"] {
  accent-color: var(--accent-color);
  width: 120px;
  margin: 0 8px;
}

/* 设置界面切换动画 */
.settings-fade-enter-active,
.settings-fade-leave-active {
  transition: all var(--transition-duration) cubic-bezier(.22,1.5,.36,1);
}

.settings-fade-enter-from,
.settings-fade-leave-to {
  opacity: 0;
  transform: translateX(20px);
}

.settings-fade-enter-to,
.settings-fade-leave-from {
  opacity: 1;
  transform: translateX(0);
}

/* 侧边栏项目动画 */
.modern-sidebar-item {
  transition: all var(--transition-duration) cubic-bezier(.22,1.5,.36,1);
}

/* 包装容器样式 */
.settings-card-container {
  width: 100%;
}
</style>
