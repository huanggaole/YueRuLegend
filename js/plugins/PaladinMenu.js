/*:
 * @target MZ
 * @plugindesc Chinese Paladin Style System Menu
 * @author AI Assistant
 *
 * @help
 * This plugin implements a custom system menu capable of mimicking the style
 * of Chinese Paladin (Xianjian Qixia Zhuan).
 *
 * Requirements:
 * - img/system/moneyUI.png
 * - img/system/systemUI.png
 */

(() => {
    // Colors for breathing effect moved to palWindow.js (Window_PaladinBase)

    //-----------------------------------------------------------------------------
    // Scene_Menu Override
    //-----------------------------------------------------------------------------

    // Disable background filter (blur)
    Scene_Menu.prototype.createBackground = function () {
        this._backgroundSprite = new Sprite();
        this._backgroundSprite.bitmap = SceneManager.backgroundBitmap();
        this.addChild(this._backgroundSprite);
        // this.setBackgroundOpacity(192); // Keep some darkness
    };

    // Disable cancel button (touch UI back button)
    Scene_Menu.prototype.needsCancelButton = function () {
        return false;
    };

    // Override create to use custom windows (NO Status Window)
    const _Scene_Menu_create = Scene_Menu.prototype.create;
    Scene_Menu.prototype.create = function () {
        Scene_MenuBase.prototype.create.call(this);
        this.createCommandWindow();
        this.createSystemWindow();
        this.createGoldWindow();
        // this.createStatusWindow(); // EXPLICITLY REMOVED
    };

    // Override start to avoid crash on missing statusWindow
    Scene_Menu.prototype.start = function () {
        Scene_MenuBase.prototype.start.call(this);
        // this._statusWindow.refresh(); // Removed to prevent crash
    };

    // Safe commandPersonal to avoid crash if status window is missing
    Scene_Menu.prototype.commandPersonal = function () {
        console.log("Status Window is missing. Cannot select actor.");
        this._commandWindow.activate();
    };

    // Override createGoldWindow
    Scene_Menu.prototype.createGoldWindow = function () {
        const rect = this.goldWindowRect();
        this._goldWindow = new Window_PaladinGold(rect);
        this.addWindow(this._goldWindow);
    };

    // Override goldWindowRect
    Scene_Menu.prototype.goldWindowRect = function () {
        // Position: Top-Left
        const ww = 288;
        const wh = 102;
        const wx = 0;
        const wy = 0;
        return new Rectangle(wx, wy, ww, wh);
    };

    // Override createCommandWindow
    Scene_Menu.prototype.createCommandWindow = function () {
        const rect = this.commandWindowRect();
        const commandWindow = new Window_PaladinCommand(rect);
        commandWindow.setHandler("status", this.commandPersonal.bind(this));
        commandWindow.setHandler("skill", this.commandPersonal.bind(this));
        commandWindow.setHandler("item", this.commandItem.bind(this));
        commandWindow.setHandler("system", this.commandOptions.bind(this));
        commandWindow.setHandler("cancel", this.popScene.bind(this));
        this.addWindow(commandWindow);
        this._commandWindow = commandWindow;
    };

    // Override commandWindowRect
    Scene_Menu.prototype.commandWindowRect = function () {
        // Position based on user adjustments
        const ww = 200;
        const wh = 288; // Increased by 48 (1 line)
        const wx = 10;
        const wy = 114;
        return new Rectangle(wx, wy, ww, wh);
    };

    // Create System Window
    Scene_Menu.prototype.createSystemWindow = function () {
        const rect = this.systemWindowRect();
        this._systemWindow = new Window_PaladinSystem(rect);
        this._systemWindow.setHandler("save", this.commandSave.bind(this));
        this._systemWindow.setHandler("load", this.commandLoad.bind(this));
        this._systemWindow.setHandler("music", this.commandOptionsSystem.bind(this));
        this._systemWindow.setHandler("sound", this.commandOptionsSystem.bind(this));
        this._systemWindow.setHandler("gameEnd", this.commandGameEnd.bind(this));
        this._systemWindow.setHandler("cancel", this.onSystemCancel.bind(this));
        this._systemWindow.hide();
        this.addWindow(this._systemWindow);
    };

    Scene_Menu.prototype.systemWindowRect = function () {
        const ww = 296;
        const wh = 348; // Increased by 48 (1 line)
        const wx = 120;
        const wy = 186;
        return new Rectangle(wx, wy, ww, wh);
    };

    // Handle "System" command from main menu
    Scene_Menu.prototype.commandOptions = function () {
        this._commandWindow.deactivate();
        this._commandWindow.refresh(); // Refresh to stop breathing effect
        this._systemWindow.refresh();
        this._systemWindow.show();
        this._systemWindow.activate();
    };

    Scene_Menu.prototype.onSystemCancel = function () {
        this._systemWindow.hide();
        this._systemWindow.deactivate();
        this._commandWindow.activate();
        this._commandWindow.refresh(); // Refresh to resume breathing effect
    };

    Scene_Menu.prototype.commandSave = function () {
        SceneManager.push(Scene_Save);
    };

    Scene_Menu.prototype.commandLoad = function () {
        SceneManager.push(Scene_Load);
    };

    Scene_Menu.prototype.commandOptionsSystem = function () {
        SceneManager.push(Scene_Options);
    };

    Scene_Menu.prototype.commandGameEnd = function () {
        SceneManager.push(Scene_GameEnd);
    };

    //-----------------------------------------------------------------------------
    // Window_PaladinGold
    //-----------------------------------------------------------------------------
    //-----------------------------------------------------------------------------
    // Window_PaladinGold
    //-----------------------------------------------------------------------------
    function Window_PaladinGold() {
        this.initialize(...arguments);
    }

    // Inherit from Window_PaladinHorzBar if available, else fallback to Window_Gold (safety)
    // But since we added it to palWindow.js which should be loaded, we assume it's there.
    // If palWindow.js is ordered after, this might fail. 
    // Usually plugins are loaded in order. palWindow.js is likely before or after.
    // To be safe, we should check. But the user has them as separate files.
    // The previous edit to palWindow.js put Window_PaladinHorzBar on window object.

    // We will assume Window_PaladinHorzBar exists.
    Window_PaladinGold.prototype = Object.create(Window_PaladinHorzBar.prototype);
    Window_PaladinGold.prototype.constructor = Window_PaladinGold;

    Window_PaladinGold.prototype.initialize = function (rect) {
        // Remove moneyUI, use bar tiles from base
        // Load number images
        this._numberImages = [];
        for (let i = 0; i < 10; i++) {
            this._numberImages.push(ImageManager.loadSystem("Data" + (919 + i)));
        }

        Window_PaladinHorzBar.prototype.initialize.call(this, rect);
        this.refresh();
    };

    Window_PaladinGold.prototype.value = function () {
        return $gameParty.gold();
    };

    Window_PaladinGold.prototype.open = function () {
        this.refresh();
        Window_PaladinHorzBar.prototype.open.call(this);
    };

    Window_PaladinGold.prototype.refresh = function () {
        // Wait for number images
        if (this._numberImages.some(img => !img.isReady())) {
            this._numberImages.forEach(img => {
                if (!img.isReady()) {
                    img.addLoadListener(this.refresh.bind(this));
                }
            });
            return;
        }
        // Base refresh handles bar tiles and calling drawContents
        Window_PaladinHorzBar.prototype.refresh.call(this);
    };

    Window_PaladinGold.prototype.drawContents = function () {
        const width = this.innerWidth;
        const height = this.innerHeight;

        // Draw "金钱" Label (Black)
        // Position: x=30? Previous code was x + 30.
        // Let's use specific coordinates to match previous look.
        this.contents.fontSize = 32;
        this.contents.textColor = "#000000";
        this.contents.outlineWidth = 0;
        this.contents.drawText("金钱", 30, 0, 100, height, "left");

        // Draw Gold Number using Images
        const goldString = Math.abs(this.value()).toString();
        let totalWidth = 0;
        const spacing = 1;

        // Calculate total width first to right align
        for (let i = 0; i < goldString.length; i++) {
            const digit = parseInt(goldString[i]);
            const img = this._numberImages[digit];
            totalWidth += (img.width * 2) + spacing;
        }

        let currentX = width - totalWidth - 30; // 30px padding from right
        // Vertically center numbers?
        // Previous: (this.innerHeight - (img.height * 2)) / 2
        // Assuming all number images have same height
        if (this._numberImages.length > 0 && this._numberImages[0]) {
            const imgH = this._numberImages[0].height * 2;
            const numY = (height - imgH) / 2;

            for (let i = 0; i < goldString.length; i++) {
                const digit = parseInt(goldString[i]);
                const img = this._numberImages[digit];
                this.contents.blt(img, 0, 0, img.width, img.height, currentX, numY, img.width * 2, img.height * 2);
                currentX += (img.width * 2) + spacing;
            }
        }
    };

    //-----------------------------------------------------------------------------
    // Window_PaladinCommand
    //-----------------------------------------------------------------------------
    function Window_PaladinCommand() {
        this.initialize(...arguments);
    }

    // Now inherits from Window_PaladinBase (defined in palWindow.js)
    if (typeof Window_PaladinBase !== 'undefined') {
        Window_PaladinCommand.prototype = Object.create(Window_PaladinBase.prototype);
    } else {
        // Fallback if palWindow.js is missing or loaded after
        console.warn("Window_PaladinBase not found. Fallback to Window_Command.");
        Window_PaladinCommand.prototype = Object.create(Window_Command.prototype);
    }
    Window_PaladinCommand.prototype.constructor = Window_PaladinCommand;

    Window_PaladinCommand.prototype.initialize = function (rect) {
        // Load 9-slice tiles (Data90 - Data98)
        this._bgTiles = [];
        for (let i = 0; i < 9; i++) {
            this._bgTiles.push(ImageManager.loadSystem("Data" + (90 + i)));
        }

        // Call super initialize
        if (typeof Window_PaladinBase !== 'undefined') {
            Window_PaladinBase.prototype.initialize.call(this, rect);
        } else {
            Window_Command.prototype.initialize.call(this, rect);
        }

        this.padding = 0;
        this.opacity = 255;
        this.backOpacity = 0;
        this.frameVisible = false;
        this.contentsOpacity = 255;

        // Ensure bgSprite is created
        if (!this._bgSprite) {
            this._bgSprite = new Sprite();
            this._container.addChildAt(this._bgSprite, 0);
        }

        // Force refresh to ensure padding change is applied to contents size and layout
        // (Fixes "Shifted Text" bug on second open)
        this.refresh();
    };

    Window_PaladinCommand.prototype.makeCommandList = function () {
        this.addCommand("状态", "status");
        this.addCommand("仙术", "skill");
        this.addCommand("物品", "item");
        this.addCommand("系统", "system");
    };

    Window_PaladinCommand.prototype.lineHeight = function () {
        return 48; // Kept user's change
    };

    const _Window_PaladinCommand_refresh = Window_PaladinCommand.prototype.refresh;
    Window_PaladinCommand.prototype.refresh = function () {
        // Safe check for bgSprite
        if (!this._bgSprite) {
            this._bgSprite = new Sprite();
            this._container.addChildAt(this._bgSprite, 0);
        }

        // Check if all tiles are ready
        const allReady = this._bgTiles.every(img => img.isReady());
        // console.log("PaladinMenu: refresh. All tiles ready?", allReady, "bgSprite exists?", !!this._bgSprite);

        if (allReady && this._bgSprite) {
            const width = this.width;
            const height = this.height;

            if (!this._bgSprite.bitmap || this._bgSprite.bitmap.width !== width || this._bgSprite.bitmap.height !== height) {
                this._bgSprite.bitmap = new Bitmap(width, height);
            }

            // Draw 9-slice background
            // console.log("PaladinMenu: Drawing background. Size:", width, height);
            this.drawPaladinBackground(this._bgSprite.bitmap);

            // Reset scale (we are drawing 3x scaled already)
            this._bgSprite.scale.x = 1;
            this._bgSprite.scale.y = 1;

            this.createContents();
        } else {
            // Only add listener to images that are NOT ready to avoid immediate callback recursion
            this._bgTiles.forEach(img => {
                if (!img.isReady()) {
                    img.addLoadListener(this.refresh.bind(this));
                }
            });
        }

        _Window_PaladinCommand_refresh.call(this);
    };

    Window_PaladinCommand.prototype.drawPaladinBackground = function (bitmap) {
        bitmap.clear();
        const imgs = this._bgTiles;
        const w = bitmap.width;
        const h = bitmap.height;
        const scale = 3;

        // Tile Dimensions (Raw)
        // 90: TL 22x20
        // 91: T  16x20
        // 92: TR 33x20
        // 93: L  22x18
        // 94: C  16x18
        // 95: R  23x18
        // 96: BL 22x20
        // 97: B  16x20
        // 98: BR 31x20

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

        // Calculate consistent margins based on widest elements to maintain vertical alignment columns
        const marginLeft = Math.max(tlW, lW, blW);
        const marginRight = Math.max(trW, rW, brW);

        // 1. Corners
        this.tileThreeTimes(bitmap, tl, 0, 0, tlW, tlH, "TL");
        this.tileThreeTimes(bitmap, tr, w - marginRight, 0, trW, trH, "TR");
        this.tileThreeTimes(bitmap, bl, 0, h - blH, blW, blH, "BL");
        this.tileThreeTimes(bitmap, br, w - marginRight, h - brH, brW, brH, "BR");

        // 2. Edges
        // Top connects TL and TR
        this.tileThreeTimes(bitmap, t, marginLeft, 0, w - marginLeft - marginRight, tlH, "Top");

        // Bottom connects BL and BR
        this.tileThreeTimes(bitmap, b, marginLeft, h - blH, w - marginLeft - marginRight, blH, "Bottom");

        // Left Edge
        this.tileThreeTimes(bitmap, l, 0, tlH, marginLeft, h - tlH - blH, "Left");

        // Right Edge
        // Align to the seam (w - marginRight). Draw ONLY its natural width (rW).
        // This leaves the rest of the space (marginRight - rW) transparent.
        this.tileThreeTimes(bitmap, r, w - marginRight, trH, rW, h - trH - brH, "Right");

        // 3. Center
        this.tileThreeTimes(bitmap, c, marginLeft, tlH, w - marginLeft - marginRight, h - tlH - blH, "Center");
    };

    Window_PaladinCommand.prototype.tileThreeTimes = function (bitmap, source, dx, dy, dw, dh) {
        if (dw <= 0 || dh <= 0) return;

        const scale = 3;
        const tileW = source.width * scale;
        const tileH = source.height * scale;

        // Loop to fill destination rect
        for (let y = 0; y < dh; y += tileH) {
            for (let x = 0; x < dw; x += tileW) {
                const drawW = Math.min(tileW, dw - x);
                const drawH = Math.min(tileH, dh - y);

                // Source clipping (handling partial tiles)
                const sw = drawW / scale;
                const sh = drawH / scale;

                bitmap.blt(source, 0, 0, sw, sh, dx + x, dy + y, drawW, drawH);
            }
        }
    };

    Window_PaladinCommand.prototype.itemRect = function (index) {
        // Use super call (which might be Window_PaladinBase or Window_Command)
        let rect;
        if (typeof Window_PaladinBase !== 'undefined') {
            rect = Window_PaladinBase.prototype.itemRect.call(this, index);
        } else {
            rect = Window_Command.prototype.itemRect.call(this, index);
        }

        // Manual padding
        rect.x += -8;
        rect.width -= 20;
        rect.y += 36;
        return rect;
    };

    // Removed drawItem and update (inherited from Window_PaladinBase)


    //-----------------------------------------------------------------------------
    // Window_PaladinSystem
    //-----------------------------------------------------------------------------
    function Window_PaladinSystem() {
        this.initialize(...arguments);
    }

    Window_PaladinSystem.prototype = Object.create(Window_PaladinCommand.prototype);
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

})();
