/*:
 * @target MZ
 * @plugindesc [v2.0] 仙剑98柔情版围攻（fAutoAttack）：杂项菜单/A键开启、全员自动普攻、ESC取消、右上角金色“围攻”
 * @author AI Assistant
 *
 * @help
 * ⚠ 先正名：「围攻」= 原版 fAutoAttack（自动攻击），**不是**合体技。
 *   合体技 = kBattleActionCoopMagic（battle.h:55），由 palBattleCoop.js 实现；
 *   混乱打队友 = kBattleActionAttackMate（battle.h:59），由 palBattleConfuse.js 实现。
 *   菜单词条已核对：WORD_chs.txt 第 56 条 = 「围攻」（= BATTLEUI_LABEL_AUTO，uibattle.h:69）。
 *
 * ===== 原版行为（sdlpal 源码）=====
 * ① 开启
 *   · 杂项菜单第 3 项「围攻」→ g_Battle.UI.fAutoAttack = TRUE（uibattle.c 1386-1392）
 *   · 战斗中按 A 键（kKeyAuto = SDLK_a，input.c:84）→ 取反（uibattle.c 882-886）
 * ② 生效（uibattle.c 977-989，进入 kBattleUISelectMove 后立刻）
 *   · 当前伙伴直接提交 kBattleActionAttack，目标：
 *       - PAL_PlayerCanAttackAll(role)（装备带 rgwAttackAll）→ iSelectedIndex = -1 = 打全体
 *       - 否则 PAL_BattleSelectAutoTarget()（fight.c 79-128）：
 *           先沿用 g_Battle.UI.iPrevEnemyTarget（那个槽位还活着），
 *           否则从 0 号位起找第一个「槽位存在且 HP>0」的敌人
 *   · 提交后 goto end（991）→ 指令盘不绘制、不响应，头顶红箭头也不画
 *   · 下一名伙伴同样处理 → 全员围攻
 * ③ 指示（uibattle.c 822-836）
 *   · fAutoAttack 且非自动战斗时，右上角画金色「围攻」：
 *       PAL_DrawText(word56, PAL_XY(312 - PAL_TextWidth("围攻"), 10), MENUITEM_COLOR_CONFIRMED)
 *       汉字 PAL_CharWidth = 16 → x = 312 - 32 = 280，y = 10（320×200 坐标）
 * ④ 取消（uibattle.c 827-830）
 *   · 按 ESC（kKeyMenu，input.c:66）→ fAutoAttack = FALSE，当前伙伴恢复手动指令
 *   · 再按一次 A 键同样取消。原版取消不播音效
 * ⑤ 跨回合保持（fight.c 1446 / 1781）
 *   · g_Battle.fPrevAutoAtk = fAutoAttack，下一回合自动沿用 → 取消前每回合都围攻
 *   · 按 R（kKeyRepeat）「重复上回合」时会把 fAutoAttack 恢复成 fPrevAutoAtk
 *
 * ===== RMMZ 适配 =====
 *   · 标志存 BattleManager._palAutoAtk；BattleManager.startBattle 时重置
 *   · startActorCommandSelection 钩子：围攻开启时【不弹指令盘】，直接给当前角色
 *     补普攻并 BattleManager.selectNextCommand()。每帧推进一人，与原版"逐个提交"同节奏；
 *     全员补完自然流入 startTurn
 *   · 围攻期间保持状态栏可见：98 版（非 PAL_CLASSIC）下 uibattle.c 900-927 的
 *     玩家信息框是无条件绘制的（kShowPlayerInfoBoxGuard 那段 if 只在 PAL_CLASSIC 里）
 *   · MZ 键盘 ESC 只映射 "escape"（"cancel" 仅手柄）→ 两个都判断
 *
 * ===== 调参 =====
 *   window.PAL98_AUTO            // 字号 / 颜色 / 右上角位置（PAL 坐标）
 *   PAL98.setAutoAtk({ fontSize: 48, topPAL: 10 })
 *   PalBattleAuto.enable() / cancel() / isOn()   // 控制台强制开关
 *
 * 需排在 palBattle / palBattleMisc 之后加载。
 */
(() => {
    const PalBattleAuto = (window.PalBattleAuto = {});

    //=============================================================================
    // 可调参数（改完控制台调 PAL98.setAutoAtk({...}) 立即重建指示）
    //=============================================================================
    const palK = () => Graphics.boxWidth / 320;   // 320×200 PAL → 960×600

    const AUTO = (window.PAL98_AUTO = {
        fontSize: 48,              // PAL 汉字字形 16px ×3
        color: "#F7EB99",          // ≈ MENUITEM_COLOR_CONFIRMED（ui.h:31 = 0x2C）金色
        outlineColor: "rgba(0, 0, 0, 0.9)",
        outlineWidth: 5,
        rightPAL: 312,             // uibattle.c 834：312 - PAL_TextWidth("围攻")
        textPAL: 32,               // 「围攻」= 16 × 2
        topPAL: 10,                // uibattle.c 834：PAL_XY(..., 10)
        heightPAL: 16
    });

    PalBattleAuto.LABEL = "围攻";   // 词条 word 56

    // A 键 = kKeyAuto（input.c:84，SDLK_a）。MZ 默认 keyMapper 未占用 65。
    Input.keyMapper[65] = "palAutoAtk";

    const palEsc = () => Input.isTriggered("cancel") || Input.isTriggered("escape");

    //=============================================================================
    // 状态开关
    //=============================================================================

    PalBattleAuto.isOn = function () {
        return !!BattleManager._palAutoAtk;
    };

    // 开启：杂项菜单（uibattle.c 1391）/ A 键（882-886）共用入口
    PalBattleAuto.enable = function () {
        if (BattleManager._palAutoAtk) return;
        BattleManager._palAutoAtk = true;

        // 原版：围攻期间指令盘不绘制、头顶红箭头也不画（uibattle.c 991 goto end）
        if (window.Pal98IndicatorManager) Pal98IndicatorManager.hideAll();
        const scene = SceneManager._scene;
        if (scene && scene._actorCommandWindow) {
            scene._actorCommandWindow.close();
            scene._actorCommandWindow.deactivate();
        }

        // 原版：提交当前伙伴的普攻，然后进入下一名（uibattle.c 977-989）
        if (BattleManager.isInputting() && BattleManager.actor()) {
            if (scene && scene.hideSubInputWindows) scene.hideSubInputWindows();
            PalBattleAuto.fillCurrent();
            BattleManager.selectNextCommand();
        }
    };

    // 取消：ESC（uibattle.c 827-830）/ 再按 A 键。原版不播音效
    PalBattleAuto.cancel = function () {
        if (!BattleManager._palAutoAtk) return;
        BattleManager._palAutoAtk = false;
    };

    PalBattleAuto.toggle = function () {
        if (PalBattleAuto.isOn()) PalBattleAuto.cancel();
        else PalBattleAuto.enable();
    };

    //=============================================================================
    // 自动选敌（fight.c 87-128 PAL_BattleSelectAutoTargetFrom）
    //=============================================================================

    // 上次手动选敌的槽位（onEnemyOk 时记录）= 原版 g_Battle.UI.iPrevEnemyTarget
    const _onEnemyOk = Scene_Battle.prototype.onEnemyOk;
    Scene_Battle.prototype.onEnemyOk = function () {
        const idx = this._enemyWindow ? this._enemyWindow.enemyIndex() : -1;
        if (idx >= 0) BattleManager._palLastTarget = idx;
        _onEnemyOk.call(this);
    };

    PalBattleAuto.pickTarget = function () {
        const troop = $gameTroop.members();
        const prev = BattleManager._palLastTarget | 0;
        if (troop[prev] && troop[prev].isAlive()) return prev;
        for (let i = 0; i < troop.length; i++) {
            if (troop[i] && troop[i].isAlive()) return i;
        }
        return -1;
    };

    // 给当前指令角色补一个普攻（uibattle.c 977-989）
    PalBattleAuto.fillCurrent = function () {
        const actor = BattleManager.actor();
        if (!actor || !actor.canMove()) return;
        const action = BattleManager.inputtingAction();
        if (!action || action.item()) return;   // 本回合已有指令就不覆盖
        action.setAttack();
        // 全体攻击武器（rgwAttackAll）→ 原版 iSelectedIndex = -1；
        // 本工程靠 palBattleAnim 的 targetsForOpponents 打全体，目标位给 0 即可
        const all = !!(window.PalBattleAnim && PalBattleAnim.isAttackAll(actor));
        action.setTarget(all ? 0 : Math.max(0, PalBattleAuto.pickTarget()));
    };

    //=============================================================================
    // BattleManager：战斗开始重置
    //=============================================================================

    const _startBattle = BattleManager.startBattle;
    BattleManager.startBattle = function () {
        this._palAutoAtk = false;
        this._palLastTarget = 0;
        _startBattle.call(this);
    };

    //=============================================================================
    // Scene_Battle：围攻期间接管角色指令（不弹指令盘）
    //=============================================================================

    const _startActorCommandSelection = Scene_Battle.prototype.startActorCommandSelection;
    Scene_Battle.prototype.startActorCommandSelection = function () {
        if (PalBattleAuto.isOn()) {
            this.hideSubInputWindows();
            PalBattleAuto.fillCurrent();
            BattleManager.selectNextCommand();
            return;
        }
        _startActorCommandSelection.call(this);
    };

    // 围攻期间状态栏保持可见（98 版非 PAL_CLASSIC：玩家信息框无条件绘制）
    const _updateStatusWindowPosition = Scene_Battle.prototype.updateStatusWindowPosition;
    Scene_Battle.prototype.updateStatusWindowPosition = function () {
        if (PalBattleAuto.isOn()) {
            if (this.isPalItemUIOpen && this.isPalItemUIOpen()) {
                this._statusWindow.hide();
                return;
            }
            this._statusWindow.show();
            return;
        }
        _updateStatusWindowPosition.call(this);
    };

    //=============================================================================
    // 右上角「围攻」指示（uibattle.c 822-836）
    //=============================================================================

    PalBattleAuto.makeIndicatorBitmap = function () {
        const k = palK();
        const w = Math.round(AUTO.textPAL * k);
        const h = Math.round(AUTO.heightPAL * k);
        const bmp = new Bitmap(w, h);
        bmp.fontSize = AUTO.fontSize;
        bmp.outlineColor = AUTO.outlineColor;
        bmp.outlineWidth = AUTO.outlineWidth;
        bmp.textColor = AUTO.color;
        bmp.drawText(PalBattleAuto.LABEL, 0, 0, w, h, "center");
        return bmp;
    };

    PalBattleAuto.buildIndicator = function () {
        const k = palK();
        const sp = new Sprite(PalBattleAuto.makeIndicatorBitmap());
        sp.x = Math.round((AUTO.rightPAL - AUTO.textPAL) * k);   // PAL 280 → 840
        sp.y = Math.round(AUTO.topPAL * k);                      // PAL 10 → 30
        sp.z = 9000;
        sp.visible = false;
        return sp;
    };

    PalBattleAuto.rebuildIndicator = function () {
        const old = PalBattleAuto._indicator;
        // 只认"本插件 create() 时记下的那个场景"，避免把「围攻」挂到地图/菜单上
        const scene = PalBattleAuto._scene;
        if (old && old.parent) old.parent.removeChild(old);
        if (!scene || !scene.addChild || scene !== SceneManager._scene) {
            PalBattleAuto._indicator = null;
            return;
        }
        const sp = PalBattleAuto.buildIndicator();
        scene.addChild(sp);
        PalBattleAuto._indicator = sp;
    };

    const _create = Scene_Battle.prototype.create;
    Scene_Battle.prototype.create = function () {
        _create.call(this);
        PalBattleAuto._scene = this;
        const sp = PalBattleAuto.buildIndicator();
        this.addChild(sp);
        PalBattleAuto._indicator = sp;
    };

    //=============================================================================
    // 每帧：A 键切换 / ESC 取消 / 指示显隐
    //=============================================================================

    const _update = Scene_Battle.prototype.update;
    Scene_Battle.prototype.update = function () {
        _update.call(this);
        PalBattleAuto.update(this);
    };

    // 菜单/道具/状态面板打开时 ESC 归它们处理，不在这里取消围攻
    PalBattleAuto.uiBusy = function (scene) {
        if (!scene) return false;
        const vis = (n) => !!(scene[n] && scene[n].visible);
        if (vis("_palMiscWindow") || vis("_palItemSubWindow")) return true;
        if (vis("_itemWindow") || vis("_skillWindow")) return true;
        if (scene.isPalItemUIOpen && scene.isPalItemUIOpen()) return true;
        if (scene._palStatusWindow && scene._palStatusWindow.isOpen &&
            scene._palStatusWindow.isOpen()) return true;
        return false;
    };

    PalBattleAuto.update = function (scene) {
        if (PalBattleAuto._indicator && PalBattleAuto._indicator.parent === scene) {
            PalBattleAuto._indicator.visible = PalBattleAuto.isOn();
        }

        // A 键 = kKeyAuto：随时切换（uibattle.c 882-886，顺手把杂项菜单退回主盘）
        if (Input.isTriggered("palAutoAtk")) {
            if (scene && scene._palMiscWindow && scene._palMiscWindow.visible &&
                scene.onMiscCancel) {
                scene.onMiscCancel();
            }
            PalBattleAuto.toggle();
            return;
        }

        // ESC = kKeyMenu：取消围攻（uibattle.c 827-830）
        if (PalBattleAuto.isOn() && palEsc() && !PalBattleAuto.uiBusy(scene)) {
            PalBattleAuto.cancel();
        }
    };

    //=============================================================================
    // 运行时调参（控制台）
    //=============================================================================

    const PAL98 = window.PAL98 || (window.PAL98 = {});
    PAL98.setAutoAtk = function (opts) {
        Object.assign(AUTO, opts || {});
        PalBattleAuto.rebuildIndicator();
        return AUTO;
    };
})();
