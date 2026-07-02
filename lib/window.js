/**
 * canbox-core/lib/window.js — 窗口与通知模块
 *
 * 提供窗口创建和系统通知能力
 */

/**
 * 注册 window 相关 IPC handlers
 *
 * @param {import('electron').IpcMain} ipcMain
 */
function register(ipcMain) {
    ipcMain.handle('canbox.window.createWindow', async (_e, options) => {
        const { BrowserWindow } = require('electron');
        const win = new BrowserWindow(options || {
            width: 800,
            height: 600,
            webPreferences: {
                contextIsolation: true,
                nodeIntegration: false
            }
        });
        return { success: true, windowId: win.id };
    });

    ipcMain.handle('canbox.window.notification', (_e, options) => {
        const { Notification } = require('electron');
        const n = new Notification(options);
        n.show();
        return { success: true };
    });
}

module.exports = { register };
