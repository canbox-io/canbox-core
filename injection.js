/**
 * canbox-core injection.js
 *
 * 本文件通过 Electron -r 标志在 APP 主进程启动前被预加载：
 *   electron -r canbox-core/injection.js APP/
 *
 * 提供的隐性能力（对 APP 透明，不调用即无感知）：
 *   - 统一 userData 路径（所有 APP 共享同一数据目录）
 *   - 统一日志（覆盖 console，写入统一日志文件）
 *   - 统一环境变量与 module-alias
 *   - 崩溃处理注册
 *
 * 提供的显性 API（APP 通过 IPC 按需调用）：
 *   - store:   键值存储（electron-store 封装）
 *   - db:      文档数据库（PouchDB 封装）
 *   - dialog:  原生对话框
 *   - window:  窗口管理 / 通知
 *   - lifecycle: 生命周期回调
 *   - shortcut: 全局快捷键
 *   - sudo:    提权执行命令
 *   - misc:    杂项功能（openUrl 等）
 */

const { app, ipcMain } = require('electron');
const path = require('path');

// ============================================================
// 阶段 1：环境初始化（隐性能力）
// ============================================================

// 确定统一 userData 路径
// 优先级：环境变量 > 默认路径
const CANBOX_USER_DATA = process.env.CANBOX_USER_DATA
    || process.env.CANBOX_HOME
    || path.join(app.getPath('appData'), 'canbox');

// 必须在 app.whenReady() 之前设置 userData
app.setPath('userData', CANBOX_USER_DATA);

// 设置 module-alias，以便 APP 可以使用 @modules 或 @canbox-core 等别名
const moduleAlias = require('module-alias');
moduleAlias.addAliases({
    '@canbox-core': path.join(__dirname, './lib')
});
moduleAlias();

// 日志将在 app.whenReady() 后初始化（需要 userData 路径就绪）
/** @type {import('log4js').Logger} */
let logger = null;

function initLogger() {
    const log4js = require('log4js');
    const logDir = path.join(CANBOX_USER_DATA, 'logs');
    log4js.configure({
        appenders: {
            file: {
                type: 'file',
                filename: path.join(logDir, 'canbox.log'),
                maxLogSize: 10485760,
                backups: 5,
                keepFileExt: true
            },
            console: { type: 'console' }
        },
        categories: {
            default: {
                appenders: ['file', 'console'],
                level: process.env.NODE_ENV === 'development' ? 'debug' : 'info'
            }
        }
    });
    logger = log4js.getLogger('canbox-core');
    logger.info('[canbox-core] Logger initialized, userData:', CANBOX_USER_DATA);
}

// 延迟初始化：日志、store、db 在 app.whenReady() 后懒加载
let _store = null;
let _canboxDb = null;

function getStore() {
    if (!_store) {
        const Store = require('electron-store');
        _store = new Store({
            cwd: CANBOX_USER_DATA,
            name: 'canbox'
        });
    }
    return _store;
}

function getDb() {
    if (!_canboxDb) {
        const PouchDB = require('pouchdb');
        PouchDB.plugin(require('pouchdb-find'));
        const dbDir = path.join(CANBOX_USER_DATA, 'db');
        _canboxDb = {
            core: new PouchDB(path.join(dbDir, 'core')),
            apps: new PouchDB(path.join(dbDir, 'apps')),
            history: new PouchDB(path.join(dbDir, 'history'))
        };
    }
    return _canboxDb;
}

// ============================================================
// 阶段 2：显性 API 注册（ipcMain.handle）
// ============================================================

// --- store ---
ipcMain.handle('canbox.store.get', (_e, name, key) => {
    return getStore().get(`${name}.${key}`);
});
ipcMain.handle('canbox.store.set', (_e, name, key, value) => {
    getStore().set(`${name}.${key}`, value);
});
ipcMain.handle('canbox.store.delete', (_e, name, key) => {
    getStore().delete(`${name}.${key}`);
});
ipcMain.handle('canbox.store.has', (_e, name, key) => {
    return getStore().has(`${name}.${key}`);
});

// --- db ---
ipcMain.handle('canbox.db.put', async (_e, dbName, doc) => {
    const db = getDb();
    const target = db[dbName] || db.core;
    const result = await target.put(doc);
    return result;
});
ipcMain.handle('canbox.db.get', async (_e, dbName, docId) => {
    const db = getDb();
    const target = db[dbName] || db.core;
    return target.get(docId);
});
ipcMain.handle('canbox.db.allDocs', async (_e, dbName, options) => {
    const db = getDb();
    const target = db[dbName] || db.core;
    return target.allDocs(options);
});
ipcMain.handle('canbox.db.bulkDocs', async (_e, dbName, docs) => {
    const db = getDb();
    const target = db[dbName] || db.core;
    return target.bulkDocs(docs);
});
ipcMain.handle('canbox.db.remove', async (_e, dbName, doc) => {
    const db = getDb();
    const target = db[dbName] || db.core;
    return target.remove(doc);
});
ipcMain.handle('canbox.db.find', async (_e, dbName, query) => {
    const db = getDb();
    const target = db[dbName] || db.core;
    return target.find(query);
});
ipcMain.handle('canbox.db.createIndex', async (_e, dbName, index) => {
    const db = getDb();
    const target = db[dbName] || db.core;
    return target.createIndex(index);
});

// --- dialog ---
ipcMain.handle('canbox.dialog.showMessageBox', async (_e, options) => {
    const { dialog, BrowserWindow } = require('electron');
    const win = BrowserWindow.getFocusedWindow();
    return dialog.showMessageBox(win, options);
});
ipcMain.handle('canbox.dialog.showOpenDialog', async (_e, options) => {
    const { dialog, BrowserWindow } = require('electron');
    const win = BrowserWindow.getFocusedWindow();
    return dialog.showOpenDialog(win, options);
});
ipcMain.handle('canbox.dialog.showSaveDialog', async (_e, options) => {
    const { dialog, BrowserWindow } = require('electron');
    const win = BrowserWindow.getFocusedWindow();
    return dialog.showSaveDialog(win, options);
});

// --- window ---
ipcMain.handle('canbox.window.createWindow', async (_e, options) => {
    const { BrowserWindow } = require('electron');
    const win = new BrowserWindow(options || { width: 800, height: 600 });
    return { success: true, windowId: win.id };
});
ipcMain.handle('canbox.window.notification', (_e, options) => {
    const { Notification } = require('electron');
    const n = new Notification(options);
    n.show();
    return { success: true };
});

// --- lifecycle ---
ipcMain.handle('canbox.lifecycle.registerCloseCallback', (event) => {
    const { BrowserWindow } = require('electron');
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { success: false, error: 'No window found' };
    win.on('close', () => {
        event.sender.send('canbox:lifecycleCloseCallback');
    });
    return { success: true };
});

// --- shortcut ---
const shortcutRegistry = new Map();
ipcMain.handle('canbox.shortcut.register', (event, accelerator, options = {}) => {
    const { globalShortcut, BrowserWindow } = require('electron');
    const { mode = 'focus' } = options;
    if (globalShortcut.isRegistered(accelerator)) {
        globalShortcut.unregister(accelerator);
    }
    try {
        const ok = globalShortcut.register(accelerator, () => {
            if (mode === 'callback') {
                event.sender.send('canbox:shortcutTriggered', accelerator);
            } else {
                const win = BrowserWindow.fromWebContents(event.sender);
                if (win) {
                    if (win.isMinimized()) win.restore();
                    win.focus();
                }
            }
        });
        if (ok) {
            shortcutRegistry.set(accelerator, { mode });
            return { success: true };
        }
        return { success: false, reason: 'system-occupied' };
    } catch (e) {
        return { success: false, reason: 'system-occupied', error: e.message };
    }
});
ipcMain.handle('canbox.shortcut.unregister', (_e, accelerator) => {
    const { globalShortcut } = require('electron');
    if (!globalShortcut.isRegistered(accelerator)) {
        return { success: false, reason: 'not-registered' };
    }
    globalShortcut.unregister(accelerator);
    shortcutRegistry.delete(accelerator);
    return { success: true };
});
ipcMain.handle('canbox.shortcut.isRegistered', (_e, accelerator) => {
    const { globalShortcut } = require('electron');
    return globalShortcut.isRegistered(accelerator);
});

// --- sudo ---
ipcMain.handle('canbox.sudo.exec', async (_e, command, options) => {
    const sudo = require('@vscode/sudo-prompt');
    return new Promise((resolve, reject) => {
        sudo.exec(command, options || {}, (error, stdout, stderr) => {
            if (error) reject(error);
            else resolve({ stdout, stderr });
        });
    });
});

// --- misc ---
ipcMain.handle('canbox.misc.hello', () => {
    return 'Hello from canbox-core!';
});
ipcMain.handle('canbox.misc.openUrl', async (_e, url) => {
    const { shell } = require('electron');
    return shell.openExternal(url);
});
ipcMain.handle('canbox.misc.getUserData', () => {
    return CANBOX_USER_DATA;
});
ipcMain.handle('canbox.misc.getCoreVersion', () => {
    // eslint-disable-next-line
    return require('./package.json').version;
});

// ============================================================
// 阶段 3：运行时就绪后初始化
// ============================================================

app.whenReady().then(() => {
    initLogger();
});

// 导出供外部引用
module.exports = {
    get userData() { return CANBOX_USER_DATA; },
    get store() { return getStore(); },
    get db() { return getDb(); },
    get logger() { return logger; }
};
