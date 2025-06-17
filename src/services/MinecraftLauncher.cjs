// 游戏启动器 - 根据Minecraft Wiki教程实现
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')
const crypto = require('crypto')

class MinecraftLauncher {
  constructor(mcDirectory) {
    this.mcDirectory = mcDirectory
    this.versionsDir = path.join(mcDirectory, 'versions')
    this.librariesDir = path.join(mcDirectory, 'libraries')
    this.assetsDir = path.join(mcDirectory, 'assets')
  }
  
  // 启动游戏
  async launchGame(options) {
    const {
      version,
      username,
      uuid,
      accessToken,
      userType = 'mojang',
      gameDir,
      javaPath = 'java',
      javaArgs = '-Xmx2G',
      gameArgs = {},
      windowSize = { width: 854, height: 480 }
    } = options
    
    try {
      // 1. 读取版本JSON
      const versionJson = await this.getVersionJson(version)
      if (!versionJson) {
        throw new Error(`版本 ${version} 不存在`)
      }
      
      // 2. 构建JVM参数
      const jvmArgs = await this.buildJvmArgs(versionJson, version, javaArgs, gameDir)
      
      // 3. 构建Minecraft参数
      const minecraftArgs = await this.buildMinecraftArgs(versionJson, {
        username,
        uuid,
        accessToken,
        userType,
        gameDir: gameDir || this.mcDirectory,
        windowSize,
        ...gameArgs
      })
      
      // 4. 组合完整的启动命令
      const mainClass = versionJson.mainClass
      const fullArgs = [...jvmArgs, mainClass, ...minecraftArgs]
      
      console.log('启动命令:', javaPath, fullArgs.join(' '))
      
      // 5. 启动游戏进程
      const gameProcess = spawn(javaPath, fullArgs, {
        cwd: gameDir || this.mcDirectory,
        stdio: ['pipe', 'pipe', 'pipe']
      })
      
      return gameProcess
      
    } catch (error) {
      throw new Error(`启动游戏失败: ${error.message}`)
    }
  }
  
  // 获取版本JSON
  async getVersionJson(version) {
    const versionPath = path.join(this.versionsDir, version, `${version}.json`)
    
    if (!fs.existsSync(versionPath)) {
      return null
    }
    
    try {
      const content = await fs.promises.readFile(versionPath, 'utf8')
      return JSON.parse(content)
    } catch (error) {
      throw new Error(`读取版本信息失败: ${error.message}`)
    }
  }
  
  // 构建JVM参数
  async buildJvmArgs(versionJson, version, customJavaArgs, gameDir) {
    const args = []
    
    // 添加自定义JVM参数
    if (customJavaArgs) {
      args.push(...customJavaArgs.split(' ').filter(arg => arg.trim()))
    }
    
    // 系统属性
    args.push(`-Dos.name=${os.type()}`)
    args.push(`-Dos.version=${os.release()}`)
    args.push('-Dminecraft.launcher.brand=FFM-Launcher')
    args.push('-Dminecraft.launcher.version=1.0.0')
    
    // natives路径
    const nativesDir = path.join(this.versionsDir, version, 'natives')
    if (fs.existsSync(nativesDir)) {
      args.push(`-Djava.library.path=${nativesDir}`)
    }
    
    // log4j配置
    if (versionJson.logging?.client?.file) {
      const logConfigPath = path.join(this.assetsDir, 'log_configs', versionJson.logging.client.file.id)
      if (fs.existsSync(logConfigPath)) {
        args.push(`-Dlog4j.configurationFile=${logConfigPath}`)
      }
    }
    
    // classpath参数
    const classpath = await this.buildClasspath(versionJson, version)
    args.push('-cp', classpath)
    
    return args
  }
  
  // 构建classpath
  async buildClasspath(versionJson, version) {
    const classpaths = []
    
    // 添加客户端jar
    const clientJar = path.join(this.versionsDir, version, `${version}.jar`)
    if (fs.existsSync(clientJar)) {
      classpaths.push(clientJar)
    }
    
    // 添加依赖库
    if (versionJson.libraries) {
      for (const library of versionJson.libraries) {
        if (this.shouldIncludeLibrary(library) && library.downloads?.artifact) {
          const libPath = path.join(this.librariesDir, library.downloads.artifact.path)
          if (fs.existsSync(libPath)) {
            classpaths.push(libPath)
          }
        }
      }
    }
    
    // Windows使用分号分隔，其他系统使用冒号
    const separator = process.platform === 'win32' ? ';' : ':'
    return classpaths.join(separator)
  }
  
  // 检查是否应该包含库文件
  shouldIncludeLibrary(library) {
    if (!library.rules) return true
    
    for (const rule of library.rules) {
      if (rule.action === 'allow') {
        if (!rule.os) return true
        if (this.matchesOS(rule.os)) return true
      } else if (rule.action === 'disallow') {
        if (!rule.os) return false
        if (this.matchesOS(rule.os)) return false
      }
    }
    
    return false
  }
  
  // 检查操作系统匹配
  matchesOS(osRule) {
    const platform = process.platform
    
    if (osRule.name === 'windows' && platform === 'win32') return true
    if (osRule.name === 'osx' && platform === 'darwin') return true
    if (osRule.name === 'linux' && platform === 'linux') return true
    
    return false
  }
  
  // 构建Minecraft参数
  async buildMinecraftArgs(versionJson, options) {
    const args = []
    const {
      username,
      uuid,
      accessToken,
      userType,
      gameDir,
      windowSize,
      server,
      port
    } = options
    
    // 基本参数
    args.push('--username', username)
    args.push('--version', versionJson.id)
    args.push('--gameDir', gameDir)
    args.push('--uuid', uuid)
    args.push('--accessToken', accessToken)
    args.push('--userType', userType)
    args.push('--versionType', versionJson.type || 'release')
    
    // 资源参数
    if (versionJson.assetIndex) {
      args.push('--assetsDir', this.assetsDir)
      args.push('--assetIndex', versionJson.assetIndex.id)
    }
    
    // 窗口大小
    if (windowSize) {
      args.push('--width', windowSize.width.toString())
      args.push('--height', windowSize.height.toString())
    }
    
    // 服务器参数（可选）
    if (server) {
      args.push('--server', server)
      if (port) {
        args.push('--port', port.toString())
      }
    }
    
    // 处理版本参数模板（1.13+）
    if (versionJson.arguments?.game) {
      const gameArgs = this.processArguments(versionJson.arguments.game, options)
      args.push(...gameArgs)
    } else if (versionJson.minecraftArguments) {
      // 1.12及以下版本
      const legacyArgs = this.processLegacyArguments(versionJson.minecraftArguments, options)
      args.push(...legacyArgs)
    }
    
    return args
  }
  
  // 处理参数模板
  processArguments(argumentsArray, options) {
    const args = []
    
    for (const arg of argumentsArray) {
      if (typeof arg === 'string') {
        args.push(this.replaceTemplates(arg, options))
      } else if (arg.rules && arg.value) {
        // 检查规则是否满足
        if (this.checkArgumentRules(arg.rules)) {
          if (Array.isArray(arg.value)) {
            args.push(...arg.value.map(v => this.replaceTemplates(v, options)))
          } else {
            args.push(this.replaceTemplates(arg.value, options))
          }
        }
      }
    }
    
    return args
  }
  
  // 处理旧版本参数格式
  processLegacyArguments(argumentsString, options) {
    const processedString = this.replaceTemplates(argumentsString, options)
    return processedString.split(' ').filter(arg => arg.trim())
  }
  
  // 替换参数模板
  replaceTemplates(template, options) {
    return template
      .replace('${auth_player_name}', options.username)
      .replace('${version_name}', options.version || 'unknown')
      .replace('${game_directory}', options.gameDir)
      .replace('${assets_root}', this.assetsDir)
      .replace('${assets_index_name}', options.assetIndex || 'legacy')
      .replace('${auth_uuid}', options.uuid)
      .replace('${auth_access_token}', options.accessToken)
      .replace('${user_type}', options.userType)
      .replace('${version_type}', options.versionType || 'release')
      .replace('${resolution_width}', options.windowSize?.width?.toString() || '854')
      .replace('${resolution_height}', options.windowSize?.height?.toString() || '480')
  }
  
  // 检查参数规则
  checkArgumentRules(rules) {
    for (const rule of rules) {
      if (rule.action === 'allow') {
        if (rule.features && !this.checkFeatures(rule.features)) {
          return false
        }
        if (rule.os && !this.matchesOS(rule.os)) {
          return false
        }
      } else if (rule.action === 'disallow') {
        if (rule.features && this.checkFeatures(rule.features)) {
          return false
        }
        if (rule.os && this.matchesOS(rule.os)) {
          return false
        }
      }
    }
    return true
  }
  
  // 检查特性
  checkFeatures(features) {
    // 简单实现，实际可能需要更复杂的特性检查
    return true
  }
}

module.exports = MinecraftLauncher
