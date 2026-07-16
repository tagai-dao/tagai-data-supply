<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../api';

const list = ref<any[]>([]);
const loading = ref(false);
const savingWeight = ref<string | null>(null);
const savingHealth = ref<string | null>(null);
let timer: any;

async function load(silent = false) {
  if (!silent) loading.value = true;
  try {
    const rows = (await api.listNodes()) as any[];
    list.value = rows.map((n) => ({ ...n, weight: n.weight ?? 5 }));
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
  ElMessage.success('已重新启用，Cookie 健康度已重置为 60');
  load();
}
async function reclaim(id: string) {
  await api.reclaimNode(id);
  ElMessage.success('已回收任务');
  load();
}

async function onWeightChange(row: any, value: number | undefined) {
  if (value == null || value < 1 || value > 10) return;
  savingWeight.value = row.node_id;
  try {
    const d = await api.updateNodeWeight(row.node_id, value);
    row.weight = d.weight;
    ElMessage.success(`权重已更新为 ${d.weight}`);
  } catch (e: any) {
    ElMessage.error(e?.message || '权重更新失败');
    load(true);
  } finally {
    savingWeight.value = null;
  }
}

async function onHealthChange(row: any, value: number | undefined) {
  if (value == null || value < 0 || value > 100) return;
  savingHealth.value = row.node_id;
  try {
    const d = await api.updateNodeCookieHealth(row.node_id, value);
    row.cookie_health = d.cookie_health;
    ElMessage.success(`Cookie 健康度已更新为 ${d.cookie_health}`);
  } catch (e: any) {
    ElMessage.error(e?.message || 'Cookie 健康度更新失败');
    load(true);
  } finally {
    savingHealth.value = null;
  }
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
      <el-table-column label="Cookie 健康" width="170">
        <template #default="{ row }">
          <el-input-number
            v-model="row.cookie_health"
            :min="0"
            :max="100"
            :step="5"
            size="small"
            controls-position="right"
            style="width: 120px"
            :disabled="savingHealth === row.node_id"
            @change="(v: number | undefined) => onHealthChange(row, v)"
          />
          <el-progress
            :percentage="row.cookie_health"
            :stroke-width="6"
            :show-text="false"
            :status="row.cookie_health < 30 ? 'exception' : row.cookie_health >= 70 ? 'success' : ''"
            style="margin-top: 6px"
          />
        </template>
      </el-table-column>
      <el-table-column label="调度权重" width="140">
        <template #header>
          <span>调度权重</span>
          <el-tooltip content="1–10，越高越容易被派单（结合 cookie 健康等综合计算）" placement="top">
            <span style="margin-left: 4px; color: #909399; cursor: help">?</span>
          </el-tooltip>
        </template>
        <template #default="{ row }">
          <el-input-number
            v-model="row.weight"
            :min="1"
            :max="10"
            :step="1"
            size="small"
            controls-position="right"
            :disabled="savingWeight === row.node_id"
            @change="(v: number | undefined) => onWeightChange(row, v)"
          />
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
