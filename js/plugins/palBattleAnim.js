/*:
 * @target MZ
 * @plugindesc [v1.0] 仙剑98柔情版战斗动画（敌我待机/攻击/施法/受击/死亡 帧序列复刻）
 * @author AI Assistant
 *
 * @help
 * 本插件复刻仙剑98柔情版（WIN95）战斗中的精灵动画规则，需排在 palBattleCore 之后加载。
 *
 * ===== 数据来源（sdlpal fight.c / battle.c） =====
 * 敌人每帧区划分（敌人备注 <pal:{...,frames:[待机,施法,攻击],idleSpeed,actWait,pngs}>）：
 *   [0, 待机帧数)                      待机循环帧
 *   [待机帧数, +施法帧数)              施法帧
 *   [待机帧数+施法帧数-1, +攻击帧数]   攻击帧（与施法帧区有一帧重叠，见 fight.c 5040-5048）
 * 敌人待机：每 idleSpeed 个战斗帧(40ms)推进一帧，循环；睡眠/定身时固定第 0 帧。
 * 敌人普攻（fight.c 4987-5130）：施法帧区前摇(每帧2战斗帧) → 前移(3-施法帧数)步 →
 *   跳到目标旁(-132,-48) → 攻击帧区(每帧 actWait 战斗帧) → 命中(目标受击) → 撤回原位。
 * 敌人施法（fight.c 4660-4717）：前移(+36,+18)→(+48,+24) → 施法帧区 → 攻击帧区。
 * 敌人死亡（用户对照原版确认）：不变黑；受击/攻击等动作序列播完后
 * 原地直接渐隐约 0.6s 消失（不能用 visible 隐藏，MZ 的 updateVisibility 每帧会用
 * isSpriteVisible() 重置 visible，必须驱动 opacity）。
 *
 * 我方角色固定帧号（F.MKF 战斗精灵）：
 *   0 常态  1 睡眠/濒死  2 死亡  3 防御  4 受击  5 施法/用物品姿势
 *   6 法术释放  7 攻击蓄力  8 攻击姿势1  9 攻击姿势2  10 胜利
 * 立绘分组随武器类型切换（原版装备脚本改写 rgwSpriteNumInBattle）：
 *   林月如 剑→组3(默认) / 鞭→组7；阿奴 杖→组5(默认) / 刀→组8，
 *   换装备立即生效，待机/攻击/施法等全部帧序列共用同一分组。
 * 我方普攻（fight.c 3667/2076-2127）：帧7蓄力(4战斗帧) → 冲刺至目标右下方
 *   → 帧8逼近 → 帧9边挥砍边贴到敌身 → 撤回。
 *   二次攻击武器（玄冥宝刀，特征码34 攻击次数+1/fight.c 3628 的 kStatusDualAttack）：
 *   打两轮完整序列；全体攻击武器（<AOE> 备注：长鞭/九截鞭/金蛇鞭/玄冥宝刀，
 *   原版装备脚本写 rgwAttackAll=1）只探身原地挥砍、打击敌方全体且免选目标。
 * Miss/自动格挡（fight.c 4938 / 5023-5027 / 5097-5112）：无“Miss”字样，被打者摆
 *   防御姿势帧3，并和真被打中一样后退一步 —— 原版是 (+8,+4) 再 (+2,+1)，合计
 *   (+10,+5) PAL 单位（本工程 960×600 = PAL 320×200 ×3 → +30,+15）。
 *   注：后退量受击与格挡【完全相同】，iCoverIndex != -1（被队友掩护）时才走另一套。
 * 我方施法（fight.c 2363-2444）：前移4小步(共-30,-12) → 帧5吟唱(约10战斗帧) → 帧6释放。
 * 我用物品（fight.c 2289-2335）：前移(-45,-21) → 帧5 → 目标颜色闪烁。
 * 我方受击（fight.c 4861-5125）：帧4 + 击退(+30,+15再归位) + 红色闪烁；
 *   死亡后固定帧2；濒死(HP < min(100, maxHP/5)，fight.c 47-48)固定帧1。
 *
 * 受击/格挡表现链：palBattle.js 为了去掉 "Miss"/伤害文字，把 displayMiss /
 *   displayEvasion / displayHpDamage 整个清空，连带把 MZ 日志队列里的 performMiss /
 *   performEvasion / performDamage / performRecovery 一起干掉了 —— 于是我方没有受伤帧、
 *   敌人挨打没有提亮、Miss 也没有格挡姿势。本插件改为 override displayDamage 同步
 *   触发动作（不走日志队列，避免被 wait 拆成逐个），文字一律不产生。
 *
 * 运行时调参：window.PAL98_ANIM（后退位移/保持时长/格挡姿势时长），
 *   控制台 PAL98.setStepBack(x, y, holdMs) / PAL98.setBlockPose(ms)。
 *
 * 其它：伤害数字延迟到命中帧弹出；防御(Guard)使用运行时伪技能999，挂状态2
 * （状态2自带“防御”特殊特征，防御力×2，与原版一致），行动开始时解除。
 */

(() => {
    const PalBattleAnim = (window.PalBattleAnim = {});
    const PalBattleCore = window.PalBattleCore;

    // 战斗全局速度倍率：window.PAL98_SPEED（默认 1 = 原版速度；控制台输入 PAL98_SPEED = 0.5 放慢一倍，随时可调）
    if (window.PAL98_SPEED == null) window.PAL98_SPEED = 1;
    const battleMs = () => 40 / (window.PAL98_SPEED || 1); // 原版战斗帧 1000/25 (battle.h BATTLE_FPS=25)
    const GUARD_STATE_ID = 2;
    const SLEEP_STATES = [10, 19]; // 昏睡3/昏睡5
    const PARA_STATES = [4, 5, 7]; // 定身5/定身4/定身
    const PAL_GUARD_SKILL_ID = 999;

    // 我方固定帧号
    const AF = {
        IDLE: 0, SLEEP: 1, DEAD: 2, GUARD: 3, HURT: 4,
        CHANT: 5, CAST: 6, PREP: 7, ATK1: 8, ATK2: 9, WIN: 10
    };

    //=============================================================================
    // 受击 / 格挡 的位移与时长（集中暴露，可运行时调）
    //=============================================================================
    // stepBack：fight.c 5097-5112 —— 命中或被格挡后 (PAL +8,+4) 再 (PAL +2,+1)，
    //   合计 (+10,+5) PAL 单位；本工程 960×600 = PAL 320×200 ×3 → (+30,+15)。
    //   受击与格挡完全相同；"被队友掩护"时受击者不动，改由掩护者走位（见 PAL98_COVER）。
    const PAL98_ANIM = window.PAL98_ANIM = {
        stepBack: [30, 15],       // 后退位移（px，相对 home）
        stepBackFrames: 3,        // 后退位移帧数
        stepBackHoldMs: 200,      // 后退后保持多久开始回位（原版约 5 战斗帧 = 200ms）
        returnFrames: 10,         // 回位动画帧数
        blockPoseMs: 240          // 格挡姿势（帧3）持续时间 = 6 战斗帧
    };
    const PAL98 = window.PAL98 = window.PAL98 || {};
    PAL98.setStepBack = function (x, y, holdMs) {
        PAL98_ANIM.stepBack = [Number(x) || 0, Number(y) || 0];
        if (holdMs !== undefined) PAL98_ANIM.stepBackHoldMs = Number(holdMs) || 0;
        return PAL98_ANIM.stepBack.slice();
    };
    PAL98.setBlockPose = function (ms) {
        PAL98_ANIM.blockPoseMs = Number(ms) || 0;
        return PAL98_ANIM.blockPoseMs;
    };

    //=============================================================================
    // 队友掩护的走位与时长（fight.c 5012-5027 / 5090-5098）
    //   offset  掩护者站到「受击者脚底 -24,-12」PAL 单位（fight.c 5018-5021）
    //   nudge   命中瞬间掩护者再 (+4,+2) PAL（fight.c 5095-5097）—— 已并入 hold 前
    //   enemyRecoil 敌人被挡下的反震 (-10,-8) PAL，持续 1 战斗帧（fight.c 5092-5094）
    //=============================================================================
    const PAL98_COVER = window.PAL98_COVER = {
        offset: [24, 12],      // PAL 单位
        inMs: 160,             // 走到位所需时间
        holdMs: 260,           // 到位后保持多久开始归位
        guardMs: 320,          // 防御姿势（帧3）持续
        enemyRecoil: [-10, -8] // PAL 单位
    };
    PAL98.setCover = function (offset, inMs, holdMs) {
        if (Array.isArray(offset)) PAL98_COVER.offset = offset.map(Number);
        if (inMs !== undefined) PAL98_COVER.inMs = Number(inMs) || 0;
        if (holdMs !== undefined) PAL98_COVER.holdMs = Number(holdMs) || 0;
        return PAL98_COVER;
    };

    // 每个角色战斗精灵的实际帧文件数（img/sv_actors/<id>-*.png 盘点结果）
    const ACTOR_FRAMES = {
        1: 11, 2: 10, 3: 10, 4: 10, 5: 10, 6: 10, 7: 10, 8: 10, 9: 10,
        10: 11, 11: 4, 12: 13, 13: 2, 14: 6, 15: 2, 16: 5, 17: 3, 18: 5, 19: 7
    };

    // 武器类型决定战斗立绘分组（原版装备脚本改写 rgwSpriteNumInBattle）：
    //   林月如装备鞭(wtype 6) → 组7（挥鞭立绘）；阿奴装备刀(wtype 3/4) → 组8（持刀立绘）
    // 键=角色ID，值={武器类型ID: 立绘组号}；无规则时用角色默认 battlerName 组。
    const WEAPON_SPRITE_GROUPS = {
        3: { 6: 7 },       // 林月如：剑(默认3) / 鞭(7)
        4: { 3: 8, 4: 8 }  // 阿奴：杖(默认5) / 刀(8)
    };

    const now = () => performance.now();
    const ticks = ms => Math.max(1, Math.round((ms * 60) / 1000));

    //=============================================================================
    // 工具
    //=============================================================================

    PalBattleAnim.spriteOf = function (battler) {
        const scene = SceneManager._scene;
        const spriteset = scene && scene._spriteset;
        if (!spriteset) return null;
        const all = (spriteset._actorSprites || []).concat(spriteset._enemySprites || []);
        for (const s of all) {
            if (s._battler === battler) return s;
        }
        return null;
    };

    const frameBase = name => {
        const m = /^(.*)-\d+$/.exec(name || "");
        return m ? m[1] : null;
    };

    // 敌人帧参数（frames:[待机,施法,攻击] / idleSpeed / actWait / pngs）
    function enemyAnimMeta(enemy) {
        const meta = PalBattleCore.enemyMeta(enemy);
        if (!meta || !meta.frames) return null;
        return {
            idle: Math.max(1, meta.frames[0] || 1),
            magic: Math.max(0, meta.frames[1] || 0),
            attack: Math.max(0, meta.frames[2] || 0),
            idleSpeed: Math.max(1, meta.idleSpeed || 1),
            actWait: Math.max(1, meta.actWait || 1),
            pngs: Math.max(1, meta.pngs || meta.frames[0] || 1)
        };
    }

    //=============================================================================
    // 帧切换
    //=============================================================================

    // 敌人：bitmap 在精灵自身
    function setEnemyFrame(sprite, idx) {
        const base = sprite._palBase ||
            (sprite._palBase = frameBase(sprite._enemy.battlerName()));
        if (!base) return;
        idx = Math.max(0, Math.min(idx, (sprite._palMaxFrame ?? 99)));
        const file = base + "-" + (idx + 1);
        if (sprite._palFrameFile !== file) {
            sprite._palFrameFile = file;
            sprite.bitmap = ImageManager.loadSvEnemy(file);
        }
    }

    // 我方：bitmap 在 _mainSprite
    function setActorFrame(sprite, idx) {
        const base = PalBattleAnim.actorFrameBase(sprite._actor);
        if (!base) return;
        const maxIdx = (ACTOR_FRAMES[Number(base)] || 1) - 1;
        idx = Math.max(0, Math.min(idx, maxIdx));
        const file = base + "-" + (idx + 1);
        if (sprite._palFrameFile !== file) {
            sprite._palFrameFile = file;
            const main = sprite._mainSprite;
            main.bitmap = ImageManager.loadSvActor(file);
            main.bitmap.addLoadListener(() => {
                main.setFrame(0, 0, main.bitmap.width, main.bitmap.height);
            });
        }
    }

    // 角色战斗立绘分组：装备特定武器类型时切换（原版 rgwSpriteNumInBattle 装备效果），
    // 否则用角色默认 battlerName 的组。每次调用实时计算，装备变化立即生效。
    PalBattleAnim.actorFrameBase = function (actor) {
        if (!actor || !actor.battlerName) return null;
        const def = frameBase(actor.battlerName());
        const rules = WEAPON_SPRITE_GROUPS[actor.actorId && actor.actorId()];
        if (rules && actor.weapons) {
            for (const w of actor.weapons()) {
                if (w && rules[w.wtypeId]) return String(rules[w.wtypeId]);
            }
        }
        return def;
    };

    PalBattleAnim.setEnemyFrame = setEnemyFrame;
    PalBattleAnim.setActorFrame = setActorFrame;

    //=============================================================================
    // 序列执行器（步骤数组驱动帧与位移）
    //   {frame:n} 设置帧  {wait:ms} 等待  {moveAbs:[dx,dy],ms} 相对 home 的绝对位移
    //=============================================================================

    PalBattleAnim.runSeq = function (sprite, steps) {
        sprite._palSeq = steps;
    };

    function updateSeq(sprite, dtMs) {
        const seq = sprite._palSeq;
        if (!seq || seq.length === 0) return;
        let guard = 32;
        while (seq.length > 0 && guard-- > 0) {
            const step = seq[0];
            if (step.spell) {
                // 法术特效步骤：在施法序列的释放点触发目标身上的法术动画
                //（palBattleMagic.js 播放；未加载该插件时跳过）
                if (window.PalBattleMagic) window.PalBattleMagic.playEffect(sprite);
                seq.shift();
                continue;
            }
            if (step.wait) {
                step._t = (step._t || 0) + dtMs;
                if (step._t >= step.wait) {
                    seq.shift();
                    continue;
                }
                return; // 等待中
            }
            if (step.frame !== undefined) {
                if (sprite._mainSprite) setActorFrame(sprite, step.frame);
                else setEnemyFrame(sprite, step.frame);
            }
            if (step.moveAbs) {
                sprite.startMove(step.moveAbs[0], step.moveAbs[1], ticks(step.ms || 0));
            }
            seq.shift();
        }
    }

    PalBattleAnim.isBusy = sprite => !!(sprite._palSeq && sprite._palSeq.length > 0);

    // 全场是否还有动作序列在跑（死亡渐隐等"全局演出"的闸门）。
    // 原版敌人死亡不是在命中帧移除，而是等行动者整套动作打完、
    // PAL_BattlePostActionCheck（fight.c:718）才把尸体撤掉并淡出场景 ——
    // 只查受害者自己的序列会让渐隐从伤害结算那一刻就开始，
    // 数字还没飘敌人就没了（用户反馈"敌人消失之后伤害才出现"）。
    PalBattleAnim.anySequenceBusy = function () {
        const scene = SceneManager._scene;
        const spriteset = scene && scene._spriteset;
        if (!spriteset || !spriteset.battlerSprites) return false;
        const sprites = spriteset.battlerSprites();
        for (let i = 0; i < sprites.length; i++) {
            const sp = sprites[i];
            if (sp._palSeq && sp._palSeq.length > 0) return true;
        }
        return false;
    };

    // 受击提亮色调（近似原版 iColorShift=6 的"同色相 +6 阶亮度"）；控制台可改
    PalBattleAnim.HIT_TONE = [110, 110, 110, 0];

    //=============================================================================
    // 战斗节奏闸：把本工程的演出纳入 BattleManager 的忙判定
    // --------------------------------------------------------------------------
    // RMMZ 原生 isBusy 只认 MZ 自带的动画播放与"位移中"（_movement），认不到
    // 本工程的几类演出，于是上一手伤害的提亮/受击帧还没播完，战斗流程就推进到
    // 下一个行动者开始攻击了。原版 fight.c 由战斗帧逐帧驱动、整场动作严格串行：
    // 前一个动作的挥砍/受击/收招全部播完才轮到下一个。这里照此把下列状态并入忙：
    //   ① 动作序列未跑完（含蓄力/吟唱/收招的纯等待步）
    //   ② 受击提亮未结束（_palFlashUntil，仙术被 palBattleMagic 推迟到特效后）
    //   ③ 受击帧/击退窗口未结束（_palHurtAt 起 6 个战斗帧）
    //   ④ 敌人死亡渐隐未结束（_palDeathAt + opacity）
    // 不含伤害飘字：原版下一名行动者的动作开始时，上一手的数字还在屏上
    // （ShowNum 存活期内允许与后续动作并存），与原版节奏一致。
    //=============================================================================

    Spriteset_Battle.prototype.isPalSequenceBusy = function () {
        const t = now();
        for (const sp of this.battlerSprites()) {
            if (sp._palSeq && sp._palSeq.length > 0) return true; // ①
            const b = sp._battler;
            if (!b) continue;
            if (b._palFlashUntil && t < b._palFlashUntil) return true; // ②
            if (b._palHurtAt && t - b._palHurtAt < 6 * battleMs()) return true; // ③
            if (b.isDead && b.isDead() &&
                sp._palDeathAt && sp.opacity > 0) return true; // ④
        }
        return false;
    };

    const _battleManagerIsBusy = BattleManager.isBusy;
    BattleManager.isBusy = function () {
        if (_battleManagerIsBusy.call(this)) return true;
        const ss = this._spriteset;
        if (!ss || !ss.isPalSequenceBusy) return false;
        // 行动阶段且尚有目标未结算：放行结算。伤害必须在挥砍【命中帧】附近结算，
        // 若等攻击者整套序列（含蓄力/收招回程 ≈19 战斗帧）播完才结算，所有以
        // "行动开始起算帧数"校准的命中估算（popupDelay ≈12 帧）会整体顺延到
        // 收招之后 —— 飘字/提亮/死亡渐隐全部后置，表现为"敌人先消失、数字才飘"。
        // 命中表现的绝对时刻由 hitAt()（行动开始时刻 + 帧数估算）锚定，与结算
        // 发生在哪一帧解耦。序列/受击/渐隐忙闲只用于"回合阶段"卡下一个行动者
        // 出手（fight.c 整场严格串行：前一手收招完毕才轮到下一个）。
        if (this._phase === "action" && this._targets && this._targets.length > 0) return false;
        return ss.isPalSequenceBusy();
    };

    //=============================================================================
    // 出手前重验攻击目标（fight.c 3500-3507）
    // --------------------------------------------------------------------------
    // 原版：攻击动作执行前，若记录的目标槽位已空（敌人已死），按
    // PAL_BattleSelectAutoTargetFrom 自动改选活口 —— 围攻/手动选的目标
    // 在轮到自己出手前被队友击毙时，不会对着一个不存在的敌人挥刀。
    // 重选顺序：先沿用上次手动选敌槽位（iPrevEnemyTarget），再从原槽位起
    // 向后环形找第一个活口；全场无活口则不改（胜负判定正在等收尾演出）。
    //=============================================================================

    const _startActionRetarget = BattleManager.startAction;
    BattleManager.startAction = function () {
        const action = this._action;
        const subject = this._subject;
        if (action && action.isAttack && action.isAttack() &&
            subject && subject.isActor && subject.isActor() &&
            !PalBattleAnim.isAttackAll(subject)) {
            const troop = $gameTroop.members();
            const cur = troop[action._targetIndex];
            if (!cur || !cur.isAlive()) {
                const prev = this._palLastTarget | 0;
                let idx = (troop[prev] && troop[prev].isAlive()) ? prev : -1;
                if (idx < 0) {
                    const begin = action._targetIndex >= 0 ? action._targetIndex : 0;
                    for (let k = 0; k < troop.length; k++) {
                        const i = (begin + k) % troop.length;
                        if (troop[i] && troop[i].isAlive()) { idx = i; break; }
                    }
                }
                if (idx >= 0) action.setTarget(idx);
            }
        }
        _startActionRetarget.call(this);
    };

    //=============================================================================
    // 动作序列构建（对照 fight.c）
    //=============================================================================

    // 敌人普攻（fight.c 4987-5130）
    PalBattleAnim.buildEnemyAttack = function (sprite, meta, targetSprite) {
        const steps = [];
        // 前摇：施法帧区，每帧 2 战斗帧
        for (let i = 0; i < meta.magic; i++) {
            steps.push({ frame: meta.idle + i }, { wait: 2 * battleMs() });
        }
        // 前移 (3-施法帧数) 步，每步 (-2,-1) PAL 单位
        const appr = Math.max(0, 3 - meta.magic);
        if (appr > 0) {
            steps.push({ moveAbs: [-appr * 6, -appr * 3], ms: appr * battleMs() });
        }
        steps.push({ wait: battleMs() });
        // 跳到目标旁 (目标x-132, 目标y-48)
        let ex = 0, ey = 0;
        if (targetSprite) {
            ex = targetSprite.x - 132 - sprite._homeX;
            ey = targetSprite.y - 48 - sprite._homeY;
        }
        if (meta.attack === 0) {
            // 无攻击帧区：用待机最后一帧
            steps.push({ frame: meta.idle - 1, moveAbs: [ex, ey], ms: 30 }, { wait: 2 * battleMs() });
        } else {
            // 攻击帧区 [idle+magic-1, idle+magic+attack-1]，每帧 actWait 战斗帧
            for (let i = 0; i <= meta.attack; i++) {
                steps.push({
                    frame: Math.min(meta.idle + meta.magic + i - 1, meta.pngs - 1),
                    moveAbs: [ex, ey], ms: 30
                }, { wait: meta.actWait * battleMs() });
            }
        }
        // 撤回原位、恢复待机
        steps.push({ moveAbs: [0, 0], ms: 2 * battleMs() }, { frame: 0 }, { wait: battleMs() });
        return steps;
    };

    // 本次施法的特效时序（取自 palBattleMagic 的同一张仙术表）
    //   fireDelay : 特效播到第几帧，施法者才切释放动作（fight.c 2932-2938）
    //   frameMs   : 特效每帧时长 (wSpeed+5)*10（fight.c 2729）
    //   duration  : 特效总时长 l*frameMs（fight.c 2661-2664）
    PalBattleAnim.spellTiming = function (sprite) {
        const M = window.PalBattleMagic;
        const act = sprite && sprite._palCastAction;
        const item = act && act.item ? act.item() : null;
        const meta = item && window.PalBattleCore ? PalBattleCore.parseMeta(item) : null;
        if (!M || !meta) return { fireDelay: 0, frameMs: 40, duration: 0 };
        return {
            fireDelay: M.fireDelay(meta),
            frameMs: M.frameMs(meta),
            duration: M.effectDuration(meta)
        };
    };

    // 敌人施法（fight.c 4690-4717 前摇 + 2847-3069 特效）
    // ⚠ 释放动作（攻击帧区）与特效的相对关系由该仙术的 wFireDelay 决定，两条分支不同：
    //   fireDelay == 0 → 攻击帧区整段在特效【之前】播完（fight.c 4709-4717），
    //                    特效期间敌人停在攻击动作末帧；
    //   fireDelay >  0 → 特效先起，播到第 fireDelay 帧敌人才开始播攻击帧区，
    //                    两者并行；帧号 = idle+magic+(i-fireDelay)（fight.c 2932-2938）。
    //                    这就是"先吟唱、等法术打到身上才变形挥招"的观感来源。
    //   旧实现一律按 fireDelay==0 且把攻击帧区放在特效之后，
    //   → fireDelay>0 的仙术（mid 10/21/23/30/45/55/58/70…）释放动作早了 fireDelay 帧。
    PalBattleAnim.buildEnemyMagic = function (sprite, meta) {
        const steps = [];
        const tm = PalBattleAnim.spellTiming(sprite);
        const atk = i => Math.min(meta.idle + meta.magic + i, meta.pngs - 1);
        // 前移 +12,+6 再 +4,+2（PAL 单位 ×3）
        steps.push({ moveAbs: [36, 18], ms: battleMs() }, { wait: battleMs() });
        steps.push({ moveAbs: [48, 24], ms: battleMs() }, { wait: battleMs() });
        // 施法帧区（吟唱，fight.c 4697-4701）；无吟唱帧区时原版 delay 1 帧
        if (meta.magic > 0) {
            for (let i = 0; i < meta.magic; i++) {
                steps.push({
                    frame: Math.min(meta.idle + i, meta.pngs - 1)
                }, { wait: meta.actWait * battleMs() });
            }
        } else {
            steps.push({ wait: battleMs() });
        }

        if (tm.fireDelay <= 0) {
            // 攻击帧区先整段播完（原版 i-1 起步），再进特效
            for (let i = 0; i <= meta.attack; i++) {
                steps.push({ frame: atk(i - 1) }, { wait: meta.actWait * battleMs() });
            }
            steps.push({ spell: true });
            if (tm.duration > 0) steps.push({ wait: tm.duration });
        } else {
            // 特效先起，fireDelay 帧后敌人开始挥招，与特效并行播 attack 帧
            steps.push({ spell: true });
            steps.push({ wait: tm.fireDelay * tm.frameMs });
            for (let j = 0; j < meta.attack; j++) {
                steps.push({ frame: atk(j) }, { wait: meta.actWait * battleMs() });
            }
            // 攻击帧区播完但特效未完时，敌人停在末帧等特效（原版循环里不再变帧）
            const rest = tm.duration - (tm.fireDelay + meta.attack) * tm.frameMs;
            if (rest > 0) steps.push({ wait: rest });
        }
        steps.push({ moveAbs: [0, 0], ms: 2 * battleMs() }, { frame: 0 }, { wait: battleMs() });
        return steps;
    };

    // 我方普攻（fight.c 2076-2127：落点=目标右下方 +64,+20 PAL单位，挥砍时再前移 -26,-6）
    // 本项目世界坐标为 816px 宽（PAL 320 的 2.55 倍），+64,+20 ≈ +163,+51；
    // 为贴脸手感取 +150,+42，挥砍两段再前移共 -82,-18（原版 -26,-6 的 ×3  sprite 比例近似）。
    // multiTarget（全体攻击武器）：角色只从站位向前(-45,-18)探身原地挥砍（fight.c 2080-2093）。
    PalBattleAnim.buildActorAttack = function (sprite, targetSprite, multiTarget) {
        const steps = [{ frame: AF.PREP }, { wait: 4 * battleMs() }];
        if (multiTarget) {
            steps.push({ frame: AF.ATK1, moveAbs: [-45, -18], ms: 4 * battleMs() }, { wait: 2 * battleMs() });
            steps.push({ frame: AF.ATK2 }, { wait: 3 * battleMs() });
        } else if (targetSprite) {
            const dx = targetSprite.x + 150 - sprite._homeX;
            const dy = targetSprite.y + 42 - sprite._homeY;
            steps.push({ frame: AF.ATK1, moveAbs: [dx, dy], ms: 5 * battleMs() }, { wait: 2 * battleMs() });
            steps.push({ frame: AF.ATK1, moveAbs: [dx - 34, dy - 8], ms: battleMs() }, { wait: battleMs() });
            steps.push({ frame: AF.ATK2, moveAbs: [dx - 82, dy - 18], ms: battleMs() }, { wait: 3 * battleMs() });
        } else {
            steps.push({ frame: AF.ATK1 }, { wait: 2 * battleMs() }, { frame: AF.ATK2 }, { wait: 3 * battleMs() });
        }
        steps.push({ moveAbs: [0, 0], ms: 5 * battleMs() });
        return steps;
    };

    // 当前行动的攻击次数（玄冥宝刀等：特征码34 攻击次数+ / kStatusDualAttack → 打 2 轮）
    PalBattleAnim.attackRepeats = function (actor) {
        const action = BattleManager._action;
        if (action && actor && action.subject && action.subject() === actor &&
            action.isAttack && action.isAttack() && action.numRepeats) {
            return Math.max(1, Math.min(2, Math.floor(action.numRepeats())));
        }
        return 1;
    };

    // 组装我方攻击序列（支持二次攻击：两轮完整的冲刺-挥砍-撤回）
    // ⚠ _palTargets 里同一目标会按 numRepeats 重复出现（MZ 用 repeatTargets 实现
    // 攻击次数+，双龙剑/玄冥宝刀打单体时 = [敌, 敌]）——multi 必须按【去重后】的
    // 目标数判定，否则双击武器会被误判成"全体攻击"而走原地探身分支（只挪一小步）。
    PalBattleAnim.runActorAttack = function (actor, sprite) {
        const seen = new Set();
        const targets = (actor._palTargets || []).filter(t =>
            t && t.isAlive && t.isAlive() && !seen.has(t) && seen.add(t));
        const multi = targets.length > 1;
        const tSprite = multi ? null : PalBattleAnim.spriteOf(targets[0]);
        const repeats = PalBattleAnim.attackRepeats(actor);
        const steps = [];
        for (let t = 0; t < repeats; t++) {
            steps.push(...PalBattleAnim.buildActorAttack(sprite, tSprite, multi));
            if (t < repeats - 1) steps.push({ wait: 2 * battleMs() });
        }
        PalBattleAnim.runSeq(sprite, steps);
    };

    // 我方施法（fight.c 2338-2445 吟唱 + 2609-2844 释放）：{ spell:true } 为释放点
    // ⚠ 释放姿势（帧6）的保持时长 = 【特效时长】，不是固定值：
    //   98 版在 OffMagicAnim 开头就切帧6（fight.c 2654-2657），之后整个特效循环
    //   （i=0..l-1）里施法者都不再变帧，特效播多久就保持多久；特效结束后才轮到
    //   伤害数字与收招。旧实现固定 20 战斗帧（800ms），长特效（雪妖 6.7s、火神 4.3s）
    //   会出现"人已经收招归位了，特效还在打" —— 正是"下一人都动了、动画没播完"的观感。
    PalBattleAnim.buildActorMagic = function (sprite) {
        const tm = sprite ? PalBattleAnim.spellTiming(sprite) : null;
        const hold = tm && tm.duration > 0 ? tm.duration : 4 * battleMs();
        const steps = [];
        // 前移 4 小步，每步 -(4-i) PAL（×3 像素）、各占 1 战斗帧（fight.c 2363-2370）。
        // 每步都要 wait：原版释放点 = 4+2+10 = 16 帧（castOffset 640ms），缺步会整体提前。
        for (let i = 0; i < 4; i++) {
            steps.push({ moveAbs: [-(4 - i) * 3, -Math.round((4 - i) / 2 * 3)], ms: battleMs() },
                       { wait: battleMs() });
        }
        steps.push(
            { wait: 2 * battleMs() },                       // fight.c 2372
            { frame: AF.CHANT }, { wait: 10 * battleMs() }, // 吟唱（帧5 + 10 帧手部光效）
            { spell: true },                                // 释放点：法术动画自此开始
            { frame: AF.CAST }, { wait: hold },             // 释放（帧6，保持到特效播完）
            { moveAbs: [0, 0], ms: 4 * battleMs() }
        );
        return steps;
    };

    // 我用物品（fight.c 2289-2335）
    PalBattleAnim.buildActorItem = function () {
        return [
            { wait: 4 * battleMs() },
            { frame: AF.CHANT, moveAbs: [-45, -21], ms: battleMs() },
            { wait: 12 * battleMs() },
            { moveAbs: [0, 0], ms: 4 * battleMs() }
        ];
    };

    //=============================================================================
    // Sprite_Enemy：待机循环 / 异常冻结 / 死亡即消失 / 受击提亮
    //=============================================================================

    const _Sprite_Enemy_update = Sprite_Enemy.prototype.update;
    Sprite_Enemy.prototype.update = function () {
        const t = now();
        const dt = this._palLastT ? t - this._palLastT : 16.7;
        this._palLastT = t;
        this._palLastDt = dt;
        _Sprite_Enemy_update.call(this);
        updateSeq(this, dt);
        const b = this._enemy;
        // 被队友挡下时的反震（fight.c 5092-5094：pos -= (10,8)，持续 1 战斗帧）
        if (b && b._palRecoilAt) {
            const e = t - b._palRecoilAt;
            if (e >= 0 && e < battleMs()) {
                this.x += PAL98_COVER.enemyRecoil[0] * 3;
                this.y += PAL98_COVER.enemyRecoil[1] * 3;
            }
        }
        const dead = !!(b && b.isDead && b.isDead());
        // 死亡表现（原地渐隐）启动条件对齐原版 PostActionCheck：等全场动作序列
        // 与法术特效全部播完再开始（原版在行动收尾才撤走尸体，数字已飘了大半）。
        // 此前只查受害者自己的序列（受害者没在演动作 → 恒不忙），渐隐从伤害
        // 结算帧就开始，数字还没出敌人就没了。
        const deathFading = dead && !PalBattleAnim.anySequenceBusy() &&
            !(window.PalBattleMagic && PalBattleMagic.isEffectPlaying());
        // 受击提亮（原版 iColorShift=6，fight.c 2201-2227/5080-5088）。注意原版
        // 不是闪红：调色板低 4 位 +6 = 同一色相内提亮 6 阶（palcommon.c RLEBlitWith
        // ColorShift：b = (pixel & 0x0F) + shift，越界钳制）。这里用加性色调近似，
        // 可调：控制台 PalBattleAnim.HIT_TONE = [r, g, b, gray]。
        // _palFlashFrom 支持把闪显推迟到未来时刻（仙术伤害在法术动画播完后才提亮，
        // palBattleMagic 会改写这两个时间戳）
        if (b && b._palFlashUntil && !deathFading) {
            if (t >= (b._palFlashFrom || 0) && t < b._palFlashUntil) {
                if (!this._palFlashing) {
                    this._palFlashing = true;
                    this.setColorTone(PalBattleAnim.HIT_TONE);
                }
            } else if (this._palFlashing) {
                this._palFlashing = false;
                this.setColorTone([0, 0, 0, 0]);
            }
        }
        // 敌人死亡（用户对照原版确认）：不变黑。受击/攻击等动作序列播完后
        // 原地直接渐隐约 0.6s 消失；动作播完前不动死亡表现（否则受击动画被盖掉）。
        // 直接驱动 opacity/colorTone（在 updatePosition 之后执行，当帧立即生效；
        // 不依赖 collapse 效果链，中毒死亡等未请求 effect 的路径也能播）。
        if (dead) {
            this._palFlashing = false;
            if (deathFading) {
                if (!this._palDeathAt) this._palDeathAt = t;
                const e = t - this._palDeathAt;
                const k = Math.min(1, e / 600);
                this.opacity = Math.round(255 * (1 - k));
                if (!this._palDeathToneReset) {
                    this._palDeathToneReset = true;
                    this.setColorTone([0, 0, 0, 0]); // 清掉残留的受击提亮色调
                }
            }
        } else if (this._palDeathAt) {
            this._palDeathAt = 0;
            this._palDeathToneReset = false;
            this.opacity = 255;
            this.setColorTone([0, 0, 0, 0]);
            this.y = this._homeY + this._offsetY;
        }
    };

    Sprite_Enemy.prototype.updateBitmap = function () {
        // 帧完全由 updateFrame 管理
    };

    Sprite_Enemy.prototype.updateFrame = function () {
        Sprite_Battler.prototype.updateFrame.call(this);
        const b = this._enemy;
        if (!b || !b.battlerName) return;
        if (!this._palBase) {
            this._palBase = frameBase(b.battlerName());
            const meta = b.enemy && b.enemy() ? enemyAnimMeta(b) : null;
            this._palMaxFrame = meta ? meta.pngs - 1 : 0;
        }
        if (!this._palBase) return; // 非 PAL 命名敌人：保持默认图
        const meta = enemyAnimMeta(b);
        if (!meta) return;
        if (PalBattleAnim.isBusy(this)) return; // 动作序列控制中
        if (b.isDead()) return; // 死亡：半透明升天渐隐由 updateCollapse 驱动
        // 睡眠/定身：固定第 0 帧
        for (const id of SLEEP_STATES) if (b.isStateAffected(id)) return setEnemyFrame(this, 0);
        for (const id of PARA_STATES) if (b.isStateAffected(id)) return setEnemyFrame(this, 0);
        // 待机循环：每 idleSpeed 个战斗帧推进一帧
        this._palIdleT = (this._palIdleT || 0) + (this._palLastDt || 16.7);
        const frame = Math.floor(this._palIdleT / (meta.idleSpeed * battleMs())) % meta.idle;
        setEnemyFrame(this, frame);
    };

    // 帧图加载失败告警（排查隐形敌人）
    const _palSetEnemyFrame = setEnemyFrame;
    setEnemyFrame = function (sprite, idx) {
        _palSetEnemyFrame(sprite, idx);
        if (sprite.bitmap && sprite.bitmap.isError && sprite.bitmap.isError() && !sprite._palErrReported) {
            sprite._palErrReported = true;
            console.warn("[palBattleAnim] 敌人帧图加载失败: img/sv_enemies/" + sprite._palFrameFile + ".png");
        }
    };
    PalBattleAnim.setEnemyFrame = setEnemyFrame;

    // 敌人死亡的视觉表现由上方 Sprite_Enemy.update 直驱（半透明升天渐隐）。
    // 这里把 MZ 原版 collapse 效果（blendMode=1 乘法渐隐）整体禁用，避免与我方
    // 的 y/opacity 驱动互相覆盖；效果链本身保留（_effectDuration 倒数归零后自动清除）。
    Sprite_Enemy.prototype.startCollapse = function () {};
    Sprite_Enemy.prototype.updateCollapse = function () {};

    //=============================================================================
    // Sprite_Actor：状态帧 / 受击击退 / 胜利姿势
    //=============================================================================

    const _Sprite_Actor_update = Sprite_Actor.prototype.update;
    Sprite_Actor.prototype.update = function () {
        const t = now();
        this._palDt = this._palPrevT ? t - this._palPrevT : 16.7;
        this._palPrevT = t;
        _Sprite_Actor_update.call(this);
        updateSeq(this, this._palDt);
        const a = this._actor;
        // 受击提亮（原版 iColorShift=6，仅 1 战斗帧：fight.c 5080-5088；
        // 仙术伤害由 palBattleMagic 把 _palFlashFrom/Until 推迟到特效播完）
        if (a && a._palFlashUntil) {
            const flashing = t >= (a._palFlashFrom || 0) && t < a._palFlashUntil;
            if (flashing && !this._palFlashing) {
                this._palFlashing = true;
                this.setColorTone(PalBattleAnim.HIT_TONE);
            } else if (!flashing && this._palFlashing) {
                this._palFlashing = false;
                this.setColorTone([0, 0, 0, 0]);
            }
        }
        // 受击 / 自动格挡 后退一步（fight.c 5097-5112：(+8,+4) 再 (+2,+1) PAL 单位）
        // 原版两种情形位移完全相同：都是 (+10,+5) PAL = (+30,+15) px，随后归位。
        if (a && a._palHurtAt && t >= a._palHurtAt && this._palHurtStamp !== a._palHurtAt && a.hp > 0 && !a.isDead()) {
            this._palHurtStamp = a._palHurtAt;
            this.startMove(PAL98_ANIM.stepBack[0], PAL98_ANIM.stepBack[1], PAL98_ANIM.stepBackFrames);
            this._palHurtReturnAt = t + PAL98_ANIM.stepBackHoldMs;
        }
        if (this._palHurtReturnAt && t > this._palHurtReturnAt && !PalBattleAnim.isBusy(this)) {
            this.startMove(0, 0, PAL98_ANIM.returnFrames);
            this._palHurtReturnAt = 0;
        }
        // 自动格挡（Miss/闪避）：摆防御姿势帧3 + 同样后退一步（fight.c 5023-5027 / 5097-5112）
        if (a && a._palDodgeAt && this._palDodgeStamp !== a._palDodgeAt && a.hp > 0 && !a.isDead()) {
            this._palDodgeStamp = a._palDodgeAt;
            this.startMove(PAL98_ANIM.stepBack[0], PAL98_ANIM.stepBack[1], PAL98_ANIM.stepBackFrames);
            this._palDodgeReturnAt = t + PAL98_ANIM.stepBackHoldMs;
        }
        if (this._palDodgeReturnAt && t > this._palDodgeReturnAt && !PalBattleAnim.isBusy(this)) {
            this.startMove(0, 0, PAL98_ANIM.returnFrames);
            this._palDodgeReturnAt = 0;
        }
        // 队友掩护（fight.c 5012-5027）：挪到受击者身前 + 防御姿势，随后归位。
        // _palCoverAt 支持未来时刻 —— 让掩护者刚好在敌人落刀那一刻到位。
        if (a && a._palCoverAt && t >= a._palCoverAt &&
            this._palCoverStamp !== a._palCoverAt && a.hp > 0 && !a.isDead()) {
            this._palCoverStamp = a._palCoverAt;
            this.startMove(a._palCoverX || 0, a._palCoverY || 0, ticks(PAL98_COVER.inMs));
            if (a._palCoverSe) {
                PalBattleCore.playPalSe(a._palCoverSe); // rgwCoverSound（fight.c 5014）
                a._palCoverSe = 0;
            }
            this._palCoverReturnAt = t + PAL98_COVER.inMs + PAL98_COVER.holdMs;
        }
        if (this._palCoverReturnAt && t > this._palCoverReturnAt && !PalBattleAnim.isBusy(this)) {
            this.startMove(0, 0, PAL98_ANIM.returnFrames);
            this._palCoverReturnAt = 0;
        }
    };

    // 项目里 img/sv_actors/ 下的文件【全部】是 PAL 帧组格式（<组>-<帧>.png，如 3-1.png），
    // 不存在 MZ 默认的 SV 立绘。所以"非 PAL 角色回退 MZ 原逻辑"这条分支只会去
    // loadSvActor("Actor1_2") → 404；而 MZ 的 ResourceHandler 一旦失败就调
    // Graphics.printError 弹出 "Failed to load" 错误层，把整个游戏画面挡住。
    // 初始队伍是 [3,7,8]，姬三娘/柳媚娘的 battlerName 还是 MZ 编辑器默认残留值
    // （Actor1_2 / Actor1_3）→ 新开游戏第一场战斗就必现。
    // 默认关掉这条回退：立绘留空 + 控制台一条 warn。
    // 哪天真要做 MZ SV 立绘，把开关打开（同时把 battlerName 改成真实存在的文件名）。
    const FALLBACK_SV_ACTOR = false;

    Sprite_Actor.prototype.updateBitmap = function () {
        // 帧完全由 updateFrame 管理（PAL 角色）；非 PAL 角色按上面的开关决定是否回退
        if (this._actor && !frameBase(this._actor.battlerName())) {
            if (!FALLBACK_SV_ACTOR) {
                const name = this._actor.battlerName();
                if (name && this._warnedSvName !== name) {
                    this._warnedSvName = name;
                    console.warn("[palBattleAnim] 角色 " + this._actor.actorId() +
                        "（" + this._actor.name() + "）battlerName=" + name +
                        " 不是 PAL 帧组格式（应形如 3-1），项目也没有 MZ SV 立绘 → " +
                        "战斗中该角色立绘为空。请到 Actors.json 把 battlerName 配成 PAL 帧组。");
                }
                return;
            }
            Sprite_Battler.prototype.updateBitmap.call(this);
            const name = this._actor.battlerName();
            if (this._battlerName !== name) {
                this._battlerName = name;
                this._mainSprite.bitmap = ImageManager.loadSvActor(name);
                this._mainSprite.bitmap.addLoadListener(() => {
                    this._mainSprite.setFrame(0, 0, this._mainSprite.bitmap.width, this._mainSprite.bitmap.height);
                });
            }
        }
    };

    Sprite_Actor.prototype.updateFrame = function () {
        Sprite_Battler.prototype.updateFrame.call(this);
        const a = this._actor;
        if (!a || !a.battlerName) return;
        if (!frameBase(a.battlerName())) {
            // 非 PAL 角色：整图显示
            if (this._mainSprite.bitmap && this._mainSprite.bitmap.isReady()) {
                this._mainSprite.setFrame(0, 0, this._mainSprite.bitmap.width, this._mainSprite.bitmap.height);
            }
            return;
        }
        if (PalBattleAnim.isBusy(this)) return; // 动作序列控制中
        const t = now();
        let f = AF.IDLE;
        if (a.isDead()) {
            // 倒地时机：击杀伤害在命中时刻（与伤害数字同时）才倒地 ——
            // performDamage 里记下 _palDeathAt = hitAt()（命中帧绝对时刻）。
            // 之前用"全局特效播放中就摆 IDLE"的做法，会让尸体在【任何人】放仙术
            // 特效期间反复站起来、特效结束再倒下（用户反馈"死掉的角色还会站起来"）。
            const deathAt = a._palDeathAt || 0;
            if (t >= deathAt) {
                f = AF.DEAD;
            } else {
                // 命中时刻前保持受击姿势（先挨打、再倒地，与伤害数字同帧）
                f = (a._palHurtAt && t >= a._palHurtAt && t - a._palHurtAt < 6 * battleMs())
                    ? AF.HURT : AF.IDLE;
            }
        } else if (SLEEP_STATES.some(id => a.isStateAffected(id)) || a.hp < Math.min(100, a.mhp / 5)) {
            f = AF.SLEEP; // 昏睡 / 濒死（HP < min(100, maxHP/5)，fight.c 47-48）
        } else if (a.isStateAffected(GUARD_STATE_ID)) {
            f = AF.GUARD;
        } else if (a._palGuardAt && t >= a._palGuardAt && t - a._palGuardAt < PAL98_COVER.guardMs) {
            f = AF.GUARD; // 队友掩护姿势（fight.c 5016：wCurrentFrame = 3）
        } else if (a._palDodgeAt && t - a._palDodgeAt < PAL98_ANIM.blockPoseMs) {
            f = AF.GUARD; // 自动格挡姿势（fight.c 5023-5027：wCurrentFrame = 3）
        } else if (a._palHurtAt && t >= a._palHurtAt && t - a._palHurtAt < 6 * battleMs()) {
            f = AF.HURT;
        }
        setActorFrame(this, f);
    };

    //=============================================================================
    // Game_Actor / Game_Enemy：动作分发
    //=============================================================================

    Game_Actor.prototype.performAction = function (action) {
        Game_Battler.prototype.performAction.call(this, action);
        if (!frameBase(this.battlerName())) return; // 客串角色保持默认
        const sprite = PalBattleAnim.spriteOf(this);
        if (!sprite) return;
        // 把本次动作绑到【施法者自己的精灵】上。
        // BattleManager._action 是全局的，CTB 下多名角色可能同时处于行动中，
        // 后者的 _action 会覆盖前者 —— 于是后一位施法者放的是前一位的法术特效
        // （症状：赵灵儿对敌放回梦、林月如对自己放凝神归元，林月如却放回梦）。
        sprite._palCastAction = action;
        if (action.isAttack()) {
            PalBattleAnim.runActorAttack(this, sprite);
        } else if (action.isGuard()) {
            // 防御姿势由状态（Guard）驱动
        } else if (action.isMagicSkill() || action.isSkill()) {
            if (action._palCoop && window.PalBattleCoop && PalBattleCoop.buildCoopCasterSteps) {
                // 合体技发动者：替换标准 buildActorMagic（合体时发动者不走常规前移）。
                // 召唤型（装备灵珠）走 fight.c 3865-3869 的另一条分支：
                // 只有发动者 PreMagicAnim(fSummon=TRUE)，不做合体站位。
                const coopSeq = PalBattleCoop.isSummonSkill(action.item())
                    ? PalBattleCoop.buildCoopSummonSteps(sprite)
                    : PalBattleCoop.buildCoopCasterSteps(sprite);
                PalBattleAnim.runSeq(sprite, coopSeq);
            } else {
                PalBattleAnim.runSeq(sprite, PalBattleAnim.buildActorMagic(sprite));
            }
        } else if (action.isItem()) {
            PalBattleAnim.runSeq(sprite, PalBattleAnim.buildActorItem());
        }
    };

    // 行动开始时快照目标（BattleManager._targets 在 invoke 过程中会被 shift 清空）
    Game_Actor.prototype.performActionStart = function (action) {
        Game_Battler.prototype.performActionStart.call(this, action);
        this._palTargets = (BattleManager._targets || []).slice();
    };

    Game_Actor.prototype.performAttack = function () {
        // 普通攻击与反击（反击也走仙剑挥砍序列，避免默认武器动画清掉行动）
        if (!frameBase(this.battlerName())) return;
        const sprite = PalBattleAnim.spriteOf(this);
        if (!sprite) return;
        if (!this._palTargets || this._palTargets.length === 0) {
            this._palTargets = BattleManager._subject ? [BattleManager._subject] : [];
        }
        PalBattleAnim.runActorAttack(this, sprite);
    };

    Game_Actor.prototype.performDamage = function () {
        Game_Battler.prototype.performDamage.call(this);
        SoundManager.playActorDamage();
        // 受击帧/击退/提亮对齐【命中帧】（原版 fight.c:5054-5080 全在命中当帧发生）。
        // 命中时刻取 hitAt()（行动开始时刻 + 帧数估算的绝对锚点），与结算发生在
        // 第几帧解耦；非行动阶段（中毒等）hitAt 退回当前时刻，不推迟。
        // 仙术由 palBattleMagic 在命中锚点上另行覆盖这两个时间戳。
        const t = PalBattleAnim.hitAt();
        this._palHurtAt = t; // 受击帧 + 击退
        // 受击提亮：原版 iColorShift=6 仅 1 个战斗帧（fight.c 5080-5088）
        this._palFlashFrom = t;
        this._palFlashUntil = t + battleMs();
        // 致死一击：记下倒地时刻 = 命中时刻（与伤害数字同帧倒地，见 updateFrame）
        if (this.isDead()) {
            this._palDeathAt = t;
        }
    };

    //=============================================================================
    // 受击 / 格挡 / 恢复 的表现链（fight.c 5023-5027 / 5056-5078 / 5097-5112）
    //
    // palBattle.js 把 displayMiss / displayEvasion / displayHpDamage 整个清空以去掉
    // "Miss"、伤害数字等文字，结果 MZ 日志队列里的 performMiss / performEvasion /
    // performDamage / performRecovery 也一起被干掉了 —— 我方没有受伤帧与击退、
    // 敌人挨打没有提亮与颤抖、Miss 也没有格挡姿势。
    // 这里改为 override displayDamage 直接同步触发动作：不打任何文字，也不进日志队列
    //（日志队列每条之间会插入 wait，会把群体攻击的受击表现拆成逐个播放）。
    //=============================================================================

    Window_BattleLog.prototype.displayDamage = function (target) {
        const result = target.result();
        if (result.missed) {
            // 原版没有 "Miss" 文字：被打者摆自动防御姿势帧3（Game_Actor.performMiss）
            if (result.physical) target.performMiss();
        } else if (result.evaded) {
            if (result.physical) target.performEvasion();
            else target.performMagicEvasion();
        } else if (result.hpAffected) {
            if (result.hpDamage > 0 && !result.drain) target.performDamage();
            if (result.hpDamage < 0) target.performRecovery();
        }
    };

    //=============================================================================
    // Miss / 闪避（fight.c 4938 / 5023-5027）
    //=============================================================================

    Game_Actor.prototype.performMiss = function () {
        SoundManager.playMiss();
        // 格挡姿势/后退对齐命中帧（fight.c:5023-5027 在攻击方命中当帧判定）
        this._palDodgeAt = PalBattleAnim.hitAt();
    };

    Game_Actor.prototype.performEvasion = function () {
        SoundManager.playEvasion();
        this._palDodgeAt = PalBattleAnim.hitAt();
    };

    Game_Actor.prototype.performMagicEvasion = function () {
        SoundManager.playMagicEvasion();
        this._palDodgeAt = PalBattleAnim.hitAt();
    };

    //=============================================================================
    // 队友掩护：掩护者走位 + 防御姿势 + 掩护音效；敌人被挡下的反震
    // 判定时机由 palBattleCore.Game_Action#apply 决定，这里只做演出
    //=============================================================================

    PalBattleAnim.runCover = function (enemy, target, coverer) {
        const cs = PalBattleAnim.spriteOf(coverer);
        const ts = PalBattleAnim.spriteOf(target);
        const es = PalBattleAnim.spriteOf(enemy);
        // 让掩护者刚好在敌人落刀那一刻到位：以命中时刻倒推走位时长
        const at = (PalBattleAnim.hitAt ? PalBattleAnim.hitAt() : now()) - PAL98_COVER.inMs;
        if (cs) {
            const tx = ts ? ts._homeX : cs._homeX;
            const ty = ts ? ts._homeY : cs._homeY;
            coverer._palCoverX = tx - PAL98_COVER.offset[0] * 3 - cs._homeX;
            coverer._palCoverY = ty - PAL98_COVER.offset[1] * 3 - cs._homeY;
        }
        coverer._palCoverAt = at;
        coverer._palGuardAt = at;                       // 防御姿势（帧3）
        coverer._palCoverSe = PalBattleCore.noteTag(coverer, "coverSound");
        // 敌人被挡下的反震（fight.c 5092-5094：pos -= (10,8)，1 战斗帧后归位）
        if (es && enemy) enemy._palRecoilAt = at + PAL98_COVER.inMs;
        // 受击者：原版完全不动、不变帧（fight.c 5118 / 5088 都在 iCoverIndex==-1 分支里）
    };

    // 闪避不弹“Miss”文字（原版完全没有提示；敌我一致）
    Game_Battler.prototype.shouldPopupDamage = function () {
        const result = this._result;
        return result.hpAffected || result.mpDamage !== 0;
    };

    Game_Actor.prototype.performVictory = function () {
        this.setActionState("done");
        // 仙剑98原版战斗胜利后角色保持待机姿势（fight.c 回合姿态更新 → 帧0），无胜利姿势
    };

    Game_Enemy.prototype.performAction = function (action) {
        Game_Battler.prototype.performAction.call(this, action);
        const sprite = PalBattleAnim.spriteOf(this);
        if (!sprite) return;
        sprite._palCastAction = action; // 同上：特效取自己的动作，不用全局 _action
        const meta = enemyAnimMeta(this);
        if (!meta) return;
        const isPalMagic = action.isSkill() && action.item() && PalBattleCore.parseMeta(action.item());
        if (isPalMagic) {
            PalBattleAnim.runSeq(sprite, PalBattleAnim.buildEnemyMagic(sprite, meta));
        } else {
            const target = this._palTargets && this._palTargets[0];
            const tSprite = PalBattleAnim.spriteOf(target);
            // 二次攻击（特征码34/双击状态）：打两轮完整动画（fight.c 与原版一致），
            // 每轮的挥砍时长即 swingMs()，第二击伤害数字顺延到第二轮落刀帧
            const repeats = Math.max(1, Math.min(2, action.numRepeats ? action.numRepeats() : 1));
            const steps = [];
            for (let r = 0; r < repeats; r++) {
                steps.push(...PalBattleAnim.buildEnemyAttack(sprite, meta, tSprite));
                if (r < repeats - 1) steps.push({ wait: 2 * battleMs() });
            }
            PalBattleAnim.runSeq(sprite, steps);
        }
    };

    Game_Enemy.prototype.performActionStart = function (action) {
        Game_Battler.prototype.performActionStart.call(this, action);
        this._palTargets = (BattleManager._targets || []).slice();
        // 原版行动开始无白闪，取消默认 whiten
    };

    Game_Enemy.prototype.performDamage = function () {
        Game_Battler.prototype.performDamage.call(this);
        SoundManager.playEnemyDamage();
        // 提亮对齐【命中帧】（fight.c:2201-2207：挥砍特效第 1 帧 iColorShift=6）。
        // 仙术由 palBattleMagic 覆盖到特效播完。
        const t = PalBattleAnim.hitAt();
        this._palFlashFrom = t;
        this._palFlashUntil = t + 5 * battleMs(); // 受击提亮
    };

    //=============================================================================
    // 全体攻击武器（鞭类与玄冥宝刀）：原版装备脚本写入 rgwAttackAll=1
    //（长鞭/九截鞭/金蛇鞭/玄冥宝刀，Scripts.json 39668-39704 装备效果块），
    // 普攻直接打击敌方全体且不再逐个选择目标。
    // 玄冥宝刀另带 kStatusDualAttack（002D status8）= 攻击次数+1（特征码34），
    // 即全体打两轮（fight.c 2080-2093：fSecondAttack 时站位再前移 -12,-8）。
    // 武器备注：<AOE>
    //=============================================================================

    PalBattleAnim.isAttackAll = function (battler) {
        if (!battler || !battler.isActor || !battler.isActor()) return false;
        return battler.weapons().some(w => w && w.meta && w.meta.AOE !== undefined);
    };

    const _targetsForOpponents = Game_Action.prototype.targetsForOpponents;
    Game_Action.prototype.targetsForOpponents = function () {
        if (this.isAttack() && PalBattleAnim.isAttackAll(this.subject())) {
            return $gameTroop.aliveMembers();
        }
        return _targetsForOpponents.call(this);
    };

    // 全体攻击武器跳过目标选择（原版选择“攻击”后直接打击全体）
    const _onSelectAction = Scene_Battle.prototype.onSelectAction;
    Scene_Battle.prototype.onSelectAction = function () {
        const action = BattleManager.inputtingAction();
        if (action && action.isAttack && action.isAttack() &&
            action.subject && PalBattleAnim.isAttackAll(action.subject())) {
            action.setTarget(0);
            this.hideSubInputWindows();
            this.selectNextCommand();
            return;
        }
        _onSelectAction.call(this);
    };

    //=============================================================================
    // 伤害数字：延迟到命中帧弹出
    // --------------------------------------------------------------------------
    // 多段攻击（双龙剑/玄冥宝刀 特征码34、醉仙望月步）在【同一帧】内把几击全部
    // 结算，后一击的 apply 会 clearResult() 覆盖前一击 —— 若飘字到点才读 result()，
    // 前几击的数字会整个丢失（症状：双击武器只飘一个数字）。
    // 改为：startDamagePopup 时立即把本次结算【快照】进队列，各带绝对命中时刻
    // （同一 battler 的第 N 击顺延 N 个真实挥砍间隔 roundGapMs()，对齐第二圈动画的
    // 落刀帧 —— 序列时钟由 wait 步驱动，不能用 swingMs 全序列和）；
    // Sprite 侧每帧把到点的条目弹出，条目耗尽再清 MZ 标记。
    //=============================================================================

    const _startDamagePopup = Game_Battler.prototype.startDamagePopup;
    Game_Battler.prototype.startDamagePopup = function () {
        const r = this._result;
        if (r) {
            this._palPopupQueue = this._palPopupQueue || [];
            this._palPopupQueue.push({
                hpDamage: r.hpDamage, hpAffected: r.hpAffected,
                mpDamage: r.mpDamage, missed: r.missed, evaded: r.evaded,
                physical: r.physical, drain: r.drain,
                at: PalBattleAnim.hitAt() +
                    this._palPopupQueue.length * (PalBattleAnim.roundGapMs() || 0) +
                    PalBattleAnim.popupLag()
            });
        }
        _startDamagePopup.call(this); // MZ 的 _damagePopup 标记，驱动 updateDamagePopup 轮询
    };

    // 飘字额外延迟：默认 0 —— 原版伤害数字与受击提亮在【同一战斗帧】出现
    //（我方普攻 fight.c:2209：挥砍特效循环 i==0 那一帧调 PAL_BattleDisplayStatChange；
    //  敌方攻击 fight.c:5078：扣血、ShowNum、iColorShift=6 同帧），数字随后在
    // 受击动画期间上飘（寿命 10 战斗帧，uibattle.c:1753-1760），而不是等受击
    // 动画播完再出。设了正值会复现"击杀后敌人消失了数字才飘"。
    // 控制台 PAL98_POPUP_LAG = 100 可改绝对毫秒
    PalBattleAnim.popupLag = function () {
        return window.PAL98_POPUP_LAG != null ? window.PAL98_POPUP_LAG : 0;
    };

    // 多段攻击相邻两击的【真实】间隔（飘字顺延 / 喊声2 偏移共用）。
    // 序列时钟由 wait 步驱动 —— moveAbs 是即发即弃的补间，下一步 startMove 会
    // 覆盖还没跑完的位移，所以第二圈落刀帧距第一圈起点 = 一圈 wait + 圈间 2 帧
    //（单目标 12 帧 480ms / 全体 11 帧 440ms），比 swingMs 的全序列和快 ~1 个位移。
    // 取不到（无 sprite / 无目标）或敌方时退回 swingMs()。
    PalBattleAnim.roundGapMs = function () {
        const subject = BattleManager._subject;
        if (subject && subject.isActor && subject.isActor() &&
            PalBattleAnim.buildActorAttack) {
            const seen = new Set();
            const targets = (subject._palTargets || []).filter(t =>
                t && t.isAlive && t.isAlive() && !seen.has(t) && seen.add(t));
            const multi = targets.length > 1;
            const sprite = PalBattleAnim.spriteOf(subject);
            if (sprite && (multi || targets.length > 0)) {
                const tSprite = multi ? null : PalBattleAnim.spriteOf(targets[0]);
                const steps = PalBattleAnim.buildActorAttack(sprite, tSprite, multi);
                return steps.reduce((a, s) => a + (s.wait || 0), 0) + 2 * battleMs();
            }
        }
        return PalBattleAnim.swingMs() || 0;
    };

    // 一轮挥砍的完整时长：多段攻击的第 2 击在下一圈动画的落刀帧命中
    PalBattleAnim.swingMs = function () {
        const subject = BattleManager._subject;
        const action = BattleManager._action;
        if (!subject || !action || !(action.isAttack && action.isAttack())) return 0;
        if (subject.isEnemy && subject.isEnemy()) {
            const meta = enemyAnimMeta(subject);
            if (!meta) return 0;
            const target = subject._palTargets && subject._palTargets[0];
            const steps = PalBattleAnim.buildEnemyAttack(
                PalBattleAnim.spriteOf(subject), meta, PalBattleAnim.spriteOf(target));
            return steps.reduce((a, s) => a + (s.wait || 0) + (s.ms || 0), 0);
        }
        // ⚠ 动作序列的时钟由 wait 步驱动（moveAbs 是即发即弃的补间，下一步
        // startMove 会覆盖在跑的位移）——「第一圈起点 → 第二圈落刀帧」=
        //   单目标：第一圈 wait(4+2+1+3) + 圈间 2 + 第二圈前缀 wait(4+2+1) = 19 帧
        //   （按步序列 ms 求和会得到 22 帧，那是位移不互相覆盖的理论值，真实更快）
        return 19 * battleMs();
    };

    // 本次行动「命中帧」的绝对时刻（performance.now() 域）。
    // popupDelay 的估算值以【行动开始】为基准（蓄力/冲刺/挥砍的帧数，见下），
    // 这里锚到 _palActionStartAt 上，与结算（apply）实际发生在第几帧解耦 ——
    // 结算帧受日志队列/位移忙闲影响在行动头几帧内浮动，若直接用"结算时刻+delay"，
    // 飘字/提亮会跟着结算帧漂移。palBattleMagic.spellDamageDelay 改为返回
    // "行动开始起算的总时长"后，本函数对仙术/普攻/道具统一成立。
    PalBattleAnim.hitAt = function () {
        const startAt = (BattleManager._phase === "action" && BattleManager._palActionStartAt) ||
            performance.now();
        return startAt + (PalBattleAnim.popupDelay() || 0);
    };

    // 命中帧距【行动开始】的毫秒数：敌方普攻在攻击帧区开始时命中，我方普攻在挥砍帧
    // （帧9）命中；仙术由 palBattleMagic 包一层（施法偏移+特效时长，同样以行动开始
    // 为基准）；道具在序列跑完后（fight.c:4369/4405）
    PalBattleAnim.popupDelay = function () {
        if (BattleManager._phase !== "action") return 0;
        const subject = BattleManager._subject;
        const action = BattleManager._action;
        if (!subject || !action) return 0;
        // 道具：buildActorItem 序列 4+1+12 帧跑完才执行脚本、再弹数字（fight.c:4369/4405）
        if (action.isItem && action.isItem()) return 17 * battleMs();
        if (!action.isAttack || !action.isAttack()) return 0;
        if (subject.isEnemy()) {
            const meta = enemyAnimMeta(subject);
            if (!meta) return 0;
            return Math.min(400, meta.magic * 2 * battleMs() + Math.max(0, 3 - meta.magic) * battleMs() + battleMs());
        }
        // 命中时刻估算：敌方普攻在攻击帧区开始时命中；
        // 我方单目标=蓄力4帧+冲刺5帧+逼近2帧+挥砍入身1帧≈12帧；
        // 全体攻击=蓄力4帧+探身4帧+待击2帧≈10帧（fight.c 2076-2127/2080-2093）
        // ⚠ 同 runActorAttack：_palTargets 按 numRepeats 重复，去重后再判单/全体
        const seen = new Set();
        const multi = Array.isArray(subject._palTargets) &&
            subject._palTargets.filter(t =>
                t && t.isAlive && t.isAlive() && !seen.has(t) && seen.add(t)).length > 1;
        return (multi ? 10 : 12) * battleMs();
    };

    // 到点弹出：把已到命中时刻的快照全部弹出（同一帧到达的多击一起迸出，
    // 对齐原版群体伤害同帧显示）；队列清空后才解除 MZ 的弹窗请求标记
    Sprite_Battler.prototype.setupDamagePopup = function () {
        const b = this._battler;
        if (!b || !b.isDamagePopupRequested || !b.isDamagePopupRequested()) return;
        const q = b._palPopupQueue;
        if (!q || q.length === 0) {
            b.clearDamagePopup();
            return;
        }
        while (q.length > 0 && q[0].at <= now()) {
            this.createDamageSprite(q.shift());
        }
        if (q.length === 0) b.clearDamagePopup();
    };

    //=============================================================================
    // 防御（Guard）：运行时伪技能 999，仅挂状态2（防御特征：防御力×2，与原版一致）
    //=============================================================================

    function ensurePalGuardSkill() {
        if (typeof $dataSkills === "undefined" || !$dataSkills) return null;
        if (!$dataSkills[PAL_GUARD_SKILL_ID]) {
            $dataSkills[PAL_GUARD_SKILL_ID] = {
                id: PAL_GUARD_SKILL_ID,
                name: "防御",
                iconIndex: 0,
                description: "",
                messageType: 1,
                message1: "",
                message2: "",
                occasion: 1,
                repeats: 1, // ⚠ MZ 字段名是 repeats（复数）：写成 repeat 会让 numRepeats()
                //   得 NaN → repeatTargets 循环 0 次 → makeTargets 返回空数组 →
                //   防御行动不执行任何目标，apply 不被调用，防御姿态/减伤全部失效
                requiredWtypeId1: 0,
                requiredWtypeId2: 0,
                scope: 11, // 使用者
                speed: 0,
                successRate: 100,
                hitType: 0,
                animationId: 0,
                damage: { critical: false, elementId: 0, formula: "0", type: 0, variance: 0 },
                effects: [],
                note: "",
                mpCost: 0,
                tpCost: 0,
                tpGain: 0
            };
        }
        return $dataSkills[PAL_GUARD_SKILL_ID];
    }

    Game_BattlerBase.prototype.guardSkillId = function () {
        ensurePalGuardSkill();
        return PAL_GUARD_SKILL_ID;
    };

    const _apply = Game_Action.prototype.apply;
    Game_Action.prototype.apply = function (target) {
        if (this.isGuard() && target.isActor && target.isActor()) {
            // 仙剑98：防御只进入防御姿态，状态2提供防御力×2（状态自带特征）
            const result = target.result();
            result.clear();
            result.used = true;
            target.addState(GUARD_STATE_ID);
            return;
        }
        _apply.call(this, target);
    };

    // 行动开始时解除防御姿态（原版 fDefending 持续到下次行动）
    const _startAction = BattleManager.startAction;
    BattleManager.startAction = function () {
        const subject = this._subject;
        if (subject && subject.isActor && subject.isActor() && subject.isStateAffected(GUARD_STATE_ID)) {
            subject.removeState(GUARD_STATE_ID);
        }
        _startAction.call(this);
    };
})();
