/**
 * canbox-core/lib/shortcut.js — 全局快捷键模块
 *
 * 封装 Electron globalShortcut API：
 *   - register:   注册全局快捷键
 *   - unregister: 注销全局快捷键
 *   - isRegistered: 检查是否已注册
 */

/** @type {Map<string, {mode: string}>} */
const registry = new Map();

/**
 * 注册 shortcut 相关 IPC handlers
 *
 * @param {import('electron').IpcMain} ipcMain
 */
function register(ipcMain) {
    ipcMain.handle('canbox.shortcut.register', (event, accelerator, options = {}) => {
        const { globalShortcut, BrowserWindow } = require('electron');
        const { mode = 'focus' } = options;

        // 如果已注册则先注销
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
                registry.set(accelerator, { mode });
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
        registry.delete(accelerator);
        return { success: true };
    });

    ipcMain.handle('canbox.shortcut.isRegistered', (_e, accelerator) => {
        const { globalShortcut } = require('electron');
        return globalShortcut.isRegistered(accelerator);
    });
}

/**
 * 获取快捷键注册表
 * @returns {Map<string, {mode: string}>}
 */
function getRegistry() {
    return registry;
}

module.exports = { register, getRegistry };
