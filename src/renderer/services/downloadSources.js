// 下载源配置，供全局调用
export const DOWNLOAD_SOURCES = [
  {
    key: 'official',
    label: '官方',
    meta: {
      versionManifest: 'https://launchermeta.mojang.com/mc/game/version_manifest.json',
      libraries: 'https://libraries.minecraft.net/',
      assets: 'https://resources.download.minecraft.net/',
      client: 'https://launcher.mojang.com/v1/objects/'
    }
  },
  {
    key: 'bmclapi',
    label: 'BMCLAPI',
    meta: {
      versionManifest: 'https://bmclapi2.bangbang93.com/mc/game/version_manifest.json',
      libraries: 'https://bmclapi2.bangbang93.com/libraries/',
      assets: 'https://bmclapi2.bangbang93.com/assets/',
      client: 'https://bmclapi2.bangbang93.com/objects/'
    }
  }
]
