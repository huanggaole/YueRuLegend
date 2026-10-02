/*:
 * @target MZ
 * @plugindesc [v2.3] 仙剑98柔情版战斗胜利结算与战后提示画面
 * @author AI Assistant
 *
 * @help
 * 复刻仙剑98柔情版的战斗胜利界面。**几何以 sdlpal 源码为准**（battle.c），
 * 早前从录像帧反推的数值若有出入一律让位于源码。
 *   结算阶段：
 *     面板一「获得经验值 1480」：x 158, y 126, 宽 300
 *     面板二「打败敌人得 3400 文钱」：x 124, y 249, 宽 364
 *     （x/宽来自录像帧实测 + 用户要求各加宽 26；y 为用户实测微调后的值。
 *       原版 battle.c:1037-1038 为 x=83-ww1/y=60 与 x=65/y=105（PAL 坐标），
 *       换算到 640 基准是 144 / 252 —— 本工程 y 仍沿用用户调过的 126 / 249。
 *       经验数字在「文字末尾 ~ 框右缘」间居中）
 *   框高：**所有框都是原版 PAL_CreateSingleLineBox，恒 34 PAL px**
 *     （素材 Data944/945/946 本身即 8/16/8 × 34）。
 *     本工程统一换算 k = boxWidth/320 = 2.975 → 屏高 34k ≈ 101（640 基准的 68）。
 *     v2.0 曾按 80（640 基准，实为 34+6 含投影）绘制，等于把素材放大 3.5×，
 *     比原版高 18%，v2.1 已改正。
 *   战后提示阶段：**逐条出现、各自固定 y，不堆叠**（对齐原版 battle.c）
 *     · 属性提升 / 战利品：y=60 PAL，框 x=offsetX+78=70，文字 (82,70)
 *       （battle.c:1268-1270；本工程宽度仍按文字实测 + 左右留白）
 *     · 练成绝招：y=105 PAL，框 x=65-((w1+w2+w3)-10)*8，
 *       文字距框左缘 10 PAL px（battle.c:1311-1321）
 *       w1=max(名,3) w2=max(「练成」=2,2) w3=max(术名,5)
 *       → 框宽 16+16*nLen PAL px，框中心恒在 x=153 PAL
 *     每条淡入后停 3 秒或按键翻下一条，与 PAL_WaitForAnyKey(3000) 一致。
 *     原版在首个升级处 VIDEO_RestoreScreen（battle.c:1124）抹掉经验/钱框，
 *     本工程改为直接隐藏两个结算面板（宽度与原版提示框不等，靠覆盖会露边）。
 *   所有对话框边框均用 img/system 下 Data944.PNG(8×34 左) /
 *     Data945.PNG(16×34 中) / Data946.PNG(8×34 右) 按统一倍率
 *     k = 框高/34 缩放后横向拼接（中间平铺、末块允许裁切），
 *     不做纵向拉伸（倍率缩放，保持切片斜面比例）。
 *
 *   ⚠ v2.2 修复「升级界面变成一条很窄的竖线」回归 —— MZ 的 Sprite 只在
 *     「绑定 bitmap 的那一刻」读一次尺寸（_onBitmapChange → addLoadListener
 *     立即回调 → _onBitmapLoad 写 _frame，rmmz_core.js:2111-2130），此后
 *     bitmap.resize() 只改 canvas/baseTexture（1476），_frame 不动，而
 *     Sprite#_refresh()（2132）会把可见矩形钳到 _frame.width。所以
 *     v2.1 那种「先 new Bitmap(1,H) 占位、事后再 resize」的写法，精灵永远
 *     只有 1px 宽（bitmap.width 却是对的，只量 bitmap 的测试全绿）。
 *     现改为「建 Sprite 前就定好宽度」，并加 resizeSpriteBitmap() 兜底同步 _frame。
 *     改本文件涉及尺寸的代码，请跑 tools/pal_victory_render_probe.js（真渲染像素）。
 *
 *   v2.3 「修行提升」面板 + 两处防死锁：
 *     · 升级不再逐条画单行属性框，而是画原版整块**红底花纹框面板**
 *       （battle.c:1128-1221，见下面「修行提升面板」段）。单行属性框只在
 *       「没升级、仅隐藏经验上涨」时出现（battle.c:1268），两者互斥。
 *     · drawDigits 遇到 undefined/NaN 不再静默 Math.max(0,NaN)→画成 "NaN"，
 *       直接返回 0（不重试）。levelUpRows 里 hp/mp 缺失时退回上限。
 *     · updatePalAftermath 原先「素材不 ready 就一直重画」且**没有别的出口**
 *       → 任一素材加载失败即永久卡在 msgIn、整场结算死锁。现加 240 帧重试
 *       预算（≈4 秒），超时强制放行（am.degraded = true），宁可少画不卡死。
 *
 *   文字 fontSize 32（本工程字体偏宽，5 字宽 ≈158 与原版一致）。
 *   数字由 Data919.PNG~Data928.PNG（0~9，6×8 素材 ×2.4）拼合。
 *
 * 流程：战斗胜利 → 播放胜利 ME、发放经验金钱 → 结算面板（经验+钱）
 * →（有升级/战利品则）隐藏结算面板、提示框逐条出现（按键或 3 秒翻下一条）
 *   → 淡出 → 返回地图。
 *   升级提示：**整块「修行提升」面板**（原版 battle.c:1122-1221）——
 *   标题单行框「<姓名>修行提升」（原版 battle.c:1132 =
 *   rgwName + STATUS_LABEL_LEVEL(48「修行」) + BATTLEWIN_LEVELUP_LABEL(32「提升」)）
 *   叠在红底花纹框上，框内 8 行「旧值 → 新值」：
 *   修行/体力/真气/武术/灵力/防御/身法/吉运（word 48~55）。
 *   体力/真气额外画「当前/上限」，当前值黄、上限值蓝。
 *   属性按增量逐条「<姓名><属性>提升 N」只在**没有升级**时出现
 *   （隐藏经验上涨，battle.c:1268）；练成绝招「<姓名>练成<术名>」
 *   （原版 battle.c:1313-1321，BATTLEWIN_ADDMAGIC_LABEL = word 33「练成」，
 *    术名用调色板 0x1B 绘制 = Pat.mkf chunk0 #C8584C，可用
 *    PalBattleVictory.MAGIC_COLOR 覆盖）。
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

    /** 单行框（Data944 左 + Data945 中平铺 + Data946 右），画在 (x,y) 尺寸 w×h。
     *  倍率 = h / 34（素材本身 34 高），横向按同一倍率缩放、末块允许裁切。 */
    function drawSlicedBoxRect(bitmap, x, y, w, h) {
        const left = ImageManager.loadSystem("Data944");
        const center = ImageManager.loadSystem("Data945");
        const right = ImageManager.loadSystem("Data946");
        if (!left.isReady() || !center.isReady() || !right.isReady()) return false;
        const k = h / left.height; // 统一倍率
        const lW = left.width * k;
        const rW = right.width * k;
        bitmap.blt(left, 0, 0, left.width, left.height, x, y, lW, h);
        bitmap.blt(right, 0, 0, right.width, right.height, x + w - rW, y, rW, h);
        const fillW = w - lW - rW;
        if (fillW > 0) {
            const tileW = center.width * k;
            for (let px = 0; px < fillW; px += tileW) {
                const drawW = Math.min(tileW, fillW - px);
                bitmap.blt(center, 0, 0, drawW / k, center.height, x + lW + px, y, drawW, h);
            }
        }
        return true;
    }

    function drawSlicedBox(bitmap) {
        return drawSlicedBoxRect(bitmap, 0, 0, bitmap.width, bitmap.height);
    }

    //---------------------------------------------------------------------------
    // 3×3 花纹框（原版 PAL_CreateBox，ui.c:131-226）
    //   精灵下标 = i*3 + j + iStyle*9；本工程文件名 = "Data9" + 下标
    //     （精灵 9 → Data99，精灵 17 → Data917；iStyle=0 是米色 0~8）
    //   iStyle=1 即**红底花纹框**，用于「修行提升」面板。
    //   原版先按素材实测尺寸算总宽高，再把 nRows/nColumns 各 +2 补边框后平铺：
    //     宽 = w[0][0] + w[0][1]*nColumns + w[0][2]   （22 + 16*9 + 22 = 188）
    //     高 = h[0][0] + h[1][0]*nRows    + h[2][0]   （20 + 18*7 + 22 = 168）
    //---------------------------------------------------------------------------
    function drawNineGrid(bitmap, x, y, w, h, iStyle, nRows, nColumns) {
        const T = [];
        for (let i = 0; i < 3; i++) {
            T.push([]);
            for (let j = 0; j < 3; j++) {
                const img = ImageManager.loadSystem("Data9" + (i * 3 + j + iStyle * 9));
                if (!img.isReady()) return false;
                T[i].push(img);
            }
        }
        const natH = T[0][0].height + T[1][0].height * nRows + T[2][0].height;
        const k = h / natH;                       // 统一倍率（宽由调用方按 natW*k 给）
        const rowOf = i => (i === 0 ? 0 : (i === nRows + 1 ? 2 : 1));
        const colOf = j => (j === 0 ? 0 : (j === nColumns + 1 ? 2 : 1));
        let cy = y;
        for (let i = 0; i <= nRows + 1; i++) {
            const r = rowOf(i);
            let cx = x;
            for (let j = 0; j <= nColumns + 1; j++) {
                const img = T[r][colOf(j)];
                bitmap.blt(img, 0, 0, img.width, img.height,
                    cx, cy, img.width * k, img.height * k);
                cx += img.width * k;
            }
            cy += T[r][0].height * k;
        }
        return true;
    }

    // 在 bitmap 上拼数字，返回总宽度。
    //   -1 = 素材未就绪（调用方须稍后重试）；0 = 数值缺失，本就不该画（**不要重试**，
    //   否则调用方的「未 ready 就一直重画」会变成死循环）。其余为实际宽度。
    // rightX 为数字串右边缘；ds 为素材放大倍数；spacing 为字间空隙；base 919/929。
    function drawDigits(bitmap, value, rightX, centerY, ds, spacing, base) {
        const n = Math.floor(Number(value));
        if (!isFinite(n) || n < 0) return 0;   // 防止 Math.max(0, NaN) → "NaN" 静默画出来
        const str = n.toString();
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

    // 原版「练成」行的术名色 = battle.c:1321 的 0x1B
    // （Pat.mkf chunk 0 索引 27 = rgb(200,88,76)）。可运行时改。
    PalBattleVictory.MAGIC_COLOR = "#C8584C";

    /** 把 levelUpQueue 的一条快照转成面板 8 行数据（键同 LEVELUP_ROWS）。
     *  HP/MP 原版升级后回满（battle.c:1115-1116 / 1289-1292），
     *  故新值 = 新上限，旧值 = 升级前的当前值 / 上限（如 358/359 → 373/373）。 */
    function levelUpRows(q) {
        const pre = q.pre, cur = q.cur;
        // 当前值缺失时退回上限（原版这一行本来就是「当前/上限」），
        // 别让 undefined 一路传到 drawDigits 变成画不出来的一行。
        const num = (v, fb) => (isFinite(v) ? v : (isFinite(fb) ? fb : 0));
        return [
            { key: "level", pre: pre.level, cur: cur.level },
            { key: "hp", pre: num(pre.hp, pre.mhp), preMax: num(pre.mhp),
              cur: num(cur.hp, cur.mhp), curMax: num(cur.mhp) },
            { key: "mp", pre: num(pre.mp, pre.mmp), preMax: num(pre.mmp),
              cur: num(cur.mp, cur.mmp), curMax: num(cur.mmp) },
            { key: "atk", pre: pre.atk, cur: cur.atk },
            { key: "mat", pre: pre.mat, cur: cur.mat },
            { key: "def", pre: pre.def, cur: cur.def },
            { key: "agi", pre: pre.agi, cur: cur.agi },
            { key: "luk", pre: pre.luk, cur: cur.luk }
        ];
    }

    // 组装战后提示消息（消费 levelUpQueue）。返回
    //   {slot:"levelup", name, rows} | {slot:"magic", text, magicAt, nLen}
    // | {slot:"attr", text, digit?}：
    //   战利品「获得<名>」在最上（原版帧：物品框压在属性框上方），
    //   其后按角色：修行提升面板 → （必要时）单行属性提升 → 练成绝招。
    //   magicAt = text 中术名起始下标（该段用 MAGIC_COLOR 绘制）。
    PalBattleVictory.buildAftermathMessages = function (items) {
        const msgs = [];
        for (const name of items || []) msgs.push({ text: "获得" + name, slot: "attr" });
        const queue = PalBattleVictory.levelUpQueue.splice(0);
        for (const q of queue) {
            if (q.cur.level > q.pre.level) {
                // 原版升级画整块「修行提升」面板（battle.c:1128-1212），
                // 面板已逐行列出旧→新，故不再重复发单行「XX提升」框 ——
                // 原版那排单行框（battle.c:1268-1270）对应的是**隐藏经验**涨属性，
                // 与升级涨属性是两套机制（用户截图里升级那帧确实没有单行框）。
                msgs.push({ slot: "levelup", name: q.name, rows: levelUpRows(q) });
            } else {
                // 没升级但属性变了 = 相当于原版的隐藏经验涨属性 → 单行框
                for (const [label, key] of ATTR_ROWS) {
                    const d = (q.cur[key] || 0) - (q.pre[key] || 0);
                    if (d > 0) msgs.push({ text: q.name + label + "提升", digit: d, slot: "attr" });
                }
            }
            if (q.newSkills && q.newSkills.length > 0) {
                // 原版 word 33「练成」（battle.c:1313-1321）：
                //   nLen = max(名宽,3) + max(「练成」=2,2) + max(术名宽,5)
                const magic = q.newSkills.join("、");
                msgs.push({
                    text: q.name + "练成" + magic,
                    magicAt: q.name.length + 2,
                    slot: "magic",
                    nLen: Math.max(q.name.length, 3) + 2 + Math.max(magic.length, 5)
                });
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
        // 即其 1200×752 窗口下的 ~70px）→ y1 126 / y2 249。
        // 2026-10-02 战后提示框改为按原版各自固定 y（60 / 105 PAL）逐条出现，
        // 不再随结算框堆叠，故此处不再有「同步上移」的耦合。
        const kx = Graphics.boxWidth / 640;
        const ky = Graphics.boxHeight / 480;
        // 框高 = 原版单行框的 34 PAL px（PAL_CreateSingleLineBox；素材 Data944/945/946
        // 本身即 34px 高）。本工程 PAL→屏幕统一换算 k = boxWidth/320 = 2.975，
        // 故屏高 = 34k ≈ 101，即 640 基准的 68 —— 早前按 80（= 34+6 含投影）绘制，
        // 等于把 34px 素材放大 3.5×，比原版高 18%。
        const H = Math.round(34 * Graphics.boxWidth / 320);
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
    // 战后提示框：逐条出现、各自固定 y —— 对齐原版 battle.c
    //   原版每条提示都是 PAL_CreateSingleLineBox（框高恒 34 PAL px），画完
    //   VIDEO_UpdateScreen + PAL_WaitForAnyKey(3000) 再画下一条，**不堆叠**。
    //   位置（PAL 320×200 坐标）：
    //     · 属性提升 / 物品 y=60，框 x=offsetX+78=70，文字 (82,70)，
    //       增量数字右缘 191（battle.c:1268-1270）
    //     · 练成       y=105，框 x=65-((w1+w2+w3)-10)*8，文字 (75+16k,115)，
    //       w1=max(名,3)、w2=max(「练成」=2,2)、w3=max(术名,5)（battle.c:1311-1321）
    //   框宽都是 16 + 16*nLen PAL px（左右各 8px 边框 + nLen 个 16px 中块）。
    //---------------------------------------------------------------------------

    const PAL_H = 34;                                  // 原版单行框高（PAL px）
    const AFTERMATH_Y_PAL = { attr: 60, magic: 105 };  // PAL px
    const ATTR_BOX_X_PAL = 70;                         // 原版 offsetX + 78
    const MAGIC_TEXT_X_PAL = 10;                       // 文字距框左缘（原版 75 - 65）

    /** PAL → 屏幕（本工程统一换算 k = boxWidth / 320，横纵一致） */
    function palK() { return Graphics.boxWidth / 320; }

    /** 练成框的原版几何（PAL 坐标 → 屏幕 px）。
     *  框宽 = 16 + 16*nLen，框中心恒在 x=153 PAL，故 x = 145 - 8*nLen。 */
    PalBattleVictory.magicBoxGeometry = function (nLen) {
        const k = palK();
        return {
            x: (145 - 8 * nLen) * k,
            y: AFTERMATH_Y_PAL.magic * k,
            w: 16 * (nLen + 1) * k,
            h: Math.round(PAL_H * k),
            textX: MAGIC_TEXT_X_PAL * k
        };
    };

    //===========================================================================
    // 「修行提升」面板（原版 battle.c:1122-1221）
    // ---------------------------------------------------------------------------
    // 原版升级时先 VIDEO_RestoreScreen 抹掉经验/钱框，再画两块：
    //   ① 标题 PAL_CreateSingleLineBox((offsetX+80, 0), propertyLength+10)
    //      → (72,0) 192×34，文字「<名>修行提升」画在 (110,10)、色 0
    //   ② 面板 PAL_CreateBox((offsetX+82, 32), 7, propertyLength+8, iStyle=1)
    //      → (74,32) 188×168，**iStyle=1 就是红底花纹框**
    //   ③ 8 行（battle.c:1135-1212）：
    //      · 箭头 SPRITENUM_ARROW(47)=Data947（12×6），x=-offsetX+180=188，y=48+18j
    //      · 标签 x=offsetX+100=92、y=44+18j，色 BATTLEWIN_LEVELUP_LABEL_COLOR=0xBB
    //      · 旧值 PAL_DrawNumber(...,4,(-offsetX+133,y),黄,右)：数字精灵 6px 一格、
    //        右对齐占 4 格 → 字段 [141,165]；新值字段左缘 -offsetX+195=203 → [203,227]
    //        （PAL_DrawNumber 右对齐时 x = PAL_X(pos) - 6 + 6*nLength，blit 在 x 起
    //          再逐位 -6 → 数字串**右缘 = PAL_X(pos) + 6*nLength = pos.x + 24**）
    //      · 黄 = **当前值**（旧当前 / 新当前），蓝 = **上限值**（旧上限 / 新上限）
    //      · HP/MP 另有「/」SPRITENUM_SLASH(39)=Data939 与蓝色上限
    //        （上限字段左缘 -offsetX+154=162 / +216=224，slash x=164 / 226）
    //   offsetX = -8*propertyLength；2 字中文标签的 PAL_MenuTextMaxWidth
    //   = (2*16+8)>>4 = 2 → propertyLength = 1 → **offsetX = -8**。
    //   精灵原点取 PAL(72,0)（= 标题框左缘），故下面全部是「减去 72」的局部坐标。
    //   面板纵向 0..200 = 原版整屏高，即本工程屏底（y=200k）。
    //
    //   ⚠ 颜色取自**素材本身**，不是调色板色号（这是本段最容易搞错的地方）：
    //     标签 Data9xx 文字用 #B8A47C（调色板 0xBB）；数字 Data919~928 = #D4C8A8、
    //     Data929~938 = #789CE8；「/」Data939 与箭头 Data947 = #B4B0A0。
    //     别再拿「0x2C = #FCC870 金」去断言数字色 —— 数字精灵根本不用那个色号。
    //===========================================================================

    const LEVELUP = {
        originX: 72, originY: 0,            // 精灵原点（PAL）
        W: 192, H: 200,                     // 精灵尺寸（PAL）
        title: { x: 0, y: 0, w: 192, h: 34 },
        titleTextX: 38, titleTextY: 10,     // 原版 (110,10) - 72
        panel: { x: 2, y: 32, w: 188, h: 168 },
        panelRows: 7, panelCols: 9,         // 原版 PAL_CreateBox 的 nRows / nColumns
        panelStyle: 1,                      // 1 = 红底花纹（精灵 9~17）
        labelX: 20,                         // 92 - 72
        arrowX: 116,                        // 188 - 72
        oldNumRight: 93,                    // (141-72) + 4 格 × 6
        newNumRight: 155,                   // (203-72) + 24
        oldMaxRight: 114,                   // (162-72) + 24
        newMaxRight: 176,                   // (224-72) + 24
        oldSlashX: 92, newSlashX: 154       // 164-72 / 226-72
    };

    /** 8 行的 y（PAL，逐条抄自 battle.c:1141-1212）与对应数据键。
     *  pair=true 的行（HP/MP）额外画「/」与蓝色上限。箭头 y = labelY + 4。 */
    PalBattleVictory.LEVELUP_ROWS = [
        { key: "level", text: "修行", labelY: 44, numY: 47 },
        { key: "hp", text: "体力", labelY: 62, numY: 64, slashY: 66, maxY: 68, pair: true },
        { key: "mp", text: "真气", labelY: 80, numY: 82, slashY: 84, maxY: 86, pair: true },
        { key: "atk", text: "武术", labelY: 98, numY: 101 },
        { key: "mat", text: "灵力", labelY: 116, numY: 119 },
        { key: "def", text: "防御", labelY: 134, numY: 137 },
        { key: "agi", text: "身法", labelY: 152, numY: 155 },
        { key: "luk", text: "吉运", labelY: 170, numY: 173 }
    ];

    /** 面板标签色 = 调色板 0xBB（BATTLEWIN_LEVELUP_LABEL_COLOR）→ #B8A47C。可运行时改。 */
    PalBattleVictory.LEVELUP_LABEL_COLOR = "#B8A47C";

    /** 面板几何（PAL → 屏幕 px）。 */
    PalBattleVictory.levelUpPanelGeometry = function () {
        const k = palK();
        return {
            x: LEVELUP.originX * k,
            y: LEVELUP.originY * k,
            w: Math.round(LEVELUP.W * k),
            h: Math.round(LEVELUP.H * k),
            k: k
        };
    };

    /** 画「修行提升」面板。rows = [{key, pre, cur, preMax?, curMax?}]（键同 LEVELUP_ROWS）。
     *  返回 false 表示素材未就绪（调用方稍后重试）。 */
    function drawLevelUpPanel(bitmap, name, rows, k) {
        const L = LEVELUP;
        // ① 标题单行框
        if (!drawSlicedBoxRect(bitmap, L.title.x * k, L.title.y * k,
            L.title.w * k, L.title.h * k)) return false;
        // ② 红底花纹框（iStyle = 1）
        if (!drawNineGrid(bitmap, L.panel.x * k, L.panel.y * k,
            L.panel.w * k, L.panel.h * k, L.panelStyle, L.panelRows, L.panelCols)) return false;
        const arrow = ImageManager.loadSystem("Data947");
        const slash = ImageManager.loadSystem("Data939");
        if (!arrow.isReady() || !slash.isReady()) return false;

        const fontPx = Math.round(16 * k);          // 原版一个全角字 16 PAL px
        bitmap.fontFace = $gameSystem.mainFontFace();
        bitmap.fontSize = fontPx;
        bitmap.outlineWidth = 0;

        // 标题「<名>修行提升」：原版 PAL_DrawText 的 pos 是**左上角**，
        // 而 MZ drawText 把字垂直居中在 lineHeight 里（rmmz_core.js:1668），
        // 故 lineHeight 传 fontPx 即可让字顶落在 labelY。
        bitmap.textColor = "#000000";
        bitmap.drawText(name + "修行提升", L.titleTextX * k, L.titleTextY * k,
            bitmap.width - L.titleTextX * k, fontPx, "left");

        const byKey = {};
        for (const r of rows || []) byKey[r.key] = r;
        // 数字：原版 6px 一格、右对齐占 4 格 → 右缘 = 字段左缘 + 24 PAL px
        let ok = true;
        const digit = (val, rightPalX, numYPal, base) => {
            if (drawDigits(bitmap, val, rightPalX * k, (numYPal + 4) * k, k, 0, base) < 0) ok = false;
        };

        for (const row of PalBattleVictory.LEVELUP_ROWS) {
            const r = byKey[row.key];
            if (!r) continue;
            bitmap.fontSize = fontPx;
            bitmap.textColor = PalBattleVictory.LEVELUP_LABEL_COLOR;
            bitmap.drawText(row.text, L.labelX * k, row.labelY * k,
                (L.arrowX - L.labelX) * k, fontPx, "left");
            // 箭头（原版 x=-offsetX+180=188、y=48+18j = labelY+4）
            bitmap.blt(arrow, 0, 0, arrow.width, arrow.height,
                L.arrowX * k, (row.labelY + 4) * k, arrow.width * k, arrow.height * k);
            // 旧值（黄）→ 新值（黄）；HP/MP 中间夹「/」+ 蓝色上限
            digit(r.pre, L.oldNumRight, row.numY, 919);
            digit(r.cur, L.newNumRight, row.numY, 919);
            if (row.pair) {
                bitmap.blt(slash, 0, 0, slash.width, slash.height,
                    L.oldSlashX * k, row.slashY * k, slash.width * k, slash.height * k);
                bitmap.blt(slash, 0, 0, slash.width, slash.height,
                    L.newSlashX * k, row.slashY * k, slash.width * k, slash.height * k);
                digit(r.preMax, L.oldMaxRight, row.maxY, 929);
                digit(r.curMax, L.newMaxRight, row.maxY, 929);
            }
        }
        return ok;
    }

    /** 单条提示的框宽（屏幕 px）。练成框用原版定宽，属性/战利品行按文字实测。
     *  测量前必须把字体设到 bitmap 上 —— measureTextWidth 只认 bitmap 自己的
     *  fontFace / fontSize（rmmz_core.js:1693 内部 context.font = _makeFontNameText）。 */
    Scene_Battle.prototype.palAftermathBoxWidth = function (v, msg, bitmap) {
        if (msg.slot === "magic") {
            return Math.round(PalBattleVictory.magicBoxGeometry(msg.nLen).w);
        }
        if (msg.slot === "levelup") {
            return PalBattleVictory.levelUpPanelGeometry().w;
        }
        const kx = v.layout.kx;
        bitmap.fontFace = $gameSystem.mainFontFace();
        bitmap.fontSize = Math.round(32 * kx);
        return Math.round(17 * kx + bitmap.measureTextWidth(msg.text) +
            (msg.digit != null ? (48 * kx + 29 * kx) : 10 * kx));
    };

    //---------------------------------------------------------------------------
    // ⚠ MZ 陷阱：Sprite 只在「绑定 bitmap 的那一刻」读一次尺寸
    //   （_onBitmapChange → addLoadListener 立即回调 → _onBitmapLoad 写
    //     _frame.width/height = bitmap.width/height，rmmz_core.js:2111-2130），
    //   此后 bitmap.resize() 只改 canvas/baseTexture（1476），_frame 纹丝不动；
    //   而 Sprite#_refresh()（2132）会把可见矩形 realW 钳到 _frame.width
    //   —— 于是「先建 1px 占位 bitmap 再 resize」的写法，精灵永远只有 1px 宽，
    //   画面上就是一条很窄的竖线（v2.1 的回归事故）。
    //   结论：① 建 Sprite 之前就把 bitmap 尺寸定好（首选）；
    //         ② 万不得已事后改，必须同步 _frame 并重算纹理帧。
    //---------------------------------------------------------------------------
    function resizeSpriteBitmap(sprite, w, h) {
        const bitmap = sprite.bitmap;
        if (!bitmap) return;
        if (bitmap.width !== w || bitmap.height !== h) bitmap.resize(w, h);
        // ⚠ 即使 bitmap 尺寸没变，只要精灵帧与目标不符也必须同步 —— 否则
        //   「占位时先 resize 过 bitmap」的历史状态会让这里变成 no-op，精灵仍被钳住。
        if (sprite._frame.width === w && sprite._frame.height === h) return;
        sprite._frame.width = w;
        sprite._frame.height = h;
        sprite._refreshFrame = false;
        sprite._refresh();
    }

    Scene_Battle.prototype.startPalAftermathMessage = function (v, index) {
        const msg = v.aftermathMessages[index];
        const k = palK();
        const isMagic = msg.slot === "magic";
        const isLevelUp = msg.slot === "levelup";
        // 面板占满原版整屏（0..200 PAL），单行框恒 34 PAL
        const H = isLevelUp ? Math.round(LEVELUP.H * k) : Math.round(PAL_H * k);
        // 宽度必须在 new Sprite **之前**定下来：先用 1px 占位测字宽，
        // resize 完再交给 Sprite 绑定，_frame 出生即最终值（见上面的陷阱注释）。
        const bitmap = new Bitmap(1, H);
        const boxW = this.palAftermathBoxWidth(v, msg, bitmap);
        if (bitmap.width !== boxW) bitmap.resize(boxW, H);
        const sprite = new Sprite(bitmap);
        if (isLevelUp) {
            sprite.x = Math.round(LEVELUP.originX * k);
            sprite.y = Math.round(LEVELUP.originY * k);
        } else if (isMagic) {
            sprite.x = Math.round(PalBattleVictory.magicBoxGeometry(msg.nLen).x);
            sprite.y = Math.round(AFTERMATH_Y_PAL.magic * k);
        } else {
            sprite.x = Math.round(ATTR_BOX_X_PAL * k);
            sprite.y = Math.round(AFTERMATH_Y_PAL.attr * k);
        }
        sprite.opacity = 0;
        v.container.addChild(sprite);
        v.aftermath.sprite = sprite;
        v.aftermath.index = index;
        v.aftermath.ready = false;
        this.redrawPalAftermathMessage(v);
    };

    Scene_Battle.prototype.clearPalAftermathBoxes = function (v) {
        if (!v.aftermath || !v.aftermath.sprite) return;
        const sp = v.aftermath.sprite;
        const msg = v.aftermathMessages[v.aftermath.index];
        // 原版「修行提升」面板画完不抹（后续的练成框是**压在面板上**的，
        // 见用户提供的原版截图），故面板挂到 pinned 常驻；其余单行框照旧替换。
        // pinned 随 container 一起在淡出时销毁。
        if (msg && msg.slot === "levelup") {
            v.aftermath.pinned = v.aftermath.pinned || [];
            v.aftermath.pinned.push(sp);
        } else {
            v.container.removeChild(sp);
        }
        v.aftermath.sprite = null;
    };

    Scene_Battle.prototype.redrawPalAftermathMessage = function (v) {
        const am = v.aftermath;
        const sprite = am.sprite;
        if (!sprite) return;
        const msg = v.aftermathMessages[am.index];
        const kx = v.layout.kx;
        const k = palK();
        const ds = 2.4 * kx;
        const spacing = 2.6 * kx;
        const bitmap = sprite.bitmap;
        const H = bitmap.height;
        const cy = H / 2 + 2 * kx;
        bitmap.fontFace = $gameSystem.mainFontFace();
        bitmap.fontSize = Math.round(32 * kx);
        bitmap.outlineWidth = 0;
        // 「修行提升」面板：整块自绘（标题单行框 + 红底花纹框 + 8 行），不走单行框路径
        if (msg.slot === "levelup") {
            const geo = PalBattleVictory.levelUpPanelGeometry();
            resizeSpriteBitmap(sprite, geo.w, geo.h);
            bitmap.clear();
            am.ready = drawLevelUpPanel(bitmap, msg.name, msg.rows, geo.k);
            return;
        }
        let textX, boxW;
        if (msg.slot === "magic") {
            // 原版定宽：16 + 16*nLen PAL px，文字距框左缘 10 PAL px
            const geo = PalBattleVictory.magicBoxGeometry(msg.nLen);
            boxW = Math.round(geo.w);
            textX = geo.textX;
        } else {
            // 属性/物品行：x=70 PAL、y=60 PAL（原版 battle.c:1268），
            // 宽度沿用本工程实测公式（左留白 17 + 文字 + 数字区/右留白）
            boxW = this.palAftermathBoxWidth(v, msg, bitmap);
            textX = 17 * kx;
        }
        // 正常路径下 bitmap 在建 Sprite 前就已是这个宽度（这里为 no-op）；
        // 仅当运行期改过字号等才会真改 —— 必须走 resizeSpriteBitmap，
        // 直接 bitmap.resize 会把精灵钳成 1px 竖线（见其注释）。
        resizeSpriteBitmap(sprite, boxW, H);
        bitmap.clear();
        if (!drawSlicedBox(bitmap)) { am.ready = false; return; }
        // 文本可分段着色：magicAt 起的术名用原版 0x1B（battle.c:1321），
        // 其余（姓名/「练成」）保持黑色（原版色号 0）。
        if (msg.magicAt != null && msg.magicAt > 0 && msg.magicAt < msg.text.length) {
            const head = msg.text.slice(0, msg.magicAt);
            const tail = msg.text.slice(msg.magicAt);
            const headW = bitmap.measureTextWidth(head);
            bitmap.textColor = "#000000";
            bitmap.drawText(head, textX, 0, boxW - textX, H, "left");
            bitmap.textColor = PalBattleVictory.MAGIC_COLOR;
            bitmap.drawText(tail, textX + headW, 0, boxW - textX - headW, H, "left");
        } else {
            bitmap.textColor = "#000000";
            bitmap.drawText(msg.text, textX, 0, boxW - textX, H, "left");
        }
        let ok = true;
        if (msg.digit != null) {
            bitmap.textColor = "#000000";
            if (drawDigits(bitmap, msg.digit, boxW - 29 * kx, cy, ds, spacing) < 0) ok = false;
        }
        am.ready = ok;
    };

    Scene_Battle.prototype.updatePalAftermath = function (v) {
        const am = v.aftermath;
        if (!am.ready) {
            this.redrawPalAftermathMessage(v);
            // ⚠ 本函数除「素材 ready」外没有任何出口：若某个素材永远加载不出来
            //   （缺文件 / 路径大小写被拦），am.ready 恒 false → 状态机永久卡在
            //   msgIn，整场战斗结算就此死锁。给重试预算兜底：宁可少画一个框，
            //   也不能让流程走不下去。240 帧 ≈ 4 秒。
            am.retry = (am.retry || 0) + 1;
            if (!am.ready && am.retry > 240) { am.ready = true; am.degraded = true; }
        }
        if (am.state === "msgIn") {
            const sp = am.sprite;
            if (sp) sp.opacity = Math.min(255, sp.opacity + 17);
            if ((!sp || sp.opacity >= 255) && am.ready) { am.state = "msgHold"; am.holdT = 0; }
        } else if (am.state === "msgHold") {
            am.holdT += 16.7;
            const pressed = am.holdT > 400 &&
                (Input.isTriggered("ok") || Input.isTriggered("cancel") || TouchInput.isTriggered());
            if (pressed || am.holdT > 3000) {
                this.clearPalAftermathBoxes(v);
                if (am.index + 1 < v.aftermathMessages.length) {
                    this.startPalAftermathMessage(v, am.index + 1);
                    am.state = "msgIn";
                } else {
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
                    // 战后提示阶段：原版在首个升级处 VIDEO_RestoreScreen（battle.c:1124）
                    // 把经验/钱框抹掉，随后每条提示各自出现在固定 y。本工程不还原整屏，
                    // 直接把两个结算面板隐藏，避免与原版坐标的提示框错位叠影。
                    v.panels[0].sprite.visible = false;
                    v.panels[1].sprite.visible = false;
                    v.state = "aftermath";
                    v.aftermath = { index: 0, state: "msgIn", holdT: 0 };
                    this.startPalAftermathMessage(v, 0);
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
            // displayLevelUp（在 _changeExp 内部）已经快照过一次，但那时还没回满，
            // 面板要显示「358/359 → 373/373」这样的回满值，故回满后再补一次快照。
            const q = PalBattleVictory.levelUpQueue[PalBattleVictory.levelUpQueue.length - 1];
            if (q && q.actor === this) q.cur = snapshotParams(this);
        }
    };

    const _displayLevelUp = Game_Actor.prototype.displayLevelUp;
    Game_Actor.prototype.displayLevelUp = function (newSkills) {
        if (BattleManager._palVictoryPending && this._palPreLevel) {
            const pre = this._palPreLevel;
            this._palPreLevel = null;
            PalBattleVictory.levelUpQueue.push({
                actor: this,              // 供 changeExp 回满后回填 cur
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
