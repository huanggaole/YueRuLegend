/*:
 * @target MZ
 * @plugindesc [v1.2] 仙剑98柔情版合体技（围攻）：默认合体技/装备覆盖/消耗全员回合/发动者走合体站位
 * @author AI Assistant
 *
 * @help
 * 复刻仙剑98柔情版合体技（对照 sdlpal fight.c / uibattle.c / global.c）：
 *
 * ===== 机制来源 =====
 * 1. 合体技归属（用户确认的 98 柔情版规则）：
 *    每个角色作为发动者都有【默认合体技】，写在角色备注 <palCoop:技能id>；
 *    装备灵珠/玉佛珠会【覆盖】默认合体技，优先级高于角色本体——
 *    玉佛珠→佛法无边(89) 风灵珠→风卷残云(20) 雷灵珠→狂雷(25)
 *    水灵珠→风雪冰天(29) 火灵珠→炼狱真火(36) 土灵珠→泰山压顶(41)
 *    圣灵珠→武神(57)。同穿多件时后扫描的装备覆盖先前的。
 *    默认合体技：李逍遥→合体气功(92) 赵灵儿→爆炸(87) 林月如→弦月斩1(45)
 *    阿奴→天女散花(61,毒系群体) 巫后→爆炸蛊(80) 盖罗娇→天女散花(61)。
 * 2. 指令盘（uibattle.c 811-817）：原版十字键位 上=攻击 左=仙术
 *    右=合体 下=杂项。本工程四按钮：右=合体、下=杂项菜单
 *    （围攻/道具/防御/逃跑/状态，见 palBattleMisc.js）。
 * 3. 发动条件（uibattle.c 308-321）：参战≥2人、全员体力≥最大体力/5、
 *    无昏睡/疯魔(混乱)/咒封/定身。不满足时按钮变红不可用。
 * 4. 发动即消耗【全部】参战者的行动轮次：发动合体技后不再询问其余角色，
 *    直接开始回合结算（fight.c 每人行动位 rgfCoop 标记，其余人行动轮空）。
 *    实现：beginCoopMagic 成功配置行动后置 BattleManager._pendingPalCoop，
 *    Scene_Battle.selectNextCommand 将其转为 _palCoopConsumeAll，
 *    BattleManager.selectNextActor 见标志则跳过其余输入直接 startTurn。
 * 5. 速度（fight.c 1531-1533）：合体技行动速度 = 发动者身法×10（抢先生效）。
 * 6. 代价（fight.c 3954-3967）：不耗真气，改为全体参战者扣体力，
 *    数值=该仙术的真气消耗字段，每人保底1点，静默扣除不弹数字。
 * 7. 伤害（fight.c 3982-3995）：威力 = Σ全体参战者(武力+灵力) / 4，
 *    代入标准仙术公式（基础差值/4 + 仙术基础伤害，五行修正）。
 * 8. 演出（fight.c 3856-4104）：【发动合体技后】全体参战者同步 6 步走到
 *    合体站位（发动者 rgwCoopPos[0]={208,157}，其余 {234,170}/{260,183}，
 *    PAL 坐标；同帧起跑，否则 BattleLog 的 waitForMovement 会拆成依次走位）；
 *    走到后发动者摆帧5/帧6 施法（buildCoopCasterSteps，替换标准前移施法序列），
 *    其余人参战者摆吟唱帧(帧5)；特效播完后一齐归位。
 *    群体技直接结算；单体技打开选敌。
 *
 * 需排在 palBattle / palBattleCore / palBattleAnim / palBattleTarget /
 * palBattleMagic 之后加载。
 */

(() => {
    const PalBattleCoop = (window.PalBattleCoop = {});
    const PalBattleCore = window.PalBattleCore;
    const PalBattleAnim = window.PalBattleAnim;
    const PalBattleMagic = window.PalBattleMagic;

    // 状态编号（data/States.json）
    const SLEEP_STATES = [10, 19];   // 昏睡3/昏睡5
    const CONFUSE_STATES = [9, 11];  // 疯魔/疯魔5（混乱）
    const PARA_STATES = [4, 5, 7];   // 定身5/定身4/定身
    const SEAL_STATE_ID = 6;         // 咒封

    // 合体施法站位（fight.c 3602 rgwCoopPos，PAL 320x200 坐标 → 屏幕按 boxWidth/320 缩放）
    const COOP_POS = [[208, 157], [234, 170], [260, 183]];
    const BATTLE_MS = 40;

    //=============================================================================
    // 发动者施法序列（fight.c 3938-3949，发动合体技且走位完成后开始）：
    // 吟唱帧5 → 释放帧6 → { spell } 释放点 → 归位。
    // 走位由 stageCoopCast 与队友同步完成，本序列不含移动；替换标准 buildActorMagic。
    // 释放点前共 10 战斗帧（400ms），加走位 6 帧 ≈ castOffset 640ms（伤害延迟基准）。
    //=============================================================================

    PalBattleCoop.buildCoopCasterSteps = function (sprite) {
        return [
            { frame: 5 }, { wait: 6 * BATTLE_MS },    // 吟唱（帧5+变色，fight.c 3938-3942）
            { frame: 6 }, { wait: 4 * BATTLE_MS },    // 释放帧（fight.c 3944-3946）
            { spell: true },                          // 释放点：法术动画自此开始
            { frame: 6 }, { wait: 20 * BATTLE_MS },
            { moveAbs: [0, 0], ms: 6 * BATTLE_MS }    // 走回原地（fight.c 4058-4072）
        ];
    };

    //=============================================================================
    // 挂载与发动条件
    //=============================================================================

    // 角色当前合体技 = 角色备注 <palCoop:技能id>（默认合体技），
    // 装备备注 <palCoop:技能id> 覆盖之（灵珠/玉佛珠优先级高于角色本体）；
    // 同穿多件时后扫描的装备覆盖先前的
    PalBattleCoop.skillOf = function (actor) {
        if (!actor) return 0;
        let id = 0;
        const data = actor.actor && actor.actor();
        if (data && data.note) {
            const dm = /<palCoop:\s*(\d+)>/i.exec(data.note);
            if (dm) id = Number(dm[1]);
        }
        if (actor.equips) {
            for (const eq of actor.equips()) {
                if (!eq || !eq.note) continue;
                const m = /<palCoop:\s*(\d+)>/i.exec(eq.note);
                if (m) id = Number(m[1]);
            }
        }
        return id;
    };

    // 参战者 = 存活的我方战斗成员（原版结算循环遍历全体参战者）
    PalBattleCoop.contributors = function () {
        return $gameParty.battleMembers().filter(a => a.isAlive());
    };

    // 发动条件（uibattle.c 308-321）：≥2人、全员体力≥最大体力/5、无眠/乱/封/定
    PalBattleCoop.canUse = function (actor) {
        if (!this.skillOf(actor)) return false;
        const members = this.contributors();
        if (members.length < 2) return false;
        return members.every(a =>
            a.hp >= Math.floor(a.mhp / 5) &&
            !SLEEP_STATES.some(id => a.isStateAffected(id)) &&
            !CONFUSE_STATES.some(id => a.isStateAffected(id)) &&
            !PARA_STATES.some(id => a.isStateAffected(id)) &&
            !a.isStateAffected(SEAL_STATE_ID)
        );
    };

    //=============================================================================
    // 伤害：合力 = Σ(武力+灵力)/4，代入标准仙术公式（fight.c 3982-3995）
    //=============================================================================

    PalBattleCoop.coopPower = function () {
        let str = 0;
        for (const a of this.contributors()) str += a.atk + a.mat;
        return Math.floor(str / 4);
    };

    PalBattleCoop.magicDamage = function (subject, target, pal) {
        return PalBattleCore.magicDamage(subject, target, pal, this.coopPower());
    };

    const _makeDamageValue = Game_Action.prototype.makeDamageValue;
    Game_Action.prototype.makeDamageValue = function (target, critical) {
        if (this._palCoop && this.isSkill()) {
            const pal = PalBattleCore.parseMeta(this.item());
            if (pal && pal.base !== undefined && this.item().damage.type === 1) {
                return PalBattleCoop.magicDamage(this.subject(), target, pal);
            }
        }
        return _makeDamageValue.call(this, target, critical);
    };

    //=============================================================================
    // 速度：合体技行动 = 发动者身法×10（fight.c 1531-1533，抢先生效）
    //=============================================================================

    const _actionSpeed = Game_Action.prototype.speed;
    Game_Action.prototype.speed = function () {
        if (this._palCoop) {
            return this.subject().agi * 10 + Math.floor(Math.random() * 5);
        }
        return _actionSpeed.call(this);
    };

    //=============================================================================
    // 代价：不耗真气（跳过 useItem），改为全体参战者扣体力（fight.c 3954-3967）
    //=============================================================================

    const _useItem = Game_Battler.prototype.useItem;
    Game_Battler.prototype.useItem = function (item) {
        const action = BattleManager._action;
        if (action && action._palCoop && DataManager.isSkill(item)) return; // 合体技不耗真气
        _useItem.call(this, item);
    };

    const _startAction = BattleManager.startAction;
    BattleManager.startAction = function () {
        if (this._action && this._action._palCoop) PalBattleCoop.payCoopCost(this._action);
        _startAction.call(this);
    };

    // 全体参战者扣体力（数值=仙术真气消耗字段），每人保底1点，静默扣除不弹数字
    PalBattleCoop.payCoopCost = function (action) {
        const cost = action.item().mpCost || 0;
        if (cost <= 0) return;
        for (const a of this.contributors()) {
            a._hp = Math.max(1, a._hp - cost);
        }
        const scene = SceneManager._scene;
        if (scene && scene._statusWindow) scene._statusWindow.refresh();
    };

    //=============================================================================
    // 演出（发动合体技后执行）：全体参战者【同步】走到合体站位
    //（fight.c 3882-3920 同帧 6 步）；走到后发动者摆帧5/帧6 施法
    //（buildCoopCasterSteps），其余人摆吟唱帧(帧5)；特效播完后一齐归位
    //（fight.c 4056-4103）
    //=============================================================================

    const COOP_WALK_MS = 6 * BATTLE_MS; // 14帧≈240ms=原版6战斗帧

    PalBattleCoop.stageCoopCast = function (caster, action) {
        const meta = PalBattleCore.parseMeta(action.item());
        const total = PalBattleMagic && meta
            ? PalBattleMagic.castOffset(caster, meta) + PalBattleMagic.effectDuration(meta)
            : 0;
        const until = performance.now() + Math.max(total, 16 * 40);
        const k = Graphics.boxWidth / 320;
        let t = 0;
        for (const a of this.contributors()) {
            const idx = a === caster ? 0 : Math.min(++t, 2);
            const sp = PalBattleAnim.spriteOf(a);
            if (!sp) continue;
            const pos = COOP_POS[idx];
            // startMove 目标为绝对位移偏移：合体站位(屏幕坐标) - home
            // 三人同一帧起跑、同一时长，否则会因 Window_BattleLog 的
            // waitForMovement 把发动者的走位推迟到队友之后（变成依次走位）
            sp.startMove(pos[0] * k - sp._homeX, pos[1] * k - sp._homeY,
                Math.max(1, Math.round(COOP_WALK_MS / 1000 * 60)));
            sp._palCoopReturnAt = until + 120;
            // 吟唱帧在走位完成后才开始摆（原版 6 步走完后才 wCurrentFrame=5）；
            // 发动者的帧由施法序列控制，不设吟唱窗口
            if (a !== caster) {
                a._palCoopChantFrom = performance.now() + COOP_WALK_MS;
                a._palCoopChantUntil = until + 120;
            }
        }
    };

    const _performActionStart = Game_Actor.prototype.performActionStart;
    Game_Actor.prototype.performActionStart = function (action) {
        _performActionStart.call(this, action);
        if (action && action._palCoop && action.subject && action.subject() === this) {
            PalBattleCoop.stageCoopCast(this, action);
        }
    };

    // 吟唱帧（fight.c 3938 其余参战者走位完成后 wCurrentFrame=5）
    const _updateFrame = Sprite_Actor.prototype.updateFrame;
    Sprite_Actor.prototype.updateFrame = function () {
        _updateFrame.call(this);
        const a = this._actor;
        if (a && a._palCoopChantUntil && !PalBattleAnim.isBusy(this)) {
            const t = performance.now();
            if (t >= (a._palCoopChantFrom || 0) && t < a._palCoopChantUntil) {
                PalBattleAnim.setActorFrame(this, 5);
            }
        }
    };

    // 特效播完后归位（fight.c 4056-4103：6 步走回原位）
    const _update = Sprite_Actor.prototype.update;
    Sprite_Actor.prototype.update = function () {
        _update.call(this);
        if (this._palCoopReturnAt && performance.now() >= this._palCoopReturnAt &&
            !PalBattleAnim.isBusy(this)) {
            this.startMove(0, 0, 10);
            this._palCoopReturnAt = 0;
            if (this._actor) {
                this._actor._palCoopChantUntil = 0;
                this._actor._palCoopChantFrom = 0;
            }
        }
    };

    //=============================================================================
    // 指令盘与场景接线
    //=============================================================================

    const _createActorCommandWindow = Scene_Battle.prototype.createActorCommandWindow;
    Scene_Battle.prototype.createActorCommandWindow = function () {
        _createActorCommandWindow.call(this);
        this._actorCommandWindow.setHandler("coop", this.commandCoop.bind(this));
    };

    Scene_Battle.prototype.commandCoop = function () {
        this.beginCoopMagic();
    };

    // 合体技行动开始（右侧“合体”按钮与杂项菜单“围攻”共用）
    // 发动成功即标记 _pendingPalCoop：行动确认后消耗全部角色行动轮次（见下方包装）
    Scene_Battle.prototype.beginCoopMagic = function () {
        const actor = BattleManager.actor();
        const skillId = PalBattleCoop.skillOf(actor);
        const action = BattleManager.inputtingAction();
        if (!skillId || !action) {
            this._actorCommandWindow.activate();
            return;
        }
        action.setSkill(skillId);
        action._palCoop = true;
        actor.setLastBattleSkill(skillId);
        BattleManager._pendingPalCoop = true;
        {
            const sk = $dataSkills[skillId];
            console.log('[合体技] 发动者=%s 技能=%d(%s)', actor.name && actor.name(), skillId,
                sk ? sk.name : '?');
        }
        const skill = $dataSkills[skillId];
        if (skill && skill.scope === 1) {
            this.startEnemySelection(); // 单体技：选敌
        } else {
            this.onSelectAction();      // 群体技：打击敌方全体，直接结算
        }
    };

    //=============================================================================
    // 消耗全员行动轮次（fight.c：发动合体后其余人参战者行动轮空）
    // 时序：beginCoopMagic 置 _pendingPalCoop → 行动确认流经
    // Scene_Battle.selectNextCommand 时转为 _palCoopConsumeAll →
    // BattleManager.selectNextActor 见标志则跳过其余角色输入直接 startTurn
    //=============================================================================

    const _sceneSelectNextCommand = Scene_Battle.prototype.selectNextCommand;
    Scene_Battle.prototype.selectNextCommand = function () {
        if (BattleManager._pendingPalCoop) {
            BattleManager._palCoopConsumeAll = true;
            BattleManager._pendingPalCoop = false;
        }
        _sceneSelectNextCommand.call(this);
    };

    // 包 selectNextActor 而非 changeCurrentActor：原实现里 changeCurrentActor 后
    // 若无人可选还会再 startTurn 一次，直接短路可避免回合数重复 +1
    const _selectNextActor = BattleManager.selectNextActor;
    BattleManager.selectNextActor = function () {
        if (this._palCoopConsumeAll) {
            this._palCoopConsumeAll = false;
            this._currentActor = null;
            this.startTurn();
            return;
        }
        _selectNextActor.call(this);
    };

    const _startTurn = BattleManager.startTurn;
    BattleManager.startTurn = function () {
        this._palCoopConsumeAll = false; // 保险：回合开始时清标志
        _startTurn.call(this);
    };

    // 选敌取消后恢复指令盘（palBattleTarget 只兜底了 attack 分支）
    const _onEnemyCancel = Scene_Battle.prototype.onEnemyCancel;
    Scene_Battle.prototype.onEnemyCancel = function () {
        BattleManager._pendingPalCoop = false; // 取消选敌则不再吞回合
        _onEnemyCancel.call(this);
        if (this._actorCommandWindow.currentSymbol() === "coop" &&
            this._actorCommandWindow.visible && !this._actorCommandWindow.active) {
            this._actorCommandWindow.activate();
        }
    };
})();
