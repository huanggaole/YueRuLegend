/*:
 * @target MZ
 * @plugindesc [v2.0] 仙剑98柔情版战斗胜利结算与战后提示画面
 * @author AI Assistant
 *
 * @help
 * 复刻仙剑98柔情版的战斗胜利界面（布局参数逐像素测量自原版比对录像帧，
 * 换算回 640×480 基准值）：
 *   结算阶段（原版录像 t≈5s 帧；纵坐标历经多次用户实测微调，以代码为准）：
 *     面板一「获得经验值 1480」：x 158, y 126, 宽 300, 高 80
 *     面板二「打败敌人得 3400 文钱」：x 124, y 249, 宽 364, 高 80
 *     （原版测量 x171/y171/宽274、x137/y294/宽338；2026-09-30 按用户要求
 *       各加宽 26，22:00 又整体再上移 45 ≈ 其窗口的 70px；
 *       经验数字在「文字末尾 ~ 框右缘」间居中，纵坐标按 ky 缩放）
 *   战后提示阶段（原版录像 t≈12s 帧，属性提升/获得物品）：
 *     提示框与结算框同高（80），自顶部向下堆叠：第一条外框顶 y=72（原版
 *     帧测得 117，22:00 随结算框整体上移 45），
 *     逐条 +54（后一条压在先一条上，先画的在下）。「获得一只傀儡虫」
 *     「林月如灵力提升 1」两帧同屏，钱框保留、经验框消失。
 *     文字外缘距框左缘 ≈17，属性增量数字（Data919 数字图，ds=2.4）
 *     右缘距框右缘 ≈29，数字与文字间距 ≈48。
 *   所有对话框边框均用 img/system 下 Data944.PNG(8×34 左) /
 *     Data945.PNG(16×34 中) / Data946.PNG(8×34 右) 按统一倍率
 *     k = 框高/34 缩放后横向拼接（中间平铺、末块允许裁切），
 *     不做纵向拉伸（倍率缩放，保持切片斜面比例）。
 *   文字 fontSize 32（本工程字体偏宽，5 字宽 ≈158 与原版一致）。
 *   数字由 Data919.PNG~Data928.PNG（0~9，6×8 素材 ×2.4）拼合。
 *
 * 流程：战斗胜利 → 播放胜利 ME、发放经验金钱 → 结算面板（经验+钱）
 * →（有升级/战利品则）经验框消失、提示框逐页堆叠（每页 2 条，按键或
 *   3 秒自动翻页）→ 淡出 → 返回地图。
 *   升级提示：等级提升「<姓名>等级提升」；属性按增量逐条
 *   「<姓名><属性>提升 N」（体力/真气/武术/灵力/防御/身法/吉运，
 *   取体力/真气上限增量）；习得仙术「<姓名>习得仙术 xxx」。
 *   战利品：「获得<物品名>」（原版带量词「一只」等，视素材可再调）。
 *   升级后体力/真气按原版规则全满。
 *
 * 需排在 palBattle / palBattleCore / palBattleAnim / palBattleDamage 之后加载。
 */

(() => {
    const PalBattleVictory = (window.PalBattleVictory = {});

    // 数字图（0~9，与伤害数字同款素材；919 米白 / 929 蓝）
    const digitImage = (d, base) => ImageManager.loadSystem("Data" + ((base || 919) + d));

    //=============================================================================
    // 对话框边框：Data944 左 + Data945 中平铺 + Data946 右，统一倍率缩放
    // （k = bitmap.height / 34，横向拼接、末块裁切，绝不纵向拉伸）
    //=============================================================================

    function drawSlicedBox(bitmap) {
        const left = ImageManager.loadSystem("Data944");
        const center = ImageManager.loadSystem("Data945");
        const right = ImageManager.loadSystem("Data946");
        if (!left.isReady() || !center.isReady() || !right.isReady()) return false;
        const k = bitmap.height / left.height; // 统一倍率
        const w = bitmap.width;
        const lW = left.width * k;
        const rW = right.width * k;
        bitmap.blt(left, 0, 0, left.width, left.height, 0, 0, lW, bitmap.height);
        bitmap.blt(right, 0, 0, right.width, right.height, w - rW, 0, rW, bitmap.height);
        const fillW = w - lW - rW;
        if (fillW > 0) {
            const tileW = center.width * k;
            for (let x = 0; x < fillW; x += tileW) {
                const drawW = Math.min(tileW, fillW - x);
                bitmap.blt(center, 0, 0, drawW / k, center.height, lW + x, 0, drawW, bitmap.height);
            }
        }
        return true;
    }

    // 在 bitmap 上拼数字，返回总宽度（未加载完成返回 -1）。
    // rightX 为数字串右边缘；ds 为素材放大倍数；spacing 为字间空隙；base 919/929。
    function drawDigits(bitmap, value, rightX, centerY, ds, spacing, base) {
        const str = Math.max(0, Math.floor(value)).toString();
        const imgs = [];
        for (let i = 0; i < str.length; i++) imgs.push(digitImage(Number(str[i]), base));
        if (imgs.some(img => !img.isReady())) return -1;
        const dw = imgs[0].width * ds, dh = imgs[0].height * ds;
        let x = rightX - (dw + spacing) * str.length + spacing;
        const y = centerY - dh / 2;
        for (const img of imgs) {
            bitmap.blt(img, 0, 0, img.width, img.height, x, y, dw, dh);
            x += dw + spacing;
        }
        return (dw + spacing) * str.length - spacing;
    }

    //=============================================================================
    // 战后提示消息队列（升级 + 战利品 → 薄框堆叠消息）
    //=============================================================================

    PalBattleVictory.levelUpQueue = [];

    // 属性提升行定义：[显示名, snapshotParams 键]
    const ATTR_ROWS = [
        ["体力", "mhp"], ["真气", "mmp"], ["武术", "atk"], ["灵力", "mat"],
        ["防御", "def"], ["身法", "agi"], ["吉运", "luk"]
    ];

    // 组装战后提示消息（消费 levelUpQueue）。返回 [{text, digit?}]：
    //   战利品「获得<名>」在最上（原版帧：物品框压在属性框上方），
    //   其后按角色：等级提升 → 各属性提升（带增量数字）→ 习得仙术。
    PalBattleVictory.buildAftermathMessages = function (items) {
        const msgs = [];
        for (const name of items || []) msgs.push({ text: "获得" + name });
        const queue = PalBattleVictory.levelUpQueue.splice(0);
        for (const q of queue) {
            if (q.cur.level > q.pre.level) msgs.push({ text: q.name + "等级提升" });
            for (const [label, key] of ATTR_ROWS) {
                const d = (q.cur[key] || 0) - (q.pre[key] || 0);
                if (d > 0) msgs.push({ text: q.name + label + "提升", digit: d });
            }
            if (q.newSkills && q.newSkills.length > 0) {
                msgs.push({ text: q.name + "习得仙术" + q.newSkills.join("、") });
            }
        }
        return msgs;
    };

    //=============================================================================
    // Scene_Battle：显示胜利结算
    //=============================================================================

    Scene_Battle.prototype.showPalVictory = function (exp, gold, items, onDone) {
        this._palVictory = {
            exp, gold, onDone,
            state: "fadeIn", t: 0, holdT: 0,
            container: new Sprite(),
            listener: null,
            aftermathMessages: PalBattleVictory.buildAftermathMessages(items),
            aftermath: null
        };
        const cont = this._palVictory.container;
        cont.opacity = 0;
        this.addChild(cont);
        this.buildPalVictoryPanels();
    };

    // 结算/提示界面期间隐藏战斗状态栏（原版胜利画面只有场景+面板，无玩家信息框）。
    // 面板显示期间 BattleManager._phase 被冻结为 null → isBattleEnd() 为 false，
    // MZ 的 updateStatusWindowVisibility 每帧又会把状态栏 open() 回来；围攻取胜时
    // palBattleAuto 的 updateStatusWindowPosition 还在逐帧强制 show() —— 必须在这里
    // 整段拦下（close 且不走原逻辑）。
    const _updateStatusWindowVisibility = Scene_Battle.prototype.updateStatusWindowVisibility;
    Scene_Battle.prototype.updateStatusWindowVisibility = function () {
        if (this._palVictory || this._palLevelUp) {
            if (this._statusWindow) this._statusWindow.close();
            return;
        }
        _updateStatusWindowVisibility.call(this);
    };

    Scene_Battle.prototype.buildPalVictoryPanels = function () {
        const v = this._palVictory;
        if (!v) return;
        // 原版布局（640×480 游戏坐标，逐帧测量自原版录像，见文件头注释）。
        // 横向（x/宽）按 kx 缩放保持水平占比；纵向位置按 ky 缩放 —— 否则窗口
        // 宽于 4:3 时框随 kx 下移、钱框会贴到屏幕下缘（原版分布：经验框顶
        // 35.6%、钱框底 77.9% 屏高）。框高仍按 kx（文字随 kx 放大，框高须同步，
        // 窗口宽扁时字才不会贴满框）。
        // 2026-09-30 用户对照原版帧要求：两框各加宽约 26px（内容绝对位置不动，
        // 左右 padding 同时增大）；经验数字在「文字末尾 ~ 框右缘」间居中
        // （原版整块内容近似居中，右对齐会让短数字显得偏右）。
        // 2026-09-30 22:00 用户实测仍偏下：两框再整体上移 45（640 基准，
        // 即其 1200×752 窗口下的 ~70px）→ y1 126 / y2 249；战后提示框同步上移
        // （AFTERMATH_TOP 117→72），保持与钱框的相对关系。
        const kx = Graphics.boxWidth / 640;
        const ky = Graphics.boxHeight / 480;
        // 框高 80、宽 300/364（原版 274/338 各 +26，见文件头注释）
        const H = Math.round(80 * kx);
        const x1 = Math.round(158 * kx), y1 = Math.round(126 * ky), W1 = Math.round(300 * kx);
        const x2 = Math.round(124 * kx), y2 = Math.round(249 * ky), W2 = Math.round(364 * kx);
        v.layout = { kx, ky, H };
        v.panels = [
            { label: "获得经验值", value: v.exp, suffix: "", x: x1, y: y1, w: W1 },
            { label: "打败敌人得", value: v.gold, suffix: "文钱", x: x2, y: y2, w: W2 }
        ];
        for (const p of v.panels) {
            const sprite = new Sprite(new Bitmap(p.w, H));
            sprite.x = p.x;
            sprite.y = p.y;
            v.container.addChild(sprite);
            p.sprite = sprite;
        }
        this.redrawPalVictoryPanels();
    };

    Scene_Battle.prototype.redrawPalVictoryPanels = function () {
        const v = this._palVictory;
        if (!v || !v.panels) return;
        const { kx, H } = v.layout;
        // 数字：6×8 素材放大到高约 19（原版比例 2.4×），字间空隙 ≈ 2.6
        const ds = 2.4 * kx;
        const spacing = 2.6 * kx;
        // 文字垂直居中偏下 2px（原版阴影在下方，视觉重心略低）
        const cy = H / 2 + 2 * kx;
        // 等素材加载完成后重绘（每次 update 尝试，直到成功）
        let allReady = true;
        for (const p of v.panels) {
            const bitmap = p.sprite.bitmap;
            bitmap.clear();
            if (!drawSlicedBox(bitmap)) { allReady = false; continue; }
            bitmap.fontFace = $gameSystem.mainFontFace();
            bitmap.fontSize = Math.round(32 * kx);
            bitmap.textColor = "#000000";
            bitmap.outlineWidth = 0;
            // 标签：内容绝对位置保持原版测量值（框加宽后 rel 坐标随 x 左移 +13）
            const labelX = p.suffix ? 29 * kx : 30 * kx;
            bitmap.drawText(p.label, labelX, 0, 200 * kx, H, "left");
            if (p.suffix) {
                // 面板二：数字在定宽 5 位字段内居中（字段中心 abs 355 → rel 231），
                // 「文钱」紧随其后（abs 393 → rel 269）
                const fieldCenter = 231 * kx;
                const str = Math.max(0, Math.floor(p.value)).toString();
                const dw = 6 * ds;
                const total = (dw + spacing) * str.length - spacing;
                const digitsW = drawDigits(bitmap, p.value, fieldCenter + total / 2, cy, ds, spacing);
                if (digitsW < 0) { allReady = false; continue; }
                bitmap.drawText(p.suffix, 269 * kx, 0, 80 * kx, H, "left");
            } else {
                // 面板一：数字在「文字末尾 ~ 框右缘」之间居中（用户要求，
                // 对齐原版"整块内容近似居中"的观感；右对齐会让短数字偏右）
                const labelW = bitmap.measureTextWidth(p.label);
                const innerRight = p.w - 5 * kx; // 米色右缘（斜面边框 ≈5）
                const fieldCenter = (labelX + labelW + innerRight) / 2;
                const str = Math.max(0, Math.floor(p.value)).toString();
                const dw = 6 * ds;
                const total = (dw + spacing) * str.length - spacing;
                const digitsW = drawDigits(bitmap, p.value, fieldCenter + total / 2, cy, ds, spacing);
                if (digitsW < 0) { allReady = false; continue; }
            }
        }
        v.panelsReady = allReady;
    };

    //---------------------------------------------------------------------------
    // 战后提示框（薄框堆叠：升级/属性/仙术/战利品）
    //---------------------------------------------------------------------------

    const AFTERMATH_PER_PAGE = 2;   // 每页条数（原版帧：2 条 + 钱框同屏）
    const AFTERMATH_STEP = 54;      // 堆叠步距（640 基准，后一条压住前一条）
    const AFTERMATH_TOP = 72;       // 第一条外框顶（640 基准；22:00 随结算框整体上移 45）

    Scene_Battle.prototype.startPalAftermathPage = function (v, page) {
        const ky = v.layout.ky;
        const H = v.layout.H;
        v.aftermath.boxSprites = [];
        const pageMsgs = v.aftermathMessages.slice(page * AFTERMATH_PER_PAGE, (page + 1) * AFTERMATH_PER_PAGE);
        // 先画下面的、后画上面的：后宣布的（索引小，y 靠上）压在先宣布的之上
        for (let j = pageMsgs.length - 1; j >= 0; j--) {
            const sprite = new Sprite(new Bitmap(1, H)); // 宽度在 redraw 时按文字实测重设
            sprite.x = 0;
            // 纵向位置随 ky 缩放（与结算框一致，保持原版屏高占比）
            sprite.y = Math.round((AFTERMATH_TOP + AFTERMATH_STEP * j) * ky);
            sprite.opacity = 0;
            v.container.addChild(sprite);
            v.aftermath.boxSprites[j] = sprite;
        }
        v.aftermath.pageMsgs = pageMsgs;
        v.aftermath.pageReady = false;
        this.redrawPalAftermathPage(v);
    };

    Scene_Battle.prototype.clearPalAftermathBoxes = function (v) {
        if (!v.aftermath || !v.aftermath.boxSprites) return;
        for (const sp of v.aftermath.boxSprites) v.container.removeChild(sp);
        v.aftermath.boxSprites = [];
    };

    Scene_Battle.prototype.redrawPalAftermathPage = function (v) {
        const am = v.aftermath;
        const { kx, H } = v.layout;
        const ds = 2.4 * kx;
        const spacing = 2.6 * kx;
        const cy = H / 2 + 2 * kx;
        let allReady = true;
        for (let j = 0; j < am.boxSprites.length; j++) {
            const sprite = am.boxSprites[j];
            const msg = am.pageMsgs[j];
            const bitmap = sprite.bitmap;
            bitmap.fontFace = $gameSystem.mainFontFace();
            bitmap.fontSize = Math.round(32 * kx);
            bitmap.outlineWidth = 0;
            bitmap.textColor = "#000000";
            // 框宽 = 左缘留白 17 + 文字宽 +（增量数字：间距 48 + 数字宽 + 右留白 29
            //        | 纯文字：右留白 10），文字/数字位置见文件头注释（640 基准）
            const textW = bitmap.measureTextWidth(msg.text);
            let digitW = 0;
            if (msg.digit != null) {
                const str = Math.max(0, Math.floor(msg.digit)).toString();
                digitW = (6 * ds + spacing) * str.length - spacing;
            }
            const boxW = Math.round(17 * kx + textW + (msg.digit != null
                ? (48 * kx + digitW + 29 * kx) : 10 * kx));
            if (bitmap.width !== boxW) bitmap.resize(boxW, H);
            bitmap.clear();
            if (!drawSlicedBox(bitmap)) { allReady = false; continue; }
            bitmap.drawText(msg.text, 17 * kx, 0, boxW, H, "left");
            if (msg.digit != null) {
                if (drawDigits(bitmap, msg.digit, boxW - 29 * kx, cy, ds, spacing) < 0) {
                    allReady = false;
                }
            }
        }
        am.pageReady = allReady;
    };

    Scene_Battle.prototype.updatePalAftermath = function (v) {
        const am = v.aftermath;
        if (!am.pageReady) this.redrawPalAftermathPage(v);
        if (am.state === "pageIn") {
            let done = true;
            for (const sp of am.boxSprites) {
                sp.opacity = Math.min(255, sp.opacity + 17);
                if (sp.opacity < 255) done = false;
            }
            if (done && am.pageReady) { am.state = "pageHold"; am.holdT = 0; }
        } else if (am.state === "pageHold") {
            am.holdT += 16.7;
            const pressed = am.holdT > 400 &&
                (Input.isTriggered("ok") || Input.isTriggered("cancel") || TouchInput.isTriggered());
            if (pressed || am.holdT > 3000) {
                am.page++;
                if (am.page * AFTERMATH_PER_PAGE < v.aftermathMessages.length) {
                    this.clearPalAftermathBoxes(v);
                    this.startPalAftermathPage(v, am.page);
                    am.state = "pageIn";
                } else {
                    this.clearPalAftermathBoxes(v);
                    am.state = "done"; // 回到胜利流程统一淡出
                }
            }
        }
    };

    const _Scene_Battle_update = Scene_Battle.prototype.update;
    Scene_Battle.prototype.update = function () {
        _Scene_Battle_update.call(this);
        const v = this._palVictory;
        if (!v) return;
        v.t += 16.7;
        if (!v.panelsReady) this.redrawPalVictoryPanels();
        if (v.state === "fadeIn") {
            v.container.opacity = Math.min(255, v.container.opacity + 255 / 15);
            if (v.container.opacity >= 255 && v.panelsReady) {
                v.state = "hold";
                v.holdT = 0;
            }
        } else if (v.state === "hold") {
            v.holdT += 16.7;
            const pressed = v.holdT > 500 &&
                (Input.isTriggered("ok") || Input.isTriggered("cancel") || TouchInput.isTriggered());
            if (pressed || v.holdT > 3500) {
                if (v.aftermathMessages.length > 0) {
                    // 战后提示阶段：原版经验框消失、钱框保留，提示框自顶部堆叠
                    v.panels[0].sprite.visible = false;
                    v.state = "aftermath";
                    v.aftermath = { page: 0, state: "pageIn", holdT: 0 };
                    this.startPalAftermathPage(v, 0);
                } else {
                    v.state = "fadeOut";
                }
            }
        } else if (v.state === "aftermath") {
            this.updatePalAftermath(v);
            if (v.aftermath.state === "done") v.state = "fadeOut";
        } else if (v.state === "fadeOut") {
            v.container.opacity = Math.max(0, v.container.opacity - 255 / 12);
            if (v.container.opacity <= 0) {
                this.removeChild(v.container);
                this._palVictory = null;
                if (v.onDone) v.onDone();
            }
        }
    };

    //=============================================================================
    // BattleManager：胜利流程接管
    //=============================================================================

    //=============================================================================
    // 收尾节拍：胜负判定等画面演完再进行
    // --------------------------------------------------------------------------
    // RMMZ 原生 isBusy 只统计 MZ 动画与"位移中"，统计不到本工程的
    // ①伤害飘字（_damages 存活 ~0.4s）②动作序列尾部等待（_palSeq）
    // ③敌人死亡渐隐（_palDeathAt，~0.6s）——于是最后一击的伤害动画没播完、
    // 飘字还在往上飘，胜利面板就弹出来了。这里在"即将分出胜负"的当口先核对一遍：
    // 画面上还有没演完的，就下一帧再判。
    //=============================================================================

    BattleManager.isPalAftermathBusy = function () {
        const spriteset = this._spriteset;
        if (!spriteset) return false;
        for (const sp of spriteset.battlerSprites()) {
            if (sp._damages && sp._damages.length > 0) return true;   // 伤害飘字未飘完
            if (window.PalBattleAnim && PalBattleAnim.isBusy(sp)) return true; // 动作序列未播完
            const b = sp._battler;
            if (b && b.isDead && b.isDead() &&
                sp._palDeathAt && sp.opacity > 0) return true;        // 死亡渐隐未结束
        }
        return false;
    };

    const _checkBattleEnd = BattleManager.checkBattleEnd;
    BattleManager.checkBattleEnd = function () {
        if (this._phase && !$gameParty.isEscaped() &&
            ($gameParty.isAllDead() || $gameTroop.isAllDead()) &&
            this.isPalAftermathBusy()) {
            // 演出未完：返回 true 把 BattleManager.updateEvent 顶成"有事件在处理"，
            // 冻结回合推进 —— 否则 updateTurn 会继续把【还没出手的队友/敌人】的
            // 已排队行动执行掉（围攻时全员在输入阶段就排好了普攻，队友刚击毙
            // 最后一个敌人，剩下的人还会对着空目标挥刀，见 fight.c 的即时串行节奏）。
            return true; // 演出播完后的下一帧再真正判胜负
        }
        return _checkBattleEnd.call(this);
    };

    const _startBattle = BattleManager.startBattle;
    BattleManager.startBattle = function () {
        this._palVictoryPending = false;
        PalBattleVictory.levelUpQueue.length = 0;
        _startBattle.call(this);
    };

    BattleManager.processVictory = function () {
        if (this._palVictoryPending) return; // 面板显示期间不再重复进入
        this._palVictoryPending = true;
        $gameParty.removeBattleStates();
        $gameParty.performVictory();
        this.playVictoryMe();
        this.replayBgmAndBgs();
        this.makeRewards();
        const exp = this._rewards.exp;
        const gold = this._rewards.gold;
        // 战利品名称先取（gainRewards 后物品栏已合并，名称不变但此处语义更清晰）
        const items = (this._rewards.items || []).map(it => it.name);
        // 先发放奖励，保证面板数字与实际获得一致（原版面板数值即本场所得）
        this.gainRewards();
        const done = () => this.endBattle(0);
        const scene = SceneManager._scene;
        if (scene && scene.showPalVictory) {
            this._phase = null; // 面板显示期间冻结战斗流程
            scene.showPalVictory(exp, gold, items, done);
        } else {
            done();
        }
    };

    // 原版“××胜利了！”/道具获得等日志消息全部隐藏（画面已由结算面板替代）
    BattleManager.displayVictoryMessage = function () { };
    BattleManager.displayRewards = function () { };

    //=============================================================================
    // 升级数据捕获：拦截原版 $gameMessage 式升级提示，改为战后提示框
    //=============================================================================

    function snapshotParams(actor) {
        return {
            level: actor._level,
            hp: Math.floor(actor.hp), mp: Math.floor(actor.mp),
            mhp: actor.param(0), mmp: actor.param(1),
            atk: actor.param(2), def: actor.param(3), mat: actor.param(4),
            agi: actor.param(6), luk: actor.param(7)
        };
    }

    const _changeExp = Game_Actor.prototype.changeExp;
    Game_Actor.prototype.changeExp = function (exp, show) {
        const inVictory = BattleManager._palVictoryPending;
        if (inVictory) this._palPreLevel = snapshotParams(this);
        const lastLevel = this._level;
        _changeExp.call(this, exp, show);
        if (inVictory && this._level > lastLevel) {
            // 原版升级后体力/真气全满
            this._hp = this.param(0);
            this._mp = this.param(1);
            this.refresh();
        }
    };

    const _displayLevelUp = Game_Actor.prototype.displayLevelUp;
    Game_Actor.prototype.displayLevelUp = function (newSkills) {
        if (BattleManager._palVictoryPending && this._palPreLevel) {
            const pre = this._palPreLevel;
            this._palPreLevel = null;
            PalBattleVictory.levelUpQueue.push({
                name: this.name(),
                pre,
                cur: snapshotParams(this),
                newSkills: (newSkills || []).map(skill => skill.name)
            });
            return; // 拦截原版 $gameMessage 升级提示
        }
        _displayLevelUp.call(this, newSkills);
    };
})();
