// 启动器配置文件管理 (launcher_profiles.json)
const fs = require('fs')
const path = require('path')
const os = require('os')

class LauncherProfileManager {
  constructor(mcDirectory) {
    this.mcDirectory = mcDirectory
    this.profilesPath = path.join(mcDirectory, 'launcher_profiles.json')
  }
  
  // 获取或创建启动器配置文件
  async getOrCreateProfiles() {
    try {
      if (fs.existsSync(this.profilesPath)) {
        const content = await fs.promises.readFile(this.profilesPath, 'utf8')
        return JSON.parse(content)
      } else {
        // 创建默认配置
        const defaultProfiles = this.createDefaultProfiles()
        await this.saveProfiles(defaultProfiles)
        return defaultProfiles
      }
    } catch (error) {
      console.error('读取启动器配置失败:', error)
      return this.createDefaultProfiles()
    }
  }
  
  // 创建默认启动器配置
  createDefaultProfiles() {
    return {
      profiles: {
        "(Default)": {
          gameDir: this.mcDirectory,
          lastVersionId: "latest-release",
          name: "(Default)",
          type: "latest-release",
          created: new Date().toISOString(),
          lastUsed: new Date().toISOString()
        }
      },
      selectedProfileName: "(Default)",
      version: 3,
      clientToken: this.generateUUID(),
      launcherVersion: {
        name: "FFM Launcher",
        version: "1.0.0"
      }
    }
  }
  
  // 添加新的配置文件
  async addProfile(versionId, profileName, options = {}) {
    const profiles = await this.getOrCreateProfiles()
    
    const profileId = profileName || `Profile_${versionId}`
    
    profiles.profiles[profileId] = {
      gameDir: options.gameDir || this.mcDirectory,
      lastVersionId: versionId,
      name: profileName || `Minecraft ${versionId}`,
      type: "custom",
      created: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
      javaArgs: options.javaArgs || "-Xmx2G -XX:+UnlockExperimentalVMOptions -XX:+UseG1GC",
      resolution: options.resolution || { width: 854, height: 480 },
      ...options
    }
    
    // 设置为当前选中的配置
    profiles.selectedProfileName = profileId
    
    await this.saveProfiles(profiles)
    return profileId
  }
  
  // 更新配置文件
  async updateProfile(profileId, updates) {
    const profiles = await this.getOrCreateProfiles()
    
    if (profiles.profiles[profileId]) {
      profiles.profiles[profileId] = {
        ...profiles.profiles[profileId],
        ...updates,
        lastUsed: new Date().toISOString()
      }
      
      await this.saveProfiles(profiles)
      return true
    }
    
    return false
  }
  
  // 删除配置文件
  async deleteProfile(profileId) {
    const profiles = await this.getOrCreateProfiles()
    
    if (profiles.profiles[profileId]) {
      delete profiles.profiles[profileId]
      
      // 如果删除的是当前选中的配置，切换到默认配置
      if (profiles.selectedProfileName === profileId) {
        profiles.selectedProfileName = Object.keys(profiles.profiles)[0] || "(Default)"
      }
      
      await this.saveProfiles(profiles)
      return true
    }
    
    return false
  }
  
  // 获取所有配置文件
  async getAllProfiles() {
    const profiles = await this.getOrCreateProfiles()
    return profiles.profiles
  }
  
  // 获取当前选中的配置
  async getSelectedProfile() {
    const profiles = await this.getOrCreateProfiles()
    const selectedName = profiles.selectedProfileName
    return profiles.profiles[selectedName] || profiles.profiles["(Default)"]
  }
  
  // 设置选中的配置
  async setSelectedProfile(profileId) {
    const profiles = await this.getOrCreateProfiles()
    
    if (profiles.profiles[profileId]) {
      profiles.selectedProfileName = profileId
      await this.saveProfiles(profiles)
      return true
    }
    
    return false
  }
  
  // 保存配置文件
  async saveProfiles(profiles) {
    try {
      await fs.promises.writeFile(
        this.profilesPath, 
        JSON.stringify(profiles, null, 2), 
        'utf8'
      )
    } catch (error) {
      console.error('保存启动器配置失败:', error)
      throw error
    }
  }
  
  // 生成UUID
  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0
      const v = c === 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    })
  }
  
  // 验证配置文件格式
  validateProfile(profile) {
    const required = ['gameDir', 'lastVersionId', 'name']
    return required.every(field => profile.hasOwnProperty(field))
  }
}

module.exports = LauncherProfileManager
