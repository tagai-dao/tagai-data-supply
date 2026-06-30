<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../api';

const list = ref<any[]>([]);
const loading = ref(false);
const dialog = ref(false);
const submitting = ref(false);
const form = ref({ name: '', tick: 'no-tick-of-tiptag' });

// 监听类型选项
const LISTEN_TYPES = [
  { value: 'hashtag', label: '标签搜索', placeholder: '如 spacex, starship（多个用逗号分隔）', desc: '搜索包含这些 #标签 的推文' },
  { value: 'user_timeline', label: '账号发文', placeholder: '如 elonmusk, SpaceX（多个用逗号分隔）', desc: '监听这些账号发布的推文' },
  { value: 'mention', label: '@提及', placeholder: '如 SpaceX, elonmusk（多个用逗号分隔）', desc: '搜索 @提及 这些账号的推文' },
  { value: 'keyword', label: '关键词', placeholder: '如 starship launch', desc: '搜索包含该关键词的推文' },
];

interface ListenItem {
  type: string;
  content: string;
}
const items = ref<ListenItem[]>([{ type: 'hashtag', content: '' }]);

function addItem() {
  items.value.push({ type: 'hashtag', content: '' });
}
function removeItem(idx: number) {
  items.value.splice(idx, 1);
}

function placeholderFor(type: string) {
  return LISTEN_TYPES.find((t) => t.value === type)?.placeholder || '';
}
function descFor(type: string) {
  return LISTEN_TYPES.find((t) => t.value === type)?.desc || '';
}

// 把监听项转换为 subtask 列表
function buildSubtasks(): { type: string; params: any }[] {
  const tasks: { type: string; params: any }[] = [];
  for (const it of items.value) {
    const content = it.content.trim();
    if (!content) continue;
    if (it.type === 'hashtag') {
      const tags = content.split(/[,，\s]+/).filter(Boolean).map((t) => t.replace(/^#/, ''));
      if (tags.length) tasks.push({ type: 'hashtag', params: { q: tags.map((t) => '#' + t).join(' OR ') } });
    } else if (it.type === 'user_timeline') {
      // 账号发文：每个账号一个 subtask（user_timeline 一次一个账号）
      const users = content.split(/[,，\s]+/).filter(Boolean).map((u) => u.replace(/^@/, ''));
      for (const u of users) tasks.push({ type: 'user_timeline', params: { username: u } });
    } else if (it.type === 'mention') {
      const ms = content.split(/[,，\s]+/).filter(Boolean).map((m) => m.replace(/^@/, ''));
      if (ms.length) tasks.push({ type: 'keyword', params: { q: ms.map((m) => '@' + m).join(' OR ') } });
    } else if (it.type === 'keyword') {
      tasks.push({ type: 'keyword', params: { q: content } });
    }
  }
  return tasks;
}

const validItemsCount = computed(() => buildSubtasks().length);

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
  if (!form.value.tick.trim()) {
    ElMessage.warning('请填写 tick（无社区填 no-tick-of-tiptag）');
    return;
  }
  const tasks = buildSubtasks();
  submitting.value = true;
  try {
    const topic: any = await api.createTopic({
      name: form.value.name.trim(),
      tick: form.value.tick.trim() || 'no-tick-of-tiptag',
    });
    // 批量创建监听子任务
    for (const t of tasks) {
      await api.createSubtask({
        topic_id: topic.topic_id,
        type: t.type,
        mode: 'continuous',
        params: t.params,
        tick: form.value.tick.trim() || 'no-tick-of-tiptag',
        priority: 5,
      });
    }
    ElMessage.success(`主题已创建${tasks.length ? `，并生成 ${tasks.length} 个监听子任务` : ''}`);
    dialog.value = false;
    resetForm();
    load();
  } catch (e: any) {
    ElMessage.error(e.message || '创建失败');
  } finally {
    submitting.value = false;
  }
}

function resetForm() {
  form.value = { name: '', tick: 'no-tick-of-tiptag' };
  items.value = [{ type: 'hashtag', content: '' }];
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
      <el-table-column label="子任务">
        <template #default="{ row }">
          <router-link :to="{ name: 'subtasks' }" style="color: var(--el-color-primary); text-decoration: none">
            前往子任务页查看 →
          </router-link>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialog" title="新建主题" width="640px" :close-on-click-modal="false">
      <el-form label-width="90px">
        <el-form-item label="主题名">
          <el-input v-model="form.name" placeholder="如 SPACEX" />
        </el-form-item>
        <el-form-item label="tick">
          <el-input v-model="form.tick" placeholder="推文归属社区，无社区填 no-tick-of-tiptag" />
        </el-form-item>

        <el-divider content-position="left">监听项（可选，提交时自动生成子任务）</el-divider>

        <div v-for="(it, idx) in items" :key="idx" class="listen-row">
          <el-select v-model="it.type" placeholder="监听类型" style="width: 130px">
            <el-option v-for="t in LISTEN_TYPES" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
          <el-input
            v-model="it.content"
            :placeholder="placeholderFor(it.type)"
            style="flex: 1"
          />
          <el-button
            type="danger"
            :icon="'Delete'"
            circle
            plain
            @click="removeItem(idx)"
            :disabled="items.length === 1"
          />
          <div class="listen-desc">{{ descFor(it.type) }}</div>
        </div>

        <el-button link type="primary" @click="addItem" style="margin-top: 4px">+ 添加监听项</el-button>
      </el-form>

      <div style="color: #909399; font-size: 12px; margin: 8px 0 0 90px">
        将生成 {{ validItemsCount }} 个子任务。标签/@提及/关键词多个项会合并为 OR 查询；账号发文每个账号一个子任务。
      </div>

      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submit">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.listen-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.listen-desc {
  flex-basis: 100%;
  color: #909399;
  font-size: 12px;
  margin-top: -8px;
  padding-left: 138px;
}
</style>
