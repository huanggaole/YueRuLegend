/*:
 * @target MZ
 * @plugindesc [v1.0] Chinese Paladin 98 Battle System & UI
 * @author AI Assistant
 *
 * @help
 * Implements Paladin 98 style combat layout.
 */

(() => {
    //-----------------------------------------------------------------------------
    // Window_ActorCommand
    //-----------------------------------------------------------------------------


    const _Window_ActorCommand_initialize = Window_ActorCommand.prototype.initialize;
    Window_ActorCommand.prototype.initialize = function (rect) {
        const fullRect = new Rectangle(0, 0, 260, Graphics.boxHeight);
        _Window_ActorCommand_initialize.call(this, fullRect);

        this.opacity = 0;
        this.cursorVisible = false;
        this.contentsOpacity = 0;

        this.createButtons();
    };

    Window_ActorCommand.prototype.createButtons = function () {
        this._buttonSprites = [];
        this._buttonData = [
            { x: 81, y: 420, img: 'Data940', symbol: 'attack' }, // Top
            { x: 0, y: 465, img: 'Data941', symbol: 'skill' },   // Left
            { x: 81, y: 510, img: 'Data943', symbol: 'escape' }, // Bottom
            { x: 162, y: 465, img: 'Data942', symbol: 'item' }   // Right
        ];

        for (let i = 0; i < 4; i++) {
            const data = this._buttonData[i];
            const sprite = new Sprite();
            sprite.bitmap = ImageManager.loadSystem(data.img);
            sprite.scale.x = 3;
            sprite.scale.y = 3;
            sprite.x = data.x;
            sprite.y = data.y;
            this.addChild(sprite);
            this._buttonSprites.push(sprite);
        }
    };

    Window_ActorCommand.prototype.makeCommandList = function () {
        if (!this._actor) return;
        const canAttack = this._actor ? this._actor.canAttack() : false;
        const canSkill = this._actor ? this._actor.canMove() : false;
        const canItem = this._actor ? this._actor.canMove() : false;

        // Index: 0=Top, 1=Left, 2=Bottom, 3=Right
        this.addCommand(TextManager.attack, "attack", canAttack);
        this.addCommand(TextManager.skill, "skill", canSkill);
        this.addCommand(TextManager.escape, "escape", BattleManager.canEscape());
        this.addCommand(TextManager.item, "item", canItem);
    };

    Window_ActorCommand.prototype.setup = function (actor) {
        this._actor = actor;
        this.refresh();
        this.select(0); // 默认选中攻击(Top)
        this.activate();
        this.open();
    };

    Window_ActorCommand.prototype.cursorDown = function (wrap) {
        // 如果2号位不可用，则直接return
        if (!this.isCommandEnabled(2)) return;
        const i = this.index();
        if (i === 0) this.select(2);      // Top -> Bottom
        else if (i === 1) this.select(2); // Left -> Bottom
        else if (i === 3) this.select(2); // Right -> Bottom
        // else if (i === 2 && wrap) this.select(0); // Bottom -> Top
        SoundManager.playCursor();
    };

    Window_ActorCommand.prototype.cursorUp = function (wrap) {
        // 如果0号位不可用，则直接return
        if (!this.isCommandEnabled(0)) return;
        const i = this.index();
        if (i === 2) this.select(0);      // Bottom -> Top
        else if (i === 1) this.select(0); // Left -> Top
        else if (i === 3) this.select(0); // Right -> Top
        // else if (i === 0 && wrap) this.select(2); // Top -> Bottom
        SoundManager.playCursor();
    };

    Window_ActorCommand.prototype.cursorRight = function (wrap) {
        // 如果3号位不可用，则直接return
        if (!this.isCommandEnabled(3)) return;
        const i = this.index();
        if (i === 1) this.select(3);      // Left -> Right
        else if (i === 0) this.select(3); // Top -> Right
        else if (i === 2) this.select(3); // Bottom -> Right
        // else if (i === 3 && wrap) this.select(1); // Right -> Left
        SoundManager.playCursor();
    };

    Window_ActorCommand.prototype.cursorLeft = function (wrap) {
        // 如果1号位不可用，则直接return
        if (!this.isCommandEnabled(1)) return;
        const i = this.index();
        if (i === 3) this.select(1);      // Right -> Left
        else if (i === 0) this.select(1); // Top -> Left
        else if (i === 2) this.select(1); // Bottom -> Left
        // else if (i === 1 && wrap) this.select(3); // Left -> Right
        SoundManager.playCursor();
    };

    // 修复鼠标/触摸点击判定区域
    Window_ActorCommand.prototype.itemRect = function (index) {
        if (index < 0 || index >= 4) return new Rectangle(0, 0, 0, 0);
        const data = this._buttonData[index];
        // 按钮图像放大了3倍，因此设定点击区域为 90x100
        return new Rectangle(data.x, data.y, 90, 100);
    };

    // 防止鼠标悬浮选中已禁用的按钮
    Window_ActorCommand.prototype.hitIndex = function () {
        const index = Window_Command.prototype.hitIndex.call(this);
        if (index >= 0 && !this.isCommandEnabled(index)) {
            return -1;
        }
        return index;
    };

    Window_ActorCommand.prototype.drawItem = function (index) { };
    Window_ActorCommand.prototype.drawAllItems = function () { };
    Window_ActorCommand.prototype.drawItemBackground = function (index) { };
    Window_ActorCommand.prototype.refreshCursor = function () { };

    Window_ActorCommand.prototype.update = function () {
        Window_Command.prototype.update.call(this);
        this.updateButtonStates();
    };

    Window_ActorCommand.prototype.updateButtonStates = function () {
        if (!this.visible || !this.active) return;

        for (let i = 0; i < 4; i++) {
            const sprite = this._buttonSprites[i];
            const isValid = this.isCommandEnabled(i);

            if (i === this.index()) {
                sprite.setColorTone([0, 0, 0, 0]);
            } else {
                if (isValid) {
                    sprite.setColorTone([-30, -30, -30, 255]); // Grayish
                } else {
                    sprite.setColorTone([15, -80, -80, 255]); // Reddish
                }
            }
        }
    };

    Window_ActorCommand.prototype.processOk = function () {
        const i = this.index();
        if (this.isCommandEnabled(i)) {
            this.playOkSound();
            this.updateInputData();
            const symbol = this.commandSymbol(i);
            if (symbol === 'escape') {
                BattleManager.processEscape();
                this.deactivate();
                return;
            }
            this.callOkHandler();
        } else {
            this.playBuzzerSound();
        }
    };

    //-----------------------------------------------------------------------------
    // Scene_Battle Integration
    //-----------------------------------------------------------------------------

    // -----------------------------------------------------------------------------
    // 重写 Window_BattleStatus 以实现和 _paladinStatusWindow 完全一致的外观
    // -----------------------------------------------------------------------------
    const _Window_BattleStatus_initialize = Window_BattleStatus.prototype.initialize;
    Window_BattleStatus.prototype.initialize = function (rect) {
        _Window_BattleStatus_initialize.call(this, rect);
        this.opacity = 0; // 窗口背景完全透明

        this._images = [
            ImageManager.loadSystem("Data918"),
            ImageManager.loadSystem("Data919"),
            ImageManager.loadSystem("Data956")
        ];
        this._listeningImages = new Set();
        this._refreshListener = this.refresh.bind(this);

        this._renderSprite = new Sprite();
        this.addChildAt(this._renderSprite, 0); // 放在底层

    };

    Window_BattleStatus.prototype.refresh = function () {
        Window_StatusBase.prototype.refresh.call(this);

        const members = $gameParty.battleMembers();
        if (!members || members.length === 0) return;

        if (this._images.some(img => !img.isReady())) {
            this._images.forEach(img => {
                if (!img.isReady() && !this._listeningImages.has(img)) {
                    img.addLoadListener(this._refreshListener);
                    this._listeningImages.add(img);
                }
            });
            return;
        }

        let facesReady = true;
        for (const actor of members) {
            const faceImg = ImageManager.loadSystem("actor" + actor.actorId());
            if (!faceImg.isReady()) {
                facesReady = false;
                if (!this._listeningImages.has(faceImg)) {
                    faceImg.addLoadListener(this._refreshListener);
                    this._listeningImages.add(faceImg);
                }
            }
        }
        if (!facesReady) return;

        if (!this._renderSprite.bitmap || this._renderSprite.bitmap.width !== this.width || this._renderSprite.bitmap.height !== this.height) {
            this._renderSprite.bitmap = new Bitmap(this.width, this.height);
        }
        const bitmap = this._renderSprite.bitmap;
        bitmap.clear();

        const scale = 3;
        const bgImg = ImageManager.loadSystem("Data918");
        const boxW = bgImg.width * scale;
        const gap = 8;
        let startX = 0;
        if (startX < 0) startX = 0;

        for (let i = 0; i < members.length; i++) {
            Window_PaladinPartyStatus.prototype.drawActorStatus.call(this, bitmap, members[i], startX + i * (boxW + gap), 0, scale);
        }

    };

    Window_BattleStatus.prototype.drawItem = function (index) { };
    Window_BattleStatus.prototype.drawItemBackground = function (index) { };
    Window_BattleStatus.prototype.drawDigits = Window_PaladinPartyStatus.prototype.drawDigits;

    Window_BattleStatus.prototype.itemRect = function (index) {
        const scale = 3;
        const boxW = 113 * scale;
        const gap = 8;
        return new Rectangle(index * (boxW + gap), 0, boxW, 105);
    };

    // -----------------------------------------------------------------------------
    // 修改 Scene_Battle 状态栏位置及显示逻辑
    // -----------------------------------------------------------------------------
    Scene_Battle.prototype.statusWindowRect = function () {
        const ph = 114;
        const pw = Graphics.boxWidth;
        const px = 260;
        const py = Graphics.boxHeight - ph;
        return new Rectangle(px, py, pw, ph);
    };

    const _Scene_Battle_updateStatusWindowPosition = Scene_Battle.prototype.updateStatusWindowPosition;
    Scene_Battle.prototype.updateStatusWindowPosition = function () {
        // Override to prevent MZ from sliding the status window
        /*
        const statusWindow = this._statusWindow;
        
        if (statusWindow.x < targetX) {
            statusWindow.x = Math.min(statusWindow.x + 16, targetX);
            // 隐藏 statusWindow
            this._statusWindow.hide();
        }
        if (statusWindow.x > targetX) {
            statusWindow.x = Math.max(statusWindow.x - 16, targetX);
            this._statusWindow.hide();
        }
        */
        if (this.isAnyInputWindowActive()) {
            this._statusWindow.show();
        } else {
            this._statusWindow.hide();
        }
    };

    Scene_Battle.prototype.createCancelButton = function () { };

    //-----------------------------------------------------------------------------
    // Skip Party Command Window (Fight / Escape)
    //-----------------------------------------------------------------------------
    Scene_Battle.prototype.startPartyCommandSelection = function () {
        this.selectNextCommand();
    };

    Scene_Battle.prototype.commandCancel = function () {
        if (BattleManager.actor() === $gameParty.members()[0]) {
            // 如果已经是第一个角色的回合，禁止返回到队伍指令（PartyCommand）
            this._actorCommandWindow.activate();
        } else {
            this.selectPreviousCommand();
        }
    };

    //-----------------------------------------------------------------------------
    // Hide Battle Log & Messages
    //-----------------------------------------------------------------------------
    BattleManager.displayStartMessages = function () { };
    BattleManager.displayEscapeSuccessMessage = function () { };
    BattleManager.displayEscapeFailureMessage = function () { };

    Window_BattleLog.prototype.displayAction = function (subject, item) { };
    Window_BattleLog.prototype.displayItemMessage = function (fmt, subject, item) { };
    Window_BattleLog.prototype.displayCounter = function (target) {
        this.push("performCounter", target);
    };
    Window_BattleLog.prototype.displayReflection = function (target) {
        this.push("performReflection", target);
    };
    Window_BattleLog.prototype.displaySubstitute = function (substitute, target) {
        this.push("performSubstitute", substitute, target);
    };
    Window_BattleLog.prototype.displayFailure = function (target) { };
    Window_BattleLog.prototype.displayCritical = function (target) { };
    Window_BattleLog.prototype.displayMiss = function (target) { };
    Window_BattleLog.prototype.displayEvasion = function (target) { };
    Window_BattleLog.prototype.displayHpDamage = function (target) { };
    Window_BattleLog.prototype.displayMpDamage = function (target) { };
    Window_BattleLog.prototype.displayTpDamage = function (target) { };
    Window_BattleLog.prototype.displayAddedStates = function (target) { };
    Window_BattleLog.prototype.displayRemovedStates = function (target) { };
    Window_BattleLog.prototype.displayChangedBuffs = function (target) { };
    Window_BattleLog.prototype.displayBuffs = function (target, buffs, fmt) { };

    // 禁用掉原本 battlelog 画背景的方法，让其彻底透明
    Window_BattleLog.prototype.drawBackground = function () { };
    Window_BattleLog.prototype.drawLineText = function () { };

    //-----------------------------------------------------------------------------
    // Sprite_Actor & Sprite_Enemy Tweaks
    //-----------------------------------------------------------------------------
    Sprite_Actor.prototype.setActorHome = function (index) {
        const current = $gameParty.battleMembers().length;
        let x = 0;
        let y = 0;

        if (current === 1) {
            if (index === 0) { x = 720; y = 510; }
        } else if (current === 2) {
            if (index === 0) { x = 600; y = 528; }
            if (index === 1) { x = 768; y = 456; }
        } else {
            if (index === 0) { x = 540; y = 540; }
            if (index === 1) { x = 702; y = 510; }
            if (index === 2) { x = 810; y = 438; }
        }

        this.setHome(x, y);
    };

    const _Sprite_Actor_initMembers = Sprite_Actor.prototype.initMembers;
    Sprite_Actor.prototype.initMembers = function () {
        _Sprite_Actor_initMembers.call(this);
        this.scale.x = 3;
        this.scale.y = 3;
        this.anchor.x = 0.5;
        this.anchor.y = 1.0;
    };

    const _Sprite_Enemy_initMembers = Sprite_Enemy.prototype.initMembers;
    Sprite_Enemy.prototype.initMembers = function () {
        _Sprite_Enemy_initMembers.call(this);
        this.scale.x = 3;
        this.scale.y = 3;
        this.anchor.x = 0.5;
        this.anchor.y = 1.0;
    };

    Sprite_Actor.prototype.updateBitmap = function () {
        Sprite_Battler.prototype.updateBitmap.call(this);
        const name = this._actor.battlerName();
        if (this._battlerName !== name) {
            this._battlerName = name;
            this._mainSprite.bitmap = ImageManager.loadSvActor(name);
            this._mainSprite.bitmap.addLoadListener(() => {
                this._mainSprite.setFrame(0, 0, this._mainSprite.bitmap.width, this._mainSprite.bitmap.height);
            });
        }
    };

    Sprite_Actor.prototype.updateFrame = function () {
        Sprite_Battler.prototype.updateFrame.call(this);
        if (this._mainSprite.bitmap && this._mainSprite.bitmap.isReady()) {
            this._mainSprite.setFrame(0, 0, this._mainSprite.bitmap.width, this._mainSprite.bitmap.height);
        }
    };

    // 禁止角色在战斗开始时从右向左滑入
    Sprite_Actor.prototype.moveToStartPosition = function () { };

    // 禁止角色在输入指令或行动时前移/后退
    Sprite_Actor.prototype.stepForward = function () { };
    Sprite_Actor.prototype.stepBack = function () { };

    // 去掉角色的影子并防止报错
    Sprite_Actor.prototype.createShadowSprite = function () { };
    Sprite_Actor.prototype.updateShadow = function () { };

    // 去掉敌人头顶的icon并防止报错
    Sprite_Enemy.prototype.createStateIconSprite = function () {
        // 提供一个虚拟对象，避免原生 setup 等方法找不到
        this._stateIconSprite = { setup: function () { } };
    };
    Sprite_Enemy.prototype.updateStateSprite = function () { };

})();



