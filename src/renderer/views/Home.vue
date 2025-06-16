<template>
  <div class="home-container">
    <!-- 左侧版本区 -->
    <div class="home-left q-bounce">
      <transition name="q-fade-slide">
        <div v-if="favoriteVersions.length" class="favorite-section">
          <h3>收藏版本</h3>
          <div class="version-list">
            <div v-for="ver in favoriteVersions" :key="ver.id" class="version-card favorite q-bounce">
              <span class="version-name">{{ ver.name }}</span>
              <span class="version-type">{{ ver.type }}</span>
            </div>
          </div>
        </div>
      </transition>
      <transition name="q-fade-slide">
        <div class="recent-section">
          <h3>最近游玩</h3>
          <div class="version-list">
            <div v-for="ver in recentVersions" :key="ver.id" class="version-card q-bounce">
              <span class="version-name">{{ ver.name }}</span>
              <span class="version-type">{{ ver.type }}</span>
            </div>
          </div>
        </div>
      </transition>
    </div>
    <!-- 右侧启动区 -->
    <div class="home-right q-bounce">
      <transition name="q-pop">
        <button class="start-btn q-btn-bounce" @click="startGame">
          <span>开始游戏</span>
        </button>
      </transition>
      <transition name="q-fade-slide">
        <div class="prepare-info">
          <span>准备启动：</span>
          <span class="prepare-version">{{ selectedVersion.name }}</span>
        </div>
      </transition>
      <transition name="q-pop">
        <button class="select-btn q-btn-bounce" @click="goToVersionLibrary">
          版本选择
        </button>
      </transition>
      <button class="select-btn q-btn-bounce" @click="showDownloadSelect = true">
        下载新版本/Mod
      </button>
      <DownloadSelect v-if="showDownloadSelect" @close="showDownloadSelect = false" />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import DownloadSelect from './DownloadSelect.vue'
// mock 数据，后续可替换为实际数据
const favoriteVersions = ref([
  { id: '1', name: '1.21.3', type: 'Vanilla' }
])
const recentVersions = ref([
  { id: '1', name: '1.21.3', type: 'Vanilla' },
  { id: '2', name: '1.20.1', type: 'Forge' }
])
const selectedVersion = ref(favoriteVersions.value[0] || recentVersions.value[0])
const showDownloadSelect = ref(false)

function startGame() {
  // 启动游戏逻辑，后续实现
  alert(`即将启动 ${selectedVersion.value.name}`)
}
function goToVersionLibrary() {
  // 跳转到版本库页面，后续实现
  alert('跳转到版本库页面（待实现）')
}
</script>

<style scoped>
.home-container {
  display: flex;
  height: 100vh;
  background: var(--bg-primary);
  color: var(--text-primary);
}
.home-left {
  flex: 1.2;
  padding: 48px 32px 32px 48px;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 32px;
  background: var(--bg-secondary);
  border-radius: 0 32px 32px 0;
  box-shadow: 2px 0 16px rgba(var(--accent-color-rgb), 0.08);
  min-width: 420px;
  overflow-y: auto;
  max-height: 100vh;
;
}
.favorite-section h3,
.recent-section h3 {
  margin: 0 0 12px 0;
  font-size: 1.2rem;
  color: var(--accent-color);
  font-weight: 600;
}
.version-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.version-card {
  background: var(--bg-hover);
  border-radius: 12px;
  padding: 8px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 2px 8px rgba(var(--accent-color-rgb), 0.04);
  transition: transform 0.2s, box-shadow 0.2s;
  min-height: 36px;
  height: auto;
}
.version-card.favorite {
  border: 2px solid var(--accent-color);
}
.version-card:hover {
  transform: translateY(-2px) scale(1.03);
  box-shadow: 0 4px 16px rgba(var(--accent-color-rgb), 0.12);
}
.version-name {
  font-size: 1.1rem;
  font-weight: 500;
}
.version-type {
  font-size: 0.95rem;
  color: var(--text-secondary);
}
.home-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 32px;
  padding: 0 48px;
}
.start-btn {
  background: linear-gradient(90deg, var(--accent-color) 60%, #8e9fff 100%);
  color: #fff;
  font-size: 1.4rem;
  font-weight: 500;
  border: none;
  border-radius: 14px;
  padding: 18px 44px;
  box-shadow: 0 6px 24px rgba(var(--accent-color-rgb), 0.16);
  cursor: pointer;
  transition: transform 0.18s cubic-bezier(.4,2,.6,1), box-shadow 0.18s;
  outline: none;
  margin-bottom: 32px;
  margin-top: 48px;
}
.start-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 10px 32px rgba(var(--accent-color-rgb), 0.22);
}
.prepare-info {
  font-size: 1.1rem;
  color: var(--text-secondary);
  margin-bottom: 32px;
}
.prepare-version {
  color: var(--accent-color);
  font-weight: 600;
  margin-left: 8px;
}
.select-btn {
  background: transparent;
  border: 2px solid var(--accent-color);
  color: var(--accent-color);
  font-size: 1.1rem;
  border-radius: 12px;
  padding: 12px 32px;
  cursor: pointer;
  transition: background 0.18s, color 0.18s;
}
.select-btn:hover {
  background: var(--accent-color);
  color: #fff;
}
/* 动画 */
.q-fade-slide-enter-active, .q-fade-slide-leave-active {
  transition: all 0.4s cubic-bezier(.4,2,.6,1);
}
.q-fade-slide-enter-from, .q-fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-24px);
}
.q-pop-enter-active, .q-pop-leave-active {
  transition: all 0.3s cubic-bezier(.4,2,.6,1);
}
.q-pop-enter-from, .q-pop-leave-to {
  opacity: 0;
  transform: scale(0.8);
}
</style>
