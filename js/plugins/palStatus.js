/*:
 * @target MZ
 * @plugindesc [v1.0] 仿仙剑98柔情版状态界面
 * @author 开发者
 *
 * @help
 * 该插件重写了状态界面 (Scene_Status)。
 * 
 * 功能特点：
 * 1. 在主菜单中选择“状态”后，直接进入全屏状态显示。
 * 2. 点击屏幕或按下任意键切换到下一个角色。
 * 3. 所有角色显示完毕后，自动退出状态界面返回菜单。
 * 4. 使用自定义图片数字显示 HP, MP, EXP, Level 等数值。
 * 5. 按照仙剑98风格布局显示装备和属性。
 *
 * 资源要求 (img/system/):
 * - Fbp_1-1.png (背景图)
 * - Data919.PNG ~ Data928.PNG (白色数字 0-9)
 * - Data929.PNG ~ Data938.PNG (蓝色数字 0-9)
 * - Data956.PNG ~ Data965.PNG (绿色数字 0-9)
 * - Data939.PNG (斜杠 /)
 *
 */

(function () {

    //-----------------------------------------------------------------------------
    // Image Loading Helper
    //-----------------------------------------------------------------------------
    const PalImages = {
        loadSystem: function (filename) {
            return ImageManager.loadSystem(filename);
        },

        // 0-9 White: Data919 - Data928
        getWhiteNumber: function (n) {
            return this.loadSystem('Data' + (919 + n));
        },
        // 0-9 Blue: Data929 - Data938
        getBlueNumber: function (n) {
            return this.loadSystem('Data' + (929 + n));
        },
        // 0-9 Green: Data956 - Data965
        getGreenNumber: function (n) {
            return this.loadSystem('Data' + (956 + n));
        },
        getSlash: function () {
            return this.loadSystem('Data939');
        }
    };

    //-----------------------------------------------------------------------------
    // Scene_Menu Integration
    //-----------------------------------------------------------------------------

    // Override standard "Status" command behavior
    const _Scene_Menu_commandPersonal = Scene_Menu.prototype.commandPersonal;
    Scene_Menu.prototype.commandPersonal = function () {
        // If we are using the new Paladin Status scene
        // Skip actor selection and go directly to first actor
        this._commandWindow.deactivate(); // Prevent input on command window
        SceneManager.push(Scene_PalStatus);
    };

    //-----------------------------------------------------------------------------
    // Scene_PalStatus
    //-----------------------------------------------------------------------------

    function Scene_PalStatus() {
        this.initialize(...arguments);
    }

    Scene_PalStatus.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_PalStatus.prototype.constructor = Scene_PalStatus;

    Scene_PalStatus.prototype.initialize = function () {
        Scene_MenuBase.prototype.initialize.call(this);
        this._actorIndex = 0; // Start from first actor
    };

    Scene_PalStatus.prototype.create = function () {
        Scene_MenuBase.prototype.create.call(this);
        this.createStatusWindow();
        this.refreshActor();
    };

    Scene_PalStatus.prototype.createStatusWindow = function () {
        const rect = new Rectangle(0, 0, Graphics.boxWidth, Graphics.boxHeight);
        this._statusWindow = new Window_PalStatus(rect);
        this.addWindow(this._statusWindow);
    };

    Scene_PalStatus.prototype.needsCancelButton = function () {
        return false;
    };

    Scene_PalStatus.prototype.refreshActor = function () {
        const actor = $gameParty.members()[this._actorIndex];
        this._statusWindow.setActor(actor);
        this._statusWindow.refresh();
    };

    Scene_PalStatus.prototype.update = function () {
        Scene_MenuBase.prototype.update.call(this);

        if (Input.isTriggered('down') || Input.isTriggered('right') || Input.isTriggered('ok') || TouchInput.isTriggered()) {
            this.processNext();
        } else if (Input.isTriggered('up') || Input.isTriggered('left')) {
            this.processPrevious();
        } else if (Input.isTriggered('cancel') || Input.isTriggered('escape') || Input.isTriggered('menu')) {
            this.popScene();
        }
    };

    Scene_PalStatus.prototype.processNext = function () {
        SoundManager.playCursor();
        if (this._actorIndex < $gameParty.members().length - 1) {
            this._actorIndex++;
            this.refreshActor();
        } else {
            // At last actor, next exits
            this.popScene();
        }
    };

    Scene_PalStatus.prototype.processPrevious = function () {
        SoundManager.playCursor();
        if (this._actorIndex > 0) {
            this._actorIndex--;
            this.refreshActor();
        } else {
            // At first actor, prev exits
            this.popScene();
        }
    };

    //-----------------------------------------------------------------------------
    // Window_PalStatus
    //-----------------------------------------------------------------------------

    function Window_PalStatus() {
        this.initialize(...arguments);
    }

    Window_PalStatus.prototype = Object.create(Window_Base.prototype);
    Window_PalStatus.prototype.constructor = Window_PalStatus;

    Window_PalStatus.prototype.initialize = function (rect) {
        Window_Base.prototype.initialize.call(this, rect);
        this.padding = 0; // Remove padding for full screen background
        this.createContents(); // Recreate contents bitmap at full size (no padding)
        this.opacity = 0; // No window frame
        this._actor = null;
    };

    Window_PalStatus.prototype.setActor = function (actor) {
        this._actor = actor;
    };

    Window_PalStatus.prototype.refresh = function () {
        this.contents.clear();
        if (!this._actor) return;

        this.drawBackground();
        this.drawActorFaceGraphic();
        this.drawActorNameGraphic();
        this.drawStats();
        this.drawEquips();
    };

    Window_PalStatus.prototype.drawBackground = function () {
        const bg = PalImages.loadSystem('Fbp_1-1');
        if (bg.isReady()) {
            // Source: 320x200
            // Target: 3x Scale -> 960x600
            // Screen: 800x600
            // Center horizontally: (800 - 960) / 2 = -80
            const scale = 3;
            const dw = bg.width * scale;
            const dh = bg.height * scale;
            const dx = (this.contentsWidth() - dw) / 2;
            const dy = (this.contentsHeight() - dh) / 2;
            this.contents.blt(bg, 0, 0, bg.width, bg.height, dx, dy, dw, dh);
        } else {
            bg.addLoadListener(this.refresh.bind(this));
        }
    };

    Window_PalStatus.prototype.drawActorFaceGraphic = function () {
        // Face in center. MZ faces are 144x144 usually.
        // User requested 2x zoom (288x288).
        const faceName = this._actor.faceName();
        const faceIndex = this._actor.faceIndex();

        // Source dimensions
        const pw = ImageManager.faceWidth; // 144
        const ph = ImageManager.faceHeight; // 144

        // Destination dimensions (2x)
        const dw = pw * 3;
        const dh = ph * 3;

        // Center coordinates
        const x = (this.contentsWidth() - dw) / 2;
        const y = (this.contentsHeight() - dh) / 2 - 60;

        const bitmap = ImageManager.loadFace(faceName);
        if (bitmap.isReady()) {
            const sx = (faceIndex % 4) * pw;
            const sy = Math.floor(faceIndex / 4) * ph;
            this.contents.blt(bitmap, sx, sy, pw, ph, x, y, dw, dh);
        } else {
            bitmap.addLoadListener(this.refresh.bind(this));
        }
    };

    Window_PalStatus.prototype.drawActorNameGraphic = function () {
        // Draw Name in #FBC86F above face
        const name = this._actor.name();
        this.contents.fontSize = 40; // Larger font

        const textWidth = this.textWidth(name);
        // Position relative to Face (which is now 2x, height 288)
        const faceHeight = ImageManager.faceHeight * 2;
        const x = (this.contentsWidth() - textWidth) / 2 - 30;
        const y = (this.contentsHeight() - faceHeight) / 2 - 120;

        this.drawTextWithShadow(name, x, y, textWidth, 'center', '#FBC86F');
        this.resetFontSettings();
    };

    Window_PalStatus.prototype.drawStats = function () {
        // Layout Config (Approximate based on screenshot)
        // Left Column: Exp, Level, HP, MP, ATK, MAT, DEF, AGI, LUK

        const startX = 20;
        const startY = 46;
        const lineHeight = 55;

        const labelX = startX;
        const valueX = startX + 150;

        // 1. Exp
        this.drawLabel("经验值", labelX, startY, 120);
        const nextExp = this._actor.nextRequiredExp();
        const currentExp = this._actor.currentExp();
        // Values: Current (Top, White), Next (Bottom, Green)
        // Note: nextRequiredExp in MZ is "relative to current level" or "total"?
        // MZ: actor.nextRequiredExp() -> exp to NEXT level from CURRENT level.
        // actor.nextLevelExp() -> total exp for next level.
        // Paladin typically shows Total Exp and Total Exp Needed for Next Level.
        // Using `currentExp()` and `nextLevelExp()`.

        // Wait, screenshot shows "21" (top white) and "40" (bottom green).
        // This looks like Current / Target.

        this.drawPalNumber(currentExp, valueX, startY - 10, 'white');
        this.drawPalNumber(this._actor.nextRequiredExp(), valueX, startY + 14, 'green');


        // 2. Level (修行)
        const y2 = startY + lineHeight * 1.5;
        this.drawLabel("修行", labelX, y2);
        this.drawPalNumber(this._actor.level, valueX, y2, 'white');

        // 3. HP (体力) Current/Max
        const y3 = y2 + lineHeight;
        this.drawLabel("体力", labelX, y3);
        this.drawFraction(this._actor.hp, this._actor.mhp, valueX - 50, y3);

        // 4. MP (真气) Current/Max
        const y4 = y3 + lineHeight;
        this.drawLabel("真气", labelX, y4);
        this.drawFraction(this._actor.mp, this._actor.mmp, valueX - 50, y4);

        // 5. ATK (武术)
        const y5 = y4 + lineHeight;
        this.drawLabel("武术", labelX, y5);
        this.drawPalNumber(this._actor.atk, valueX, y5, 'white');

        // 6. MAT (灵力) - using m.attack (mat)
        const y6 = y5 + lineHeight;
        this.drawLabel("灵力", labelX, y6);
        this.drawPalNumber(this._actor.mat, valueX, y6, 'white');

        // 7. DEF (防御)
        const y7 = y6 + lineHeight;
        this.drawLabel("防御", labelX, y7);
        this.drawPalNumber(this._actor.def, valueX, y7, 'white');

        // 8. AGI (身法)
        const y8 = y7 + lineHeight;
        this.drawLabel("身法", labelX, y8);
        this.drawPalNumber(this._actor.agi, valueX, y8, 'white');

        // 9. LUK (吉运)
        const y9 = y8 + lineHeight;
        this.drawLabel("吉运", labelX, y9);
        this.drawPalNumber(this._actor.luk, valueX, y9, 'white');
    };

    Window_PalStatus.prototype.drawLabel = function (text, x, y, width = 80) {
        this.contents.fontSize = 46;
        this.drawTextWithShadow(text, x, y - 4, width, 'left', '#C4B8AD');
    };

    Window_PalStatus.prototype.drawFraction = function (current, max, x, y) {
        // Draw: Current (White) / Max (Blue)
        const w1 = this.drawPalNumber(current, x, y, 'white');

        // Draw Slash
        const slash = PalImages.getSlash();
        if (slash.isReady()) {
            const scale = 2; // 2x Scale
            const sx = x + w1 + 2 * scale;
            const dw = slash.width * scale;
            const dh = slash.height * scale;

            this.contents.blt(slash, 0, 0, slash.width, slash.height, sx, y + 5, dw, dh);

            // Draw Max
            const mx = sx + dw + 2 * scale;
            this.drawPalNumber(max, mx, y + 8, 'blue');
        } else {
            slash.addLoadListener(this.refresh.bind(this));
        }
    };

    Window_PalStatus.prototype.drawPalNumber = function (value, x, y, type) {
        const str = String(value);
        let currentX = x;
        const scale = 3; // 2x Scale

        for (let i = 0; i < str.length; i++) {
            const n = parseInt(str[i]);
            let bmp;
            if (type === 'white') bmp = PalImages.getWhiteNumber(n);
            else if (type === 'blue') bmp = PalImages.getBlueNumber(n);
            else if (type === 'green') bmp = PalImages.getGreenNumber(n);

            if (bmp) {
                if (bmp.isReady()) {
                    const dw = bmp.width * scale;
                    const dh = bmp.height * scale;
                    this.contents.blt(bmp, 0, 0, bmp.width, bmp.height, currentX, y, dw, dh);
                    currentX += dw;
                } else {
                    bmp.addLoadListener(this.refresh.bind(this));
                }
            }
        }
        return currentX - x;
    };

    // Equipment
    Window_PalStatus.prototype.drawEquips = function () {
        // Slots: 2 Head, 4 Cape, 3 Body, 1 Weapon, 5 Foot, 6 Accessory
        // Coordinates need adjustment.
        // Screen is roughly divided. Equips are on right and bottom.

        // Positions (Approx relative to screen size)
        const w = this.contentsWidth();
        const h = this.contentsHeight();

        // Ref: Screenshot
        // Head (Top Right)
        // Cape (Below Head)
        // Body (Right, Below Cape)
        // Weapon (Bottom Right-ish)
        // Foot (Bottom Center-ish)
        // Acc/Wrist (Left of Foot?) -> "护腕" (Wristguard) is typical Accessory in Paladin.

        // Coordinates map (x, y)
        const mapping = [
            { slotName: "Head", etypeId: 2, x: w - 150, y: 50 },
            { slotName: "Cape", etypeId: 4, x: w - 100, y: 180 }, // Assuming etype 4
            { slotName: "Body", etypeId: 3, x: w - 150, y: 300 },
            { slotName: "Weapon", etypeId: 1, x: w - 250, y: 450 },
            { slotName: "Foot", etypeId: 5, x: w / 2 + 50, y: 520 },
            { slotName: "Accessory", etypeId: 6, x: w / 2 - 100, y: 520 }
        ];

        // Draw Icon + Name for each
        const equips = this._actor.equips();

        // We iterate our custom mapping and look for matching items in the actor's equip list.
        // RMMZ actors have fixed slots defined in Database -> System.
        // We rely on matching etypeId to the item's etypeId.

        // Note: this._actor.equips() returns array matching slot order.
        // We need to find the item in that array that matches the etypeId we want to display.
        // Or better, iterate slots and check their compatibility?
        // Simpler: Iterate all equipped items. If item.etypeId == target, draw it.

        // NOTE: If user has multiple slots of same type (e.g. 2 accessories), this simple logic picks first or overrides.
        // Standard Paladin has distinct slots.

        for (const map of mapping) {
            // Find item with this etypeId
            const item = equips.find(e => e && e.etypeId === map.etypeId);
            this.drawEquipItem(item, map.x, map.y, map.slotName);
        }
    };

    Window_PalStatus.prototype.drawEquipItem = function (item, x, y, label) {
        if (item) {
            // Draw Icon
            this.drawIcon(item.iconIndex, x, y + 36);
            // Draw Name
            this.contents.fontSize = 24;
            this.drawTextWithShadow(item.name, x - 20, y, 120, 'center', '#E3DCC0');
        }
        // Empty slot: draw nothing
    };

    // Helper: Draw text with a black drop shadow (offset +2px right, +2px down)
    Window_PalStatus.prototype.drawTextWithShadow = function (text, x, y, maxWidth, align, color) {
        this.contents.outlineWidth = 0;
        // Shadow
        this.changeTextColor('#000000');
        this.drawText(text, x + 2, y + 2, maxWidth, align);
        // Foreground
        this.changeTextColor(color);
        this.drawText(text, x, y, maxWidth, align);
    };

})();
