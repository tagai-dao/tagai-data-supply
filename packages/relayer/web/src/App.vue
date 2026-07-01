<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { clearToken } from './api';

const route = useRoute();
const router = useRouter();
const isLogin = computed(() => route.name === 'login');

const menus = [
  { name: 'dashboard', label: '总览', icon: 'DataLine' },
  { name: 'topics', label: '主题', icon: 'Collection' },
  { name: 'subtasks', label: '子任务', icon: 'List' },
  { name: 'nodes', label: '节点', icon: 'Connection' },
  { name: 'invites', label: '邀请码', icon: 'Ticket' },
  { name: 'pending', label: '推文处理', icon: 'Document' },
];

function logout() {
  clearToken();
  router.push({ name: 'login' });
}
</script>

<template>
  <router-view v-if="isLogin" />
  <el-container v-else style="height: 100vh">
    <el-aside width="200px" style="background: #304156">
      <div class="logo">tagai-data-supply</div>
      <el-menu
        :default-active="route.name as string"
        background-color="#304156"
        text-color="#bfcbd9"
        active-text-color="#409eff"
        router
      >
        <el-menu-item v-for="m in menus" :key="m.name" :index="m.name" :route="{ name: m.name }">
          <el-icon><component :is="m.icon" /></el-icon>
          <span>{{ m.label }}</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #eee">
        <h3 style="margin: 0; font-weight: 500">{{ route.meta.title || '管理后台' }}</h3>
        <el-button type="text" @click="logout">退出登录</el-button>
      </el-header>
      <el-main>
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<style>
html, body, #app { margin: 0; height: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
.logo { color: #fff; font-size: 16px; font-weight: 600; padding: 18px 16px; border-bottom: 1px solid #3a4a5e; }
.el-menu { border-right: none; }
</style>
