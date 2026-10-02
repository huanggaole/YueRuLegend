/*:
 * @target MZ
 * @plugindesc [v1.0] 仙剑98柔情版敌方战斗脚本系统（OnTurnStart/OnReady/OnBattleEnd 三钩子 VM：条件换招/召唤/变身/分裂/逃跑/掉落）+ 战后自动恢复 + 开场死者 1 血
 * @author AI Assistant
 *
 * @help
 * 复刻 sdlpal script.c 的触发脚本解释器（PAL_RunTriggerScript）在战斗中的三个
 * 敌方钩子（battle.c:1613-1615 / fight.c:1184-1189, 1226-1227, 1689-1690）：
 *
 *   OnTurnStart  战斗开场一次 + 每个敌人行动结束后一次（fight.c:1259）
 *   OnReady      敌人出手前（原版 kFighterCom 状态），脚本用 0x0067 动态换招、
 *                0x009E 召唤、0x009F 变身、0x009C 分裂、0xFFFF 换 0xFFFF 则跳过行动
 *   OnBattleEnd  胜利结算时（battle.c:1336），0x001F 往背包塞掉落物
 *
 * 脚本是【有状态】的：返回值 = 下次进入点（0x0001 停在下一行 / 0x0002 跳到指定行），
 * 拜月教主等大段循环脚本依赖这个语义，不能当无状态函数跑。
 *
 * 数据：data/PalEnemyScripts.json（tools/pal_export_enemy_scripts.py 生成，
 * 来源 D:\仙剑逆向拆解 逆向数据 + 原版 MSG_chs.txt / Data.mkf）。
 *
 * 另有三个独立于脚本系统的原版机制也在这里（都挂在战斗流程上）：
 *   · 战后自动恢复 battle.c:1342-1371：全体（含死亡）HP/MP 补缺口一半 → 死者半血复活
 *   · 开场死者 1 血 battle.c:1567-1577：进场时 HP=0 的队员置 1 血并清傀儡
 *   · 敌人混乱 fight.c:4591-4655：只打同伴，只剩自己则跳过行动
 *
 * 演出类指令（过场淡入/音乐/对话框美化）按报告结论降级：文本进战斗日志，其余 no-op。
 * 必须排在 palBattleCore.js / palBattleSkillFx.js 之后加载。
 */

(() => {
    const PalES = (window.PalEnemyScript = {});

    const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
    const s16 = v => (v > 32767 ? v - 65536 : v); // WORD -> SHORT

    const BASIC_ATTACK_SKILL_ID = 236;
    const SEAL_STATE_ID = 6;            // 咒封
    const CONFUSE_STATES = [9, 11];     // 疯魔 / 疯魔5
    const SLEEP_STATES = [10, 19];      // 昏睡3 / 昏睡5
    const PARA_STATES = [4, 5, 7];      // 定身系
    const MAX_ENEMIES_IN_TEAM = 5;      // 原版 MAX_ENEMIES_IN_TEAM

    //=========================================================================
    // 数据加载：data/PalEnemyScripts.json → window.$palEnemyScripts
    //=========================================================================

    const _DataManager_loadDatabase = DataManager.loadDatabase;
    DataManager.loadDatabase = function () {
        _DataManager_loadDatabase.call(this);
        this._palEsLoaded = false;
        const xhr = new XMLHttpRequest();
        xhr.open("GET", "data/PalEnemyScripts.json");
        xhr.overrideMimeType("application/json");
        xhr.onload = () => {
            try {
                window.$palEnemyScripts = JSON.parse(xhr.responseText);
            } catch (e) {
                console.warn("[palBattleEnemyScript] PalEnemyScripts.json 解析失败", e);
                window.$palEnemyScripts = null;
            }
            this._palEsLoaded = true;
        };
        xhr.onerror = () => {
            console.warn("[palBattleEnemyScript] PalEnemyScripts.json 加载失败（未运行导出工具？）");
            window.$palEnemyScripts = null;
            this._palEsLoaded = true;
        };
        xhr.send();
    };

    const _DataManager_isDatabaseLoaded = DataManager.isDatabaseLoaded;
    DataManager.isDatabaseLoaded = function () {
        return _DataManager_isDatabaseLoaded.call(this) && this._palEsLoaded;
    };

    const DATA = () => window.$palEnemyScripts || null;

    //=========================================================================
    // 敌人脚本槽初始化（Game_Enemy.setup 时挂 _palScr / _palVMMagic）
    //=========================================================================

    // projectEnemyId -> 原版敌人对象 id（0x0091「同类第一个」判定用）
    let _objByEnemyId = null;
    PalES.objIdOf = function (enemyId) {
        const d = DATA();
        if (!d) return 0;
        if (!_objByEnemyId) {
            _objByEnemyId = {};
            for (const eid in d.enemies) _objByEnemyId[eid] = d.enemies[eid].obj;
            for (const obj in d.enemyObj) _objByEnemyId[d.enemyObj[obj]] = Number(obj);
        }
        return _objByEnemyId[String(enemyId)] || 0;
    };

    PalES.setup = function (enemy) {
        enemy._palScr = null;
        enemy._palVMMagic = null;
        enemy._palObjId = 0;
        const d = DATA();
        if (!d || !enemy.enemy) return;
        const eid = enemy.enemyId();
        enemy._palObjId = PalES.objIdOf(eid);
        const ent = d.enemies[String(eid)];
        if (ent) {
            enemy._palScr = { turn: ent.turn || 0, ready: ent.ready || 0, end: ent.end || 0 };
        }
        // 默认招式 = 行动表第一个非普攻技能 + 备注 magicRate（原版 Enemies.csv wMagic/wMagicRate，
        // 脚本 0x0067 会在运行时覆盖它；未覆盖就按这个打）
        const meta = PalBattleCore.enemyMeta(enemy);
        const magics = (enemy.enemy().actions || []).filter(a => a.skillId !== BASIC_ATTACK_SKILL_ID);
        enemy._palVMMagic = {
            skill: magics.length ? magics[0].skillId : 0,
            rate: meta ? (meta.magicRate || 0) : 0
        };
    };

    const _Game_Enemy_setup = Game_Enemy.prototype.setup;
    Game_Enemy.prototype.setup = function (enemyId, x, y) {
        _Game_Enemy_setup.call(this, enemyId, x, y);
        PalES.setup(this);
    };

    //=========================================================================
    // 隐身（隐蛊）：敌人停摆、敌方脚本停摆（fight.c 1213/1680）
    //   回合数存在 $gameTroop 上，palSpecialArts 的隐蛊写入，每场战斗开始清零
    //=========================================================================

    PalES.hiding = function () {
        return ($gameTroop && ($gameTroop._palHiding | 0)) > 0;
    };

    //=========================================================================
    // 脚本 VM（PAL_RunTriggerScript 战斗子集）
    //
    // 语义对照 script.c：
    //   0x0000 停，恢复点不变          0x0001 停，恢复点=pc+1
    //   0x0002 停，恢复点=o1           0x0003 pc=o1 继续
    //   0x0006 rand(1,100)>=o1 → pc=o2（o2=0 即退出且恢复点不变），否则 pc++
    //   0x00A2 pc += rand(0, o1-1) + 1
    //=========================================================================

    const _warnedOps = new Set();
    const warnOp = (op, pc) => {
        if (_warnedOps.has(op)) return;
        _warnedOps.add(op);
        console.warn("[palBattleEnemyScript] 未实现指令 0x%s @%d（按 no-op 跳过）",
            op.toString(16).toUpperCase().padStart(4, "0"), pc);
    };

    PalES.run = function (enemy, slot) {
        const d = DATA();
        const scr = enemy._palScr;
        if (!d || !scr || !scr[slot]) return;
        if (slot !== "end" && PalES.hiding()) return; // 隐身中敌方脚本停摆
        let pc = scr[slot];
        let ret = pc;                    // wNextScriptEntry：只有 0x0001/0x0002 会改
        let guard = 0;
        while (pc > 0 && guard++ < 2000) {
            const e = d.scripts[pc];
            if (!e) break;
            const op = e[0], o1 = e[1], o2 = e[2], o3 = e[3];
            switch (op) {
                case 0x0000: pc = 0; break;
                case 0x0001: ret = pc + 1; pc = 0; break;
                case 0x0002: ret = o1; pc = 0; break;
                case 0x0003: pc = o1; break;
                case 0x0006: pc = (randInt(1, 100) >= o1) ? o2 : pc + 1; break;
                case 0x00A2: pc = pc + 1 + randInt(0, Math.max(0, o1 - 1)); break;

                // ---- 决策 ----
                case 0x0067: { // 换招：o1=仙术对象 id；0=只普攻；0xFFFF=不行动；o2=概率（0→10）
                    if (o1 === 0) {
                        enemy._palVMMagic = { skill: 0, rate: o2 || 10 };
                    } else if (o1 === 0xFFFF) {
                        enemy._palVMMagic = { skill: 0xFFFF, rate: o2 || 10 };
                    } else {
                        const sid = d.magicObj[String(o1)];
                        if (sid) {
                            enemy._palVMMagic = { skill: sid, rate: o2 || 10 };
                        } else {
                            console.warn("[palBattleEnemyScript] 0x0067 未映射仙术对象", o1);
                        }
                    }
                    pc++;
                    break;
                }
                case 0x0091: { // 不是同类第一个存活 → 跳 o1
                    const mates = $gameTroop.members().filter(m =>
                        m.isAlive() && m._palObjId === enemy._palObjId);
                    pc = (mates.indexOf(enemy) > 0) ? o1 : pc + 1;
                    break;
                }
                case 0x0079: { // 某角色在队 → pc=o2（o1=名字词 id，36+i=角色索引，项目 actorId=索引+1）
                    const actor = $gameActors.actor(o1 - 35);
                    const inParty = actor && $gameParty.battleMembers().indexOf(actor) >= 0;
                    pc = inParty ? o2 : pc + 1;
                    break;
                }

                // ---- 战场行为 ----
                case 0x009E: { // 召唤：o1=敌人对象（0/FFFF=自己），o2=数量（0→1），失败跳 o3
                    const ok = PalES.summon(enemy, o1, o2 <= 0 ? 1 : o2);
                    pc = (!ok && o3 !== 0) ? o3 : pc + 1;
                    break;
                }
                case 0x009F: // 变身：o1=敌人对象，保留 HP；眠/定/乱/隐身时跳过
                    if (!PalES.hiding() && !PalES.hasAnyState(enemy, [...SLEEP_STATES, ...PARA_STATES, ...CONFUSE_STATES])) {
                        PalES.transform(enemy, o1);
                    }
                    pc++;
                    break;
                case 0x009C: { // 分裂：o1=份数（0→1），仅余 1 敌且 HP>1；失败跳 o2
                    const ok = PalES.divide(enemy, o1 <= 0 ? 1 : o1);
                    pc = (!ok && o2 !== 0) ? o2 : pc + 1;
                    break;
                }
                case 0x0069: // 敌方全体逃跑（剧情战：蝶精彩依/蛇女灵儿/绿叶小妖）→ 战斗终止
                    PalES.enemyEscapeAll();
                    pc++;
                    break;
                case 0x0089: // 设战斗结果（观测值全为 0=Terminated；3=胜 1=负 FFFF=逃 仅兜底）
                    PalES.setBattleResult(o1);
                    pc++;
                    break;
                case 0x001F: // 掉落：o1=道具对象 ×(o2||1) → 塞进胜利面板奖励列表
                    PalES.gainDrop(o1, o2 || 1);
                    pc++;
                    break;

                // ---- 剧情战对玩家的直接操作（明王觉醒等）----
                case 0x0019: PalES.changePlayerAttr(o1, s16(o2), o3); pc++; break;
                case 0x001D: // 全体 HP/MP += o2/o3（仅观测到全体分支）
                    if (o1) {
                        for (const a of $gameParty.battleMembers()) {
                            a.gainHp(s16(o2));
                            a.gainMp(s16(o3));
                        }
                    }
                    pc++;
                    break;
                case 0x0022: // 复活：全体死者 HP=最大×o2/10 + 解毒 + 清状态
                    if (o1) {
                        for (const a of $gameParty.battleMembers()) {
                            if (a.isDead()) {
                                a.removeState(a.deathStateId());
                                a.setHp(Math.floor(a.mhp * o2 / 10));
                                if (window.PalSkillFx) PalSkillFx.cureAllPoison(a);
                                for (const st of [9, 11, 10, 19, 4, 5, 7, 6]) a.removeState(st);
                            }
                        }
                    }
                    pc++;
                    break;
                case 0x0092: pc++; break; // 玩家施法动画 → 降级 no-op

                // ---- 演出类（script.c:3269/3391-3470）----
                // 对白类指令（0xFFFF 文本 / 0x003B-E 开对话框 / 0x0005 翻页）已事件化：
                // tools/pal_gen_battle_dialogue_events.py 把对白转译成 troop 事件页
                // （turn 0、span=战斗），编辑器里可直接改文本；VM 这里全部跳过。
                case 0xFFFF:
                    while (pc > 0) { // 连续文本块整体跳过
                        const t = d.scripts[pc];
                        if (!t || t[0] !== 0xFFFF) break;
                        pc++;
                    }
                    break;
                case 0x003B:
                case 0x003C:
                case 0x003D:
                case 0x003E:
                case 0x0005:
                case 0x008E:   // 恢复画面
                case 0x0043:   // 背景音乐
                case 0x0077:   // 停止音乐
                case 0x0085:   // 延时
                case 0x0090:   // 改写对象脚本
                case 0x0068:   // 「敌方回合才跳」：脚本钩子不在敌方行动中触发 → 恒不跳
                    pc++;
                    break;
                case 0x0047: PalBattleCore.playPalSe(o1); pc++; break; // 音效

                default:
                    warnOp(op, pc);
                    pc++;
                    break;
            }
        }
        scr[slot] = ret;
        if (guard >= 2000) console.warn("[palBattleEnemyScript] 脚本死循环保护 @", enemy.name());
    };

    PalES.hasAnyState = function (battler, ids) {
        return ids.some(id => battler.isStateAffected(id));
    };

    PalES.battleText = function (text) {
        const lw = BattleManager._logWindow;
        if (lw && text) {
            lw.push("addText", text);
            // 过场对白需要停顿才看得见
            lw.push("wait");
        }
    };

    //=========================================================================
    // 召唤（0x009E，script.c:2872）
    //   空位不足（活敌+数量>5）/ 隐身中 / 自身眠定乱 → 失败跳 o3
    //   召唤怪满状态进场、脚本从入口重新跑、音效 212
    //=========================================================================

    PalES.summon = function (caster, objId, count) {
        const d = DATA();
        if (!d) return false;
        if (PalES.hiding()) return false;
        if (PalES.hasAnyState(caster, [...SLEEP_STATES, ...PARA_STATES, ...CONFUSE_STATES])) return false;
        let enemyId;
        if (objId === 0 || objId === 0xFFFF) {
            enemyId = caster.enemyId();
        } else {
            enemyId = d.enemyObj[String(objId)];
        }
        if (!enemyId || !$dataEnemies[enemyId]) {
            console.warn("[palBattleEnemyScript] 召唤目标未映射 obj", objId);
            return false;
        }
        if ($gameTroop.aliveMembers().length + count > MAX_ENEMIES_IN_TEAM) return false;
        for (let i = 0; i < count; i++) {
            const pos = PalES.summonPos(caster, i);
            const e = new Game_Enemy(enemyId, pos[0], pos[1]);
            $gameTroop._enemies.push(e);
            PalES.createSprite(e);
            // 原版 flTimeMeter=50 → 本回合后段即可行动：排进本回合行动队列尾部
            if (BattleManager._phase === "turn" && BattleManager._actionBattlers) {
                e.makeActions();
                BattleManager._actionBattlers.push(e);
            }
        }
        $gameTroop.makeUniqueNames();
        PalBattleCore.playPalSe(212);
        PalES.battleText(caster.name() + "召唤了帮手！");
        return true;
    };

    // 召唤怪站位：召唤者周围（PAL 单位 ×3 = 本工程像素）
    PalES.summonPos = function (caster, i) {
        const k = Graphics.boxWidth / 320;
        const offs = [[-30, -12], [-30, 12], [-52, 0], [-16, -24], [-16, 24]];
        const o = offs[i % offs.length];
        const x = Math.min(Math.max(caster._screenX + o[0] * k, 30 * k), Graphics.boxWidth * 0.62);
        const y = Math.min(Math.max(caster._screenY + o[1] * k, 40 * k), Graphics.boxHeight - 60 * k);
        return [x, y];
    };

    PalES.spriteOf = function (enemy) {
        if (window.PalBattleAnim && PalBattleAnim.spriteOf) return PalBattleAnim.spriteOf(enemy);
        const scene = SceneManager._scene;
        const ss = scene && scene._spriteset;
        if (!ss || !ss._enemySprites) return null;
        return ss._enemySprites.find(sp => sp._enemy === enemy) || null;
    };

    PalES.createSprite = function (enemy) {
        const scene = SceneManager._scene;
        const ss = scene && scene._spriteset;
        if (!ss || !ss._battleField) return;
        const sp = new Sprite_Enemy(enemy);
        ss._enemySprites.push(sp);
        ss._enemySprites.sort(ss.compareEnemySprite.bind(ss));
        ss._battleField.addChild(sp);
    };

    //=========================================================================
    // 变身（0x009F，script.c:2956）：换对象、保留当前 HP、【脚本指针不变】
    //=========================================================================

    PalES.transform = function (enemy, objId) {
        const d = DATA();
        const enemyId = d && d.enemyObj[String(objId)];
        if (!enemyId || !$dataEnemies[enemyId]) {
            console.warn("[palBattleEnemyScript] 变身目标未映射 obj", objId);
            return;
        }
        const hp = enemy.hp;
        enemy._enemyId = enemyId;
        enemy._palObjId = Number(objId);
        enemy._letter = "";
        enemy._plural = false;
        enemy.setHp(Math.min(hp, enemy.mhp));
        // 状态保留（原版不清）；精灵重新加载
        const sp = PalES.spriteOf(enemy);
        if (sp) {
            sp._battlerName = null;
            sp.updateBitmap();
        }
        $gameTroop.makeUniqueNames();
        PalBattleCore.playPalSe(47);
        PalES.battleText(enemy.name() + "现出了原形！");
    };

    //=========================================================================
    // 分裂（0x009C，script.c:2778）：全场只剩 1 敌且 HP>1 才能分；
    //   分成 w+1 份，每份 (HP+w)/(w+1)；新个体脚本从入口重跑（近似原版继承 PC）
    //=========================================================================

    PalES.divide = function (enemy, w) {
        if ($gameTroop.aliveMembers().length !== 1 || enemy.hp <= 1) return false;
        const share = Math.floor((enemy.hp + w) / (w + 1));
        const copies = [];
        for (let i = 0; i < w; i++) {
            const e = new Game_Enemy(enemy.enemyId(), enemy._screenX, enemy._screenY);
            $gameTroop._enemies.push(e);
            copies.push(e);
        }
        enemy.setHp(share);
        for (const e of copies) {
            e.setHp(share);
            PalES.createSprite(e);
            if (BattleManager._phase === "turn" && BattleManager._actionBattlers) {
                e.makeActions();
                BattleManager._actionBattlers.push(e);
            }
        }
        $gameTroop.makeUniqueNames();
        return true;
    };

    //=========================================================================
    // 敌方全体逃跑（0x0069 → PAL_BattleEnemyEscape，battle.c:1379）
    //   结果 = kBattleResultTerminated：无经验无结算，直接退出战斗
    //=========================================================================

    PalES.enemyEscapeAll = function () {
        PalBattleCore.playPalSe(45);
        for (const e of $gameTroop.aliveMembers()) e.escape();
        BattleManager.abort();
    };

    // 0x0089 设战斗结果。观测到的脚本全部用 0（Terminated → abort）。
    PalES.setBattleResult = function (r) {
        if (r === 0 || r === 0xFFFF) {
            BattleManager.abort();
        } else if (r === 3) {
            for (const e of $gameTroop.aliveMembers()) e.die();
        } else if (r === 1) {
            BattleManager.processDefeat();
        } else {
            console.warn("[palBattleEnemyScript] 0x0089 未知战斗结果", r);
        }
    };

    //=========================================================================
    // 掉落（0x001F）：塞进 _rewards.items，由胜利面板统一发放（palBattleVictory）
    //=========================================================================

    PalES.gainDrop = function (objId, count) {
        const d = DATA();
        const ent = d && d.itemObj[String(objId)];
        if (!ent) {
            console.warn("[palBattleEnemyScript] 掉落道具未映射 obj", objId);
            return;
        }
        const item = ent[0] === "weapon" ? $dataWeapons[ent[1]]
            : ent[0] === "armor" ? $dataArmors[ent[1]]
                : $dataItems[ent[1]];
        if (!item || !BattleManager._rewards) return;
        for (let i = 0; i < count; i++) BattleManager._rewards.items.push(item);
    };

    //=========================================================================
    // 0x0019 改玩家属性（PLAYERROLES 平坦数组下标，global.h:299）
    //   观测来源：明王剧情战（灵儿觉醒：等级/上限/五围全面上调）
    //=========================================================================

    const ROLE_ATTR = {
        6: "level", 7: "mhp", 8: "mmp", 9: "hp", 10: "mp",
        17: "atk", 18: "mat", 19: "def", 20: "agi", 21: "luk"
    };
    PalES.changePlayerAttr = function (idx, delta, roleOp) {
        const key = ROLE_ATTR[idx];
        if (!key || roleOp === 0) { warnOp(0x19, idx); return; }
        const actor = $gameActors.actor(roleOp); // roleOp = o3 = 角色索引+1 = 项目 actorId
        if (!actor) return;
        switch (key) {
            case "level": actor.changeLevel(Math.max(1, actor.level + delta), false); break;
            case "hp": actor.gainHp(delta); break;
            case "mp": actor.gainMp(delta); break;
            case "mhp": actor.addParam(0, delta); break;
            case "mmp": actor.addParam(1, delta); break;
            case "atk": actor.addParam(2, delta); break;
            case "mat": actor.addParam(3, delta); break;
            case "def": actor.addParam(4, delta); break;
            case "agi": actor.addParam(6, delta); break;
            case "luk": actor.addParam(7, delta); break;
        }
    };

    //=========================================================================
    // 敌人混乱（fight.c 4591-4655）：只打同伴；只剩自己 → 跳过行动
    //   str=攻+(等级+6)×6，def=目标防+(目标等级+6)×4，base×2/物理抗性，至少 1
    //=========================================================================

    PalES.isConfused = function (b) {
        return PalES.hasAnyState(b, CONFUSE_STATES);
    };

    PalES.makeConfuseActions = function (enemy) {
        const mates = $gameTroop.members().filter(m => m !== enemy && m.isAlive());
        if (mates.length === 0) {
            enemy.clearActions(); // 只剩自己 → 什么都不做
            return;
        }
        for (let i = 0; i < enemy.numActions(); i++) {
            const a = enemy.action(i);
            if (!a) continue;
            a.setAttack();
            a._palMateTarget = mates[randInt(0, mates.length - 1)];
        }
    };

    PalES.confuseDamage = function (subject, target) {
        const smeta = PalBattleCore.enemyMeta(subject);
        const tmeta = PalBattleCore.enemyMeta(target);
        const str = subject.atk + ((smeta ? smeta.lv : 0) + 6) * 6;
        const def = target.def + ((tmeta ? tmeta.lv : 0) + 6) * 4;
        const res = tmeta ? (tmeta.physRes || 0) : 0;
        let dmg = PalBattleCore.baseDamage(str, def) * 2;
        if (res) dmg = Math.floor(dmg / res);
        return Math.max(1, dmg);
    };

    const _Game_Action_makeTargets = Game_Action.prototype.makeTargets;
    Game_Action.prototype.makeTargets = function () {
        if (this._palMateTarget) {
            // 敌人混乱打同伴；出手前目标已死则重选（fight.c 的兜底）
            let t = this._palMateTarget;
            const s = this.subject();
            if (!t.isAlive()) {
                const mates = $gameTroop.members().filter(m => m !== s && m.isAlive());
                if (mates.length === 0) return [];
                t = mates[randInt(0, mates.length - 1)];
                this._palMateTarget = t;
            }
            return this.repeatTargets([t]);
        }
        return _Game_Action_makeTargets.call(this);
    };

    const _Game_Action_makeDamageValue = Game_Action.prototype.makeDamageValue;
    Game_Action.prototype.makeDamageValue = function (target, critical) {
        const s = this.subject();
        if (this.isAttack() && s && s.isEnemy && s.isEnemy() && target && target.isEnemy && target.isEnemy()) {
            return PalES.confuseDamage(s, target);
        }
        return _Game_Action_makeDamageValue.call(this, target, critical);
    };

    //=========================================================================
    // 敌方行动决策（selectAllActions 最外层：本插件在 palBattleCore 之后加载）
    //
    // 优先级：隐身停摆 > 混乱打同伴 > 脚本驱动（OnReady + 0x0067）> palBattleCore 的 AI
    //
    // 脚本驱动决策严格对齐 PAL_BattleEnemyPerformAction（fight.c:4655-4667）：
    //   wMagic!=0 && RandomLong(0,9)<wMagicRate && 未封咒 → 施法（0xFFFF=跳过行动）
    //   否则 → 普攻
    //=========================================================================

    const _Game_Enemy_selectAllActions = Game_Enemy.prototype.selectAllActions;
    Game_Enemy.prototype.selectAllActions = function (actionList) {
        if (PalES.hiding()) {
            this.clearActions(); // 隐身中敌人全体停摆
            return;
        }
        if (PalES.isConfused(this)) {
            PalES.makeConfuseActions(this);
            return;
        }
        if (this._palScr && this._palScr.ready) {
            for (let i = 0; i < this.numActions(); i++) {
                const a = this.action(i);
                if (!a) continue;
                // 双动敌人每次行动各跑一遍脚本（原版每次 kFighterCom 都跑）
                PalES.run(this, "ready");
                const ch = this._palVMMagic;
                const sealed = this.isStateAffected(SEAL_STATE_ID);
                const rolled = ch && ch.skill !== 0 && randInt(0, 9) < (ch.rate || 0) && !sealed;
                if (rolled && ch.skill === 0xFFFF) {
                    a._palPass = true; // 本槽跳过
                } else if (rolled) {
                    a.setSkill(ch.skill);
                } else {
                    a.setAttack();
                }
            }
            if (this._actions.every(a => a._palPass)) this.clearActions();
            return;
        }
        _Game_Enemy_selectAllActions.call(this, actionList);
    };

    //=========================================================================
    // 三钩子的战斗流程挂载
    //=========================================================================

    // 隐身中：已排好的敌方行动也要拦下（原版 iHidingTime>0 时敌人时间表清零不行动）
    const _BattleManager_processTurn = BattleManager.processTurn;
    BattleManager.processTurn = function () {
        const s = this._subject;
        if (s && s.isEnemy && s.isEnemy() && PalES.hiding()) {
            s.clearActions(); // processTurn 的 else 分支会干净地跳过
        }
        _BattleManager_processTurn.call(this);
    };

    // OnTurnStart：战斗开场跑一遍（原版 fTurnStart 初值 TRUE，battle.c:744 在首帧执行）
    // + 开场死人 1 血（battle.c:1567-1577）
    const _BattleManager_startBattle = BattleManager.startBattle;
    BattleManager.startBattle = function () {
        _BattleManager_startBattle.call(this);
        $gameTroop._palHiding = 0; // 隐蛊效果不跨战斗
        for (const a of $gameParty.battleMembers()) {
            if (a.hp <= 0 || a.isDead()) {
                a.removeState(a.deathStateId());
                a.setHp(1);
            }
        }
        for (const e of $gameTroop.members()) {
            if (e._palScr && e._palScr.turn) PalES.run(e, "turn");
        }
    };

    // OnTurnStart：敌人每次行动结束后再跑（fight.c:1259 fTurnStart=TRUE）
    const _BattleManager_endAction = BattleManager.endAction;
    BattleManager.endAction = function () {
        const subject = this._subject;
        _BattleManager_endAction.call(this);
        if (subject && subject.isEnemy && subject.isEnemy() && subject.isAlive() &&
            subject._palScr && subject._palScr.turn && !PalES.hiding()) {
            PalES.run(subject, "turn");
        }
    };

    // OnBattleEnd：胜利结算时（battle.c:1336），掉落进 _rewards.items
    const _BattleManager_makeRewards = BattleManager.makeRewards;
    BattleManager.makeRewards = function () {
        _BattleManager_makeRewards.call(this);
        for (const e of $gameTroop.members()) {
            if (e._palScr && e._palScr.end) PalES.run(e, "end");
        }
    };

    // 战后自动恢复（battle.c:1342-1371，PAL98 走 #if 1 经典分支）：
    //   全体（含死亡）HP/MP 各补缺口的一半 → 死者以半血复活
    const _BattleManager_endBattle = BattleManager.endBattle;
    BattleManager.endBattle = function (result) {
        if (result === 0) {
            for (const a of $gameParty.battleMembers()) {
                if (a.isDead()) a.removeState(a.deathStateId());
                a.gainHp(Math.floor((a.mhp - a.hp) / 2));
                a.gainMp(Math.floor((a.mmp - a.mp) / 2));
            }
        }
        _BattleManager_endBattle.call(this, result);
    };

})();
