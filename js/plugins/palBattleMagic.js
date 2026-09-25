/*:
 * @target MZ
 * @plugindesc [v1.0] 仙剑98柔情版战斗法术动画（特效序列帧/吹飞位移/扭曲/受击颤抖/结算时序）
 * @author AI Assistant
 *
 * @help
 * 复刻仙剑98柔情版施法完整流程（对照 sdlpal fight.c）：
 *  1. 施法者施法帧序列（palBattleAnim.js，吟唱→释放）；
 *  2. 释放点（施法序列中的 {spell:true} 步骤）触发本插件，在每个受法者身上
 *     播放法术特效序列帧：img/animations/<fx>-<帧>.png。
 *     fx = FIRE.MKF 块号 = MAGIC.wEffect，参数内嵌 MAGIC_TABLE（来源
 *     D:\仙剑逆向拆解\Export\Data\Magics.csv）：
 *     每帧时长 (wSpeed+5)*10ms（fight.c 2729-2730）；
 *     播放结构 = 全帧一遍 + [fireDelay,末) 段循环 effectTimes 次 + shake 帧定格
 *     （fight.c 2661-2664, 2696-2720）；位置 = 受法者脚底中心 + (wXOffset,wYOffset)。
 *  3. 特效播完才允许行动结束并弹出伤害数字（原版时序 fight.c 4261→4270→4322，
 *     BattleManager.updateAction 被门控）：
 *     · 我方受法者：受伤帧4+击退（_palHurtAt 推迟到特效结束，palBattleAnim 支持未来时刻）
 *     · 敌方受法者：受击红闪 + 原地颤抖（-8/+4/-2 PAL 单位三帧缓动，
 *       fight.c 3208-3238 PAL_BattleShowPostMagicAnim）
 *  4. 特效播放期间不倒地、不渐隐（死亡判断推迟到动画之后，palBattleAnim 门控）。
 * 特殊表现：
 *  · 风系攻击仙术（备注 elem=1 且伤害型）：受法者全程随机抖动位移并缓慢漂移
 *    （原版 iBlow，仙术脚本 0x006B "Blow away enemies"），结束归位；
 *  · 波纹仙术（MAGIC.wWave>0，如鬼降 mid=68）：受法者色调脉冲 + 轻微缩放摆动
 *    （近似原版屏幕波纹的局部扭曲）。
 * 需排在 palBattleAnim / palBattleCore 之后加载。
 */

(() => {
    const PalBattleMagic = (window.PalBattleMagic = {});
    const PalBattleCore = window.PalBattleCore;
    const PalBattleAnim = window.PalBattleAnim;

    // mid -> [fx(素材文件号=原版wEffect+1；导出器按1基命名，块i→文件i+1), mtype, xoff, yoff, wSpeed, effectTimes, shake, wave, fireDelay]
    // （Magics.csv 全表内嵌；有符号字段已转 int16）
    const MAGIC_TABLE = {"0":[1,0,0,4,2,0,0,0,0],"1":[2,0,0,0,2,0,0,0,0],"2":[3,0,-10,12,0,1,0,0,0],"3":[4,0,0,2,3,0,0,0,0],"4":[5,0,0,0,2,0,9,0,0],"5":[37,1,0,30,0,1,0,0,0],"6":[2,1,0,0,2,0,0,0,0],"7":[3,1,-10,12,0,1,0,0,0],"8":[8,0,0,0,0,0,0,1,0],"9":[5,1,0,0,2,0,9,0,0],"10":[6,0,0,0,0,0,0,0,10],"11":[7,0,0,0,0,0,0,0,0],"12":[9,0,48,32,0,0,0,0,0],"13":[9,1,48,32,0,0,0,0,0],"14":[10,0,64,16,1,2,0,0,0],"15":[11,2,-44,20,0,0,0,0,0],"16":[12,2,0,44,0,0,0,0,0],"17":[13,1,-2,-10,1,0,0,0,0],"18":[14,2,0,46,0,0,0,0,0],"19":[19,9,-8,22,2,65534,0,0,1],"20":[15,2,27,60,0,0,0,0,0],"21":[21,9,8,-5,0,0,0,0,13],"22":[24,9,0,32,0,5,0,0,2],"23":[16,3,0,0,-1,4,0,0,8],"24":[17,3,0,0,0,4,0,0,0],"25":[27,9,-28,13,0,0,0,0,4],"26":[18,2,-10,42,2,0,16,0,0],"27":[19,3,0,0,0,3,0,0,0],"28":[20,0,-10,-16,0,0,0,0,0],"29":[21,2,-16,40,6,0,0,0,0],"30":[22,3,0,-32,0,0,0,0,16],"31":[29,4,-6,-18,-1,0,0,0,0],"32":[1,6,0,0,0,0,0,0,0],"33":[28,4,-10,-6,-1,0,0,0,0],"34":[30,4,-8,4,-1,0,0,0,0],"35":[29,4,-6,-18,-1,0,0,0,0],"36":[29,4,-6,-18,-1,0,0,0,0],"37":[31,4,-10,0,0,0,0,0,0],"38":[29,4,-6,-18,-1,0,0,0,0],"39":[29,4,-6,-18,-1,0,0,0,0],"40":[30,4,-8,4,-1,0,0,0,0],"41":[30,4,-8,4,-1,0,0,0,0],"42":[8,1,0,0,1,0,0,1,0],"43":[7,1,0,0,0,0,0,0,0],"44":[23,2,0,30,2,0,0,0,0],"45":[24,2,-24,32,1,0,0,0,14],"46":[29,5,-6,-18,-1,0,0,0,0],"47":[65535,8,0,0,4,0,0,0,0],"48":[26,0,-4,-20,1,0,0,0,0],"49":[25,0,-12,0,0,0,0,0,0],"50":[27,3,0,0,0,0,0,0,0],"51":[30,4,-8,4,-1,0,0,0,0],"52":[29,4,-6,-18,-1,0,0,0,0],"53":[32,0,32,20,0,0,0,0,0],"54":[33,0,-10,15,0,0,0,0,0],"55":[34,2,-32,32,0,0,0,0,24],"56":[1,1,0,0,2,0,0,0,0],"57":[2,1,0,0,2,0,0,0,0],"58":[16,3,0,0,0,3,0,0,8],"59":[8,1,0,0,1,0,0,1,0],"60":[18,2,-10,42,2,0,15,0,0],"61":[35,3,0,16,2,0,0,0,0],"62":[26,0,-4,-20,1,0,0,0,0],"63":[26,1,-4,-20,1,0,0,0,0],"64":[36,0,12,20,0,0,0,0,0],"65":[38,0,0,-4,1,0,0,0,0],"66":[41,0,0,4,2,0,0,0,0],"67":[40,0,0,0,0,0,0,0,0],"68":[42,0,0,0,2,0,0,8,0],"69":[39,2,0,20,2,0,18,0,0],"70":[43,0,-102,-32,0,0,0,0,23],"71":[44,0,0,32,5,0,0,0,0],"72":[45,3,0,0,0,2,0,0,0],"73":[73,9,-16,16,0,65535,0,0,2],"74":[46,1,-10,24,4,0,0,0,0],"75":[62,9,0,18,1,0,0,0,2],"76":[78,9,0,10,1,0,0,0,1],"77":[47,2,0,40,0,0,0,0,0],"78":[48,0,-10,24,1,0,0,0,0],"79":[13,0,-2,-10,1,0,0,0,0],"80":[1,0,0,0,0,0,0,0,0],"81":[1,0,0,0,0,0,0,0,0],"82":[49,0,0,24,2,0,0,0,0],"83":[50,0,0,0,2,0,17,0,0],"84":[40,0,0,0,0,0,0,0,0],"85":[46,0,-10,24,4,0,0,0,0],"86":[51,0,32,20,0,0,0,0,0],"87":[52,0,-10,24,0,0,0,0,0],"88":[11,0,-12,20,0,0,0,0,0],"89":[53,3,0,0,3,2,0,0,0],"90":[90,9,0,0,4,0,0,0,1],"91":[26,1,-4,-20,1,0,0,0,0],"92":[54,3,0,0,-1,4,0,0,8],"93":[48,0,-6,27,1,0,0,0,0],"94":[18,9,0,0,0,5,0,0,1],"95":[29,4,-6,-18,-1,0,0,0,0],"96":[25,0,-12,0,-1,0,0,0,0],"97":[30,4,-8,4,-1,0,0,0,0],"98":[65535,0,0,0,0,0,0,0,0],"99":[65535,0,0,0,0,0,0,0,0],"100":[32,1,32,20,0,0,0,0,0],"101":[43,1,-102,-32,0,0,0,0,23],"102":[55,3,0,0,-1,2,0,0,0],"103":[49,1,0,24,2,0,0,0,0]};

    // fx(文件号) -> 帧数（img/animations/<fx>-<1..n>.png 盘点结果）；原版 wEffect=fx-1
    const FX_FRAMES = { 1: 8, 2: 7, 3: 16, 4: 8, 5: 5, 6: 26, 7: 12, 8: 16, 9: 13, 10: 6, 11: 10, 12: 14, 13: 15, 14: 8, 15: 8, 16: 16, 17: 8, 18: 13, 19: 12, 20: 3, 21: 6, 22: 33, 23: 11, 24: 22, 25: 7, 26: 20, 27: 31, 28: 20, 29: 24, 30: 24, 31: 36, 32: 8, 33: 16, 34: 38, 35: 11, 36: 15, 37: 20, 38: 25, 39: 9, 40: 40, 41: 17, 42: 24, 43: 38, 44: 6, 45: 16, 46: 7, 47: 10, 48: 10, 49: 9, 50: 8, 51: 7, 52: 6, 53: 8, 54: 16, 55: 15 };

    const BATTLE_MS = 40;

    let activeCount = 0;
    PalBattleMagic.isEffectPlaying = () => activeCount > 0;

    // PAL 坐标（320 空间）→ 屏幕像素换算
    const kPal = () => Graphics.boxWidth / 320;
    // 特效帧图为 PAL 640 分辨率原生尺寸 → 屏幕等比
    const kFx = () => Graphics.boxWidth / 640;

    function frameMsOf(entry) {
        return Math.max(40, (entry[4] + 5) * 10); // (wSpeed+5)*10ms（fight.c 2729）
    }

    function normTimes(t) {
        if (t > 10) return 1; // 65534/65535 等视为 1
        return Math.max(0, t); // 0 = 不循环火焰段（sdlpal：l = (n-fire)*0 + n）
    }

    // 特效总时长：n 帧一遍 + [fireDelay,末) 段循环 times 次 + shake 帧（fight.c 2661-2664）
    PalBattleMagic.effectDuration = function (meta) {
        const entry = meta && MAGIC_TABLE[meta.mid];
        if (!entry) return 0;
        const n = FX_FRAMES[entry[0]] || 0;
        if (!n) return 0;
        const fire = Math.max(0, Math.min(entry[8], n - 1));
        return (n + (n - fire) * normTimes(entry[5]) + entry[6]) * frameMsOf(entry);
    };

    // 施法序列中释放点距序列开始的毫秒数（与 palBattleAnim 的 buildXxxMagic 严格一致）
    PalBattleMagic.castOffset = function (subject, meta) {
        if (subject && subject.isEnemy && subject.isEnemy()) {
            const em = PalBattleCore.enemyMeta(subject);
            const magicFrames = em && em.frames ? (em.frames[1] || 0) : 0;
            const actWait = em && em.actWait ? em.actWait : 2;
            return 4 * BATTLE_MS + magicFrames * actWait * BATTLE_MS;
        }
        return 16 * BATTLE_MS; // 4 前移 + 2 停顿 + 10 吟唱（buildActorMagic）
    };

    // 仙术伤害/恢复的视觉延迟：特效播完才弹出（原版动画播完才结算，fight.c 4261→4322）
    PalBattleMagic.spellDamageDelay = function () {
        if (BattleManager._phase !== "action") return 0;
        const action = BattleManager._action;
        if (!action || !action.isSkill || !action.isSkill()) return 0;
        const meta = PalBattleCore.parseMeta(action.item());
        if (!meta || meta.mid === undefined || !MAGIC_TABLE[meta.mid]) return 0;
        const total = PalBattleMagic.castOffset(BattleManager._subject, meta) +
            PalBattleMagic.effectDuration(meta);
        if (total <= 0) return 0;
        const elapsed = performance.now() - (BattleManager._palActionStartAt || performance.now());
        return Math.max(0, total - elapsed);
    };

    //=============================================================================
    // 特效播放器（挂在 battleField 上的精灵，逐帧切换 bitmap）
    //=============================================================================

    function Sprite_PalEffect() { this.initialize.apply(this, arguments); }
    Sprite_PalEffect.prototype = Object.create(Sprite.prototype);
    Sprite_PalEffect.prototype.constructor = Sprite_PalEffect;

    Sprite_PalEffect.prototype.initialize = function (frames, entry, targetSprite, opts) {
        Sprite.prototype.initialize.call(this);
        this._frames = frames;
        this._entry = entry;
        this._target = targetSprite;
        this._opts = opts;
        this._n = frames.length;
        this._fire = Math.max(0, Math.min(entry[8], this._n - 1));
        this._times = normTimes(entry[5]);
        this._shake = entry[6] || 0;
        this._ms = frameMsOf(entry);
        this._duration = (this._n + (this._n - this._fire) * this._times + this._shake) * this._ms;
        this._fi = 0;
        this._ft = 0;
        this._loop = 0;
        this._elapsed = 0;
        this._pt = performance.now();
        this._done = false;
        this.anchor.x = 0.5;
        this.anchor.y = 1; // 底部中心（battle.c 244）
        this.x = targetSprite.x + entry[2] * kPal(); // + wXOffset
        this.y = targetSprite.y + entry[3] * kPal(); // + wYOffset
        this.scale.x = kFx();
        this.scale.y = kFx();
        this.bitmap = frames[0];
    };

    Sprite_PalEffect.prototype.update = function () {
        Sprite.prototype.update.call(this);
        if (this._done) return;
        const t = performance.now();
        let dt = t - this._pt;
        this._pt = t;
        if (dt > 250) dt = 250; // 切后台防跳帧
        if (dt < 0) dt = 0;
        this._ft += dt;
        this._elapsed += dt;
        while (this._ft >= this._ms) {
            this._ft -= this._ms;
            this._fi++;
            if (this._fi >= this._n) {
                this._loop++;
                if (this._loop < this._times) {
                    this._fi = this._fire; // 火焰段循环（fight.c 2696-2720）
                } else {
                    this._fi = this._n - 1; // shake/结尾段定格末帧
                }
            }
        }
        this.bitmap = this._frames[this._fi];
        const ts = this._target;
        if (!ts) return;
        // 风系吹飞：受法者随机抖动漂移（fight.c 2681-2694，pos += RandomLong(0,iBlow)）
        if (this._opts.blow) {
            ts._palBlowX = Math.min(24, (ts._palBlowX || 0) + Math.random() * 5 * kPal());
            ts._palBlowY = (ts._palBlowY || 0) + Math.random() * 2.5 * kPal();
        }
        // 波纹扭曲（wWave>0，如鬼降）：色调脉冲 + 轻微缩放摆动
        if (this._opts.wave) {
            const p = Math.min(1, this._elapsed / this._duration);
            const v = Math.round(Math.sin(p * Math.PI) * 160);
            ts.setColorTone([v, v, v, 0]);
            if (this._baseScale === undefined) this._baseScale = ts.scale.x;
            const s = 1 + Math.sin(this._elapsed / 60) * 0.04;
            ts.scale.x = this._baseScale * s;
            ts.scale.y = this._baseScale * s;
        }
        if (this._elapsed >= this._duration) this.finish();
    };

    Sprite_PalEffect.prototype.finish = function () {
        if (this._done) return;
        this._done = true;
        const ts = this._target;
        if (ts) {
            ts._palBlowX = 0;
            ts._palBlowY = 0;
            if (this._opts.wave) {
                // 红闪已接管色调时不动它（仙术红闪与特效同时结束，此情形罕见）
                const b = ts._enemy || ts._actor;
                if (!(b && b._palFlashUntil && performance.now() < b._palFlashUntil)) {
                    ts.setColorTone([0, 0, 0, 0]);
                }
                if (this._baseScale !== undefined) {
                    ts.scale.x = this._baseScale;
                    ts.scale.y = this._baseScale;
                }
            }
        }
        if (this.parent && this.parent.removeChild) this.parent.removeChild(this);
        activeCount = Math.max(0, activeCount - 1);
    };

    //=============================================================================
    // 释放点触发：为每个受法者开一个特效精灵
    //=============================================================================

    PalBattleMagic.playEffect = function (casterSprite) {
        const action = BattleManager._action;
        if (!action || !action.isSkill || !action.isSkill()) return;
        const meta = PalBattleCore.parseMeta(action.item());
        const entry = meta && MAGIC_TABLE[meta.mid];
        if (!entry) return;
        const fx = entry[0], n = FX_FRAMES[fx];
        if (!n) return;
        const scene = SceneManager._scene;
        const field = scene && scene._spriteset && scene._spriteset._battleField;
        if (!field) return;
        const subject = casterSprite._actor || casterSprite._enemy;
        const targets = ((subject && subject._palTargets) || []).filter(t => t);
        if (!targets.length) return;
        const frames = [];
        for (let i = 1; i <= n; i++) frames.push(ImageManager.loadAnimation(fx + "-" + i));
        const offensive = !!(action.isDamage && action.isDamage());
        const opts = {
            blow: offensive && meta.elem === 1, // 风系攻击仙术
            wave: (entry[7] || 0) > 0          // 波纹（鬼降等）
        };
        for (const target of targets) {
            const ts = PalBattleAnim.spriteOf(target);
            if (!ts) continue;
            field.addChild(new Sprite_PalEffect(frames, entry, ts, opts));
            activeCount++;
        }
    };

    //=============================================================================
    // 时序门控：施法前摇不结算、特效播完才结束行动（对齐原版回合节奏）
    //=============================================================================

    PalBattleMagic.gateAction = function (bm) {
        const action = bm._action;
        if (!action || !action.isSkill || !action.isSkill()) return false;
        const meta = PalBattleCore.parseMeta(action.item());
        if (!meta || meta.mid === undefined) return false;
        if (PalBattleMagic.effectDuration(meta) <= 0) return false; // 无特效仙术不拦
        const elapsed = performance.now() - (bm._palActionStartAt || performance.now());
        if (elapsed < PalBattleMagic.castOffset(bm._subject, meta)) return true;
        return PalBattleMagic.isEffectPlaying();
    };

    const _updateAction = BattleManager.updateAction;
    BattleManager.updateAction = function () {
        if (PalBattleMagic.gateAction(this)) return;
        _updateAction.call(this);
    };

    const _startAction = BattleManager.startAction;
    BattleManager.startAction = function () {
        this._palActionStartAt = performance.now();
        _startAction.call(this);
    };

    // 伤害数字延迟：普攻走原估算，仙术 = 特效剩余时长
    const _popupDelay = PalBattleAnim.popupDelay;
    PalBattleAnim.popupDelay = function () {
        const d = PalBattleMagic.spellDamageDelay();
        if (d > 0) return d;
        return _popupDelay.call(this);
    };

    //=============================================================================
    // 受击表现对齐：我方受伤帧/击退推迟；敌方红闪推迟 + 原地颤抖
    //=============================================================================

    const _actorPerformDamage = Game_Actor.prototype.performDamage;
    Game_Actor.prototype.performDamage = function () {
        _actorPerformDamage.call(this);
        const d = PalBattleMagic.spellDamageDelay();
        if (d > 0) this._palHurtAt = performance.now() + d;
    };

    const _enemyPerformDamage = Game_Enemy.prototype.performDamage;
    Game_Enemy.prototype.performDamage = function () {
        _enemyPerformDamage.call(this);
        const action = BattleManager._action;
        if (action && action.isSkill && action.isSkill()) {
            const d = PalBattleMagic.spellDamageDelay();
            const t = performance.now() + d;
            this._palFlashFrom = t;             // 红闪推迟到特效播完
            this._palFlashUntil = t + 5 * BATTLE_MS;
            this._palTrembleAt = t;             // 法术受击：原地颤抖
        }
    };

    // 敌方颤抖（fight.c 3208-3238：左 8 → 右 4 → 左 2，三帧）
    const _Sprite_Enemy_update = Sprite_Enemy.prototype.update;
    Sprite_Enemy.prototype.update = function () {
        _Sprite_Enemy_update.call(this);
        const b = this._enemy;
        if (b && b._palTrembleAt) {
            const e = performance.now() - b._palTrembleAt;
            if (e >= 0 && e < 3 * BATTLE_MS) {
                const seq = [-8, 4, -2];
                this.x += seq[Math.min(2, Math.floor(e / BATTLE_MS))] * kPal();
            }
        }
    };

    // 吹飞位移：叠加在战斗精灵自身移动结果之上
    const _updatePosition = Sprite_Battler.prototype.updatePosition;
    Sprite_Battler.prototype.updatePosition = function () {
        _updatePosition.call(this);
        if (this._palBlowX || this._palBlowY) {
            this.x += this._palBlowX;
            this.y += this._palBlowY;
        }
    };

    PalBattleMagic.Sprite_PalEffect = Sprite_PalEffect;
})();
