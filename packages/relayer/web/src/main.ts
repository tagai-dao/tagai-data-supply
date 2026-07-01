import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import App from './App.vue';
import Login from './views/Login.vue';
import Dashboard from './views/Dashboard.vue';
import Topics from './views/Topics.vue';
import Subtasks from './views/Subtasks.vue';
import Nodes from './views/Nodes.vue';
import Invites from './views/Invites.vue';
import Pending from './views/Pending.vue';

const routes = [
  { path: '/login', name: 'login', component: Login },
  { path: '/', name: 'dashboard', component: Dashboard, meta: { title: '总览' } },
  { path: '/topics', name: 'topics', component: Topics, meta: { title: '主题' } },
  { path: '/subtasks', name: 'subtasks', component: Subtasks, meta: { title: '子任务' } },
  { path: '/nodes', name: 'nodes', component: Nodes, meta: { title: '节点' } },
  { path: '/invites', name: 'invites', component: Invites, meta: { title: '邀请码' } },
  { path: '/pending', name: 'pending', component: Pending, meta: { title: '推文处理' } },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// 鉴权守卫
router.beforeEach((to) => {
  const token = localStorage.getItem('tds_admin_token');
  if (!token && to.name !== 'login') {
    return { name: 'login' };
  }
});

const app = createApp(App);
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component);
}
app.use(ElementPlus);
app.use(router);
app.mount('#app');
