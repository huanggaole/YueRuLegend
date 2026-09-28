/*:
 * @plugindesc [v1.0] 仙剑98柔情版战斗音效（按 sdlpal fight.c 时机接入 sfxNNN）
 * @author 马化腾 / 哈里叔叔
 * @help
 * 把原版战斗音效按 PAL98 的时机接进战斗流程。
 *
 * 音效来源：98 柔情版 Sounds.mkf → audio/se/sfx000..sfx504.ogg
 * 音效号来源：
 *   角色  : Data.mkf chunk 3 (PLAYERROLES)，写在 Actors.json 的 note 标签
 *   仙术  : Magics.csv 的 wSound，写在 Skills.json 的 pal JSON 里（"snd"）
 *   敌人  : Enemies.csv 的 w*Sound，写在 Enemies.json 的 pal JSON 里（"se"）
 *   硬编码: 28=用道具 29=合体技起手 45=逃跑
 *
 * 原版调用点对照（sdlpal_source/fight.c，98 版 = gConfig.fIsWIN95 分支）：
 *   2065 我方普攻喊声     rgwAttackSound
 *   2069 我方暴击喊声     rgwCriticalSound
 *   2124 我方挥砍武器音   rgwWeaponSound
 *   2300 用道具           28
 *   2392 我方吟唱(98版)   rgwMagicSound
 *   2501 我方仙术特效音   magic.wSound（98 版在特效第 0 帧）
 *   4695 敌人施法         e.wMagicSound
 *   2929 敌人仙术特效音   magic.wSound（98 版在特效第 0 帧）
 *   4934 敌人普攻         e.wAttackSound
 *   5084 敌人命中/掩护    e.wCallSound / rgwCoverSound
 *    756 敌人倒下         e.wDeathSound
 *   4816 我方死亡         rgwDeathSound
 *    850 我方濒死         rgwDyingSound
 *  battle.c 1397/1459 逃跑  45
 *
 * 敌方音效号在 Enemies.csv 里是 SHORT，负数是原版的「无音效」标记，
 * 本插件对 <=0 的号一律不播（与 98 版源码里的 `!= 0` 判空一致）。
 *
 * @param volume
 * @text 音量
 * @type number
 * @default 90
 *
 * @param muteDefaultSe
 * @text 静音 MZ 默认战斗音
 * @desc 关掉 MZ 自带的受击/Miss/闪避/逃跑音（原版没有这些音）。
 * @type boolean
 * @default true
 */
(() => {
    "use strict";

    const params = PluginManager.parameters("palBattleSe");
    const VOLUME = Number(params.volume || 90);
    const MUTE_DEFAULT_SE = String(params.muteDefaultSe) === "true";

    // 原版战斗帧 40ms（battle.h BATTLE_FPS = 25）
    const BATTLE_MS = 40;

    const Se = {};
    window.PalBattleSe = Se;

    //=========================================================================
    // 基础接口
    //=========================================================================

    // 音效号 → 文件名；<=0 表示原版「无音效」，不播
    Se.file = function (n) {
        n = n | 0;
        if (n <= 0) return null;
        return "sfx" + String(n).padStart(3, "0");
    };

    Se._log = [];
    Se._logEnabled = false;

    Se.play = function (n, vol) {
        const name = Se.file(n);
        if (!name) return false; // <=0 = 原版无音效
        if (Se._logEnabled) {
            Se._log.push({ n: n | 0, name: name, t: performance.now() });
            if (Se._log.length > 200) Se._log.shift();
        }
        // 复用 palBattleCore 已有的播放实现（掩护音已在用），保持一致
        if (window.PalBattleCore && PalBattleCore.playPalSe && vol == null) {
            PalBattleCore.playPalSe(n | 0);
            return true;
        }
        if (!window.AudioManager) return false;
        AudioManager.playSe({
            name: name,
            volume: vol == null ? VOLUME : vol,
            pitch: 100,
            pan: 0
        });
        return true;
    };

    // 定时播放（按原版「第 N 帧」换算成毫秒）
    Se.playAt = function (n, ms) {
        if (!Se.file(n)) return false;
        if (ms > 0) setTimeout(() => Se.play(n), ms);
        else Se.play(n);
        return true;
    };

    // 角色音效（Actors.json 的 <attackSound:37> 之类）
    Se.actor = function (actor, key) {
        if (!actor) return 0;
        if (window.PalBattleCore && PalBattleCore.noteTag) {
            return PalBattleCore.noteTag(actor, key) || 0;
        }
        const a = actor.actor ? actor.actor() : null;
        const m = new RegExp("<" + key + ":\\s*(\\d+)\\s*>", "i")
            .exec((a && a.note) || "");
        return m ? Number(m[1]) : 0;
    };

    // 敌人音效（Enemies.json 的 pal JSON "se":{atk,act,mag,die,call}）
    Se.enemy = function (enemy, key) {
        if (!enemy || !window.PalBattleCore || !PalBattleCore.enemyMeta) return 0;
        const meta = PalBattleCore.enemyMeta(enemy);
        const se = meta && meta.se;
        return (se && se[key]) || 0;
    };

    // 仙术音效（Skills.json 的 pal JSON "snd"）
    Se.skill = function (item) {
        if (!item || !window.PalBattleCore || !PalBattleCore.parseMeta) return 0;
        const meta = PalBattleCore.parseMeta(item);
        return (meta && meta.snd) || 0;
    };

    // 命中延迟：到「特效/武器真正打到目标」那一刻的毫秒数
    Se.hitDelay = function () {
        if (window.PalBattleAnim && PalBattleAnim.popupDelay) {
            return PalBattleAnim.popupDelay() || 0;
        }
        return 0;
    };

    //=========================================================================
    // 静音 MZ 自带的战斗音（原版没有这些）
    //=========================================================================
    if (MUTE_DEFAULT_SE) {
        for (const fn of ["playActorDamage", "playEnemyDamage",
            "playMiss", "playEvasion", "playMagicEvasion",
            "playEscape", "playActorCollapse", "playEnemyCollapse"]) {
            if (SoundManager[fn]) SoundManager[fn] = function () { };
        }
    }

    //=========================================================================
    // 标记「同一回合的第几次行动」
    //
    // fight.c 4932：98 版在敌人【第二次行动】且 wMagic == 0 时，
    // 普攻起手音改用 wMagicSound 而不是 wAttackSound。
    // RMMZ 的双动是引擎特性（traits code 61），makeActionTimes() 返回几次
    // 就生成几个 Game_Action —— 这里在生成时按序打上编号。
    //=========================================================================
    const _makeActions = Game_Battler.prototype.makeActions;
    Game_Battler.prototype.makeActions = function () {
        _makeActions.call(this);
        const list = this._actions || [];
        for (let i = 0; i < list.length; i++) list[i]._palActionIndex = i;
    };

    //=========================================================================
    // 我方行动
    //=========================================================================
    const _actorPerformAction = Game_Actor.prototype.performAction;
    Game_Actor.prototype.performAction = function (action) {
        _actorPerformAction.call(this, action);
        if (!action) return;

        // 普攻：fight.c 2124，挥砍帧播武器音
        //（喊声 attackSound / criticalSound 在结算后由 displayDamage 播，见下）
        if (action.isAttack && action.isAttack()) {
            Se.playAt(Se.actor(this, "weaponSound"), Se.hitDelay());
            return;
        }

        // 用道具：fight.c 2300（PAL_BattleShowPlayerUseItemAnim），前移 4 帧后播 28
        // 投掷道具：fight.c 4351（kBattleActionThrowItem），前移 4 帧 + delay 2 帧，
        //           摆吟唱帧 5 时播的是 rgwMagicSound —— 与「使用」不是同一个音
        if (action.isItem && action.isItem()) {
            if (action._palThrow) Se.playAt(Se.actor(this, "magicSound"), 6 * BATTLE_MS);
            else Se.playAt(28, 4 * BATTLE_MS);
            return;
        }

        // 仙术：fight.c 2392（98 版在吟唱帧 5）+ 2501（特效第 0 帧 = 释放点）
        // 注意：MZ 里「普通攻击」也算 skill（isSkill() 恒 true），
        // 所以只能用「是否带 pal meta」来判定是不是仙剑仙术。
        const item = action.item();
        const pal = item && window.PalBattleCore && PalBattleCore.parseMeta
            ? PalBattleCore.parseMeta(item) : null;
        if (pal) {
            if (action._palCoop) return; // 合体技起手音由 palBattleCoop 负责（29）
            Se.playAt(Se.actor(this, "magicSound"), 6 * BATTLE_MS);
            Se.playAt(Se.skill(item), Se.hitDelay());
        }
    };

    // 我方普攻：挥砍帧播武器音（fight.c 2124）
    const _actorPerformAttack = Game_Actor.prototype.performAttack;
    Game_Actor.prototype.performAttack = function () {
        _actorPerformAttack.call(this);
        Se.playAt(Se.actor(this, "weaponSound"), Se.hitDelay());
    };

    //=========================================================================
    // 敌人行动
    //=========================================================================
    const _enemyPerformAction = Game_Enemy.prototype.performAction;
    Game_Enemy.prototype.performAction = function (action) {
        _enemyPerformAction.call(this, action);
        if (!action) return;
        const isPalMagic = action.isSkill() && action.item() &&
            window.PalBattleCore && PalBattleCore.parseMeta(action.item());
        if (isPalMagic) {
            // fight.c 4695：前移 2 帧后播 e.wMagicSound
            Se.playAt(Se.enemy(this, "mag"), 2 * BATTLE_MS);
            // fight.c 2929：特效第 0 帧播 magic.wSound
            Se.playAt(Se.skill(action.item()), Se.hitDelay());
        } else {
            const meta = window.PalBattleCore ? PalBattleCore.enemyMeta(this) : null;
            // fight.c 4932（98 版专属分支）：
            //   fIsSecond && e.wMagic == 0 → 用 wMagicSound 顶替 wAttackSound。
            //   判定必须用 wMagic 本身（meta.mg），不能用 magicRate —— 有 1 条敌人两者不一致。
            const second = action._palActionIndex > 0;
            const noMagic = !meta || (meta.mg || 0) === 0;
            const atkSe = (second && noMagic) ? Se.enemy(this, "mag") : Se.enemy(this, "atk");
            Se.playAt(atkSe, 0);

            // fight.c 5003：普攻起手动作音 e.wActionSound。
            //   位置在「wMagicFrames 段动画 + 补步」之后、冲向目标之前，
            //   也就是命中前一帧（98 版要求 != 0 才播；Se.play 对 <=0 自动跳过）。
            Se.playAt(Se.enemy(this, "act"), Math.max(0, Se.hitDelay() - BATTLE_MS));

            // fight.c 5084：命中瞬间 e.wCallSound（被掩护时是 coverSound，
            // 那条由 palBattleAnim.runCover 处理）
            Se.playAt(Se.enemy(this, "call"), Se.hitDelay());
        }
    };

    //=========================================================================
    // 命中结算：普攻喊声 / 暴击 / 死亡 / 濒死
    //（原版这些都在伤害算出之后，与本项目 apply 后的时机一致）
    //=========================================================================
    const _displayDamage = Window_BattleLog.prototype.displayDamage;
    Window_BattleLog.prototype.displayDamage = function (target) {
        _displayDamage.call(this, target);

        const result = target.result();
        const subject = BattleManager._subject;
        const action = BattleManager._action;

        // 我方普攻喊声：普通 attackSound / 暴击 criticalSound（fight.c 2065/2069）
        // ⚠ 混乱打队友时【不喊】（fight.c 3760-3855 整段只有一处 rgwWeaponSound）
        if (subject && subject.isActor && subject.isActor() && action &&
            action.isAttack && action.isAttack() && !action._palAttackMate &&
            !subject._palAtkSeDone) {
            subject._palAtkSeDone = true;
            Se.play(result.critical
                ? Se.actor(subject, "criticalSound")
                : Se.actor(subject, "attackSound"));
        }

        if (result.hpDamage > 0) {
            if (target.isEnemy && target.isEnemy()) {
                // 敌人倒下（fight.c 756）
                if (target.hp <= 0) Se.play(Se.enemy(target, "die"));
            } else if (target.isActor && target.isActor()) {
                if (target.hp <= 0) {
                    // 我方死亡（fight.c 4816）
                    Se.play(Se.actor(target, "deathSound"));
                } else {
                    // 我方濒死（fight.c 850）：跨过 maxHP/5 这条线且没死
                    const prev = target.hp + result.hpDamage;
                    const line = Math.floor(target.mhp / 5);
                    if (line > 0 && target.hp < line && prev >= line) {
                        Se.play(Se.actor(target, "dyingSound"));
                    }
                }
            }
        }
    };

    // 每次行动开始清掉「本次攻击已喊过」的标记
    const _actionStart = Game_Battler.prototype.performActionStart;
    Game_Battler.prototype.performActionStart = function (action) {
        this._palAtkSeDone = false;
        if (_actionStart) _actionStart.call(this, action);
    };

    //=========================================================================
    // 逃跑（battle.c 1397 敌人逃 / 1459 我方逃，两边都是 45）
    //=========================================================================
    const _processEscape = BattleManager.processEscape;
    BattleManager.processEscape = function () {
        Se.play(45);
        return _processEscape.call(this);
    };

})();
