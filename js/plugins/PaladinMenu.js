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
    // Colors for breathing effect (Gold/Yellow gradient)
    const selectedColors = [
        '#d6ad4e', '#d9b45a', '#e0c066', '#e7cc72', '#edda7e',
        '#f3e472', '#edda7e', '#e7cc72', '#e0c066', '#d9b45a'
    ];

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
        const wh = 240;
        const wx = 10;
        const wy = 100;
        return new Rectangle(wx, wy, ww, wh);
    };

    //-----------------------------------------------------------------------------
    // Window_PaladinGold
    //-----------------------------------------------------------------------------
    function Window_PaladinGold() {
        this.initialize(...arguments);
    }

    Window_PaladinGold.prototype = Object.create(Window_Gold.prototype);
    Window_PaladinGold.prototype.constructor = Window_PaladinGold;

    Window_PaladinGold.prototype.initialize = function (rect) {
        this._backgroundImage = ImageManager.loadSystem("moneyUI");
        this._numberImages = [];
        for (let i = 0; i < 10; i++) {
            this._numberImages.push(ImageManager.loadSystem("Data" + (919 + i)));
        }
        Window_Gold.prototype.initialize.call(this, rect);
        this.opacity = 255;
        this.contentsOpacity = 255;
        this.backOpacity = 0;
        this.frameVisible = false;
    };

    Window_PaladinGold.prototype.refresh = function () {
        const rect = this.itemLineRect(0);
        const x = rect.x;
        const y = rect.y;
        const width = rect.width;

        this.contents.clear();

        // Check if all images are ready
        let retry = false;
        if (!this._backgroundImage.isReady()) {
            this._backgroundImage.addLoadListener(this.refresh.bind(this));
            retry = true;
        }
        this._numberImages.forEach(img => {
            if (!img.isReady()) {
                img.addLoadListener(this.refresh.bind(this));
                retry = true;
            }
        });
        if (retry) return;

        // Draw Background
        const originalSmooth = this.contents.smooth;
        this.contents.smooth = false;
        this.contents.blt(this._backgroundImage, 0, 0, this._backgroundImage.width, this._backgroundImage.height, 0, 0, this.innerWidth, this.innerHeight);

        // Draw "金钱" Label (Black)
        this.contents.fontSize = 32;
        this.contents.textColor = "#000000";
        this.contents.outlineWidth = 0;
        this.contents.drawText("金钱", x + 30, 0, 100, this.innerHeight, "left");

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
        const numY = (this.innerHeight - (this._numberImages[0].height * 2)) / 2;

        for (let i = 0; i < goldString.length; i++) {
            const digit = parseInt(goldString[i]);
            const img = this._numberImages[digit];
            this.contents.blt(img, 0, 0, img.width, img.height, currentX, numY, img.width * 2, img.height * 2);
            currentX += (img.width * 2) + spacing;
        }

        this.contents.smooth = originalSmooth;
    };

    //-----------------------------------------------------------------------------
    // Window_PaladinCommand
    //-----------------------------------------------------------------------------
    function Window_PaladinCommand() {
        this.initialize(...arguments);
    }

    Window_PaladinCommand.prototype = Object.create(Window_Command.prototype);
    Window_PaladinCommand.prototype.constructor = Window_PaladinCommand;

    Window_PaladinCommand.prototype.initialize = function (rect) {
        this._backgroundImage = ImageManager.loadSystem("systemUI");
        Window_Command.prototype.initialize.call(this, rect);
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
        if (!this._bgSprite && this._container) {
            this._bgSprite = new Sprite();
            this._container.addChildAt(this._bgSprite, 0);
        }

        if (this._backgroundImage.isReady() && this._bgSprite) {
            const targetWidth = this._backgroundImage.width * 3;
            const targetHeight = this._backgroundImage.height * 3;

            if (this.width !== targetWidth || this.height !== targetHeight) {
                this.move(this.x, this.y, targetWidth, targetHeight);
                this.createContents();
            }

            this._bgSprite.bitmap = this._backgroundImage;
            this._bgSprite.scale.x = 3;
            this._bgSprite.scale.y = 3;

            if (this._bgSprite.texture && this._bgSprite.texture.baseTexture) {
                this._bgSprite.texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
            }
        } else {
            this._backgroundImage.addLoadListener(this.refresh.bind(this));
        }

        _Window_PaladinCommand_refresh.call(this);
    };

    Window_PaladinCommand.prototype.itemRect = function (index) {
        const rect = Window_Command.prototype.itemRect.call(this, index);
        // Manual padding (Kept user's change)
        rect.x += -8;
        rect.width -= 20;
        rect.y += 25;
        return rect;
    };

    Window_PaladinCommand.prototype.drawItem = function (index) {
        const rect = this.itemLineRect(index);
        const align = this.itemTextAlign();

        // Clear previous drawing
        this.contents.clearRect(rect.x, rect.y, rect.width, rect.height);

        // Remove outline for standard text
        this.contents.outlineWidth = 0;

        const commandName = this.commandName(index);
        this.changePaintOpacity(this.isCommandEnabled(index));

        // Coloring Logic
        if (index === this.index()) {
            // Breathing Effect
            const colorIndex = Math.floor(Date.now() / 150) % selectedColors.length;
            const color = selectedColors[colorIndex];

            // 1. Draw Shadow (Black)
            this.contents.textColor = '#000000';
            this.contents.drawText(commandName, rect.x + 2, rect.y + 2, rect.width, this.lineHeight(), align);

            // 2. Draw Main Text (Breathing Color)
            this.contents.textColor = color;
            this.contents.drawText(commandName, rect.x, rect.y, rect.width, this.lineHeight(), align);
        } else {
            // Standard Item
            this.changeTextColor(ColorManager.normalColor());
            // Standard outline logic applies here if using drawText from Window_Base, or we can manually draw shadow too if desired.
            // For now, matching standard behavior for unselected.
            // Actually, if we want consistency, we should probably add shadow to unselected too?
            // "Standard" RPG Maker usually has an outline, not a drop shadow.
            // But if selected has drop shadow, maybe unselected should too?
            // User only mentioned "selected option" shadow is missing. Standard logic will likely draw outline.
            // Let's stick to standard for unselected unless requested.
            this.drawText(commandName, rect.x, rect.y, rect.width, align);
        }
    };

    Window_PaladinCommand.prototype.update = function () {
        Window_Command.prototype.update.call(this);
        if (this.visible && this.active) {
            if (this.isOpen()) {
                this.redrawItem(this.index());
            }
        }
    };

})();
