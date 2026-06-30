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

  // invites
  createInvite: () => http.post('/admin/invites').then(unwrap),
};

export function setToken(token: string) {
  localStorage.setItem('tds_admin_token', token);
}
export function clearToken() {
  localStorage.removeItem('tds_admin_token');
}
export function getToken() {
  return localStorage.getItem('tds_admin_token');
}
