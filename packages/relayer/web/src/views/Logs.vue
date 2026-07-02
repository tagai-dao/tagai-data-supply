<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { api, type LogRecord } from '../api';

const LEVEL_OPTIONS = [
  { value: 'trace', label: 'TRACE' },
  { value: 'debug', label: 'DEBUG' },
  { value: 'info', label: 'INFO' },
  { value: 'warn', label: 'WARN' },
  { value: 'error', label: 'ERROR' },
  { value: 'fatal', label: 'FATAL' },
];

const logs = ref<LogRecord[]>([]);
const loading = ref(false);
const autoRefresh = ref(true);
const levels = ref<string[]>(['trace', 'debug', 'info', 'warn', 'error', 'fatal']);
const keyword = ref('');
const latestId = ref(0);
const paused = ref(false);
let timer: ReturnType<typeof setInterval> | null = null;

const levelType = (level: string) => {
  const map: Record<string, string> = {
    trace: 'info',
    debug: 'info',
    info: 'success',
    warn: 'warning',
    error: 'danger',
    fatal: 'danger',
  };
  return map[level] || 'info';
};

function formatTime(ms: number) {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} `
    + `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const displayLogs = computed(() => {
  if (!paused.value) return logs.value;
  return logs.value;
});

async function load(reset = false) {
  loading.value = true;
  try {
    const levelParam = levels.value.length > 0 ? levels.value.join(',') : undefined;
    const res = await api.listLogs({
      level: levelParam,
      q: keyword.value.trim() || undefined,
      since_id: reset ? 0 : latestId.value,
      limit: reset ? 300 : 200,
    });
    if (reset) {
      logs.value = res.items;
    } else if (res.items.length) {
      const seen = new Set(logs.value.map((l) => l.id));
      const merged = [...logs.value];
      for (const item of res.items) {
        if (!seen.has(item.id)) merged.push(item);
      }
      logs.value = merged.slice(-2000);
    }
    latestId.value = res.latestId;
  } finally {
    loading.value = false;
  }
}

function onSearch() {
  paused.value = false;
  load(true);
}

function clearView() {
  logs.value = [];
  latestId.value = 0;
  load(true);
}

function togglePause() {
  paused.value = !paused.value;
}

onMounted(() => {
  load(true);
  timer = setInterval(() => {
    if (autoRefresh.value && !paused.value) load(false);
  }, 2000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <div v-loading="loading && logs.length === 0">
    <el-card shadow="never" style="margin-bottom: 12px">
      <el-form inline @submit.prevent="onSearch">
        <el-form-item label="级别">
          <el-select
            v-model="levels"
            multiple
            collapse-tags
            collapse-tags-tooltip
            placeholder="全部"
            style="min-width: 220px"
            @change="onSearch"
          >
            <el-option
              v-for="opt in LEVEL_OPTIONS"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="关键词">
          <el-input
            v-model="keyword"
            clearable
            placeholder="消息或字段内容"
            style="width: 240px"
            @keyup.enter="onSearch"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="onSearch">查询</el-button>
          <el-button @click="clearView">清空</el-button>
          <el-button :type="paused ? 'warning' : 'default'" @click="togglePause">
            {{ paused ? '已暂停' : '暂停滚动' }}
          </el-button>
        </el-form-item>
        <el-form-item label="自动刷新">
          <el-switch v-model="autoRefresh" />
        </el-form-item>
      </el-form>
      <div style="color: #909399; font-size: 12px">
        展示 Relayer 进程内存缓冲（最多 5000 条，含 DEBUG）。终端仍按 LOG_LEVEL 过滤；管理页可单独筛级别。
      </div>
    </el-card>

    <el-card shadow="never">
      <div class="log-list" ref="logBox">
        <div v-if="displayLogs.length === 0" style="color: #909399; padding: 24px; text-align: center">
          暂无日志
        </div>
        <div v-for="row in displayLogs" :key="row.id" class="log-row">
          <span class="log-time">{{ formatTime(row.time) }}</span>
          <el-tag :type="levelType(row.level) as any" size="small" class="log-level">
            {{ row.level.toUpperCase() }}
          </el-tag>
          <span class="log-msg">{{ row.msg }}</span>
          <span v-if="Object.keys(row.fields).length" class="log-fields">
            {{ Object.entries(row.fields).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' ') }}
          </span>
        </div>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.log-list {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  max-height: calc(100vh - 260px);
  overflow: auto;
  background: #1e1e1e;
  color: #d4d4d4;
  border-radius: 4px;
  padding: 8px 0;
}
.log-row {
  padding: 2px 12px;
  white-space: pre-wrap;
  word-break: break-all;
}
.log-row:hover {
  background: #2a2a2a;
}
.log-time {
  color: #858585;
  margin-right: 8px;
}
.log-level {
  margin-right: 8px;
  vertical-align: middle;
}
.log-msg {
  color: #d4d4d4;
}
.log-fields {
  color: #9cdcfe;
  margin-left: 6px;
}
</style>
