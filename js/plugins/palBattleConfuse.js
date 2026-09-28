/*:
 * @target MZ
 * @plugindesc [v1.0] 仙剑98柔情版：混乱（疯魔）状态下攻击队友 —— 对齐 fight.c 1308/1743/3448/3760-3855
 * @author 马化腾
 *
 * @help
 * 原版 kBattleActionAttackMate（battle.h:59 "attack teammate (confused only)"）。
 * 注意：这不是「围攻」——围攻 = kBattleActionCoopMagic，已由 palBattleCoop.js 实现。
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

    const BATTLE_MS = 40;                    // 原版一帧（BATTLE_FPS = 25）
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
            { frame: AF.ATK1 }, { wait: BATTLE_MS },      // 0    原地抖：帧8
            { frame: AF.IDLE }, { wait: BATTLE_MS },      // 40   帧0
            { frame: AF.ATK1 }, { wait: BATTLE_MS },      // 80   帧8
            { frame: AF.IDLE }, { wait: BATTLE_MS },      // 120  帧0
            { wait: 2 * BATTLE_MS },                      // 160  delay 2
            // 240  瞬移到队友身边（原版直接改 pos，不是走过去）
            { frame: AF.ATK1, moveAbs: [dx, dy], ms: BATTLE_MS },
            { wait: 5 * BATTLE_MS },                      // 停 5 帧
            { frame: AF.ATK2 },                           // 440  挥砍 + 武器音 + 伤害
            { wait: 4 * BATTLE_MS },                      // 480  泛红/击退表现期
            { moveAbs: [0, 0], ms: 5 * BATTLE_MS }        // 640  归位
        ];
    };

    // 挥砍帧（帧9）落在第 11 帧 = 440ms。武器音与伤害数字都按 popupDelay 对齐到这一刻，
    // 所以这里只要改 popupDelay，palBattleSe 的武器音就自动同步。
    PalBattleConfuse.HIT_MS = 11 * BATTLE_MS;

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
        if (this._palMateBackAt && performance.now() - this._palMateBackAt > 4 * BATTLE_MS) {
            this._palMateBackAt = 0;
            if (!PalBattleAnim.isBusy(this)) this.startMove(0, 0, 10);
        }
    };

})();
