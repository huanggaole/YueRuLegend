/*:
 * @target MZ
 * @plugindesc [v1.1] 仙剑98柔情版战斗核心机制（五行相克/原版伤害公式/逃跑判定/中毒/敌方AI；v1.1 仙术伤害严格对齐 fight.c 整数语义 + base 按有符号16位读）
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
 * 4. 仙术伤害（PAL_CalcMagicDamage，fight.c 173-250 / 4270-4318 / 4772-4840）：
 *    str = 灵力（敌方再 +(等级+6)×6）；str = (WORD)(str×rand(10~11)) / 10（两次整数截断）
 *    def = 敌人防御+(等级+6)×4；我方被仙术打时只用防御，无等级加成
 *    dmg = 基础公式(str,def)/4 + (SHORT)wBaseDamage
 *    五行（1风2雷3水4火5土）：×(10-抗性)/5（敌人抗性 0~10，5 为中性）
 *    毒（6）：走毒抗，同样 ×(10-抗性)/5，且不吃战场五行加成
 *    我方被仙术打：抗性按 100+玩家抗性、倍率 20 → 等价 ×(1-抗性/100)
 *    最少 1 点伤害
 *    ⚠ wBaseDamage 是 WORD，负数（如 -999 存成 64537）表示【不造成伤害】的辅助技；
 *      只有 (SHORT)base > 0 才走上面这条伤害公式（回梦/夺魂/鬼降属此类）。
 *    ⚠ 未复刻：战场五行加成 rgsMagicEffect（原版默认全 0，等价 ×10/10=1）；
 *      防御/护体/自动防御的 ÷2 减免（MZ 侧改由防御状态近似）。
 * 5. 逃跑：逃跑率 >= rand(0, 敌方Σ(身法+(等级+6)×4)) 则成功。
 *    【能否逃跑只由事件决定】：地图「战斗处理」指令没勾选「可以逃跑」时，
 *    MZ 会把 BattleManager._canEscape 置 false（随机遇敌恒为 true）。
 *    因此本插件不再按队伍/敌人 ID 另设禁逃名单——要禁逃就在事件里取消勾选。
 * 6. 中毒：由 palPoison.js 接管（固定值 / 阶梯 / 暴毙 / 养蛊），本插件不再算
 * 7. 行动顺序：加权身法 = 实际身法 × 行动系数 × RandomFloat(0.9,1.1)
 *    实际身法：加速 ×6/5、迟缓 ×2/3、濒死 ×4/5（队列里再 ÷2）
 *    行动系数：合击 ×10 / 防御 ×5 / 对我方仙术·道具 ×3 / 攻击·对敌仙术 ×1
 *    敌方身法：身法 + (等级+6)×3，下限 20
 * 8. 敌方AI：每回合以 magicRate/10 概率施放仙术（被封咒时只能普攻）；
 *    二次行动（原版 wDualMove）由 RMMZ 的 Action Plus 特性承载，两次各自独立判定
 * 9. 敌人普攻附带道具 wAttackEquivItem：命中后按 rate/10 施加毒/昏睡/咒封
 * 10. 敌方施法不消耗真气（原版敌方无真气概念）
 * 11. 伤害数字配色：伤害黄色、回复蓝色（仙剑98风格）
 *
 * 部队备注：<palBattleback:文件名> 指定该部队战斗背景。
 *   （旧版曾用 <palBoss> 标记禁逃，已移除——禁逃归事件管，见第 5 条。）
 * 抗性备注：<palRes:[风,雷,水,火,土,毒]>（0~100，可负；最终 = 基础 + Σ装备，上限 100）
 *   可写在 角色 / 职业 / 武器 / 防具 上。
 *   ⚠ 原版角色【基础抗性全为 0】（Data.mkf chunk3 PLAYERROLES 实测），
 *     抗性全部来自装备 ScriptOnEquip 的 opcode 0x0017（风/雷/水/火/土灵珠 +50、
 *     香袋 毒+20、玉佛珠 毒+30、圣灵珠 毒+35、五毒珠 毒+100）。
 *     readthedocs 的「我方抗性默认 50%」是错的。
 */

(() => {
    const PalBattleCore = (window.PalBattleCore = {});
    const PLUGIN_PARAMS = PluginManager.parameters("palBattleCore");
    const DEFAULT_BATTLEBACK = String(PLUGIN_PARAMS.defaultBattleback || "Fbp_10-1");
    const POISON_RATE = Number(PLUGIN_PARAMS.poisonRate || 16);
    const SEAL_STATE_ID = 6; // 咒封（沉默）
    const GUARD_STATE_ID = 2; // 防御（RMMZ 的 Guard，防御指令挂的就是它）
    const BASIC_ATTACK_SKILL_ID = 236; // 数据转换脚本追加的“攻击”基本技能
    const WINE_ITEM_ID = 22; // 「酒」——酒神施放时消耗（原版 op 0x0020 移除物品 86）
    PalBattleCore.WINE_ITEM_ID = WINE_ITEM_ID;

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

    //=============================================================================
    // 我方抗性（global.c 1900 / 1937）
    //   最终抗性 = 角色基础 + Σ装备加成，上限 100
    //   基础值来自 Data.mkf chunk3 的 PLAYERROLES，实测【全角色 0】
    //   → 抗性只能靠装备，写在装备备注 <palRes:[风,雷,水,火,土,毒]> 上
    //=============================================================================

    const RES_RE = /<palRes:\[([-\d,\s]+)\]>/i;

    // 从一个「数据对象」（角色/职业/武器/防具）的 note 里取某条抗性
    PalBattleCore.resOfNote = function (note, palElem) {
        const m = RES_RE.exec(note || "");
        if (!m) return 0;
        const arr = m[1].split(",").map(s => Number(s.trim()));
        const v = arr[palElem - 1];
        return Number.isFinite(v) ? v : 0;
    };

    // 基础抗性：先看角色备注，没有再看职业备注，都没有就是 0
    PalBattleCore.actorBaseResist = function (actor, palElem) {
        if (!actor) return 0;
        const a = actor.actor ? actor.actor() : null;
        if (a && a.note && RES_RE.test(a.note)) {
            return PalBattleCore.resOfNote(a.note, palElem);
        }
        const classes = (typeof $dataClasses !== "undefined") ? $dataClasses : null;
        const cls = (a && classes) ? classes[a.classId] : null;
        if (cls && cls.note) return PalBattleCore.resOfNote(cls.note, palElem);
        return 0;
    };

    PalBattleCore.actorElementResist = function (actor, palElem) {
        if (!actor) return 0;
        let res = PalBattleCore.actorBaseResist(actor, palElem);
        const equips = actor.equips ? actor.equips() : [];
        for (const eq of equips) {
            if (eq && eq.note) res += PalBattleCore.resOfNote(eq.note, palElem);
        }
        // global.c:1928 / 1969 —— 上限 100（下限不设，允许负值但 C 里 WORD 不会为负）
        return Math.min(100, res);
    };

    // 毒抗 = palElem 6
    PalBattleCore.actorPoisonResist = function (actor) {
        return PalBattleCore.actorElementResist(actor, 6);
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
            // 敌方普攻我方（fight.c 4950-5056）
            //   def = 玩家防御；【只有防御状态】才 ×2（原版 fDefending），
            //   之后再 PAL_CalcPhysicalAttackDamage(str, def, 2) → 结果再 /2。
            //   ⚠ 之前把 def 写死成 ×2，等于「全程防御且防御指令无效」，已修正。
            const meta = PalBattleCore.enemyMeta(subject);
            str = Math.max(0, subject.atk + ((meta ? meta.lv : 0) + 6) * 6) + randInt(0, 2);
            def = target.def;
            if (target.isStateAffected(GUARD_STATE_ID)) def *= 2;
            res = 2;
        }
        let dmg = PalBattleCore.baseDamage(str, def);
        if (res) dmg = Math.floor(dmg / res);
        if (subject.isActor()) {
            dmg += randInt(1, 2);
            // 天罡战气（kStatusBravery，fight.c 3640）：必定会心一击
            if (randInt(0, 5) === 0 || PalBattleCore.hasBravery(subject)) dmg *= 3;
            if (subject.actorId() === 1 && randInt(0, 11) === 0) dmg *= 2; // 李逍遥追加攻击（1/12）
            dmg = Math.floor(dmg * randFloat(1, 1.125));
        } else {
            dmg += randInt(0, 1);
        }
        // 护体（kStatusProtect，fight.c 3820）：受到的物理伤害 ÷2
        if (PalBattleCore.hasProtect(target)) dmg = Math.trunc(dmg / 2);
        return Math.max(1, dmg);
    };

    // 仙术伤害（PAL_CalcMagicDamage，fight.c 173-250 + 4270-4318 / 4772-4840）
    //
    // 原版流程（严格按 C 的整数语义复刻）：
    //   str  = 施法者灵力（敌方再 +(等级+6)*6）
    //   str  = (WORD)(str * RandomFloat(10,11)) / 10      // 两次整数截断
    //   def  = 敌人防御 + (等级+6)*4   /  我方：只有防御
    //   dmg  = PAL_CalcBaseDamage(str, def) / 4           // 整数除
    //   dmg += (SHORT)wBaseDamage                          // 只有 > 0 的仙术才进这一支
    //   五行：dmg = dmg * (10 - 抗性/抗性倍率) / 5
    //         打敌人抗性倍率=1（抗性 0~10，5 中性）
    //         打我方抗性倍率=20、抗性按 100+玩家抗性 传入 → 等价 ×(1 - 抗性/100)
    //   毒（elem=6 > NUM_MAGIC_ELEMENTAL=5）走毒抗，且不吃战场加成
    //   最后：dmg <= 0 时强制 1
    //
    // ⚠ base 必须按【有符号 16 位】读：原版 wBaseDamage 是 WORD，
    //   负数仙术（回梦/夺魂/鬼降 = -999，导出成 65536-999 = 64537）
    //   在原版里是"不造成伤害"的辅助技；直接当正数用会打出 6 万伤害。
    PalBattleCore.signedBase = function (pal) {
        const b = pal && pal.base !== undefined ? Number(pal.base) : 0;
        return b > 32767 ? b - 65536 : b; // WORD -> SHORT
    };

    //=============================================================================
    // 脚本动态伤害（原版由仙术的 wScriptOnSuccess 里改写 wBaseDamage 实现）
    //
    // sdlpal script.c 里两个专门的 opcode，全工程各只有一处调用：
    //   0x0057  script.c 1848-1857：base = 施法者真气 × 倍率(operand[1]==0 时为 8)，真气清零
    //            → 调用点 Scripts.json 0xA844 operand[0]=0x172(370) = 物品「酒神」
    //   0x0088  script.c 2540-2555：base = min(金钱,5000) × 2 / 5，扣除该金钱
    //            → 调用点 Scripts.json 0xA83E operand[0]=0x18A(394) = 物品「乾坤一掷」
    //
    // 这两招在 Magics.csv 里的静态 wBaseDamage 分别是 3 和 0，真正的威力全靠脚本改写。
    // 副作用（真气清零 / 扣钱）必须在【本回合第一次结算】时执行，多目标时只做一次：
    // 多目标仙术共用同一个 Game_Action 实例，故把结果缓存在 action 上即可幂等。
    //=============================================================================

    PalBattleCore.SPECIAL_BASE = {
        // 酒神（Object 370 / Magic 75）：ScriptOnSuccess 先移除 1 瓶「酒」(op 0x0020,
        // 物品对象 86=酒)，不足则整段失败跳走；成功再倾尽全部真气，base = 真气 × 8。
        // RMMZ 侧：Items.json 的 22 号就是「酒」。
        75: function (subject) {
            if (subject.isActor()) {
                const wine = $dataItems[PalBattleCore.WINE_ITEM_ID];
                if (wine && $gameParty.numItems(wine) <= 0) return 0; // 没酒 → 施法失败
                $gameParty.loseItem(wine, 1);
            }
            const mp = subject.mp;
            subject.setMp(0);
            return mp * 8;
        },
        // 乾坤一掷（Object 394 / Magic 100）：base = min(金钱, 5000) × 2 / 5，扣钱
        100: function (subject) {
            const cash = Math.min($gameParty.gold(), 5000);
            if (cash > 0) $gameParty.loseGold(cash);
            return Math.floor(cash * 2 / 5);
        }
    };

    // 取本次行动的脚本动态基础伤害（无副作用地读缓存）
    PalBattleCore.specialBaseOf = function (action) {
        return action && action._palSpecialBase !== undefined ? action._palSpecialBase : 0;
    };

    // 施法结算前准备：对带脚本伤害的仙术执行一次副作用并缓存 base
    PalBattleCore.prepareSpecial = function (action) {
        if (action._palSpecialBase !== undefined) return;      // 多目标只结算一次
        if (!action.isSkill()) return;
        const item = action.item();
        const pal = item ? PalBattleCore.parseMeta(item) : null;
        if (!pal || pal.mid === undefined) return;
        const fn = PalBattleCore.SPECIAL_BASE[pal.mid];
        if (!fn) return;
        const subject = action.subject();
        if (!subject) return;
        action._palSpecialBase = fn(subject);
    };

    //=============================================================================
    // 战场五行加成 rgsMagicEffect（Data.mkf chunk5 BATTLEFIELD，风雷水火土）
    //
    // 原版 PAL_CalcMagicDamage 最后一步（fight.c 242-246）：
    //     sDamage *= 10 + rgsMagicEffect[elem-1];  sDamage /= 10;
    // 例如战场 18/50 是 火 -10 → 火系仙术在那个战场伤害直接归零。
    // ⚠ 之前记录成「原版默认全 0」是错的：58 个战场里有 43 个带加成。
    // 部队备注 <palField:N> 指定战场编号，不写则取 0（该战场加成全 0）。
    //=============================================================================

    PalBattleCore.PAL_FIELD = [
        [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0], [-3, -2, 0, 1, 0], [-3, -2, 0, 1, 0], [0, 0, 0, 0, 0], [2, 0, 0, 0, 0],
        [2, 0, 0, 0, 0], [0, 0, 0, 3, 0], [3, 2, 0, 0, 0], [3, 2, 0, -1, 0], [-2, -2, 0, 2, 0],
        [-2, -2, 0, 2, 0], [-3, -2, 0, 4, 0], [-2, -2, 0, 5, 0], [-6, 4, 2, -10, -2], [0, 0, 0, 0, 0],
        [2, 0, 0, 0, 0], [2, 0, 0, 0, 0], [0, 0, -5, 3, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0],
        [-2, -1, 0, 1, 0], [3, 2, 0, 0, 0], [-2, 0, 2, -3, 0], [-2, -1, 0, 1, 0], [0, 0, 0, 1, 0],
        [1, 1, 0, 0, 0], [3, 2, 0, 0, 0], [-3, 0, 0, 0, -2], [3, 2, 5, -5, 0], [2, 0, 0, 0, 0],
        [0, 0, -5, 3, 0], [2, 0, 0, 0, 0], [2, 0, 0, 0, 0], [-1, 0, 0, 0, 0], [-1, 0, 0, -1, 0],
        [-1, 0, 0, -1, 0], [-1, 0, -3, -1, 0], [0, 0, 0, 2, 0], [2, 1, 0, 0, 0], [0, 0, 0, 0, 0],
        [1, 0, 0, 0, 0], [1, 0, 0, 0, 0], [-1, -2, 0, 2, 0], [-2, 0, 0, 0, 0], [-2, 0, 0, 0, 0],
        [-6, 4, 2, -10, -2], [-2, 0, 0, 0, 0], [0, 0, 0, 0, 0], [-1, 0, -3, -1, 0], [-2, 0, 0, -1, 0],
        [-2, 0, 0, -1, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]
    ];

    // 战场编号：原版是【场景级】的（script.c 1719-1724，opcode 0x004A 在场景进入脚本里
    // 设置 gpGlobals->wNumBattleField），不是部队级的。本工程 MapNNN.json ⇔ PAL 地图 N，
    // 由 tools/pal_extract_battlefield.py 从 sss.mkf chunk1 的 SCENE 表提取后写进地图备注。
    // 部队备注 <palField:N> 仍保留作为兜底（个别剧情战可覆盖地图默认值）。
    PalBattleCore.battleFieldIndex = function () {
        const g = (typeof $gameMap !== "undefined") ? $gameMap : null;
        const map = g && g.map ? g.map() : null;
        if (map && map.note) {
            const mm = /<palField:\s*(\d+)>/i.exec(map.note);
            if (mm) return Number(mm[1]);
        }
        const troop = $gameTroop && $gameTroop.troop && $gameTroop.troop();
        const mt = troop ? /<palField:\s*(\d+)>/i.exec(troop.note || "") : null;
        return mt ? Number(mt[1]) : 0;
    };

    PalBattleCore.fieldEffect = function (palElem) {
        if (!(palElem >= 1 && palElem <= 5)) return 0; // 毒系不吃战场加成（fight.c 242）
        const row = PalBattleCore.PAL_FIELD[PalBattleCore.battleFieldIndex()];
        return row ? row[palElem - 1] : 0;
    };

    //=============================================================================
    // PAL_CalcMagicDamage 严格复刻（fight.c 173-250）
    //
    //   str   = (WORD)(施法者灵力 × RandomFloat(10,11)) / 10      // 两次整数截断
    //   def   = 敌人防御+(等级+6)×4   /  我方被仙术打时只用防御
    //   dmg   = PAL_CalcBaseDamage(str, def) / 4                  // 整数除
    //   dmg  += wBaseDamage                                       // 调用方保证 > 0
    //   五行  = dmg × (10 - 抗性/倍率) / 5                        // 先乘截断，再整数除
    //           打敌人倍率=1（抗性 0~10，5 中性）
    //           打我方倍率=20、抗性按 100+玩家抗性 传入
    //   战场  = dmg × (10 + rgsMagicEffect) / 10                  // 仅五行系（1~5）
    //   毒（elem=6）走毒抗，且不吃战场加成
    //   全程用 Math.trunc：C 的 SHORT 转换是向零截断，不是向下取整
    //=============================================================================

    // strOverride：合力值预设（合体技 Σ(武力+灵力)/4，fight.c 3982-3995），传入时跳过灵力计算
    //=============================================================================
    // 原版增益状态（sdlpal global.h 42-55：5 Bravery 6 Protect 7 Haste 8 DualAttack）
    // 用状态备注 <palProtect> / <palBravery> / <palHaste> / <palDualAtk> 标记，
    // 由 palBattleSkillFx.js 在施放金刚咒/真元护体/天罡战气/醉仙望月步/仙风云体术时挂上。
    //=============================================================================

    PalBattleCore.hasStateNote = function (battler, tag) {
        if (!battler || !battler.isAlive()) return false;
        const re = new RegExp("<" + tag, "i");
        for (const state of battler.states()) {
            if (state && re.test(state.note || "")) return true;
        }
        return false;
    };
    PalBattleCore.hasProtect = function (b) { return PalBattleCore.hasStateNote(b, "palProtect"); };
    PalBattleCore.hasBravery = function (b) { return PalBattleCore.hasStateNote(b, "palBravery"); };
    PalBattleCore.hasDualAtk = function (b) { return PalBattleCore.hasStateNote(b, "palDualAtk"); };

    //=============================================================================
    // 我方「免伤除数」（严格对齐 fight.c 4801-4803 / 4836-4838）
    //
    //   sDamage /= ((fDefending ? 2 : 1) * (kStatusProtect ? 2 : 1)) + (fAutoDefend ? 1 : 0)
    //
    // ⚠ 是【加法除数】而不是乘法免伤率：
    //     常态                    ÷1   = 100%
    //     防御 / 护体 / 自动格挡  ÷2   =  50%
    //     防御+护体               ÷4   =  25%
    //     三者同时                ÷5   =  20%   （readthedocs 写成 12.5%，是错的）
    // 只对【我方挨仙术】生效；挨普攻时原版走的是 def×2（见 physicalDamage），
    // 而自动格挡是「完全不掉血」（命中率 10/17），都不走这里。
    //=============================================================================

    const SLEEP_STATES = [10, 19];   // 昏睡3 / 昏睡5
    const CONFUSE_STATES = [9, 11];  // 疯魔 / 疯魔5
    const PARA_STATES = [4, 5, 7];   // 定身 / 定身4 / 定身5
    const NO_GUARD_STATES = [...SLEEP_STATES, ...CONFUSE_STATES, ...PARA_STATES];

    // 能否「自动格挡」（fight.c 4974-4986）：
    //   昏睡 / 疯魔 / 定身(迟缓) 状态下无法格挡（原版 fAutoDefend 直接置 FALSE）。
    // 普攻（fAutoDefend，41%）与仙术（RandomLong(0,2)==0，33%）共用这个前提。
    PalBattleCore.canAutoDefend = function (target) {
        if (!target || !target.isActor || !target.isActor() || !target.isAlive()) return false;
        for (const id of NO_GUARD_STATES) {
            if (target.isStateAffected(id)) return false;
        }
        return true;
    };

    // 仙术的自动格挡（fight.c 4726-4756）：RandomLong(0, 2) == 0 → 命中率 1/3
    PalBattleCore.rollMagicAutoDefend = function (target) {
        if (!PalBattleCore.canAutoDefend(target)) return false;
        return randInt(0, 2) === 0;
    };

    //=============================================================================
    // 队友掩护（fight.c 4936-4986 判定 / 5012-5027 站位 / 5090-5098 收尾 / 5139 附带道具）
    //
    // 触发链（原版只在【敌人对我方普攻】这一支里有）：
    //   fAutoDefend = (RandomLong(0, 16) >= 10)                  —— 7/17 ≈ 41%
    //   若 受击者「濒死 / 疯魔 / 昏睡 / 定身」且 fAutoDefend：
    //       coverer = rgwCoveredBy[受击者角色]                    —— 谁掩护我
    //       coverer 不在队 / 自己也濒死疯魔昏睡定身 → 无人掩护
    //   掩护成立 ⇒ 受击者【完全不掉血】（fight.c 5052 的 if (!fAutoDefend) 整段跳过），
    //   连敌人的附带道具（下毒/上状态）也不判定（fight.c 5139）。
    //
    // 掩护关系写在【角色备注】里，不在插件里按角色 ID 立名单（最小原则）：
    //   <coveredBy:3>     我被 3 号角色掩护
    //   <coverSound:17>   我来掩护时播 audio/se/sfx017.ogg
    // 原版数据由 tools/pal_patch_cover.py 从 Data.mkf chunk3 写入
    //（rgwCoveredBy=[2,0,0,0,0,4] / rgwCoverSound=[15,16,17,16,18,17]）。
    //=============================================================================

    const COVER_CHANCE = 10; // RandomLong(0,16) >= 10 → 7/17

    // 濒死 / 昏睡 / 疯魔 / 定身：既是"需要被掩护"的条件，也是"来不了掩护"的条件
    PalBattleCore.isHelpless = function (actor) {
        if (!actor || !actor.isActor || !actor.isActor()) return false;
        if (!actor.isAlive()) return true;
        if (actor.hp < Math.min(100, actor.mhp / 5)) return true; // PAL_IsPlayerDying fight.c 47-48
        for (const id of NO_GUARD_STATES) {
            if (actor.isStateAffected(id)) return true;
        }
        return false;
    };

    PalBattleCore.noteTag = function (actor, tag) {
        if (!actor || !actor.actor || !actor.actor()) return 0;
        const m = new RegExp("<" + tag + ":\\s*(\\d+)\\s*>", "i").exec(actor.actor().note || "");
        return m ? Number(m[1]) : 0;
    };

    // 谁掩护我（必须在当前参战队伍里，fight.c 4950-4957）
    PalBattleCore.covererOf = function (actor) {
        const id = PalBattleCore.noteTag(actor, "coveredBy");
        if (!id) return null;
        const a = $gameActors.actor(id);
        if (!a || a === actor) return null;
        if ($gameParty.battleMembers().indexOf(a) < 0) return null;
        return a;
    };

    PalBattleCore.resolveCover = function (action, target) {
        if (!action || !target) return null;
        const subject = action.subject();
        if (!subject || !subject.isEnemy || !subject.isEnemy()) return null; // 只有敌人打我方
        if (!action.isAttack || !action.isAttack()) return null;             // 只有普攻（fight.c 4910）
        if (!target.isActor || !target.isActor() || !target.isAlive()) return null;
        if (randInt(0, 16) < COVER_CHANCE) return null;                      // fAutoDefend == FALSE
        if (!PalBattleCore.isHelpless(target)) return null;                  // 好端端的不需要人掩护
        const coverer = PalBattleCore.covererOf(target);
        if (!coverer) return null;
        if (PalBattleCore.isHelpless(coverer)) return null;                  // fight.c 4961-4967
        return coverer;
    };

    // 演出交给 palBattleAnim（它在更后面加载，运行时取）
    PalBattleCore.performCover = function (action, target, coverer) {
        const A = window.PalBattleAnim;
        if (A && A.runCover) A.runCover(action.subject(), target, coverer);
    };

    // 原版 sounds.mkf 编号 → audio/se/sfxNNN.ogg
    PalBattleCore.playPalSe = function (num) {
        if (!num || !window.AudioManager) return;
        AudioManager.playSe({
            name: "sfx" + String(num).padStart(3, "0"),
            volume: 90, pitch: 100, pan: 0
        });
    };

    // 返回仙术伤害的最终除数（1 = 不减免）
    PalBattleCore.magicDefendDivisor = function (target) {
        if (!target || !target.isActor()) return 1;
        let divisor = 1;
        if (target.isStateAffected(GUARD_STATE_ID)) divisor *= 2;   // 防御指令
        if (PalBattleCore.hasProtect(target)) divisor *= 2;         // 真元护体 / 金刚咒
        if (PalBattleCore.rollMagicAutoDefend(target)) divisor += 1;// 随机格挡
        return divisor;
    };

    PalBattleCore.magicDamage = function (subject, target, pal, strOverride) {
        let str;
        if (strOverride !== undefined) {
            str = Math.floor(Math.floor(strOverride * randFloat(10, 11)) / 10);
        } else {
            const atkLv = subject.isActor() ? 0 : (PalBattleCore.enemyMeta(subject) || { lv: 0 }).lv;
            const raw = subject.mat + (subject.isActor() ? 0 : (atkLv + 6) * 6);
            str = Math.floor(Math.floor(raw * randFloat(10, 11)) / 10);
        }
        let def;
        if (target.isActor()) {
            def = target.def; // 我方被仙术攻击时只用防御，无等级加成（fight.c 4790/4825）
        } else {
            const meta = PalBattleCore.enemyMeta(target);
            def = target.def + ((meta ? meta.lv : 0) + 6) * 4;
        }
        // sDamage = PAL_CalcBaseDamage(str, def) / 4  →  += wBaseDamage
        let dmg = Math.trunc(PalBattleCore.baseDamage(str, def) / 4) + PalBattleCore.signedBase(pal);
        const elem = pal.elem || 0;
        if (elem !== 0) {
            let res;
            if (target.isActor()) {
                // 打我方：抗性按 100+玩家抗性 传入，倍率 20
                res = 100 + PalBattleCore.actorElementResist(target, elem);
                dmg = Math.trunc(dmg * (10 - res / 20));
            } else {
                const meta = PalBattleCore.enemyMeta(target);
                if (elem >= 6) {
                    res = meta ? meta.poisonRes || 0 : 0;      // 毒抗
                } else {
                    res = meta && meta.elemRes ? meta.elemRes[elem - 1] : 5;
                }
                dmg = Math.trunc(dmg * (10 - res));            // 打敌人倍率 = 1
            }
            dmg = Math.trunc(dmg / 5);
            if (elem <= 5) {
                dmg = Math.trunc(dmg * (10 + PalBattleCore.fieldEffect(elem)));
                dmg = Math.trunc(dmg / 10);
            }
        }
        // 我方挨仙术的最终免伤除数（fight.c 4801-4803 / 4836-4838）
        const divisor = PalBattleCore.magicDefendDivisor(target);
        if (divisor > 1) dmg = Math.trunc(dmg / divisor);
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
            if (pal && item.damage.type === 1) {
                if (pal.mid !== undefined && PalBattleCore.SPECIAL_BASE[pal.mid]) {
                    // 脚本动态伤害（酒神/乾坤一掷）：静态 wBaseDamage 已被脚本改写覆盖，
                    // 真气/金钱为 0 时 base=0 → 原版 fight.c 4270 不进伤害分支，就是 0
                    const sp = PalBattleCore.specialBaseOf(this);
                    return sp > 0
                        ? PalBattleCore.magicDamage(this.subject(), target,
                            { base: sp, elem: pal.elem })
                        : 0;
                }
                // ② 原版：只有 (SHORT)wBaseDamage > 0 的仙术才会造成伤害（fight.c 4270/4772），
                //    base <= 0 的是辅助/特殊技（回梦、夺魂、鬼降…），静态表不产生伤害。
                return PalBattleCore.signedBase(pal) > 0
                    ? PalBattleCore.magicDamage(this.subject(), target, pal)
                    : 0;
            }
        }
        return _makeDamageValue.call(this, target, critical);
    };

    // 结算前先跑一遍脚本伤害（真气清零 / 扣钱），多目标只跑一次
    const _apply = Game_Action.prototype.apply;
    Game_Action.prototype.apply = function (target) {
        PalBattleCore.prepareSpecial(this);
        // 队友掩护：成立则整段伤害 + 附带道具都不跑（fight.c 5052 / 5139）
        const coverer = PalBattleCore.resolveCover(this, target);
        if (coverer) {
            this.subject().clearResult();
            const result = target.result();
            result.clear();       // used=false → 日志里不弹数字、不弹状态
            PalBattleCore.performCover(this, target, coverer);
            return result;
        }
        const result = _apply.call(this, target);
        PalBattleCore.applyEquivItem(this, target);
        return result;
    };

    // 普通攻击使用专用的基本技能（数据库中的技能1“梦蛇”是仙剑仙术，不能当普攻）
    Game_BattlerBase.prototype.attackSkillId = function () {
        return BASIC_ATTACK_SKILL_ID;
    };

    //=============================================================================
    // 逃跑判定（fight.c 4119-4171）
    //
    // 能否逃跑 = 事件「战斗处理」指令的「可以逃跑」开关（BattleManager.canEscape）。
    // 随机遇敌 MZ 恒传 true；剧情/Boss 战由作者在事件里取消勾选即可禁逃。
    // 不按队伍或敌人 ID 另立名单（最小原则）。
    //=============================================================================

    BattleManager.processEscape = function () {
        if (!BattleManager.canEscape()) return false;
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
        const success = str >= randInt(0, def);
        if (success) {
            this.onEscapeSuccess();
        } else {
            this.onEscapeFailure();
        }
        return success;
    };

    //=============================================================================
    //=============================================================================
    // 行动顺序：加权身法 = 实际身法 × 行动系数 × RandomFloat(0.9, 1.1)
    //
    //   fight.c 1529-1566（我方入队）/ 1465-1492（敌方入队）
    //   实际身法 PAL_GetPlayerActualDexterity（fight.c 335-386）：
    //       加速 <palHaste> ×6/5、迟缓 <palSlow> ×2/3、濒死 ×4/5
    //   行动系数（fight.c 1531-1561）：
    //       合击 ×10 / 防御 ×5 / 对我方仙术·道具 ×3 / 攻击·对敌仙术 ×1 / 逃跑 ÷2
    //       濒死【再】÷2（与上面的 ×4/5 叠加）
    //   敌方身法 PAL_GetEnemyDexterity（fight.c 288-330）：
    //       身法 + (等级+6)×3，下限 20；加速 ×6/5、迟缓 ×2/3
    //
    //   ⚠ 逃跑在本工程里是 BattleManager.processEscape()，不占行动队列，
    //     所以「逃跑 ÷2」没有落点（原版逃跑是一个占队列的 action，会排到最后）。
    //=============================================================================

    const HASTE_NOTE = "palHaste";
    const SLOW_NOTE = "palSlow";   // 工程库里暂无该状态，留接口

    // fight.c 29-49：HP < min(100, 最大HP/5)
    PalBattleCore.isDying = function (battler) {
        if (!battler) return false;
        return battler.hp < Math.min(100, battler.mhp / 5);
    };

    PalBattleCore.actualDexterity = function (battler) {
        let d = battler.agi;
        if (PalBattleCore.hasStateNote(battler, HASTE_NOTE)) {
            d = Math.floor(d * 6 / 5);
        } else if (PalBattleCore.hasStateNote(battler, SLOW_NOTE)) {
            d = Math.floor(d * 2 / 3);
        }
        if (PalBattleCore.isDying(battler)) d = Math.floor(d * 4 / 5);
        return d;
    };

    PalBattleCore.enemyDexterity = function (enemy) {
        const meta = PalBattleCore.enemyMeta(enemy);
        let d = enemy.agi + ((meta ? meta.lv : 0) + 6) * 3;
        if (d < 20) d = 20;                                  // 非 PAL_CLASSIC 分支
        if (PalBattleCore.hasStateNote(enemy, HASTE_NOTE)) {
            d = Math.floor(d * 6 / 5);
        } else if (PalBattleCore.hasStateNote(enemy, SLOW_NOTE)) {
            d = Math.floor(d * 2 / 3);
        }
        return d;
    };

    // 行动系数。coef 显式传入时优先（合体技用 10）
    PalBattleCore.actionCoefficient = function (action) {
        if (action.isGuard()) return 5;                      // kBattleActionDefend
        if (action.isItem()) return 3;                       // kBattleActionUseItem
        if (action.isSkill() && !action.isForOpponent()) return 3;  // 对我方仙术
        return 1;                                            // 普攻 / 对敌仙术
    };

    PalBattleCore.speedOf = function (action, coef) {
        const subject = action.subject();
        if (!subject) return 0;
        const base = subject.isActor()
            ? PalBattleCore.actualDexterity(subject)
            : PalBattleCore.enemyDexterity(subject);
        let d = Math.floor(base * (coef === undefined
            ? PalBattleCore.actionCoefficient(action) : coef));
        if (subject.isActor() && PalBattleCore.isDying(subject)) d = Math.floor(d / 2);
        d = Math.floor(d * (0.9 + Math.random() * 0.2));     // RandomFloat(0.9,1.1)
        return Math.max(1, d);
    };

    Game_Action.prototype.speed = function () {
        return PalBattleCore.speedOf(this);
    };

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
    // 敌方AI：严格按原版 magicRate/10 决定普攻还是仙术（fight.c 4656）
    //
    // RMMZ 原生用 rating 权重抽（selectAllActions: ratingZero = max-3 后按权重），
    // 转换脚本写入的 rating [10-magicRate, magicRate] 会被 ratingZero 截断严重影响概率：
    //   magicRate=3 → 仙术被整个过滤掉（0%，原版 30%）
    //   magicRate=6 → 75%（原版 60%）      magicRate=7 → 100%（原版 70%）
    // 这里直接按原版判定式重写：RandomLong(0, 9) < wMagicRate 才放仙术。
    // 双动敌人每回合判定两次（原版两次行动各自独立判定，fight.c 1478）。
    //=============================================================================

    const _selectAllActions = Game_Enemy.prototype.selectAllActions;
    Game_Enemy.prototype.selectAllActions = function (actionList) {
        const meta = PalBattleCore.enemyMeta(this);
        const rate = meta ? (meta.magicRate || 0) : 0;
        const attacks = actionList.filter(a => a.skillId === BASIC_ATTACK_SKILL_ID);
        const magics = actionList.filter(a => a.skillId !== BASIC_ATTACK_SKILL_ID);
        // 额外仙术（第二招）：数据里没有，只有备注 <pal:{... "magic2":{"skill":id,"rate":n}}>
        // 时才有。判定顺序：主仙术 magicRate/10 → 额外仙术 rate/10 → 普攻。
        const m2 = meta && meta.magic2;
        const main = m2 ? magics.filter(a => a.skillId !== m2.skill) : magics;
        const extra = m2 ? magics.filter(a => a.skillId === m2.skill) : [];
        // 被封咒时上面的 isActionValid 已把仙术剔除（magics 为空）→ 回落到只普攻
        if (attacks.length > 0 && (main.length > 0 || extra.length > 0)) {
            for (let i = 0; i < this.numActions(); i++) {
                let chosen = null;
                if (main.length > 0 && randInt(0, 9) < rate) {
                    chosen = main[Math.randomInt(main.length)];
                } else if (extra.length > 0 && m2.rate > 0 && randInt(0, 9) < m2.rate) {
                    chosen = extra[0];
                } else {
                    chosen = attacks[0];
                }
                this.action(i).setEnemyAction(chosen);
            }
            return;
        }
        _selectAllActions.call(this, actionList);
    };

    // 敌方施法不消耗真气（原版敌方没有真气概念，仙术想放就放）
    Game_Enemy.prototype.canPaySkillCost = function () {
        return true;
    };
    const _paySkillCost = Game_Battler.prototype.paySkillCost;
    Game_Battler.prototype.paySkillCost = function (skill) {
        if (this.isEnemy()) return;
        _paySkillCost.call(this, skill);
    };

    //=============================================================================
    // 命中判定（fight.c 4954 / 5056）
    //
    // 原版物理攻击没有 miss，但敌人打我方时有 7/17 ≈ 41% 的「自动格挡」：
    //   fAutoDefend = (RandomLong(0, 16) >= 10)   —— 格挡则不掉血、也不触发附带道具
    // 我方打敌人则没有格挡一说（敌人不会防御），等于必中。
    // 这里把这两条折成 RMMZ 的命中率，避免依赖数据库里根本没配的 HIT 特性
    // （本工程 Enemies.json 无 XPARAM 特性 → 引擎默认 hit=0 → 敌人普攻会 100% miss）。
    //=============================================================================

    const PAL_ENEMY_HIT = 10 / 17; // 1 - 7/17，原版敌人物理攻击的有效命中率
    Game_Action.prototype.itemHit = function (target) {
        const item = this.item();
        const rate = (item ? item.successRate : 100) * 0.01;
        const subject = this.subject();
        if (subject && subject.isEnemy() && this.isPhysical()) {
            // 昏睡 / 疯魔 / 定身(迟缓) 无法格挡 → 必中（fight.c 4974-4986）
            if (!PalBattleCore.canAutoDefend(target)) return rate;
            return rate * PAL_ENEMY_HIT;
        }
        return rate;
    };

    //=============================================================================
    // 敌人普攻附带道具 wAttackEquivItem（fight.c 5100-5110）—— 敌人的“第二招”
    //
    // 原版触发条件（物理攻击命中后）：
    //   未被队友掩护 && 未被自动格挡 && wAttackEquivItemRate >= RandomLong(1,10)
    //   && 我方毒抗 < RandomLong(1,100)   →  跑道具的 ScriptOnUse
    // 道具脚本语义（Scripts.json + sdlpal script.c）：
    //   0x0029 下毒：operand[1] = 毒对象 551赤毒/552尸毒/553瘴毒/554毒丝
    //   0x002D 上状态：operand[0] = 状态号 2=昏睡 3=咒封（global.h 42-55），operand[1] = 回合数
    // 数据由 tools/pal_patch_enemy_traits.py 写成备注里的 equiv:{state,rate}
    //=============================================================================

    PalBattleCore.applyEquivItem = function (action, target) {
        const subject = action.subject();
        if (!subject || !subject.isEnemy() || !target || !target.isActor()) return;
        if (!action.isAttack() || target.isDead()) return;
        const meta = PalBattleCore.enemyMeta(subject);
        const eq = meta && meta.equiv;
        if (!eq) return;
        const res = target.result();
        if (res && (res.missed || res.evaded)) return;   // 原版：只有打中才判定
        if (randInt(1, 10) > eq.rate) return;            // rate >= RandomLong(1,10)
        if (randInt(1, 100) <= PalBattleCore.actorElementResist(target, 6)) return; // 毒抗检定
        target.addState(eq.state);                       // 会自动记入 result，状态图标即刷新
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
