import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    redirect: '/home' // 默认进入主页
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('@/views/Settings.vue')
  },
  {
    path: '/home', 
    name: 'Home',
    component: () => import('@/views/Home.vue')
  },  {
    path: '/download-progress',
    name: 'DownloadProgress',
    component: () => import('@/views/DownloadProgress.vue')
  },
  {
    path: '/download',
    name: 'Download',
    component: () => import('@/views/DownloadPage.vue')
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
