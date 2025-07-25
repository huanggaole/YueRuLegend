/*:
 * @target MZ
 * @plugindesc 重写标题场景，仅保留新游戏与继续游戏选项。
 * @author 开发者名称
 *
 * @help
 */

(function() {
    // 重写标题场景，移除了选项菜单，仅保留新游戏和继续游戏选项。
    Scene_Title.prototype.createCommandWindow = function() {
        const background = $dataSystem.titleCommandWindow.background;
        const rect = this.commandWindowRect();
        this._commandWindow = new Window_TitleCommand(rect);
        this._commandWindow.setBackgroundType(background);
        this._commandWindow.setHandler("newGame", this.commandNewGame.bind(this));
        this._commandWindow.setHandler("continue", this.commandContinue.bind(this));
        this.addWindow(this._commandWindow);
    };


})();
