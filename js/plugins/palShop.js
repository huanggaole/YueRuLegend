/*:
 * @target MZ
 * @plugindesc Chinese Paladin Shop UI
 * @author AI Assistant
 *
 * @help
 * Implements the Shop UI for "The Legend of Sword and Fairy 98" style.
 * Uses event command Shop Processing.
 * "Purchase Only" checked -> Weapon/Item Shop (Buy Mode).
 * "Purchase Only" unchecked -> Pawn Shop (Sell Mode).
 */

(() => {
    // Shared Colors for breathing effect
    const selectedColors = [
        '#d6ad4e', '#d9b45a', '#e0c066', '#e7cc72', '#edda7e',
        '#f3e472', '#edda7e', '#e7cc72', '#e0c066', '#d9b45a'
    ];

    //-----------------------------------------------------------------------------
    // Window_PalShopIcon
    // Displays the Data970 background and the item icon.
    //-----------------------------------------------------------------------------
    function Window_PalShopIcon() {
        this.initialize(...arguments);
    }
    Window_PalShopIcon.prototype = Object.create(Window_Base.prototype);
    Window_PalShopIcon.prototype.constructor = Window_PalShopIcon;

    Window_PalShopIcon.prototype.initialize = function (rect) {
        Window_Base.prototype.initialize.call(this, rect);
        this.opacity = 0; // completely transparent, we only draw contents
        this.padding = 0; // FIX BUG 2 & 6: Remove padding to avoid cutoff
        this._item = null;
        this._iconBg = ImageManager.loadSystem("Data970");
        this._listeningImages = new Set();
        this._refreshListener = this.refresh.bind(this);
    };

    Window_PalShopIcon.prototype.setItem = function (item) {
        if (this._item !== item) {
            this._item = item;
            this.refresh();
        }
    };

    Window_PalShopIcon.prototype.refresh = function () {
        this.contents.clear();
        if (!this._iconBg.isReady()) {
            if (!this._listeningImages.has(this._iconBg)) {
                this._iconBg.addLoadListener(this._refreshListener);
                this._listeningImages.add(this._iconBg);
            }
            return;
        }

        const scale = 3;
        const bgW = this._iconBg.width * scale;
        const bgH = this._iconBg.height * scale;

        // Center the background inside the window's rect
        const bgX = (this.width - bgW) / 2;
        const bgY = (this.height - bgH) / 2;

        this.contents.blt(this._iconBg, 0, 0, this._iconBg.width, this._iconBg.height, bgX, bgY, bgW, bgH);

        if (!this._item) return;

        const iconIndex = this._item.iconIndex;
        const iconSet = ImageManager.loadSystem("IconSet");
        const pw = ImageManager.iconWidth;
        const ph = ImageManager.iconHeight;
        const sx = (iconIndex % 16) * pw;
        const sy = Math.floor(iconIndex / 16) * ph;
        const iconW = pw * scale;
        const iconH = ph * scale;
        const iconX = bgX + (bgW - iconW) / 2;
        const iconY = bgY + (bgH - iconH) / 2;
        this.contents.blt(iconSet, sx, sy, pw, ph, iconX, iconY, iconW, iconH);
    };

    //-----------------------------------------------------------------------------
    // Window_PalShopLabel
    // Extends Window_PaladinHorzBar to display a label (金钱/售价/现有) and value (from Data919-928)
    //-----------------------------------------------------------------------------
    function Window_PalShopLabel() {
        this.initialize(...arguments);
    }
    Window_PalShopLabel.prototype = Object.create(Window_PaladinHorzBar.prototype);
    Window_PalShopLabel.prototype.constructor = Window_PalShopLabel;

    Window_PalShopLabel.prototype.initialize = function (rect, labelText) {
        this._labelText = labelText || "";
        this._value = 0;

        this._numberImages = [];
        for (let i = 0; i < 10; i++) {
            this._numberImages.push(ImageManager.loadSystem("Data" + (919 + i)));
        }

        this._textSprite = new Sprite();
        Window_PaladinHorzBar.prototype.initialize.call(this, rect);
        this.addChild(this._textSprite);
    };

    Window_PalShopLabel.prototype.setValue = function (value) {
        if (this._value !== value) {
            this._value = value;
            this.refresh();
        }
    };

    Window_PalShopLabel.prototype.refresh = function () {
        if (this._numberImages.some(img => !img.isReady())) {
            this._numberImages.forEach(img => {
                if (!img.isReady() && !this._listeningImages.has(img)) {
                    img.addLoadListener(this._refreshListener);
                    this._listeningImages.add(img);
                }
            });
            return;
        }
        Window_PaladinHorzBar.prototype.refresh.call(this);
    };

    Window_PalShopLabel.prototype.drawContents = function () {
        const width = this.width;
        const height = this.height;

        if (!this._textSprite.bitmap || this._textSprite.bitmap.width !== width || this._textSprite.bitmap.height !== height) {
            this._textSprite.bitmap = new Bitmap(width, height);
        }
        const bitmap = this._textSprite.bitmap;
        bitmap.clear();

        bitmap.fontFace = $gameSystem.mainFontFace();
        bitmap.fontSize = 42; // slightly larger for visibility
        bitmap.textColor = "#000000";
        bitmap.outlineWidth = 0;

        bitmap.drawText(this._labelText, 30, 0, 100, height, "left");

        const valStr = this._value.toString();
        let totalWidth = 0;
        const spacing = 1;
        const scale = 3;

        for (let i = 0; i < valStr.length; i++) {
            const digit = parseInt(valStr[i]);
            const img = this._numberImages[digit];
            totalWidth += (img.width * scale) + spacing;
        }

        let currentX = width - totalWidth - 30;
        if (this._numberImages[0]) {
            const imgH = this._numberImages[0].height * scale;
            const numY = (height - imgH) / 2;

            for (let i = 0; i < valStr.length; i++) {
                const digit = parseInt(valStr[i]);
                const img = this._numberImages[digit];
                bitmap.blt(img, 0, 0, img.width, img.height, currentX, numY, img.width * scale, img.height * scale);
                currentX += (img.width * scale) + spacing;
            }
        }
    };

    Window_PalShopLabel.prototype.drawItem = function (index) { };

    //-----------------------------------------------------------------------------
    // Window_PalShopBuyList
    // Inherits from Window_Selectable but draws 9-slice background manually
    //-----------------------------------------------------------------------------
    function Window_PalShopBuyList() {
        this.initialize(...arguments);
    }
    Window_PalShopBuyList.prototype = Object.create(Window_Selectable.prototype);
    Window_PalShopBuyList.prototype.constructor = Window_PalShopBuyList;

    Window_PalShopBuyList.prototype.initialize = function (rect) {
        this._shopGoods = [];
        this._data = [];
        this._price = [];

        this._bgTiles = [];
        this._bgTiles.push(ImageManager.loadSystem("Data99"));   // TL
        this._bgTiles.push(ImageManager.loadSystem("Data910"));  // T
        this._bgTiles.push(ImageManager.loadSystem("Data911"));  // TR
        this._bgTiles.push(ImageManager.loadSystem("Data912"));  // L
        this._bgTiles.push(ImageManager.loadSystem("Data913"));  // C
        this._bgTiles.push(ImageManager.loadSystem("Data914"));  // R
        this._bgTiles.push(ImageManager.loadSystem("Data915"));  // BL
        this._bgTiles.push(ImageManager.loadSystem("Data916"));  // B
        this._bgTiles.push(ImageManager.loadSystem("Data917"));  // BR

        this._digitImages = [];
        for (let i = 0; i < 10; i++) {
            this._digitImages.push(ImageManager.loadSystem("Data" + (956 + i)));
        }

        this._refreshListener = this._drawCustomBackground.bind(this);
        this._listeningImages = new Set();
        this._bgSprite = new Sprite();

        Window_Selectable.prototype.initialize.call(this, rect);

        this.opacity = 255;
        this.backOpacity = 0;
        this.frameVisible = false;

        const container = this._container || this;
        container.addChildAt(this._bgSprite, 0);

        this._drawCustomBackground();
    };

    Window_PalShopBuyList.prototype.setupGoods = function (goods) {
        this._shopGoods = goods;
        this._data = [];
        this._price = [];
        for (const goodsInfo of this._shopGoods) {
            const item = this.goodsToItem(goodsInfo);
            if (item) {
                this._data.push(item);
                this._price.push(goodsInfo[2] === 0 ? item.price : goodsInfo[3]);
            }
        }
        this.refresh();
        this.select(0);
    };

    Window_PalShopBuyList.prototype.goodsToItem = function (goods) {
        switch (goods[0]) {
            case 0: return $dataItems[goods[1]];
            case 1: return $dataWeapons[goods[1]];
            case 2: return $dataArmors[goods[1]];
            default: return null;
        }
    };

    Window_PalShopBuyList.prototype.item = function () {
        return this._data[this.index()];
    };

    Window_PalShopBuyList.prototype.price = function (item) {
        const index = this._data.indexOf(item);
        return index >= 0 ? this._price[index] : 0;
    };

    Window_PalShopBuyList.prototype.maxItems = function () {
        return this._data ? this._data.length : 1;
    };

    Window_PalShopBuyList.prototype.maxCols = function () {
        return 1;
    };

    Window_PalShopBuyList.prototype.numVisibleRows = function () {
        return 9;
    };

    Window_PalShopBuyList.prototype.itemHeight = function () {
        return 48; // enough space for breathing text
    };

    Window_PalShopBuyList.prototype.lineHeight = function () {
        return 42;
    };

    // Override background rect mapping logic if needed
    Window_PalShopBuyList.prototype._updateClientArea = function () {
        const pad = this.padding;
        this._clientArea.move(pad, pad + 25, this.innerWidth, this.innerHeight);
    };

    Window_PalShopBuyList.prototype._drawCustomBackground = function () {
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

        const tlW = imgs[0].width * scale; const tlH = imgs[0].height * scale;
        const trW = imgs[2].width * scale; const trH = imgs[2].height * scale;
        const blH = imgs[6].height * scale; const blW = imgs[6].width * scale;
        const brW = imgs[8].width * scale; const brH = imgs[8].height * scale;
        const rW = imgs[5].width * scale; const lW = imgs[3].width * scale;
        const tH = imgs[1].height * scale; const bH = imgs[7].height * scale;

        const marginLeft = Math.max(tlW, lW, blW);
        const marginRight = Math.max(trW, rW, brW);
        const marginTop = Math.max(tlH, tH, trH);
        const marginBottom = Math.max(blH, bH, brH);

        this._tileThreeTimes(bitmap, imgs[4], marginLeft, marginTop, w - marginLeft - marginRight, h - marginTop - marginBottom);
        this._tileThreeTimes(bitmap, imgs[1], marginLeft, 0, w - marginLeft - marginRight, tH); // Top
        this._tileThreeTimes(bitmap, imgs[7], marginLeft, h - bH, w - marginLeft - marginRight, bH); // Bottom
        this._tileThreeTimes(bitmap, imgs[3], 0, marginTop, lW, h - marginTop - marginBottom); // Left
        this._tileThreeTimes(bitmap, imgs[5], w - rW, marginTop, rW, h - marginTop - marginBottom); // Right
        this._tileThreeTimes(bitmap, imgs[0], 0, 0, tlW, tlH);
        this._tileThreeTimes(bitmap, imgs[2], w - trW, 0, trW, trH);
        this._tileThreeTimes(bitmap, imgs[6], 0, h - blH, blW, blH);
        this._tileThreeTimes(bitmap, imgs[8], w - brW, h - brH, brW, brH);
    };

    Window_PalShopBuyList.prototype._tileThreeTimes = function (bitmap, source, dx, dy, dw, dh) {
        if (dw <= 0 || dh <= 0) return;
        const scale = 3;
        const tileW = source.width * scale;
        const tileH = source.height * scale;

        for (let y = 0; y < dh; y += tileH) {
            for (let x = 0; x < dw; x += tileW) {
                const drawW = Math.min(tileW, dw - x);
                const drawH = Math.min(tileH, dh - y);
                bitmap.blt(source, 0, 0, drawW / scale, drawH / scale, dx + x, dy + y, drawW, drawH);
            }
        }
    };

    Window_PalShopBuyList.prototype.drawItemBackground = function (index) { };

    Window_PalShopBuyList.prototype.isEnabled = function (item) {
        return item && this.price(item) <= $gameParty.gold() && !$gameParty.hasMaxItems(item);
    };

    Window_PalShopBuyList.prototype.isCurrentItemEnabled = function () {
        return this.isEnabled(this.item());
    };

    Window_PalShopBuyList.prototype.drawItem = function (index) {
        const item = this._data[index];
        if (!item) return;

        const rect = this.itemLineRect(index);
        this.contents.clearRect(rect.x, rect.y, rect.width, rect.height);

        const isEnabled = this.isEnabled(item);
        const isSelected = (index === this.index());

        this.contents.outlineWidth = 0;

        let textColor = '#ffffff'; // White default
        if (!isEnabled && !isSelected) textColor = '#CF6A5A'; // Disabled
        if (!isEnabled && isSelected) textColor = '#FCAC9C'; // Disabled Selected
        if (isEnabled && isSelected) {
            let colorIndex = 0;
            if (this.active) {
                colorIndex = Math.floor(Date.now() / 150) % selectedColors.length;
            }
            textColor = selectedColors[colorIndex];
        }

        const textMargin = 50; // FIX BUG 3: Margin for text
        const textX = rect.x + textMargin;

        // Draw Name Shadow
        this.contents.textColor = '#000000';
        this.contents.fontSize = 42;
        this.contents.drawText(item.name, textX + 2, rect.y + 2, rect.width - textMargin, this.lineHeight());

        // Draw Name
        this.contents.textColor = textColor;
        this.contents.drawText(item.name, textX, rect.y, rect.width - textMargin, this.lineHeight());

        // Draw Price
        const price = this.price(item);
        this.drawPriceDigits(price, rect.x, rect.y, rect.width, rect.height);
    };

    Window_PalShopBuyList.prototype.drawPriceDigits = function (price, x, y, width, height) {
        if (this._digitImages.some(img => !img.isReady())) {
            this._digitImages.forEach(img => {
                if (!img.isReady() && !this._listeningImages.has(img)) {
                    img.addLoadListener(() => this.refresh());
                    this._listeningImages.add(img);
                }
            });
            return;
        }

        const pStr = price.toString();
        const scale = 3;
        const spacing = 1;

        let totalW = 0;
        for (let i = 0; i < pStr.length; i++) {
            const img = this._digitImages[parseInt(pStr[i])];
            totalW += img.width * scale + spacing;
        }

        const textMargin = 50; // FIX BUG 3: Margin for price
        let curX = x + width - totalW - textMargin; // Right align with margin
        const imgH = this._digitImages[0].height * scale;
        const numY = y + (height - imgH) / 2;

        for (let i = 0; i < pStr.length; i++) {
            const digit = parseInt(pStr[i]);
            const img = this._digitImages[digit];
            this.contents.blt(img, 0, 0, img.width, img.height, curX, numY, img.width * scale, img.height * scale);
            curX += img.width * scale + spacing;
        }
    };

    Window_PalShopBuyList.prototype.update = function () {
        Window_Selectable.prototype.update.call(this);
        if (this.visible && this.active && this.isOpen()) {
            if (this.index() >= 0) {
                this.redrawItem(this.index());
            }
        }
    };

    Window_PalShopBuyList.prototype.select = function (index) {
        const lastIndex = this.index();
        Window_Selectable.prototype.select.call(this, index);
        if (lastIndex >= 0 && lastIndex !== this.index()) {
            this.redrawItem(lastIndex);
        }
        if (this.index() >= 0) {
            this.redrawItem(this.index());
        }
        this.callUpdateHelp();
    };

    Window_PalShopBuyList.prototype.updateHelp = function () {
        this.setHelpWindowItem(this.item());
    };


    //-----------------------------------------------------------------------------
    // Window_PalShopSellList
    // Inherits from Window_PaladinItemList
    //-----------------------------------------------------------------------------
    // Assumes Window_PaladinItemList is already defined in palItemList.js
    function Window_PalShopSellList() {
        this.initialize(...arguments);
    }
    Window_PalShopSellList.prototype = Object.create(Window_PaladinItemList.prototype);
    Window_PalShopSellList.prototype.constructor = Window_PalShopSellList;

    Window_PalShopSellList.prototype.initialize = function (rect) {
        Window_PaladinItemList.prototype.initialize.call(this, rect);
        this._hideOthersIndex = -1;
        this.refresh();
    };

    Window_PalShopSellList.prototype.setHideOthers = function (index) {
        this._hideOthersIndex = index;
        this.refresh();
    };

    // FIX BUG 7: Explicitly include all inventory items
    Window_PalShopSellList.prototype.includes = function (item) {
        return item !== null;
    };

    Window_PalShopSellList.prototype.makeItemList = function () {
        this._data = $gameParty.allItems().filter(item => this.includes(item));
        if (this.includes(null)) {
            this._data.push(null);
        }
    };

    Window_PalShopSellList.prototype.isEnabled = function (item) {
        return item && item.price > 0; // Sellable if price > 0
    };

    Window_PalShopSellList.prototype.drawItem = function (index) {
        if (this._hideOthersIndex >= 0 && this._hideOthersIndex !== index) {
            // Hide other items if a selection is being confirmed
            return;
        }
        Window_PaladinItemList.prototype.drawItem.call(this, index);
    };

    Window_PalShopSellList.prototype.updateHelp = function () {
        this.setHelpWindowItem(this.item());
    };


    //-----------------------------------------------------------------------------
    // Window_PalShopConfirm
    // Inherits from Window_PaladinGameEnd
    //-----------------------------------------------------------------------------
    function Window_PalShopConfirm() {
        this.initialize(...arguments);
    }
    // Revert to Window_PaladinGameEnd to keep separated buttons
    Window_PalShopConfirm.prototype = Object.create(Window_PaladinGameEnd.prototype);
    Window_PalShopConfirm.prototype.constructor = Window_PalShopConfirm;

    //-----------------------------------------------------------------------------
    // Scene_Shop Override
    //-----------------------------------------------------------------------------
    const _Scene_Shop_create = Scene_Shop.prototype.create;
    Scene_Shop.prototype.create = function () {
        Scene_MenuBase.prototype.create.call(this);
        // The prepare method sets this._goods and this._purchaseOnly.
        if (this._purchaseOnly) {
            this.createBuyInterface();
        } else {
            this.createSellInterface();
        }
    };

    // Override to skip the default shop background logic from Scene_Shop
    Scene_Shop.prototype.createBackground = function () {
        this._backgroundSprite = new Sprite();
        this._backgroundSprite.bitmap = SceneManager.backgroundBitmap();
        this.addChild(this._backgroundSprite);
    };

    Scene_Shop.prototype.needsCancelButton = function () {
        return false; // Disable touch back button
    };

    //=============================================================================
    // BUY INTERFACE
    //=============================================================================
    Scene_Shop.prototype.createBuyInterface = function () {
        // We will layout based on Graphics.boxWidth / Graphics.boxHeight
        const paddingLeft = 32;
        const paddingTop = 32;

        // 1. Buy List (Right side)
        // Background uses Data99 which scales to around 20*3 = 60px borders
        const listWidth = 540; // FIX BUG 3: Width 644
        const listHeight = 540;
        const listX = Graphics.boxWidth - listWidth - paddingLeft;
        const listY = paddingTop;
        const buyRect = new Rectangle(listX, listY, listWidth, listHeight);
        this._palShopBuyList = new Window_PalShopBuyList(buyRect);
        this._palShopBuyList.setupGoods(this._goods);
        this._palShopBuyList.setHandler('ok', this.onBuyOk.bind(this));
        this._palShopBuyList.setHandler('cancel', this.popScene.bind(this));
        this.addWindow(this._palShopBuyList);

        // 2. Icon Bg (Left side top)
        // Data970 is about 54x54, scaled by 3 is 162x162, make window slightly larger to avoid clip
        const iconRect = new Rectangle(paddingLeft, 0, 264, 264);
        this._palShopIcon = new Window_PalShopIcon(iconRect);
        this.addWindow(this._palShopIcon);

        // 3. Labels (Left side bottom)
        const labelW = 288;
        const labelH = 102;
        const labelY2 = listHeight - labelH;
        const labelY1 = labelY2 - labelH - 12; // 12px gap

        const labelRectPossess = new Rectangle(paddingLeft, labelY1, labelW, labelH);
        this._palShopPossessLabel = new Window_PalShopLabel(labelRectPossess, "现有");
        this.addWindow(this._palShopPossessLabel);

        const labelRectGold = new Rectangle(paddingLeft, labelY2, labelW, labelH);
        this._palShopGoldLabel = new Window_PalShopLabel(labelRectGold, "金钱");
        this.addWindow(this._palShopGoldLabel);

        // 4. Confirm Dialog
        const confRect = new Rectangle(listX + 60, listY + 200, 256, 102); // Overlay the list
        this._palShopConfirm = new Window_PalShopConfirm(confRect);
        this._palShopConfirm.setHandler('ok', this.onBuyConfirmOk.bind(this));
        this._palShopConfirm.setHandler('cancel', this.onBuyConfirmCancel.bind(this));
        this._palShopConfirm.hide();
        this._palShopConfirm.deactivate();
        // Add as scene child (not in WindowLayer) to avoid stencil clipping the gap
        this.addChild(this._palShopConfirm);

        // Link updates
        this._palShopBuyList.setHelpWindow(this); // Custom hook to update labels
        this._palShopBuyList.activate();
        this._palShopBuyList.select(0);
        this.updateBuyLabels();
    };

    Scene_Shop.prototype.setHelpWindowItem = function (item) {
        if (this._palShopIcon) this._palShopIcon.setItem(item);
        if (this._purchaseOnly) {
            this.updateBuyLabels();
        } else {
            this.updateSellLabels();
        }
    };

    Scene_Shop.prototype.setItem = function (item) {
        this.setHelpWindowItem(item);
    };

    Scene_Shop.prototype.updateBuyLabels = function () {
        if (!this._palShopPossessLabel) return;
        const item = this._palShopBuyList.item();
        const num = item ? $gameParty.numItems(item) : 0;
        this._palShopPossessLabel.setValue(num);
        this._palShopGoldLabel.setValue($gameParty.gold());
    };

    Scene_Shop.prototype.onBuyOk = function () {
        const item = this._palShopBuyList.item();
        if (item) {
            SoundManager.playOk();
            this._palShopBuyList.deactivate();
            this._palShopBuyList.refresh(); // Stop breathing
            this._palShopConfirm.show();
            this._palShopConfirm.activate();
            this._palShopConfirm.select(1); // Default to '是'
        }
    };

    Scene_Shop.prototype.onBuyConfirmOk = function () {
        const item = this._palShopBuyList.item();
        const price = this._palShopBuyList.price(item);
        if (item && $gameParty.gold() >= price && !$gameParty.hasMaxItems(item)) {
            SoundManager.playShop();
            $gameParty.loseGold(price);
            $gameParty.gainItem(item, 1);
            this.onBuyConfirmCancel(); // Go back to list
            this._palShopBuyList.refresh();
            this.updateBuyLabels();
        } else {
            SoundManager.playBuzzer();
            this.onBuyConfirmCancel();
        }
    };

    Scene_Shop.prototype.onBuyConfirmCancel = function () {
        this._palShopConfirm.hide();
        this._palShopConfirm.deactivate();
        this._palShopBuyList.activate();
    };


    //=============================================================================
    // SELL INTERFACE
    //=============================================================================
    Scene_Shop.prototype.createSellInterface = function () {
        const paddingLeft = 10;
        const listHeight = 440; // Approx 7 rows
        const bottomY = listHeight - 20;

        // 1. Sell List (Top spanning full width)
        const listRect = new Rectangle(paddingLeft, 10, Graphics.boxWidth - 20, listHeight);
        this._palShopSellList = new Window_PalShopSellList(listRect);
        this._palShopSellList.setHelpWindow(this);
        this._palShopSellList.setHandler('ok', this.onSellOk.bind(this));
        this._palShopSellList.setHandler('cancel', this.popScene.bind(this));
        this.addWindow(this._palShopSellList);

        // 2. Icon Bg (Left side bottom)
        const iconRect = new Rectangle(paddingLeft, bottomY, 240, 200);
        this._palShopIcon = new Window_PalShopIcon(iconRect);
        this.addChild(this._palShopIcon);

        // 3. Labels (Right side bottom)
        const labelW = 288;
        const labelH = 102;
        const gap = 20;

        // Sell Price label (Rightmost)
        const sellPriceX = Graphics.boxWidth - paddingLeft - labelW;
        const labelRectPrice = new Rectangle(sellPriceX, bottomY + 30, labelW, labelH);
        this._palShopSellPriceLabel = new Window_PalShopLabel(labelRectPrice, "售价");
        this.addWindow(this._palShopSellPriceLabel);

        // Gold label (Left of Sell Price)
        const goldX = sellPriceX - gap - labelW;
        const labelRectGold = new Rectangle(goldX, bottomY + 30, labelW, labelH);
        this._palShopGoldLabel = new Window_PalShopLabel(labelRectGold, "金钱");
        this.addWindow(this._palShopGoldLabel);

        // 4. Confirm Dialog
        // Position it over the list, centered
        const cw = 256;
        const ch = 102;
        const cx = (Graphics.boxWidth - cw) / 2;
        const cy = 200;
        const confRect = new Rectangle(cx, cy, cw, ch);
        this._palShopConfirm = new Window_PalShopConfirm(confRect);
        this._palShopConfirm.setHandler('ok', this.onSellConfirmOk.bind(this));
        this._palShopConfirm.setHandler('cancel', this.onSellConfirmCancel.bind(this));
        this._palShopConfirm.hide();
        this._palShopConfirm.deactivate();
        // Add as scene child (not in WindowLayer) to avoid stencil clipping the gap
        this.addChild(this._palShopConfirm);

        this._palShopSellList.activate();
        this._palShopSellList.select(0);
        this.updateSellLabels();
    };

    Scene_Shop.prototype.updateSellLabels = function () {
        if (!this._palShopSellPriceLabel) return;
        const item = this._palShopSellList.item();
        const sellPrice = item ? Math.floor(item.price / 2) : 0;
        this._palShopGoldLabel.setValue($gameParty.gold());
        this._palShopSellPriceLabel.setValue(sellPrice);
    };

    Scene_Shop.prototype.onSellOk = function () {
        const item = this._palShopSellList.item();
        if (item && item.price > 0) {
            SoundManager.playOk();
            this._palShopSellList.deactivate();
            this._palShopSellList.setHideOthers(this._palShopSellList.index()); // Hide other items
            this._palShopConfirm.show();
            this._palShopConfirm.activate();
            this._palShopConfirm.select(1); // Default '是'
        } else {
            SoundManager.playBuzzer();
        }
    };

    Scene_Shop.prototype.onSellConfirmOk = function () {
        const item = this._palShopSellList.item();
        if (item && item.price > 0 && $gameParty.numItems(item) > 0) {
            SoundManager.playShop();
            $gameParty.loseItem(item, 1);
            $gameParty.gainGold(Math.floor(item.price / 2));
            this.onSellConfirmCancel();
            this._palShopSellList.refresh(); // Update list after selling
            this.updateSellLabels();
        } else {
            SoundManager.playBuzzer();
            this.onSellConfirmCancel();
        }
    };

    Scene_Shop.prototype.onSellConfirmCancel = function () {
        this._palShopConfirm.hide();
        this._palShopConfirm.deactivate();
        this._palShopSellList.setHideOthers(-1); // Show all items again
        this._palShopSellList.activate();
    };

})();
