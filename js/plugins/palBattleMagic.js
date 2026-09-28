/*:
 * @target MZ
 * @plugindesc [v1.2] 仙剑98柔情版战斗法术动画（特效序列帧/按 wType 定位/吹飞位移/扭曲/受击颤抖/结算时序；可改用 RM 数据库动画）
 * @author AI Assistant
 *
 * @help
 * 复刻仙剑98柔情版施法完整流程（对照 sdlpal fight.c）：
 *  1. 施法者施法帧序列（palBattleAnim.js，吟唱→释放）；
 *  2. 释放点（施法序列中的 {spell:true} 步骤）触发本插件，播放法术特效序列帧：
 *     img/animations/<fx>-<帧>.png。
 *     ⚠ v1.2 修正：特效【不是】"每个受法者一份"，而是按原版 wType 决定摆几份、
 *       摆在哪（见下方"特效摆放"一节）。这也是"全体仙术只放一次全屏动画"的来源。
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
 *
 * 【特效摆放】（fight.c 2742-2820 我方施法 / 2967-3046 敌方施法）
 *   原版 wType（本表 entry[1]）决定摆几份、摆在哪，与"打了几个目标"无关：
 *     0 Normal        1 份 → 唯一目标脚底 + (wXOffset, wYOffset)
 *     1 AttackAll     3 份 → 固定三处（我方施法打敌方半场 / 敌方施法打我方半场）
 *     2 AttackWhole   1 份 → 整屏一处（我方 120,100 / 敌方 240,150）
 *     3 AttackField   1 份 → 场地一处（双方都是 160,200）
 *     4 ApplyToPlayer 1 份 → 目标队友脚底
 *     5 ApplyToParty  N 份 → 每个在场队友脚底各一份
 *     6 / 9（召唤）    未在原版分支里处理 → 退回"跟随受法者"
 *   v1.1 及以前一律按受法者逐个生成，于是 mtype 2/3 的全屏图会叠出 N 张
 *   （5 个敌人 = 5 张 960×600 全屏动画同时播）。v1.2 按上表修正。
 *
 * 【可改用 RM 数据库动画】
 *   想用数据库「动画」编辑器做的特效，给技能配上 animationId（或备注
 *   <palAnim:ID>）即可，本插件会改用 $gameTemp.requestAnimation 播放一次
 *   （position=3「画面」只播一份，其余按目标逐个），并跳过 FIRE.MKF 序列帧。
 *   关闭开关：控制台 PalBattleMagic.useDbAnimation = false。
 *   注意：MV 格式动画单元格固定 192×192、节奏固定 4 帧/格，表达不了原版
 *   320×200 全屏序列帧和"火焰段循环/震屏/波纹"，所以默认仍走序列帧。
 *
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

    // 特效帧图倍率（v1.1）：与敌人精灵【同倍率】。
    // 实测 img/animations 最大 320x200 = 原版整屏尺寸，说明特效帧图和敌人精灵
    // 一样都是 320x200 原生分辨率导出，理应共用 kPal()（=3）。
    // v1.0 误按 640 换算成 1.5，特效只有敌人的一半大 —— 这就是"仙术图片偏小"。
    // 想微调（觉得偏大/偏小）可在控制台改：PalBattleMagic.fxScale = 0.8（下次播放生效）
    PalBattleMagic.fxScale = 1;
    const kFx = () => kPal() * PalBattleMagic.fxScale;

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
        // D6 合体技的释放点不是标准施法序列的 16 帧，而是
        // 走位 6 帧 + 其余参战者各 3 帧 + 发动者帧5(5) + 帧6(3) + OffMagicAnim 前 1 帧，
        // 二/三人分别是 17 / 20 帧 —— 用错会让伤害结算与伤害数字早于特效 40~160ms。
        const act = BattleManager._action;
        if (act && act._palCoop && window.PalBattleCoop) {
            return PalBattleCoop.coopIntroWaits() + 9 * BATTLE_MS;
        }
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
    // 特效摆放（fight.c 2742-2820 我方施法 / 2967-3046 敌方施法）
    //=============================================================================

    // 固定落点，PAL 320×200 坐标（×kPal() 得屏幕像素；锚点为底部中心）
    const EFFECTPOS = {
        // 我方施法打敌人：fight.c 2766（AttackAll 三处）/ 2798（Whole）/ 2803（Field）
        actor: {
            all: [[70, 140], [100, 110], [160, 100]],
            whole: [120, 100],
            field: [160, 200]
        },
        // 敌方施法打我方：fight.c 2991 / 3023 / 3028
        enemy: {
            all: [[180, 180], [234, 170], [270, 146]],
            whole: [240, 150],
            field: [160, 200]
        }
    };
    PalBattleMagic.EFFECTPOS = EFFECTPOS;

    const MTYPE = { NORMAL: 0, ATTACK_ALL: 1, ATTACK_WHOLE: 2, ATTACK_FIELD: 3, APPLY_PLAYER: 4, APPLY_PARTY: 5 };

    // 返回特效锚点数组：{x,y}（屏幕像素，固定落点）或 {sprite}（跟随受法者脚底）
    PalBattleMagic.effectSpots = function (subject, entry, targets) {
        const mtype = entry[1];
        const xo = entry[2] || 0, yo = entry[3] || 0;
        const byEnemy = !!(subject && subject.isEnemy && subject.isEnemy());
        const table = byEnemy ? EFFECTPOS.enemy : EFFECTPOS.actor;
        const fixed = pts => pts.map(p => ({ x: (p[0] + xo) * kPal(), y: (p[1] + yo) * kPal() }));
        switch (mtype) {
            case MTYPE.ATTACK_ALL: return fixed(table.all);   // 原版恒 3 份（MAX_BATTLE_MAGICSPRITE_ITEMS）
            case MTYPE.ATTACK_WHOLE: return fixed([table.whole]);
            case MTYPE.ATTACK_FIELD: return fixed([table.field]);
            default: break;
        }
        // 其余（Normal / ApplyToPlayer / ApplyToParty / 召唤 …）跟随受法者
        const out = [];
        for (const t of targets || []) {
            const s = PalBattleAnim.spriteOf(t);
            if (s) out.push({ sprite: s });
        }
        return out;
    };

    //=============================================================================
    // RM 数据库动画（$dataAnimations）可选通道
    //=============================================================================

    PalBattleMagic.useDbAnimation = true;

    // 技能 → 数据库动画 ID；0 = 不用（仍走 FIRE.MKF 序列帧）
    PalBattleMagic.dbAnimationId = function (action) {
        if (!PalBattleMagic.useDbAnimation) return 0;
        const item = action && action.item && action.item();
        if (!item) return 0;
        if (item.animationId > 0) return item.animationId;
        const m = /<palAnim:\s*(\d+)\s*>/i.exec(item.note || "");
        return m ? Number(m[1]) : 0;
    };

    PalBattleMagic.isDbAnimationPlaying = function () {
        const scene = SceneManager._scene;
        const ss = scene && scene._spriteset;
        return !!(ss && ss.isAnimationPlaying && ss.isAnimationPlaying());
    };

    //=============================================================================
    // 特效播放器（挂在 battleField 上的精灵，逐帧切换 bitmap）
    //=============================================================================

    function Sprite_PalEffect() { this.initialize.apply(this, arguments); }
    Sprite_PalEffect.prototype = Object.create(Sprite.prototype);
    Sprite_PalEffect.prototype.constructor = Sprite_PalEffect;

    // spot  : {sprite} 跟随受法者脚底 | {x,y} 固定屏幕落点
    // affect: 受"吹飞/波纹"影响的精灵列表（原版是全场效果，fight.c 2683-2694）
    // owner : 只有第一份特效驱动 affect，避免多份固定特效把抖动叠加 N 遍
    Sprite_PalEffect.prototype.initialize = function (frames, entry, spot, affect, opts, owner) {
        Sprite.prototype.initialize.call(this);
        this._frames = frames;
        this._entry = entry;
        this._spot = spot || {};
        this._target = spot && spot.sprite ? spot.sprite : null; // 兼容旧引用
        this._affect = affect || [];
        this._opts = opts;
        this._owner = !!owner;
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
        this._syncPos();
        this.scale.x = kFx();
        this.scale.y = kFx();
        this.bitmap = frames[0];
    };

    // 每帧重算落点：跟随受法者时，吹飞位移也会带动画一起走（与原版每帧重算一致）
    Sprite_PalEffect.prototype._syncPos = function () {
        const s = this._spot.sprite;
        if (s) {
            this.x = s.x + this._entry[2] * kPal(); // 目标脚底 + wXOffset
            this.y = s.y + this._entry[3] * kPal(); // + wYOffset
        } else {
            this.x = this._spot.x || 0;
            this.y = this._spot.y || 0;
        }
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
        this._syncPos();
        if (!this._owner) {
            if (this._elapsed >= this._duration) this.finish();
            return;
        }
        // 吹飞 / 波纹是全场效果，由 owner 统一施加（fight.c 2683-2694 遍历所有敌人）
        for (const ts of this._affect) {
            if (!ts) continue;
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
                if (ts._palFxBaseScale === undefined) ts._palFxBaseScale = ts.scale.x;
                const s = 1 + Math.sin(this._elapsed / 60) * 0.04;
                ts.scale.x = ts._palFxBaseScale * s;
                ts.scale.y = ts._palFxBaseScale * s;
            }
        }
        if (this._elapsed >= this._duration) this.finish();
    };

    Sprite_PalEffect.prototype.finish = function () {
        if (this._done) return;
        this._done = true;
        if (this._owner) {
            for (const ts of this._affect) {
                if (!ts) continue;
                ts._palBlowX = 0;
                ts._palBlowY = 0;
                if (this._opts.wave) {
                    // 红闪已接管色调时不动它（仙术红闪与特效同时结束，此情形罕见）
                    const b = ts._enemy || ts._actor;
                    if (!(b && b._palFlashUntil && performance.now() < b._palFlashUntil)) {
                        ts.setColorTone([0, 0, 0, 0]);
                    }
                    if (ts._palFxBaseScale !== undefined) {
                        ts.scale.x = ts._palFxBaseScale;
                        ts.scale.y = ts._palFxBaseScale;
                    }
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
        // ⚠ 必须取【这个施法者自己的】动作，不能用全局 BattleManager._action：
        // CTB 下可能有多名角色同时行动，_action 已被后一位覆盖 ——
        // 症状就是"后一位施法者放的是前一位的法术特效"。
        // _palCastAction 由 palBattleAnim 在 performAction 里按精灵绑定。
        const action = (casterSprite && casterSprite._palCastAction) || BattleManager._action;
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

        // ① 数据库动画通道：技能配了 animationId / <palAnim:ID> 就交给引擎播
        const dbId = PalBattleMagic.dbAnimationId(action);
        if (dbId > 0) {
            if ($dataAnimations && $dataAnimations[dbId]) {
                $gameTemp.requestAnimation(targets.length ? targets : [subject], dbId);
            }
            return;
        }

        // ② FIRE.MKF 序列帧：按 wType 决定摆几份、摆在哪
        const spots = PalBattleMagic.effectSpots(subject, entry, targets);
        if (!spots.length) return;
        const frames = [];
        for (let i = 1; i <= n; i++) frames.push(ImageManager.loadAnimation(fx + "-" + i));
        const offensive = !!(action.isDamage && action.isDamage());
        const opts = {
            blow: offensive && meta.elem === 1, // 风系攻击仙术
            wave: (entry[7] || 0) > 0          // 波纹（鬼降等）
        };
        // 吹飞/波纹影响到的精灵（原版是全场遍历，不只看落点）
        const affect = [];
        for (const t of targets) {
            const s = PalBattleAnim.spriteOf(t);
            if (s) affect.push(s);
        }
        spots.forEach((spot, i) => {
            field.addChild(new Sprite_PalEffect(frames, entry, spot, affect, opts, i === 0));
            activeCount++;
        });
    };

    //=============================================================================
    // 时序门控：施法前摇不结算、特效播完才结束行动（对齐原版回合节奏）
    //=============================================================================

    PalBattleMagic.gateAction = function (bm) {
        const action = bm._action;
        if (!action || !action.isSkill || !action.isSkill()) return false;
        const meta = PalBattleCore.parseMeta(action.item());
        if (!meta || meta.mid === undefined) return false;
        const useDb = PalBattleMagic.dbAnimationId(action) > 0;
        if (!useDb && PalBattleMagic.effectDuration(meta) <= 0) return false; // 无特效仙术不拦
        const elapsed = performance.now() - (bm._palActionStartAt || performance.now());
        if (elapsed < PalBattleMagic.castOffset(bm._subject, meta)) return true;
        if (useDb) return PalBattleMagic.isDbAnimationPlaying();
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
