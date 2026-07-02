/**
 * canbox-core/lib/misc.js — 杂项功能模块
 *
 * 提供各类辅助功能：
 *   - openUrl:      在外部浏览器打开 URL
 *   - getUserData:  获取 userData 路径
 *   - getCoreVersion: 获取 canbox-core 版本
 *   - getPlatformInfo: 获取平台信息
 *   - clipboard:    剪贴板操作
 */

/**
 * 注册 misc 相关 IPC handlers
 *
 * @param {import('electron').IpcMain} ipcMain
 * @param {string} userData - userData 目录路径
 * @param {string} coreVersion - canbox-core 版本号
 */
function register(ipcMain, userData, coreVersion) {
    ipcMain.handle('canbox.misc.hello', () => {
        return 'Hello from canbox-core!';
    });

    ipcMain.handle('canbox.misc.openUrl', async (_e, url) => {
        const { shell } = require('electron');
        return shell.openExternal(url);
    });

    ipcMain.handle('canbox.misc.getUserData', () => {
        return userData;
    });

    ipcMain.handle('canbox.misc.getCoreVersion', () => {
        return coreVersion;
    });

    ipcMain.handle('canbox.misc.getPlatformInfo', () => {
        return {
            platform: process.platform,
            arch: process.arch,
            nodeVersion: process.versions.node,
            electronVersion: process.versions.electron,
            chromeVersion: process.versions.chrome
        };
    });

    ipcMain.handle('canbox.misc.showItemInFolder', async (_e, filePath) => {
        const { shell } = require('electron');
        return shell.showItemInFolder(filePath);
    });

    ipcMain.handle('canbox.misc.openPath', async (_e, filePath) => {
        const { shell } = require('electron');
        return shell.openPath(filePath);
    });
}

module.exports = { register };
