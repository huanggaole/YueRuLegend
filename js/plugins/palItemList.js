/*:
 * @target MZ
 * @plugindesc Chinese Paladin Item List UI
 * @author AI Assistant
 *
 * @help
 * Implements the item list UI and help window for "The Legend of Sword and Fairy 98" style.
 */

(() => {
    // Shared Colors for breathing effect
    const selectedColors = [
        '#d6ad4e', '#d9b45a', '#e0c066', '#e7cc72', '#edda7e',
        '#f3e472', '#edda7e', '#e7cc72', '#e0c066', '#d9b45a'
    ];

    //-----------------------------------------------------------------------------
    // Window_PaladinItemHelp
    //-----------------------------------------------------------------------------
    function Window_PaladinItemHelp() {
        this.initialize(...arguments);
    }
    Window_PaladinItemHelp.prototype = Object.create(Window_Base.prototype);
    Window_PaladinItemHelp.prototype.constructor = Window_PaladinItemHelp;

    Window_PaladinItemHelp.prototype.initialize = function (rect) {
        Window_Base.prototype.initialize.call(this, rect);
        this.opacity = 255;
        this.backOpacity = 0;
        this.frameVisible = false;
        this._item = null;
        this._iconBg = ImageManager.loadSystem("Data970");
        this._listeningImages = new Set();
        this._refreshListener = this.refresh.bind(this);
    };

    Window_PaladinItemList.prototype.itemHeight = function () {
        return Math.floor((this.innerHeight - 50) / 7);
    };

    Window_PaladinItemHelp.prototype.setItem = function (item) {
        if (this._item !== item) {
            this._item = item;
            this.refresh();
        }
    };

    Window_PaladinItemHelp.prototype.updatePadding = function () {
        this.padding = 0; // MUST be 0 to prevent the background image from being truncated by the contents mask
    };

    Window_PaladinItemHelp.prototype.refresh = function () {
        this.contents.clear();

        if (!this._iconBg.isReady()) {
            if (!this._listeningImages.has(this._iconBg)) {
                this._iconBg.addLoadListener(this._refreshListener);
                this._listeningImages.add(this._iconBg);
            }
            return;
        }

        // 1. Draw Icon Background (always visible, even if no item selected)
        const scale = 3; // Icon background scale
        const bgW = this._iconBg.width * scale;
        const bgH = this._iconBg.height * scale;
        const padX = 18;
        const bgY = Math.max(0, this.contents.height - bgH) + 12; // 底部对齐
        this.contents.blt(this._iconBg, 0, 0, this._iconBg.width, this._iconBg.height, padX, bgY, bgW, bgH);

        if (!this._item) return;

        // Draw Icon
        const iconIndex = this._item.iconIndex;
        // 自定义缩放
        const iconSet = ImageManager.loadSystem("IconSet");
        const pw = ImageManager.iconWidth;
        const ph = ImageManager.iconHeight;
        const sx = (iconIndex % 16) * pw;
        const sy = Math.floor(iconIndex / 16) * ph;
        const iconScale = 3; // 道具icon放大倍率
        // Draw icon centered on the background
        const iconW = pw * iconScale;
        const iconH = ph * iconScale;
        const iconX = padX + (bgW - iconW) / 2;
        const iconY = bgY + (bgH - iconH) / 2;
        this.contents.blt(iconSet, sx, sy, pw, ph, iconX, iconY, iconW, iconH);

        // Draw Description
        // Max 3 lines. Color #F7EB99
        this.contents.outlineWidth = 0; // Remove outline, use shadow instead

        const textX = padX + bgW + 16;
        const lineSpacing = 8; // 行间距
        const totalTextHeight = this.lineHeight() * 3 + lineSpacing * 2;
        let textY = Math.max(0, (this.contents.height - totalTextHeight) / 2) + 18; // 垂直居中

        const desc = this._item.description || "";
        const lines = desc.split(/[\r\n]+/).slice(0, 3);

        for (let i = 0; i < lines.length; i++) {
            // Draw Shadow
            this.contents.textColor = '#000000';
            this.contents.drawText(lines[i], textX + 2, textY + 2, this.contents.width - textX, this.lineHeight(), 'left');

            // Draw Text
            this.contents.textColor = '#F7EB99';
            this.contents.drawText(lines[i], textX, textY, this.contents.width - textX, this.lineHeight(), 'left');

            textY += this.lineHeight() + lineSpacing;
        }
    };

    //-----------------------------------------------------------------------------
    // Window_PaladinItemList
    //-----------------------------------------------------------------------------
    function Window_PaladinItemList() {
        this.initialize(...arguments);
    }
    Window_PaladinItemList.prototype = Object.create(Window_ItemList.prototype);
    Window_PaladinItemList.prototype.constructor = Window_PaladinItemList;

    Window_PaladinItemList.prototype.initialize = function (rect) {
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

        // Digits
        this._digitImages = [];
        for (let i = 0; i < 10; i++) {
            this._digitImages.push(ImageManager.loadSystem("Data" + (956 + i)));
        }

        this._refreshListener = this._drawCustomBackground.bind(this);
        this._listeningImages = new Set();

        this._bgSprite = new Sprite();

        Window_ItemList.prototype.initialize.call(this, rect);

        this.opacity = 255;
        this.backOpacity = 0;
        this.frameVisible = false;
        // padding logic: if we set padding=0, items touch the edges. We want standard padding for items to stay inside the 9-slice borders.
        // The default padding is 12 or 18, which is good.

        const container = this._container || this;
        container.addChildAt(this._bgSprite, 0);

        this._mode = 'menu_use'; // 'menu_use', 'menu_equip', 'battle_use', 'battle_throw'

        this._drawCustomBackground();
    };

    Window_PaladinItemList.prototype.setMode = function (mode) {
        this._mode = mode;
        this.refresh();
    };

    Window_PaladinItemList.prototype.maxCols = function () {
        return 3;
    };

    Window_PaladinItemList.prototype.numVisibleRows = function () {
        return 7;
    };

    Window_PaladinItemList.prototype._drawCustomBackground = function () {
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

        // Center
        this._tileThreeTimes(bitmap, c, marginLeft, marginTop, w - marginLeft - marginRight, h - marginTop - marginBottom);

        // Edges
        this._tileThreeTimes(bitmap, t, marginLeft, 0, w - marginLeft - marginRight, tH); // Top
        this._tileThreeTimes(bitmap, b, marginLeft, h - bH, w - marginLeft - marginRight, bH); // Bottom
        this._tileThreeTimes(bitmap, l, 0, marginTop, lW, h - marginTop - marginBottom); // Left
        this._tileThreeTimes(bitmap, r, w - rW, marginTop, rW, h - marginTop - marginBottom); // Right

        // Corners
        this._tileThreeTimes(bitmap, tl, 0, 0, tlW, tlH);
        this._tileThreeTimes(bitmap, tr, w - trW, 0, trW, trH);
        this._tileThreeTimes(bitmap, bl, 0, h - blH, blW, blH);
        this._tileThreeTimes(bitmap, br, w - brW, h - brH, brW, brH);
    };

    Window_PaladinItemList.prototype._tileThreeTimes = function (bitmap, source, dx, dy, dw, dh) {
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

    // We don't draw the standard item background (selection rect)
    Window_PaladinItemList.prototype.drawItemBackground = function (index) {
        // Do nothing
    };

    Object.defineProperty(Window_PaladinItemList.prototype, "innerHeight", {
        get: function () {
            return Math.max(0, 7 * this.itemHeight());
        },
        configurable: true
    });

    Window_PaladinItemList.prototype.lineHeight = function () {
        return 42;
    };

    Window_PaladinItemList.prototype.itemHeight = function () {
        return 48; // 42px text + 6px gap (2 retro pixels * 3 scale)
    };

    Window_PaladinItemList.prototype._updateClientArea = function () {
        const pad = this.padding;
        this._clientArea.move(pad, pad + 25, this.innerWidth, this.innerHeight);
    };

    Window_PaladinItemList.prototype._updateFilterArea = function () {
        const pos = this._clientArea.worldTransform.apply(new Point(0, 0));
        const filterArea = this._clientArea.filterArea;
        if (filterArea) {
            filterArea.x = pos.x;
            filterArea.y = pos.y;
            filterArea.width = this.innerWidth;
            filterArea.height = this.innerHeight;
        }
    };

    Window_PaladinItemList.prototype.includes = function (item) {
        if (!item) return false;
        // Always show all items (weapons, armors, items) in the list.
        return DataManager.isItem(item) || DataManager.isWeapon(item) || DataManager.isArmor(item);
    };

    Window_PaladinItemList.prototype.isEnabled = function (item) {
        if (!item) return false;

        const isEquip = DataManager.isWeapon(item) || DataManager.isArmor(item);
        const isItem = DataManager.isItem(item);

        if (this._mode === 'menu_use') {
            if (isEquip) return false;
            return isItem && [0, 2].includes(item.occasion);
        } else if (this._mode === 'menu_equip') {
            if (isItem) return false;
            return true;
        } else if (this._mode === 'battle_use') {
            if (isEquip) return false;
            return isItem && [0, 1].includes(item.occasion);
        } else if (this._mode === 'battle_throw') {
            if (DataManager.isArmor(item)) return false;
            // Allow throwing weapons and certain items. We'll allow all weapons and all items for now.
            // Or maybe restrict items? Let's just return true for weapons and false for items unless noted.
            // To be safe, return true for all non-armor (weapons + items).
            return true;
        }
        return false;
    };

    Window_PaladinItemList.prototype.drawItem = function (index) {
        const item = this.itemAt(index);
        if (!item) return;

        const rect = this.itemLineRect(index);
        this.contents.clearRect(rect.x, rect.y, rect.width, rect.height);

        const isEnabled = this.isEnabled(item);
        const isSelected = (index === this.index());

        this.contents.outlineWidth = 0; // Paladin style no outline for list

        let textColor = '#C4B8AC'; // Default Normal
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

        // Draw Name Shadow
        this.contents.textColor = '#000000';
        this.contents.fontSize = 42;
        this.contents.drawText(item.name, rect.x + 2, rect.y + 2, rect.width, this.lineHeight());

        // Draw Name
        this.contents.textColor = textColor;
        this.contents.drawText(item.name, rect.x, rect.y, rect.width, this.lineHeight());

        // Draw Quantity
        const quantity = $gameParty.numItems(item);
        if (quantity > 1) {
            this.drawQuantityDigits(quantity, rect.x, rect.y, rect.width, rect.height);
        }
    };

    Window_PaladinItemList.prototype.drawQuantityDigits = function (quantity, x, y, width, height) {
        if (this._digitImages.some(img => !img.isReady())) {
            this._digitImages.forEach(img => {
                if (!img.isReady() && !this._listeningImages.has(img)) {
                    img.addLoadListener(() => this.refresh());
                    this._listeningImages.add(img);
                }
            });
            return;
        }

        const qStr = quantity.toString();
        const scale = 3; // Adjust if digits are too small
        const spacing = 1;

        let totalW = 0;
        for (let i = 0; i < qStr.length; i++) {
            const img = this._digitImages[parseInt(qStr[i])];
            totalW += img.width * scale + spacing;
        }

        let curX = x + width - totalW - 4; // Right align
        const imgH = this._digitImages[0].height * scale;
        const numY = y + (height - imgH) / 2;

        for (let i = 0; i < qStr.length; i++) {
            const digit = parseInt(qStr[i]);
            const img = this._digitImages[digit];
            this.contents.blt(img, 0, 0, img.width, img.height, curX, numY, img.width * scale, img.height * scale);
            curX += img.width * scale + spacing;
        }
    };

    Window_PaladinItemList.prototype.redrawCurrentItem = function () {
        if (this.index() >= 0) {
            this.redrawItem(this.index());
        }
    };

    Window_PaladinItemList.prototype.update = function () {
        Window_ItemList.prototype.update.call(this);
        if (this.visible && this.active && this.isOpen()) {
            this.redrawCurrentItem();
        }
    };

    Window_PaladinItemList.prototype.select = function (index) {
        const lastIndex = this.index();
        Window_ItemList.prototype.select.call(this, index);
        if (lastIndex >= 0 && lastIndex !== this.index()) {
            this.redrawItem(lastIndex);
        }
        if (this.index() >= 0) {
            this.redrawItem(this.index());
        }
    };

    Window_PaladinItemList.prototype.cursorDown = function (wrap) {
        const index = this.index();
        const maxItems = this.maxItems();
        const maxCols = this.maxCols();
        
        if (index < maxItems - maxCols || (wrap && maxCols === 1)) {
            this.smoothSelect((index + maxCols) % maxItems);
        } else {
            const currentRow = Math.floor(index / maxCols);
            const lastRow = Math.floor((maxItems - 1) / maxCols);
            if (currentRow === lastRow - 1) {
                this.smoothSelect(maxItems - 1);
            }
        }
    };

    //-----------------------------------------------------------------------------
    // Scene_PaladinItem
    //-----------------------------------------------------------------------------
    function Scene_PaladinItem() {
        this.initialize(...arguments);
    }
    Scene_PaladinItem.prototype = Object.create(Scene_ItemBase.prototype);
    Scene_PaladinItem.prototype.constructor = Scene_PaladinItem;

    Scene_PaladinItem.prototype.prepare = function (mode) {
        // mode is 'use' or 'equip'
        this._categoryMode = mode;
    };

    Scene_PaladinItem.prototype.create = function () {
        Scene_ItemBase.prototype.create.call(this);
        this.createHelpWindow();
        this.createItemWindow();
        // 保证 Help Window 渲染在 Item Window 上方，防止遮挡
        // if (this._windowLayer && this._helpWindow) {
        //     this._windowLayer.addChild(this._helpWindow);
        // }
    };

    Scene_PaladinItem.prototype.createBackground = function () {
        // Show map background without blur
        this._backgroundSprite = new Sprite();
        this._backgroundSprite.bitmap = SceneManager.backgroundBitmap();
        this.addChild(this._backgroundSprite);
    };

    Scene_PaladinItem.prototype.needsCancelButton = function () {
        return false;
    };

    Scene_PaladinItem.prototype.createHelpWindow = function () {
        // Calculate dimensions
        // The help window should overlap the ItemWindow slightly
        const wh = 240;
        const ww = Graphics.boxWidth;
        const wx = 0;
        const wy = Graphics.boxHeight - wh; // Bottom aligned
        const rect = new Rectangle(wx, wy, ww, wh);

        this._helpWindow = new Window_PaladinItemHelp(rect);
        this.addWindow(this._helpWindow);
    };

    Scene_PaladinItem.prototype.createItemWindow = function () {
        // 道具列表的尺寸自动填满上方空间，完美衔接到底部区域，防止任何截断
        const wh = Graphics.boxHeight - 180; // 整个屏幕高度减去底部 Help Window 的高度
        const ww = Graphics.boxWidth - 10;
        const wx = 5;
        const wy = 0; // Top margin

        const rect = new Rectangle(wx, wy, ww, wh);
        this._itemWindow = new Window_PaladinItemList(rect);
        this._itemWindow.setHelpWindow(this._helpWindow);
        this._itemWindow.setMode(this._categoryMode === 'equip' ? 'menu_equip' : 'menu_use');
        this._itemWindow.setHandler("ok", this.onItemOk.bind(this));
        this._itemWindow.setHandler("cancel", this.onCancel.bind(this));
        this.addWindow(this._itemWindow);

        this._itemWindow.activate();
        this._itemWindow.selectLast();
    };

    Scene_PaladinItem.prototype.onItemOk = function () {
        if (this._categoryMode === 'use') {
            $gameParty.setLastItem(this.item());
            this.determineItem();
        } else {
            // For equip mode, just play buzzer for now as Equip scene logic is complex.
            // If they want actual equip logic here, it needs to open actor select and then equip.
            SoundManager.playBuzzer();
            this._itemWindow.activate();
        }
    };

    Scene_PaladinItem.prototype.onCancel = function () {
        SoundManager.playCancel();
        SceneManager.goto(Scene_Map);
    };

    window.Window_PaladinItemList = Window_PaladinItemList;
    window.Window_PaladinItemHelp = Window_PaladinItemHelp;
    window.Scene_PaladinItem = Scene_PaladinItem;

})();
