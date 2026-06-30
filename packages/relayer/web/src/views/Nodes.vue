<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../api';

const list = ref<any[]>([]);
const loading = ref(false);
let timer: any;

async function load(silent = false) {
  if (!silent) loading.value = true;
  try {
    list.value = (await api.listNodes()) as any[];
  } finally {
    if (!silent) loading.value = false;
  }
}
onMounted(() => { load(); timer = setInterval(() => load(true), 5000); });
onUnmounted(() => clearInterval(timer));

const statusType = (s: string) =>
  ({ online: 'success', offline: 'info', cooldown: 'warning', disabled: 'danger' } as any)[s] || 'info';

async function disable(id: string) {
  await api.disableNode(id);
  ElMessage.success('已下线');
  load();
}
async function reenable(id: string) {
  await api.reenableNode(id);
  ElMessage.success('已重新启用');
  load();
}
async function reclaim(id: string) {
  await api.reclaimNode(id);
  ElMessage.success('已回收任务');
  load();
}
</script>

<template>
  <div>
    <div style="margin-bottom: 12px">
      <el-button @click="load">刷新</el-button>
      <span style="color: #909399; font-size: 12px; margin-left: 8px">每 5 秒自动刷新</span>
    </div>
    <el-table :data="list" v-loading="loading" border>
      <el-table-column prop="node_id" label="Node ID" width="220" />
      <el-table-column prop="label" label="标签" width="120" />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="statusType(row.status)">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="timezone" label="时区" width="120" />
      <el-table-column label="cookie 健康" width="110">
        <template #default="{ row }">
          <el-progress :percentage="row.cookie_health" :stroke-width="8" :status="row.cookie_health < 30 ? 'exception' : row.cookie_health >= 70 ? 'success' : ''" />
        </template>
      </el-table-column>
      <el-table-column prop="last_heartbeat" label="最近心跳" width="180" />
      <el-table-column label="操作" width="240">
        <template #default="{ row }">
          <el-button size="small" @click="reclaim(row.node_id)">回收任务</el-button>
          <el-button size="small" type="warning" @click="reenable(row.node_id)" :disabled="row.status !== 'disabled' && row.status !== 'cooldown'">重新启用</el-button>
          <el-button size="small" type="danger" @click="disable(row.node_id)" :disabled="row.status === 'disabled'">下线</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="!list.length && !loading" description="暂无节点，请用邀请码注册一个 Node" />
  </div>
</template>
