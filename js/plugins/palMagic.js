/*:
 * @target MZ
 * @plugindesc Chinese Paladin Magic List UI
 * @author AI Assistant
 *
 * @help
 * Implements the out-of-combat Magic (Skill) UI for "The Legend of Sword and Fairy 98" style.
 */

(() => {
    // Shared Colors for breathing effect
    const selectedColors = [
        '#d6ad4e', '#d9b45a', '#e0c066', '#e7cc72', '#edda7e',
        '#f3e472', '#edda7e', '#e7cc72', '#e0c066', '#d9b45a'
    ];

    //-----------------------------------------------------------------------------
    // Scene_Menu Hook
    //-----------------------------------------------------------------------------
    const _Scene_Menu_onMagicActorOk = Scene_Menu.prototype.onMagicActorOk;
    Scene_Menu.prototype.onMagicActorOk = function () {
        SoundManager.playOk();
        // The actor was selected in Window_PaladinMagicActor
        const actor = $gameParty.members()[this._magicActorWindow.index()];
        $gameParty.setMenuActor(actor);
        SceneManager.push(Scene_PaladinMagic);
    };

    //-----------------------------------------------------------------------------
    // Window_PaladinMagicMenuBase
    //-----------------------------------------------------------------------------
    function Window_PaladinMagicMenuBase() {
        this.initialize(...arguments);
    }
    Window_PaladinMagicMenuBase.prototype = Object.create(Window_PaladinMenuBase.prototype);
    Window_PaladinMagicMenuBase.prototype.constructor = Window_PaladinMagicMenuBase;

    Window_PaladinMagicMenuBase.prototype.initialize = function (rect) {
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

        this._refreshListener = this.refresh.bind(this);
        this._listeningImages = new Set();
        this._bgSprite = new Sprite();

        Window_PaladinBase.prototype.initialize.call(this, rect);

        this.opacity = 255;
        this.backOpacity = 0;
        this.frameVisible = false;
        this.contentsOpacity = 255;
        this.padding = 0;

        const container = this._container || this;
        container.addChildAt(this._bgSprite, 0);

        this.refresh();
    };

    //-----------------------------------------------------------------------------
    // Window_PaladinMagicList
    //-----------------------------------------------------------------------------
    function Window_PaladinMagicList() {
        this.initialize(...arguments);
    }
    Window_PaladinMagicList.prototype = Object.create(Window_SkillList.prototype);
    Window_PaladinMagicList.prototype.constructor = Window_PaladinMagicList;

    Window_PaladinMagicList.prototype.initialize = function (rect) {
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

        const container = this._container || this;
        container.addChildAt(this._bgSprite, 0);

        this._drawCustomBackground();
    };

    Window_PaladinMagicList.prototype._drawCustomBackground = function () {
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

        if (!this._bgSprite.bitmap || this._bgSprite.bitmap.width !== width || this._bgSprite.bitmap.height !== height) {
            this._bgSprite.bitmap = new Bitmap(width, height);
        }

        const bitmap = this._bgSprite.bitmap;
        bitmap.clear();

        const scale = 3;
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

        // 【参数】各背景贴图的微调偏移量
        const offsetX = { tl: 0, t: 0, tr: 0, l: 0, c: 0, r: 0, bl: 0, b: 0, br: 0 };
        const offsetY = { tl: 0, t: 0, tr: 0, l: 0, c: 0, r: 0, bl: 0, b: 0, br: 0 };

        this._tileThreeTimes(bitmap, c, marginLeft + offsetX.c, marginTop + offsetY.c, w - marginLeft - marginRight, h - marginTop - marginBottom);
        this._tileThreeTimes(bitmap, t, marginLeft + offsetX.t, 0 + offsetY.t, w - marginLeft - marginRight, tH); // Top
        this._tileThreeTimes(bitmap, b, marginLeft + offsetX.b, h - bH + offsetY.b, w - marginLeft - marginRight, bH); // Bottom
        this._tileThreeTimes(bitmap, l, 0 + offsetX.l, marginTop + offsetY.l, lW, h - marginTop - marginBottom); // Left
        this._tileThreeTimes(bitmap, r, w - trW + offsetX.tr, marginTop + offsetY.r, rW, h - marginTop - marginBottom); // Right
        this._tileThreeTimes(bitmap, tl, 0 + offsetX.tl, 0 + offsetY.tl, tlW, tlH);
        this._tileThreeTimes(bitmap, tr, w - trW + offsetX.tr, 0 + offsetY.tr, trW, trH);
        this._tileThreeTimes(bitmap, bl, 0 + offsetX.bl, h - blH + offsetY.bl, blW, blH);
        this._tileThreeTimes(bitmap, br, w - trW + offsetX.tr, h - brH + offsetY.br, brW, brH);
    };

    Window_PaladinMagicList.prototype._tileThreeTimes = function (bitmap, source, dx, dy, dw, dh) {
        if (dw <= 0 || dh <= 0) return;
        const scale = 3;
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

    Window_PaladinMagicList.prototype.drawItemBackground = function (index) {
        // Do nothing
    };

    Window_PaladinMagicList.prototype.maxCols = function () {
        return 3;
    };

    Window_PaladinMagicList.prototype.numVisibleRows = function () {
        return 5;
    };

    Object.defineProperty(Window_PaladinMagicList.prototype, "innerHeight", {
        get: function () {
            return 5 * this.itemHeight(); // Exactly 5 rows
        },
        configurable: true
    });

    Object.defineProperty(Window_PaladinMagicList.prototype, "innerWidth", {
        get: function () {
            // 【参数】仙术列表内容区域的左右边界厚度扣减（单侧24则共48）
            return Math.max(0, this.width - 48);
        },
        configurable: true
    });

    Window_PaladinMagicList.prototype._updateClientArea = function () {
        // 【参数】仙术列表内部可视区域（处理滚动遮罩），分别是 X偏移(24), Y偏移(顶部留白36), 宽度, 高度
        this._clientArea.move(24, 36, this.innerWidth, this.innerHeight);
    };

    Window_PaladinMagicList.prototype._updateFilterArea = function () {
        const pos = this._clientArea.worldTransform.apply(new Point(0, 0));
        const filterArea = this._clientArea.filterArea;
        if (filterArea) {
            filterArea.x = pos.x;
            filterArea.y = pos.y;
            filterArea.width = this.innerWidth;
            filterArea.height = this.innerHeight;
        }
    };

    Window_PaladinMagicList.prototype.lineHeight = function () {
        return 42;
    };

    Window_PaladinMagicList.prototype.itemHeight = function () {
        return 52; // 【参数】单行总高度（文字高度+行距），原为48
    };

    Window_PaladinMagicList.prototype.rowSpacing = function () {
        return 8; // 【参数】行与行之间的额外间隔，原系统默认为4
    };

    Window_PaladinMagicList.prototype.includes = function (item) {
        return item && item.stypeId !== 0; // Show all skills, we'll check if they can be used outside combat
    };

    Window_PaladinMagicList.prototype.isEnabled = function (item) {
        // In paladin out-of-combat magic, it's enabled if it's a menu/always skill and actor can pay cost.
        return this._actor && this._actor.canUse(item) && [0, 2].includes(item.occasion);
    };

    Window_PaladinMagicList.prototype.drawItem = function (index) {
        const skill = this.itemAt(index);
        if (!skill) return;

        const rect = this.itemLineRect(index);
        this.contents.clearRect(rect.x, rect.y, rect.width, rect.height);

        const isEnabled = this.isEnabled(skill);
        const isSelected = (index === this.index());

        this.contents.outlineWidth = 0;

        // Colors
        let textColor = '#C4B8AC'; // Enabled Unselected
        if (!isEnabled && !isSelected) textColor = '#CF6A5A'; // Disabled Unselected
        if (!isEnabled && isSelected) textColor = '#FCAC9C'; // Disabled Selected
        if (isEnabled && isSelected) {
            // Breathing effect
            let colorIndex = 0;
            if (this.active) {
                colorIndex = Math.floor(Date.now() / 150) % selectedColors.length;
            }
            textColor = selectedColors[colorIndex];
        }

        this.contents.fontSize = 42;

        // 【参数】仙术名字的X,Y偏移
        const textOffsetX = 0;
        const textOffsetY = 0;

        // Shadow
        this.contents.textColor = '#000000';
        this.contents.drawText(skill.name, rect.x + 2 + textOffsetX, rect.y + 2 + textOffsetY, rect.width, this.lineHeight());

        // Name
        this.contents.textColor = textColor;
        this.contents.drawText(skill.name, rect.x + textOffsetX, rect.y + textOffsetY, rect.width, this.lineHeight());
    };

    Window_PaladinMagicList.prototype.redrawCurrentItem = function () {
        if (this.index() >= 0) {
            this.redrawItem(this.index());
        }
    };

    Window_PaladinMagicList.prototype.update = function () {
        Window_SkillList.prototype.update.call(this);
        if (this.visible && this.active && this.isOpen()) {
            this.redrawCurrentItem();
        }
    };

    Window_PaladinMagicList.prototype.select = function (index) {
        const lastIndex = this.index();
        Window_SkillList.prototype.select.call(this, index);
        if (lastIndex >= 0 && lastIndex !== this.index()) {
            this.redrawItem(lastIndex);
        }
        if (this.index() >= 0) {
            this.redrawItem(this.index());
        }
    };

    // Override cursorDown for the specific wrap behavior
    Window_PaladinMagicList.prototype.cursorDown = function (wrap) {
        const index = this.index();
        const maxItems = this.maxItems();
        const maxCols = this.maxCols();

        if (index < maxItems - maxCols || (wrap && maxCols === 1)) {
            this.smoothSelect((index + maxCols) % maxItems);
        } else {
            const currentRow = Math.floor(index / maxCols);
            const lastRow = Math.floor((maxItems - 1) / maxCols);
            if (currentRow === lastRow - 1) {
                // Wrap to the last item if pushing down on the second to last row
                this.smoothSelect(maxItems - 1);
            }
        }
    };

    // Prevent drawing skill cost as text (we draw it in Window_PaladinMagicMP)
    Window_PaladinMagicList.prototype.drawSkillCost = function (skill, x, y, width) {
        // Do nothing
    };

    //-----------------------------------------------------------------------------
    // Window_PaladinMagicMP
    //-----------------------------------------------------------------------------
    function Window_PaladinMagicMP() {
        this.initialize(...arguments);
    }
    Window_PaladinMagicMP.prototype = Object.create(Window_Base.prototype);
    Window_PaladinMagicMP.prototype.constructor = Window_PaladinMagicMP;

    Window_PaladinMagicMP.prototype.initialize = function (rect) {
        Window_Base.prototype.initialize.call(this, rect);
        this.opacity = 255;
        this.backOpacity = 0;
        this.frameVisible = false;

        this._skill = null;
        this._actor = null;

        this._bgImgs = [
            ImageManager.loadSystem("Data944"), // L
            ImageManager.loadSystem("Data945"), // C
            ImageManager.loadSystem("Data946")  // R
        ];

        this._costDigits = [];
        for (let i = 0; i < 10; i++) this._costDigits.push(ImageManager.loadSystem("Data" + (919 + i)));
        this._slashImg = ImageManager.loadSystem("Data939");
        this._maxDigits = [];
        for (let i = 0; i < 10; i++) this._maxDigits.push(ImageManager.loadSystem("Data" + (956 + i)));

        this._refreshListener = this.refresh.bind(this);
        this._listeningImages = new Set();
    };

    Window_PaladinMagicMP.prototype.updatePadding = function () {
        this.padding = 0;
    };

    Window_PaladinMagicMP.prototype.setSkill = function (skill, actor) {
        if (this._skill !== skill || this._actor !== actor) {
            this._skill = skill;
            this._actor = actor;
            this.refresh();
        }
    };

    Window_PaladinMagicMP.prototype.refresh = function () {
        this.contents.clear();

        const allImgs = [...this._bgImgs, ...this._costDigits, this._slashImg, ...this._maxDigits];
        if (allImgs.some(img => !img.isReady())) {
            allImgs.forEach(img => {
                if (!img.isReady() && !this._listeningImages.has(img)) {
                    img.addLoadListener(this._refreshListener);
                    this._listeningImages.add(img);
                }
            });
            return;
        }

        // Draw Background
        const scale = 3;
        const w = this.contents.width;
        const h = this.contents.height;
        const lImg = this._bgImgs[0];
        const cImg = this._bgImgs[1];
        const rImg = this._bgImgs[2];

        // 【参数】MP消耗背景各部分微调
        const lW = lImg.width * scale;
        const rW = rImg.width * scale;
        const lH = lImg.height * scale;
        const rH = rImg.height * scale;
        const cH = cImg.height * scale;

        // 【参数】整个背景的起始坐标
        const bgX = 0;
        const bgY = 0;

        this.contents.blt(lImg, 0, 0, lImg.width, lImg.height, bgX, bgY, lW, lH);
        this.contents.blt(rImg, 0, 0, rImg.width, rImg.height, bgX + w - rW, bgY, rW, rH);

        const cW = cImg.width * scale;
        const fillW = w - lW - rW;
        if (fillW > 0) {
            for (let x = 0; x < fillW; x += cW) {
                const drawW = Math.min(cW, fillW - x);
                const sw = drawW / scale;
                this.contents.blt(cImg, 0, 0, sw, cImg.height, bgX + lW + x, bgY, drawW, cH);
            }
        }

        if (!this._skill || !this._actor) return;

        // Draw Cost
        const cost = this._actor.skillMpCost(this._skill);
        const costStr = cost.toString();
        const maxMpStr = this._actor.mmp.toString();

        let totalW = 0;
        const spacing = 2; // 【参数】MP数字之间的间距

        for (let i = 0; i < costStr.length; i++) totalW += this._costDigits[0].width * scale + spacing;
        totalW += this._slashImg.width * scale + spacing * 11;
        for (let i = 0; i < maxMpStr.length; i++) totalW += this._maxDigits[0].width * scale + spacing;

        // 【参数】数字整体水平居中微调
        let curX = bgX + (w - totalW) / 2;
        // 【参数】数字垂直居中微调
        const numY = bgY + (cH - this._costDigits[0].height * scale) / 2;

        // Cost
        for (let i = 0; i < costStr.length; i++) {
            const digit = parseInt(costStr[i]);
            const img = this._costDigits[digit];
            this.contents.blt(img, 0, 0, img.width, img.height, curX, numY, img.width * scale, img.height * scale);
            curX += img.width * scale + spacing;
        }

        // Slash
        // 【参数】斜杠微调
        const slashYOffset = 2;
        curX += spacing * 5;
        this.contents.blt(this._slashImg, 0, 0, this._slashImg.width, this._slashImg.height, curX, numY + slashYOffset, this._slashImg.width * scale, this._slashImg.height * scale);
        curX += this._slashImg.width * scale + spacing * 6;

        // Max MP
        for (let i = 0; i < maxMpStr.length; i++) {
            const digit = parseInt(maxMpStr[i]);
            const img = this._maxDigits[digit];
            this.contents.blt(img, 0, 0, img.width, img.height, curX, numY, img.width * scale, img.height * scale);
            curX += img.width * scale + spacing;
        }
    };

    //-----------------------------------------------------------------------------
    // Window_PaladinMagicHelp
    //-----------------------------------------------------------------------------
    function Window_PaladinMagicHelp() {
        this.initialize(...arguments);
    }
    Window_PaladinMagicHelp.prototype = Object.create(Window_Base.prototype);
    Window_PaladinMagicHelp.prototype.constructor = Window_PaladinMagicHelp;

    Window_PaladinMagicHelp.prototype.initialize = function (rect) {
        Window_Base.prototype.initialize.call(this, rect);
        this.opacity = 0; // Transparent background
        this._skill = null;
    };

    Window_PaladinMagicHelp.prototype.setSkill = function (skill) {
        if (this._skill !== skill) {
            this._skill = skill;
            this.refresh();
        }
    };

    Window_PaladinMagicHelp.prototype.lineHeight = function () {
        return 42; // 【参数】仙术说明文字行高
    };

    Window_PaladinMagicHelp.prototype.refresh = function () {
        this.contents.clear();
        if (!this._skill) return;

        this.contents.outlineWidth = 0;

        // 【参数】仙术说明文字起始坐标
        let textX = 0;
        let textY = 0;
        // 【参数】仙术说明文字行间距
        const lineSpacing = 12;

        const desc = this._skill.description || "";
        const lines = desc.replace(/\\n/g, '\n').split(/[\r\n]+/).slice(0, 2); // Max 2 lines

        for (let i = 0; i < lines.length; i++) {
            // Shadow
            this.contents.textColor = '#000000';
            this.contents.drawText(lines[i], textX + 2, textY + 2, this.contents.width - textX, this.lineHeight(), 'left');

            // Text
            this.contents.textColor = '#F7EB99'; // 【参数】仙术说明文字颜色
            this.contents.drawText(lines[i], textX, textY, this.contents.width - textX, this.lineHeight(), 'left');

            textY += this.lineHeight() + lineSpacing;
        }
    };

    //-----------------------------------------------------------------------------
    // Window_PaladinPartyStatus Targeting Extensions
    //-----------------------------------------------------------------------------
    const _Window_PaladinPartyStatus_initialize = Window_PaladinPartyStatus.prototype.initialize;
    Window_PaladinPartyStatus.prototype.initialize = function (rect) {
        _Window_PaladinPartyStatus_initialize.call(this, rect);
        this._targetCursorSprite = new Sprite();
        this._targetCursorSprite.bitmap = ImageManager.loadSystem("Data969");
        this._targetCursorSprite.visible = false;
        this.addChild(this._targetCursorSprite);
        this._targetIndex = 0;
        this._targetingMode = false;
    };

    Window_PaladinPartyStatus.prototype.maxItems = function () {
        return $gameParty.battleMembers().length;
    };

    Window_PaladinPartyStatus.prototype.startTargeting = function () {
        this._targetingMode = true;
        this._targetIndex = 0;
        this.updateTargetCursor();
        this._targetCursorSprite.visible = true;
    };

    Window_PaladinPartyStatus.prototype.stopTargeting = function () {
        this._targetingMode = false;
        this._targetCursorSprite.visible = false;
    };

    Window_PaladinPartyStatus.prototype.setTargetIndex = function (index) {
        this._targetIndex = index;
        this.updateTargetCursor();
    };

    Window_PaladinPartyStatus.prototype.targetIndex = function () {
        return this._targetIndex;
    };

    Window_PaladinPartyStatus.prototype.updateTargetCursor = function () {
        if (!this._targetingMode) return;
        const scale = 3;
        const bgImg = ImageManager.loadSystem("Data918");
        const boxW = bgImg.width * scale;
        const gap = 8;
        const members = $gameParty.battleMembers();

        let startX = 126;
        if (startX < 0) startX = 0;

        const x = startX + this._targetIndex * (boxW + gap);
        // 【参数】目标光标的位置微调
        const cursorX = x + (boxW - this._targetCursorSprite.bitmap.width * scale) / 2;
        const cursorY = this.height - 24;

        this._targetCursorSprite.x = cursorX;
        this._targetCursorSprite.y = cursorY;
        this._targetCursorSprite.scale.x = scale;
        this._targetCursorSprite.scale.y = scale;
    };

    Window_PaladinPartyStatus.prototype.cursorRight = function (wrap) {
        this._targetIndex = (this._targetIndex + 1) % this.maxItems();
        this.updateTargetCursor();
        SoundManager.playCursor();
    };

    Window_PaladinPartyStatus.prototype.cursorLeft = function (wrap) {
        this._targetIndex = (this._targetIndex - 1 + this.maxItems()) % this.maxItems();
        this.updateTargetCursor();
        SoundManager.playCursor();
    };

    // Make Window_PaladinPartyStatus behave a bit like Window_Selectable for targeting
    const _Window_PaladinPartyStatus_update = Window_PaladinPartyStatus.prototype.update;
    Window_PaladinPartyStatus.prototype.update = function () {
        _Window_PaladinPartyStatus_update.call(this);
        if (this.active && this._targetingMode) {
            this.processHandling();
        }
    };

    Window_PaladinPartyStatus.prototype.processHandling = function () {
        if (this.isOpenAndActive()) {
            if (Input.isRepeated('right') || Input.isRepeated('down')) {
                this.cursorRight(true);
            }
            if (Input.isRepeated('left') || Input.isRepeated('up')) {
                this.cursorLeft(true);
            }
            if (Input.isTriggered('ok')) {
                this.processOk();
            }
            if (Input.isTriggered('cancel') || TouchInput.isCancelled()) {
                this.processCancel();
            }
        }
    };

    Window_PaladinPartyStatus.prototype.isOpenAndActive = function () {
        return this.isOpen() && this.visible && this.active;
    };

    Window_PaladinPartyStatus.prototype.processOk = function () {
        if (this.isCurrentItemEnabled()) {
            SoundManager.playOk();
            this.updateInputData();
            this.deactivate();
            this.callOkHandler();
        } else {
            SoundManager.playBuzzer();
        }
    };

    Window_PaladinPartyStatus.prototype.processCancel = function () {
        SoundManager.playCancel();
        this.updateInputData();
        this.deactivate();
        this.callCancelHandler();
    };

    Window_PaladinPartyStatus.prototype.isCurrentItemEnabled = function () {
        return true;
    };

    Window_PaladinPartyStatus.prototype.updateInputData = function () {
        Input.update();
        TouchInput.update();
    };

    Window_PaladinPartyStatus.prototype.callOkHandler = function () {
        if (this._handlers && this._handlers['ok']) {
            this._handlers['ok']();
        }
    };

    Window_PaladinPartyStatus.prototype.callCancelHandler = function () {
        if (this._handlers && this._handlers['cancel']) {
            this._handlers['cancel']();
        }
    };

    Window_PaladinPartyStatus.prototype.setHandler = function (symbol, method) {
        if (!this._handlers) this._handlers = {};
        this._handlers[symbol] = method;
    };

    //-----------------------------------------------------------------------------
    // Scene_PaladinMagic
    //-----------------------------------------------------------------------------
    function Scene_PaladinMagic() {
        this.initialize(...arguments);
    }
    Scene_PaladinMagic.prototype = Object.create(Scene_ItemBase.prototype);
    Scene_PaladinMagic.prototype.constructor = Scene_PaladinMagic;

    Scene_PaladinMagic.prototype.initialize = function () {
        Scene_ItemBase.prototype.initialize.call(this);
    };

    Scene_PaladinMagic.prototype.needsCancelButton = function () {
        return false;
    };

    Scene_PaladinMagic.prototype.item = function () {
        return this._magicListWindow ? this._magicListWindow.item() : null;
    };

    // Disable blur
    Scene_PaladinMagic.prototype.createBackground = function () {
        this._backgroundSprite = new Sprite();
        this._backgroundSprite.bitmap = SceneManager.backgroundBitmap();
        this.addChild(this._backgroundSprite);
    };

    Scene_PaladinMagic.prototype.create = function () {
        Scene_ItemBase.prototype.create.call(this);
        this.createPartyStatusWindow();
        this.createMagicListWindow();
        this.createMagicMPWindow();
        this.createMagicHelpWindow();

        // Refresh party status to show all members
        this._partyStatusWindow.refresh();
        this._partyStatusWindow.show();
    };

    Scene_PaladinMagic.prototype.createPartyStatusWindow = function () {
        const wh = 114;
        const ww = Graphics.boxWidth;
        const wx = 0;
        const wy = Graphics.boxHeight - wh;
        const rect = new Rectangle(wx, wy, ww, wh);
        this._partyStatusWindow = new Window_PaladinPartyStatus(rect);
        this._partyStatusWindow.setHandler('ok', this.onTargetOk.bind(this));
        this._partyStatusWindow.setHandler('cancel', this.onTargetCancel.bind(this));
        this.addWindow(this._partyStatusWindow);
    };

    Scene_PaladinMagic.prototype.createMagicListWindow = function () {
        // 【参数】仙术列表的位置和大小
        const wx = 50;
        const ww = Graphics.boxWidth - 100;
        const wy = 120;
        const wh = 340;
        const rect = new Rectangle(wx, wy, ww, wh);

        this._magicListWindow = new Window_PaladinMagicList(rect);
        this._magicListWindow.setHandler('ok', this.onMagicOk.bind(this));
        this._magicListWindow.setHandler('cancel', this.onMagicCancel.bind(this));
        this.addWindow(this._magicListWindow);
        this._magicListWindow.setActor(this.actor());
        this._magicListWindow.refresh();
        this._magicListWindow.activate();
        this._magicListWindow.select(0);
    };

    Scene_PaladinMagic.prototype.createMagicMPWindow = function () {
        // 【参数】仙术消耗栏的位置和大小
        const ww = 280;
        const wh = 100;
        const wx = 0;
        const wy = 0;
        const rect = new Rectangle(wx, wy, ww, wh);

        this._magicMpWindow = new Window_PaladinMagicMP(rect);
        this.addWindow(this._magicMpWindow);
    };

    Scene_PaladinMagic.prototype.createMagicHelpWindow = function () {
        // 【参数】仙术说明的位置和大小
        const ww = 1000;
        const wh = 120;
        const wx = 300; // 50 (MP x) + 280 (MP w) + 20 (gap)
        const wy = 0;
        const rect = new Rectangle(wx, wy, ww, wh);

        this._magicHelpWindow = new Window_PaladinMagicHelp(rect);
        this.addWindow(this._magicHelpWindow);
    };

    Scene_PaladinMagic.prototype.update = function () {
        Scene_ItemBase.prototype.update.call(this);
        // Link the selected skill to MP and Help windows
        if (this._magicListWindow.active) {
            const skill = this._magicListWindow.item();
            this._magicMpWindow.setSkill(skill, this.actor());
            this._magicHelpWindow.setSkill(skill);
        }
    };

    Scene_PaladinMagic.prototype.onMagicOk = function () {
        const skill = this._magicListWindow.item();
        const action = new Game_Action(this.actor());
        action.setItemObject(skill);

        if (action.isForEveryone()) {
            // Group target: directly apply
            this.useItem();
            this._magicListWindow.activate();
        } else {
            // Single target
            // Only hide other items, keep the window visible
            this._magicListWindow.setCustomTargetingMode(true);

            this._partyStatusWindow.startTargeting();
            this._partyStatusWindow.activate();

            // Auto-select first target
            let targetIdx = $gameParty.members().indexOf(this.actor());
            if (targetIdx < 0) targetIdx = 0;
            this._partyStatusWindow.setTargetIndex(targetIdx);
        }
    };

    Window_PaladinMagicList.prototype.setCustomTargetingMode = function (active) {
        this._customTargetingMode = active;
        this.refresh();
    };

    const _Window_PaladinMagicList_drawItem = Window_PaladinMagicList.prototype.drawItem;
    Window_PaladinMagicList.prototype.drawItem = function (index) {
        if (this._customTargetingMode && index !== this.index()) {
            // Hide other magic names
            return;
        }
        _Window_PaladinMagicList_drawItem.call(this, index);
    };

    Scene_PaladinMagic.prototype.onMagicCancel = function () {
        SceneManager.pop();
    };

    Scene_PaladinMagic.prototype.onTargetOk = function () {
        const targetIdx = this._partyStatusWindow.targetIndex();
        const target = $gameParty.battleMembers()[targetIdx];

        // Setup ItemBase target logic
        const action = new Game_Action(this.actor());
        action.setItemObject(this.item());

        // Instead of ItemBase target array, we execute it directly:
        this.actor().useItem(this.item());
        action.apply(target);
        this.applyItem();

        // Return to skill list
        this.onTargetCancel();
    };

    Scene_PaladinMagic.prototype.onTargetCancel = function () {
        this._partyStatusWindow.stopTargeting();
        this._partyStatusWindow.deactivate();

        this._magicListWindow.setCustomTargetingMode(false);
        this._magicListWindow.show();
        this._magicListWindow.activate();
    };

    // Override applyItem from Scene_ItemBase to handle sounds and MP update
    Scene_PaladinMagic.prototype.applyItem = function () {
        const action = new Game_Action(this.actor());
        action.setItemObject(this.item());
        this.checkCommonEvent();
        this.playSeForItem();
        // The actor's MP was already deducted in useItem()
        this._partyStatusWindow.refresh();
        this._magicMpWindow.refresh();
        this._magicListWindow.refresh();
    };

    Scene_PaladinMagic.prototype.useItem = function () {
        // For all-target
        const action = new Game_Action(this.actor());
        action.setItemObject(this.item());
        this.actor().useItem(this.item());

        if (action.isForFriend()) {
            for (const target of $gameParty.members()) {
                action.apply(target);
            }
        }
        this.applyItem();
    };

    Scene_PaladinMagic.prototype.playSeForItem = function () {
        SoundManager.playUseSkill();
    };

})();
