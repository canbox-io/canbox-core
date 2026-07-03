/**
 * canbox-core injection.js
 *
 * 本文件通过 Electron -r 标志在 APP 主进程启动前被预加载：
 *   electron -r {canbox-core}/injection.js {APP-path}/ --app-id={appId}
 *
 * 提供的隐性能力（对 APP 透明，不调用即无感知）：
 *   - 统一 userData 路径（~/.config/canbox/，config.json 在此）
 *   - 业务数据根目录（UsersBase，可由 customDataRoot 搬迁）
 *   - appId 解析（--app-id 参数或 package.json name）
 *   - module-alias 注册（@canbox-core → lib/）
 *   - 统一日志（写入 {Users}/logs/canbox.log）
 *
 * 提供的显性 API（APP 通过 IPC 按需调用，黑盒式，APP 不传 appId）：
 *   - store:   键值存储（data/{appId}/store/{name}.json）
 *   - db:      文档数据库（data/{appId}/db/）
 *   - dialog:  原生对话框
 *   - window:  窗口管理 / 通知
 *   - lifecycle: 生命周期回调
 *   - shortcut: 全局快捷键
 *   - sudo:    提权执行
 *   - misc:    杂项功能（openUrl、getUserData 等）
 *
 * 阶段 1: 环境初始化（必须最早执行，早于 APP main.js）
 * 阶段 2: API 注册（ipcMain.handle，早于 APP renderer）+ 写 core 路径到 canbox.json
 * 阶段 3: 运行时初始化（app.whenReady 后懒加载 logger）
 */

const { app, ipcMain } = require('electron');
const path = require('path');

console.time('[startup] injection.js 总耗时 (阶段1+2)');

// 阶段 1: 环境初始化
console.time('[startup] injection 阶段1: 环境初始化 (env.js)');
const env = require('./lib/env');
console.timeEnd('[startup] injection 阶段1: 环境初始化 (env.js)');

// 阶段 2: API 注册
console.time('[startup] injection 阶段2: API 注册 (8个模块)');
require('./lib/store').register(ipcMain, env);
require('./lib/db').register(ipcMain, env);
require('./lib/dialog').register(ipcMain);
require('./lib/window').register(ipcMain);
require('./lib/lifecycle').register(ipcMain);
require('./lib/shortcut').register(ipcMain);
require('./lib/sudo').register(ipcMain);

const coreVersion = require('./package.json').version;
require('./lib/misc').register(ipcMain, env, coreVersion);

// 将 canbox-core 根目录路径写入 {Users}/canbox.json，供 canbox-developer 等 APP 获取
// （developer 启动其他 APP 时需要知道 injection.js 的绝对路径）
const Store = require('electron-store');
const coreStore = new Store({
    cwd: env.usersPath,
    name: 'canbox'
});
coreStore.set('core.injectionPath', path.resolve(__dirname));
coreStore.set('core.version', coreVersion);

console.timeEnd('[startup] injection 阶段2: API 注册 (8个模块)');
console.timeEnd('[startup] injection.js 总耗时 (阶段1+2)');

// 阶段 3: 运行时初始化
app.whenReady().then(() => {
    console.time('[startup] injection 阶段3: logger.init');
    require('./lib/logger').init(env.usersPath);
    console.timeEnd('[startup] injection 阶段3: logger.init');
});

// 导出的 module.exports 供其他 Node.js 代码引用
// APP main.js 可以通过此 exports 直接访问 store/db/logger
module.exports = {
    get userData() { return env.userData; },
    get usersPath() { return env.usersPath; },
    get appId() { return env.appId; },
    get store() { return require('./lib/store'); },
    get db() { return require('./lib/db'); },
    get logger() { return require('./lib/logger').get(); }
};
