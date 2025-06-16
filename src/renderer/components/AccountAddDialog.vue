<template>
  <transition name="dialog-fade">
    <div class="account-dialog-overlay" v-if="visible" @click.self="closeDialog">
      <transition name="dialog-bounce">
        <div class="account-dialog">
          <div class="dialog-header">
            <h3>添加Minecraft账号</h3>
            <button class="close-btn" @click="closeDialog">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z" fill="currentColor" />
              </svg>
            </button>
          </div>

          <div class="dialog-content">
            <!-- 账号类型选择 -->
            <div class="form-group">
              <label>账号类型</label>
              <div class="account-type-selection">
                <div 
                  class="account-type-item" 
                  :class="{'active': accountType === 'offline'}"
                  @click="accountType = 'offline'"
                >
                  <div class="account-type-icon offline">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12ZM12 14C9.33 14 4 15.34 4 18V20H20V18C20 15.34 14.67 14 12 14Z" fill="currentColor"/>
                    </svg>
                  </div>
                  <div class="account-type-details">
                    <span class="type-name">离线账号</span>
                    <span class="type-description">仅需用户名，无法进入正版服务器</span>
                  </div>
                </div>

                <div 
                  class="account-type-item" 
                  :class="{'active': accountType === 'microsoft'}"
                  @click="accountType = 'microsoft'"
                >
                  <div class="account-type-icon microsoft">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M2 2H10V10H2V2Z" fill="#f25022"/>
                      <path d="M2 14H10V22H2V14Z" fill="#00a4ef"/>
                      <path d="M14 2H22V10H14V2Z" fill="#7fba00"/>
                      <path d="M14 14H22V22H14V14Z" fill="#ffb900"/>
                    </svg>
                  </div>
                  <div class="account-type-details">
                    <span class="type-name">微软账号</span>
                    <span class="type-description">官方账号，可进入所有服务器</span>
                  </div>
                </div>

                <div 
                  class="account-type-item" 
                  :class="{'active': accountType === 'authlib'}"
                  @click="accountType = 'authlib'"
                >
                  <div class="account-type-icon authlib">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 1L3 5V11C3 16.55 6.84 21.74 12 23C17.16 21.74 21 16.55 21 11V5L12 1ZM19 11C19 15.52 15.89 19.72 12 20.94C8.11 19.72 5 15.52 5 11V6.3L12 3.19L19 6.3V11ZM7.41 11.59L6 13L10 17L18 9L16.59 7.58L10 14.17L7.41 11.59Z" fill="currentColor"/>
                    </svg>
                  </div>
                  <div class="account-type-details">
                    <span class="type-name">统一通行证</span>
                    <span class="type-description">支持第三方认证服务器外置登录</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 离线账号表单 -->
            <div class="account-form" v-if="accountType === 'offline'">
              <div class="form-group">
                <label for="offline-username">游戏用户名</label>
                <input 
                  type="text" 
                  id="offline-username" 
                  v-model="offlineAccount.username" 
                  placeholder="请输入游戏用户名"
                  maxlength="16"
                >
                <div class="form-tip">用户名长度为3-16个字符，只能包含字母、数字和下划线</div>
              </div>
            </div>

            <!-- Microsoft账号表单 -->
            <div class="account-form" v-if="accountType === 'microsoft'">
              <div class="microsoft-info">
                <p>您将被引导到微软登录页面完成授权。点击下方按钮开始登录流程。</p>
                <div class="microsoft-note">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M11 7H13V9H11V7ZM11 11H13V17H11V11ZM12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 20C7.59 20 4 16.41 4 12C4 7.59 7.59 4 12 4C16.41 4 20 7.59 20 12C20 16.41 16.41 20 12 20Z" fill="currentColor"/>
                  </svg>
                  <span>请确保能够正常访问微软和Minecraft官方网站</span>
                </div>
              </div>
            </div>

            <!-- 统一通行证表单 -->
            <div class="account-form" v-if="accountType === 'authlib'">
              <div class="form-group">
                <label for="authlib-server">认证服务器</label>
                <input 
                  type="text" 
                  id="authlib-server" 
                  v-model="authlibAccount.serverUrl" 
                  placeholder="例如: https://example.com/api/yggdrasil"
                >
                <div class="form-tip">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M11 7H13V9H11V7ZM11 11H13V17H11V11ZM12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 20C7.59 20 4 16.41 4 12C4 7.59 7.59 4 12 4C16.41 4 20 7.59 20 12C20 16.41 16.41 20 12 20Z" fill="currentColor"/>
                  </svg>
                  <span>需要输入完整的API地址，例如LittleSkin的认证地址为 https://littleskin.cn/api/yggdrasil</span>
                </div>
              </div>
              <div class="form-group">
                <label for="authlib-username">用户名/邮箱</label>
                <input 
                  type="text" 
                  id="authlib-username" 
                  v-model="authlibAccount.username" 
                  placeholder="请输入用户名或邮箱"
                >
              </div>
              <div class="form-group">
                <label for="authlib-password">密码</label>
                <input 
                  type="password" 
                  id="authlib-password" 
                  v-model="authlibAccount.password" 
                  placeholder="请输入密码"
                >
              </div>
            </div>
          </div>

        <div class="dialog-footer">
            <div class="dialog-buttons">
              <button class="cancel-btn" @click="closeDialog">取消</button>
              <button 
                class="confirm-btn" 
                @click="confirmAdd"
                :disabled="!canSubmit"
              >
                {{ accountType === 'microsoft' ? '开始登录' : '添加账号' }}
              </button>
            </div>
          </div>
        </div>
      </transition>
    </div>
  </transition>
</template>

<script setup>
import { ref, computed, watch } from 'vue';

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['close', 'addAccount', 'microsoftLogin']);

// 账号类型
const accountType = ref('offline'); // offline, microsoft, authlib

// 离线账号
const offlineAccount = ref({
  username: '',
  type: 'Offline'
});

// Microsoft账号
const microsoftAccount = ref({
  type: 'Microsoft'
});

// 统一通行证账号
const authlibAccount = ref({
  username: '',
  password: '',
  serverUrl: '',
  type: 'AuthlibInjector'
});

// 验证提交条件
const canSubmit = computed(() => {
  if (accountType.value === 'offline') {
    // 离线账号用户名应该是3-16个字符，只包含字母、数字和下划线
    const usernameValid = /^[a-zA-Z0-9_]{3,16}$/.test(offlineAccount.value.username);
    return usernameValid;
  } else if (accountType.value === 'microsoft') {
    return true; // Microsoft登录始终可以点击
  } else if (accountType.value === 'authlib') {
    // 统一通行证需要用户名、密码和服务器URL
    const serverUrlValid = authlibAccount.value.serverUrl && 
                          authlibAccount.value.serverUrl.startsWith('http');
    return authlibAccount.value.username && 
           authlibAccount.value.password && 
           serverUrlValid;
  }
  return false;
});

// 提交表单
function confirmAdd() {
  if (accountType.value === 'offline') {
    // 添加离线账号
    emit('addAccount', {
      ...offlineAccount.value,
      id: Date.now().toString(),
      addedTime: Date.now()
    });
  } else if (accountType.value === 'microsoft') {
    // 开始Microsoft登录流程
    emit('microsoftLogin');
  } else if (accountType.value === 'authlib') {
    // 添加统一通行证账号
    emit('addAccount', {
      ...authlibAccount.value,
      id: Date.now().toString(),
      addedTime: Date.now()
    });
  }
}

// 关闭对话框
function closeDialog() {
  emit('close');
}

// 监听对话框可见性变化，重置表单
watch(() => props.visible, (isVisible) => {
  if (isVisible) {
    // 重置表单
    accountType.value = 'offline';
    offlineAccount.value = { username: '', type: 'Offline' };
    authlibAccount.value = { username: '', password: '', serverUrl: '', type: 'AuthlibInjector' };
  }
});
</script>

<style>
.account-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
}

.account-dialog {
  background-color: var(--bg-primary);
  border-radius: 8px;
  width: 500px;
  max-width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 20px;
  border-bottom: 1px solid var(--border-color);
}

.dialog-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 500;
}

.close-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  width: 24px;
  height: 24px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border-radius: 50%;
}

.close-btn:hover {
  color: var(--text-primary);
  background-color: var(--bg-hover);
}

.dialog-content {
  padding: 20px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  padding: 15px 20px;
  border-top: 1px solid var(--border-color);
}

.dialog-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  color: var(--text-primary);
  font-weight: 500;
}

.form-tip {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 5px;
}

.form-tip svg {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: var(--accent-color);
}

input[type="text"],
input[type="password"] {
  width: 100%;
  padding: 10px;
  border-radius: 4px;
  border: 1px solid var(--border-color);
  background-color: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 14px;
}

input[type="text"]:focus,
input[type="password"]:focus {
  border-color: var(--accent-color);
  outline: none;
}

.account-type-selection {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.account-type-item {
  display: flex;
  align-items: center;
  padding: 12px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all 0.2s;
}

.account-type-item:hover {
  background-color: var(--bg-hover);
}

.account-type-item.active {
  border-color: var(--accent-color);
  background-color: rgba(var(--accent-color-rgb), 0.1);
}

.account-type-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  margin-right: 12px;
}

.account-type-icon svg {
  width: 24px;
  height: 24px;
}

.account-type-icon.offline {
  background-color: #607d8b;
  color: white;
}

.account-type-icon.microsoft {
  background-color: #ffffff;
}

.account-type-icon.authlib {
  background-color: #4caf50;
  color: white;
}

.account-type-details {
  display: flex;
  flex-direction: column;
}

.type-name {
  font-weight: 500;
  color: var(--text-primary);
}

.type-description {
  font-size: 12px;
  color: var(--text-secondary);
}

.microsoft-info {
  text-align: center;
  padding: 20px 0;
  background-color: rgba(var(--accent-color-rgb), 0.05);
  border-radius: 6px;
  margin: 10px 0;
}

.microsoft-note {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 15px;
  color: var(--text-secondary);
  font-size: 14px;
  background-color: rgba(var(--accent-color-rgb), 0.1);
  padding: 8px;
  border-radius: 4px;
}

.microsoft-note svg {
  width: 18px;
  height: 18px;
  color: var(--accent-color);
}

.cancel-btn {
  padding: 8px 16px;
  border-radius: 4px;
  background-color: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  cursor: pointer;
}

.cancel-btn:hover {
  background-color: var(--bg-hover);
  color: var(--text-primary);
}

.confirm-btn {
  padding: 8px 16px;
  border-radius: 4px;
  background-color: var(--accent-color);
  border: none;
  color: white;
  cursor: pointer;
}

.confirm-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.confirm-btn:not(:disabled):hover {
  filter: brightness(1.1);
}

/* 动画 */
.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: background-color var(--transition-duration) ease;
}

.dialog-fade-enter-from,
.dialog-fade-leave-to {
  background-color: rgba(0, 0, 0, 0);
}

.dialog-bounce-enter-active,
.dialog-bounce-leave-active {
  transition: all var(--transition-duration) cubic-bezier(.22,1.5,.36,1);
}

.dialog-bounce-enter-from,
.dialog-bounce-leave-to {
  transform: scale(0.95) translateY(-20px);
  opacity: 0;
}

.dialog-bounce-enter-to,
.dialog-bounce-leave-from {
  transform: scale(1) translateY(0);
  opacity: 1;
}
</style>