import { createRouter, createWebHistory } from "vue-router";
import HomeView from "./views/HomeView";

export const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: "/home", component: HomeView }]
});
