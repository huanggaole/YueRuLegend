/*:
 * @target MZ
 * @plugindesc Chinese Paladin Window Base & Title Command
 * @author AI Assistant
 *
 * @help
 * Implements Window_PaladinBase for shared styling and overrides Window_TitleCommand.
 */

(() => {
    // Shared Colors for breathing effect
    const selectedColors = [
        '#d6ad4e', '#d9b45a', '#e0c066', '#e7cc72', '#edda7e',
        '#f3e472', '#edda7e', '#e7cc72', '#e0c066', '#d9b45a'
    ];

    //-----------------------------------------------------------------------------
    // Window_PaladinBase
    //-----------------------------------------------------------------------------
    function Window_PaladinBase() {
        this.initialize(...arguments);
    }

    Window_PaladinBase.prototype = Object.create(Window_Command.prototype);
    Window_PaladinBase.prototype.constructor = Window_PaladinBase;

    Window_PaladinBase.prototype.initialize = function (rect) {
        Window_Command.prototype.initialize.call(this, rect);
    };

    Window_PaladinBase.prototype.drawItem = function (index) {
        const rect = this.itemLineRect(index);
        const align = this.itemTextAlign();

        // Clear background for the item
        this.contents.clearRect(rect.x, rect.y, rect.width, rect.height);

        this.resetTextColor();
        this.changePaintOpacity(this.isCommandEnabled(index));

        // Remove outline (standard is 3 or 4)
        this.contents.outlineWidth = 0;

        const commandName = this.commandName(index);

        if (index === this.index()) {
            // Selected: Breathing Effect
            let color = selectedColors[0];
            if (this.active) {
                const colorIndex = Math.floor(Date.now() / 150) % selectedColors.length;
                color = selectedColors[colorIndex];
            }

            // 1. Shadow (Black) - Offset +2, +2
            this.contents.textColor = '#000000';
            this.contents.drawText(commandName, rect.x + 2, rect.y + 2, rect.width, this.lineHeight(), align);

            // 2. Main Text
            this.contents.textColor = color;
            this.contents.drawText(commandName, rect.x, rect.y, rect.width, this.lineHeight(), align);
        } else {
            // Unselected: #C4B8AC

            // 1. Shadow (Black) - Offset +2, +2
            this.contents.textColor = '#000000';
            this.contents.drawText(commandName, rect.x + 2, rect.y + 2, rect.width, this.lineHeight(), align);

            // 2. Main Text
            this.contents.textColor = '#C4B8AC';
            this.contents.drawText(commandName, rect.x, rect.y, rect.width, this.lineHeight(), align);
        }
    };

    // Disable the standard selection background rectangle
    Window_PaladinBase.prototype.drawItemBackground = function (index) {
        // Do nothing
    };

    Window_PaladinBase.prototype.update = function () {
        Window_Command.prototype.update.call(this);
        if (this.visible && this.active) {
            if (this.isOpen()) {
                this.redrawItem(this.index());
            }
        }
    };

    // Override select to ensure items are redrawn when cursor moves
    // (RMMZ does not redraw items on select by default, leading to "stuck" colors)
    Window_PaladinBase.prototype.select = function (index) {
        const lastIndex = this.index();
        Window_Command.prototype.select.call(this, index);
        if (lastIndex >= 0 && lastIndex !== this.index()) {
            this.redrawItem(lastIndex); // Redraw old item (revert to unselected)
        }
        if (this.index() >= 0) {
            this.redrawItem(this.index()); // Redraw new item (start breathing)
        }
    };

    // Export for use in other plugins
    window.Window_PaladinBase = Window_PaladinBase;

    //-----------------------------------------------------------------------------
    // Window_TitleCommand Override to share styling
    //-----------------------------------------------------------------------------
    // We patch Window_TitleCommand to use the base methods for drawing and updating

    Window_TitleCommand.prototype.drawItem = Window_PaladinBase.prototype.drawItem;
    Window_TitleCommand.prototype.drawItemBackground = Window_PaladinBase.prototype.drawItemBackground;
    Window_TitleCommand.prototype.update = Window_PaladinBase.prototype.update;
    Window_TitleCommand.prototype.select = Window_PaladinBase.prototype.select;

    // Restore makeCommandList to remove "Options" (and others if any)
    Window_TitleCommand.prototype.makeCommandList = function () {
        const continueEnabled = this.isContinueEnabled();
        this.addCommand(TextManager.newGame, "newGame");
        this.addCommand(TextManager.continue_, "continue", continueEnabled);
    };

    // Override lineHeight to increase spacing
    Window_TitleCommand.prototype.lineHeight = function () {
        return 52;
    };

    //-----------------------------------------------------------------------------
    // Window_PaladinHorzBar
    //-----------------------------------------------------------------------------
    // A base class for windows that use a 3-slice horizontal background (Left, Center, Right)
    // Inherits from Window_PaladinBase (Command) to allow for interactive windows (like GameEnd)
    function Window_PaladinHorzBar() {
        this.initialize(...arguments);
    }

    Window_PaladinHorzBar.prototype = Object.create(Window_PaladinBase.prototype);
    Window_PaladinHorzBar.prototype.constructor = Window_PaladinHorzBar;

    Window_PaladinHorzBar.prototype.initialize = function (rect) {
        console.log("PaladinHorzBar: initialize", rect);

        // 1. Init Data Structures needed by refresh() BEFORE super init
        this._barTiles = [];
        this._barTiles.push(ImageManager.loadSystem("Data944")); // Left
        this._barTiles.push(ImageManager.loadSystem("Data945")); // Center (Tile)
        this._barTiles.push(ImageManager.loadSystem("Data946")); // Right

        this._refreshListener = this.refresh.bind(this);
        this._listeningImages = new Set();

        // Create Background Sprite (detached, so refresh can use it during super init)
        this._bgSprite = new Sprite();

        // 2. Call Super
        Window_PaladinBase.prototype.initialize.call(this, rect);

        this.opacity = 255;
        this.backOpacity = 0;
        this.frameVisible = false;
        this.contentsOpacity = 255;
        this.padding = 0;

        // 3. Add to container
        const container = this._container || this;
        container.addChildAt(this._bgSprite, 0);

        // 4. Force refresh to apply padding 0 correctly
        this.refresh();
    };

    Window_PaladinHorzBar.prototype.refresh = function () {
        // 1. Build Command List (for Game End or other command windows)
        this.clearCommandList();
        this.makeCommandList();

        // 2. Wait for images
        if (this._barTiles.some(img => !img.isReady())) {
            this._barTiles.forEach(img => {
                if (!img.isReady() && !this._listeningImages.has(img)) {
                    img.addLoadListener(this._refreshListener);
                    this._listeningImages.add(img);
                }
            });
            return;
        }

        // 3. Draw Background using _bgSprite
        const width = this.width;
        const height = this.height;

        if (!this._bgSprite.bitmap || this._bgSprite.bitmap.width !== width || this._bgSprite.bitmap.height !== height) {
            this._bgSprite.bitmap = new Bitmap(width, height);
        }

        this.drawBarBackground(this._bgSprite.bitmap);
        this._bgSprite.scale.x = 1;
        this._bgSprite.scale.y = 1;

        this.createContents();
        this.drawContents(); // For manual content (like Gold)
        this.drawAllItems(); // For command items (like Game End)
    };

    Window_PaladinHorzBar.prototype.drawBarBackground = function (bitmap) {
        bitmap.clear();
        const left = this._barTiles[0];
        const center = this._barTiles[1];
        const right = this._barTiles[2];
        const scale = 3;

        const lW = left.width * scale;
        const lH = left.height * scale;
        const cW = center.width * scale;
        const cH = center.height * scale;
        const rW = right.width * scale;
        const rH = right.height * scale;

        const w = bitmap.width;
        // const h = bitmap.height; // Not strictly used for height stretching, assuming fixed height bar or tiling vertically?
        // User said "only one line", so we assume horizontal tiling.
        // We centre vertically if height > tile height? Or just draw at 0.
        // Let's draw at 0,0.

        // Draw Left
        this.drawTileScaled(bitmap, left, 0, 0, lW, lH);

        // Draw Right
        this.drawTileScaled(bitmap, right, w - rW, 0, rW, rH);

        // Draw Center (Tiled)
        // Fill from lW to w - rW
        const fillW = w - lW - rW;
        if (fillW > 0) {
            this.tileThriceHorz(bitmap, center, lW, 0, fillW, cH);
        }
    };

    Window_PaladinHorzBar.prototype.drawTileScaled = function (bitmap, source, dx, dy, dw, dh) {
        bitmap.blt(source, 0, 0, source.width, source.height, dx, dy, dw, dh);
    };

    Window_PaladinHorzBar.prototype.tileThriceHorz = function (bitmap, source, dx, dy, dw, dh) {
        const scale = 3;
        const tileW = source.width * scale;
        // Tile horizontally
        for (let x = 0; x < dw; x += tileW) {
            const drawW = Math.min(tileW, dw - x);
            // Source clipping
            const sw = drawW / scale;
            bitmap.blt(source, 0, 0, sw, source.height, dx + x, dy, drawW, dh);
        }
    };

    // Stub for subclasses
    Window_PaladinHorzBar.prototype.drawContents = function () {
    };

    // Export
    window.Window_PaladinHorzBar = Window_PaladinHorzBar;

    //-----------------------------------------------------------------------------
    // Window_PaladinMenuBase
    //-----------------------------------------------------------------------------
    // Type B: System Menu Window (9-Slice Background)
    // Used for: Main Menu, System Options
    function Window_PaladinMenuBase() {
        this.initialize(...arguments);
    }

    Window_PaladinMenuBase.prototype = Object.create(Window_PaladinBase.prototype);
    Window_PaladinMenuBase.prototype.constructor = Window_PaladinMenuBase;

    Window_PaladinMenuBase.prototype.initialize = function (rect) {
        // 1. Init Data Structures needed by refresh() BEFORE super init
        // Load 9-slice tiles
        this._bgTiles = [];
        for (let i = 0; i < 9; i++) {
            this._bgTiles.push(ImageManager.loadSystem("Data" + (90 + i)));
        }

        // Init Listener Tracking (Anti-Freeze)
        this._refreshListener = this.refresh.bind(this);
        this._listeningImages = new Set();

        // Create Sprite detached
        this._bgSprite = new Sprite();

        // 2. Super Init
        Window_PaladinBase.prototype.initialize.call(this, rect);

        this.opacity = 255;
        this.backOpacity = 0;
        this.frameVisible = false;
        this.contentsOpacity = 255;
        this.padding = 0;

        // 3. Add to container
        const container = this._container || this;
        container.addChildAt(this._bgSprite, 0);

        // 4. Force refresh to apply padding 0 correctly to contents size
        // (Fixes "Shifted Text" bug on second open when images are cached)
        this.refresh();
    };

    Window_PaladinMenuBase.prototype.refresh = function () {
        // 1. Ensure command list allows 'activate' to work without crash
        this.clearCommandList();
        this.makeCommandList();

        // 2. Check Images with Deduplication
        if (this._bgTiles.some(img => !img.isReady())) {
            this._bgTiles.forEach(img => {
                if (!img.isReady() && !this._listeningImages.has(img)) {
                    img.addLoadListener(this._refreshListener);
                    this._listeningImages.add(img);
                }
            });
            return;
        }

        // 3. Draw Background using _bgSprite
        const width = this.width;
        const height = this.height;
        if (!this._bgSprite.bitmap || this._bgSprite.bitmap.width !== width || this._bgSprite.bitmap.height !== height) {
            this._bgSprite.bitmap = new Bitmap(width, height);
        }
        this.drawMenuBackground(this._bgSprite.bitmap);
        this._bgSprite.scale.x = 1;
        this._bgSprite.scale.y = 1;

        // 4. Draw Items
        Window_PaladinBase.prototype.refresh.call(this);
    };

    Window_PaladinMenuBase.prototype.drawMenuBackground = function (bitmap) {
        bitmap.clear();
        const imgs = this._bgTiles;
        const w = bitmap.width;
        const h = bitmap.height;
        const scale = 3;

        const tl = imgs[0]; const t = imgs[1]; const tr = imgs[2];
        const l = imgs[3]; const c = imgs[4]; const r = imgs[5];
        const bl = imgs[6]; const b = imgs[7]; const br = imgs[8];

        // Scaled Dimensions
        const tlW = 22 * scale; const tlH = 20 * scale;
        const trW = 33 * scale; const trH = 20 * scale;
        const blH = 20 * scale;
        const blW = 22 * scale;
        const brW = 31 * scale; const brH = 20 * scale;
        const rW = 23 * scale;
        const lW = 22 * scale;

        const marginLeft = Math.max(tlW, lW, blW);
        const marginRight = Math.max(trW, rW, brW);

        // 1. Corners
        this.tileThreeTimes(bitmap, tl, 0, 0, tlW, tlH);
        this.tileThreeTimes(bitmap, tr, w - marginRight, 0, trW, trH);
        this.tileThreeTimes(bitmap, bl, 0, h - blH, blW, blH);
        this.tileThreeTimes(bitmap, br, w - marginRight, h - brH, brW, brH);

        // 2. Edges
        this.tileThreeTimes(bitmap, t, marginLeft, 0, w - marginLeft - marginRight, tlH); // Top
        this.tileThreeTimes(bitmap, b, marginLeft, h - blH, w - marginLeft - marginRight, blH); // Bottom
        this.tileThreeTimes(bitmap, l, 0, tlH, marginLeft, h - tlH - blH); // Left
        this.tileThreeTimes(bitmap, r, w - marginRight, trH, rW, h - trH - brH); // Right

        // 3. Center
        this.tileThreeTimes(bitmap, c, marginLeft, tlH, w - marginLeft - marginRight, h - tlH - blH);
    };

    Window_PaladinMenuBase.prototype.tileThreeTimes = function (bitmap, source, dx, dy, dw, dh) {
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

    Window_PaladinMenuBase.prototype.itemRect = function (index) {
        // Custom padding for menu items inside the 9-slice frame
        const rect = Window_PaladinBase.prototype.itemRect.call(this, index);
        rect.x += -8;
        rect.width -= 20;
        rect.y += 36; // Push down to avoid top frame
        return rect;
    };

    window.Window_PaladinMenuBase = Window_PaladinMenuBase;

    //-----------------------------------------------------------------------------
    // Window_PaladinCommand (Main Menu)
    //-----------------------------------------------------------------------------
    function Window_PaladinCommand() {
        this.initialize(...arguments);
    }
    Window_PaladinCommand.prototype = Object.create(Window_PaladinMenuBase.prototype);
    Window_PaladinCommand.prototype.constructor = Window_PaladinCommand;

    Window_PaladinCommand.prototype.makeCommandList = function () {
        this.addCommand("状态", "status");
        this.addCommand("仙术", "skill");
        this.addCommand("物品", "item");
        this.addCommand("系统", "system");
    };

    Window_PaladinCommand.prototype.lineHeight = function () {
        return 48;
    };

    window.Window_PaladinCommand = Window_PaladinCommand;

    //-----------------------------------------------------------------------------
    // Window_PaladinSystem (System Menu)
    //-----------------------------------------------------------------------------
    function Window_PaladinSystem() {
        this.initialize(...arguments);
    }
    Window_PaladinSystem.prototype = Object.create(Window_PaladinMenuBase.prototype);
    Window_PaladinSystem.prototype.constructor = Window_PaladinSystem;

    Window_PaladinSystem.prototype.makeCommandList = function () {
        this.addCommand("储存进度", "save", this.isSaveEnabled());
        this.addCommand("读取进度", "load", true);
        this.addCommand("音乐", "music");
        this.addCommand("音效", "sound");
        this.addCommand("结束游戏", "gameEnd");
    };

    Window_PaladinSystem.prototype.isSaveEnabled = function () {
        return !DataManager.isEventTest() && $gameSystem.isSaveEnabled();
    };

    Window_PaladinSystem.prototype.lineHeight = function () {
        return 48;
    };

    window.Window_PaladinSystem = Window_PaladinSystem;

    //-----------------------------------------------------------------------------
    // Window_PaladinGold
    //-----------------------------------------------------------------------------
    // Type B: Single Line Window (3-Slice Horizontal Bar)
    function Window_PaladinGold() {
        this.initialize(...arguments);
    }
    Window_PaladinGold.prototype = Object.create(Window_PaladinHorzBar.prototype);
    Window_PaladinGold.prototype.constructor = Window_PaladinGold;

    Window_PaladinGold.prototype.initialize = function (rect) {
        // Load number images
        this._numberImages = [];
        for (let i = 0; i < 10; i++) {
            this._numberImages.push(ImageManager.loadSystem("Data" + (919 + i)));
        }

        // Create _textSprite BEFORE super init, because super calls refresh() -> drawContents()
        // which references this._textSprite
        this._textSprite = new Sprite();

        Window_PaladinHorzBar.prototype.initialize.call(this, rect);

        // Add to display list AFTER super init (container is ready now)
        this.addChild(this._textSprite);
    };

    Window_PaladinGold.prototype.value = function () {
        return $gameParty.gold();
    };

    Window_PaladinGold.prototype.open = function () {
        this.refresh();
        Window_PaladinHorzBar.prototype.open.call(this);
    };

    Window_PaladinGold.prototype.refresh = function () {
        // Check Number Images with Deduplication
        if (this._numberImages.some(img => !img.isReady())) {
            this._numberImages.forEach(img => {
                if (!img.isReady() && !this._listeningImages.has(img)) {
                    img.addLoadListener(this._refreshListener);
                    this._listeningImages.add(img);
                }
            });
            return;
        }
        // Base refresh handles bar tiles and calling drawContents
        Window_PaladinHorzBar.prototype.refresh.call(this);
    };

    Window_PaladinGold.prototype.drawContents = function () {
        const width = this.width;
        const height = this.height;

        // Prepare Text Sprite Bitmap
        if (!this._textSprite.bitmap || this._textSprite.bitmap.width !== width || this._textSprite.bitmap.height !== height) {
            this._textSprite.bitmap = new Bitmap(width, height);
        }
        const bitmap = this._textSprite.bitmap;
        bitmap.clear();

        // Label
        bitmap.fontFace = $gameSystem.mainFontFace();
        bitmap.fontSize = $gameSystem.mainFontSize();
        bitmap.textColor = "#000000";
        bitmap.outlineWidth = 0;

        // Draw "Gold" at Y=0 - No clipping because it's a separate sprite
        bitmap.drawText("金钱", 30, 0, 100, height, "left");

        // Numbers
        const goldString = Math.abs(this.value()).toString();
        let totalWidth = 0;
        const spacing = 1;

        // Calc width
        for (let i = 0; i < goldString.length; i++) {
            const digit = parseInt(goldString[i]);
            const img = this._numberImages[digit];
            totalWidth += (img.width * 2) + spacing;
        }

        let currentX = width - totalWidth - 30; // Right aligned with padding
        if (this._numberImages.length > 0 && this._numberImages[0]) {
            const imgH = this._numberImages[0].height * 2;
            const numY = (height - imgH) / 2;

            for (let i = 0; i < goldString.length; i++) {
                const digit = parseInt(goldString[i]);
                const img = this._numberImages[digit];
                // Blt to custom bitmap
                bitmap.blt(img, 0, 0, img.width, img.height, currentX, numY, img.width * 2, img.height * 2);
                currentX += (img.width * 2) + spacing;
            }
        }
    };

    // Override drawItem to do nothing (prevents crash on empty command list)
    Window_PaladinGold.prototype.drawItem = function (index) {
        // Do nothing. This is a display-only window.
    };

    window.Window_PaladinGold = Window_PaladinGold;

    //-----------------------------------------------------------------------------
    // Window_PaladinGameEnd
    //-----------------------------------------------------------------------------
    function Window_PaladinGameEnd() {
        this.initialize(...arguments);
    }
    Window_PaladinGameEnd.prototype = Object.create(Window_PaladinHorzBar.prototype);
    Window_PaladinGameEnd.prototype.constructor = Window_PaladinGameEnd;

    Window_PaladinGameEnd.prototype.makeCommandList = function () {
        this.addCommand("否", "cancel"); // No
        this.addCommand("是", "ok");     // Yes
    };

    Window_PaladinGameEnd.prototype.maxCols = function () {
        return 2;
    };

    Window_PaladinGameEnd.prototype.itemHeight = function () {
        return 102; // Match bar height
    };

    Window_PaladinGameEnd.prototype.lineHeight = function () {
        return 102; // Center text vertically
    };

    // Draw two separate HorzBar segments instead of one full-width bar
    Window_PaladinGameEnd.prototype.drawBarBackground = function (bitmap) {
        bitmap.clear();
        const gap = 48;
        const segW = Math.floor((bitmap.width - gap) / 2);
        const h = bitmap.height;
        // Draw "否" segment (left)
        this._drawSegment(bitmap, 0, 0, segW, h);
        // Draw "是" segment (right)
        this._drawSegment(bitmap, segW + gap, 0, segW, h);
    };

    Window_PaladinGameEnd.prototype._drawSegment = function (bitmap, dx, dy, dw, dh) {
        const left = this._barTiles[0];
        const center = this._barTiles[1];
        const right = this._barTiles[2];

        // Scale based on target height so the bar fills the item height
        const scale = dh / left.height;

        const lW = Math.round(left.width * scale);
        const rW = Math.round(right.width * scale);
        const cH = dh;

        // Clamp: caps must not exceed total width
        const safeLW = Math.min(lW, Math.floor(dw / 2));
        const safeRW = Math.min(rW, dw - safeLW);

        this.drawTileScaled(bitmap, left, dx, dy, safeLW, dh);
        this.drawTileScaled(bitmap, right, dx + dw - safeRW, dy, safeRW, dh);

        const fillW = dw - safeLW - safeRW;
        if (fillW > 0) {
            this.tileThriceHorz(bitmap, center, dx + safeLW, dy, fillW, cH);
        }
    };

    // Align itemRect with the two segments drawn in drawBarBackground
    Window_PaladinGameEnd.prototype.itemRect = function (index) {
        const gap = 48;
        const segW = Math.floor(this.width / 2 - gap / 2);
        const x = index === 0 ? 0 : segW + gap;
        return new Rectangle(x, 0, segW, this.itemHeight());
    };

    Window_PaladinGameEnd.prototype.drawItem = function (index) {
        Window_PaladinBase.prototype.drawItem.call(this, index);
    };

    window.Window_PaladinGameEnd = Window_PaladinGameEnd;

    //-----------------------------------------------------------------------------
    // Window_PaladinToggle  ("关" / "开")
    // Same layout as Window_PaladinGameEnd, just different command labels.
    //-----------------------------------------------------------------------------
    function Window_PaladinToggle() {
        this.initialize(...arguments);
    }
    Window_PaladinToggle.prototype = Object.create(Window_PaladinGameEnd.prototype);
    Window_PaladinToggle.prototype.constructor = Window_PaladinToggle;

    Window_PaladinToggle.prototype.makeCommandList = function () {
        this.addCommand("关", "off"); // Off
        this.addCommand("开", "on");  // On
    };

    window.Window_PaladinToggle = Window_PaladinToggle;

    //-----------------------------------------------------------------------------
    // Window_PaladinSaveSlot
    // Single-row HorzBar window for one save slot.
    // Shows: [label left] [PNG digit number right]
    // Active = gold breathing label; Inactive = grey label.
    //-----------------------------------------------------------------------------
    function Window_PaladinSaveSlot() {
        this.initialize(...arguments);
    }
    Window_PaladinSaveSlot.prototype = Object.create(Window_PaladinHorzBar.prototype);
    Window_PaladinSaveSlot.prototype.constructor = Window_PaladinSaveSlot;

    Window_PaladinSaveSlot.prototype.initialize = function (rect) {
        // Load number images (Data919-928 = digits 0-9, same as gold window)
        this._numberImages = [];
        for (let i = 0; i < 10; i++) {
            this._numberImages.push(ImageManager.loadSystem("Data" + (919 + i)));
        }

        this._slotLabel = "进度一";
        this._saveIndex = 0; // 0 = empty slot

        // Create text sprite BEFORE super (super calls refresh -> drawContents)
        this._textSprite = new Sprite();

        Window_PaladinHorzBar.prototype.initialize.call(this, rect);

        this.addChild(this._textSprite);
    };

    // Called by scene to set display data
    Window_PaladinSaveSlot.prototype.setSlotData = function (label, saveIndex) {
        this._slotLabel = label;
        this._saveIndex = saveIndex;
        if (this.isOpen()) this.refresh();
    };

    // HorzBar refresh checks number images too
    Window_PaladinSaveSlot.prototype.refresh = function () {
        if (this._numberImages && this._numberImages.some(img => !img.isReady())) {
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

    Window_PaladinSaveSlot.prototype.drawContents = function () {
        const w = this.width;
        const h = this.height;

        if (!this._textSprite.bitmap ||
            this._textSprite.bitmap.width !== w ||
            this._textSprite.bitmap.height !== h) {
            this._textSprite.bitmap = new Bitmap(w, h);
        }
        const bitmap = this._textSprite.bitmap;
        bitmap.clear();

        // --- Label (left side) ---
        // Color: gold breathing if active, grey if not
        const selectedColors = [
            '#d6ad4e', '#d9b45a', '#e0c066', '#e7cc72', '#edda7e',
            '#f3e472', '#edda7e', '#e7cc72', '#e0c066', '#d9b45a'
        ];
        let labelColor;
        if (this.active) {
            const ci = Math.floor(Date.now() / 150) % selectedColors.length;
            labelColor = selectedColors[ci];
        } else {
            labelColor = '#C4B8AC';
        }

        bitmap.fontFace = $gameSystem.mainFontFace();
        bitmap.fontSize = $gameSystem.mainFontSize();
        bitmap.outlineWidth = 0;

        // Shadow
        bitmap.textColor = '#000000';
        bitmap.drawText(this._slotLabel, 32, 2, w / 2, h, 'left');
        // Main
        bitmap.textColor = labelColor;
        bitmap.drawText(this._slotLabel, 30, 0, w / 2, h, 'left');

        // --- Save index number (right side, PNG digits) ---
        if (!this._numberImages || !this._numberImages[0] || !this._numberImages[0].isReady()) return;

        const numStr = this._saveIndex.toString();
        const scale = 2;
        const spacing = 1;

        let totalW = 0;
        for (let i = 0; i < numStr.length; i++) {
            const img = this._numberImages[parseInt(numStr[i])];
            totalW += img.width * scale + spacing;
        }

        const imgH = this._numberImages[0].height * scale;
        const numY = Math.floor((h - imgH) / 2);
        let curX = w - totalW - 30;

        for (let i = 0; i < numStr.length; i++) {
            const digit = parseInt(numStr[i]);
            const img = this._numberImages[digit];
            bitmap.blt(img, 0, 0, img.width, img.height,
                curX, numY, img.width * scale, img.height * scale);
            curX += img.width * scale + spacing;
        }
    };

    // Update: redraw contents every frame when active (breathing animation)
    Window_PaladinSaveSlot.prototype.update = function () {
        Window_Base.prototype.update.call(this);
        if (this.visible && this.isOpen()) {
            this.drawContents();
        }
    };

    // No command list needed — display only
    Window_PaladinSaveSlot.prototype.makeCommandList = function () { };
    Window_PaladinSaveSlot.prototype.drawItem = function () { };

    window.Window_PaladinSaveSlot = Window_PaladinSaveSlot;

})();