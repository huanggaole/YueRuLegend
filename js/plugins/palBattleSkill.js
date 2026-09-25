/*:
 * @target MZ
 * @plugindesc [v1.4] 仙剑98柔情版战斗仙术选择界面（三列宫格列表 + 左上真气栏 + 顶部仙术说明；参数全暴露 + 说明层纯透明 + 单体技确认后收起面板进选敌/选人 + 鼠标悬浮/点击选中）
 * @author AI Assistant
 *
 * @help
 * 战斗中选择「仙术」后打开的列表界面，参考地图仙术界面（palMagic.js）与原版
 * magicmenu.c / 原版录像（20260925142144_rec_.mp4 第 2~4s、14s）重制：
 * - 列表：3 列 × 5 行，Data99/910~917 九宫格底图，42px 字；
 *   选中项金色呼吸（无 MZ 默认光标框），不可用（真气不足/沉默等）呈暗红色。
 * - 真气栏（左上角）：Data944/945/946 三切片底框；
 *   所需真气=白字 Data919~928，斜杠 Data939，当前真气=蓝字 Data929~938
 *   （原版 magicmenu.c：kNumColorYellow 数字组即白字组，kNumColorCyan 即蓝字组）。
 * - 说明（顶部）：选中仙术的两行说明，黄色 #F7EB99（样式同地图仙术说明窗）。
 *   说明层是【纯文字透明层】：opacity=0 / backOpacity=0 / frameVisible=false，
 *   底板与边框全隐、只留文字（MZ 的 _clientArea 挂在窗口本体而非 _container 上，
 *   所以 opacity=0 不会把文字一起隐藏），因此它天然"透过"，不会挖掉下面的底板。
 *   此外说明层默认插在仙术面板【之前】绘制，即便区域重叠也是面板压住说明。
 * 每帧同步选中项与真气栏/说明，施法后重新打开时自动重置（含真气消耗后的新值）。
 * 隐藏 MZ 默认帮助窗，避免与仙剑样式说明重叠。
 *
 * ===== 选完仙术后的流程 =====
 * 单体技确认后收起仙术界面（面板 + 真气栏 + 说明），再进入选目标阶段：
 *   单体·敌方（scope 1 等）   → startEnemySelection()  敌人精灵闪白（palBattleTarget）
 *   单体·我方（scope 7/9/12） → startActorSelection()  底部伙伴栏 + 黄色三角
 *   非单体（全体/自身）       → 直接进下一条指令
 * 选目标时按 ESC → onEnemyCancel / onActorCancel 回到仙术界面（真气栏与说明自动恢复）。
 * 注：MZ 原生 onSelectAction 只 deactivate 不 hide，面板会留在屏幕上挡战场，此处补上。
 *
 * ===== v1.4 修复：鼠标悬浮/点击完全失效 =====
 * 症状：仙术列表里鼠标移动不会跟随选中（金色呼吸不动），左键点也没反应，
 *       键盘方向键正常。
 * 原因：hitTest 用 _clientArea.width/height 做命中范围判定，而 _clientArea
 *       是 PIXI.Sprite，width/height = scale × 包围盒；内容位图未就绪时包围盒
 *       为 0（实测恒为 0），于是"是否落在内容区"永远 false → hitIndex() 恒 -1。
 * 修法：命中范围改为按 CFG.grid 的 paddingLeft/paddingTop + innerWidth/innerHeight
 *       自己算，不再读 _clientArea 的尺寸；
 *       同时 _updateClientArea 补回 x/y 减 origin（原版行为），仙术多于 15 个
 *       滚动时内容区才会跟着滚（v1.3 漏了这一句）。
 *
 * ⚠ 这里只收【仙术窗】，绝不碰 _actorCommandWindow（四个指令按钮所在的指令盘）：
 *   攻击/防御等指令同样走 onSelectAction，而 MZ 的 onEnemyCancel 对 "attack"
 *   分支只有 activate() 没有 show()，指令盘一旦被 hide 就再也回不来
 *   （v1.2 曾因此让四个指令按钮消失，v1.3 修正 + 加了取消时恢复的兜底）。
 *
 * ===== 调参 =====
 * 所有控件（面板 / 网格 / 真气栏 / 说明层）的位置尺寸配色都在文件顶部 CFG 里。
 * 运行时也能在控制台改，改完立即生效：
 *   PAL98_SKILL_UI                   // 查看全部参数
 *   PAL98.setHelp({ y: 8, height: 96 })
 *   PAL98.setHelp({ textY: 10, textX: 20 })
 *   PAL98.setPanel({ y: 130 })
 *   PAL98.setMp({ width: 320 })
 *   PAL98.helpOnTop(true)            // true=说明压在最上层 / false=在面板下面
 *
 * 需排在 palBattleCore 之后加载（不再依赖 palMagic——其窗口类定义在 IIFE 内非全局）。
 */

(() => {
    //=============================================================================
    // 【界面参数总表】战斗仙术界面所有控件的位置 / 尺寸 / 配色都集中在 CFG 里。
    // 改本文件顶部即可生效；也可在游戏运行时于控制台动态改，例如：
    //   PAL98.setHelp({ y: 8, height: 96 })  // 说明层整体上移/下移 + 改绘制区高度
    //   PAL98.setHelp({ textY: 10 })         // 第一行文字的纵向偏移
    //   PAL98.helpOnTop(false)               // true=说明压在最上层 / false=在面板下面
    //   PAL98.setPanel({ y: 130 })           // 仙术面板下移
    //   PAL98.setMp({ width: 320 })          // 真气栏加宽
    // 直接读参数表：PAL98_SKILL_UI
    //=============================================================================
    const CFG = {
        // 九宫格底板贴图放大倍数（仙剑素材 ×3）
        tileScale: 3,

        // ---- ① 仙术列表面板（九宫格底板）----
        panel: {
            x: 50,
            y: 120,            // 面板顶边。说明层默认收在这条线以上，不与之重叠
            height: 340,
            widthInset: 100    // 面板宽度 = 画面宽 - widthInset
        },

        // ---- ② 面板内的仙术文字网格 ----
        grid: {
            cols: 3,
            rows: 5,
            lineHeight: 42,
            itemHeight: 52,
            rowSpacing: 8,
            paddingLeft: 24,   // _clientArea 左边距
            paddingTop: 36,    // _clientArea 上边距
            innerInset: 48,    // innerWidth = 面板宽 - innerInset
            fontSize: 42,
            shadowOffset: 2,
            colorNormal: '#C4B8AC',       // 可用·未选中
            colorDisabled: '#CF6A5A',     // 不可用·未选中
            colorDisabledSel: '#FCAC9C',  // 不可用·已选中
            selectedColors: [             // 选中金色呼吸
                '#d6ad4e', '#d9b45a', '#e0c066', '#e7cc72', '#edda7e',
                '#f3e472', '#edda7e', '#e7cc72', '#e0c066', '#d9b45a'
            ]
        },

        // ---- ③ 左上真气栏（所需真气 / 当前真气）----
        mp: { x: 0, y: 0, width: 300, height: 110 },

        // ---- ④ 顶部仙术说明（纯文字、无底板的透明层）----
        help: {
            x: 320,
            y: 0,
            widthInset: 340,   // 绘制区宽度 = 画面宽 - widthInset
            minWidth: 200,
            height: 112,       // 默认 < panel.y(120)，保证与面板零重叠
            padding: 4,        // 文字起点内边距（只挪文字，不画底板）
            textX: 0,
            textY: 0,
            lineHeight: 42,
            lineSpacing: 12,
            maxLines: 2,
            fontSize: 0,       // 0 = 沿用系统默认字号；填正数（如 42）则强制指定
            color: '#F7EB99',
            shadowColor: '#000000',
            shadowOffset: 2,
            contentsOpacity: 255,  // 文字自身不透明度（想半透就调小，如 180）
            behindPanel: true      // true = 说明层放在仙术面板【下面】，绝不遮挡面板
        },

        // ---- ⑤ 选完仙术后的流程 ----
        flow: {
            // 单体技：确认后收起仙术界面（面板 + 真气栏 + 说明）再进入选目标阶段。
            // MZ 原生 onSelectAction 只 deactivate 不 hide，面板会留在屏幕上挡住战场。
            hideSkillOnTargetSelect: true
        }
    };

    // 暴露到全局，方便随时调参
    if (typeof window !== "undefined") {
        window.PAL98_SKILL_UI = CFG;
    }

    // 选中项金色呼吸（与地图仙术列表一致）
    const SELECTED_COLORS = CFG.grid.selectedColors;
    const BG_SCALE = CFG.tileScale;

    //=============================================================================
    // Window_BattleSkill 重制：三列宫格仙术列表
    //=============================================================================

    Window_BattleSkill.prototype.initialize = function (rect) {
        this._bgTiles = [];
        this._bgTiles.push(ImageManager.loadSystem("Data99"));   // 0: TL
        this._bgTiles.push(ImageManager.loadSystem("Data910"));  // 1: T
        this._bgTiles.push(ImageManager.loadSystem("Data911"));  // 2: TR
        this._bgTiles.push(ImageManager.loadSystem("Data912"));  // 3: L
        this._bgTiles.push(ImageManager.loadSystem("Data913"));  // 4: C
        this._bgTiles.push(ImageManager.loadSystem("Data914"));  // 5: R
        this._bgTiles.push(ImageManager.loadSystem("Data915"));  // 6: BL
        this._bgTiles.push(ImageManager.loadSystem("Data916"));  // 7: B
        this._bgTiles.push(ImageManager.loadSystem("Data917"));  // 8: BR

        this._refreshListener = this._drawCustomBackground.bind(this);
        this._listeningImages = new Set();
        this._bgSprite = new Sprite();

        Window_SkillList.prototype.initialize.call(this, rect);

        this.opacity = 255;
        this.backOpacity = 0;
        this.frameVisible = false;
        this.cursorVisible = false; // 不用 MZ 默认光标框，选中靠金色呼吸

        const container = this._container || this;
        container.addChildAt(this._bgSprite, 0);

        this._drawCustomBackground();
        this.hide();
    };

    Window_BattleSkill.prototype._drawCustomBackground = function () {
        if (this._bgTiles.some(img => !img.isReady())) {
            this._bgTiles.forEach(img => {
                if (!img.isReady() && !this._listeningImages.has(img)) {
                    img.addLoadListener(this._refreshListener);
                    this._listeningImages.add(img);
                }
            });
            return;
        }

        const width = this.width;
        const height = this.height;

        if (!this._bgSprite.bitmap || this._bgSprite.bitmap.width !== width ||
            this._bgSprite.bitmap.height !== height) {
            this._bgSprite.bitmap = new Bitmap(width, height);
        }

        const bitmap = this._bgSprite.bitmap;
        bitmap.clear();

        const scale = BG_SCALE;
        const imgs = this._bgTiles;
        const w = bitmap.width;
        const h = bitmap.height;

        const tl = imgs[0]; const t = imgs[1]; const tr = imgs[2];
        const l = imgs[3]; const c = imgs[4]; const r = imgs[5];
        const bl = imgs[6]; const b = imgs[7]; const br = imgs[8];

        const tlW = tl.width * scale; const tlH = tl.height * scale;
        const trW = tr.width * scale; const trH = tr.height * scale;
        const blH = bl.height * scale; const blW = bl.width * scale;
        const brW = br.width * scale; const brH = br.height * scale;
        const rW = r.width * scale; const lW = l.width * scale;
        const tH = t.height * scale; const bH = b.height * scale;

        const marginLeft = Math.max(tlW, lW, blW);
        const marginRight = Math.max(trW, rW, brW);
        const marginTop = Math.max(tlH, tH, trH);
        const marginBottom = Math.max(blH, bH, brH);

        this._palTile(bitmap, c, marginLeft, marginTop, w - marginLeft - marginRight, h - marginTop - marginBottom);
        this._palTile(bitmap, t, marginLeft, 0, w - marginLeft - marginRight, tH);
        this._palTile(bitmap, b, marginLeft, h - bH, w - marginLeft - marginRight, bH);
        this._palTile(bitmap, l, 0, marginTop, lW, h - marginTop - marginBottom);
        this._palTile(bitmap, r, w - rW, marginTop, rW, h - marginTop - marginBottom);
        this._palTile(bitmap, tl, 0, 0, tlW, tlH);
        this._palTile(bitmap, tr, w - trW, 0, trW, trH);
        this._palTile(bitmap, bl, 0, h - blH, blW, blH);
        this._palTile(bitmap, br, w - brW, h - brH, brW, brH);
    };

    Window_BattleSkill.prototype._palTile = function (bitmap, source, dx, dy, dw, dh) {
        if (dw <= 0 || dh <= 0) return;
        const scale = BG_SCALE;
        const tileW = source.width * scale;
        const tileH = source.height * scale;

        for (let y = 0; y < dh; y += tileH) {
            for (let x = 0; x < dw; x += tileW) {
                const drawW = Math.min(tileW, dw - x);
                const drawH = Math.min(tileH, dh - y);
                const sw = drawW / scale;
                const sh = drawH / scale;
                bitmap.blt(source, 0, 0, sw, sh, dx + x, dy + y, drawW, drawH);
            }
        }
    };

    Window_BattleSkill.prototype.drawItemBackground = function (/*index*/) {
        // 宫格底图已绘制，不需要条目背景
    };

    Window_BattleSkill.prototype.maxCols = function () {
        return CFG.grid.cols;
    };

    Window_BattleSkill.prototype.lineHeight = function () {
        return CFG.grid.lineHeight;
    };

    Window_BattleSkill.prototype.itemHeight = function () {
        return CFG.grid.itemHeight;
    };

    Window_BattleSkill.prototype.rowSpacing = function () {
        return CFG.grid.rowSpacing;
    };

    Object.defineProperty(Window_BattleSkill.prototype, "innerHeight", {
        get: function () {
            return CFG.grid.rows * this.itemHeight();
        },
        configurable: true
    });

    Object.defineProperty(Window_BattleSkill.prototype, "innerWidth", {
        get: function () {
            return Math.max(0, this.width - CFG.grid.innerInset);
        },
        configurable: true
    });

    Window_BattleSkill.prototype._updateClientArea = function () {
        // 内容区：左右各留 paddingLeft，顶部留 paddingTop（与地图仙术列表一致）
        // 注意：只能设 x/y，【不要】把 width/height 传给 move()——
        // _clientArea 是 PIXI.Sprite，其 width/height 是 scale×包围盒 算出来的，
        // 内容位图未就绪时包围盒为 0，赋值不会生效（实测 client.width 恒为 0），
        // 一旦后续包围盒变化还会意外缩放整个内容区。
        // x/y 要减 origin：滚动时内容区跟着滚（与原版 Window 保持一致）。
        const padL = CFG.grid.paddingLeft;
        const padT = CFG.grid.paddingTop;
        this._clientArea.move(padL, padT);
        this._clientArea.x = padL - this.origin.x;
        this._clientArea.y = padT - this.origin.y;
        if (this.innerWidth > 0 && this.innerHeight > 0) {
            this._clientArea.visible = this.isOpen();
        } else {
            this._clientArea.visible = false;
        }
    };

    Window_BattleSkill.prototype._updateFilterArea = function () {
        const pos = this._clientArea.worldTransform.apply(new Point(0, 0));
        const filterArea = this._clientArea.filterArea;
        if (filterArea) {
            filterArea.x = pos.x;
            filterArea.y = pos.y;
            filterArea.width = this.innerWidth;
            filterArea.height = this.innerHeight;
        }
    };

    // 鼠标命中：默认 hitTest 用 padding(18) 换算条目坐标，但本窗内容区在
    // _clientArea(24,36)——纵向差 18px 导致命中的行总比看到的偏上一行。
    // 这里改为按内容区实际位置换算。
    //
    // ⚠ 必须【自己算】内容区矩形，不能读 _clientArea.width/height：
    // _clientArea 是 PIXI.Sprite，width/height = scale × 包围盒，内容位图未就绪
    // 时包围盒为 0 → 读到 0 → 命中判定恒 false → 鼠标悬浮/点击全部失效
    // （v1.3 的 bug：整个仙术列表鼠标操作无反应，键盘正常）。
    Window_BattleSkill.prototype.hitTest = function (x, y) {
        const left = CFG.grid.paddingLeft;
        const top = CFG.grid.paddingTop;
        if (x < left || x >= left + this.innerWidth ||
            y < top || y >= top + this.innerHeight) {
            return -1;
        }
        const cx = this.origin.x + x - left;
        const cy = this.origin.y + y - top;
        const topIndex = this.topIndex();
        for (let i = 0; i < this.maxVisibleItems(); i++) {
            const index = topIndex + i;
            if (index < this.maxItems()) {
                const rect = this.itemRect(index);
                if (rect.contains(cx, cy)) return index;
            }
        }
        return -1;
    };

    // 战斗可用全部仙术（与地图一致，不排除类型）
    Window_BattleSkill.prototype.includes = function (item) {
        return item && item.stypeId !== 0;
    };

    // 不可用（真气不足/沉默/场合不符）呈暗红色
    Window_BattleSkill.prototype.isEnabled = function (item) {
        return !!this._actor && this._actor.canUse(item);
    };

    // 真气消耗改由左上真气栏显示，列表内不画
    Window_BattleSkill.prototype.drawSkillCost = function (/*skill, x, y, width*/) {
    };

    Window_BattleSkill.prototype.drawItem = function (index) {
        const skill = this.itemAt(index);
        if (!skill) return;

        const rect = this.itemLineRect(index);
        this.contents.clearRect(rect.x, rect.y, rect.width, rect.height);

        const isEnabled = this.isEnabled(skill);
        const isSelected = (index === this.index());

        this.contents.outlineWidth = 0;

        let textColor = CFG.grid.colorNormal;       // 可用未选中
        if (!isEnabled && !isSelected) textColor = CFG.grid.colorDisabled;    // 不可用未选中
        if (!isEnabled && isSelected) textColor = CFG.grid.colorDisabledSel;  // 不可用选中
        if (isEnabled && isSelected) {
            let colorIndex = 0;
            if (this.active) {
                colorIndex = Math.floor(Date.now() / 150) % SELECTED_COLORS.length;
            }
            textColor = SELECTED_COLORS[colorIndex]; // 金色呼吸
        }

        this.contents.fontSize = CFG.grid.fontSize;

        // 阴影
        const so = CFG.grid.shadowOffset;
        this.contents.textColor = CFG.help.shadowColor;
        this.contents.drawText(skill.name, rect.x + so, rect.y + so, rect.width, this.lineHeight());
        // 名字
        this.contents.textColor = textColor;
        this.contents.drawText(skill.name, rect.x, rect.y, rect.width, this.lineHeight());
    };

    Window_BattleSkill.prototype.redrawCurrentItem = function () {
        if (this.index() >= 0) {
            this.redrawItem(this.index());
        }
    };

    Window_BattleSkill.prototype.update = function () {
        Window_SkillList.prototype.update.call(this);
        if (this.visible && this.active && this.isOpen()) {
            this.redrawCurrentItem();
        }
    };

    Window_BattleSkill.prototype.select = function (index) {
        const lastIndex = this.index();
        Window_SkillList.prototype.select.call(this, index);
        if (lastIndex >= 0 && lastIndex !== this.index()) {
            this.redrawItem(lastIndex);
        }
        if (this.index() >= 0) {
            this.redrawItem(this.index());
        }
    };

    // 三列网格方向键（带环绕；末行不齐时尽量落在同列）
    Window_BattleSkill.prototype.cursorRight = function (wrap) {
        const maxItems = this.maxItems();
        if (maxItems <= 0) return;
        const maxCols = this.maxCols();
        const i = this.index();
        const col = i % maxCols;
        let next;
        if (col < maxCols - 1 && i + 1 < maxItems) next = i + 1;
        else if (wrap) next = i - col; // 环绕到本行第一列
        if (next !== undefined && next !== i) {
            this.smoothSelect(next);
            SoundManager.playCursor();
        }
    };

    Window_BattleSkill.prototype.cursorLeft = function (wrap) {
        const maxItems = this.maxItems();
        if (maxItems <= 0) return;
        const maxCols = this.maxCols();
        const i = this.index();
        const col = i % maxCols;
        let next;
        if (col > 0) next = i - 1;
        else if (wrap) next = Math.min(i - col + maxCols - 1, maxItems - 1); // 环绕到本行末列
        if (next !== undefined && next !== i) {
            this.smoothSelect(next);
            SoundManager.playCursor();
        }
    };

    Window_BattleSkill.prototype.cursorDown = function (wrap) {
        const maxItems = this.maxItems();
        if (maxItems <= 0) return;
        const maxCols = this.maxCols();
        const i = this.index();
        let next;
        if (i + maxCols < maxItems) next = i + maxCols;
        else if (wrap) next = i % maxCols; // 环绕到同列第一行
        if (next !== undefined && next !== i) {
            this.smoothSelect(next);
            SoundManager.playCursor();
        }
    };

    Window_BattleSkill.prototype.cursorUp = function (wrap) {
        const maxItems = this.maxItems();
        if (maxItems <= 0) return;
        const maxCols = this.maxCols();
        const i = this.index();
        const col = i % maxCols;
        let next;
        if (i - maxCols >= 0) next = i - maxCols;
        else if (wrap) {
            next = maxItems - maxCols + col; // 同列末行
            if (next >= maxItems) next = maxItems - 1;
        }
        if (next !== undefined && next !== i) {
            this.smoothSelect(next);
            SoundManager.playCursor();
        }
    };

    //=============================================================================
    // Window_PalBattleSkillMP：左上真气栏（所需白字 / 当前蓝字）
    //=============================================================================

    function Window_PalBattleSkillMP() {
        this.initialize(...arguments);
    }
    Window_PalBattleSkillMP.prototype = Object.create(Window_Base.prototype);
    Window_PalBattleSkillMP.prototype.constructor = Window_PalBattleSkillMP;

    Window_PalBattleSkillMP.prototype.initialize = function (rect) {
        Window_Base.prototype.initialize.call(this, rect);
        this.opacity = 255;
        this.backOpacity = 0;
        this.frameVisible = false;
        this.hide();

        this._skill = null;
        this._actor = null;
        this._lastMp = -1;

        this._bgImgs = [
            ImageManager.loadSystem("Data944"), // 左
            ImageManager.loadSystem("Data945"), // 中(平铺)
            ImageManager.loadSystem("Data946")  // 右
        ];
        this._costDigits = [];
        for (let i = 0; i < 10; i++) this._costDigits.push(ImageManager.loadSystem("Data" + (919 + i)));
        this._slashImg = ImageManager.loadSystem("Data939");
        this._mpDigits = [];
        for (let i = 0; i < 10; i++) this._mpDigits.push(ImageManager.loadSystem("Data" + (929 + i)));

        this._refreshListener = this.refresh.bind(this);
        this._listeningImages = new Set();
    };

    Window_PalBattleSkillMP.prototype.updatePadding = function () {
        this.padding = 0;
    };

    Window_PalBattleSkillMP.prototype.setSkill = function (skill, actor) {
        const mp = actor ? actor.mp : -1;
        if (this._skill !== skill || this._actor !== actor || this._lastMp !== mp) {
            this._skill = skill;
            this._actor = actor;
            this._lastMp = mp;
            this.refresh();
        }
    };

    Window_PalBattleSkillMP.prototype.refresh = function () {
        this.contents.clear();

        const allImgs = [...this._bgImgs, ...this._costDigits, this._slashImg, ...this._mpDigits];
        if (allImgs.some(img => !img.isReady())) {
            allImgs.forEach(img => {
                if (!img.isReady() && !this._listeningImages.has(img)) {
                    img.addLoadListener(this._refreshListener);
                    this._listeningImages.add(img);
                }
            });
            return;
        }

        // 三切片底框
        const scale = BG_SCALE;
        const w = this.contents.width;
        const lImg = this._bgImgs[0];
        const cImg = this._bgImgs[1];
        const rImg = this._bgImgs[2];
        const lW = lImg.width * scale;
        const rW = rImg.width * scale;
        const cH = cImg.height * scale;

        this.contents.blt(lImg, 0, 0, lImg.width, lImg.height, 0, 0, lW, cH);
        this.contents.blt(rImg, 0, 0, rImg.width, rImg.height, w - rW, 0, rW, cH);
        const cW = cImg.width * scale;
        const fillW = w - lW - rW;
        for (let x = 0; x < fillW; x += cW) {
            const drawW = Math.min(cW, fillW - x);
            const sw = drawW / scale;
            this.contents.blt(cImg, 0, 0, sw, cImg.height, lW + x, 0, drawW, cH);
        }

        if (!this._skill || !this._actor) return;

        // 所需真气（白）/ 当前真气（蓝）
        const costStr = this._actor.skillMpCost(this._skill).toString();
        const mpStr = this._actor.mp.toString();
        const spacing = 2;
        const digitW = this._costDigits[0].width * scale;
        const slashW = this._slashImg.width * scale;

        const totalW = costStr.length * (digitW + spacing) +
            slashW + spacing * 11 +
            mpStr.length * (digitW + spacing);
        let curX = (w - totalW) / 2;
        const numY = (cH - this._costDigits[0].height * scale) / 2;

        for (let i = 0; i < costStr.length; i++) {
            const img = this._costDigits[parseInt(costStr[i])];
            this.contents.blt(img, 0, 0, img.width, img.height, curX, numY, img.width * scale, img.height * scale);
            curX += digitW + spacing;
        }
        curX += spacing * 5;
        this.contents.blt(this._slashImg, 0, 0, this._slashImg.width, this._slashImg.height,
            curX, numY + 2, slashW, this._slashImg.height * scale);
        curX += slashW + spacing * 6;
        for (let i = 0; i < mpStr.length; i++) {
            const img = this._mpDigits[parseInt(mpStr[i])];
            this.contents.blt(img, 0, 0, img.width, img.height, curX, numY, img.width * scale, img.height * scale);
            curX += digitW + spacing;
        }
    };

    //=============================================================================
    // Window_PalBattleSkillHelp：顶部仙术说明（两行，黄色，透明底；
    // 与地图 palMagic.js 的 Window_PaladinMagicHelp 同款样式——该类定义在
    // palMagic 的 IIFE 内并非全局，故此处自带一份）
    //=============================================================================

    function Window_PalBattleSkillHelp() {
        this.initialize(...arguments);
    }
    Window_PalBattleSkillHelp.prototype = Object.create(Window_Base.prototype);
    Window_PalBattleSkillHelp.prototype.constructor = Window_PalBattleSkillHelp;

    Window_PalBattleSkillHelp.prototype.initialize = function (rect) {
        Window_Base.prototype.initialize.call(this, rect);
        // 【完全透视】三层保险，保证本窗口只留文字、不带任何底板：
        //  · opacity    → MZ 里只作用于 _container（底板 + 边框），置 0 后底板/边框全隐
        //  · backOpacity→ 底板贴图 alpha 置 0（项目 System.advanced.windowOpacity 本就是 0，这里兜底）
        //  · frameVisible=false → 不画九宫格边框
        // 说明：MZ 的 _clientArea（文字层）挂在窗口本体而非 _container 上，
        //       所以 opacity=0 不会把文字一起隐藏，只会让底板彻底消失 → 真正"透过"。
        this.opacity = 0;
        this.backOpacity = 0;
        this.frameVisible = false;
        this.contentsOpacity = CFG.help.contentsOpacity;
        this._skill = null;
    };

    // padding 只挪文字起点，不画底板。
    // 默认 4：两行说明下沿 ≈ y102（含 +2 阴影），与面板顶边 y120 之间留 ~18px 净缝，
    // 既不扣底板也不截文字。想再往上/下挪，改 CFG.help.padding 或 CFG.help.textY。
    Window_PalBattleSkillHelp.prototype.updatePadding = function () {
        this.padding = CFG.help.padding;
    };

    // 尺寸被外部改动（控制台调参）后同步重画
    Window_PalBattleSkillHelp.prototype.applyConfig = function () {
        this.padding = CFG.help.padding;
        this.contentsOpacity = CFG.help.contentsOpacity;
        this.opacity = 0;
        this.backOpacity = 0;
        this.frameVisible = false;
        this.refresh();
    };

    Window_PalBattleSkillHelp.prototype.setSkill = function (skill) {
        if (this._skill !== skill) {
            this._skill = skill;
            this.refresh();
        }
    };

    Window_PalBattleSkillHelp.prototype.lineHeight = function () {
        return CFG.help.lineHeight;
    };

    Window_PalBattleSkillHelp.prototype.refresh = function () {
        this.contents.clear();
        if (!this._skill) return;

        this.contents.outlineWidth = 0;
        if (CFG.help.fontSize > 0) {
            this.contents.fontSize = CFG.help.fontSize;
        }

        let textX = CFG.help.textX;
        let textY = CFG.help.textY;
        const lineSpacing = CFG.help.lineSpacing;
        const so = CFG.help.shadowOffset;

        const desc = this._skill.description || "";
        const lines = desc.replace(/\\n/g, '\n').split(/[\r\n]+/).slice(0, CFG.help.maxLines);

        for (let i = 0; i < lines.length; i++) {
            // 阴影
            this.contents.textColor = CFG.help.shadowColor;
            this.contents.drawText(lines[i], textX + so, textY + so,
                this.contents.width - textX, this.lineHeight(), 'left');
            // 文字
            this.contents.textColor = CFG.help.color;
            this.contents.drawText(lines[i], textX, textY,
                this.contents.width - textX, this.lineHeight(), 'left');

            textY += this.lineHeight() + lineSpacing;
        }
    };

    //=============================================================================
    // Scene_Battle：布局与子窗口联动
    //=============================================================================

    // 仙剑样式大面板（与地图仙术列表同尺寸），覆盖 palBattleCore 的小窗尺寸
    Scene_Battle.prototype.skillWindowRect = function () {
        return new Rectangle(CFG.panel.x, CFG.panel.y,
            Graphics.boxWidth - CFG.panel.widthInset, CFG.panel.height);
    };

    const _Scene_Battle_create = Scene_Battle.prototype.create;
    Scene_Battle.prototype.create = function () {
        _Scene_Battle_create.call(this);
        this.createPalSkillSubWindows();
    };

    Scene_Battle.prototype.createPalSkillSubWindows = function () {
        // ① 左上真气栏
        const rectMP = new Rectangle(CFG.mp.x, CFG.mp.y, CFG.mp.width, CFG.mp.height);
        this._palSkillMpWindow = new Window_PalBattleSkillMP(rectMP);
        this.addWindow(this._palSkillMpWindow);

        // ② 顶部仙术说明（纯文字透明层）
        //    默认高度 112 < 面板顶边 120 → 与面板零重叠；
        //    文字绘制区 = 112 - padding*2(8) = 104 ≥ 两行 96，余量充足。
        const helpW = Math.max(CFG.help.minWidth, Graphics.boxWidth - CFG.help.widthInset);
        const rectHelp = new Rectangle(CFG.help.x, CFG.help.y, helpW, CFG.help.height);
        this._palSkillHelpWindow = new Window_PalBattleSkillHelp(rectHelp);
        this._palSkillHelpWindow.hide();
        this.addWindow(this._palSkillHelpWindow);

        // ③ 层级：说明层默认插到仙术面板【之前】→ 绘制顺序在面板下面。
        //    这样即便说明区域与面板重叠，也是面板压住说明，说明永远不会
        //   "挖掉"/遮挡下面的底板（不需要去改面板贴图或裁掉底板）。
        //    想让说明压在最上层，把 CFG.help.behindPanel 改成 false 即可。
        this.applyPalSkillHelpZOrder();
    };

    // 把说明层挪到指定层级（可在控制台改完 CFG.help.behindPanel 后重新调用）
    Scene_Battle.prototype.applyPalSkillHelpZOrder = function () {
        const help = this._palSkillHelpWindow;
        if (!help) return;
        const layer = this._windowLayer;
        if (!layer || layer.children.indexOf(help) < 0) return;

        if (CFG.help.behindPanel && this._skillWindow) {
            const idx = layer.children.indexOf(this._skillWindow);
            const cur = layer.children.indexOf(help);
            if (idx >= 0 && cur > idx) {
                layer.removeChild(help);
                layer.addChildAt(help, idx);
            }
        } else {
            // 放回最上层
            const cur = layer.children.indexOf(help);
            if (cur >= 0 && cur !== layer.children.length - 1) {
                layer.removeChild(help);
                layer.addChild(help);
            }
        }
    };

    //=============================================================================
    // 选完仙术 → 收起仙术界面 → 进入选敌 / 选人阶段（ESC 再回到仙术界面）
    //
    // MZ 原生流程：Window_Selectable.processOk 只 deactivate，不 hide，
    // onSelectAction 也不调 hideSubInputWindows → 选完单体技后仙术面板仍留在
    // 屏幕上，既挡战场又和选目标提示混在一起。这里补上"收起"这一步。
    //
    //   单体·敌方（scope 1/12 等）→ startEnemySelection()  敌人精灵闪白指示
    //   单体·我方（scope 7/9/12 等）→ startActorSelection() 伙伴栏 + 黄色三角
    //   非单体（全体/自身）        → selectNextCommand()   直接进下一条指令
    //   ESC                        → onEnemyCancel / onActorCancel 会
    //                                _skillWindow.show() + activate() 回到仙术界面
    //=============================================================================
    const _Scene_Battle_onSelectAction = Scene_Battle.prototype.onSelectAction;

    Scene_Battle.prototype.onSelectAction = function () {
        const action = BattleManager.inputtingAction();
        const needsSel = !!(action && action.needsSelection && action.needsSelection());

        if (needsSel && CFG.flow.hideSkillOnTargetSelect) {
            // ① 收起仙术界面本体
            this._skillWindow.deactivate();
            this._skillWindow.hide();
            this._itemWindow.hide();
            // ② 同步收起仙剑附属窗（真气栏 / 说明层），否则它们会孤零零留在顶部
            if (this._palSkillMpWindow) this._palSkillMpWindow.hide();
            if (this._palSkillHelpWindow) this._palSkillHelpWindow.hide();
            // ③ 目标选择窗交给原流程重新 show，这里先复位避免残留上一轮的选中项
            this._enemyWindow.hide();
            this._actorWindow.hide();
        }
        // 注意：这里【不要】碰 _actorCommandWindow。
        // 攻击 / 防御等指令同样会走到 onSelectAction，而 MZ 的 onEnemyCancel
        // 对 "attack" 分支只有 activate() 没有 show()——一旦在此处把指令盘 hide，
        // 取消选敌后它就再也回不来，四个指令按钮会永久消失（v1.2 的回归）。
        // 指令盘的显隐交给 commandSkill / onSkillCancel 等原生路径即可。

        // ④ 交给原流程分流（palBattleAnim 对全体攻击的改写也在链上，不受影响）
        _Scene_Battle_onSelectAction.call(this);
    };

    //=============================================================================
    // 兜底：取消选敌/选人回到指令盘阶段时，确保指令盘（四个按钮）一定重新显示
    // --------------------------------------------------------------------------
    // MZ 的 onEnemyCancel 对 "attack" 分支只有 activate() 没有 show()，
    // 一旦指令盘被别处 hide 过，取消后就再也回不来。这里统一兜底。
    // 技能/道具分支不处理——那种情况应该回到仙术/道具窗，而不是指令盘。
    //=============================================================================
    const restoreCommandWindow = function (scene) {
        const w = scene._actorCommandWindow;
        if (!w) return;
        const sym = w.currentSymbol();
        if (sym === "skill" || sym === "item") return;
        if (scene._skillWindow && scene._skillWindow.visible) return;
        if (scene._itemWindow && scene._itemWindow.visible) return;
        if (!w.visible) w.show();
        if (!w.active) w.activate();
    };

    const _onEnemyCancel_Restore = Scene_Battle.prototype.onEnemyCancel;
    Scene_Battle.prototype.onEnemyCancel = function () {
        _onEnemyCancel_Restore.call(this);
        restoreCommandWindow(this);
    };

    const _onActorCancel_Restore = Scene_Battle.prototype.onActorCancel;
    Scene_Battle.prototype.onActorCancel = function () {
        _onActorCancel_Restore.call(this);
        restoreCommandWindow(this);
    };

    // 我方单体：确保伙伴选择窗可见并默认选中 1 号位（黄色三角落到第一个伙伴头上）
    const _Scene_Battle_startActorSelection = Scene_Battle.prototype.startActorSelection;
    Scene_Battle.prototype.startActorSelection = function () {
        _Scene_Battle_startActorSelection.call(this);
        if (this._actorWindow && this._actorWindow.visible) {
            this._actorWindow.select(0);
        }
    };

    //=============================================================================
    // 【已移除】曾经的"每帧兜底 ensureActorCommandVisible()"不要再加回来。
    // --------------------------------------------------------------------------
    // 四个指令按钮消失的真正原因不在指令盘本身，而在 palBattleMisc.js 的
    // isAnyInputWindowActive() 覆盖：杂项窗隐藏时仍 active → 本函数恒 true
    // → needsInputWindowChange() 恒 false → startActorCommandSelection() 永不执行
    // → 指令盘永不 setup()（_list 为空、actor 为 null、openness=0）。
    // 每帧强制 show/activate 只是把"空壳指令盘"摆出来，而且会和
    // onMiscEscape 里的 deactivate() 打架（逃跑时刚冻结就被重新激活）。
    //=============================================================================
    const _Scene_Battle_update = Scene_Battle.prototype.update;
    Scene_Battle.prototype.update = function () {
        _Scene_Battle_update.call(this);
        this.updatePalSkillSubWindows();
    };

    // 仙术窗口激活时同步真气栏与说明；关闭时隐藏。每帧检查，
    // 施法后重新打开自动反映消耗后的真气（"界面重置"）。
    Scene_Battle.prototype.updatePalSkillSubWindows = function () {
        const sw = this._skillWindow;
        const active = !!(sw && sw.visible && sw.active && sw.isOpen());
        if (active) {
            const actor = sw._actor || BattleManager.actor();
            this._palSkillMpWindow.setSkill(sw.item(), actor);
            this._palSkillHelpWindow.setSkill(sw.item());
            if (!this._palSkillMpWindow.visible) {
                this._palSkillMpWindow.show();
                this._palSkillHelpWindow.show();
            }
        } else {
            if (this._palSkillMpWindow.visible) {
                this._palSkillMpWindow.hide();
                this._palSkillMpWindow.setSkill(null, null);
                this._palSkillHelpWindow.hide();
                this._palSkillHelpWindow.setSkill(null);
            }
        }
        // 隐藏 MZ 默认帮助窗，避免与仙剑样式说明重叠
        if (this._helpWindow && this._helpWindow.visible) {
            this._helpWindow.hide();
        }
    };

    //=============================================================================
    // 运行时调参小工具（浏览器控制台里直接调用，改完立刻生效，不用重启游戏）
    //
    //   PAL98_SKILL_UI                      // 查看/改所有参数
    //   PAL98.setHelp({ y: -10 })           // 说明层整体上移 10px
    //   PAL98.setHelp({ height: 96, textY: 6 })
    //   PAL98.setPanel({ y: 130 })          // 仙术面板下移
    //   PAL98.setMp({ width: 320 })         // 真气栏加宽
    //   PAL98.helpOnTop(false)              // false=说明在面板下面(默认) / true=压在最上
    //=============================================================================
    if (typeof window !== "undefined") {
        const cur = () => SceneManager._scene;

        window.PAL98 = window.PAL98 || {};

        window.PAL98.setHelp = function (opts) {
            Object.assign(CFG.help, opts || {});
            const sc = cur();
            const help = sc && sc._palSkillHelpWindow;
            if (!help) return;
            const w = Math.max(CFG.help.minWidth, Graphics.boxWidth - CFG.help.widthInset);
            help.move(CFG.help.x, CFG.help.y, w, CFG.help.height);
            help.createContents();   // 尺寸变了要重建文字位图
            help.applyConfig();
            sc.applyPalSkillHelpZOrder();
        };

        window.PAL98.setPanel = function (opts) {
            Object.assign(CFG.panel, opts || {});
            const sc = cur();
            const sw = sc && sc._skillWindow;
            if (!sw) return;
            sw.move(CFG.panel.x, CFG.panel.y,
                Graphics.boxWidth - CFG.panel.widthInset, CFG.panel.height);
            sw.createContents();
            sw.refresh();
        };

        window.PAL98.setMp = function (opts) {
            Object.assign(CFG.mp, opts || {});
            const sc = cur();
            const mw = sc && sc._palSkillMpWindow;
            if (!mw) return;
            mw.move(CFG.mp.x, CFG.mp.y, CFG.mp.width, CFG.mp.height);
            mw.createContents();
            mw.refresh();
        };

        window.PAL98.helpOnTop = function (on) {
            CFG.help.behindPanel = !on;
            const sc = cur();
            if (sc) sc.applyPalSkillHelpZOrder();
        };
    }

})();
