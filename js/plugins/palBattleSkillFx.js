/*:
 * @target MZ
 * @plugindesc [v1.0] 仙剑98柔情版 仙术脚本效果（下毒/即死/昏睡/疯魔/复活/解毒/增益）
 * @author AI Assistant
 *
 * @help
 * 原版每个仙术的「实际作用」并不写在 Magics.csv 里，而是挂在仙术对象的
 * ScriptOnUse / ScriptOnSuccess 脚本上（sdlpal script.c 的 opcode）。
 * 本插件把那些脚本逐条反编译后做成一张效果表，在仙术结算时还原。
 *
 * 必须排在 palBattleCore.js 之后加载。
 *
 * ===== 效果表来源（script.c opcode） =====
 *  0x0028 给敌人下毒   operand[1]=毒对象 555三尸蛊/560金蚕蛊 → 敌人毒状态 25/30
 *  0x0029 给我方下毒   operand[1]=毒对象 553瘴毒            → 我方毒状态 22
 *  0x002E 给敌人上状态 operand[0]=状态号(0疯魔/2昏睡) operand[1]=回合数
 *  0x002D 给我方上状态 operand[0]=状态号(5勇/6护/7疾/8双击) operand[1]=回合数
 *  0x0022 复活         HP = 最大体力 × operand[1] / 10，并解毒 + 清状态
 *  0x002B 按种类解毒   operand[1]=毒对象 551赤毒/553瘴毒/552尸毒
 *  0x002C 按等级解毒   operand[1]=毒等级
 *  0x002F 移除玩家状态 operand[0]=状态号
 *  0x0060 立即 KO（夺魂，前置 0x0006 按 32% 概率判定）
 *  0x003A 逃跑（金蝉脱壳）  0x0033 收集敌人（灵葫咒）  0x006A 偷窃（飞龙探云手）
 *
 * ===== 状态号对照（global.h 42-55，PAL_CLASSIC） =====
 *  0 疯魔(Confused) 1 定身 2 昏睡 3 咒封 5 勇(Bravery) 6 护(Protect)
 *  7 疾(Haste) 8 双击(DualAttack)
 *
 * ===== 尚未还原 =====
 *  · 灵葫咒(84) 收妖炼蛊、飞龙探云手(98) 偷窃、金蝉脱壳(99) 逃跑 —— 需要对应系统
 *    （金蝉脱壳/灵葫咒已由 palSpecialArts.js 实现）
 *
 * ===== 敌用分支（v1.1 补，见 ENEMY_FX）=====
 * 敌人放回梦/夺魂/鬼降时走仙术脚本的 0x0068「敌方回合」分支（Scripts.json）：
 *  回梦 0xA851：0x0006 门 70 → 69% → 39391（0x002D 状态2昏睡×3回合）
 *  夺魂 0xA873：0x0006 门 30 → 29% → 0x005F 我方立即暴毙
 *  鬼降 0xA85C：0x0006 门 50 → 49% → 39398（0x002D 状态0疯魔×3回合）
 * 另修正：我方鬼降的 0x0006 门是 44（成功 43%），旧表错写成 100。
 */

(() => {
    const PalSkillFx = (window.PalSkillFx = {});

    const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));

    //=============================================================================
    // 仙术脚本效果表（key = 原版 MagicID）
    //=============================================================================

    PalSkillFx.SCRIPTS = {
        // ---- 我方对敌：下毒（0x0028，先过敌人巫抗 RandomLong(0,9) >= wResistanceToSorcery）
        48: { poisonEnemy: 25, chance: 100 },  // 三尸咒   → 三尸蛊毒·敌
        63: { poisonEnemy: 25, chance: 100 },  // 万蛊蚀天 → 三尸蛊毒·敌
        91: { poisonEnemy: 30, chance: 100 },  // 毒吞天下 → 金蚕蛊毒·敌
        // ---- 敌对我：下毒（0x0029，过我方毒抗 RandomLong(1,100) > 毒抗）
        70: { poisonActor: 22 },               // 咒蛇   → 瘴毒
        101: { poisonActor: 22 },              // 大咒蛇 → 瘴毒
        // ---- 即死（0x0060，前置 0x0006：RandomLong(1,100) >= 33 才跳走 → 成功 32%）
        67: { instantDeath: 33 },              // 夺魂
        // ---- 给敌人上状态（0x002E；回梦还有 0x0006：>= 60 才跳走 → 成功 59%）
        66: { enemyState: 10, turns: 4, chance: 60 },  // 回梦 → 昏睡3 状态（4 回合）
        68: { enemyState: 9, turns: 4, chance: 44 },   // 鬼降 → 疯魔（0x0006 门 44 → 成功 43%）
        // ---- 复活（0x0022：HP = 最大体力 × n / 10）
        36: { revive: 1 },                     // 还魂咒 → 10% 体力
        37: { revive: 3 },                     // 赎魂   → 30% 体力
        // ---- 解毒 / 解状态
        38: { curePoison: [20, 22, 21] },      // 净衣咒 → 解赤毒/瘴毒/尸毒
        52: { curePoisonAll: true },           // 灵血咒 → 解全部毒
        31: { clearStates: true },             // 冰心诀 → 清 0~3 号状态（疯魔/定身/昏睡/咒封）
        // ---- 增益（0x002D 给我方上状态）
        39: { buff: 31, turns: 7 },            // 金刚咒     → 护体（金刚护体）
        40: { buff: 31, turns: 9 },            // 真元护体   → 护体
        41: { buff: 32, turns: 7 },            // 天罡战气   → 勇（天罡战气）
        95: { buff: 34, turns: 5 },            // 醉仙望月步 → 双击（醉仙望月）
        97: { buff: 33, turns: 9 }             // 仙风云体术 → 疾（仙风云体，身法×1.5）
    };

    // 我方状态号 → RMMZ 状态 ID（用于「冰心诀」清状态）
    const PAL_STATUS_TO_MZ = { 0: 9, 1: 7, 2: 10, 3: 6 }; // 疯魔/定身/昏睡/咒封

    //=============================================================================
    // 敌用分支（0x0068「敌方回合才跳」之后的代码路径，Scripts.json 实测）
    //   chance 对齐 0x0006：RandomLong(1,100) >= chance → 失败，成功 = (chance-1)%
    //=============================================================================

    PalSkillFx.ENEMY_FX = {
        66: { state: 10, turns: 3, chance: 70 },  // 回梦：69% → 我方昏睡 3 回合（39391: 0x002D 状态2×3）
        67: { kill: true, chance: 30 },           // 夺魂：29% → 我方立即暴毙（43123-43124: 0x005F）
        68: { state: 9, turns: 3, chance: 50 }    // 鬼降：49% → 我方疯魔 3 回合（39398: 0x002D 状态0×3）
    };

    //=============================================================================
    // 敌人巫抗（Objects.csv 敌人对象的 Word1 = wResistanceToSorcery）
    //=============================================================================

    PalSkillFx.enemySorceryRes = function (enemy) {
        const meta = PalBattleCore.enemyMeta(enemy);
        return meta ? (meta.sorc || 0) : 0;
    };

    //=============================================================================
    // 施加效果
    //=============================================================================

    PalSkillFx.apply = function (action, target) {
        const item = action.item();
        if (!item) return;
        const pal = PalBattleCore.parseMeta(item);
        if (!pal || pal.mid === undefined) return;
        const fx = PalSkillFx.SCRIPTS[pal.mid];
        if (!fx) return;
        const subject = action.subject();
        if (!subject || !target) return;
        const res = target.result();
        // 原版：仙术本身必定生效（没有 miss 判定），只有 ScriptOnUse 里的概率跳转会失败
        if (res && (res.missed || res.evaded)) return;

        // 敌用分支：回梦/夺魂/鬼降（0x0068 之后的代码路径，作用于我方）
        if (subject.isEnemy() && target.isActor()) {
            const efx = PalSkillFx.ENEMY_FX[pal.mid];
            if (!efx) return;
            if (randInt(1, 100) >= efx.chance) return;      // 0x0006 概率门
            if (efx.kill) {
                target.setHp(0);
                target.addState(target.deathStateId());
                target.performCollapse();
            } else if (efx.state) {
                target.addState(efx.state);                 // 0x002D：无抗性判定，直接生效
                if (efx.turns) target._stateTurns[efx.state] = efx.turns;
            }
            return;
        }

        if (fx.poisonEnemy && target.isEnemy()) {
            // 0x0028: RandomLong(0, 9) >= 敌人巫抗 → 中毒
            if (randInt(0, 9) >= PalSkillFx.enemySorceryRes(target)) {
                target.addState(fx.poisonEnemy);
            }
            return;
        }
        if (fx.poisonActor && target.isActor()) {
            // 0x0029: RandomLong(1, 100) > 我方毒抗 → 中毒
            if (randInt(1, 100) > PalBattleCore.actorElementResist(target, 6)) {
                target.addState(fx.poisonActor);
            }
            return;
        }
        if (fx.instantDeath && target.isEnemy()) {
            // 0x0006: RandomLong(1,100) < 33 → 继续到 0x0060 即死
            if (randInt(1, 100) < fx.instantDeath) {
                target.setHp(0);
                target.addState(target.deathStateId());
                target.performCollapse();
            }
            return;
        }
        if (fx.enemyState && target.isEnemy()) {
            // 0x0006: RandomLong(1,100) >= N 才跳走（失败），故成功需要 rand < N
            if (randInt(1, 100) >= (fx.chance === undefined ? 101 : fx.chance)) return;
            // 0x002E: RandomLong(0, i) > 敌人巫抗（i=9，PAL_CLASSIC）
            if (randInt(0, 9) <= PalSkillFx.enemySorceryRes(target)) return;
            target.addState(fx.enemyState);
            if (fx.turns) target._stateTurns[fx.enemyState] = fx.turns;
            return;
        }
        if (fx.revive !== undefined && target.isActor()) {
            // 0x0022: 只对 HP=0 的队员生效，恢复 最大体力×n/10，并解毒 + 清状态
            if (target.hp === 0) {
                target.removeState(target.deathStateId());
                target.setHp(Math.max(1, Math.floor(target.mhp * fx.revive / 10)));
                PalSkillFx.cureAllPoison(target);
                for (let i = 0; i < 9; i++) PalSkillFx.removePalStatus(target, i);
            }
            return;
        }
        if (fx.curePoison && target.isActor()) {
            for (const sid of fx.curePoison) target.removeState(sid);
            return;
        }
        if (fx.curePoisonAll && target.isActor()) {
            PalSkillFx.cureAllPoison(target);
            return;
        }
        if (fx.clearStates && target.isActor()) {
            for (const k in PAL_STATUS_TO_MZ) target.removeState(PAL_STATUS_TO_MZ[k]);
            return;
        }
        if (fx.buff && target.isActor()) {
            target.addState(fx.buff);
            if (fx.turns) target._stateTurns[fx.buff] = fx.turns;
            return;
        }
    };

    // 解所有带 <palPoison> 的状态（毒状态在 States.json 里都是这个备注）
    PalSkillFx.cureAllPoison = function (battler) {
        for (const state of battler.states()) {
            if (state && /<palPoison/i.test(state.note || "")) {
                battler.removeState(state.id);
            }
        }
    };

    // 按原版状态号移除我方状态（冰心诀 0x002F）
    PalSkillFx.removePalStatus = function (actor, palStatus) {
        const mzId = PAL_STATUS_TO_MZ[palStatus];
        if (mzId) actor.removeState(mzId);
    };

    //=============================================================================
    // 施法消耗（0x001E 增减金钱，不足则整段脚本跳走 = 施法失败）
    //   铜钱镖(mid 53)：每次扣 500 文钱
    //=============================================================================

    PalSkillFx.COST = { 53: { gold: 500 } };

    PalSkillFx.payCost = function (action) {
        if (action._palCostPaid) return;          // 多目标仙术只扣一次
        action._palCostPaid = true;
        const pal = PalBattleCore.parseMeta(action.item());
        if (!pal || pal.mid === undefined) return;
        const cost = PalSkillFx.COST[pal.mid];
        if (!cost) return;
        if (cost.gold) {
            if ($gameParty.gold() < cost.gold) {
                action._palCostFailed = true;     // 钱不够 → 仙术打不出伤害
                return;
            }
            $gameParty.loseGold(cost.gold);
        }
    };

    //=============================================================================
    // 挂载：仙术结算后施加脚本效果（多目标仙术每目标独立判定，与原版一致）
    //=============================================================================

    const _apply = Game_Action.prototype.apply;
    Game_Action.prototype.apply = function (target) {
        PalSkillFx.payCost(this);
        const result = _apply.call(this, target);
        PalSkillFx.apply(this, target);
        return result;
    };

    const _makeDamageValue = Game_Action.prototype.makeDamageValue;
    Game_Action.prototype.makeDamageValue = function (target, critical) {
        if (this._palCostFailed) return 0;
        return _makeDamageValue.call(this, target, critical);
    };

    //=============================================================================
    // 醉仙望月步（kStatusDualAttack）：普通攻击打 2 次（fight.c 3628/3681）
    //=============================================================================

    const _numRepeats = Game_Action.prototype.numRepeats;
    Game_Action.prototype.numRepeats = function () {
        let repeats = _numRepeats.call(this);
        const subject = this.subject();
        if (this.isAttack() && subject && PalBattleCore.hasDualAtk(subject)) {
            repeats += 1;
        }
        return Math.floor(repeats);
    };

})();
