<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../api';

const list = ref<any[]>([]);
const topics = ref<any[]>([]);
const loading = ref(false);
const dialog = ref(false);

const LISTEN_TYPES = [
  { value: 'hashtag', label: '标签搜索', placeholder: '如 spacex, starship' },
  { value: 'user_timeline', label: '账号发文', placeholder: '如 elonmusk' },
  { value: 'mention', label: '@提及', placeholder: '如 SpaceX' },
  { value: 'keyword', label: '关键词', placeholder: '如 starship launch' },
];

const form = ref({
  topic_id: '',
  listenType: 'hashtag',
  content: '',
  mode: 'continuous',
  tick: '',
  priority: 5,
  schedule_cron: '',
  window_minutes: null as number | null,
});

const topicTick = computed(() => topics.value.find((t) => t.topic_id === form.value.topic_id)?.tick || '');

async function load() {
  loading.value = true;
  try {
    const [s, t] = await Promise.all([api.listSubtasks(), api.listTopics()] as any);
    list.value = s as any[];
    topics.value = t as any[];
  } finally {
    loading.value = false;
  }
}

function onTopicChange() {
  if (!form.value.tick && topicTick.value) form.value.tick = topicTick.value;
}

// 按监听类型 + 内容构造 subtask（单条）
function buildTask(): { type: string; params: any } | null {
  const content = form.value.content.trim();
  if (!content) return null;
  const t = form.value.listenType;
  if (t === 'hashtag') {
    const tags = content.split(/[,，\s]+/).filter(Boolean).map((x) => x.replace(/^#/, ''));
    return tags.length ? { type: 'hashtag', params: { q: tags.map((x) => '#' + x).join(' OR ') } } : null;
  }
  if (t === 'user_timeline') {
    const u = content.split(/[,，\s]+/).filter(Boolean).map((x) => x.replace(/^@/, ''))[0];
    return u ? { type: 'user_timeline', params: { username: u } } : null;
  }
  if (t === 'mention') {
    const ms = content.split(/[,，\s]+/).filter(Boolean).map((x) => x.replace(/^@/, ''));
    return ms.length ? { type: 'keyword', params: { q: ms.map((x) => '@' + x).join(' OR ') } } : null;
  }
  return { type: 'keyword', params: { q: content } };
}

async function submit() {
  if (!form.value.topic_id) return ElMessage.warning('请选择主题');
  if (!form.value.tick.trim()) return ElMessage.warning('tick 必填');
  const task = buildTask();
  if (!task) return ElMessage.warning('请填写监听内容');
  const body: any = {
    topic_id: form.value.topic_id,
    type: task.type,
    mode: form.value.mode,
    params: task.params,
    tick: form.value.tick.trim(),
    priority: form.value.priority,
  };
  if (form.value.mode === 'round') {
    body.schedule_cron = form.value.schedule_cron || null;
    body.window_minutes = form.value.window_minutes;
  }
  try {
    await api.createSubtask(body);
    ElMessage.success('已创建');
    dialog.value = false;
    form.value = { topic_id: '', listenType: 'hashtag', content: '', mode: 'continuous', tick: '', priority: 5, schedule_cron: '', window_minutes: null };
    load();
  } catch (e: any) {
    ElMessage.error(e.message || '创建失败');
  }
}

async function toggle(row: any, enabled: boolean) {
  await api.toggleSubtask(row.subtask_id, enabled);
  ElMessage.success(enabled ? '已启用' : '已停用');
  load();
}

onMounted(load);
</script>

<template>
  <div>
    <div style="margin-bottom: 12px">
      <el-button type="primary" @click="dialog = true">新建子任务</el-button>
      <el-button @click="load">刷新</el-button>
    </div>
    <el-table :data="list" v-loading="loading" border>
      <el-table-column prop="subtask_id" label="Subtask ID" width="180" />
      <el-table-column prop="topic_id" label="Topic" width="160" />
      <el-table-column prop="type" label="类型" width="110" />
      <el-table-column prop="mode" label="模式" width="90" />
      <el-table-column label="参数" min-width="200">
        <template #default="{ row }">
          <code style="font-size: 12px">{{ JSON.stringify(row.params) }}</code>
        </template>
      </el-table-column>
      <el-table-column prop="tick" label="tick" width="120" />
      <el-table-column prop="priority" label="优先级" width="70" />
      <el-table-column label="前沿 tweet" width="200">
        <template #default="{ row }">
          <span style="font-size: 12px">{{ row.watermark_tweet_id || '-' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="启用" width="90">
        <template #default="{ row }">
          <el-switch :model-value="!!row.enabled" @change="(v: any) => toggle(row, v)" />
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialog" title="新建子任务" width="560px" :close-on-click-modal="false">
      <el-form label-width="100px">
        <el-form-item label="主题">
          <el-select v-model="form.topic_id" placeholder="选择主题" @change="onTopicChange" style="width: 100%">
            <el-option v-for="t in topics" :key="t.topic_id" :label="`${t.name} (${t.tick})`" :value="t.topic_id" />
          </el-select>
        </el-form-item>
        <el-form-item label="监听类型">
          <el-select v-model="form.listenType" style="width: 100%">
            <el-option v-for="t in LISTEN_TYPES" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="监听内容">
          <el-input v-model="form.content" :placeholder="LISTEN_TYPES.find(t=>t.value===form.listenType)?.placeholder" />
          <div style="color:#909399;font-size:12px">多个用逗号分隔。标签/关键词/@提及会合并为 OR 查询；账号发文取首个。</div>
        </el-form-item>
        <el-form-item label="模式">
          <el-radio-group v-model="form.mode">
            <el-radio value="continuous">continuous 持续滚动</el-radio>
            <el-radio value="round">round 按周期</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="tick">
          <el-input v-model="form.tick" placeholder="推文归属社区，必填" />
        </el-form-item>
        <el-form-item label="优先级">
          <el-input-number v-model="form.priority" :min="1" :max="10" />
        </el-form-item>
        <template v-if="form.mode === 'round'">
          <el-form-item label="cron 表达式">
            <el-input v-model="form.schedule_cron" placeholder="如 */10 * * * *" />
          </el-form-item>
          <el-form-item label="窗口(分钟)">
            <el-input-number v-model="form.window_minutes" :min="1" />
          </el-form-item>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" @click="submit">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>
