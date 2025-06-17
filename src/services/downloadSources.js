// 下载源配置
export const DOWNLOAD_SOURCES = {
  // 官方源
  official: {
    name: '官方源',
    baseUrl: 'https://launchermeta.mojang.com',
    meta: {
      versionManifest: 'https://piston-meta.mojang.com/mc/game/version_manifest.json',
      assets: 'https://resources.download.minecraft.net',
      libraries: 'https://libraries.minecraft.net'
    },
    speed: 'slow',
    reliability: 'high'
  },
  
  // BMCLAPI镜像源 
  bmclapi: {
    name: 'BMCLAPI镜像',
    baseUrl: 'https://bmclapi2.bangbang93.com',
    meta: {
      versionManifest: 'https://bmclapi2.bangbang93.com/mc/game/version_manifest.json',
      assets: 'https://bmclapi2.bangbang93.com/assets',
      libraries: 'https://bmclapi2.bangbang93.com/maven'
    },
    speed: 'fast',
    reliability: 'high'
  },
  
  // MCBBS镜像源
  mcbbs: {
    name: 'MCBBS镜像',
    baseUrl: 'https://download.mcbbs.net',
    meta: {
      versionManifest: 'https://download.mcbbs.net/mc/game/version_manifest.json',
      assets: 'https://download.mcbbs.net/assets',
      libraries: 'https://download.mcbbs.net/maven'
    },
    speed: 'medium',
    reliability: 'medium'
  }
}

// 根据地区推荐下载源
export function getRecommendedSource() {
  // 默认推荐BMCLAPI，对中国用户较友好
  return DOWNLOAD_SOURCES.bmclapi
}

// 获取备用下载源列表
export function getFallbackSources() {
  return [
    DOWNLOAD_SOURCES.bmclapi,
    DOWNLOAD_SOURCES.mcbbs,
    DOWNLOAD_SOURCES.official
  ]
}

// 自动选择最快的下载源
export async function selectBestSource() {
  const sources = getFallbackSources()
  const testPromises = sources.map(async (source) => {
    try {
      const start = Date.now()
      const response = await fetch(source.meta.versionManifest, {
        method: 'HEAD',
        timeout: 5000
      })
      const time = Date.now() - start
      return {
        source,
        time,
        available: response.ok
      }
    } catch (error) {
      return {
        source,
        time: Infinity,
        available: false
      }
    }
  })
  
  const results = await Promise.all(testPromises)
  const availableSources = results.filter(r => r.available)
  
  if (availableSources.length === 0) {
    throw new Error('所有下载源都不可用')
  }
  
  // 返回响应最快的源
  return availableSources.sort((a, b) => a.time - b.time)[0].source
}
