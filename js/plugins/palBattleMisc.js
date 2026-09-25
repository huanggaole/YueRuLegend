/*:
 * @target MZ
 * @plugindesc [v1.0] 仙剑98柔情版战斗杂项菜单（下按钮：围攻/道具/防御/逃跑/状态）
 * @author AI Assistant
 *
 * @help
 * 复刻仙剑98柔情版战斗主菜单的“杂项”子菜单（uibattle.c PAL_BattleUIDrawMiscMenu）：
 * 指令盘下按钮（旗图标）弹出五项菜单——围攻(合体技)/道具/防御/逃跑/状态。
 *
 * ===== 实现方式 =====
 * 菜单窗 Window_PalBattleMisc 直接继承地图 ESC 菜单的 Window_PaladinMenuBase，
 * 底板素材与九宫格拉伸完全一致（Data90~98，平铺式拉伸，呼吸选中字）。
 * 原版布局：框在左上角 PAL_XY(2,20)（320 坐标 → 本工程 ×3），
 * 五个选项纵向排列（uibattle.c：物品/防御/自动/逃跑/状态，本工程按用户
 * 指定的柔情版顺序：围攻/道具/防御/逃跑/状态）。
 *
 * 各选项行为：
 *  · 围攻：与右侧“合体”按钮相同（palBattleCoop.beginCoopMagic）；
 *  · 道具：打开战斗物品窗（取消后返回指令盘）；
 *  · 防御：伪技能999挂防御状态（防御力×2，palBattleAnim）；
 *  · 逃跑：BattleManager.processEscape（Boss战禁用，失败后可继续输入）；
 *  · 状态：推入地图同款状态界面 Scene_PalStatus。
 *
 * 需排在 palBattle / palBattleCoop 之后加载（依赖 Window_PaladinMenuBase、
 * PalBattleCoop、Scene_PalStatus）。
 */

(() => {
    //-----------------------------------------------------------------------------
    // Window_PalBattleMisc（继承地图菜单基类：同素材同九宫格拉伸）
    //-----------------------------------------------------------------------------

    function Window_PalBattleMisc() {
        this.initialize(...arguments);
    }
    Window_PalBattleMisc.prototype = Object.create(Window_PaladinMenuBase.prototype);
    Window_PalBattleMisc.prototype.constructor = Window_PalBattleMisc;

    Window_PalBattleMisc.prototype.makeCommandList = function () {
        const actor = BattleManager.actor();
        const movable = actor ? actor.canMove() : false;
        // 围攻 = 合体技：装备挂载 + 全员体力≥1/5 且无眠/乱/封/定
        const coopOk = !!(window.PalBattleCoop && PalBattleCoop.canUse(actor));
        this.addCommand("围攻", "coop", coopOk);
        this.addCommand("道具", "item", movable);
        this.addCommand("防御", "guard", movable);
        this.addCommand("逃跑", "escape", BattleManager.canEscape());
        this.addCommand("状态", "status", true);
    };

    // 与地图菜单一致的行高（呼吸字选中效果由 Window_PaladinBase 提供）
    Window_PalBattleMisc.prototype.lineHeight = function () {
        return 48;
    };

    window.Window_PalBattleMisc = Window_PalBattleMisc;

    //-----------------------------------------------------------------------------
    // Scene_Battle：菜单创建与选项处理
    //-----------------------------------------------------------------------------

    const _Scene_Battle_create = Scene_Battle.prototype.create;
    Scene_Battle.prototype.create = function () {
        _Scene_Battle_create.call(this);
        this.createPalMiscWindow();
    };

    // 原版布局：框在左上角 PAL(2,20)（320坐标 ×3）；36=顶部框内边距，
    // 5 行 × 48 + 底部边框 ≈ 336 高
    Scene_Battle.prototype.createPalMiscWindow = function () {
        const k = Graphics.boxWidth / 320;
        const rect = new Rectangle(Math.round(2 * k), Math.round(20 * k), 216, 336);
        this._palMiscWindow = new Window_PalBattleMisc(rect);
        this._palMiscWindow.setHandler("coop", this.onMiscCoop.bind(this));
        this._palMiscWindow.setHandler("item", this.onMiscItem.bind(this));
        this._palMiscWindow.setHandler("guard", this.onMiscGuard.bind(this));
        this._palMiscWindow.setHandler("escape", this.onMiscEscape.bind(this));
        this._palMiscWindow.setHandler("status", this.onMiscStatus.bind(this));
        this._palMiscWindow.setHandler("cancel", this.onMiscCancel.bind(this));
        // 必须同时 deactivate：MZ 的窗口默认 active=true，只 hide() 的话
        // isAnyInputWindowActive() 会恒为 true，战斗指令流程会被彻底卡死
        //（详见下方 isAnyInputWindowActive 的说明）。
        this._palMiscWindow.hide();
        this._palMiscWindow.deactivate();
        this.addWindow(this._palMiscWindow);
    };

    const _createActorCommandWindow = Scene_Battle.prototype.createActorCommandWindow;
    Scene_Battle.prototype.createActorCommandWindow = function () {
        _createActorCommandWindow.call(this);
        this._actorCommandWindow.setHandler("misc", this.commandMisc.bind(this));
    };

    // 指令盘下按钮 → 打开杂项菜单（重新评估各选项可用性，对齐原版每次进菜单刷新）
    Scene_Battle.prototype.commandMisc = function () {
        this._actorCommandWindow.deactivate();
        this._palMiscWindow.refresh();
        this._palMiscWindow.show();
        this._palMiscWindow.activate();
        this._palMiscWindow.select(0);
    };

    Scene_Battle.prototype.closePalMisc = function () {
        this._palMiscWindow.hide();
        this._palMiscWindow.deactivate();
    };

    Scene_Battle.prototype.onMiscCancel = function () {
        this.closePalMisc();
        this._actorCommandWindow.activate();
    };

    // 围攻 = 右侧“合体”按钮
    Scene_Battle.prototype.onMiscCoop = function () {
        this.closePalMisc();
        this.beginCoopMagic();
    };

    // 道具 = 战斗物品窗（取消后由下方 onItemCancel 兜底返回指令盘）
    Scene_Battle.prototype.onMiscItem = function () {
        this.closePalMisc();
        this.commandItem();
    };

    // 防御：伪技能999挂状态2（防御力×2，palBattleAnim）
    Scene_Battle.prototype.onMiscGuard = function () {
        this.closePalMisc();
        BattleManager.inputtingAction().setGuard();
        this.onSelectAction();
    };

    // 逃跑（对齐原按钮流程：processEscape；Boss战禁用，失败后可继续输入）
    Scene_Battle.prototype.onMiscEscape = function () {
        this.closePalMisc();
        this._actorCommandWindow.deactivate();
        BattleManager.processEscape();
    };

    // 状态：沿用地图同款状态界面
    Scene_Battle.prototype.onMiscStatus = function () {
        SceneManager.push(Scene_PalStatus);
    };

    // 从物品窗取消返回时，指令盘当前符号是 "misc"（不在 MZ 默认分支内），兜底恢复
    const _onItemCancel = Scene_Battle.prototype.onItemCancel;
    Scene_Battle.prototype.onItemCancel = function () {
        _onItemCancel.call(this);
        if (this._actorCommandWindow.currentSymbol() === "misc" &&
            this._actorCommandWindow.visible && !this._actorCommandWindow.active) {
            this._actorCommandWindow.activate();
        }
    };

    //=============================================================================
    // 关键：把杂项子菜单计入“输入窗口”
    // --------------------------------------------------------------------------
    // MZ 的 Scene_Battle.updateInputWindowVisibility 每帧调用
    // needsInputWindowChange()：isAnyInputWindowActive() 为 false 而
    // BattleManager.isInputting() 为 true 时，会走 changeInputWindow()
    // → startActorCommandSelection() → _actorCommandWindow.setup()
    // → activate() + select(0)。
    // 杂项菜单不在 MZ 默认的那六个窗口里，于是子菜单打开期间指令盘被每帧重新
    // 激活，与子菜单同时 active：ESC 被两个窗口各接收一次，指令盘注册更早、
    // 先执行，就走了 commandCancel → selectPreviousCommand（返回上一个角色）。
    // 这里把子菜单计入后，指令盘保持 deactivate，ESC 只会被子菜单接收。
    //=============================================================================

    //=============================================================================
    // ⚠ 必须同时判 visible 和 active
    // --------------------------------------------------------------------------
    // 只判 active 会让本函数在整场战斗中【恒返回 true】，后果是毁灭性的：
    //
    //   Scene_Battle.needsInputWindowChange():
    //       windowActive && inputting → return _actorCommandWindow.actor() !== BattleManager.actor()
    //       windowActive !== inputting (否则)
    //
    //   恒为 true 时：① 战斗开始阶段 inputting=false → true !== false → 走
    //   changeInputWindow() 的 endCommandSelection()；进入 input 后
    //   BattleManager.actor() 仍是 null（因为 startPartyCommandSelection 没跑过），
    //   _actorCommandWindow.actor() 也还是 null → null !== null = false
    //   → needsInputWindowChange() 永远 false → changeInputWindow() 再也不执行
    //   → startActorCommandSelection() 永不调用 → 指令盘永不 setup()
    //   → 四个指令按钮不出指令、不可操作（表现就是"四个按钮不见了"）。
    //
    //   加上 visible 判定后，隐藏期间返回原生结果，指令流程恢复正常。
    //=============================================================================
    const _isAnyInputWindowActive = Scene_Battle.prototype.isAnyInputWindowActive;
    Scene_Battle.prototype.isAnyInputWindowActive = function () {
        if (this._palMiscWindow && this._palMiscWindow.visible &&
            this._palMiscWindow.active) return true;
        return _isAnyInputWindowActive.call(this);
    };

    // 双保险：万一指令盘仍被激活，子菜单存活时 ESC 只关闭子菜单，不回退角色
    const _commandCancel = Scene_Battle.prototype.commandCancel;
    Scene_Battle.prototype.commandCancel = function () {
        if (this._palMiscWindow && this._palMiscWindow.visible) {
            this.onMiscCancel();
            return;
        }
        _commandCancel.call(this);
    };

    //=============================================================================
    // 子菜单打开期间冻结指令盘方向键（原版此时指令盘不可操作；
    // ESC/鼠标右键取消关闭子菜单后自动解冻）
    //=============================================================================

    const miscMenuOpen = () => {
        const scene = SceneManager._scene;
        return !!(scene && scene._palMiscWindow && scene._palMiscWindow.visible);
    };

    for (const method of ["cursorUp", "cursorDown", "cursorLeft", "cursorRight"]) {
        const _cursor = Window_ActorCommand.prototype[method];
        Window_ActorCommand.prototype[method] = function (wrap) {
            if (miscMenuOpen()) return; // 子菜单存活期内不响应方向键
            _cursor.call(this, wrap);
        };
    }
})();
