<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { setToken, api } from '../api';

const token = ref('');
const loading = ref(false);
const router = useRouter();

async function submit() {
  if (!token.value.trim()) {
    ElMessage.warning('请输入 ADMIN_TOKEN');
    return;
  }
  setToken(token.value.trim());
  loading.value = true;
  try {
    // 用 stats 接口验证 token 是否有效
    await api.stats();
    ElMessage.success('登录成功');
    router.push({ name: 'dashboard' });
  } catch (e: any) {
    clearTokenLocal();
    ElMessage.error('Token 无效或服务不可用');
  } finally {
    loading.value = false;
  }
}

function clearTokenLocal() {
  localStorage.removeItem('tds_admin_token');
}
</script>

<template>
  <div class="login-wrap">
    <el-card style="width: 380px">
      <template #header>
        <div style="text-align: center; font-weight: 600">tagai-data-supply 管理后台</div>
      </template>
      <el-input
        v-model="token"
        type="password"
        placeholder="输入 ADMIN_TOKEN"
        show-password
        @keyup.enter="submit"
      />
      <el-button type="primary" :loading="loading" style="width: 100%; margin-top: 16px" @click="submit">
        登录
      </el-button>
    </el-card>
  </div>
</template>

<style scoped>
.login-wrap {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f0f2f5;
}
</style>
