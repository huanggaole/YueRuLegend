/*:
 * @target MZ
 * @plugindesc [v1.0] 仙剑98柔情版特殊道具/仙术（灵葫咒收妖+紫金葫芦炼药/隐蛊真隐身/金蝉脱壳/傀儡虫）+ 鞭类全体普攻递减
 * @author AI Assistant
 *
 * @help
 * 全部对照 sdlpal script.c 的指令语义复刻：
 *
 * 【灵葫咒】（技能 90，mid 84，Scripts.json 43113-43116）
 *   0x0064：敌人体力 > 25% → 失败
 *   0x0006：RandomLong(1,100) >= 60 → 失败（成功 59%）
 *   0x0033：敌人 wCollectValue==0 → 失败；否则灵葫值 += wCollectValue
 *   0x0060：敌人立即死亡
 *   失败文案 = 原版 msg 13364「失败　没有效果」
 *
 * 【紫金葫芦】（道具 59，script.c 0x0034 PAL_CLASSIC 分支）
 *   灵葫值 <= 0 → 失败；否则 i=RandomLong(1,灵葫值) 封顶 9，
 *   得到商店0号第 i 格商品 ×1，灵葫值 -= i。
 *   炼药表由 tools/pal_export_enemy_scripts.py 从 Stores.csv 导出
 *  （PalEnemyScripts.json 的 store0），原版文案 word 42「炼出」。
 *
 * 【隐蛊】（道具 52，Scripts.json 39507: 0x005C operand 3）
 *   全队隐身 3 回合：敌人全体停摆、敌方脚本停摆（fight.c 1213/1680/1716）。
 *   回合计数寄存在 $gameTroop._palHiding，由 palBattleEnemyScript.js 消费，
 *   每场战斗开始清零。
 *
 * 【金蝉脱壳】（技能 98，Scripts.json 43142: 0x003A）
 *   Boss 战（事件未勾选可逃跑）→ 失败；否则必逃成功。
 *
 * 【傀儡虫】（道具 51，Scripts.json 39522: 0x002D 状态4傀儡×9回合）
 *   对死亡队员使用：复活为 1 体力 + 「傀儡」状态（自动战斗）9 回合。
 *   状态由 tools/pal_patch_special_arts.py 追加（备注 <palPuppet>）。
 *   ⚠ 原版傀儡是 0 血出战，MZ 引擎做不到，近似为 1 血。
 *
 * 【全体普攻递减】（fight.c 3681-3730）
 *   武器备注 <AOE>（长鞭/九截鞭/金蛇鞭/玄冥宝刀）的普攻命中全体敌人，
 *   每多打一个敌人伤害 ÷2（原版站位序 [2,1,0,4,3]，这里按部队顺序近似）。
 *
 * 必须排在 palBattleCore.js / palBattleSkillFx.js / palBattleEnemyScript.js 之后。
 */

(() => {
    const PalSA = (window.PalSpecialArts = {});

    const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));

    const LINGHU_SKILL_ID = 90;    // 灵葫咒
    const CICADA_SKILL_ID = 98;    // 金蝉脱壳
    const PUPPET_ITEM_ID = 51;     // 傀儡虫
    // 隐蛊 / 紫金葫芦按名字索引（道具顺序可能被编辑器调整过，名字更稳）
    const itemIdByName = name => {
        const it = $dataItems.find(i => i && i.name === name);
        return it ? it.id : 0;
    };

    const FAIL_TEXT = "失败　没有效果"; // 原版 msg 13364

    PalSA.battleLog = function (text) {
        const lw = BattleManager._logWindow;
        if (lw) {
            lw.push("addText", text);
            lw.push("wait");
        }
    };

    // 菜单场景的文字反馈：画在物品说明窗上（下一次光标移动刷新时消失）
    PalSA.menuToast = function (text) {
        const scene = SceneManager._scene;
        const w = scene && scene._helpWindow;
        if (w && w.contents) {
            w.contents.clear();
            w.drawText(text, 0, 0, w.contentsWidth(), "left");
        }
    };

    PalSA.toast = function (text) {
        if ($gameParty.inBattle()) PalSA.battleLog(text);
        else PalSA.menuToast(text);
    };

    const puppetStateId = () => {
        const st = $dataStates.find(s => s && /<palPuppet>/.test(s.note || ""));
        return st ? st.id : 0;
    };

    //=========================================================================
    // 灵葫咒收妖（0x0064 / 0x0006 / 0x0033 / 0x0060）
    //=========================================================================

    PalSA.tryCollect = function (action, target) {
        if (target.hp * 100 > target.mhp * 25) return false; // 体力 > 25% → 失败
        if (randInt(1, 100) >= 60) return false;             // 0x0006 门
        const meta = PalBattleCore.enemyMeta(target);
        const cv = meta ? (meta.collect || 0) : 0;
        if (!cv) return false;                               // wCollectValue==0 → 失败
        $gameParty._palCollect = ($gameParty._palCollect || 0) + cv;
        target.setHp(0);
        target.addState(target.deathStateId());
        target.performCollapse();
        return true;
    };

    //=========================================================================
    // 紫金葫芦炼药（0x0034）
    //=========================================================================

    PalSA.transmute = function () {
        const cv = $gameParty._palCollect || 0;
        if (cv <= 0) return null;
        let i = randInt(1, cv);
        if (i > 9) i = 9;
        $gameParty._palCollect = cv - i;
        const d = window.$palEnemyScripts;
        const ent = d && d.store0 ? d.store0[i - 1] : null;
        if (!ent) return null;
        const item = ent[0] === "weapon" ? $dataWeapons[ent[1]]
            : ent[0] === "armor" ? $dataArmors[ent[1]]
                : $dataItems[ent[1]];
        if (!item) return null;
        $gameParty.gainItem(item, 1);
        return item;
    };

    //=========================================================================
    // 挂载：仙术/道具结算
    //=========================================================================

    const _Game_Action_apply = Game_Action.prototype.apply;
    Game_Action.prototype.apply = function (target) {
        const result = _Game_Action_apply.call(this, target);
        const subject = this.subject();
        if (!subject || !subject.isActor()) return result;

        // ---- 灵葫咒 ----
        if (this.isSkill() && this.item().id === LINGHU_SKILL_ID &&
            target && target.isEnemy() && target.isAlive()) {
            if (!PalSA.tryCollect(this, target)) {
                PalSA.battleLog(FAIL_TEXT);
            }
            return result;
        }

        // ---- 金蝉脱壳 ----
        if (this.isSkill() && this.item().id === CICADA_SKILL_ID) {
            if (BattleManager.canEscape()) {
                $gameParty.performEscape();
                SoundManager.playEscape();
                BattleManager.onEscapeSuccess();
            } else {
                PalSA.battleLog(FAIL_TEXT); // 原版：Boss 战跳失败分支
            }
            return result;
        }

        // ---- 道具 ----
        if (this.isItem()) {
            const id = this.item().id;
            // 隐蛊：全队隐身 3 回合（敌人停摆由 palBattleEnemyScript 消费）
            if (id === itemIdByName("隐蛊") && $gameParty.inBattle()) {
                $gameTroop._palHiding = 3;
                PalSA.battleLog("大家隐去了身形！");
                return result;
            }
            // 傀儡虫：死者复活为 1 血傀儡（原版 0 血出战，MZ 近似 1 血）
            if (id === PUPPET_ITEM_ID && target && target.isActor() && target.isDead()) {
                const sid = puppetStateId();
                target.removeState(target.deathStateId());
                target.setHp(1);
                if (sid) {
                    target.addState(sid);
                    target._stateTurns[sid] = 9;
                }
                return result;
            }
            // 紫金葫芦：灵葫值炼药
            if (id === itemIdByName("紫金葫芦")) {
                const got = PalSA.transmute();
                PalSA.toast(got ? "炼出了" + got.name + "！" : FAIL_TEXT);
                return result;
            }
        }
        return result;
    };

    //=========================================================================
    // 隐身回合计数：每回合开始 -1，归零时现形（原版 iHidingTime 按时间表减，
    // ×20 时间单位 ≈ 一整轮，这里按整回合近似）
    //=========================================================================

    const _BattleManager_startTurn = BattleManager.startTurn;
    BattleManager.startTurn = function () {
        _BattleManager_startTurn.call(this);
        if (($gameTroop._palHiding | 0) > 0) {
            $gameTroop._palHiding--;
            if ($gameTroop._palHiding === 0) PalSA.battleLog("大家现出了身形！");
        }
    };

    //=========================================================================
    // 鞭类全体普攻 + 递减（fight.c 3681-3730）
    //   division 从 1 开始，每打一个敌人 ×2；原版站位序 [2,1,0,4,3]，
    //   这里按部队顺序近似；会心与随机浮动仍是逐目标判定（原版是整轮一次，
    //   偏差已在报告中注明）。
    //=========================================================================

    PalSA.isAoeAttack = function (action) {
        const s = action.subject();
        return action.isAttack() && s && s.isActor() &&
            s.weapons().some(w => w && /<AOE>/i.test(w.note || ""));
    };

    const _Game_Action_makeTargets = Game_Action.prototype.makeTargets;
    Game_Action.prototype.makeTargets = function () {
        if (PalSA.isAoeAttack(this)) {
            this._palAoeDiv = 1;
            return this.repeatTargets($gameTroop.aliveMembers());
        }
        return _Game_Action_makeTargets.call(this);
    };

    const _Game_Action_apply2 = Game_Action.prototype.apply;
    Game_Action.prototype.apply = function (target) {
        if (this._palAoeDiv !== undefined && PalSA.isAoeAttack(this)) {
            this._palAoeDivNow = this._palAoeDiv;
            this._palAoeDiv *= 2; // 每打一个 ×2
        } else {
            this._palAoeDivNow = 0;
        }
        return _Game_Action_apply2.call(this, target);
    };

    const _Game_Action_makeDamageValue = Game_Action.prototype.makeDamageValue;
    Game_Action.prototype.makeDamageValue = function (target, critical) {
        let dmg = _Game_Action_makeDamageValue.call(this, target, critical);
        if (this._palAoeDivNow > 1) {
            dmg = Math.max(1, Math.floor(dmg / this._palAoeDivNow));
        }
        return dmg;
    };

})();
