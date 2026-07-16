import axios from 'axios';

const http = axios.create({ baseURL: '' });

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('tds_admin_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

http.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('tds_admin_token');
      if (location.hash !== '#/login' && location.pathname !== '/login') {
        location.href = '/login';
      }
    }
    return Promise.reject(err);
  },
);

// 统一解包 {c:0,d:...} / {c:1,m:...}
function unwrap<T>(res: { data: any }): T {
  const body = res.data;
  if (body && body.c === 0) return body.d as T;
  throw new Error(body?.m || '请求失败');
}

export const api = {
  // stats
  stats: () => http.get('/admin/stats').then(unwrap),

  // topics
  listTopics: () => http.get('/admin/topics').then(unwrap),
  createTopic: (data: { name: string; tick?: string }) =>
    http.post('/admin/topics', data).then(unwrap),
  updateTopic: (id: string, data: { name?: string; tick?: string; enabled?: boolean }) =>
    http.patch(`/admin/topics/${id}`, data).then(unwrap),

  // subtasks
  listSubtasks: () => http.get('/admin/subtasks').then(unwrap),
  createSubtask: (data: any) => http.post('/admin/subtasks', data).then(unwrap),
  toggleSubtask: (id: string, enabled: boolean) =>
    http.patch(`/admin/subtasks/${id}`, { enabled }).then(unwrap),

  // nodes
  listNodes: () => http.get('/admin/nodes').then(unwrap),
  disableNode: (id: string) => http.post(`/admin/nodes/${id}/disable`).then(unwrap),
  reenableNode: (id: string) => http.post(`/admin/nodes/${id}/reenable`).then(unwrap),
  reclaimNode: (id: string) => http.post(`/admin/nodes/${id}/reclaim`).then(unwrap),
  updateNodeWeight: (id: string, weight: number) =>
    http.patch(`/admin/nodes/${id}`, { weight }).then(unwrap) as Promise<{ node_id: string; weight: number }>,
  updateNodeCookieHealth: (id: string, cookie_health: number) =>
    http.patch(`/admin/nodes/${id}`, { cookie_health }).then(unwrap) as Promise<{ node_id: string; cookie_health: number }>,

  // invites
  createInvite: (label?: string) =>
    http.post('/admin/invites', { label }).then(unwrap),
  listInvites: () => http.get('/admin/invites').then(unwrap),

  // pending 推文处理
  listPending: (status = 3) => http.get('/admin/pending', { params: { status } }).then(unwrap),
  retryPending: (id: number) => http.post(`/admin/pending/${id}/retry`).then(unwrap),

  // global: TDS 策展 prompt
  getCurationPrompt: () =>
    http.get('/admin/global/tds-content-curation-prompt').then(unwrap) as Promise<{ prompt: string }>,
  updateCurationPrompt: (prompt: string) =>
    http.put('/admin/global/tds-content-curation-prompt', { prompt }).then(unwrap) as Promise<{ prompt: string }>,

  // 运行日志
  listLogs: (params?: { level?: string; q?: string; since_id?: number; limit?: number }) =>
    http.get('/admin/logs', { params }).then(unwrap) as Promise<{ items: LogRecord[]; latestId: number }>,
};

export interface LogRecord {
  id: number;
  time: number;
  level: string;
  msg: string;
  fields: Record<string, unknown>;
  line: string;
}

export function setToken(token: string) {
  localStorage.setItem('tds_admin_token', token);
}
export function clearToken() {
  localStorage.removeItem('tds_admin_token');
}
export function getToken() {
  return localStorage.getItem('tds_admin_token');
}
