/**
 * canbox-core/lib/store.js — 键值存储模块
 *
 * 封装 electron-store，存储到 {userData}/canbox.json
 * 所有 APP 共享同一份配置数据
 */

let _store = null;

/**
 * 获取 store 单例
 * 首次调用时自动初始化
 *
 * @param {string} userData - userData 目录路径
 * @returns {import('electron-store')}
 */
function get(userData) {
    if (!_store) {
        const Store = require('electron-store');
        _store = new Store({
            cwd: userData,
            name: 'canbox'
        });
    }
    return _store;
}

/**
 * 注册 store 相关 IPC handlers
 *
 * @param {import('electron').IpcMain} ipcMain
 * @param {string} userData
 */
function register(ipcMain, userData) {
    ipcMain.handle('canbox.store.get', (_e, name, key) => {
        return get(userData).get(`${name}.${key}`);
    });

    ipcMain.handle('canbox.store.set', (_e, name, key, value) => {
        get(userData).set(`${name}.${key}`, value);
    });

    ipcMain.handle('canbox.store.delete', (_e, name, key) => {
        get(userData).delete(`${name}.${key}`);
    });

    ipcMain.handle('canbox.store.has', (_e, name, key) => {
        return get(userData).has(`${name}.${key}`);
    });
}

module.exports = { get, register };
