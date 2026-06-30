<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../api';

const list = ref<any[]>([]);
const loading = ref(false);
const dialog = ref(false);
const form = ref({ name: '', tick: 'no-tick-of-tiptag' });

async function load() {
  loading.value = true;
  try {
    list.value = (await api.listTopics()) as any[];
  } finally {
    loading.value = false;
  }
}
async function submit() {
  if (!form.value.name.trim()) {
    ElMessage.warning('请填写主题名');
    return;
  }
  await api.createTopic({ name: form.value.name.trim(), tick: form.value.tick || 'no-tick-of-tiptag' });
  ElMessage.success('已创建');
  dialog.value = false;
  form.value = { name: '', tick: 'no-tick-of-tiptag' };
  load();
}
onMounted(load);
</script>

<template>
  <div>
    <div style="margin-bottom: 12px">
      <el-button type="primary" @click="dialog = true">新建主题</el-button>
      <el-button @click="load">刷新</el-button>
    </div>
    <el-table :data="list" v-loading="loading" border>
      <el-table-column prop="topic_id" label="Topic ID" />
      <el-table-column prop="name" label="名称" />
      <el-table-column prop="tick" label="默认 tick" />
      <el-table-column label="启用">
        <template #default="{ row }">
          <el-tag :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '是' : '否' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="created_at" label="创建时间" />
    </el-table>

    <el-dialog v-model="dialog" title="新建主题" width="440px">
      <el-form label-width="90px">
        <el-form-item label="名称">
          <el-input v-model="form.name" placeholder="如 SPACEX" />
        </el-form-item>
        <el-form-item label="默认 tick">
          <el-input v-model="form.tick" placeholder="归属社区 tick，无社区填 no-tick-of-tiptag" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" @click="submit">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>
