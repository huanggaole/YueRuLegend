/*:
 * @target MZ
 * @plugindesc [v1.0] 仙剑98柔情版：混乱（疯魔）状态下攻击队友 —— 对齐 fight.c 1308/1743/3448/3760-3855
 * @author 马化腾
 *
 * @help
 * 原版 kBattleActionAttackMate（battle.h:59 "attack teammate (confused only)"）。
 * 注意：这不是「围攻」也不是「合体技」——
 *   围攻   = fAutoAttack（uibattle.c 1386-1392 杂项菜单第 3 项，词条 word 56），
 *            由 palBattleAuto.js 实现；
 *   合体技 = kBattleActionCoopMagic（battle.h:55），由 palBattleCoop.js 实现；
 *   本文件只做 kBattleActionAttackMate（battle.h:59）：混乱/疯魔时打自己人。
 *
 * 触发时机（fight.c 1308 / 1743，kFighterAct 即角色真正开始行动那一刻）：
 *   昏睡               → Pass（跳过行动）
 *   混乱               → AttackMate；但若同时濒死 → Pass
 *   其它               → 玩家原本选的指令
 * 实际行动时（fight.c 3448）还会再查一次：
 *   已经不混乱了       → 改回普通攻击打敌人（wActionID 置 0，避免被判成自动攻击）
 *   只剩自己一个活人   → 同样改回打敌人
 * 本插件在 BattleManager.startAction 判定（等价于原版的「真正开始行动那一刻」），
 * 因此「中途被解除混乱」与「队友全灭」两个兜底天然成立。
 *
 * 演出（fight.c 3760-3855，40ms/帧）：
 *   帧8 → 帧0 → 帧8 → 帧0（各 1 帧，原地抖两下）
 *   delay 2 帧
 *   瞬移到 (队友x+30, 队友y+12) PAL 单位、帧8、停 5 帧
 *   帧9（挥砍）→ 播 rgwWeaponSound → 结算伤害
 *   队友击退 (-12,-6) PAL、泛红(iColorShift=6)、显示伤害数字
 *   delay 4 帧 → PAL_BattleUpdateFighters → delay 4 帧
 *
 * 伤害（fight.c 3812-3835）：
 *   str = 攻击者攻击力
 *   def = 目标防御力（目标处于防御状态则 ×2）
 *   sDamage = PAL_CalcPhysicalAttackDamage(str, def, 2)
 *   目标有「护」→ ÷2
 *   ≤0 → 1；超过目标当前 HP → 截断到 HP（所以是能把队友打死的）
 * ⚠ 这条比「打敌人」的普攻公式简单得多：没有 +RandomLong(1,2)、没有会心一击×3、
 *   没有李逍遥的 1/12 追加攻击、没有 ×RandomFloat(1,1.125)。
 */

(function () {
    "use strict";

    const PalBattleConfuse = (window.PalBattleConfuse = {});

    if (window.PAL98_SPEED == null) window.PAL98_SPEED = 1;
    const battleMs = () => 40 / (window.PAL98_SPEED || 1); // 原版一帧（BATTLE_FPS = 25）
    const GUARD_STATE_ID = 2;
    const CONFUSE_STATES = [9, 11];          // 疯魔 / 疯魔5
    const SLEEP_STATES = [10, 19];           // 昏睡3 / 昏睡5
    const PARA_STATES = [4, 5, 7];           // 定身 / 定身4 / 定身5

    // 我方战斗立绘的固定帧号（与 palBattleAnim.js 的 AF 保持一致）
    const AF = { IDLE: 0, HURT: 4, CAST: 6, PREP: 7, ATK1: 8, ATK2: 9 };

    // 站到队友身边：PAL (+30,+12) → 屏幕 ×k
    const MATE_OFFSET_PAL = [30, 12];

    PalBattleConfuse.isConfused = function (battler) {
        if (!battler || !battler.isActor || !battler.isActor()) return false;
        return CONFUSE_STATES.some(id => battler.isStateAffected(id));
    };

    PalBattleConfuse.isIncapacitated = function (battler) {
        return SLEEP_STATES.concat(PARA_STATES).some(id => battler.isStateAffected(id));
    };

    // 随机挑一个存活队友（fight.c 3775-3781 的 do-while）
    PalBattleConfuse.pickMate = function (subject) {
        const mates = $gameParty.battleMembers().filter(
            a => a !== subject && a.isAlive());
        if (mates.length === 0) return null;
        return mates[Math.floor(Math.random() * mates.length)];
    };

    //=========================================================================
    // 1. 决策：行动真正开始时把目标改判为随机队友
    //=========================================================================

    const _startAction = BattleManager.startAction;
    BattleManager.startAction = function () {
        const subject = this._subject;
        const action = subject && subject.currentAction && subject.currentAction();
        let mate = null;
        if (subject && subject.isActor && subject.isActor() && action &&
            !action._palAttackMate) {
            // 昏睡/定身优先于混乱（fight.c 1303-1311 的 if/else 链）
            if (PalBattleConfuse.isConfused(subject) &&
                !PalBattleConfuse.isIncapacitated(subject) &&
                !(window.PalBattleCore && PalBattleCore.isDying &&
                    PalBattleCore.isDying(subject))) {
                // 濒死 → 原版走 kBattleActionPass，这里等价为「不改为打队友」
                mate = PalBattleConfuse.pickMate(subject);
            }
        }
        _startAction.call(this);
        if (action && mate) {
            // 兜底：队友在这一瞬间全灭了（fight.c 3448 的「只剩自己」分支）
            if (!mate.isAlive() && !PalBattleConfuse.pickMate(subject)) return;
            const t = mate.isAlive() ? mate : PalBattleConfuse.pickMate(subject);
            action._palAttackMate = true;
            action._palMateTarget = t;
            this._targets = [t];
            subject._palTargets = [t];
        }
    };

    // performActionStart 会用 BattleManager._targets 重建 _palTargets，
    // 这里再补一次，防止中途被覆盖
    const _actorPerformActionStart = Game_Actor.prototype.performActionStart;
    Game_Actor.prototype.performActionStart = function (action) {
        _actorPerformActionStart.call(this, action);
        if (action && action._palAttackMate && action._palMateTarget) {
            this._palTargets = [action._palMateTarget];
        }
    };

    //=========================================================================
    // 2. 伤害：我方 → 我方 的物理公式（fight.c 3812-3835）
    //=========================================================================

    const _physicalDamage = PalBattleCore.physicalDamage;
    PalBattleCore.physicalDamage = function (subject, target) {
        if (subject && target && subject.isActor && subject.isActor() &&
            target.isActor && target.isActor()) {
            let str = subject.atk;
            let def = target.def;
            if (target.isStateAffected(GUARD_STATE_ID)) def *= 2;
            let dmg = PalBattleCore.baseDamage(str, def);
            dmg = Math.floor(dmg / 2);                 // wAttackResistance = 2
            if (PalBattleCore.hasProtect(target)) dmg = Math.trunc(dmg / 2);
            if (dmg <= 0) dmg = 1;
            if (dmg > target.hp) dmg = target.hp;      // 不会溢出，但能打死
            return dmg;
        }
        return _physicalDamage.call(this, subject, target);
    };

    //=========================================================================
    // 3. 演出：站在队友身边挥砍（fight.c 3787-3855）
    //=========================================================================

    PalBattleConfuse.buildMateSteps = function (sprite, targetSprite) {
        const k = Graphics.boxWidth / 320;
        let dx = 0, dy = 0;
        if (targetSprite) {
            dx = targetSprite.x + MATE_OFFSET_PAL[0] * k - sprite._homeX;
            dy = targetSprite.y + MATE_OFFSET_PAL[1] * k - sprite._homeY;
        }
        return [
            { frame: AF.ATK1 }, { wait: battleMs() },      // 0    原地抖：帧8
            { frame: AF.IDLE }, { wait: battleMs() },      // 40   帧0
            { frame: AF.ATK1 }, { wait: battleMs() },      // 80   帧8
            { frame: AF.IDLE }, { wait: battleMs() },      // 120  帧0
            { wait: 2 * battleMs() },                      // 160  delay 2
            // 240  瞬移到队友身边（原版直接改 pos，不是走过去）
            { frame: AF.ATK1, moveAbs: [dx, dy], ms: battleMs() },
            { wait: 5 * battleMs() },                      // 停 5 帧
            { frame: AF.ATK2 },                           // 440  挥砍 + 武器音 + 伤害
            { wait: 4 * battleMs() },                      // 480  泛红/击退表现期
            { moveAbs: [0, 0], ms: 5 * battleMs() }        // 640  归位
        ];
    };

    // 挥砍帧（帧9）落在第 11 帧 = 440ms。武器音与伤害数字都按 popupDelay 对齐到这一刻，
    // 所以这里只要改 popupDelay，palBattleSe 的武器音就自动同步。
    Object.defineProperty(PalBattleConfuse, "HIT_MS", { get: () => 11 * battleMs() });

    const _popupDelay = PalBattleAnim.popupDelay;
    PalBattleAnim.popupDelay = function () {
        const action = BattleManager._action;
        if (action && action._palAttackMate) return PalBattleConfuse.HIT_MS;
        return _popupDelay.call(this);
    };

    const _actorPerformAction = Game_Actor.prototype.performAction;
    Game_Actor.prototype.performAction = function (action) {
        if (action && action._palAttackMate) {
            _actorPerformAction.call(this, action);  // 保留 _palCastAction 等公共逻辑
            const sprite = window.PalBattleAnim && PalBattleAnim.spriteOf(this);
            if (!sprite || !PalBattleAnim.spriteOf) return;
            const mate = action._palMateTarget;
            const tSprite = mate ? PalBattleAnim.spriteOf(mate) : null;
            PalBattleAnim.runSeq(sprite, PalBattleConfuse.buildMateSteps(sprite, tSprite));
            return;
        }
        _actorPerformAction.call(this, action);
    };

    //=========================================================================
    // 4. 队友被打中的表现：向左上击退 (-12,-6) PAL（fight.c 3829-3831）
    //
    //    原版这里与「敌人打我方」的击退方向相反（敌人打我方是 (+10,+5) 往右下），
    //    因为攻击者站在队友右侧。项目现有的受击击退是统一方向，这里单独覆盖。
    //=========================================================================

    const MATE_BACK_PAL = [-12, -6];

    PalBattleConfuse.knockback = function (target) {
        const sprite = window.PalBattleAnim && PalBattleAnim.spriteOf(target);
        if (!sprite || !sprite.startMove) return;
        const k = Graphics.boxWidth / 320;
        const dx = MATE_BACK_PAL[0] * k;
        const dy = MATE_BACK_PAL[1] * k;
        sprite.startMove(dx, dy, 3);
        sprite._palMateBackAt = performance.now();
    };

    // MZ 的伤害结算是同步的（performDamage 在序列刚起步时就触发），
    // 而原版是「帧9 挥砍之后」才击退 + 泛红 —— 这里把两者都推迟到挥砍帧。
    const _actorPerformDamage = Game_Actor.prototype.performDamage;
    Game_Actor.prototype.performDamage = function () {
        _actorPerformDamage.call(this);
        const action = BattleManager._action;
        if (!action || !action._palAttackMate || action._palMateTarget !== this) return;
        this._palHurtAt = performance.now() + PalBattleConfuse.HIT_MS;
        setTimeout(() => {
            if (this.isAlive && this.isAlive()) PalBattleConfuse.knockback(this);
        }, PalBattleConfuse.HIT_MS);
    };

    // 击退后回位（原版靠 PAL_BattleUpdateFighters 复位；这里延后 4 帧归零）
    const _spriteActorUpdate = Sprite_Actor.prototype.update;
    Sprite_Actor.prototype.update = function () {
        _spriteActorUpdate.call(this);
        if (this._palMateBackAt && performance.now() - this._palMateBackAt > 4 * battleMs()) {
            this._palMateBackAt = 0;
            if (!PalBattleAnim.isBusy(this)) this.startMove(0, 0, 10);
        }
    };

    //=========================================================================
    // 5. 混乱状态的【常驻抖动】——battle.c 114-122 / 187-197
    //
    //    原版在【绘制战斗精灵时】对本地 pos 副本加随机偏移：
    //      敌人（battle.c 114-122）：混乱 && !昏睡 && !定身 → pos.x += RandomLong(-1, 1)
    //      我方（battle.c 187-197）：混乱 && !昏睡 && !定身 && HP>0 && !濒死
    //                                 → pos.y += RandomLong(-1, 1)
    //    ⚠ 我方是【上下】抖、敌人是【左右】抖 —— 原版两处写的是不同的轴，别统一。
    //    ⚠ 原版只改绘制用的本地副本，不动 g_Battle.rgPlayer[].pos；
    //      本项目挂在 Sprite_Battler.updatePosition 末尾（与吹飞 _palBlowX 同一处），
    //      下一帧 updatePosition 会重写 x/y，所以偏移不会累积。
    //    ⚠ 随机按【战斗帧】节流（40ms / PAL98_SPEED）：原版绘制 25fps，
    //      若按渲染帧（60fps）随机会抖得比原版碎。
    //=========================================================================

    const SHAKE_PAL = 1;                                  // RandomLong(-1, 1)
    const kShake = () => Graphics.boxWidth / 320;
    PalBattleConfuse.shakeEnabled = true;

    const randLong = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

    // 本帧该给这个精灵加多少偏移（PAL 单位）；null = 不抖
    function shakeOffsetOf(battler) {
        const affected = id => battler.isStateAffected && battler.isStateAffected(id);
        if (!CONFUSE_STATES.some(affected)) return null;
        if (SLEEP_STATES.concat(PARA_STATES).some(affected)) return null;
        const v = randLong(-SHAKE_PAL, SHAKE_PAL);
        if (battler.isActor && battler.isActor()) {
            if (!(battler.hp > 0)) return null;
            if (window.PalBattleCore && PalBattleCore.isDying && PalBattleCore.isDying(battler)) return null;
            return { x: 0, y: v };                        // 我方：上下
        }
        return { x: v, y: 0 };                            // 敌人：左右
    }

    const _updatePositionShake = Sprite_Battler.prototype.updatePosition;
    Sprite_Battler.prototype.updatePosition = function () {
        _updatePositionShake.call(this);
        if (!PalBattleConfuse.shakeEnabled) return;
        const b = this._actor || this._enemy;
        if (!b) return;
        const now = performance.now();
        // 每个战斗帧重新抽一次（原版是每帧绘制各抽一次）
        if (!b._palShake || now - b._palShake.at >= battleMs()) {
            const off = shakeOffsetOf(b);
            b._palShake = { at: now, on: !!off, x: off ? off.x : 0, y: off ? off.y : 0 };
        }
        if (b._palShake.on) {
            this.x += b._palShake.x * kShake();
            this.y += b._palShake.y * kShake();
        }
    };

})();
