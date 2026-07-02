/**
 * canbox-core/lib/dialog.js — 原生对话框模块
 *
 * 封装 Electron dialog API：
 *   - showMessageBox
 *   - showOpenDialog
 *   - showSaveDialog
 */

/**
 * 获取当前焦点窗口
 * @returns {import('electron').BrowserWindow|null}
 */
function getFocusedWindow() {
    const { BrowserWindow } = require('electron');
    return BrowserWindow.getFocusedWindow();
}

/**
 * 注册 dialog 相关 IPC handlers
 *
 * @param {import('electron').IpcMain} ipcMain
 */
function register(ipcMain) {
    ipcMain.handle('canbox.dialog.showMessageBox', async (_e, options) => {
        const { dialog } = require('electron');
        const win = getFocusedWindow();
        return dialog.showMessageBox(win, options);
    });

    ipcMain.handle('canbox.dialog.showOpenDialog', async (_e, options) => {
        const { dialog } = require('electron');
        const win = getFocusedWindow();
        return dialog.showOpenDialog(win, options);
    });

    ipcMain.handle('canbox.dialog.showSaveDialog', async (_e, options) => {
        const { dialog } = require('electron');
        const win = getFocusedWindow();
        return dialog.showSaveDialog(win, options);
    });
}

module.exports = { register };
