<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../api';

const list = ref<any[]>([]);
const loading = ref(false);
const statusFilter = ref(3);

const statusType = (s: number) => ({ 0: 'info', 1: 'warning', 2: 'success', 3: 'danger', 5: '' } as any)[s] || 'info';
const statusLabel = (s: number) => ({ 0: '待处理', 1: '已发帖', 2: '完成', 3: '失败', 5: '处理中' } as any)[s] || s;

const tweetTypeLabel = (row: { tweet_type?: string; kind?: string }) => {
  const t = row.tweet_type || (row.kind === 'reply' ? 'reply' : 'original');
  if (t === 'quote') return '引用';
  if (t === 'reply') return '回复';
  return '推文';
};

const tweetTypeTag = (row: { tweet_type?: string; kind?: string }) => {
  const t = row.tweet_type || (row.kind === 'reply' ? 'reply' : 'original');
  if (t === 'quote') return 'warning';
  if (t === 'reply') return 'info';
  return 'success';
};

function withLabel(id: string | null | undefined, label: string | null | undefined) {
  if (!id) return '-';
  return label ? `${id} (${label})` : id;
}

async function load() {
  loading.value = true;
  try { list.value = (await api.listPending(statusFilter.value)) as any[]; }
  finally { loading.value = false; }
}
async function retry(id: number) {
  await api.retryPending(id);
  ElMessage.success('已重试');
  load();
}
onMounted(load);
</script>

<template>
  <div>
    <div style="margin-bottom: 12px; display: flex; gap: 8px; align-items: center">
      <el-select v-model="statusFilter" @change="load" style="width: 140px">
        <el-option label="失败 (3)" :value="3" />
        <el-option label="待处理 (0)" :value="0" />
        <el-option label="已发帖 (1)" :value="1" />
        <el-option label="完成 (2)" :value="2" />
        <el-option label="全部" :value="-1" />
      </el-select>
      <el-button @click="load">刷新</el-button>
      <span style="color:#909399;font-size:12px">status=-1 查全部</span>
    </div>
    <el-table :data="list" v-loading="loading" border>
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column prop="tweet_id" label="Tweet ID" width="180" show-overflow-tooltip />
      <el-table-column label="类型" width="80">
        <template #default="{ row }">
          <el-tag :type="tweetTypeTag(row)" size="small">{{ tweetTypeLabel(row) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="tick" label="tick" width="110" />
      <el-table-column label="抓取节点" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">{{ withLabel(row.node_id, row.node_label) }}</template>
      </el-table-column>
      <el-table-column label="策展账号" min-width="180" show-overflow-tooltip>
        <template #default="{ row }">{{ withLabel(row.tagai_account, row.tagai_username) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }"><el-tag :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag></template>
      </el-table-column>
      <el-table-column prop="retry_count" label="重试" width="60" />
      <el-table-column prop="last_error" label="错误" min-width="160" show-overflow-tooltip />
      <el-table-column prop="update_at" label="更新时间" width="170" />
      <el-table-column label="操作" width="90" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" @click="retry(row.id)" :disabled="row.status !== 3">重试</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="!list.length && !loading" description="无记录" />
  </div>
</template>
