<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../api';

const lastSecret = ref('');
const loading = ref(false);

async function gen() {
  loading.value = true;
  try {
    const r: any = await api.createInvite();
    lastSecret.value = r.invite_secret;
  } finally {
    loading.value = false;
  }
}
async function copy() {
  if (!lastSecret.value) return;
  await navigator.clipboard.writeText(lastSecret.value);
  ElMessage.success('已复制到剪贴板');
}
</script>

<template>
  <div>
    <el-card>
      <div style="display: flex; align-items: center; gap: 12px">
        <el-button type="primary" :loading="loading" @click="gen">生成一次性邀请码</el-button>
        <span style="color: #909399; font-size: 12px">邀请码一次性使用，节点注册后即失效</span>
      </div>
      <div v-if="lastSecret" style="margin-top: 16px">
        <el-alert type="warning" :closable="false" title="请立即保存，关闭后无法再查看明文" show-icon />
        <el-input :model-value="lastSecret" readonly style="margin-top: 8px">
          <template #append>
            <el-button @click="copy">复制</el-button>
          </template>
        </el-input>
      </div>
    </el-card>

    <el-card style="margin-top: 16px" header="如何使用邀请码">
      <div style="line-height: 1.9; color: #606266; font-size: 14px">
        <p>1. 在 Node 机器上安装并运行：<code>tagai-node configure --http-base &lt;relayer地址&gt; --invite-secret &lt;上面的邀请码&gt;</code></p>
        <p>2. 填入推特 cookie：<code>tagai-node login</code></p>
        <p>3. 常驻运行：<code>tagai-node run</code></p>
        <p style="color: #909399">注册成功后该邀请码失效，节点会出现在「节点」页。</p>
      </div>
    </el-card>
  </div>
</template>
