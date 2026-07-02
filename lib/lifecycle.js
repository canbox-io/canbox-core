/**
 * canbox-core/lib/lifecycle.js — 生命周期模块
 *
 * 提供 APP 生命周期相关 IPC：
 *   - registerCloseCallback: 注册窗口关闭前回调
 */

/**
 * 注册 lifecycle 相关 IPC handlers
 *
 * @param {import('electron').IpcMain} ipcMain
 */
function register(ipcMain) {
    ipcMain.handle('canbox.lifecycle.registerCloseCallback', (event) => {
        const { BrowserWindow } = require('electron');
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win) {
            return { success: false, error: 'No window found for this request' };
        }
        win.on('close', () => {
            event.sender.send('canbox:lifecycleCloseCallback');
        });
        return { success: true };
    });
}

module.exports = { register };
