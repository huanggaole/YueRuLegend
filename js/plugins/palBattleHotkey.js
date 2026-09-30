/*:
 * @target MZ
 * @plugindesc [v1.0] 仙剑98柔情版原版快捷键（战斗 R重复/F自动施法/D防御/E使用/W投掷/Q逃跑/S状态/A围攻；地图 E道具/W装备/F仙术/S状态/Q退出）
 * @author AI Assistant
 *
 * @help
 * 复刻仙剑98柔情版（sdlpal）的键盘快捷键。键位表直接取自 input.c 57-91 的
 * g_KeyMap（PALKEY 枚举在 input.h 40-61）：
 *
 *   ┌────┬──────────────┬──────────┬────────────────────────────────────────┐
 *   │ 键 │ PALKEY       │ 战斗中   │ 地图上（play.c 551-599）               │
 *   ├────┼──────────────┼──────────┼────────────────────────────────────────┤
 *   │ R  │ kKeyRepeat   │ 重复上回合│ —                                      │
 *   │ F  │ kKeyForce    │ 自动施法 │ 仙术菜单（PAL_InGameMagicMenu）        │
 *   │ D  │ kKeyDefend   │ 防御     │ —                                      │
 *   │ E  │ kKeyUseItem  │ 使用道具 │ 使用物品（PAL_GameUseItem）            │
 *   │ W  │ kKeyThrowItem│ 投掷道具 │ 装备（PAL_GameEquipItem）              │
 *   │ Q  │ kKeyFlee     │ 逃跑     │ 退出游戏（PAL_QuitGame）               │
 *   │ S  │ kKeyStatus   │ 状态面板 │ 状态（PAL_PlayerStatus）               │
 *   │ A  │ kKeyAuto     │ 围攻开关 │ —（palBattleAuto.js 已实现）           │
 *   └────┴──────────────┴──────────┴────────────────────────────────────────┘
 *
 * ⚠ 注意 W(=87) / Q(=81) 在 MZ 默认 keyMapper 里是 "pagedown" / "pageup"。
 *   本插件把它们改写成 palThrowItem / palFlee；PageUp/PageDown 键（33/34）
 *   不受影响，全工程插件也从未用过这两个键名，所以不会破坏既有操作。
 *
 * ===== 战斗侧：R 与 F 是「黏滞」的（原版 fight.c 1772-1800）=====
 *   原版按下 R/F 后把 g_Battle.fRepeat / g_Battle.fForce 置位，之后每帧
 *   强制 dwKeyPress = kKeyRepeat / kKeyForce，于是【本回合每一名伙伴】都跟着
 *   重复上一回合动作 / 自动施法，直到全员指令提交完毕（fight.c 1443-1445 清标志）。
 *   本工程把这两个标志放在 BattleManager._palRepeat / _palForce，由
 *   startActorCommandSelection 钩子逐帧推进（每帧一人，与 palBattleAuto 同节奏），
 *   BattleManager.startTurn 时清除。
 *
 *   · R「重复」= PAL_BattleCommitAction(TRUE)（fight.c 1810-1868）：
 *       取 prevAction 的【动作类型 + 对象 ID】，目标沿用当前 UI 选中项；
 *       prevAction 是 kBattleActionPass(=0，即没打过) 时改判普攻。
 *       真气不够时：治疗/群体/变身类改防御，其余改普攻（fight.c 1875-1898）。
 *       ⚠ 原版还会顺手把围攻恢复成上回合的状态（fight.c 1781
 *         fAutoAttack = fPrevAutoAtk），本插件照做。
 *   · F「自动施法」= PAL_BattleUIPickAutoMagic(role, 60)（uibattle.c 721-782）：
 *       咒封 → 普攻；否则在角色仙术里挑 (baseDamage + RandomLong(0,60)) 最大的，
 *       跳过：wCostMP == 1 的终极技（酒神/乾坤一掷/铜钱镖）、真气不够的、
 *       (SHORT)wBaseDamage <= 0 的（回梦/夺魂/鬼降是 64537 → -999）。
 *       一个都不剩 → 普攻。全体技打全体，单体技打 PAL_BattleSelectAutoTarget()。
 *
 * ===== 上一回合动作的快照点 =====
 *   原版在「全员指令都定完、填行动队列之前」做 prevAction = action
 *   （fight.c 1427-1438）。MZ 里对应的时刻是 BattleManager.startTurn()：
 *   此时 _actions 还没被 removeCurrentAction() 消耗掉，再晚就没了。
 *
 * ===== 调参（运行时可改）=====
 *   PAL98_HOTKEY                                  // 查看全部参数
 *   PalHotkey.setKey("repeat", 82)                // 改键（keyCode）
 *   PalHotkey.setEnabled(false)                   // 战斗快捷键总开关
 *   PalHotkey.setMapEnabled(false)                // 地图快捷键总开关
 *   PalHotkey.setMapQuit(true)                    // 地图 Q = 退出游戏（默认关）
 *   PalHotkey.setForceRange(60)                   // F 的随机范围（原版 60）
 *   PalHotkey.cancelSticky()                      // 取消黏滞的 R/F
 *
 * ===== 写这套时踩到的 MZ 坑（改别的战斗 UI 也用得上）=====
 *   · 指令盘永远不要 close()：MZ 的 startActorCommandSelection() 只 show()，
 *     从不 open()（rmmz_scenes.js:3466），而 close() 会把 openness 清零 →
 *     isOpen() 从此恒 false。想"暂时不让指令盘接输入"用 deactivate() 就够了
 *     （Window_Selectable 走 isOpenAndActive() = isOpen && visible && active）。
 *   · 因此本插件的 canAcceptBattleHotkey 只判 visible && active，不判 isOpen()。
 *   · Input.isTriggered(name) 只在【按下后的第一帧】为真
 *     （_latestButton === name && _pressedTime === 0），错过就永远错过。
 *     冒烟测试里必须用 down → 等一帧 → up，直接 keyboard.press() 会被吞。
 *
 * 需排在 palBattle / palBattleMisc / palBattleAuto / palBattleCore 之后加载。
 * 冒烟测试：node tools/pal_hotkey_smoke_test.js
 */

(() => {
    const PalHotkey = (window.PalHotkey = {});

    //=============================================================================
    // 参数总表
    //=============================================================================
    const cfg = (window.PAL98_HOTKEY = {
        enabled: true,          // 战斗快捷键总开关
        forceRange: 60,         // F 的 wRandomRange（原版 uibattle.c 1173 写死 60）
        escCancelSticky: false, // ESC 是否取消黏滞的 R/F（原版不能取消，故默认关）
        map: {
            enabled: true,      // 地图快捷键总开关
            quitEnabled: false, // 地图 Q = 退出游戏（浏览器里"退出"只能回标题，默认关）
            allowWhileMoving: true
        },
        // 原版 input.c 57-91 的字母键部分
        keys: {
            repeat: "palRepeat",     // R
            force: "palForce",       // F
            defend: "palDefend",     // D
            useItem: "palUseItem",   // E
            throwItem: "palThrowItem", // W
            flee: "palFlee",         // Q
            status: "palStatus",     // S
            autoAtk: "palAutoAtk"    // A（palBattleAuto.js 已注册，这里一并登记）
        },
        // keyCode 表（改键用 PalHotkey.setKey）
        codes: {
            repeat: 82, force: 70, defend: 68, useItem: 69,
            throwItem: 87, flee: 81, status: 83, autoAtk: 65
        }
    });

    const K = cfg.keys;
    const SEAL_STATE_ID = 6;   // 咒封（沉默）＝ kStatusSilence，见 palBattleCore.js
    const PAL98 = window.PAL98 || (window.PAL98 = {});

    const applyKeyMap = function () {
        for (const name of Object.keys(cfg.codes)) {
            Input.keyMapper[cfg.codes[name]] = cfg.keys[name];
        }
    };
    applyKeyMap();

    PalHotkey.setKey = function (action, code) {
        if (!cfg.codes.hasOwnProperty(action)) return cfg.codes;
        // 清掉旧键名，避免一个 keyCode 被两个语义占用
        Object.keys(cfg.codes).forEach(n => {
            if (n !== action && cfg.codes[n] === code) cfg.codes[n] = 0;
        });
        cfg.codes[action] = code;
        applyKeyMap();
        return cfg.codes;
    };

    PalHotkey.setEnabled = function (v) { cfg.enabled = !!v; return cfg.enabled; };
    PalHotkey.setMapEnabled = function (v) { cfg.map.enabled = !!v; return cfg.map.enabled; };
    PalHotkey.setMapQuit = function (v) { cfg.map.quitEnabled = !!v; return cfg.map.quitEnabled; };
    PalHotkey.setForceRange = function (v) { cfg.forceRange = v | 0; return cfg.forceRange; };

    //=============================================================================
    // 通用小工具
    //=============================================================================

    const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));

    const palBase = function (skill) {
        const pal = window.PalBattleCore ? PalBattleCore.parseMeta(skill) : null;
        if (!pal) return 0;
        return typeof PalBattleCore.signedBase === "function"
            ? PalBattleCore.signedBase(pal)
            : (pal.base | 0);
    };

    // 自动选敌（fight.c 79-128 PAL_BattleSelectAutoTarget）：
    // 先沿用上次手动选中的槽位（还活着），否则从 0 号位找第一个存活敌人
    PalHotkey.pickEnemyTarget = function () {
        if (window.PalBattleAuto && PalBattleAuto.pickTarget) {
            return PalBattleAuto.pickTarget();
        }
        const troop = $gameTroop.members();
        const prev = BattleManager._palLastTarget | 0;
        if (troop[prev] && troop[prev].isAlive()) return prev;
        for (let i = 0; i < troop.length; i++) {
            if (troop[i] && troop[i].isAlive()) return i;
        }
        return 0;
    };

    const pickAllyTarget = function (dead) {
        const list = $gameParty.battleMembers();
        for (let i = 0; i < list.length; i++) {
            if (list[i] && list[i].isAlive() !== !!dead) return i;
        }
        for (let i = 0; i < list.length; i++) {
            if (list[i] && list[i].isAlive()) return i;
        }
        return 0;
    };

    const setAttack = function (action) {
        action.clear();
        action.setAttack();
        const all = !!(window.PalBattleAnim && PalBattleAnim.isAttackAll(action.subject()));
        action.setTarget(all ? 0 : Math.max(0, PalHotkey.pickEnemyTarget()));
    };

    const setGuard = function (action) {
        action.clear();
        action.setGuard();
    };

    //=============================================================================
    // 上一回合动作快照（原版 prevAction，fight.c 1427-1438）
    //=============================================================================

    const snapshot = function (action) {
        if (!action || !action._item) return null;
        const cls = action._item._dataClass;
        const id = action._item._itemId;
        if (!cls || !id) return null;                 // 空指令（原版 kBattleActionPass=0）
        return {
            cls: cls, id: id,
            target: action._targetIndex,
            thr: !!action._palThrow,
            thrAll: !!action._palThrowAll
        };
    };

    const objOf = function (snap) {
        if (snap.cls === "skill") return $dataSkills[snap.id];
        if (snap.cls === "item") return $dataItems[snap.id];
        if (snap.cls === "weapon") return $dataWeapons[snap.id];
        if (snap.cls === "armor") return $dataArmors[snap.id];
        return null;
    };

    // 目标兜底：记住的那个目标已经不在（死/换人）就重挑一个
    const fixTarget = function (action) {
        const item = action.item();
        if (!item) return;
        if (action.isForOpponent && action.isForOpponent()) {
            const troop = $gameTroop.members();
            if (action.needsSelection()) {
                const i = action._targetIndex;
                if (!(troop[i] && troop[i].isAlive())) {
                    action.setTarget(Math.max(0, PalHotkey.pickEnemyTarget()));
                }
            } else {
                action.setTarget(-1);          // 全体（原版 iSelectedIndex = -1）
            }
        } else if (action.isForFriend && action.isForFriend()) {
            const list = $gameParty.battleMembers();
            const i = action._targetIndex;
            const needDead = !!action.isForDeadFriend && action.isForDeadFriend();
            const ok = list[i] && (needDead ? !list[i].isAlive() : list[i].isAlive());
            if (!ok) action.setTarget(pickAllyTarget(needDead));
        }
    };

    //=============================================================================
    // R：重复上一回合（fight.c 1855-1868 + 1873-1898）
    //=============================================================================

    PalHotkey.fillRepeat = function (actor, action) {
        const snaps = BattleManager._palPrevActions || {};
        const snap = snaps[actor.actorId()];
        if (!snap) { setAttack(action); return; }     // 原版 Pass → 普攻

        const obj = objOf(snap);
        if (!obj) { setAttack(action); return; }

        if (snap.cls === "skill") {
            // 原版：真气不够 → 治疗/群体/变身类改防御，其余改普攻（fight.c 1879-1897）
            if (obj.mpCost > actor.mp) {
                const t = obj.scope;
                const friendly = (t >= 7 && t <= 13) || t === 11;
                if (friendly) { setGuard(action); }
                else { setAttack(action); }
                return;
            }
        } else if (snap.cls === "item") {
            // 98 非 PAL_CLASSIC 里这段是 #ifdef 掉的，但道具没了总不能还硬用
            if ($gameParty.numItems(obj) <= 0) { setAttack(action); return; }
        } else if (snap.cls === "weapon" || snap.cls === "armor") {
            if ($gameParty.numItems(obj) <= 0) { setAttack(action); return; }
        }

        action.clear();
        action._item._dataClass = snap.cls;
        action._item._itemId = snap.id;
        action._palThrow = snap.thr;
        action._palThrowAll = snap.thrAll;
        action._targetIndex = snap.target;
        fixTarget(action);
    };

    //=============================================================================
    // F：自动施法（uibattle.c 721-782 PAL_BattleUIPickAutoMagic）
    //=============================================================================

    PalHotkey.pickAutoMagic = function (actor) {
        if (!actor || !actor.canMove()) return null;
        if (actor.isStateAffected && actor.isStateAffected(SEAL_STATE_ID)) return null; // 咒封

        let best = null, bestPower = 0;
        for (const skill of actor.skills()) {
            if (!skill) continue;
            // 终极技：原版 wCostMP == 1（酒神 / 乾坤一掷 / 铜钱镖）
            if (skill.mpCost === 1) continue;
            if (skill.mpCost > actor.mp) continue;
            const base = palBase(skill);
            if (base <= 0) continue;                       // 原版 (SHORT)wBaseDamage <= 0
            if (skill.occasion !== 0 && skill.occasion !== 1) continue;
            if (actor.isSkillWtypeOk && !actor.isSkillWtypeOk(skill)) continue;
            if (actor.isSkillSealed && actor.isSkillSealed(skill)) continue;
            if (actor.isSkillTypeSealed && actor.isSkillTypeSealed(skill)) continue;

            const power = base + randInt(0, cfg.forceRange);
            if (power > bestPower) { bestPower = power; best = skill; }
        }
        return best;
    };

    PalHotkey.fillAutoMagic = function (actor, action) {
        const skill = PalHotkey.pickAutoMagic(actor);
        if (!skill) { setAttack(action); return; }
        action.clear();
        action.setSkill(skill.id);
        // 原版：kMagicFlagApplyToAll → iSelectedIndex = -1；否则 PAL_BattleSelectAutoTarget()
        if (action.isForOpponent()) {
            if (action.needsSelection()) {
                action.setTarget(Math.max(0, PalHotkey.pickEnemyTarget()));
            } else {
                action.setTarget(-1);
            }
        } else {
            const needDead = !!action.isForDeadFriend && action.isForDeadFriend();
            action.setTarget(pickAllyTarget(needDead));
        }
    };

    //=============================================================================
    // 黏滞标志（原版 g_Battle.fRepeat / g_Battle.fForce）
    //=============================================================================

    PalHotkey.isSticky = function () {
        return !!(BattleManager._palRepeat || BattleManager._palForce);
    };

    PalHotkey.cancelSticky = function () {
        BattleManager._palRepeat = false;
        BattleManager._palForce = false;
    };

    PalHotkey.fillCurrent = function () {
        const actor = BattleManager.actor();
        if (!actor) return;
        const action = BattleManager.inputtingAction();
        if (!action) return;
        if (action.item()) return;                 // 本回合已有指令就不覆盖（同 palBattleAuto）
        if (!actor.canMove()) { setGuard(action); return; }
        if (BattleManager._palForce) PalHotkey.fillAutoMagic(actor, action);
        else PalHotkey.fillRepeat(actor, action);
    };

    // ⚠ 千万别对指令盘调 close()：MZ 的 startActorCommandSelection() 只 show()，
    //   从不 open()，而 close() 会把 openness 清零 —— 一旦关过就再也 isOpen() 不了。
    //   工程惯例（palBattleMisc 的 onMiscStatus / onMiscEscape）也是只 deactivate()。
    const closeCommand = function (scene) {
        const w = scene && scene._actorCommandWindow;
        if (!w) return;
        w.deactivate();
    };

    const restoreCommand = function (scene) {
        const w = scene && scene._actorCommandWindow;
        if (!w) return;
        if (!BattleManager.isInputting() || !BattleManager.actor()) return;
        w.show();
        w.open();       // 防御性：万一别处 close() 过，openness 拉回来
        w.activate();
    };

    // 提交当前伙伴并推进到下一名（不弹目标选择——目标已经算好了）
    PalHotkey.commitDirect = function (scene) {
        scene.hideSubInputWindows();
        closeCommand(scene);
        if (window.Pal98IndicatorManager) Pal98IndicatorManager.hideAll();
        if (BattleManager.isInputting() && BattleManager.actor()) {
            PalHotkey.fillCurrent();
            BattleManager.selectNextCommand();
        }
    };

    //=============================================================================
    // BattleManager：快照 / 清标志
    //=============================================================================

    const _startBattle = BattleManager.startBattle;
    BattleManager.startBattle = function () {
        this._palPrevActions = {};
        this._palPrevAutoAtk = false;
        this._palRepeat = false;
        this._palForce = false;
        _startBattle.call(this);
    };

    // ⚠ 快照必须放 startTurn：这是「全员指令定完、行动还没被执行」的唯一时刻。
    //   放到 startInput 就晚了 —— 上一回合的 _actions 已被 removeCurrentAction()
    //   逐个 shift 掉，读出来是空的。
    const _startTurn = BattleManager.startTurn;
    BattleManager.startTurn = function () {
        const map = this._palPrevActions || (this._palPrevActions = {});
        for (const actor of $gameParty.battleMembers()) {
            const a = actor && actor.action ? actor.action(0) : null;
            const s = snapshot(a);
            if (s) map[actor.actorId()] = s;      // 没打过的保留上上回合的记录
        }
        this._palPrevAutoAtk = !!this._palAutoAtk; // fight.c 1446
        this._palRepeat = false;                   // fight.c 1443
        this._palForce = false;                    // fight.c 1444
        _startTurn.call(this);
    };

    //=============================================================================
    // Scene_Battle：R/F 的黏滞推进
    //=============================================================================

    const _startActorCommandSelection = Scene_Battle.prototype.startActorCommandSelection;
    Scene_Battle.prototype.startActorCommandSelection = function () {
        if (PalHotkey.isSticky()) {
            // 围攻优先级更高（原版 uibattle.c 977 的 fAutoAttack 分支在 switch 之前）
            if (!(window.PalBattleAuto && PalBattleAuto.isOn())) {
                PalHotkey.commitDirect(this);
                return;
            }
        }
        _startActorCommandSelection.call(this);
    };

    //=============================================================================
    // Scene_Battle：按键分发
    //=============================================================================

    PalHotkey.canAcceptBattleHotkey = function (scene) {
        if (!cfg.enabled) return false;
        if (!BattleManager.isInputting()) return false;
        if ($gameMessage.isBusy()) return false;
        // 只认「指令盘待命」这一个时刻；其它窗口（仙术/道具/状态/杂项）把按键留给自己
        // 判 visible && active 就够（isOpen() 不可靠：openness 一旦被 close() 清零
        // 就再也回不来，见 closeCommand 上面的说明）
        const w = scene._actorCommandWindow;
        if (!w || !w.visible || !w.active) return false;
        if (window.PalBattleAuto && PalBattleAuto.uiBusy && PalBattleAuto.uiBusy(scene)) return false;
        if (scene._palStatusWindow && scene._palStatusWindow.isOpen &&
            scene._palStatusWindow.isOpen()) return false;
        return !!BattleManager.actor();
    };

    PalHotkey.pressRepeat = function (scene) {
        BattleManager._palRepeat = true;
        // 原版 fight.c 1781：R 会把围攻恢复成上回合的状态
        if (window.PalBattleAuto) {
            BattleManager._palAutoAtk = !!BattleManager._palPrevAutoAtk;
        }
        if (window.PalBattleAuto && PalBattleAuto.isOn()) {
            scene.hideSubInputWindows();
            closeCommand(scene);
            if (window.Pal98IndicatorManager) Pal98IndicatorManager.hideAll();
            if (BattleManager.isInputting() && BattleManager.actor()) {
                PalBattleAuto.fillCurrent();
                BattleManager.selectNextCommand();
            }
            return;
        }
        PalHotkey.commitDirect(scene);
    };

    PalHotkey.pressForce = function (scene) {
        BattleManager._palForce = true;
        PalHotkey.commitDirect(scene);
    };

    PalHotkey.pressDefend = function (scene) {
        const action = BattleManager.inputtingAction();
        if (!action) return;
        action.setGuard();
        scene.onSelectAction();     // 防御 scope=11 不需要选目标 → 直接进下一人
    };

    PalHotkey.pressItem = function (scene, mode) {
        scene._palItemMode = mode;
        // 只 deactivate：MZ 的 commandItem 自己会 hide，别 close（否则 openness 回不来）
        scene._actorCommandWindow.deactivate();
        scene.commandItem();
    };

    PalHotkey.pressFlee = function (scene) {
        closeCommand(scene);
        if (!BattleManager.canEscape()) {
            SoundManager.playBuzzer();
            restoreCommand(scene);
            return;
        }
        BattleManager.processEscape();
    };

    PalHotkey.pressStatus = function (scene) {
        closeCommand(scene);
        scene._palStatusWindow.showStatus();
    };

    const _Scene_Battle_update = Scene_Battle.prototype.update;
    Scene_Battle.prototype.update = function () {
        _Scene_Battle_update.call(this);
        PalHotkey.updateBattle(this);
    };

    PalHotkey.updateBattle = function (scene) {
        if (!PalHotkey.canAcceptBattleHotkey(scene)) return;

        // ESC 取消黏滞（原版不能取消，默认关闭）
        if (cfg.escCancelSticky && PalHotkey.isSticky()) {
            if (Input.isTriggered("cancel") || Input.isTriggered("escape")) {
                PalHotkey.cancelSticky();
                return;
            }
        }

        if (Input.isTriggered(K.repeat)) { PalHotkey.pressRepeat(scene); return; }
        if (Input.isTriggered(K.force)) { PalHotkey.pressForce(scene); return; }
        if (Input.isTriggered(K.defend)) { PalHotkey.pressDefend(scene); return; }
        if (Input.isTriggered(K.useItem)) { PalHotkey.pressItem(scene, "battle_use"); return; }
        if (Input.isTriggered(K.throwItem)) { PalHotkey.pressItem(scene, "battle_throw"); return; }
        if (Input.isTriggered(K.flee)) { PalHotkey.pressFlee(scene); return; }
        if (Input.isTriggered(K.status)) { PalHotkey.pressStatus(scene); return; }
    };

    // 从道具窗取消回来时兜底复原指令盘（MZ 原生 onItemCancel 只 activate，
    // 不会 show/open；本插件虽然只 deactivate，但别处可能关过）
    const _onItemCancel = Scene_Battle.prototype.onItemCancel;
    Scene_Battle.prototype.onItemCancel = function () {
        _onItemCancel.call(this);
        restoreCommand(this);
    };

    // 状态面板关闭后（palBattleMisc 的 onPalStatusCancel 只 activate）——补 show/open
    const _onPalStatusCancel = Scene_Battle.prototype.onPalStatusCancel;
    Scene_Battle.prototype.onPalStatusCancel = function () {
        if (_onPalStatusCancel) _onPalStatusCancel.call(this);
        restoreCommand(this);
    };

    //=============================================================================
    // Scene_Map：地图快捷键（play.c 551-599）
    //=============================================================================

    PalHotkey.openItemScene = function (mode) {
        if (!window.Scene_PaladinItem) return;
        sceneSnap();
        SceneManager.push(Scene_PaladinItem);
        SceneManager.prepareNextScene(mode);   // "use" / "equip"
        Input.clear();
    };

    PalHotkey.openMagicMenu = function () {
        PalHotkey._pendingMenu = "skill";
        sceneSnap();
        SceneManager.push(Scene_Menu);
        Input.clear();
    };

    PalHotkey.openStatusScene = function () {
        if (!window.Scene_PalStatus) return;
        sceneSnap();
        SceneManager.push(Scene_PalStatus);
        Input.clear();
    };

    PalHotkey.openQuitMenu = function () {
        sceneSnap();
        SceneManager.push(Scene_GameEnd);   // 原版 PAL_QuitGame() 有确认菜单，这里同样
        Input.clear();
    };

    const sceneSnap = function () {
        const scene = SceneManager._scene;
        if (scene && scene.snapForBackground) scene.snapForBackground();
    };

    PalHotkey.updateMap = function (scene) {
        if (!cfg.map.enabled) return;
        if (SceneManager._scene !== scene || SceneManager.isSceneChanging()) return;
        if (!scene.isSceneChangeOk || !scene.isSceneChangeOk()) return;
        if ($gameMap.isEventRunning() || $gameMessage.isBusy()) return;
        if (!cfg.map.allowWhileMoving && $gamePlayer.isMoving()) return;

        if (Input.isTriggered(K.useItem)) {           // E：使用物品
            SoundManager.playOk();
            PalHotkey.openItemScene("use");
        } else if (Input.isTriggered(K.throwItem)) {  // W：装备
            SoundManager.playOk();
            PalHotkey.openItemScene("equip");
        } else if (Input.isTriggered(K.force)) {      // F：仙术
            SoundManager.playOk();
            PalHotkey.openMagicMenu();
        } else if (Input.isTriggered(K.status)) {     // S：状态
            SoundManager.playOk();
            PalHotkey.openStatusScene();
        } else if (cfg.map.quitEnabled &&
                   Input.isTriggered(K.flee)) {       // Q：退出游戏
            SoundManager.playOk();
            PalHotkey.openQuitMenu();
        }
    };

    const _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function () {
        _Scene_Map_update.call(this);
        PalHotkey.updateMap(this);
    };

    // 地图 F 直接进「选角色 → 仙术列表」（原版 PAL_InGameMagicMenu 的两级菜单）。
    // 与 palScene.js 的 commandPersonal 'skill' 分支完全同构。
    const _Scene_Menu_start = Scene_Menu.prototype.start;
    Scene_Menu.prototype.start = function () {
        _Scene_Menu_start.call(this);
        if (PalHotkey._pendingMenu !== "skill") { PalHotkey._pendingMenu = null; return; }
        PalHotkey._pendingMenu = null;
        if (!this._magicActorWindow) return;
        this._commandWindow.deactivate();
        if (this._commandWindow.refresh) this._commandWindow.refresh(); // 停呼吸
        if (this._partyStatusWindow) this._partyStatusWindow.show();
        this._magicActorWindow.refresh();
        this._magicActorWindow.show();
        this._magicActorWindow.activate();
        this._magicActorWindow.select(0);
    };

    //=============================================================================
    // 控制台快捷入口
    //=============================================================================

    PAL98.hotkey = function (opts) {
        Object.assign(cfg, opts || {});
        applyKeyMap();
        return cfg;
    };
})();
