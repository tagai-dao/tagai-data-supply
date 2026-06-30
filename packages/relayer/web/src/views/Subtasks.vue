<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../api';

const list = ref<any[]>([]);
const topics = ref<any[]>([]);
const loading = ref(false);
const dialog = ref(false);
const form = ref({
  topic_id: '',
  type: 'hashtag',
  mode: 'continuous',
  params: '{"q":"#spacex"}',
  tick: '',
  priority: 5,
  schedule_cron: '',
  window_minutes: null as number | null,
});

const topicTick = computed(() => topics.value.find((t) => t.topic_id === form.value.topic_id)?.tick || '');

async function load() {
  loading.value = true;
  try {
    [list.value, topics.value] = await Promise.all([api.listSubtasks(), api.listTopics()] as any);
    list.value = list.value as any[];
    topics.value = topics.value as any[];
  } finally {
    loading.value = false;
  }
}

function onTopicChange() {
  if (!form.value.tick && topicTick.value) form.value.tick = topicTick.value;
}

async function submit() {
  if (!form.value.topic_id) return ElMessage.warning('请选择主题');
  if (!form.value.tick.trim()) return ElMessage.warning('tick 必填（spec §5.1）');
  let params: any;
  try {
    params = JSON.parse(form.value.params);
  } catch {
    return ElMessage.warning('params 不是合法 JSON');
  }
  const body: any = {
    topic_id: form.value.topic_id,
    type: form.value.type,
    mode: form.value.mode,
    params,
    tick: form.value.tick.trim(),
    priority: form.value.priority,
  };
  if (form.value.mode === 'round') {
    body.schedule_cron = form.value.schedule_cron || null;
    body.window_minutes = form.value.window_minutes;
  }
  await api.createSubtask(body);
  ElMessage.success('已创建');
  dialog.value = false;
  form.value = { topic_id: '', type: 'hashtag', mode: 'continuous', params: '{"q":"#spacex"}', tick: '', priority: 5, schedule_cron: '', window_minutes: null };
  load();
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
      <el-table-column label="参数" min-width="160">
        <template #default="{ row }">
          <code style="font-size: 12px">{{ JSON.stringify(row.params) }}</code>
        </template>
      </el-table-column>
      <el-table-column prop="tick" label="tick" width="120" />
      <el-table-column prop="priority" label="优先级" width="70" />
      <el-table-column label="游标" width="180">
        <template #default="{ row }">
          <span style="font-size: 12px">{{ row.cursor || '-' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="启用" width="90">
        <template #default="{ row }">
          <el-switch :model-value="!!row.enabled" @change="(v: any) => toggle(row, v)" />
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialog" title="新建子任务" width="560px">
      <el-form label-width="100px">
        <el-form-item label="主题">
          <el-select v-model="form.topic_id" placeholder="选择主题" @change="onTopicChange" style="width: 100%">
            <el-option v-for="t in topics" :key="t.topic_id" :label="`${t.name} (${t.tick})`" :value="t.topic_id" />
          </el-select>
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="form.type" style="width: 100%">
            <el-option label="hashtag 标签搜索" value="hashtag" />
            <el-option label="user_timeline 用户时间线" value="user_timeline" />
            <el-option label="keyword 关键词搜索" value="keyword" />
            <el-option label="list" value="list" />
          </el-select>
        </el-form-item>
        <el-form-item label="模式">
          <el-radio-group v-model="form.mode">
            <el-radio value="continuous">continuous 持续滚动</el-radio>
            <el-radio value="round">round 按周期</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="参数 (JSON)">
          <el-input v-model="form.params" type="textarea" :rows="2" placeholder='hashtag/keyword: {"q":"#spacex"}；user_timeline: {"username":"elonmusk"}' />
        </el-form-item>
        <el-form-item label="tick">
          <el-input v-model="form.tick" placeholder="推文归属社区，必填。无社区填 no-tick-of-tiptag" />
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
