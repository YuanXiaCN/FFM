// 安全管理器
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class SecurityManager {
  constructor(userDataPath) {
    this.userDataPath = userDataPath;
    this.requiredDirectories = [
      'Cache',
      'GPUCache', 
      'DiskCache',
      'logs',
      'config',
      'downloads'
    ];
  }

  /**
   * 初始化安全管理器
   */
  async initialize() {
    try {
      await this.ensureDirectories();
      await this.setDirectoryPermissions();
    } catch (error) {
      throw new Error(`安全管理器初始化失败: ${error.message}`);
    }
  }

  /**
   * 确保必要目录存在
   */
  async ensureDirectories() {
    for (const dir of this.requiredDirectories) {
      const dirPath = path.join(this.userDataPath, dir);
      await this.ensureDirectory(dirPath);
    }
  }

  /**
   * 确保单个目录存在
   */
  async ensureDirectory(dirPath) {
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    } catch (error) {
      throw new Error(`创建目录失败: ${dirPath}, ${error.message}`);
    }
  }

  /**
   * 设置目录权限
   */
  async setDirectoryPermissions() {
    if (process.platform === 'win32') {
      // Windows 平台使用 icacls 设置权限
      for (const dir of this.requiredDirectories) {
        const dirPath = path.join(this.userDataPath, dir);
        await this.setWindowsPermissions(dirPath);
      }
    } else {
      // Unix 平台使用 chmod 设置权限
      for (const dir of this.requiredDirectories) {
        const dirPath = path.join(this.userDataPath, dir);
        await this.setUnixPermissions(dirPath);
      }
    }
  }

  /**
   * 设置 Windows 权限
   */
  async setWindowsPermissions(dirPath) {
    try {
      const command = `icacls "${dirPath}" /grant Everyone:F /T`;
      await execAsync(command);
    } catch (error) {
      console.warn(`设置 Windows 权限失败: ${dirPath}, ${error.message}`);
    }
  }

  /**
   * 设置 Unix 权限
   */
  async setUnixPermissions(dirPath) {
    try {
      fs.chmodSync(dirPath, 0o755);
    } catch (error) {
      console.warn(`设置 Unix 权限失败: ${dirPath}, ${error.message}`);
    }
  }

  /**
   * 验证文件路径安全性
   */
  validatePath(filePath) {
    try {
      const resolvedPath = path.resolve(filePath);
      const userDataResolved = path.resolve(this.userDataPath);
      
      // 检查路径是否在用户数据目录内
      if (!resolvedPath.startsWith(userDataResolved)) {
        return false;
      }
      
      // 检查是否包含危险字符
      const dangerousPatterns = [
        /\.\./,  // 路径遍历
        /[<>:"|?*]/,  // Windows 非法字符
        /[\x00-\x1f]/  // 控制字符
      ];
      
      return !dangerousPatterns.some(pattern => pattern.test(filePath));
    } catch (error) {
      return false;
    }
  }

  /**
   * 清理临时文件
   */
  async cleanupTempFiles() {
    const tempDirs = ['Cache', 'GPUCache', 'DiskCache'];
    
    for (const tempDir of tempDirs) {
      const dirPath = path.join(this.userDataPath, tempDir);
      try {
        if (fs.existsSync(dirPath)) {
          await this.cleanDirectory(dirPath);
        }
      } catch (error) {
        console.warn(`清理临时目录失败: ${dirPath}, ${error.message}`);
      }
    }
  }

  /**
   * 清理目录内容
   */
  async cleanDirectory(dirPath) {
    try {
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
          fs.rmSync(filePath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(filePath);
        }
      }
    } catch (error) {
      throw new Error(`清理目录失败: ${dirPath}, ${error.message}`);
    }
  }

  /**
   * 检查磁盘空间
   */
  async checkDiskSpace() {
    try {
      if (process.platform === 'win32') {
        const drive = path.parse(this.userDataPath).root;
        const { stdout } = await execAsync(`fsutil volume diskfree ${drive}`);
        const lines = stdout.split('\n');
        const freeBytes = parseInt(lines[0].split(':')[1].trim());
        return freeBytes;
      } else {
        const { stdout } = await execAsync(`df -B1 "${this.userDataPath}"`);
        const lines = stdout.split('\n');
        const values = lines[1].split(/\s+/);
        return parseInt(values[3]);
      }
    } catch (error) {
      console.warn('检查磁盘空间失败:', error.message);
      return null;
    }
  }

  /**
   * 获取目录大小
   */
  async getDirectorySize(dirPath) {
    try {
      let totalSize = 0;
      
      const calculateSize = (dir) => {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const filePath = path.join(dir, file);
          const stat = fs.statSync(filePath);
          
          if (stat.isDirectory()) {
            calculateSize(filePath);
          } else {
            totalSize += stat.size;
          }
        }
      };
      
      if (fs.existsSync(dirPath)) {
        calculateSize(dirPath);
      }
      
      return totalSize;
    } catch (error) {
      console.warn(`获取目录大小失败: ${dirPath}, ${error.message}`);
      return 0;
    }
  }

  /**
   * 清理工作
   */
  cleanup() {
    // 执行清理临时文件等操作
    this.cleanupTempFiles().catch(error => {
      console.warn('清理临时文件失败:', error.message);
    });
  }
}

module.exports = SecurityManager;
