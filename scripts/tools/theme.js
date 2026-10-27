import fs from "node:fs";
import path from "node:path";
import { SKILL_ROOT } from "./skill-root.js";

// 主题缓存
let cachedThemes = {}; // 多主题缓存
let currentThemeName = "blue"; // 当前使用的主题名称

/**
 * 获取主题文件夹路径
 * @returns {string} 主题文件夹的绝对路径
 */
function getThemesDir() {
  return path.join(SKILL_ROOT, "themes");
}

/**
 * 获取所有可用的主题列表
 * @returns {string[]} 主题名称数组（不含 .json 后缀）
 */
export function getAvailableThemes() {
  const themesDir = getThemesDir();
  if (!fs.existsSync(themesDir)) {
    return [];
  }
  return fs
    .readdirSync(themesDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.replace(".json", ""));
}

/**
 * 加载指定主题
 * @param {string} themeName - 主题名称（不含 .json 后缀），默认为 "blue"
 * @returns {object} 主题配置对象
 */
export function loadTheme(themeName = "blue") {
  // 如果已缓存，直接返回缓存
  if (cachedThemes[themeName]) {
    return cachedThemes[themeName];
  }
  const themesDir = getThemesDir();
  const themePath = path.join(themesDir, `${themeName}.json`);

  // 检查主题文件是否存在
  if (!fs.existsSync(themePath)) {
    console.error(`主题 "${themeName}" 不存在，使用默认主题 "blue"`);
    return loadTheme("blue");
  }

  // 读取并解析主题文件
  const themeContent = fs.readFileSync(themePath, "utf-8");
  cachedThemes[themeName] = JSON.parse(themeContent);
  return cachedThemes[themeName];
}

/**
 * 设置当前使用的主题（全局状态）
 * @param {string} themeName - 主题名称
 */
export function setCurrentTheme(themeName = "blue") {
  const theme = loadTheme(themeName);
  currentThemeName = themeName;

  // 更新全局主题配置对象
  // 清空 BASE_CONFIG 的旧属性并更新新属性
  for (const key in BASE_CONFIG) {
    delete BASE_CONFIG[key];
  }
  Object.assign(BASE_CONFIG, theme.base);

  // 更新 BLUE_THEME 的所有属性
  const newThemeColors = {
    ...theme.colors,
    codeBlock: theme.codeBlock,
    blockquoteAlert: theme.blockquoteAlert,
    blockquoteNormal: theme.blockquoteNormal,
    hr: theme.hr,
    headingSpan: theme.headingSpan,
    decorations: theme.decorations || null,
  };

  // 清空 BLUE_THEME 的旧属性并更新新属性
  for (const key in BLUE_THEME) {
    delete BLUE_THEME[key];
  }
  Object.assign(BLUE_THEME, newThemeColors);

  // 更新设置
  for (const key in BLUE_THEME_SETTINGS) {
    delete BLUE_THEME_SETTINGS[key];
  }
  Object.assign(BLUE_THEME_SETTINGS, theme.settings);

  return theme;
}

// ============ 全局主题配置对象（可变） ============
// 这些对象会被 setCurrentTheme 函数更新

// 初始加载默认主题
const defaultTheme = loadTheme("blue");

// 基础配置 (可变对象，可被 setCurrentTheme 更新)
export const BASE_CONFIG = { ...defaultTheme.base };

// BLUE_THEME 包含所有颜色相关配置 (可变对象，可被 setCurrentTheme 更新)
export const BLUE_THEME = {
  ...defaultTheme.colors,
  codeBlock: defaultTheme.codeBlock,
  blockquoteAlert: defaultTheme.blockquoteAlert,
  blockquoteNormal: defaultTheme.blockquoteNormal,
  hr: defaultTheme.hr,
  headingSpan: defaultTheme.headingSpan,
};

// 主题设置 (可变对象，可被 setCurrentTheme 更新)
export const BLUE_THEME_SETTINGS = { ...defaultTheme.settings };
