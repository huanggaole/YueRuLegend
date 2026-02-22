/*:
 * @target MZ
 * @plugindesc 重写标题场景，仅保留新游戏与继续游戏选项。
 * @author 开发者名称
 *
 * @help
 */

(function () {

    //-----------------------------------------------------------------------------
    // Scene_Title Override
    //-----------------------------------------------------------------------------
    // 重写标题场景，移除了选项菜单，仅保留新游戏和继续游戏选项。
    Scene_Title.prototype.createCommandWindow = function () {
        const background = $dataSystem.titleCommandWindow.background;
        const rect = this.commandWindowRect();
        this._commandWindow = new Window_TitleCommand(rect);
        this._commandWindow.setBackgroundType(background);
        this._commandWindow.setHandler("newGame", this.commandNewGame.bind(this));
        this._commandWindow.setHandler("continue", this.commandContinuePaladin.bind(this));
        this.addWindow(this._commandWindow);
    };

    // Create the title screen (add slot windows as overlay)
    const _Scene_Title_create = Scene_Title.prototype.create;
    Scene_Title.prototype.create = function () {
        _Scene_Title_create.call(this);
        this._createTitleLoadSlots();
    };

    Scene_Title.prototype._createTitleLoadSlots = function () {
        const SLOT_COUNT = 5;
        const SLOT_LABELS = ["进度一", "进度二", "进度三", "进度四", "进度五"];
        this._titleLoadSlots = [];
        this._titleLoadIndices = [0, 0, 0, 0, 0];
        this._titleLoadSelected = 0;
        this._titleLoadActive = false;
        this._TITLE_SLOT_COUNT = SLOT_COUNT;
        this._TITLE_SLOT_LABELS = SLOT_LABELS;

        for (let i = 0; i < SLOT_COUNT; i++) {
            const rect = Scene_Menu.prototype.saveSlotRect.call(
                { gameEndWindowRect: Scene_Menu.prototype.gameEndWindowRect, _SLOT_COUNT: SLOT_COUNT },
                i
            );
            const win = new Window_PaladinSaveSlot(rect);
            win.setSlotData(SLOT_LABELS[i], 0);
            win.deactivate();
            win.hide();
            this.addWindow(win);
            this._titleLoadSlots.push(win);
        }
    };

    // "继续" opens the slot overlay
    Scene_Title.prototype.commandContinuePaladin = function () {
        this._commandWindow.deactivate();
        // Read current save indices from global info
        const info = DataManager._globalInfo || [];
        for (let i = 0; i < this._TITLE_SLOT_COUNT; i++) {
            const slotInfo = info[i + 1];
            this._titleLoadIndices[i] = (slotInfo && slotInfo.palSaveIndex) ? slotInfo.palSaveIndex : 0;
            this._titleLoadSlots[i].setSlotData(this._TITLE_SLOT_LABELS[i], this._titleLoadIndices[i]);
            this._titleLoadSlots[i].show();
            this._titleLoadSlots[i].deactivate();
        }
        this._titleLoadSelected = 0;
        this._titleLoadSlots[0].activate();
        this._titleLoadActive = true;
    };

    // Override update to handle slot input
    const _Scene_Title_update = Scene_Title.prototype.update;
    Scene_Title.prototype.update = function () {
        _Scene_Title_update.call(this);
        if (this._titleLoadActive) {
            this._updateTitleLoadInput();
        }
    };

    Scene_Title.prototype._updateTitleLoadInput = function () {
        const N = this._TITLE_SLOT_COUNT;
        if (Input.isTriggered('cancel') || Input.isTriggered('escape') || TouchInput.isCancelled()) {
            SoundManager.playCancel();
            this._closeTitleLoadSlots();
            return;
        }
        if (Input.isTriggered('up')) {
            SoundManager.playCursor();
            this._titleLoadSlots[this._titleLoadSelected].deactivate();
            this._titleLoadSelected = (this._titleLoadSelected - 1 + N) % N;
            this._titleLoadSlots[this._titleLoadSelected].activate();
            return;
        }
        if (Input.isTriggered('down')) {
            SoundManager.playCursor();
            this._titleLoadSlots[this._titleLoadSelected].deactivate();
            this._titleLoadSelected = (this._titleLoadSelected + 1) % N;
            this._titleLoadSlots[this._titleLoadSelected].activate();
            return;
        }
        if (Input.isTriggered('ok')) {
            SoundManager.playOk();
            this._doTitleLoad(this._titleLoadSelected);
            return;
        }
        if (TouchInput.isTriggered()) {
            for (let i = 0; i < N; i++) {
                const win = this._titleLoadSlots[i];
                if (TouchInput.x >= win.x && TouchInput.x < win.x + win.width &&
                    TouchInput.y >= win.y && TouchInput.y < win.y + win.height) {
                    if (this._titleLoadSelected === i) {
                        SoundManager.playOk();
                        this._doTitleLoad(i);
                    } else {
                        SoundManager.playCursor();
                        this._titleLoadSlots[this._titleLoadSelected].deactivate();
                        this._titleLoadSelected = i;
                        this._titleLoadSlots[i].activate();
                    }
                    break;
                }
            }
        }
    };

    Scene_Title.prototype._closeTitleLoadSlots = function () {
        for (const win of this._titleLoadSlots) {
            win.hide();
            win.deactivate();
        }
        this._titleLoadActive = false;
        this._commandWindow.activate();
    };

    Scene_Title.prototype._doTitleLoad = function (slotIndex) {
        const slotId = slotIndex + 1;
        DataManager.loadGame(slotId).then(() => {
            this._titleLoadActive = false;
            SceneManager.goto(Scene_Map);
            $gameSystem.onAfterLoad();
        }).catch(() => {
            SoundManager.playBuzzer();
        });
    };

    //-----------------------------------------------------------------------------
    // Scene_PaladinLoad
    // Standalone load scene: 5 HorzBar slot windows, same UI as in-game load.
    // Used from both the title screen and the in-game system menu.
    //-----------------------------------------------------------------------------
    function Scene_PaladinLoad() {
        this.initialize(...arguments);
    }
    Scene_PaladinLoad.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_PaladinLoad.prototype.constructor = Scene_PaladinLoad;

    Scene_PaladinLoad.prototype.initialize = function () {
        Scene_MenuBase.prototype.initialize.call(this);
    };

    // Show the title screen as-is (no blur filter)
    Scene_PaladinLoad.prototype.createBackground = function () {
        this._backgroundSprite = new Sprite();
        this._backgroundSprite.bitmap = SceneManager.backgroundBitmap();
        this.addChild(this._backgroundSprite);
    };

    // No touch-UI cancel/back button
    Scene_PaladinLoad.prototype.needsCancelButton = function () {
        return false;
    };

    Scene_PaladinLoad.prototype.create = function () {
        Scene_Base.prototype.create.call(this); // Skip MenuBase to avoid hiding title screen
        this.createWindowLayer();               // Must init _windowLayer for addWindow() to work
        this._saveSlots = [];
        this._saveIndices = [0, 0, 0, 0, 0];
        this._selectedSlot = 0;

        const SLOT_COUNT = 5;
        const SLOT_LABELS = ["进度一", "进度二", "进度三", "进度四", "进度五"];
        this._SLOT_COUNT = SLOT_COUNT;
        this._SLOT_LABELS = SLOT_LABELS;

        for (let i = 0; i < SLOT_COUNT; i++) {
            const rect = this._slotRect(i);
            const win = new Window_PaladinSaveSlot(rect);
            win.setSlotData(SLOT_LABELS[i], 0);
            win.deactivate();
            this.addWindow(win);
            this._saveSlots.push(win);
        }
    };

    Scene_PaladinLoad.prototype.start = function () {
        Scene_MenuBase.prototype.start.call(this);
        // Load indices from global info, then activate first slot
        const info = DataManager._globalInfo || [];
        for (let i = 0; i < this._SLOT_COUNT; i++) {
            const slotInfo = info[i + 1];
            this._saveIndices[i] = (slotInfo && slotInfo.palSaveIndex) ? slotInfo.palSaveIndex : 0;
            this._saveSlots[i].setSlotData(this._SLOT_LABELS[i], this._saveIndices[i]);
        }
        this._saveSlots[0].activate();
    };

    Scene_PaladinLoad.prototype._slotRect = function (index) {
        // Inline the same logic as Scene_Menu.saveSlotRect,
        // but call gameEndWindowRect via Scene_Menu.prototype to avoid "not a function" crash.
        const gameEndRect = Scene_Menu.prototype.gameEndWindowRect.call(this);
        const ww = gameEndRect.width;
        const wh = 102;
        const gap = 8;
        const wx = gameEndRect.x;
        const startY = Math.floor((Graphics.boxHeight - (wh + gap) * this._SLOT_COUNT) / 2);
        const wy = startY + index * (wh + gap);
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_PaladinLoad.prototype.update = function () {
        Scene_MenuBase.prototype.update.call(this);
        this._updateInput();
    };

    Scene_PaladinLoad.prototype._updateInput = function () {
        const N = this._SLOT_COUNT;
        if (Input.isTriggered('cancel') || Input.isTriggered('escape')) {
            SoundManager.playCancel();
            SceneManager.pop();
            return;
        }
        if (Input.isTriggered('up')) {
            SoundManager.playCursor();
            this._saveSlots[this._selectedSlot].deactivate();
            this._selectedSlot = (this._selectedSlot - 1 + N) % N;
            this._saveSlots[this._selectedSlot].activate();
            return;
        }
        if (Input.isTriggered('down')) {
            SoundManager.playCursor();
            this._saveSlots[this._selectedSlot].deactivate();
            this._selectedSlot = (this._selectedSlot + 1) % N;
            this._saveSlots[this._selectedSlot].activate();
            return;
        }
        if (Input.isTriggered('ok')) {
            SoundManager.playOk();
            this._doLoad(this._selectedSlot);
            return;
        }
        // Mouse click
        if (TouchInput.isTriggered()) {
            for (let i = 0; i < N; i++) {
                const win = this._saveSlots[i];
                if (TouchInput.x >= win.x && TouchInput.x < win.x + win.width &&
                    TouchInput.y >= win.y && TouchInput.y < win.y + win.height) {
                    if (this._selectedSlot === i) {
                        SoundManager.playOk();
                        this._doLoad(i);
                    } else {
                        SoundManager.playCursor();
                        this._saveSlots[this._selectedSlot].deactivate();
                        this._selectedSlot = i;
                        this._saveSlots[i].activate();
                    }
                    break;
                }
            }
        }
    };

    Scene_PaladinLoad.prototype._doLoad = function (slotIndex) {
        const slotId = slotIndex + 1;
        DataManager.loadGame(slotId).then(() => {
            SceneManager.goto(Scene_Map);
            $gameSystem.onAfterLoad();
        }).catch(() => {
            SoundManager.playBuzzer();
        });
    };


    //-----------------------------------------------------------------------------
    // Scene_Menu Override
    //-----------------------------------------------------------------------------

    // Disable background filter (blur)
    Scene_Menu.prototype.createBackground = function () {
        this._backgroundSprite = new Sprite();
        this._backgroundSprite.bitmap = SceneManager.backgroundBitmap();
        this.addChild(this._backgroundSprite);
    };

    // Disable cancel button (touch UI back button)
    Scene_Menu.prototype.needsCancelButton = function () {
        return false;
    };

    // Override create
    const _Scene_Menu_create = Scene_Menu.prototype.create;
    Scene_Menu.prototype.create = function () {
        Scene_MenuBase.prototype.create.call(this);
        this.createCommandWindow();
        this.createSystemWindow();
        this.createGoldWindow();
        this.createGameEndWindow();
        this.createMusicToggleWindow();
        this.createSoundToggleWindow();
        this.createSaveSlotWindows();

        // Add new Paladin sub-windows here
        this.createPartyStatusWindow();
        this.createMagicActorWindow();
        this.createItemCategoryWindow();
    };

    // Overrides to avoid crash if status window is missing
    Scene_Menu.prototype.start = function () {
        Scene_MenuBase.prototype.start.call(this);
    };

    Scene_Menu.prototype.commandPersonal = function () {
        if (this._commandWindow.currentSymbol() === 'skill') {
            this._commandWindow.deactivate();
            this._commandWindow.refresh(); // Stop breathing
            this._partyStatusWindow.show();
            this._magicActorWindow.refresh();
            this._magicActorWindow.show();
            this._magicActorWindow.activate();
            this._magicActorWindow.select(0);
        } else {
            console.log("Status Window is missing. Cannot select actor.");
            this._commandWindow.activate();
        }
    };

    // Gold Window
    Scene_Menu.prototype.createGoldWindow = function () {
        const rect = this.goldWindowRect();
        this._goldWindow = new Window_PaladinGold(rect);
        this.addWindow(this._goldWindow);
    };

    Scene_Menu.prototype.goldWindowRect = function () {
        const ww = 288;
        const wh = 102;
        const wx = 0;
        const wy = 0;
        return new Rectangle(wx, wy, ww, wh);
    };

    // Command Window (Main)
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

    Scene_Menu.prototype.commandWindowRect = function () {
        const ww = 200;
        const wh = 288;
        const wx = 10;
        const wy = 114;
        return new Rectangle(wx, wy, ww, wh);
    };

    // Item
    Scene_Menu.prototype.commandItem = function () {
        this._commandWindow.deactivate();
        this._commandWindow.refresh(); // Stop breathing
        this._itemCategoryWindow.refresh();
        this._itemCategoryWindow.show();
        this._itemCategoryWindow.activate();
        this._itemCategoryWindow.select(0);
    };

    // System Window
    Scene_Menu.prototype.createSystemWindow = function () {
        const rect = this.systemWindowRect();
        this._systemWindow = new Window_PaladinSystem(rect);
        this._systemWindow.setHandler("save", this.commandSave.bind(this));
        this._systemWindow.setHandler("load", this.commandLoad.bind(this));
        this._systemWindow.setHandler("music", this.commandMusic.bind(this));
        this._systemWindow.setHandler("sound", this.commandSound.bind(this));
        this._systemWindow.setHandler("gameEnd", this.commandGameEnd.bind(this));
        this._systemWindow.setHandler("cancel", this.onSystemCancel.bind(this));
        this._systemWindow.hide();
        this.addWindow(this._systemWindow);
    };

    Scene_Menu.prototype.systemWindowRect = function () {
        const ww = 296;
        const wh = 348;
        const wx = 120;
        const wy = 186;
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_Menu.prototype.commandOptions = function () {
        this._commandWindow.deactivate();
        this._commandWindow.refresh(); // Stop breathing
        this._systemWindow.refresh();
        this._systemWindow.show();
        this._systemWindow.activate();
    };

    Scene_Menu.prototype.onSystemCancel = function () {
        this._systemWindow.hide();
        this._systemWindow.deactivate();
        this._commandWindow.activate();
        this._commandWindow.refresh(); // Resume breathing
    };

    Scene_Menu.prototype.commandSave = function () {
        this._systemWindow.deactivate();
        this._saveMode = "save";
        this._openSaveSlots();
    };

    Scene_Menu.prototype.commandLoad = function () {
        this._systemWindow.deactivate();
        this._saveMode = "load";
        this._openSaveSlots();
    };

    //-------------------------------------------------------------------------
    // Save Slot Windows (5 stacked HorzBar rows)
    //-------------------------------------------------------------------------
    const SLOT_COUNT = 5;
    const SLOT_LABELS = ["进度一", "进度二", "进度三", "进度四", "进度五"];

    Scene_Menu.prototype.createSaveSlotWindows = function () {
        this._saveSlots = [];
        this._saveIndices = [0, 0, 0, 0, 0]; // per-slot save counter
        this._selectedSlot = 0;
        this._saveMode = "save";

        const rect0 = this.saveSlotRect(0);
        for (let i = 0; i < SLOT_COUNT; i++) {
            const rect = this.saveSlotRect(i);
            const win = new Window_PaladinSaveSlot(rect);
            win.setSlotData(SLOT_LABELS[i], 0);
            win.hide();
            win.deactivate();
            this.addWindow(win);
            this._saveSlots.push(win);
        }
    };

    Scene_Menu.prototype.saveSlotRect = function (index) {
        // Same x/width as GameEnd window; stacked vertically
        const gameEndRect = this.gameEndWindowRect();
        const ww = 250;
        const wh = 102;
        const gap = 8;
        const wx = 600;
        // Stack from top of screen with a starting offset
        const startY = Math.floor((Graphics.boxHeight - (wh + gap) * SLOT_COUNT) / 2);
        const wy = startY + index * (wh + gap);
        return new Rectangle(wx, wy, ww, wh);
    };

    // Open the 5 slot windows, load current indices from save files
    Scene_Menu.prototype._openSaveSlots = function () {
        this._loadSaveIndices(() => {
            for (let i = 0; i < SLOT_COUNT; i++) {
                this._saveSlots[i].setSlotData(SLOT_LABELS[i], this._saveIndices[i]);
                this._saveSlots[i].show();
                this._saveSlots[i].deactivate();
            }
            this._selectedSlot = 0;
            this._saveSlots[0].activate();
        });
    };

    // Read save indices from DataManager._globalInfo (loaded at game startup)
    Scene_Menu.prototype._loadSaveIndices = function (callback) {
        const info = DataManager._globalInfo || [];
        for (let i = 0; i < SLOT_COUNT; i++) {
            const slotInfo = info[i + 1]; // RMMZ slot IDs start at 1
            this._saveIndices[i] = (slotInfo && slotInfo.palSaveIndex) ? slotInfo.palSaveIndex : 0;
        }
        callback();
    };

    // Close all slot windows and return to system menu
    Scene_Menu.prototype._closeSaveSlots = function () {
        for (const win of this._saveSlots) {
            win.hide();
            win.deactivate();
        }
        this._systemWindow.activate();
    };

    // Scene update: handle input while slot windows are visible
    const _Scene_Menu_update = Scene_Menu.prototype.update;
    Scene_Menu.prototype.update = function () {
        _Scene_Menu_update.call(this);
        if (this._saveSlots && this._saveSlots[0] && this._saveSlots[0].visible) {
            this._updateSaveSlotInput();
        }
    };

    Scene_Menu.prototype._updateSaveSlotInput = function () {
        if (Input.isTriggered('cancel') || Input.isTriggered('escape') || TouchInput.isCancelled()) {
            SoundManager.playCancel();
            this._closeSaveSlots();
            return;
        }
        if (Input.isTriggered('up')) {
            SoundManager.playCursor();
            this._saveSlots[this._selectedSlot].deactivate();
            this._selectedSlot = (this._selectedSlot - 1 + SLOT_COUNT) % SLOT_COUNT;
            this._saveSlots[this._selectedSlot].activate();
            return;
        }
        if (Input.isTriggered('down')) {
            SoundManager.playCursor();
            this._saveSlots[this._selectedSlot].deactivate();
            this._selectedSlot = (this._selectedSlot + 1) % SLOT_COUNT;
            this._saveSlots[this._selectedSlot].activate();
            return;
        }
        if (Input.isTriggered('ok')) {
            SoundManager.playOk();
            if (this._saveMode === "save") {
                this._doSave(this._selectedSlot);
            } else {
                this._doLoad(this._selectedSlot);
            }
            return;
        }
        // Mouse click on a slot
        for (let i = 0; i < SLOT_COUNT; i++) {
            if (TouchInput.isTriggered()) {
                const win = this._saveSlots[i];
                const tx = TouchInput.x;
                const ty = TouchInput.y;
                if (tx >= win.x && tx < win.x + win.width &&
                    ty >= win.y && ty < win.y + win.height) {
                    if (this._selectedSlot === i) {
                        // Double-click (same slot already selected) → confirm
                        SoundManager.playOk();
                        if (this._saveMode === "save") {
                            this._doSave(i);
                        } else {
                            this._doLoad(i);
                        }
                    } else {
                        SoundManager.playCursor();
                        this._saveSlots[this._selectedSlot].deactivate();
                        this._selectedSlot = i;
                        this._saveSlots[i].activate();
                    }
                    break;
                }
            }
        }
    };

    Scene_Menu.prototype._doSave = function (slotIndex) {
        // Global counter = max of all current indices + 1
        const maxIdx = Math.max(0, ...this._saveIndices);
        const newIdx = maxIdx + 1;
        this._saveIndices[slotIndex] = newIdx;

        const slotId = slotIndex + 1;

        // Patch makeSavefileInfo to inject palSaveIndex into the global info
        const _orig = DataManager.makeSavefileInfo;
        DataManager.makeSavefileInfo = function () {
            const info = _orig.call(DataManager);
            info.palSaveIndex = newIdx;
            return info;
        };

        $gameSystem.onBeforeSave();
        DataManager.saveGame(slotId).then(() => {
            DataManager.makeSavefileInfo = _orig; // Restore
            this._saveSlots[slotIndex].setSlotData(SLOT_LABELS[slotIndex], newIdx);
        }).catch(() => {
            DataManager.makeSavefileInfo = _orig; // Restore on error too
            SoundManager.playBuzzer();
        });
    };

    Scene_Menu.prototype._doLoad = function (slotIndex) {
        const slotId = slotIndex + 1;
        DataManager.loadGame(slotId).then(() => {
            this._closeSaveSlots();
            SceneManager.goto(Scene_Map);
            $gameSystem.onAfterLoad();
        }).catch(() => {
            SoundManager.playBuzzer();
        });
    };

    Scene_Menu.prototype.commandMusic = function () {
        this._systemWindow.deactivate();
        this._musicToggleWindow.refresh();
        this._musicToggleWindow.show();
        this._musicToggleWindow.activate();
        // Pre-select current state: index 0=关, index 1=开
        const isOn = (ConfigManager.bgmVolume || 0) > 0;
        this._musicToggleWindow.select(isOn ? 1 : 0);
    };

    Scene_Menu.prototype.commandSound = function () {
        this._systemWindow.deactivate();
        this._soundToggleWindow.refresh();
        this._soundToggleWindow.show();
        this._soundToggleWindow.activate();
        const isOn = (ConfigManager.seVolume || 0) > 0;
        this._soundToggleWindow.select(isOn ? 1 : 0);
    };

    // Music Toggle Window
    Scene_Menu.prototype.createMusicToggleWindow = function () {
        const rect = this.gameEndWindowRect();
        this._musicToggleWindow = new Window_PaladinToggle(rect);
        this._musicToggleWindow.setHandler("off", this.onMusicOff.bind(this));
        this._musicToggleWindow.setHandler("on", this.onMusicOn.bind(this));
        this._musicToggleWindow.setHandler("cancel", this.onToggleCancel.bind(this, this._musicToggleWindow));
        this._musicToggleWindow.hide();
        this.addWindow(this._musicToggleWindow);
    };

    Scene_Menu.prototype.onMusicOff = function () {
        ConfigManager.bgmVolume = 0;
        ConfigManager.save();
        AudioManager.bgmVolume = 0;
        this._musicToggleWindow.hide();
        this._musicToggleWindow.deactivate();
        this._systemWindow.activate();
    };

    Scene_Menu.prototype.onMusicOn = function () {
        ConfigManager.bgmVolume = 100;
        ConfigManager.save();
        AudioManager.bgmVolume = 100;
        this._musicToggleWindow.hide();
        this._musicToggleWindow.deactivate();
        this._systemWindow.activate();
    };

    // Sound Toggle Window
    Scene_Menu.prototype.createSoundToggleWindow = function () {
        const rect = this.gameEndWindowRect();
        this._soundToggleWindow = new Window_PaladinToggle(rect);
        this._soundToggleWindow.setHandler("off", this.onSoundOff.bind(this));
        this._soundToggleWindow.setHandler("on", this.onSoundOn.bind(this));
        this._soundToggleWindow.setHandler("cancel", this.onToggleCancel.bind(this, this._soundToggleWindow));
        this._soundToggleWindow.hide();
        this.addWindow(this._soundToggleWindow);
    };

    Scene_Menu.prototype.onSoundOff = function () {
        ConfigManager.seVolume = 0;
        ConfigManager.save();
        AudioManager.seVolume = 0;
        this._soundToggleWindow.hide();
        this._soundToggleWindow.deactivate();
        this._systemWindow.activate();
    };

    Scene_Menu.prototype.onSoundOn = function () {
        ConfigManager.seVolume = 100;
        ConfigManager.save();
        AudioManager.seVolume = 100;
        this._soundToggleWindow.hide();
        this._soundToggleWindow.deactivate();
        this._systemWindow.activate();
    };

    // Shared cancel handler for toggle windows
    Scene_Menu.prototype.onToggleCancel = function (toggleWindow) {
        toggleWindow.hide();
        toggleWindow.deactivate();
        this._systemWindow.activate();
    };

    Scene_Menu.prototype.commandGameEnd = function () {
        this._systemWindow.deactivate();
        this._gameEndWindow.refresh();
        this._gameEndWindow.show();
        this._gameEndWindow.activate();
    };

    // Game End Window
    Scene_Menu.prototype.createGameEndWindow = function () {
        const rect = this.gameEndWindowRect();
        this._gameEndWindow = new Window_PaladinGameEnd(rect);
        this._gameEndWindow.setHandler("ok", this.onGameEndOk.bind(this));
        this._gameEndWindow.setHandler("cancel", this.onGameEndCancel.bind(this));
        this._gameEndWindow.hide();
        this.addWindow(this._gameEndWindow);
    };

    Scene_Menu.prototype.gameEndWindowRect = function () {
        const itemW = 128;
        const ww = itemW * 2 + 20;
        const wh = 102;
        // Center on screen
        const wx = (Graphics.boxWidth - ww) / 2 + 118;
        const wy = (Graphics.boxHeight - wh) / 2 + 96;
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_Menu.prototype.onGameEndOk = function () {
        SceneManager.exit();
    };

    Scene_Menu.prototype.onGameEndCancel = function () {
        this._gameEndWindow.hide();
        this._gameEndWindow.deactivate();
        this._systemWindow.activate();
    };


    //-----------------------------------------------------------------------------
    // Magic Character Selection Hooks (Scene_Menu)
    //-----------------------------------------------------------------------------
    Scene_Menu.prototype.createMagicActorWindow = function () {
        const members = $gameParty.members();
        const wh = 36 + 48 + members.length * 48; // 9-slice top(36) + bottom(20) + lines
        const ww = 240;
        const cRect = this.commandWindowRect();
        const wx = cRect.x + cRect.width - 100;
        const wy = cRect.y + 72;

        const rect = new Rectangle(wx, wy, ww, wh);
        this._magicActorWindow = new Window_PaladinMagicActor(rect);
        this._magicActorWindow.setHandler("actor", this.onMagicActorOk.bind(this));
        this._magicActorWindow.setHandler("cancel", this.onMagicActorCancel.bind(this));
        this._magicActorWindow.hide();
        this.addWindow(this._magicActorWindow);
    };

    Scene_Menu.prototype.onMagicActorOk = function () {
        SoundManager.playOk();
        // Magic scene not yet implemented, pre-allocating the hook here.
        // SceneManager.push(Scene_PalMagic);

        // Keep active for testing until implemented
        this._magicActorWindow.activate();
    };

    Scene_Menu.prototype.onMagicActorCancel = function () {
        this._magicActorWindow.hide();
        this._partyStatusWindow.hide();
        this._magicActorWindow.deactivate();
        this._commandWindow.activate();
        this._commandWindow.refresh(); // Resume breathing
    };

    //-----------------------------------------------------------------------------
    // Item Category Selection Logic
    //-----------------------------------------------------------------------------
    Scene_Menu.prototype.createItemCategoryWindow = function () {
        // Height formula: 9-slice top(36) + bottom(48) + 2 options * 48
        const wh = 84 + 2 * 48;
        const ww = 200;
        const cRect = this.commandWindowRect();
        const wx = cRect.x + cRect.width - 100;
        const wy = cRect.y + 72;

        const rect = new Rectangle(wx, wy, ww, wh);
        this._itemCategoryWindow = new Window_PaladinItemCategory(rect);
        this._itemCategoryWindow.setHandler("useItem", this.onItemCategoryOk.bind(this, 'use'));
        this._itemCategoryWindow.setHandler("equipItem", this.onItemCategoryOk.bind(this, 'equip'));
        this._itemCategoryWindow.setHandler("cancel", this.onItemCategoryCancel.bind(this));
        this._itemCategoryWindow.hide();
        this.addWindow(this._itemCategoryWindow);
    };

    Scene_Menu.prototype.onItemCategoryOk = function (category) {
        SoundManager.playOk();
        // Item scene override not yet fully implemented.
        // We will pass the category ('use' or 'equip') to it later.
        console.log("Selected Item Category:", category);

        // Keep active for testing until implemented
        this._itemCategoryWindow.activate();
    };

    Scene_Menu.prototype.onItemCategoryCancel = function () {
        this._itemCategoryWindow.hide();
        this._itemCategoryWindow.deactivate();
        this._commandWindow.activate();
        this._commandWindow.refresh(); // Resume breathing
    };

    Scene_Menu.prototype.createPartyStatusWindow = function () {
        const wh = 114; // Height to fit Data918 properly (35 * 3 = 105 px + padding 9)
        const ww = Graphics.boxWidth;
        const wx = 0;
        const wy = Graphics.boxHeight - wh;
        const rect = new Rectangle(wx, wy, ww, wh);
        this._partyStatusWindow = new Window_PaladinPartyStatus(rect);
        this._partyStatusWindow.hide();
        this.addWindow(this._partyStatusWindow);
        this._partyStatusWindow.refresh();
    };

})();
