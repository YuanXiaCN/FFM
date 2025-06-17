<template>    <div class="download-select-modal" @click="handleBackdropClick">
        <div class="download-select" @click.stop>
            <div v-if="step === 1" class="step-content">
                <div class="version-list">
                    <div v-if="loading" class="loading">正在加载版本列表...</div>
                    <div v-else>
                        <div v-for="ver in versions" :key="ver.id"
                            :class="['version-item', selectedVersion === ver.id ? 'selected' : '']"
                            @click="selectVersion(ver)">
                            <span class="ver-name">{{ ver.id }}</span>
                            <span class="ver-type">{{ ver.type }}</span>
                            <span v-if="ver.releaseTime" class="ver-date">{{ ver.releaseTime.split('T')[0] }}</span>
                        </div>
                    </div>
                </div>
                <div class="button-group">
                    <button class="cancel-btn" @click="closeModal">取消</button>
                    <button class="next-btn" :disabled="!selectedVersion" @click="step = 2">下一步</button>
                </div>
            </div>            <div v-else-if="step === 2 && !showLoaderVersions" class="step-content">                <div class="selection-header">
                    <div class="version-info">
                        <input 
                            v-model="editableVersionName" 
                            class="version-name-input" 
                            type="text" 
                            placeholder="输入版本名称"
                            @blur="initializeEditableVersionName"
                        />
                    </div>
                </div>
                
                <div class="section-title">Mod加载器</div>
                <div class="loader-selection">
                    <div v-for="loader in modLoaders" :key="loader.type"
                        :class="['loader-option', selectedLoader === loader.type ? 'selected' : '']"
                        @click="handleLoaderClick(loader)">
                        <div class="option-content">
                            <span class="option-name">{{ loader.label }}</span>
                            <span class="option-status">{{ loader.status }}</span>
                        </div>
                        <svg class="arrow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M9 18l6-6-6-6"/>
                        </svg>
                    </div>
                </div>

                <div class="section-title">光影加载器</div>
                <div class="shader-selection">
                    <div v-for="shader in availableShaders" :key="shader.type"
                        :class="['shader-option', selectedShader === shader.type ? 'selected' : '', !shader.available ? 'disabled' : '']"
                        @click="shader.available && selectShader(shader)">
                        <div class="option-content">
                            <span class="option-name">{{ shader.label }}</span>
                            <span class="option-status">{{ shader.status }}</span>
                        </div>
                        <svg v-if="shader.available" class="arrow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M9 18l6-6-6-6"/>
                        </svg>
                    </div>
                </div>                <div class="install-info">
                    <div class="version-display">
                        <span class="install-version">Minecraft {{ selectedVersionName }} </span>
                    </div>
                    <button class="install-btn" @click="confirmDownload">开始下载</button>
                </div>
            </div>

            <!-- Mod加载器版本选择界面 -->
            <div v-else-if="step === 2 && showLoaderVersions" class="step-content">
                <div class="version-select-header">
                    <h3>{{ currentLoaderType.label }} 版本选择</h3>
                </div>
                
                <div class="loader-versions">
                    <div v-for="version in currentLoaderVersions" :key="version.id"
                        :class="['version-option', selectedLoaderVersion === version.id ? 'selected' : '']"
                        @click="selectLoaderVersion(version)">
                        <div class="version-content">
                            <span class="version-id">{{ version.id }}</span>
                            <span class="version-meta">{{ version.type }} {{ version.date }}</span>
                        </div>
                    </div>
                </div>

                <div class="button-group">
                    <button class="confirm-btn" :disabled="!selectedLoaderVersion" @click="confirmLoaderVersion">确认选择</button>
                </div>
            </div>            <div v-if="errorMsg" class="error-msg">{{ errorMsg }}</div>
            <button class="close-btn" @click="closeModal">×</button>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import axios from 'axios'
import { DOWNLOAD_SOURCES } from '@/services/downloadSources.js'
import { useRouter } from 'vue-router'

const props = defineProps({
    selectedVersion: {
        type: Object,
        default: null
    }
})

const step = ref(props.selectedVersion ? 2 : 1)
const versions = ref([])
const loading = ref(true)
const selectedVersion = ref(props.selectedVersion ? props.selectedVersion.id : '')
const editableVersionName = ref('')
const selectedLoader = ref('') // 默认为空，未选择时使用原版
const selectedShader = ref('') // 默认为空，未选择时不使用光影
const errorMsg = ref('')

// 新增状态
const showLoaderVersions = ref(false)
const currentLoaderType = ref(null)
const selectedLoaderVersion = ref('')
const currentLoaderVersions = ref([])

// 计算属性：选择的版本名称
const selectedVersionName = computed(() => {
    if (props.selectedVersion) {
        return props.selectedVersion.id
    }
    const version = versions.value.find(v => v.id === selectedVersion.value)
    return version ? version.id : 'Minecraft 1.16.5'
})

// 初始化可编辑版本名称
const initializeEditableVersionName = () => {
    if (!editableVersionName.value) {
        editableVersionName.value = selectedVersionName.value
    }
}

// 监听版本变化，更新可编辑名称
watch(selectedVersionName, (newName) => {
    if (!editableVersionName.value) {
        editableVersionName.value = newName
    }
}, { immediate: true })

const modLoaders = [
    { type: 'forge', label: 'Forge', status: '可以安装' },
    { type: 'fabric', label: 'Fabric', status: '可以安装' }
]

const shaders = [
    { type: 'optifine', label: 'OptiFine', available: false },
    { type: 'iris', label: 'IRIS', available: true, version: 'iris-1.2.1' }
]

// 计算可用的光影加载器（根据选择的 Mod 加载器）
const availableShaders = computed(() => {
    return shaders.map(shader => {
        let status = ''
        let available = true
        
        if (shader.type === 'optifine') {
            status = '没有可用版本'
            available = false
        } else if (shader.type === 'iris') {
            if (selectedLoader.value === 'fabric') {
                status = `已选择: ${shader.version}`
                available = true
            } else {
                status = '需要 Fabric'
                available = false
            }
        }
        
        return {
            ...shader,
            status,
            available
        }
    })
})

function selectVersion(ver) {
    selectedVersion.value = ver.id
    errorMsg.value = ''
}

function selectLoader(loader) {
    selectedLoader.value = loader.type
    // 当选择了不同的加载器时，重置光影选择
    if (selectedShader.value && selectedShader.value !== '') {
        const availableShader = availableShaders.value.find(s => s.type === selectedShader.value)
        if (!availableShader || !availableShader.available) {
            selectedShader.value = ''
        }
    }
    errorMsg.value = ''
}

// 处理 Mod 加载器点击 - 显示版本选择或直接选择
function handleLoaderClick(loader) {
    // Forge 和 Fabric 显示版本选择界面
    currentLoaderType.value = loader
    showLoaderVersions.value = true
    loadLoaderVersions(loader.type)
}

// 加载 Mod 加载器版本列表
function loadLoaderVersions(loaderType) {
    // 模拟版本数据
    const mockVersions = [
        { id: '36.2.42', type: '最新版', date: '2024/03/06 03:25' },
        { id: '36.2.41', type: '最新版', date: '2024/03/05 15:30' },
        { id: '36.2.40', type: '最新版', date: '2024/03/04 10:15' }
    ]
    currentLoaderVersions.value = mockVersions
}

// 选择 Mod 加载器版本
function selectLoaderVersion(version) {
    selectedLoaderVersion.value = version.id
}

// 确认 Mod 加载器版本选择
function confirmLoaderVersion() {
    selectedLoader.value = currentLoaderType.value.type
    showLoaderVersions.value = false
    errorMsg.value = ''
}

function selectShader(shader) {
    if (shader.available) {
        selectedShader.value = shader.type
        errorMsg.value = ''
    }
}

// 关闭弹窗函数
function closeModal() {
    emit('close')
}

// 处理背景点击事件
function handleBackdropClick() {
    closeModal()
}

async function fetchVersions() {
    if (step.value !== 1) return; // 如果不是第一步，不需要获取版本列表

    loading.value = true
    errorMsg.value = ''
    try {
        const manifestUrl = DOWNLOAD_SOURCES[0].meta.versionManifest
        const res = await axios.get(manifestUrl)
        versions.value = res.data.versions
    } catch (e) {
        errorMsg.value = '版本列表加载失败，请检查网络或下载源设置'
    }
    loading.value = false
}

// 监听props变更
watch(() => props.selectedVersion, (newVal) => {
    if (newVal) {
        selectedVersion.value = newVal.id
        step.value = 2
    }
}, { immediate: true })

onMounted(fetchVersions)

// 关闭弹窗支持
const emit = defineEmits(['close'])
const router = useRouter()

onMounted(() => {
    window.addEventListener('keydown', escClose)
})
function escClose(e) {
    if (e.key === 'Escape') emit('close')
}

onUnmounted(() => {
    window.removeEventListener('keydown', escClose)
})

function confirmDownload() {
    // 调试输出
    console.log('下载参数', selectedVersion.value, selectedLoader.value, selectedShader.value)
    console.log('用户编辑的版本名称:', editableVersionName.value)
    if (!selectedVersion.value) {
        errorMsg.value = '请选择Minecraft版本'
        return
    }
    
    // 如果用户未选择加载器，使用原版
    const actualLoader = selectedLoader.value || 'vanilla'
    // 如果用户未选择光影，使用无光影
    const actualShader = selectedShader.value || 'none'
    
    // 更新状态提示
    errorMsg.value = '正在准备下载...';
    
    console.log('准备跳转到下载监控页面...');
    
    // 先关闭当前弹窗
    emit('close');
    
    // 立即跳转到下载进度页面，携带下载参数
    router.push({
        path: '/download-progress',
        query: {
            version: selectedVersion.value,
            loader: actualLoader,
            shader: actualShader,
            customName: editableVersionName.value || selectedVersionName.value,
            autoStart: 'true' // 标记自动启动下载
        }
    }).then(() => {
        console.log('已成功跳转到下载监控页面');
    }).catch(error => {
        console.error('跳转失败:', error);
    });
}
</script>

<style scoped>
.download-select-modal {
    position: fixed;
    left: 0;
    top: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
}

.download-select {
    max-width: 750px;
    width: 90vw;
    margin: 20px auto;
    background: rgba(51, 51, 51, 0.85);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    box-shadow: 
        0 8px 32px rgba(0, 0, 0, 0.3),
        0 2px 8px rgba(0, 0, 0, 0.2),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
    padding: 24px 32px 20px 32px;
}

.step-content {
    min-height: 180px;
}

/* 分区标题 */
.section-title {
    font-size: 1.2rem;
    font-weight: bold;
    color: #ffffff;
    margin: 20px 0 12px 0;
}

.section-title:first-child {
    margin-top: 0;
}

/* 版本信息头部 */
.selection-header {
    margin-bottom: 16px;
    padding: 12px 16px;
    background: transparent;
    border-radius: 8px;
    border: none;
}

.version-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.info-label {
    font-size: 0.9rem;
    color: #999;
}

.version-name {
    font-size: 1.1rem;
    font-weight: bold;
    color: #ffffff;
}

.version-name-input {
    font-size: 1.1rem;
    font-weight: bold;
    color: #ffffff;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    padding: 4px 0;
    outline: none;
    width: 100%;
    font-family: inherit;
    transition: border-color 0.3s ease;
}

.version-name-input:hover {
    border-bottom-color: #555;
}

.version-name-input:focus {
    border-bottom-color: #007acc;
}

/* 安装信息底部 */
.install-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 16px;
    padding: 12px 16px;
    background: transparent;
    border-radius: 8px;
    border: none;
}

.version-display {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.install-version {
    font-size: 1rem;
    color: #ffffff;
}

.back-link {
    background: none;
    border: none;
    color: #4f8cff;
    cursor: pointer;
    font-size: 0.85rem;
    text-decoration: underline;
    padding: 0;
    text-align: left;
}

.back-link:hover {
    color: #6ba0ff;
}

.install-btn {
    background: #4f8cff;
    color: white;
    border: none;
    border-radius: 6px;
    padding: 10px 20px;
    cursor: pointer;
    font-size: 0.95rem;
    transition: background-color 0.2s;
}

.install-btn:hover:not(:disabled) {
    background: #6ba0ff;
}

.install-btn:disabled {
    background: #666;
    cursor: not-allowed;
    opacity: 0.6;
}

.version-list {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 24px;
}

.loader-selection,
.shader-selection {
    margin-bottom: 16px;
}

.loader-option,
.shader-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: rgba(68, 68, 68, 0.7);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    border-radius: 8px;
    padding: 12px 20px;
    margin-bottom: 6px;
    cursor: pointer;
    border: 2px solid transparent;
    transition: all 0.2s ease;
}

.loader-option:hover,
.shader-option:hover {
    background: rgba(74, 74, 74, 0.8);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
}

.loader-option.selected,
.shader-option.selected {
    border: 2px solid #4f8cff;
    background: rgba(74, 74, 74, 0.9);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
}

.shader-option.disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.shader-option.disabled:hover {
    background: #444;
}

.option-content {
    display: flex;
    flex-direction: row;
    gap: 8px;
    align-items: center;
    justify-content: space-between;
    width: 100%;
}

.option-name {
    font-size: 1.1rem;
    font-weight: 500;
    color: #ffffff;
}

.option-status {
    font-size: 0.9rem;
    color: #999;
}

.loader-option.selected .option-status,
.shader-option.selected .option-status {
    color: #4f8cff;
}

.arrow-icon {
    width: 20px;
    height: 20px;
    color: #999;
    flex-shrink: 0;
}

.loader-option.selected .arrow-icon,
.shader-option.selected .arrow-icon {
    color: #4f8cff;
}

.version-item {
    background: #444;
    border-radius: 8px;
    padding: 12px 18px;
    cursor: pointer;
    border: 2px solid transparent;
    transition: border 0.2s, box-shadow 0.2s;
    min-width: 110px;
    text-align: center;
    font-size: 1rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
}

.version-item.selected {
    border: 2px solid #4f8cff;
    box-shadow: 0 2px 8px rgba(79, 140, 255, 0.08);
    background: #555;
}

.button-group {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
}

.cancel-btn,
.prev-btn,
.next-btn {
    padding: 10px 20px;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.95rem;
    transition: background-color 0.2s;
}

.cancel-btn {
    background: #666;
    color: white;
}

.cancel-btn:hover {
    background: #777;
}

.prev-btn {
    background: #666;
    color: white;
}

.prev-btn:hover {
    background: #777;
}

.next-btn {
    background: #4f8cff;
    color: white;
}

.next-btn:hover:not(:disabled) {
    background: #6ba0ff;
}

.next-btn:disabled {
    background: #666;
    cursor: not-allowed;
    opacity: 0.6;
}

.ver-name {
    font-weight: bold;
}

.ver-type {
    color: #888;
    margin-left: 8px;
}

.ver-date {
    color: #aaa;
    font-size: 0.95em;
    margin-left: 8px;
}

.next-btn,
.prev-btn {
    min-width: 100px;
    padding: 8px 0;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    margin-right: 12px;
    background: linear-gradient(90deg, #4f8cff 60%, #6ad1ff 100%);
    color: #333;
    font-weight: bold;
    cursor: pointer;
    transition: background 0.2s;
}

.next-btn:disabled {
    background: #e0e0e0;
    color: #aaa;
    cursor: not-allowed;
}

.loading {
    color: #888;
    text-align: center;
    padding: 40px 0;
}

.close-btn {
    position: absolute;
    right: 18px;
    top: 12px;
    font-size: 1.6rem;
    background: none;
    border: none;
    color: #888;
    cursor: pointer;
    transition: color 0.2s;
}

.close-btn:hover {
    color: #4f8cff;
}

.error-msg {
    color: #e74c3c;
    margin-bottom: 10px;
    text-align: center;
}
</style>
