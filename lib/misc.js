/**
 * canbox-core/lib/misc.js — 杂项功能模块
 *
 * 提供各类辅助功能：
 *   - hello:         测试 core 是否加载
 *   - openUrl:       在外部浏览器打开 URL
 *   - getUserData:   获取 Users 业务数据目录路径
 *   - getCoreVersion: 获取 canbox-core 版本
 *   - getCorePath:   获取 canbox-core 根目录路径（injection.js 所在目录）
 *   - getPlatformInfo: 获取平台信息
 *   - showItemInFolder: 在文件管理器中显示文件
 *   - openPath:      打开文件/目录
 */

const path = require('path');

// canbox-core 根目录（lib/ 的上一层）
const CORE_ROOT = path.resolve(__dirname, '..');

/**
 * 注册 misc 相关 IPC handlers
 *
 * @param {import('electron').IpcMain} ipcMain
 * @param {object} env - env 模块导出（含 userData、usersPath、appId）
 * @param {string} coreVersion - canbox-core 版本号
 */
function register(ipcMain, env, coreVersion) {
    ipcMain.handle('canbox.misc.hello', () => {
        return 'Hello from canbox-core!';
    });

    ipcMain.handle('canbox.misc.openUrl', async (_e, url) => {
        const { shell } = require('electron');
        return shell.openExternal(url);
    });

    // 返回 Users 业务数据目录路径（{UsersBase}/Users/）
    ipcMain.handle('canbox.misc.getUserData', () => {
        return env.usersPath;
    });

    ipcMain.handle('canbox.misc.getCoreVersion', () => {
        return coreVersion;
    });

    // 返回 canbox-core 根目录路径（供 canbox-developer 等获取 injection.js 路径）
    ipcMain.handle('canbox.misc.getCorePath', () => {
        return CORE_ROOT;
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
