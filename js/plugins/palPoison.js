/*:
 * @target MZ
 * @plugindesc [v1.1] 仙剑98柔情版中毒系统（阶梯扣血/暴毙/蛊相克即死/养蛊产出/毒与物品绑定）
 * @author AI Assistant
 *
 * @help
 * 本插件复刻仙剑98柔情版的毒机制，全部数据来自逆向工程（sdlpal + Objects.csv + Scripts.json），
 * 需排在 palBattleCore.js 之后加载。
 *
 * ===== 数据来源 =====
 * 毒对象 = PAL 对象 551~562，两种脚本槽：
 *   · wPlayerScript（Objects.csv Word2）—— 我方中毒时每回合执行
 *   · wEnemyScript （Objects.csv Word4）—— 敌方中毒时每回合执行
 * 脚本推进语义（sdlpal script.c 3204-3217）：
 *   0x0000 = 结束，返回值 = 本次入口 → 每回合从头重复（固定值毒）
 *   0x0001 = 结束，返回值 = 当前行 +1 → 每回合前进一步（阶梯毒）
 * 毒等级 = Objects.csv Word0（PAL_CurePoisonByLevel / 0x002C 用）：
 *   赤毒0 尸毒1 瘴毒1 毒丝2 三尸蛊/鹤顶红/孔雀胆/血海棠/断肠草/金蚕蛊=3 食妖虫/碧血蚕=4
 *
 * ===== 每回合伤害 =====
 *   赤毒 7 / 尸毒 12 / 瘴毒 20 / 毒丝 32（固定值，我方；敌方同值）
 *   鹤顶红·孔雀胆·血海棠·断肠草·金蚕蛊 = 50（我方）/ 100（敌方）
 *   三尸蛊毒：潜伏 2 回合 → 1 / 2 / 3 → 第 6 回合 200（暴毙）→ 自动解除
 *             敌方版：111 / 222 / 333 → 自动解除
 *   食妖虫附 / 碧血蚕附（只对敌方）：1~8 递增 → 第 9 回合蛊成熟，
 *             产出 灵蛊 / 赤血蚕 并自动解除（即「养蛊」）
 *
 * ===== 物品对我方【使用】的三段判定（0x005D 链）=====
 *   ① 身上有「可解之毒」 → 解除（以毒攻毒）
 *   ② 否则身上有「相克之毒」 → 我方立即暴毙（0x005F）
 *   ③ 否则 → 给自己上毒（炼蛊）
 *     鹤顶红：解血海棠毒 / 有孔雀胆毒则暴毙 / 否则上鹤顶红毒
 *     孔雀胆：解金蚕蛊毒 / 有鹤顶红毒则暴毙 / 否则上孔雀胆毒
 *     血海棠：解断肠草毒 / 有三尸蛊毒则暴毙 / 否则上血海棠毒
 *     断肠草：解三尸蛊毒 / 有金蚕蛊毒则暴毙 / 否则上断肠草毒
 *     三尸蛊：解孔雀胆毒 / 有血海棠毒则暴毙 / 否则上三尸蛊毒
 *     金蚕蛊：解鹤顶红毒 / 有断肠草毒则暴毙 / 否则上金蚕蛊毒
 *
 * ===== 投掷给敌人（0x0028 + 0x005E + 0x0060）=====
 *   上毒后，若敌人【已有】相克之毒 → 立即即死：
 *     三尸蛊毒 ⇔ 血海棠毒   金蚕蛊毒 ⇔ 断肠草毒   鹤顶红毒 ⇔ 孔雀胆毒
 *
 * ===== 按等级解毒（0x002C）=====
 *   鬼枯藤 / 九节菖蒲 = 2 级以下全解（赤/尸/瘴/毒丝）
 *   毒龙胆           = 3 级以下全解（再 + 六种蛊毒）
 *
 * ===== 状态编号（data/States.json）=====
 *   12~17,20~23 = 我方毒；25~30,35~40 = 敌方毒（35~40 由 tools/pal_add_poison_states.py 追加）
 *   注：状态 18「无影毒」是历史遗留，无影毒实为体力减半，已在 Items.json 中解绑。
 *
 * ===== 与 data/Items.json 的分工（重要）=====
 *   · 毒状态的「附加 / 解除」effect 已从 Items.json 全部剥离，由本插件统一处理。
 *     原因一：DB 的 removeState 不会清本插件的回合计数；
 *     原因二：投掷物原本挂的是【我方】状态 ID（20/22），投给敌人会串味。
 *   · 81~95、93 的 scope 必须是 11（使用者）：原版 ScriptOnUse 一律作用于使用者自己。
 *     MZ 中 scope=11 → needsSelection()=false、makeTargets()=[subject]，正好对上。
 *     投掷不受影响（palBattleMisc 对 _palThrow 强制 isForOpponent / makeTargets）。
 */
(() => {
    const PalPoison = (window.PalPoison = {});
    const PalBattleCore = window.PalBattleCore;

    //=============================================================================
    // 毒定义表：MZ 状态 ID → 原版毒行为
    //
    //   pal       PAL 毒对象 ID，用于查毒等级
    //   side      'player' = 我方毒；'enemy' = 敌方毒（决定投掷/使用上哪种）
    //   flat      每回合固定扣血（0x0000 循环脚本，每回合从头重复）
    //   ladder    逐回合伤害序列（0x0001 阶梯脚本，每回合前进一步）
    //             数组第 n 项 = 中毒后第 n 回合的扣血；走到【最后一档】时触发收尾效果
    //   finalCure 最后一档自动解除该毒
    //   breed     最后一档产出物品 ID（养蛊成熟）
    //=============================================================================

    const POISON = {
        // ---- 我方毒 ----
        20: { pal: 551, side: 'player', name: '赤毒', flat: 7 },
        21: { pal: 552, side: 'player', name: '尸毒', flat: 12 },
        22: { pal: 553, side: 'player', name: '瘴毒', flat: 20 },
        23: { pal: 554, side: 'player', name: '毒丝', flat: 32 },
        12: { pal: 555, side: 'player', name: '三尸蛊毒', ladder: [0, 0, 1, 2, 3, 200], finalCure: true },
        13: { pal: 556, side: 'player', name: '鹤顶红毒', flat: 50 },
        14: { pal: 557, side: 'player', name: '孔雀胆毒', flat: 50 },
        15: { pal: 558, side: 'player', name: '血海棠毒', flat: 50 },
        16: { pal: 559, side: 'player', name: '断肠草毒', flat: 50 },
        17: { pal: 560, side: 'player', name: '金蚕蛊毒', flat: 50 },

        // ---- 敌方毒 ----
        35: { pal: 551, side: 'enemy', name: '赤毒·敌', flat: 7 },
        36: { pal: 552, side: 'enemy', name: '尸毒·敌', flat: 12 },
        37: { pal: 553, side: 'enemy', name: '瘴毒·敌', flat: 20 },
        38: { pal: 554, side: 'enemy', name: '毒丝·敌', flat: 32 },
        25: { pal: 555, side: 'enemy', name: '三尸蛊毒·敌', ladder: [0, 111, 222, 333], finalCure: true },
        26: { pal: 556, side: 'enemy', name: '鹤顶红毒·敌', flat: 100 },
        27: { pal: 557, side: 'enemy', name: '孔雀胆毒·敌', flat: 100 },
        28: { pal: 558, side: 'enemy', name: '血海棠毒·敌', flat: 100 },
        29: { pal: 559, side: 'enemy', name: '断肠草毒·敌', flat: 100 },
        30: { pal: 560, side: 'enemy', name: '金蚕蛊毒·敌', flat: 100 },
        39: { pal: 561, side: 'enemy', name: '食妖虫附·敌', ladder: [0, 1, 2, 3, 4, 5, 6, 7, 8, 0], breed: 15, finalCure: true },
        40: { pal: 562, side: 'enemy', name: '碧血蚕附·敌', ladder: [0, 1, 2, 3, 4, 5, 6, 7, 8, 0], breed: 11, finalCure: true }
    };

    // 毒等级（Objects.csv Word0），供 0x002C「按等级解毒」使用
    const POISON_LEVEL = {
        551: 0, 552: 1, 553: 1, 554: 2,
        555: 3, 556: 3, 557: 3, 558: 3, 559: 3, 560: 3,
        561: 4, 562: 4
    };

    // 无影毒：不是状态，而是 0x005A（我方体力减半）/ 0x005B（敌方体力减半，上限 1000）
    const HALVE_ITEM_ID = 93;
    const HALVE_ENEMY_CAP = 1000;

    PalPoison.def = function (stateId) { return POISON[stateId] || null; };
    PalPoison.all = function () { return POISON; };
    PalPoison.levelOf = function (stateId) {
        const def = POISON[stateId];
        return def ? (POISON_LEVEL[def.pal] || 0) : -1;
    };
    PalPoison.isPoisonState = function (stateId) { return !!POISON[stateId]; };

    //=============================================================================
    // 毒 → 物品：「以毒攻毒」解除关系（0x005D 判定 + 0x002B 解毒）
    //   使用 X → 若我方身上有列表里的毒，则解除（可多种）
    //=============================================================================

    const ITEM_CURE = {
        1:  [21],                 // 糯米糕 → 解 尸毒
        22: [20],                 // 酒     → 解 赤毒
        40: [20],                 // 盐巴   → 解 赤毒
        41: [20],                 // 雄黄   → 解 赤毒
        42: [21],                 // 糯米   → 解 尸毒
        43: [20, 22],             // 雄黄酒 → 解 赤毒 + 瘴毒
        44: [20, 22, 21],         // 净衣符 → 解 赤毒 + 瘴毒 + 尸毒
        89: [15],                 // 鹤顶红 → 解 血海棠毒
        90: [17],                 // 孔雀胆 → 解 金蚕蛊毒
        91: [16],                 // 血海棠 → 解 断肠草毒
        92: [12],                 // 断肠草 → 解 三尸蛊毒
        94: [14],                 // 三尸蛊 → 解 孔雀胆毒
        95: [13]                  // 金蚕蛊 → 解 鹤顶红毒
    };

    // 按等级解毒（0x002C）：鬼枯藤 / 九节菖蒲 = 2 级以下；毒龙胆 = 3 级以下
    const ITEM_CURE_LEVEL = {
        45: 2,   // 鬼枯藤（另 DB 自带 HP-30）
        46: 2,   // 九节菖蒲
        47: 3    // 毒龙胆
    };

    //=============================================================================
    // 物品 → 毒：投掷（对敌，0x0028）/ 使用（对己，0x0029）
    //=============================================================================

    const THROW_POISON = {
        81: 35, 82: 35, 83: 35, 84: 35, 85: 35,   // 毒蛇卵/毒蝎卵/毒蟾卵/蜘蛛卵/蜈蚣卵 → 赤毒
        86: 36,                                   // 尸腐肉 → 尸毒
        87: 37,                                   // 腹蛇涎 → 瘴毒
        88: 38,                                   // 缠魂丝 → 毒丝
        89: 26,                                   // 鹤顶红 → 鹤顶红毒
        90: 27,                                   // 孔雀胆 → 孔雀胆毒
        91: 28,                                   // 血海棠 → 血海棠毒
        92: 29,                                   // 断肠草 → 断肠草毒
        94: 25,                                   // 三尸蛊 → 三尸蛊毒
        95: 30,                                   // 金蚕蛊 → 金蚕蛊毒
        103: 39,                                  // 食妖虫 → 食妖虫附
        104: 40,                                  // 碧血蚕 → 碧血蚕附
        70: 35,                                   // 赤蝎粉 → 赤毒（全体）
        71: 37                                    // 毒龙砂 → 瘴毒（全体，另 55 固定伤害）
    };
    // 全体投掷（0x0028 的 operand[0] ≠ 0）
    const THROW_POISON_ALL = { 70: true, 71: true };

    const USE_POISON = {
        81: 20, 82: 20, 83: 20, 84: 20, 85: 20,   // 毒蛇卵等 → 我方赤毒
        86: 21,                                   // 尸腐肉 → 尸毒
        87: 22,                                   // 腹蛇涎 → 瘴毒
        88: 23,                                   // 缠魂丝 → 毒丝
        89: 13,                                   // 鹤顶红 → 鹤顶红毒
        90: 14,                                   // 孔雀胆 → 孔雀胆毒
        91: 15,                                   // 血海棠 → 血海棠毒
        92: 16,                                   // 断肠草 → 断肠草毒
        94: 12,                                   // 三尸蛊 → 三尸蛊毒
        95: 17                                    // 金蚕蛊 → 金蚕蛊毒
    };

    //=============================================================================
    // 相克关系：施加的毒 + 目标【已有】的相克毒 → 立即死亡
    //   敌方版 = COMBO_KO_ENEMY（0x005E + 0x0060，投掷时判定）
    //   我方版 = COMBO_KO_SELF（0x005D + 0x005F，对自己用蛊时判定）
    //   三尸蛊毒 ⇔ 血海棠毒   金蚕蛊毒 ⇔ 断肠草毒   鹤顶红毒 ⇔ 孔雀胆毒
    //=============================================================================

    const COMBO_KO_ENEMY = {
        25: 28, 28: 25,   // 三尸蛊毒 ⇔ 血海棠毒
        30: 29, 29: 30,   // 金蚕蛊毒 ⇔ 断肠草毒
        26: 27, 27: 26    // 鹤顶红毒 ⇔ 孔雀胆毒
    };

    // 物品 ID → 我方若已中该毒，则使用此蛊会暴毙
    const COMBO_KO_SELF = {
        89: 14,   // 鹤顶红 + 已有孔雀胆毒 → 暴毙
        90: 13,   // 孔雀胆 + 已有鹤顶红毒 → 暴毙
        91: 12,   // 血海棠 + 已有三尸蛊毒 → 暴毙
        92: 17,   // 断肠草 + 已有金蚕蛊毒 → 暴毙
        94: 15,   // 三尸蛊 + 已有血海棠毒 → 暴毙
        95: 16    // 金蚕蛊 + 已有断肠草毒 → 暴毙
    };

    PalPoison.throwPoisonState = function (itemId) { return THROW_POISON[itemId] || 0; };
    PalPoison.throwPoisonAll = function (itemId) { return !!THROW_POISON_ALL[itemId]; };
    PalPoison.usePoisonState = function (itemId) { return USE_POISON[itemId] || 0; };
    PalPoison.cureStates = function (itemId) { return ITEM_CURE[itemId] || null; };
    PalPoison.cureLevel = function (itemId) { return ITEM_CURE_LEVEL[itemId] || 0; };

    //=============================================================================
    // 每回合结算
    //=============================================================================

    const turnKey = "_palPoisonTurn";

    PalPoison.turnOf = function (battler, stateId) {
        if (!battler[turnKey]) battler[turnKey] = {};
        return battler[turnKey][stateId] || 0;
    };

    PalPoison.clearTurn = function (battler, stateId) {
        if (battler[turnKey]) delete battler[turnKey][stateId];
    };

    // 本回合该毒造成的伤害。返回 null 表示这条不是毒 / 无伤害。
    PalPoison.damageFor = function (stateId, turn) {
        const def = POISON[stateId];
        if (!def) return null;
        if (def.flat !== undefined) return def.flat;
        if (def.ladder) return def.ladder[Math.min(turn, def.ladder.length - 1)];
        return null;
    };

    // 是否已走到阶梯最后一档（最后一档同时触发 finalCure / breed）
    PalPoison.isLadderDone = function (stateId, turn) {
        const def = POISON[stateId];
        if (!def || !def.ladder) return false;
        return turn >= def.ladder.length - 1;
    };

    // 统一的「立即死亡」处理（0x005F / 0x0060）
    PalPoison.kill = function (battler) {
        if (!battler || battler.hp <= 0) return;
        battler.setHp(0);
        battler.addState(battler.deathStateId());
        if (battler.performCollapse) battler.performCollapse();
    };

    PalPoison.applyPoisonDamage = function (battler) {
        if (!battler || battler.isDead()) return;
        let dot = 0;
        const cured = [];
        const bred = [];

        const states = battler.states();
        const alive = {};
        for (const state of states) {
            if (state) alive[state.id] = true;
        }
        // 清掉已经不在身上的毒的回合计数（被外部效果解掉时防残留）
        if (battler[turnKey]) {
            for (const id of Object.keys(battler[turnKey])) {
                if (!alive[id]) delete battler[turnKey][id];
            }
        }

        for (const state of states) {
            if (!state) continue;
            const def = POISON[state.id];
            if (!def) continue;

            const turn = PalPoison.turnOf(battler, state.id);
            const dmg = PalPoison.damageFor(state.id, turn);
            if (dmg) dot += dmg;

            // 走到阶梯最后一档 → 暴毙 / 养蛊产出 / 自动解除
            if (PalPoison.isLadderDone(state.id, turn)) {
                if (def.breed) bred.push(def.breed);
                if (def.finalCure) cured.push(state.id);
            }
            battler[turnKey][state.id] = turn + 1;
        }

        for (const id of cured) {
            battler.removeState(id);
            PalPoison.clearTurn(battler, id);
        }
        // 养蛊成熟：产出物品（0x001F）并自动解除
        for (const itemId of bred) {
            const item = $dataItems[itemId];
            if (item) $gameParty.gainItem(item, 1);
        }

        if (dot <= 0 || battler.hp <= 0) return;
        dot = Math.min(dot, battler.hp);
        battler.gainHp(-dot);
        const result = battler.result();
        result.hpDamage = dot;
        result.used = true;
        if (battler.startDamagePopup) battler.startDamagePopup();
        if (battler.hp <= 0) PalPoison.kill(battler);
    };

    //=============================================================================
    // 接管 palBattleCore 的毒结算（保留原函数作为没有毒表时的兜底）
    //=============================================================================

    if (PalBattleCore) {
        PalBattleCore.applyPoisonDamage = PalPoison.applyPoisonDamage;
    }

    //=============================================================================
    // 物品效果：投掷上毒 + 相克即死；使用 解毒 / 暴毙 / 炼蛊上毒 / 按等级解毒
    //=============================================================================

    PalPoison.applyThrow = function (subject, target, item) {
        if (!item || !target || !target.isAlive()) return;
        const itemId = item.id;

        // 无影毒：敌方体力减半（0x005B，上限 1000）
        if (itemId === HALVE_ITEM_ID && target.isEnemy()) {
            const w = Math.min(Math.floor(target.hp / 2) + 1, HALVE_ENEMY_CAP);
            target.gainHp(-Math.min(w, target.hp));
            return;
        }

        const stateId = THROW_POISON[itemId];
        if (!stateId) return;
        const def = POISON[stateId];
        if (!def || def.side !== 'enemy' || !target.isEnemy()) return;

        target.addState(stateId);
        PalPoison.clearTurn(target, stateId);

        // 蛊相克即死（0x005E 判定 + 0x0060）
        const need = COMBO_KO_ENEMY[stateId];
        if (need && target.isStateAffected(need)) {
            PalPoison.kill(target);
        }
    };

    PalPoison.applyUse = function (subject, target, item) {
        if (!item || !target || !target.isActor()) return;
        const itemId = item.id;

        // 无影毒：我方体力减半（0x005A）
        if (itemId === HALVE_ITEM_ID) {
            target.setHp(Math.floor(target.hp / 2));
            return;
        }

        // ① 以毒攻毒：身上真有该毒才解（0x005D 判定 + 0x002B）
        const cureList = ITEM_CURE[itemId];
        if (cureList) {
            let cured = false;
            for (const id of cureList) {
                if (target.isStateAffected(id)) {
                    target.removeState(id);
                    PalPoison.clearTurn(target, id);
                    cured = true;
                }
            }
            if (cured) return;
        }

        // ② 按等级解毒（0x002C）
        const maxLevel = ITEM_CURE_LEVEL[itemId];
        if (maxLevel) {
            for (const state of target.states()) {
                if (!state) continue;
                const lv = PalPoison.levelOf(state.id);
                if (lv >= 0 && lv <= maxLevel) {
                    target.removeState(state.id);
                    PalPoison.clearTurn(target, state.id);
                }
            }
            return;
        }

        // ③ 相克暴毙：身上有相克之毒 → 立即死亡（0x005D 判定 + 0x005F）
        const koState = COMBO_KO_SELF[itemId];
        if (koState && target.isStateAffected(koState)) {
            PalPoison.kill(target);
            return;
        }

        // ④ 否则是「炼蛊」：使用 → 给自己上毒（0x0029）
        const stateId = USE_POISON[itemId];
        if (!stateId) return;
        const def = POISON[stateId];
        if (!def || def.side !== 'player') return;
        target.addState(stateId);
        PalPoison.clearTurn(target, stateId);
    };

    //=============================================================================
    // 挂钩：物品结算完走毒逻辑
    //=============================================================================

    const _apply = Game_Action.prototype.apply;
    Game_Action.prototype.apply = function (target) {
        const result = _apply.call(this, target);
        if (this.isItem() && target) {
            const item = this.item();
            if (item) {
                if (this._palThrow) {
                    PalPoison.applyThrow(this.subject(), target, item);
                } else {
                    PalPoison.applyUse(this.subject(), target, item);
                }
            }
        }
        return result;
    };

    //=============================================================================
    // 调试入口
    //=============================================================================

    window.PAL98_POISON = {
        defs: POISON,
        levels: POISON_LEVEL,
        comboKOEnemy: COMBO_KO_ENEMY,
        comboKOSelf: COMBO_KO_SELF,
        throwPoison: THROW_POISON,
        throwAll: THROW_POISON_ALL,
        usePoison: USE_POISON,
        itemCure: ITEM_CURE,
        itemCureLevel: ITEM_CURE_LEVEL
    };

})();
