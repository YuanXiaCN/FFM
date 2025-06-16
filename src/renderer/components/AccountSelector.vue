<template>
  <div class="account-selector">
    <div class="selected-account" @click="toggleDropdown">
      <div class="account-avatar">
        <img v-if="selectedAccount && selectedAccount.avatar" :src="selectedAccount.avatar" alt="用户头像">
        <div v-else class="default-avatar">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12ZM12 14C9.33 14 4 15.34 4 18V20H20V18C20 15.34 14.67 14 12 14Z" fill="currentColor"/>
          </svg>
        </div>
      </div>
      <div class="account-info">
        <span class="account-name">{{ selectedAccount ? selectedAccount.username : '请选择账号' }}</span>
        <span class="account-type" v-if="selectedAccount">{{ getAccountTypeLabel(selectedAccount.type) }}</span>
      </div>
      <div class="dropdown-icon">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M7 10L12 15L17 10H7Z" fill="currentColor"/>
        </svg>
      </div>
    </div>

    <transition name="account-dropdown">
      <div class="account-dropdown" v-show="isDropdownOpen">
        <div class="account-list" v-if="accounts.length > 0">
          <div 
            v-for="account in accounts" 
            :key="account.id" 
            class="account-item"
            :class="{ 'active': selectedAccount && selectedAccount.id === account.id }"
            @click="selectAccount(account)"
          >
            <div class="account-avatar">
              <img v-if="account.avatar" :src="account.avatar" alt="用户头像">
              <div v-else class="default-avatar">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12ZM12 14C9.33 14 4 15.34 4 18V20H20V18C20 15.34 14.67 14 12 14Z" fill="currentColor"/>
                </svg>
              </div>
            </div>
            <div class="account-info">
              <span class="account-name">{{ account.username }}</span>
              <span class="account-type">{{ getAccountTypeLabel(account.type) }}</span>
            </div>
          </div>
        </div>
        <div class="no-accounts" v-else>
          <p>暂无账号，请添加一个账号</p>
        </div>
        <div class="account-actions">
          <button class="action-btn add-btn" @click="handleAddAccount">添加账号</button>
          <button class="action-btn manage-btn" @click="handleManageAccounts" :disabled="!selectedAccount">管理账号</button>
        </div>
      </div>
    </transition>
    
    <!-- 账号添加对话框 -->
    <AccountAddDialog 
      :visible="isAddDialogVisible" 
      @close="isAddDialogVisible = false"
      @addAccount="handleAccountAdd"
      @microsoftLogin="handleMicrosoftLogin"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import AccountAddDialog from '@/components/AccountAddDialog.vue';
import { logger } from '../services/Logger.js';

// 账号数据
const accounts = ref([]);
const selectedAccount = ref(null);
const isDropdownOpen = ref(false);
const isAddDialogVisible = ref(false);

// 获取账号类型标签
function getAccountTypeLabel(type) {
  switch (type) {
    case 'Offline':
      return '离线账号';
    case 'Microsoft':
      return '微软账号';
    case 'AuthlibInjector':
      return '统一通行证';
    default:
      return type || '未知类型';
  }
}

// 加载账号数据
async function loadAccounts() {
  try {
    const accountsList = await window.electronAPI.getMinecraftAccounts();
    accounts.value = accountsList || [];
    
    // 如果有账号，默认选择第一个
    if (accounts.value.length > 0) {
      selectedAccount.value = accounts.value[0];
    }  } catch (error) {
    logger.error('加载账号失败', error);
  }
}

function toggleDropdown() {
  isDropdownOpen.value = !isDropdownOpen.value;
}

async function selectAccount(account) {
  try {
    // 设置选中账号
    const success = await window.electronAPI.setSelectedAccount(account.id);
    if (success) {
      selectedAccount.value = account;
    }
    isDropdownOpen.value = false;  } catch (error) {
    logger.error('设置选中账号失败', error);
  }
}

// 点击外部关闭下拉菜单
function handleClickOutside(event) {
  const accountSelector = event.target.closest('.account-selector');
  if (!accountSelector) {
    isDropdownOpen.value = false;
  }
}

// 账号管理功能
function handleAddAccount() {
  isDropdownOpen.value = false;
  isAddDialogVisible.value = true;
}

// 处理新账号添加
async function handleAccountAdd(newAccount) {
  try {
    // 保存账号
    const success = await window.electronAPI.saveMinecraftAccount(newAccount);
    if (success) {
      // 刷新账号列表
      await loadAccounts();
      // 自动选择新添加的账号
      const addedAccount = accounts.value.find(acc => acc.id === newAccount.id);
      if (addedAccount) {
        selectedAccount.value = addedAccount;
        await window.electronAPI.setSelectedAccount(addedAccount.id);
      }
    }
    // 关闭对话框
    isAddDialogVisible.value = false;  } catch (error) {
    logger.error('保存账号失败', error);
  }
}

// 处理Microsoft登录
async function handleMicrosoftLogin() {
  try {
    isAddDialogVisible.value = false; // 先关闭对话框
      // 显示正在登录提示
    logger.info('正在启动Microsoft登录流程...');
    
    const result = await window.electronAPI.startMicrosoftLogin();
    
    if (!result.success) {
      alert(`Microsoft登录失败: ${result.error || '未知错误'}`);
    } else {
      logger.info('Microsoft登录窗口已打开，请在弹出的窗口中完成授权...');
    }    // 成功登录会通过事件返回账号信息
  } catch (error) {
    logger.error('Microsoft登录失败', error);
    alert('Microsoft登录失败: ' + error.message);
  }
}

// 处理新账号添加成功
function handleAccountAdded(account) {
  // 重新加载账号列表
  loadAccounts();
  // 选择新添加的账号
  selectedAccount.value = account;
}

// 处理账号管理
async function handleManageAccounts() {
  isDropdownOpen.value = false;
  
  if (!selectedAccount.value) return;
  
  // 简单的管理功能，确认是否删除账号
  const confirmMessage = `确定要删除账号"${selectedAccount.value.username}"吗？\n\n类型: ${getAccountTypeLabel(selectedAccount.value.type)}`;
  
  if (confirm(confirmMessage)) {
    try {
      const success = await window.electronAPI.deleteMinecraftAccount(selectedAccount.value.id);
      if (success) {
        // 删除成功，刷新账号列表
        await loadAccounts();
        
        // 如果还有其他账号，选择第一个
        if (accounts.value.length > 0) {
          await selectAccount(accounts.value[0]);
        } else {
          selectedAccount.value = null;
        }      }
    } catch (error) {
      logger.error('删除账号失败', error);
      alert('删除账号失败: ' + error.message);
    }  }
}

// 清理重复账号功能已移除，改为在保存账号时自动处理

// 检查令牌是否过期或即将过期（15分钟内过期视为需要刷新）
function isTokenExpiring(account) {
  if (!account || !account.expiresAt) return false;
  // 如果过期时间在15分钟内，返回true
  return account.expiresAt - Date.now() < 15 * 60 * 1000;
}

// 刷新账号的令牌
async function refreshAccountToken(account) {
  if (!account || account.type !== 'Microsoft' || !account.refreshToken) return;
    try {
    logger.info(`正在刷新账号 ${account.username} 的令牌...`);
    const result = await window.electronAPI.refreshMinecraftAccount(account.id);
    
    if (result.success) {
      logger.info(`账号 ${account.username} 令牌刷新成功`);
      // 更新本地账号数据
      const index = accounts.value.findIndex(acc => acc.id === account.id);
      if (index > -1) {
        accounts.value[index] = result.account;
        if (selectedAccount.value && selectedAccount.value.id === account.id) {
          selectedAccount.value = result.account;
        }      }
    } else {
      logger.error(`账号 ${account.username} 令牌刷新失败: ${result.error}`);
    }
  } catch (error) {
    logger.error('刷新令牌失败:', error);
  }
}

onMounted(async () => {
  // 加载账号数据
  await loadAccounts();
  
  // 获取当前选中的账号
  try {
    const selected = await window.electronAPI.getSelectedAccount();
    if (selected) {
      selectedAccount.value = selected;
      
      // 检查并刷新Microsoft账号令牌
      if (selected.type === 'Microsoft' && isTokenExpiring(selected)) {
        refreshAccountToken(selected);
      }
    } else if (accounts.value.length > 0) {
      // 如果没有选中账号但有账号列表，选择第一个并设置为当前账号
      selectedAccount.value = accounts.value[0];
      await window.electronAPI.setSelectedAccount(accounts.value[0].id);
      
      // 检查并刷新Microsoft账号令牌
      if (accounts.value[0].type === 'Microsoft' && isTokenExpiring(accounts.value[0])) {
        refreshAccountToken(accounts.value[0]);
      }
    }
  } catch (error) {
    console.error('获取选中账号失败', error);
  }
  
  // 事件监听器清理函数
  const cleanupFunctions = [];
  
  // 监听Microsoft登录成功事件
  const cleanupSuccess = window.electronAPI.onMicrosoftLoginSuccess((account) => {
    // 添加新账号到列表
    accounts.value.push(account);
    // 设置为当前账号
    selectedAccount.value = account;
  });
  cleanupFunctions.push(cleanupSuccess);
    // 监听Microsoft登录取消事件
  const cleanupCancelled = window.electronAPI.onMicrosoftLoginCancelled(() => {
    console.log('用户取消了Microsoft登录');
  });
  cleanupFunctions.push(cleanupCancelled);
  
  // 监听Microsoft登录错误事件
  const cleanupError = window.electronAPI.onMicrosoftLoginError((error) => {
    console.error('Microsoft登录失败:', error);
    let errorMessage = '未知错误';
    
    if (error.error === 'unauthorized_client') {
      errorMessage = '客户端授权失败。请确保使用了正确的客户端ID。';
    } else if (error.description) {
      errorMessage = error.description;
    } else if (error.error) {
      errorMessage = error.error;
    }
    
    alert(`Microsoft登录失败: ${errorMessage}`);
  });
  cleanupFunctions.push(cleanupError);
  
  document.addEventListener('click', handleClickOutside);
  
  // 组件卸载时清理事件监听
  onUnmounted(() => {
    document.removeEventListener('click', handleClickOutside);
    // 清理所有事件监听
    cleanupFunctions.forEach(cleanup => cleanup());
  });
});
</script>

<style>
.account-selector {
  position: relative;
  width: 180px;
  user-select: none;
  -webkit-app-region: no-drag;
  display: flex;
  align-items: center;
}

.selected-account {
  display: flex;
  align-items: center;
  padding: 5px 8px;
  background-color: var(--bg-secondary);
  border-radius: 6px;
  cursor: pointer;
  transition: all var(--transition-duration) cubic-bezier(.22,1.5,.36,1);
  height: 32px;
}

.selected-account:hover {
  background-color: var(--bg-hover);
}

.account-avatar {
  width: 30px;
  height: 30px;
  border-radius: 4px;
  overflow: hidden;
  margin-right: 10px;
  background-color: var(--bg-hover);
}

.default-avatar {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
}

.account-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.account-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.account-name {
  font-size: 14px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.account-type {
  font-size: 12px;
  color: var(--text-secondary);
}

.dropdown-icon {
  width: 20px;
  height: 20px;
  color: var(--text-secondary);
  margin-left: 5px;
}

.account-dropdown {
  position: absolute;
  top: calc(100% + 5px);
  right: 0;
}

/* 添加账号选择器动画 */
.account-dropdown-enter-active,
.account-dropdown-leave-active {
  transition: all var(--transition-duration) cubic-bezier(.22,1.5,.36,1);
}

.account-dropdown-enter-from,
.account-dropdown-leave-to {
  opacity: 0;
  transform: scale(0.95) translateY(-10px);
}

.account-dropdown-enter-to,
.account-dropdown-leave-from {
  opacity: 1;
  transform: scale(1) translateY(0);
}

.account-list {
  max-height: 200px;
  overflow-y: auto;
}

.account-item {
  display: flex;
  align-items: center;
  padding: 8px 10px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.account-item:hover {
  background-color: var(--bg-hover);
}

.account-item.active {
  background-color: rgba(var(--accent-color-rgb), 0.15);
  border-left: 3px solid var(--accent-color);
}

.account-actions {
  display: flex;
  padding: 10px;
  border-top: 1px solid var(--border-color);
}

.action-btn {
  flex: 1;
  padding: 6px 0;
  background-color: transparent;
  border: none;
  color: var(--text-primary);
  font-size: 12px;
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.action-btn:hover {
  background-color: var(--bg-hover);
}

.add-btn {
  margin-right: 5px;
}

.no-accounts {
  padding: 15px 10px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 14px;
}
</style>
