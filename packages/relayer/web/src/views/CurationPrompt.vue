<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Codemirror } from 'vue-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { api } from '../api';

const prompt = ref('');
const loading = ref(false);
const saving = ref(false);

// Markdown 语法高亮
const extensions = [markdown()];

async function load() {
  loading.value = true;
  try {
    const data = await api.getCurationPrompt();
    prompt.value = data.prompt ?? '';
  } finally {
    loading.value = false;
  }
}

async function save() {
  const value = prompt.value.trim();
  if (!value) {
    ElMessage.warning('Prompt 不能为空');
    return;
  }
  saving.value = true;
  try {
    const data = await api.updateCurationPrompt(prompt.value);
    prompt.value = data.prompt;
    ElMessage.success('已更新');
  } catch (e: any) {
    ElMessage.error(e.message || '更新失败');
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div v-loading="loading">
    <el-card>
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <span>tds_content_curation_prompt</span>
          <div style="display: flex; gap: 8px">
            <el-button @click="load">刷新</el-button>
            <el-button type="primary" :loading="saving" @click="save">更新</el-button>
          </div>
        </div>
      </template>
      <p style="margin: 0 0 12px; color: #909399; font-size: 13px">
        TDS 发帖 AI 质量评分的 system prompt，保存在 global 表。
      </p>
      <Codemirror
        v-model="prompt"
        :extensions="extensions"
        :style="{ height: 'calc(100vh - 260px)', minHeight: '420px' }"
        class="prompt-editor"
      />
    </el-card>
  </div>
</template>

<style scoped>
.prompt-editor :deep(.cm-editor) {
  height: 100%;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  font-size: 14px;
  line-height: 1.6;
}
.prompt-editor :deep(.cm-scroller) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
</style>
