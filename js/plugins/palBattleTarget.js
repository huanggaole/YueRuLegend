/*:
 * @target MZ
 * @plugindesc [v1.0] 仙剑98柔情版目标选择：隐藏默认敌人列表，精灵闪白指示，冻结指令光标
 * @author AI Assistant
 *
 * @help
 * 复刻仙剑98柔情版的目标选择方式：
 * 1. 选择敌人时不显示 RPG Maker 默认的敌人列表窗口（Window_BattleEnemy）。
 *    实现方式：窗口保持 visible 且激活（MZ 的 isOpenAndActive 要求 visible，
 *    否则键盘/鼠标输入全部失效），但 opacity=0 完全透明，且窗口矩形缩为 1×1
 *    避免透明窗口吞掉战场点击。当前目标由敌人精灵的白色呼吸闪烁指示
 *    （Sprite_Battler.updateSelectionEffect）。
 *    左右键切换、确认/取消、鼠标点击敌人精灵选择均照常工作。
 * 2. 选择敌人期间冻结行动指令窗口的光标（原版此时指令盘不可操作），
 *    按取消返回“攻击”指令时自动恢复。
 *
 * 需排在 palBattle / palBattleCore / palBattleAnim 之后加载。
 */

(() => {
    // 敌人列表窗口：透明化 + 最小矩形（保持 visible/active 以维持输入）
    Scene_Battle.prototype.createEnemyWindow = function () {
        const rect = this.enemyWindowRect();
        this._enemyWindow = new Window_BattleEnemy(rect);
        this._enemyWindow.opacity = 0;
        this._enemyWindow.contentsOpacity = 0;
        this._enemyWindow.setHandler("ok", this.onEnemyOk.bind(this));
        this._enemyWindow.setHandler("cancel", this.onEnemyCancel.bind(this));
        this.addWindow(this._enemyWindow);
    };

    Scene_Battle.prototype.enemyWindowRect = function () {
        return new Rectangle(0, 0, 1, 1);
    };

    //=============================================================================
    // 方向键按屏幕空间就近选择敌人（原版列表顺序与画面位置不一致，
    // 直接沿用上下左右会导致“按下键光标却往上走”）
    //=============================================================================
    Window_BattleEnemy.prototype.cursorDown = function (wrap) {
        this.selectDirectional(0, 1);
    };
    Window_BattleEnemy.prototype.cursorUp = function (wrap) {
        this.selectDirectional(0, -1);
    };
    Window_BattleEnemy.prototype.cursorRight = function (wrap) {
        this.selectDirectional(1, 0);
    };
    Window_BattleEnemy.prototype.cursorLeft = function (wrap) {
        this.selectDirectional(-1, 0);
    };

    Window_BattleEnemy.prototype.selectDirectional = function (dx, dy) {
        const enemies = this._enemies;
        if (!enemies || enemies.length === 0) return;
        const cur = this.enemy();
        const curSprite = cur && window.PalBattleAnim ? PalBattleAnim.spriteOf(cur) : null;
        if (!curSprite) {
            this.select(0);
            return;
        }
        let best = -1;
        let bestScore = Infinity;
        for (let i = 0; i < enemies.length; i++) {
            if (enemies[i] === cur) continue;
            const sp = PalBattleAnim.spriteOf(enemies[i]);
            if (!sp) continue;
            const ddx = sp.x - curSprite.x;
            const ddy = sp.y - curSprite.y;
            if (dx > 0 && ddx <= 2) continue;
            if (dx < 0 && ddx >= -2) continue;
            if (dy > 0 && ddy <= 2) continue;
            if (dy < 0 && ddy >= -2) continue;
            // 主轴距离为主，偏离轴的垂直距离加权惩罚
            const proj = Math.abs(ddx * dx) + Math.abs(ddy * dy);
            const offAxis = dx !== 0 ? Math.abs(ddy) : Math.abs(ddx);
            const score = proj + offAxis * 1.5;
            if (score < bestScore) {
                bestScore = score;
                best = i;
            }
        }
        if (best >= 0) {
            this.select(best);
            SoundManager.playCursor();
        }
    };

    const _startEnemySelection = Scene_Battle.prototype.startEnemySelection;
    Scene_Battle.prototype.startEnemySelection = function () {
        _startEnemySelection.call(this);
        // 冻结行动指令窗口光标（原版选择目标时指令盘不可操作）
        this._actorCommandWindow.deactivate();
    };

    // 取消选择返回“攻击”指令时，原版会重新 activate 行动指令窗口，
    // 此处仅在窗口意外仍处于冻结状态时兜底恢复。
    const _onEnemyCancel = Scene_Battle.prototype.onEnemyCancel;
    Scene_Battle.prototype.onEnemyCancel = function () {
        _onEnemyCancel.call(this);
        if (this._actorCommandWindow.currentSymbol() === "attack" &&
            this._actorCommandWindow.visible && !this._actorCommandWindow.active) {
            this._actorCommandWindow.activate();
        }
    };
})();
