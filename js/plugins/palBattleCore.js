/*:
 * @target MZ
 * @plugindesc [v1.0] 仙剑98柔情版战斗核心机制（五行相克/原版伤害公式/逃跑判定/中毒/敌方AI）
 * @author AI Assistant
 *
 * @param defaultBattleback
 * @desc 默认战斗背景图（img/battlebacks1 下的文件名，不含扩展名）。地图未指定背景时使用。
 * @default Fbp_10-1
 *
 * @param poisonRate
 * @type number
 * @min 1
 * @desc 毒每回合造成 最大体力/N 的伤害（仙剑98原版为16）
 * @default 16
 *
 * @help
 * 本插件复刻仙剑奇侠传98柔情版的战斗机制，需与 palBattle.js 配合使用，
 * 并必须排在 palBattle.js 之后加载。
 *
 * ===== 数据来源 =====
 * 战斗数据由 tools/pal_convert_battle_data.py 从逆向工程数据生成：
 * - 技能备注 <pal:{"mid":魔法编号,"base":基础伤害,"elem":五行}>（elem: 1风 2雷 3水 4火 5土 6毒）
 * - 敌人备注 <pal:{...}>（等级/物理抗性/五行抗性/中毒抗性/AI/偷窃等）
 * - 数据库最后一条技能（id=236）为“攻击”基本行动，供普攻使用
 *
 * ===== 复刻的机制（对照 sdlpal fight.c） =====
 * 1. 基础伤害：攻>防 → 攻×2-防×1.6；攻>防×0.6 → 攻-防×0.6；否则 0
 * 2. 我方普攻：str=武力，def=敌防御+(等级+6)×4，再除以敌方物理抗性；
 *    1/6 会心×3，李逍遥 1/12 追加攻击×2，最后×(1~1.125)随机浮动，至少1
 * 3. 敌方普攻：str=敌方武力+(等级+6)×6+rand(0,2)，def=我方防御×2，固定抗性2，
 *    +rand(0,1)，至少1
 * 4. 仙术伤害：str=灵力×(1~1.1)（敌方再加(等级+6)×6），
 *    base伤害=str按基础公式算/4+仙术基础伤害；
 *    五行抗性（0~10，5为中性）：×(10-抗性)/5；
 *    我方被仙术攻击时抗性按0~100计：×(1-抗性/100)
 * 5. 逃跑：逃跑率 >= rand(0, 敌方Σ(身法+(等级+6)×4)) 则成功；Boss战禁止逃跑
 * 6. 中毒：每回合损失 最大体力/16（至少1），可致死
 * 7. 敌方AI：每回合以 magicRate/10 概率施放仙术（被封咒时只能普攻）
 * 8. 伤害数字配色：伤害黄色、回复蓝色（仙剑98风格）
 *
 * 部队备注：<palBoss> 标记BOSS（禁止逃跑）；<palBattleback:文件名> 指定该部队战斗背景。
 * 角色备注：<palRes:[风,雷,水,火,土,毒]> 设置角色五行抗性（0~100，0=不抗性）。
 */

(() => {
    const PalBattleCore = (window.PalBattleCore = {});
    const PLUGIN_PARAMS = PluginManager.parameters("palBattleCore");
    const DEFAULT_BATTLEBACK = String(PLUGIN_PARAMS.defaultBattleback || "Fbp_10-1");
    const POISON_RATE = Number(PLUGIN_PARAMS.poisonRate || 16);
    const SEAL_STATE_ID = 6; // 咒封（沉默）
    const BASIC_ATTACK_SKILL_ID = 236; // 数据转换脚本追加的“攻击”基本技能

    //=============================================================================
    // 工具函数
    //=============================================================================

    const randFloat = (a, b) => a + Math.random() * (b - a);
    const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));

    const _metaCache = new WeakMap();
    PalBattleCore.parseMeta = function (databaseObject) {
        if (!databaseObject || !databaseObject.note) return null;
        let meta = _metaCache.get(databaseObject);
        if (meta !== undefined) return meta;
        const m = databaseObject.note.match(/<pal:(\{.*?\})>/s);
        meta = m ? JSON.parse(m[1]) : null;
        _metaCache.set(databaseObject, meta);
        return meta;
    };

    PalBattleCore.enemyMeta = function (battler) {
        if (!battler || !battler.enemy || !battler.enemy()) return null;
        return PalBattleCore.parseMeta(battler.enemy());
    };

    // 角色五行抗性 <palRes:[风,雷,水,火,土,毒]>（0~100）
    PalBattleCore.actorElementResist = function (actor, palElem) {
        const m = /<palRes:\[([-\d,]+)\]>/.exec(actor.actor().note || "");
        if (!m) return 0;
        const arr = m[1].split(",").map(Number);
        return arr[palElem - 1] || 0;
    };

    //=============================================================================
    // 仙剑98原版伤害公式（对照 sdlpal fight.c）
    //=============================================================================

    // PAL_CalcBaseDamage
    PalBattleCore.baseDamage = function (atk, def) {
        if (atk > def) return Math.floor(atk * 2 - def * 1.6 + 0.5);
        if (atk > def * 0.6) return Math.floor(atk - def * 0.6 + 0.5);
        return 0;
    };

    // 物理攻击（普攻）
    PalBattleCore.physicalDamage = function (subject, target) {
        let str, def, res;
        if (subject.isActor()) {
            // 我方普攻敌人（fight.c 3628-3663）
            const meta = PalBattleCore.enemyMeta(target);
            str = subject.atk;
            def = target.def + ((meta ? meta.lv : 0) + 6) * 4;
            res = meta ? meta.physRes || 0 : 0;
        } else {
            // 敌方普攻我方（fight.c 4880+、5056）
            const meta = PalBattleCore.enemyMeta(subject);
            str = Math.max(0, subject.atk + ((meta ? meta.lv : 0) + 6) * 6) + randInt(0, 2);
            def = target.def * 2;
            res = 2;
        }
        let dmg = PalBattleCore.baseDamage(str, def);
        if (res) dmg = Math.floor(dmg / res);
        if (subject.isActor()) {
            dmg += randInt(1, 2);
            if (randInt(0, 5) === 0) dmg *= 3; // 会心一击（1/6）
            if (subject.actorId() === 1 && randInt(0, 11) === 0) dmg *= 2; // 李逍遥追加攻击（1/12）
            dmg = Math.floor(dmg * randFloat(1, 1.125));
        } else {
            dmg += randInt(0, 1);
        }
        return Math.max(1, dmg);
    };

    // 仙术伤害（PAL_CalcMagicDamage）
    // strOverride：合力值预设（合体技 Σ(武力+灵力)/4，fight.c 3982-3995），传入时跳过灵力计算
    PalBattleCore.magicDamage = function (subject, target, pal, strOverride) {
        let str;
        if (strOverride !== undefined) {
            str = strOverride * randFloat(1, 1.1);
        } else {
            const atkLv = subject.isActor() ? 0 : (PalBattleCore.enemyMeta(subject) || { lv: 0 }).lv;
            str = (subject.mat + (subject.isActor() ? 0 : (atkLv + 6) * 6)) * randFloat(1, 1.1);
        }
        let def;
        if (target.isActor()) {
            def = target.def; // 我方被仙术攻击时只用防御，无等级加成（fight.c 4790/4825）
        } else {
            const meta = PalBattleCore.enemyMeta(target);
            def = target.def + ((meta ? meta.lv : 0) + 6) * 4;
        }
        let dmg = Math.floor(PalBattleCore.baseDamage(str, def) / 4) + (pal.base || 0);
        const elem = pal.elem || 0;
        if (elem >= 1 && elem <= 5) {
            // 五行：风1 雷2 水3 火4 土5
            if (target.isActor()) {
                dmg = Math.floor((dmg * (100 - PalBattleCore.actorElementResist(target, elem))) / 100);
            } else {
                const meta = PalBattleCore.enemyMeta(target);
                const er = meta && meta.elemRes ? meta.elemRes[elem - 1] : 5;
                dmg = Math.floor((dmg * (10 - er)) / 5);
            }
        } else if (elem >= 6) {
            // 毒系仙术按毒抗计算
            if (target.isActor()) {
                dmg = Math.floor((dmg * (100 - PalBattleCore.actorElementResist(target, 6))) / 100);
            } else {
                const meta = PalBattleCore.enemyMeta(target);
                const pr = meta ? meta.poisonRes || 0 : 0;
                dmg = Math.floor((dmg * (10 - pr)) / 5);
            }
        }
        return Math.max(1, dmg);
    };

    //=============================================================================
    // Game_Action：接管伤害计算
    //=============================================================================

    const _makeDamageValue = Game_Action.prototype.makeDamageValue;
    Game_Action.prototype.makeDamageValue = function (target, critical) {
        const item = this.item();
        if (this.isAttack()) {
            return PalBattleCore.physicalDamage(this.subject(), target);
        }
        if (this.isSkill()) {
            const pal = PalBattleCore.parseMeta(item);
            if (pal && pal.base !== undefined && item.damage.type === 1) {
                return PalBattleCore.magicDamage(this.subject(), target, pal);
            }
        }
        return _makeDamageValue.call(this, target, critical);
    };

    // 普通攻击使用专用的基本技能（数据库中的技能1“梦蛇”是仙剑仙术，不能当普攻）
    Game_BattlerBase.prototype.attackSkillId = function () {
        return BASIC_ATTACK_SKILL_ID;
    };

    //=============================================================================
    // 逃跑判定（fight.c 4119-4171）
    //=============================================================================

    BattleManager.processEscape = function () {
        $gameParty.performEscape();
        SoundManager.playEscape();
        const actor = this.actor();
        const str = actor ? actor.luk : $gameParty.leader().luk; // 逃跑率
        let def = 0;
        for (const enemy of $gameTroop.members()) {
            if (!enemy || enemy.isDead()) continue;
            const meta = PalBattleCore.enemyMeta(enemy);
            def += enemy.agi + ((meta ? meta.lv : 0) + 6) * 4;
        }
        const isBoss = /<palBoss>/i.test($gameTroop.troop().note || "");
        const success = !isBoss && str >= randInt(0, def);
        if (success) {
            this.onEscapeSuccess();
        } else {
            this.onEscapeFailure();
        }
        return success;
    };

    //=============================================================================
    // 敌方AI：被封咒（状态6）时不能使用仙术（fight.c 4656-4658）
    //=============================================================================

    const _isActionValid = Game_Enemy.prototype.isActionValid;
    Game_Enemy.prototype.isActionValid = function (action) {
        if (action.skillId !== BASIC_ATTACK_SKILL_ID && this.isStateAffected(SEAL_STATE_ID)) {
            return false;
        }
        return _isActionValid.call(this, action);
    };

    //=============================================================================
    // 中毒：每回合损失 最大体力/16（fight.c 毒脚本，可致死）
    //=============================================================================

    PalBattleCore.applyPoisonDamage = function (battler) {
        if (battler.isDead()) return;
        let dot = 0;
        for (const state of battler.states()) {
            if (state && /<palPoison/i.test(state.note || "")) {
                dot += Math.max(1, Math.floor(battler.mhp / POISON_RATE));
            }
        }
        if (dot <= 0 || battler.hp <= 0) return;
        dot = Math.min(dot, battler.hp);
        battler.gainHp(-dot);
        const result = battler.result();
        result.hpDamage = dot;
        result.used = true;
        battler.startDamagePopup();
        if (battler.hp <= 0) {
            battler.addState(battler.deathStateId());
            battler.performCollapse();
        }
    };

    const _endAllBattlersTurn = BattleManager.endAllBattlersTurn;
    BattleManager.endAllBattlersTurn = function () {
        _endAllBattlersTurn.call(this);
        for (const battler of this.allBattleMembers()) {
            PalBattleCore.applyPoisonDamage(battler);
        }
        const scene = SceneManager._scene;
        if (scene && scene._statusWindow) scene._statusWindow.refresh();
    };

    //=============================================================================
    // 战斗背景：部队备注 <palBattleback:文件名> 优先，否则用默认背景
    //=============================================================================

    PalBattleCore.troopBattleback = function () {
        const troop = $gameTroop && $gameTroop.troop && $gameTroop.troop();
        if (!troop) return null;
        const m = /<palBattleback:\s*([^>\s]+)>/i.exec(troop.note || "");
        return m ? m[1] : null;
    };

    const _battleback1Name = Sprite_Battleback.prototype.battleback1Name;
    Sprite_Battleback.prototype.battleback1Name = function () {
        const pal = PalBattleCore.troopBattleback();
        if (pal) return pal;
        return _battleback1Name.call(this) || DEFAULT_BATTLEBACK;
    };

    //=============================================================================
    // 伤害数字配色：伤害=黄色，回复=蓝色（仙剑98风格）
    //=============================================================================

    ColorManager.damageColor = function (colorType) {
        switch (colorType) {
            case 0: // HP伤害
                return "#f8d030";
            case 1: // HP回复
                return "#40c8f8";
            case 2: // MP伤害
                return "#f8d030";
            case 3: // MP回复
                return "#40c8f8";
            default:
                return "#ffffff";
        }
    };

    //=============================================================================
    // 指令确认（逃跑已移到指令盘取消键，见 palBattleCoop.js）
    //=============================================================================

    Window_ActorCommand.prototype.processOk = function () {
        const i = this.index();
        if (!this.isCommandEnabled(i)) {
            this.playBuzzerSound();
            return;
        }
        this.playOkSound();
        this.updateInputData();
        this.callOkHandler();
    };

    //=============================================================================
    // 敌人图片加载失败时在控制台告警（便于排查隐形敌人）
    //=============================================================================

    const _spriteEnemyUpdateBitmap = Sprite_Enemy.prototype.updateBitmap;
    Sprite_Enemy.prototype.updateBitmap = function () {
        _spriteEnemyUpdateBitmap.call(this);
        if (this.bitmap && this.bitmap.isError && this.bitmap.isError()) {
            console.warn(
                '[palBattleCore] 敌人图片加载失败: img/enemies/' +
                this._enemy.battlerName() + '.png（敌人: ' + this._enemy.name() + '）'
            );
        }
    };

    //=============================================================================
    // 战斗内仙术/物品窗口：仿仙剑98列表样式
    //=============================================================================

    Window_BattleSkill.prototype.initialize = function (rect) {
        Window_SkillList.prototype.initialize.call(this, rect);
        this.opacity = 200;
        this.contentsOpacity = 255;
        this.hide();
    };

    Window_BattleSkill.prototype.drawItem = function (index) {
        const skill = this.itemAt(index);
        if (!skill) return;
        const rect = this.itemLineRect(index);
        const costWidth = this.costWidth();
        this.changePaintOpacity(this.isEnabled(skill));
        this.drawItemName(skill, rect.x, rect.y, rect.width - costWidth);
        this.changeTextColor(ColorManager.mpCostColor());
        this.drawText(String(skill.mpCost), rect.x + rect.width - costWidth, rect.y, costWidth, "right");
        this.changePaintOpacity(true);
    };

    Window_BattleSkill.prototype.costWidth = function () {
        return 90;
    };

    Window_BattleItem.prototype.initialize = function (rect) {
        Window_ItemList.prototype.initialize.call(this, rect);
        this.opacity = 200;
        this.hide();
    };

    Window_BattleItem.prototype.drawItem = function (index) {
        const item = this.itemAt(index);
        if (!item) return;
        const rect = this.itemLineRect(index);
        const numWidth = 72;
        this.changePaintOpacity(this.isEnabled(item));
        this.drawItemName(item, rect.x, rect.y, rect.width - numWidth);
        this.drawText("×" + $gameParty.numItems(item), rect.x + rect.width - numWidth, rect.y, numWidth, "right");
        this.changePaintOpacity(true);
    };

    // 窗口位置：屏幕下方居中（不遮挡右侧状态栏与左侧指令按钮）
    Scene_Battle.prototype.skillWindowRect = function () {
        const ww = 480;
        const wh = 320;
        const wx = Math.floor((Graphics.boxWidth - ww) / 2) - 80;
        const wy = Graphics.boxHeight - wh - 130;
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_Battle.prototype.itemWindowRect = function () {
        return this.skillWindowRect();
    };

})();
