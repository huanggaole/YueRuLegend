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
    function Window_PaladinHorzBar() {
        this.initialize(...arguments);
    }

    Window_PaladinHorzBar.prototype = Object.create(Window_Base.prototype);
    Window_PaladinHorzBar.prototype.constructor = Window_PaladinHorzBar;

    Window_PaladinHorzBar.prototype.initialize = function (rect) {
        console.log("PaladinHorzBar: initialize", rect);
        Window_Base.prototype.initialize.call(this, rect);
        this.opacity = 255;
        this.backOpacity = 0;
        this.frameVisible = false;
        this.contentsOpacity = 255;
        this.padding = 0;

        // Load 3-slice tiles
        this._barTiles = [];
        this._barTiles.push(ImageManager.loadSystem("Data944")); // Left
        this._barTiles.push(ImageManager.loadSystem("Data945")); // Center (Tile)
        this._barTiles.push(ImageManager.loadSystem("Data946")); // Right

        // Create background sprite
        this._bgSprite = new Sprite();
        this._container.addChildAt(this._bgSprite, 0);

        // Force refresh to apply padding 0 correctly if needed, though Base init handles it.
    };

    Window_PaladinHorzBar.prototype.refresh = function () {
        // Wait for images
        if (this._barTiles.some(img => !img.isReady())) {
            this._barTiles.forEach(img => {
                if (!img.isReady()) {
                    img.addLoadListener(this.refresh.bind(this));
                }
            });
            return;
        }

        const width = this.width;
        const height = this.height;

        if (!this._bgSprite.bitmap || this._bgSprite.bitmap.width !== width || this._bgSprite.bitmap.height !== height) {
            this._bgSprite.bitmap = new Bitmap(width, height);
        }

        this.drawBarBackground(this._bgSprite.bitmap);
        this._bgSprite.scale.x = 1;
        this._bgSprite.scale.y = 1;

        this.createContents();
        this.drawContents();
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

})();