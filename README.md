# Vite + Vue3 + Electron 项目

## 启动开发

1. 终端运行：
   ```sh
   npm run electron:dev
   ```
   该命令会同时启动 Vite 前端服务和 Electron 主进程，自动打开桌面窗口。

2. 如遇端口占用或 Electron 启动异常，请检查 node 版本、依赖完整性及网络环境。

## 目录结构
- `main.js`：Electron 主进程入口
- `preload.js`：预加载脚本
- `src/`：Vue3 前端源码

## 打包
可后续集成 electron-builder 或 electron-forge 进行打包。

---

如需主/渲染进程通信、自动更新等高级功能，请参考 Electron 官方文档。
