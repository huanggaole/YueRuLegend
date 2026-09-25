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
 * Miss/闪避（fight.c 4938/5023-5027）：无“Miss”字样，被打者摆防御姿势帧3，
 *   我方闪避者再向后小闪一步（原版无位移，此处为手感增强）。
 * 我方施法（fight.c 2363-2444）：前移4小步(共-30,-12) → 帧5吟唱(约10战斗帧) → 帧6释放。
 * 我用物品（fight.c 2289-2335）：前移(-45,-21) → 帧5 → 目标颜色闪烁。
 * 我方受击（fight.c 4861-5125）：帧4 + 击退(+27,+14再归位) + 红色闪烁；
 *   死亡后固定帧2；濒死(HP < min(100, maxHP/5)，fight.c 47-48)固定帧1。
 *
 * 其它：伤害数字延迟到命中帧弹出；防御(Guard)使用运行时伪技能999，挂状态2
 * （状态2自带“防御”特殊特征，防御力×2，与原版一致），行动开始时解除。
 */

(() => {
    const PalBattleAnim = (window.PalBattleAnim = {});
    const PalBattleCore = window.PalBattleCore;

    const BATTLE_MS = 40; // 原版战斗帧 1000/25 (battle.h BATTLE_FPS=25)
    const GUARD_STATE_ID = 2;
    const SLEEP_STATES = [10, 19]; // 昏睡3/昏睡5
    const PARA_STATES = [4, 5, 7]; // 定身5/定身4/定身
    const PAL_GUARD_SKILL_ID = 999;

    // 我方固定帧号
    const AF = {
        IDLE: 0, SLEEP: 1, DEAD: 2, GUARD: 3, HURT: 4,
        CHANT: 5, CAST: 6, PREP: 7, ATK1: 8, ATK2: 9, WIN: 10
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

    //=============================================================================
    // 动作序列构建（对照 fight.c）
    //=============================================================================

    // 敌人普攻（fight.c 4987-5130）
    PalBattleAnim.buildEnemyAttack = function (sprite, meta, targetSprite) {
        const steps = [];
        // 前摇：施法帧区，每帧 2 战斗帧
        for (let i = 0; i < meta.magic; i++) {
            steps.push({ frame: meta.idle + i }, { wait: 2 * BATTLE_MS });
        }
        // 前移 (3-施法帧数) 步，每步 (-2,-1) PAL 单位
        const appr = Math.max(0, 3 - meta.magic);
        if (appr > 0) {
            steps.push({ moveAbs: [-appr * 6, -appr * 3], ms: appr * BATTLE_MS });
        }
        steps.push({ wait: BATTLE_MS });
        // 跳到目标旁 (目标x-132, 目标y-48)
        let ex = 0, ey = 0;
        if (targetSprite) {
            ex = targetSprite.x - 132 - sprite._homeX;
            ey = targetSprite.y - 48 - sprite._homeY;
        }
        if (meta.attack === 0) {
            // 无攻击帧区：用待机最后一帧
            steps.push({ frame: meta.idle - 1, moveAbs: [ex, ey], ms: 30 }, { wait: 2 * BATTLE_MS });
        } else {
            // 攻击帧区 [idle+magic-1, idle+magic+attack-1]，每帧 actWait 战斗帧
            for (let i = 0; i <= meta.attack; i++) {
                steps.push({
                    frame: Math.min(meta.idle + meta.magic + i - 1, meta.pngs - 1),
                    moveAbs: [ex, ey], ms: 30
                }, { wait: meta.actWait * BATTLE_MS });
            }
        }
        // 撤回原位、恢复待机
        steps.push({ moveAbs: [0, 0], ms: 2 * BATTLE_MS }, { frame: 0 }, { wait: BATTLE_MS });
        return steps;
    };

    // 敌人施法（fight.c 4660-4717）
    PalBattleAnim.buildEnemyMagic = function (sprite, meta) {
        const steps = [];
        // 前移 +12,+6 再 +4,+2（PAL 单位 ×3）
        steps.push({ moveAbs: [36, 18], ms: BATTLE_MS }, { wait: BATTLE_MS });
        steps.push({ moveAbs: [48, 24], ms: BATTLE_MS }, { wait: BATTLE_MS });
        // 施法帧区
        for (let i = 0; i < meta.magic; i++) {
            steps.push({
                frame: Math.min(meta.idle + i, meta.pngs - 1)
            }, { wait: meta.actWait * BATTLE_MS });
        }
        // 施法后接攻击帧区（wFireDelay==0 时，原版绝大多数仙术如此）
        // { spell:true } 插在攻击帧区前 = 释放点，触发目标身上的法术动画
        steps.push({ spell: true });
        for (let i = 0; i <= meta.attack; i++) {
            steps.push({
                frame: Math.min(meta.idle + meta.magic + i - 1, meta.pngs - 1)
            }, { wait: meta.actWait * BATTLE_MS });
        }
        steps.push({ moveAbs: [0, 0], ms: 2 * BATTLE_MS }, { frame: 0 }, { wait: BATTLE_MS });
        return steps;
    };

    // 我方普攻（fight.c 2076-2127：落点=目标右下方 +64,+20 PAL单位，挥砍时再前移 -26,-6）
    // 本项目世界坐标为 816px 宽（PAL 320 的 2.55 倍），+64,+20 ≈ +163,+51；
    // 为贴脸手感取 +150,+42，挥砍两段再前移共 -82,-18（原版 -26,-6 的 ×3  sprite 比例近似）。
    // multiTarget（全体攻击武器）：角色只从站位向前(-45,-18)探身原地挥砍（fight.c 2080-2093）。
    PalBattleAnim.buildActorAttack = function (sprite, targetSprite, multiTarget) {
        const steps = [{ frame: AF.PREP }, { wait: 4 * BATTLE_MS }];
        if (multiTarget) {
            steps.push({ frame: AF.ATK1, moveAbs: [-45, -18], ms: 4 * BATTLE_MS }, { wait: 2 * BATTLE_MS });
            steps.push({ frame: AF.ATK2 }, { wait: 3 * BATTLE_MS });
        } else if (targetSprite) {
            const dx = targetSprite.x + 150 - sprite._homeX;
            const dy = targetSprite.y + 42 - sprite._homeY;
            steps.push({ frame: AF.ATK1, moveAbs: [dx, dy], ms: 5 * BATTLE_MS }, { wait: 2 * BATTLE_MS });
            steps.push({ frame: AF.ATK1, moveAbs: [dx - 34, dy - 8], ms: BATTLE_MS }, { wait: BATTLE_MS });
            steps.push({ frame: AF.ATK2, moveAbs: [dx - 82, dy - 18], ms: BATTLE_MS }, { wait: 3 * BATTLE_MS });
        } else {
            steps.push({ frame: AF.ATK1 }, { wait: 2 * BATTLE_MS }, { frame: AF.ATK2 }, { wait: 3 * BATTLE_MS });
        }
        steps.push({ moveAbs: [0, 0], ms: 5 * BATTLE_MS });
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
    PalBattleAnim.runActorAttack = function (actor, sprite) {
        const targets = (actor._palTargets || []).filter(t => t && t.isAlive && t.isAlive());
        const multi = targets.length > 1;
        const tSprite = multi ? null : PalBattleAnim.spriteOf(targets[0]);
        const repeats = PalBattleAnim.attackRepeats(actor);
        const steps = [];
        for (let t = 0; t < repeats; t++) {
            steps.push(...PalBattleAnim.buildActorAttack(sprite, tSprite, multi));
            if (t < repeats - 1) steps.push({ wait: 2 * BATTLE_MS });
        }
        PalBattleAnim.runSeq(sprite, steps);
    };

    // 我方施法（fight.c 2363-2444）：{ spell:true } 为释放点，触发目标身上的法术动画
    PalBattleAnim.buildActorMagic = function () {
        return [
            { moveAbs: [-30, -12], ms: 4 * BATTLE_MS }, // 前移4小步
            { wait: 2 * BATTLE_MS },
            { frame: AF.CHANT }, { wait: 10 * BATTLE_MS }, // 吟唱
            { spell: true },                               // 释放点：法术动画自此开始
            { frame: AF.CAST }, { wait: 20 * BATTLE_MS },  // 释放
            { moveAbs: [0, 0], ms: 4 * BATTLE_MS }
        ];
    };

    // 我用物品（fight.c 2289-2335）
    PalBattleAnim.buildActorItem = function () {
        return [
            { wait: 4 * BATTLE_MS },
            { frame: AF.CHANT, moveAbs: [-45, -21], ms: BATTLE_MS },
            { wait: 12 * BATTLE_MS },
            { moveAbs: [0, 0], ms: 4 * BATTLE_MS }
        ];
    };

    //=============================================================================
    // Sprite_Enemy：待机循环 / 异常冻结 / 死亡即消失 / 受击红闪
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
        const dead = !!(b && b.isDead && b.isDead());
        // 死亡表现（原地渐隐）启动后，受击红闪立即让位；此前红闪正常播放。
        const deathFading = dead && !PalBattleAnim.isBusy(this) &&
            !(window.PalBattleMagic && PalBattleMagic.isEffectPlaying());
        // 受击红闪（iColorShift=6）。_palFlashFrom 支持把闪显推迟到未来时刻
        //（仙术伤害在法术动画播完后才红闪，palBattleMagic 会改写这两个时间戳）
        if (b && b._palFlashUntil && !deathFading) {
            if (t >= (b._palFlashFrom || 0) && t < b._palFlashUntil) {
                if (!this._palFlashing) {
                    this._palFlashing = true;
                    this.setColorTone([255, -64, -64, 0]);
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
                    this.setColorTone([0, 0, 0, 0]); // 清掉残留的受击红闪色调
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
        const frame = Math.floor(this._palIdleT / (meta.idleSpeed * BATTLE_MS)) % meta.idle;
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
        // 受击击退（每段伤害触发一次）
        const a = this._actor;
        if (a && a._palHurtAt && t >= a._palHurtAt && this._palHurtStamp !== a._palHurtAt && a.hp > 0 && !a.isDead()) {
            this._palHurtStamp = a._palHurtAt;
            this.startMove(27, 14, 3);           // (+8,+4) PAL 单位
            this._palHurtReturnAt = t + 130;
        }
        if (this._palHurtReturnAt && t > this._palHurtReturnAt && !PalBattleAnim.isBusy(this)) {
            this.startMove(0, 0, 10);
            this._palHurtReturnAt = 0;
        }
        // 闪避后闪（与受击击退同向、幅度更小）
        if (a && a._palDodgeAt && this._palDodgeStamp !== a._palDodgeAt && a.hp > 0 && !a.isDead()) {
            this._palDodgeStamp = a._palDodgeAt;
            this.startMove(16, 8, 3);
            this._palDodgeReturnAt = t + 140;
        }
        if (this._palDodgeReturnAt && t > this._palDodgeReturnAt && !PalBattleAnim.isBusy(this)) {
            this.startMove(0, 0, 8);
            this._palDodgeReturnAt = 0;
        }
    };

    Sprite_Actor.prototype.updateBitmap = function () {
        // 帧完全由 updateFrame 管理（PAL 角色）；非 PAL 角色回退原逻辑
        if (this._actor && !frameBase(this._actor.battlerName())) {
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
        // 仙术特效播放中不切换死亡帧（等动画播完再倒地，与敌人渐隐同理）
        const fxPlaying = !!(window.PalBattleMagic && PalBattleMagic.isEffectPlaying());
        if (a.isDead() && !fxPlaying) {
            f = AF.DEAD;
        } else if (a.isDead() && fxPlaying) {
            f = AF.IDLE;
        } else if (SLEEP_STATES.some(id => a.isStateAffected(id)) || a.hp < Math.min(100, a.mhp / 5)) {
            f = AF.SLEEP; // 昏睡 / 濒死（HP < min(100, maxHP/5)，fight.c 47-48）
        } else if (a.isStateAffected(GUARD_STATE_ID)) {
            f = AF.GUARD;
        } else if (a._palDodgeAt && t - a._palDodgeAt < 6 * BATTLE_MS) {
            f = AF.GUARD; // 自动防御闪避姿势（fight.c 5023-5027）
        } else if (a._palHurtAt && t >= a._palHurtAt && t - a._palHurtAt < 6 * BATTLE_MS) {
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
        if (action.isAttack()) {
            PalBattleAnim.runActorAttack(this, sprite);
        } else if (action.isGuard()) {
            // 防御姿势由状态（Guard）驱动
        } else if (action.isMagicSkill() || action.isSkill()) {
            if (action._palCoop && window.PalBattleCoop && PalBattleCoop.buildCoopCasterSteps) {
                // 合体技发动者：走合体站位施法序列（fight.c 3877-3949），
                // 替换标准 buildActorMagic（合体时发动者不走常规前移）
                PalBattleAnim.runSeq(sprite, PalBattleCoop.buildCoopCasterSteps(sprite));
            } else {
                PalBattleAnim.runSeq(sprite, PalBattleAnim.buildActorMagic());
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
        this._palHurtAt = now(); // 受击帧 + 击退
    };

    //=============================================================================
    // Miss / 闪避：不显示“Miss”字样（原版被打者摆自动防御姿势帧3，无任何文字，
    // fight.c 5023-5027）；我方闪避者额外向后小闪一步（手感增强，原版无位移）
    //=============================================================================

    Game_Actor.prototype.performMiss = function () {
        SoundManager.playMiss();
        this._palDodgeAt = now();
    };

    Game_Actor.prototype.performEvasion = function () {
        SoundManager.playEvasion();
        this._palDodgeAt = now();
    };

    Game_Actor.prototype.performMagicEvasion = function () {
        SoundManager.playMagicEvasion();
        this._palDodgeAt = now();
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
        const meta = enemyAnimMeta(this);
        if (!meta) return;
        const isPalMagic = action.isSkill() && action.item() && PalBattleCore.parseMeta(action.item());
        if (isPalMagic) {
            PalBattleAnim.runSeq(sprite, PalBattleAnim.buildEnemyMagic(sprite, meta));
        } else {
            const target = this._palTargets && this._palTargets[0];
            PalBattleAnim.runSeq(sprite, PalBattleAnim.buildEnemyAttack(sprite, meta, PalBattleAnim.spriteOf(target)));
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
        this._palFlashFrom = now();
        this._palFlashUntil = now() + 5 * BATTLE_MS; // 受击红闪
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
    //=============================================================================

    const _startDamagePopup = Game_Battler.prototype.startDamagePopup;
    Game_Battler.prototype.startDamagePopup = function () {
        this._palPopupAt = now();
        this._palPopupDelay = PalBattleAnim.popupDelay();
        _startDamagePopup.call(this);
    };

    // 命中时刻估算：敌方普攻在攻击帧区开始时命中，我方普攻在挥砍帧(帧9)命中
    PalBattleAnim.popupDelay = function () {
        if (BattleManager._phase !== "action") return 0;
        const subject = BattleManager._subject;
        const action = BattleManager._action;
        if (!subject || !action || !action.isAttack || !action.isAttack()) return 0;
        if (subject.isEnemy()) {
            const meta = enemyAnimMeta(subject);
            if (!meta) return 0;
            return Math.min(400, meta.magic * 2 * BATTLE_MS + Math.max(0, 3 - meta.magic) * BATTLE_MS + BATTLE_MS);
        }
        // 命中时刻估算：敌方普攻在攻击帧区开始时命中；
        // 我方单目标=蓄力4帧+冲刺5帧+逼近2帧+挥砍入身1帧≈12帧；
        // 全体攻击=蓄力4帧+探身4帧+待击2帧≈10帧（fight.c 2076-2127/2080-2093）
        const multi = Array.isArray(subject._palTargets) &&
            subject._palTargets.filter(t => t && t.isAlive && t.isAlive()).length > 1;
        return (multi ? 10 : 12) * BATTLE_MS;
    };

    const _setupDamagePopup = Sprite_Battler.prototype.setupDamagePopup;
    Sprite_Battler.prototype.setupDamagePopup = function () {
        const b = this._battler;
        if (b && b.isDamagePopupRequested && b.isDamagePopupRequested() && b._palPopupAt) {
            if (now() - b._palPopupAt < (b._palPopupDelay || 0)) return; // 未到命中时刻
        }
        _setupDamagePopup.call(this);
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
                repeat: 1,
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
