<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { api } from '../api';

const stats = ref<any>({});
const loading = ref(false); // 仅首次加载显示遮罩，后续静默刷新
let timer: any;

async function load(silent = false) {
  if (!silent) loading.value = true;
  try {
    stats.value = await api.stats();
  } finally {
    if (!silent) loading.value = false;
  }
}
onMounted(() => {
  load();                          // 首次：显示 loading
  timer = setInterval(() => load(true), 5000);  // 后续：静默刷新
});
onUnmounted(() => clearInterval(timer));

const nodeStatusType = (s: string) =>
  ({ online: 'success', offline: 'info', cooldown: 'warning', disabled: 'danger' } as any)[s] || 'info';
</script>

<template>
  <div v-loading="loading">
    <el-row :gutter="16">
      <el-col :span="6" v-for="card in [
        { label: '在线节点', value: stats.nodes?.online || 0 },
        { label: '离线/其他节点', value: (stats.nodes?.offline || 0) + (stats.nodes?.cooldown || 0) + (stats.nodes?.disabled || 0) },
        { label: '待处理推文', value: stats.pending_total || 0 },
        { label: '已完成处理', value: stats.pending_done || 0 },
      ]" :key="card.label">
        <el-card shadow="hover">
          <div style="color: #909399; font-size: 13px">{{ card.label }}</div>
          <div style="font-size: 28px; font-weight: 600; margin-top: 8px">{{ card.value }}</div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16" style="margin-top: 16px">
      <el-col :span="12">
        <el-card header="节点状态分布">
          <div v-for="(cnt, s) in (stats.nodes || {})" :key="s" style="margin: 6px 0">
            <el-tag :type="nodeStatusType(String(s))">{{ s }}</el-tag>
            <span style="margin-left: 8px">{{ cnt }}</span>
          </div>
          <el-empty v-if="!stats.nodes || Object.keys(stats.nodes).length === 0" description="暂无节点" />
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card header="任务状态分布">
          <div v-for="(cnt, s) in (stats.assignments || {})" :key="s" style="margin: 6px 0">
            <el-tag>{{ s }}</el-tag>
            <span style="margin-left: 8px">{{ cnt }}</span>
          </div>
          <el-empty v-if="!stats.assignments || Object.keys(stats.assignments).length === 0" description="暂无任务记录" />
        </el-card>
      </el-col>
    </el-row>
    <div style="color: #909399; font-size: 12px; margin-top: 12px">每 5 秒自动刷新</div>
  </div>
</template>
