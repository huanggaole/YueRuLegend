/*:
 * @target MZ
 * @plugindesc [v1.3] 仙剑98柔情版合体技（kBattleActionCoopMagic）：默认合体技/装备覆盖/消耗全员回合/发动者走合体站位按Y排序图层
 * @author AI Assistant
 *
 * @help
 * 复刻仙剑98柔情版合体技（对照 sdlpal fight.c / uibattle.c / global.c）：
 *
 * ⚠ 正名：合体技 = kBattleActionCoopMagic（battle.h:55），**不是**「围攻」。
 *   「围攻」= 杂项菜单里的 fAutoAttack（词条 word 56，uibattle.c 1386-1392），
 *   由 palBattleAuto.js 实现；两者是原版两套完全不同的机制。
 *
 * ===== 机制来源 =====
 * 1. 合体技归属（用户确认的 98 柔情版规则）：
 *    每个角色作为发动者都有【默认合体技】，写在角色备注 <palCoop:技能id>；
 *    装备灵珠/玉佛珠会【覆盖】默认合体技，优先级高于角色本体——
 *    玉佛珠→佛法无边(89) 风灵珠→风卷残云(20) 雷灵珠→狂雷(25)
 *    水灵珠→风雪冰天(29) 火灵珠→炼狱真火(36) 土灵珠→泰山压顶(41)
 *    圣灵珠→武神(57)。同穿多件时后扫描的装备覆盖先前的。
 *    默认合体技：李逍遥→合体气功(92) 赵灵儿→爆炸(87) 林月如→弦月斩1(45)
 *    阿奴→天女散花(61,毒系群体) 巫后→爆炸蛊(80) 盖罗娇→天女散花(61)。
 * 2. 指令盘（uibattle.c 811-817）：原版十字键位 上=攻击 左=仙术
 *    右=合体 下=杂项。本工程四按钮：右=合体、下=杂项菜单
 *    （围攻/道具/防御/逃跑/状态，见 palBattleMisc.js）。
 * 3. 发动条件（uibattle.c 308-321）：参战≥2人、全员体力≥最大体力/5、
 *    无昏睡/疯魔(混乱)/咒封/定身。不满足时按钮变红不可用。
 * 4. 发动即消耗【全部】参战者的行动轮次：发动合体技后不再询问其余角色，
 *    直接开始回合结算（fight.c 每人行动位 rgfCoop 标记，其余人行动轮空）。
 *    实现：beginCoopMagic 成功配置行动后置 BattleManager._pendingPalCoop，
 *    Scene_Battle.selectNextCommand 将其转为 _palCoopConsumeAll，
 *    BattleManager.selectNextActor 见标志则跳过其余输入直接 startTurn。
 * 5. 速度（fight.c 1531-1533）：合体技行动速度 = 发动者身法×10（抢先生效）。
 * 6. 代价（fight.c 3954-3967）：不耗真气，改为全体参战者扣体力，
 *    数值=该仙术的真气消耗字段，每人保底1点，静默扣除不弹数字。
 * 7. 伤害（fight.c 3982-3995）：威力 = Σ全体参战者(武力+灵力) / 4，
 *    代入标准仙术公式（基础差值/4 + 仙术基础伤害，五行修正）。
 * 8. 演出（fight.c 3856-4104）：【发动合体技后】全体参战者同步 6 步走到
 *    合体站位（发动者 rgwCoopPos[0]={208,157}，其余 {234,170}/{260,183}，
 *    PAL 坐标；同帧起跑，否则 BattleLog 的 waitForMovement 会拆成依次走位）；
 *    走到后发动者摆帧5/帧6 施法（buildCoopCasterSteps，替换标准前移施法序列），
 *    其余人参战者摆吟唱帧(帧5)；特效播完后一齐归位。
 *    群体技直接结算；单体技打开选敌。
 *
 * 需排在 palBattle / palBattleCore / palBattleAnim / palBattleTarget /
 * palBattleMagic 之后加载。
 */

(() => {
    const PalBattleCoop = (window.PalBattleCoop = {});
    const PalBattleCore = window.PalBattleCore;
    const PalBattleAnim = window.PalBattleAnim;
    const PalBattleMagic = window.PalBattleMagic;

    // 状态编号（data/States.json）
    const SLEEP_STATES = [10, 19];   // 昏睡3/昏睡5
    const CONFUSE_STATES = [9, 11];  // 疯魔/疯魔5（混乱）
    const PARA_STATES = [4, 5, 7];   // 定身5/定身4/定身
    const SEAL_STATE_ID = 6;         // 咒封

    // 合体施法站位（fight.c 3602 rgwCoopPos，PAL 320x200 坐标 → 屏幕按 boxWidth/320 缩放）
    const COOP_POS = [[208, 157], [234, 170], [260, 183]];
    if (window.PAL98_SPEED == null) window.PAL98_SPEED = 1;
    const battleMs = () => 40 / (window.PAL98_SPEED || 1);

    //=============================================================================
    // 演出参数（对照 sdlpal 逆向，可按需微调）
    //=============================================================================
    // D5 起手音效（fight.c 3875 AUDIO_PlaySound(29)）：
    //   98 柔情版运行时读的是 PAL98/Sounds.mkf 第 29 块（已导出为 audio/se/sfx029.ogg）。
    //   ⚠ DOS/SDL 版的 voc.mkf 编号体系与 98 版不同（实测只有 44% 的索引能对上），
    //     若想换成"DOS 版 29 号在 98 版里的对应音效"，波形匹配给出的是 sfx154。
    const COOP_START_SE = { name: "sfx029", volume: 90, pitch: 100, pan: 0 };
    // D4 发动者吟唱期的 iColorShift=6（fight.c 3943，调色板偏移 → 近似为整体提亮）
    const COOP_CASTER_TONE = [64, 64, 64, 0];
    // D7 收尾：特效播完后敌人颤抖 3 帧 + delay 5 帧（fight.c 4046-4047）
    const POST_MAGIC_MS = () => 3 * battleMs() + 5 * battleMs();

    //=============================================================================
    // 发动者施法序列（fight.c 3938-3949，发动合体技且走位完成后开始）：
    // 吟唱帧5 → 释放帧6 → { spell } 释放点 → 归位。
    // 走位由 stageCoopCast 与队友同步完成，本序列不含移动；替换标准 buildActorMagic。
    // 释放点前共 10 战斗帧（400ms），加走位 6 帧 ≈ castOffset 640ms（伤害延迟基准）。
    //=============================================================================

    // 合体技发动者序列（fight.c 3927-3951）：
    //   ① 全体先同步走位 6 帧
    //   ② 其余参战者【从队尾向队首】依次摆施法帧，每人间隔 3 帧
    //   ③ 发动者最后：帧5 停 5 帧 → 帧6 停 3 帧 → 释放（合体仙术动画）
    // 所以发动者的序列前面要等够 ①+② 的时间。
    PalBattleCoop.coopIntroWaits = function () {
        const others = Math.max(0, this.contributors().length - 1);
        return 6 * battleMs() + others * 3 * battleMs();
    };

    PalBattleCoop.buildCoopCasterSteps = function (sprite) {
        return [
            { wait: this.coopIntroWaits() },          // 等走位 + 其他参战者依次施法
            { frame: 5 }, { wait: 5 * battleMs() },    // 发动者吟唱（fight.c 3943-3945，带 iColorShift）
            { frame: 6 }, { wait: 3 * battleMs() },    // 发动者出招（fight.c 3947-3949）
            { wait: 1 * battleMs() },                  // D8 OffMagicAnim 开头 delay 1 帧（fight.c 2659）
            { spell: true },                          // 释放点：合体仙术动画自此开始
            { frame: 6 }, { wait: 20 * battleMs() },
            { moveAbs: [0, 0], ms: 6 * battleMs() }    // 走回原地（fight.c 4058-4072）
        ];
    };

    //=============================================================================
    // 召唤型合体技（装备灵珠 / 角色的合体技本体是 wType=9）
    // 原版走 fight.c 3865-3869 的【另一条分支】，与普通合体技完全不同：
    //   PAL_BattleShowPlayerPreMagicAnim(wPlayerIndex, TRUE);
    //   PAL_BattleShowPlayerSummonMagicAnim((WORD)-1, wObject);
    // 即：没有「音效29 + 全员走到 rgwCoopPos + 其余人依次摆帧5」那一套，只有
    // ① 发动者前移 4 小步（fight.c 2360-2369，每步 1 帧）
    // ② delay 2 帧 + 摆帧5（fight.c 2371-2378）
    // ③ fSummon=TRUE 所以【不播】10 帧手部光效（fight.c 2380-2442 整块跳过）
    // ④ delay 1 帧（fight.c 2444）→ 紧接 SummonMagicAnim
    // 前摇合计 7 帧 = 280ms（普通合体技是 17/20 帧，差别很大）。
    // 之后全员位置【不再改动】（fight.c 4049 明确 Summon 型没有归位循环，
    // 由 OffMagicAnim 尾部 fight.c 3065-3068 一次性把全员 pos 复原）。
    //=============================================================================

    // 前摇帧数（fight.c 2360-2444，fSummon=TRUE 分支）
    PalBattleCoop.COOP_SUMMON_INTRO_FRAMES = 4 + 2 + 1;

    // 该技能是否为召唤类合体技（Magics.csv 的 wType == kMagicTypeSummon == 9）
    PalBattleCoop.isSummonSkill = function (item) {
        const meta = item && PalBattleCore.parseMeta ? PalBattleCore.parseMeta(item) : null;
        return !!(meta && meta.mtype === 9);
    };

    PalBattleCoop.buildCoopSummonSteps = function (sprite) {
        const action = sprite && sprite._palCastAction;
        const item = action && action.item();
        const meta = item && PalBattleCore.parseMeta ? PalBattleCore.parseMeta(item) : null;
        let hold = 20 * battleMs();
        if (meta && PalBattleMagic) {
            hold = Math.max(hold, PalBattleMagic.effectDuration(meta));
        }
        return [
            { moveAbs: [-30, -12], ms: 4 * battleMs() }, // ① 前移 4 小步
            { wait: 2 * battleMs() },                    // ② delay 2
            { frame: 5 },                                // ② 摆吟唱帧
            { wait: 1 * battleMs() },                    // ④ delay 1
            { spell: true },                             // 释放点 → 召唤链路（startSummon）
            { wait: hold },                              // 提亮+淡入+立绘+落地特效
            { moveAbs: [0, 0], ms: 4 * battleMs() }      // OffMagicAnim 尾部归位（fight.c 3065-3068）
        ];
    };

    //=============================================================================
    // 挂载与发动条件
    //=============================================================================

    // 角色当前合体技 = 角色备注 <palCoop:技能id>（默认合体技），
    // 装备备注 <palCoop:技能id> 覆盖之（灵珠/玉佛珠优先级高于角色本体）；
    // 同穿多件时后扫描的装备覆盖先前的
    PalBattleCoop.skillOf = function (actor) {
        if (!actor) return 0;
        let id = 0;
        const data = actor.actor && actor.actor();
        if (data && data.note) {
            const dm = /<palCoop:\s*(\d+)>/i.exec(data.note);
            if (dm) id = Number(dm[1]);
        }
        if (actor.equips) {
            for (const eq of actor.equips()) {
                if (!eq || !eq.note) continue;
                const m = /<palCoop:\s*(\d+)>/i.exec(eq.note);
                if (m) id = Number(m[1]);
            }
        }
        return id;
    };

    // 全体参战队员（站位编号按这个顺序分配，fight.c 3898-3922 的 j 循环）
    PalBattleCoop.allMembers = function () {
        return $gameParty.battleMembers();
    };

    // D9 参战者判定：原版 PAL_IsPlayerHealthy（fight.c 52-76）
    //   = 非濒死(hp >= min(100, mhp/5)) && 无 眠/乱/封/定/傀儡
    PalBattleCoop.isHealthy = function (a) {
        if (!a || !a.isAlive()) return false;
        if (a.hp < Math.min(100, Math.floor(a.mhp / 5))) return false; // 濒死
        return !SLEEP_STATES.some(id => a.isStateAffected(id)) &&
            !CONFUSE_STATES.some(id => a.isStateAffected(id)) &&
            !PARA_STATES.some(id => a.isStateAffected(id)) &&
            !a.isStateAffected(SEAL_STATE_ID);
    };

    // 实际参战者（走位移动 / 吟唱 / 扣体力 / 合力，fight.c 的 coopContributors）
    PalBattleCoop.contributors = function () {
        return this.allMembers().filter(a => this.isHealthy(a));
    };

    // 发动条件（uibattle.c 328-335，PAL_CLASSIC 分支）：
    //   发动者本人健康 + 健康人数 > 1（不查体力下限 —— 那是非 PAL_CLASSIC 分支才有的）
    PalBattleCoop.canUse = function (actor) {
        if (!this.skillOf(actor)) return false;
        const members = this.allMembers();
        if (members.length < 2) return false;
        const healthy = members.filter(a => this.isHealthy(a));
        return this.isHealthy(actor) && healthy.length > 1;
    };

    //=============================================================================
    // 伤害：合力 = Σ(武力+灵力)/4，代入标准仙术公式（fight.c 3982-3995）
    //=============================================================================

    PalBattleCoop.coopPower = function () {
        let str = 0;
        for (const a of this.contributors()) str += a.atk + a.mat;
        return Math.floor(str / 4);
    };

    PalBattleCoop.magicDamage = function (subject, target, pal) {
        return PalBattleCore.magicDamage(subject, target, pal, this.coopPower());
    };

    const _makeDamageValue = Game_Action.prototype.makeDamageValue;
    Game_Action.prototype.makeDamageValue = function (target, critical) {
        if (this._palCoop && this.isSkill()) {
            const pal = PalBattleCore.parseMeta(this.item());
            // 合体技分支（fight.c 3975-4045）【不检查】wBaseDamage > 0 ——
            // 那是单体/群体仙术分支（4270）才有的判断。林月如的合体技「弦月斩1」
            // 与「斩魔刀」在 Magics.csv 里 wBaseDamage 就是 0，靠合力 Σ(武+灵)/4 打伤害。
            // 仅需排除 base 为负数的状态技（回梦/夺魂/鬼降的 -999 溢出值）。
            if (pal && this.item().damage.type === 1 && PalBattleCore.signedBase(pal) >= 0) {
                return PalBattleCoop.magicDamage(this.subject(), target, pal);
            }
        }
        return _makeDamageValue.call(this, target, critical);
    };

    //=============================================================================
    // 速度：合体技行动 = 发动者身法×10（fight.c 1531-1533，抢先生效）
    //=============================================================================

    const _actionSpeed = Game_Action.prototype.speed;
    Game_Action.prototype.speed = function () {
        if (this._palCoop) {
            // 合体技 ×10（fight.c 1531-1533）。走 PalBattleCore 的同一条管线，
            // 这样「加速 ×6/5 / 濒死 ×4/5 / RandomFloat(0.9,1.1)」不会被丢掉。
            const core = window.PalBattleCore;
            if (core && core.speedOf) return core.speedOf(this, 10);
            return this.subject().agi * 10 + Math.floor(Math.random() * 5);
        }
        return _actionSpeed.call(this);
    };

    //=============================================================================
    // 代价：不耗真气（跳过 useItem），改为全体参战者扣体力（fight.c 3954-3967）
    //=============================================================================

    const _useItem = Game_Battler.prototype.useItem;
    Game_Battler.prototype.useItem = function (item) {
        const action = BattleManager._action;
        if (action && action._palCoop && DataManager.isSkill(item)) return; // 合体技不耗真气
        _useItem.call(this, item);
    };

    const _startAction = BattleManager.startAction;
    BattleManager.startAction = function () {
        if (this._action && this._action._palCoop) PalBattleCoop.payCoopCost(this._action);
        _startAction.call(this);
    };

    // 全体参战者扣体力（数值=仙术真气消耗字段），每人保底1点，静默扣除不弹数字
    PalBattleCoop.payCoopCost = function (action) {
        const cost = action.item().mpCost || 0;
        if (cost <= 0) return;
        for (const a of this.contributors()) {
            a._hp = Math.max(1, a._hp - cost);
        }
        const scene = SceneManager._scene;
        if (scene && scene._statusWindow) scene._statusWindow.refresh();
    };

    //=============================================================================
    // 演出（发动合体技后执行）：全体参战者【同步】走到合体站位
    //（fight.c 3882-3920 同帧 6 步）；走到后发动者摆帧5/帧6 施法
    //（buildCoopCasterSteps），其余人摆吟唱帧(帧5)；特效播完后一齐归位
    //（fight.c 4056-4103）
    //=============================================================================

    const COOP_WALK_MS = () => 6 * battleMs(); // 14帧≈240ms=原版6战斗帧

    // 召唤型合体技（灵珠 → 风神/雷神/雪妖/山神/火神，wType=kMagicTypeSummon=9）：
    // 原版走另一条分支（fight.c 3865-3869），不站位、不依次施法 ——
    // 全员 iColorShift 1→10 渐亮（fight.c 3120-3128），随后被召唤神【顶替】，
    // battle.c 389-405：只要召唤神在场，玩家精灵整体不入绘制序列（不是变透明）。
    // 提亮 / 顶替隐藏 / 落地特效均由 palBattleMagic.startSummon 负责。

    PalBattleCoop.stageCoopCast = function (caster, action) {
        const meta = PalBattleCore.parseMeta(action.item());
        const total = PalBattleMagic && meta
            ? PalBattleMagic.castOffset(caster, meta) + PalBattleMagic.effectDuration(meta)
            : 0;
        const now = performance.now();
        // D7：特效播完还要 PostMagicAnim（敌人颤抖 3 帧）+ delay 5 帧才归位（fight.c 4046-4047）
        const until = now + Math.max(total, 16 * battleMs()) + POST_MAGIC_MS();
        const k = Graphics.boxWidth / 320;

        // 合体技吞掉所有人的行动（原版 fight.c 3954-3967 重置全员时间条）：
        // 之前只跳过「输入」，但先手角色已经选好的指令（比如攻击）还留在
        // _actions 里，轮到他时会照常执行 —— 表现为李逍遥在合体时放了个攻击动画。
        // ⚠ 这一步必须在【召唤型提前 return 之前】：原版 fight.c 3865-3869 的
        //   召唤分支同样消耗全员回合，只是不做站位走位而已。
        for (const a of this.allMembers()) {
            if (a !== caster && a._actions && a._actions.length) {
                a._actions = []; // 行动时 currentAction() 为 undefined → 直接跳过
                a.setActionState("waiting");
            }
        }

        // ---- D2 召唤型：不走合体站位，只由发动者做 PreMagicAnim(fSummon=TRUE) ----
        // 原版 fight.c 3865-3869 这里【没有】站位/依次施法/音效29 任何一步；
        // 队员被召唤神顶替后隐藏（battle.c 389-405）由 palBattleMagic.startSummon 负责，
        // 召唤神立绘 + 落地特效也复用同一套 —— 本老版本的「渐亮→隐藏」退化解已废止。
        if (this.isSummonSkill(action.item())) {
            return;
        }

        // D5 起手音效（fight.c 3875，走位之前）
        if (COOP_START_SE && window.AudioManager) AudioManager.playSe(COOP_START_SE);

        // ---- 普通合体技：同步走位 + 从队尾向队首依次施法 ----
        const members = this.contributors();

        // D9 站位编号：按【全体队员】顺序分配（fight.c 3898-3922 的 t++ 在 continue 之前，
        // 不健康的人也占一个号，只是原地不动）
        const slots = new Map();
        let t = 0;
        for (const a of this.allMembers()) {
            const idx = a === caster ? 0 : Math.min(++t, 2);
            if (this.isHealthy(a)) slots.set(a, idx);
        }

        // 三人同一帧起跑、同一时长，否则会因 Window_BattleLog 的
        // waitForMovement 把发动者的走位推迟到队友之后（变成依次走位）
        const ticks = Math.max(1, Math.round(COOP_WALK_MS() / 1000 * 60));
        for (const [a, idx] of slots) {
            const sp = PalBattleAnim.spriteOf(a);
            if (!sp) continue;
            const pos = COOP_POS[idx];
            // startMove 目标为绝对位移偏移：合体站位(屏幕坐标) - home
            sp.startMove(pos[0] * k - sp._homeX, pos[1] * k - sp._homeY, ticks);
            sp._palCoopReturnAt = until;
        }

        // D4 发动者吟唱期泛光（fight.c 3943 iColorShift=6，帧5 那 5 帧）
        const casterSp = PalBattleAnim.spriteOf(caster);
        if (casterSp) {
            casterSp._palCoopToneFrom = now + this.coopIntroWaits();
            casterSp._palCoopToneUntil = casterSp._palCoopToneFrom + 5 * battleMs();
        }

        // D3 其余参战者【从最后一个向前】依次摆吟唱帧5（fight.c 3927-3941：
        // i 从 wMaxPartyMemberIndex 递减，跳过发动者，每人间隔 3 帧）
        // 原版摆帧5 后一直保持帧5，直到归位循环才回帧0 —— 不切帧6
        const others = members.filter(a => a !== caster).reverse();
        others.forEach((a, order) => {
            a._palCoopChantFrom = now + COOP_WALK_MS() + order * 3 * battleMs();
            a._palCoopChantUntil = until;
            a._palCoopSpellAt = 0;
        });
    };

    const _performActionStart = Game_Actor.prototype.performActionStart;
    Game_Actor.prototype.performActionStart = function (action) {
        _performActionStart.call(this, action);
        if (action && action._palCoop && action.subject && action.subject() === this) {
            PalBattleCoop.stageCoopCast(this, action);
        }
    };

    // D3/D4/D2：参战者吟唱帧5（一直保持到归位，不切帧6）、
    // 发动者吟唱期泛光（iColorShift=6 近似）、召唤型全员渐亮后隐藏
    const _updateFrame = Sprite_Actor.prototype.updateFrame;
    Sprite_Actor.prototype.updateFrame = function () {
        _updateFrame.call(this);
        const a = this._actor;
        if (!a) return;
        const t = performance.now();

        // D4 发动者：走位结束 → 帧5 那 5 帧泛光（fight.c 3943-3945 iColorShift=6）
        if (this._palCoopToneUntil) {
            const on = t >= this._palCoopToneFrom && t < this._palCoopToneUntil;
            this.setColorTone(on ? COOP_CASTER_TONE : [0, 0, 0, 0]);
            if (t >= this._palCoopToneUntil) this._palCoopToneUntil = 0;
        }

        // D3 其余参战者：走位完成后摆帧5，一直保持（fight.c 3938）
        if (a._palCoopChantUntil && !PalBattleAnim.isBusy(this)) {
            if (t >= (a._palCoopChantFrom || 0) && t < a._palCoopChantUntil) {
                PalBattleAnim.setActorFrame(this, 5);
            }
        }
    };

    // 特效播完后归位（fight.c 4056-4103：6 步走回原位 = 240ms）
    const _update = Sprite_Actor.prototype.update;
    Sprite_Actor.prototype.update = function () {
        _update.call(this);
        if (this._palCoopReturnAt && performance.now() >= this._palCoopReturnAt &&
            !PalBattleAnim.isBusy(this)) {
            this.startMove(0, 0, Math.round(6 * battleMs() / 1000 * 60)); // 240ms
            this._palCoopReturnAt = 0;
            this.setColorTone([0, 0, 0, 0]);
            if (this._actor) {
                this._actor._palCoopChantUntil = 0;
                this._actor._palCoopChantFrom = 0;
            }
        }
    };

    //=============================================================================
    // 指令盘与场景接线
    //=============================================================================

    const _createActorCommandWindow = Scene_Battle.prototype.createActorCommandWindow;
    Scene_Battle.prototype.createActorCommandWindow = function () {
        _createActorCommandWindow.call(this);
        this._actorCommandWindow.setHandler("coop", this.commandCoop.bind(this));
    };

    Scene_Battle.prototype.commandCoop = function () {
        this.beginCoopMagic();
    };

    // 合体技行动开始（只由指令盘右侧“合体”按钮触发；杂项菜单第 1 项是「围攻」，
    // 走 palBattleAuto，与本函数无关）
    // 发动成功即标记 _pendingPalCoop：行动确认后消耗全部角色行动轮次（见下方包装）
    Scene_Battle.prototype.beginCoopMagic = function () {
        const actor = BattleManager.actor();
        const skillId = PalBattleCoop.skillOf(actor);
        const action = BattleManager.inputtingAction();
        if (!skillId || !action) {
            this._actorCommandWindow.activate();
            return;
        }
        action.setSkill(skillId);
        action._palCoop = true;
        actor.setLastBattleSkill(skillId);
        BattleManager._pendingPalCoop = true;
        {
            const sk = $dataSkills[skillId];
            console.log('[合体技] 发动者=%s 技能=%d(%s)', actor.name && actor.name(), skillId,
                sk ? sk.name : '?');
        }
        const skill = $dataSkills[skillId];
        if (skill && skill.scope === 1) {
            this.startEnemySelection(); // 单体技：选敌
        } else {
            this.onSelectAction();      // 群体技：打击敌方全体，直接结算
        }
    };

    //=============================================================================
    // 消耗全员行动轮次（fight.c：发动合体后其余人参战者行动轮空）
    // 时序：beginCoopMagic 置 _pendingPalCoop → 行动确认流经
    // Scene_Battle.selectNextCommand 时转为 _palCoopConsumeAll →
    // BattleManager.selectNextActor 见标志则跳过其余角色输入直接 startTurn
    //=============================================================================

    const _sceneSelectNextCommand = Scene_Battle.prototype.selectNextCommand;
    Scene_Battle.prototype.selectNextCommand = function () {
        // ⚠ 无论指令从哪条路来（指令盘右键 / R 重复 / F 自动施法），只要当前提交的
        //   是这名角色的合体技，都要打上 _palCoop 标记 —— 否则 R 重复出的合体技
        //   会按普通仙术结算（耗真气、普通公式、普通速度），还会被队友抢先行动
        //（普通速度排不进行动队首；_palCoop 的 ×10 速度保证合体技第一个执行）。
        // 原版等价物：fight.c 1417-1424 提交队列里扫到 CoopMagic 就跳过其余人。
        const actor = BattleManager.actor();
        const action = BattleManager.inputtingAction();
        if (actor && action && action.isSkill && action.isSkill() &&
            !action._palCoop && PalBattleCoop.canUse(actor) &&
            PalBattleCoop.skillOf(actor) === action.item().id) {
            action._palCoop = true;
            BattleManager._pendingPalCoop = true;
        }
        if (BattleManager._pendingPalCoop) {
            BattleManager._palCoopConsumeAll = true;
            BattleManager._pendingPalCoop = false;
        }
        _sceneSelectNextCommand.call(this);
    };

    // 包 selectNextActor 而非 changeCurrentActor：原实现里 changeCurrentActor 后
    // 若无人可选还会再 startTurn 一次，直接短路可避免回合数重复 +1
    const _selectNextActor = BattleManager.selectNextActor;
    BattleManager.selectNextActor = function () {
        if (this._palCoopConsumeAll) {
            this._palCoopConsumeAll = false;
            this._currentActor = null;
            this.startTurn();
            return;
        }
        _selectNextActor.call(this);
    };

    const _startTurn = BattleManager.startTurn;
    BattleManager.startTurn = function () {
        this._palCoopConsumeAll = false; // 保险：回合开始时清标志
        _startTurn.call(this);
    };

    // 选敌取消后恢复指令盘（palBattleTarget 只兜底了 attack 分支）
    const _onEnemyCancel = Scene_Battle.prototype.onEnemyCancel;
    Scene_Battle.prototype.onEnemyCancel = function () {
        BattleManager._pendingPalCoop = false; // 取消选敌则不再吞回合
        _onEnemyCancel.call(this);
        if (this._actorCommandWindow.currentSymbol() === "coop" &&
            this._actorCommandWindow.visible && !this._actorCommandWindow.active) {
            this._actorCommandWindow.activate();
        }
    };
})();
