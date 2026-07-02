/**
 * canbox-core/lib/sudo.js — 提权执行模块
 *
 * 封装 @vscode/sudo-prompt，提供需要管理员/root 权限的命令执行
 */

/**
 * 注册 sudo 相关 IPC handlers
 *
 * @param {import('electron').IpcMain} ipcMain
 */
function register(ipcMain) {
    ipcMain.handle('canbox.sudo.exec', async (_e, command, options) => {
        const sudo = require('@vscode/sudo-prompt');
        return new Promise((resolve, reject) => {
            sudo.exec(command, options || {}, (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                } else {
                    resolve({ stdout, stderr });
                }
            });
        });
    });
}

module.exports = { register };
