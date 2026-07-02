/**
 * canbox-core injection.js
 *
 * 本文件通过 Electron -r 标志在 APP 主进程启动前被预加载：
 *   electron -r {canbox-core}/injection.js {APP-path}/
 *
 * 提供的隐性能力（对 APP 透明，不调用即无感知）：
 *   - 统一 userData 路径（所有 APP 共享同一数据目录）
 *   - module-alias 注册（@canbox-core → lib/）
 *   - 统一日志（写入 {userData}/logs/canbox.log）
 *
 * 提供的显性 API（APP 通过 IPC 按需调用）：
 *   - store:   键值存储（electron-store 封装）
 *   - db:      文档数据库（PouchDB 封装）
 *   - dialog:  原生对话框
 *   - window:  窗口管理 / 通知
 *   - lifecycle: 生命周期回调
 *   - shortcut: 全局快捷键
 *   - sudo:    提权执行命令
 *   - misc:    杂项功能（shell、剪贴板等）
 *
 * 阶段 1: 环境初始化（必须最早执行，早于 APP main.js）
 * 阶段 2: API 注册（ipcMain.handle，早于 APP renderer）
 * 阶段 3: 运行时初始化（app.whenReady 后懒加载）
 */

const { app, ipcMain } = require('electron');

console.time('[startup] injection.js 总耗时 (阶段1+2)');

// 阶段 1: 环境初始化
console.time('[startup] injection 阶段1: 环境初始化 (env.js)');
const env = require('./lib/env');
console.timeEnd('[startup] injection 阶段1: 环境初始化 (env.js)');

// 阶段 2: API 注册
console.time('[startup] injection 阶段2: API 注册 (8个模块)');
require('./lib/store').register(ipcMain, env.userData);
require('./lib/db').register(ipcMain, env.userData);
require('./lib/dialog').register(ipcMain);
require('./lib/window').register(ipcMain);
require('./lib/lifecycle').register(ipcMain);
require('./lib/shortcut').register(ipcMain);
require('./lib/sudo').register(ipcMain);

const coreVersion = require('./package.json').version;
require('./lib/misc').register(ipcMain, env.userData, coreVersion);
console.timeEnd('[startup] injection 阶段2: API 注册 (8个模块)');

console.timeEnd('[startup] injection.js 总耗时 (阶段1+2)');

// 阶段 3: 运行时初始化
app.whenReady().then(() => {
    console.time('[startup] injection 阶段3: logger.init');
    require('./lib/logger').init(env.userData);
    console.timeEnd('[startup] injection 阶段3: logger.init');
});

// 导出的 module.exports 供其他 Node.js 代码引用
// APP main.js 可以通过此 exports 直接访问 store/db/logger
module.exports = {
    get userData() { return env.userData; },
    get store() { return require('./lib/store').get(env.userData); },
    get db() { return require('./lib/db').get(env.userData); },
    get logger() { return require('./lib/logger').get(); }
};
