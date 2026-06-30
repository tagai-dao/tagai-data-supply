<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../api';

const lastSecret = ref('');
const lastLabel = ref('');
const loading = ref(false);
const label = ref('');
const list = ref<any[]>([]);

async function gen() {
  if (!label.value.trim()) {
    ElMessage.warning('请填写节点名字（便于管理）');
    return;
  }
  loading.value = true;
  try {
    const r: any = await api.createInvite(label.value.trim());
    lastSecret.value = r.invite_secret;
    lastLabel.value = label.value.trim();
    label.value = '';
    load();
  } finally {
    loading.value = false;
  }
}
async function copy() {
  if (!lastSecret.value) return;
  await navigator.clipboard.writeText(lastSecret.value);
  ElMessage.success('已复制到剪贴板');
}
async function load() {
  try {
    list.value = (await api.listInvites()) as any[];
  } catch {}
}
const statusType = (s: string) =>
  ({ active: 'success', used: 'info', revoked: 'danger' } as any)[s] || 'info';
onMounted(load);
</script>

<template>
  <div>
    <el-card>
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px">
        <el-input
          v-model="label"
          placeholder="为这个邀请码起个名字，如「张三的节点」「节点A」"
          style="width: 320px"
          @keyup.enter="gen"
        />
        <el-button type="primary" :loading="loading" @click="gen">生成一次性邀请码</el-button>
        <span style="color: #909399; font-size: 12px">邀请码一次性使用，节点注册后即失效，名字会自动继承到节点</span>
      </div>
      <div v-if="lastSecret" style="margin-top: 12px">
        <el-alert type="warning" :closable="false" :title="`「${lastLabel}」的邀请码 —— 请立即保存，关闭后无法再查看明文`" show-icon />
        <el-input :model-value="lastSecret" readonly style="margin-top: 8px">
          <template #append>
            <el-button @click="copy">复制</el-button>
          </template>
        </el-input>
      </div>
    </el-card>

    <el-card style="margin-top: 16px">
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <span>邀请码列表</span>
          <el-button size="small" @click="load">刷新</el-button>
        </div>
      </template>
      <el-table :data="list" border>
        <el-table-column prop="label" label="名字" width="160" />
        <el-table-column prop="invite_id" label="Invite ID" width="200" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="node_id" label="关联节点" width="220">
          <template #default="{ row }">
            <span v-if="row.node_id" style="font-size: 12px">{{ row.node_id }}</span>
            <span v-else style="color: #c0c4cc">未注册</span>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" />
        <el-table-column prop="used_at" label="使用时间" />
      </el-table>
      <el-empty v-if="!list.length" description="暂无邀请码" />
    </el-card>

    <el-card style="margin-top: 16px" header="如何使用邀请码">
      <div style="line-height: 1.9; color: #606266; font-size: 14px">
        <p>1. 在 Node 机器上安装并运行：<code>tagai-node configure --http-base &lt;relayer地址&gt; --invite-secret &lt;上面的邀请码&gt;</code></p>
        <p>2. 填入推特 cookie：<code>tagai-node login</code></p>
        <p>3. 常驻运行：<code>tagai-node run</code></p>
        <p style="color: #909399">注册成功后该邀请码失效，名字会继承到节点，节点会出现在「节点」页。</p>
      </div>
    </el-card>
  </div>
</template>
