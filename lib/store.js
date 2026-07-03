/**
 * canbox-core/lib/store.js — 键值存储模块
 *
 * 沿用旧架构的物理隔离模型：
 *   每个 APP 的数据存到 {Users}/data/{appId}/store/{name}.json
 *   APP 调用时不需要传 appId（黑盒），由 env 注入的 appId 自动路由
 *
 * IPC 签名（黑盒式，APP 不传 appId）：
 *   canbox.store.get(name, key)
 *   canbox.store.set(name, key, value)
 *   canbox.store.delete(name, key)
 *   canbox.store.clear(name)
 *
 * @param {string} name - 存储名称（文件名），同一 APP 内可有多份 store
 * @param {string} key - 存储的键
 */

const path = require('path');
const Store = require('electron-store');

// 缓存：{appId}_{name} → Store 实例
const _storeCache = {};

/**
 * 获取指定 APP 的指定 store 实例
 * @param {string} appId - APP id
 * @param {string} name - store 名称
 * @param {string} dataPath - Users/data 路径
 * @returns {import('electron-store')}
 */
function getStore(appId, name, dataPath) {
    const cacheKey = `${appId}_${name}`;
    if (!_storeCache[cacheKey]) {
        const cwd = path.join(dataPath, appId, 'store');
        _storeCache[cacheKey] = new Store({ cwd, name });
    }
    return _storeCache[cacheKey];
}

/**
 * 注册 store 相关 IPC handlers
 *
 * @param {import('electron').IpcMain} ipcMain
 * @param {object} env - env 模块导出（含 appId、usersPath）
 */
function register(ipcMain, env) {
    const dataPath = path.join(env.usersPath, 'data');

    ipcMain.handle('canbox.store.get', (_e, name, key) => {
        if (!env.appId) throw new Error('appId is not set, cannot access store');
        return getStore(env.appId, name, dataPath).get(key);
    });

    ipcMain.handle('canbox.store.set', (_e, name, key, value) => {
        if (!env.appId) throw new Error('appId is not set, cannot access store');
        getStore(env.appId, name, dataPath).set(key, value);
    });

    ipcMain.handle('canbox.store.delete', (_e, name, key) => {
        if (!env.appId) throw new Error('appId is not set, cannot access store');
        getStore(env.appId, name, dataPath).delete(key);
    });

    ipcMain.handle('canbox.store.clear', (_e, name) => {
        if (!env.appId) throw new Error('appId is not set, cannot access store');
        getStore(env.appId, name, dataPath).clear();
    });
}

module.exports = { register, getStore };
