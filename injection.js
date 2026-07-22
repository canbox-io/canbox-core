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
 *   - store: 键值存储（data/{appId}/store/{name}.json）
 *   - db:    文档数据库（data/{appId}/db/）
 *   - misc:  平台环境/诊断信息（hello、getUserData、getCoreVersion、getCorePath、getPlatformInfo）
 *
 * 设计原则：canbox-core 是"可选服务提供层"，只提供 APP 自己做不了、
 * 或做起来会破坏平台约定（如数据隔离）的能力。窗口/对话框/快捷键/提权/
 * shell 等 APP 一行 Electron 代码即可完成的能力，不再由 core 提供，
 * 避免侵入 APP 开发、避免让 APP 离不开 core。
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

// 阶段 1.5: BrowserWindow partition 注入
// 共享 userData（env.js 阶段1 设置）会让所有 APP 的渲染进程共用同一个
// Local Storage/leveldb，跨进程打开同一 leveldb 会触发 LOCK 等待，导致
// 后启动的 APP 卡顿数秒。这里通过 monkey-patch BrowserWindow 构造函数，
// 在 APP 未显式指定 partition 时自动注入 persist:canbox-{appId}，让每个 APP
// 拥有独立的 leveldb 文件，物理隔离 LOCK，对 APP 完全透明。
// APP 显式指定 partition 时尊重 APP 意图，不覆盖。
(function injectBrowserWindowPartition() {
    const electron = require('electron');
    const _OrigBrowserWindow = electron.BrowserWindow;
    if (!_OrigBrowserWindow || typeof _OrigBrowserWindow !== 'function') return;

    class PatchedBrowserWindow extends _OrigBrowserWindow {
        constructor(options = {}) {
            const wp = options.webPreferences || {};
            if (!wp.partition) {
                wp.partition = `persist:canbox-${env.appId}`;
            }
            options.webPreferences = wp;
            super(options);
        }
    }

    try {
        electron.BrowserWindow = PatchedBrowserWindow;
    } catch (e) {
        console.warn('[canbox-core] BrowserWindow partition patch 失败:', e.message);
    }
})();

// 阶段 2: API 注册（仅保留体现平台价值的核心服务）
console.time('[startup] injection 阶段2: API 注册 (3个模块)');
require('./lib/store').register(ipcMain, env);
require('./lib/db').register(ipcMain, env);

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

// 将路径信息写入 {userData}/paths.json，供 bin/canbox 启动器读取
// （userData 是固定路径，不依赖 customDataRoot，bin/canbox 可直接定位）
const launcherStore = new Store({
    cwd: env.userData,
    name: 'paths'
});
launcherStore.set('usersPath', env.usersPath);
launcherStore.set('corePath', path.resolve(__dirname));
launcherStore.set('coreVersion', coreVersion);

// 将 env 和 corePath 挂到全局变量，供 APP main.js 直接读取（APP 不 npm install canbox-core）
global.__CANBOX_ENV__ = env;
global.__CANBOX_CORE_PATH__ = path.resolve(__dirname);

console.timeEnd('[startup] injection 阶段2: API 注册 (3个模块)');
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
