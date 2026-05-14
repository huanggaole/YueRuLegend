/*:
 * @target MZ
 * @plugindesc [v1.7] Chinese Paladin 98 Battle System & UI
 * @author AI Assistant
 *
 * @help
 * Implements Paladin 98 style combat layout and indicators.
 * 
 * Required images (place in img/system, all scaled x3):
 * - Action indicator: Data968.png, Data969.png
 * - Target indicator: Data966.png, Data967.png
 */

(() => {
    //-----------------------------------------------------------------------------
    // Window_ActorCommand (原有代码保持不变)
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

        // 角色指令窗口激活时显示红色箭头
        Pal98IndicatorManager.showRedArrow(actor);
    };

    Window_ActorCommand.prototype.cursorDown = function (wrap) {
        // 如果2号位不可用，则直接return
        if (!this.isCommandEnabled(2)) return;
        const i = this.index();
        if (i === 0) this.select(2);      // Top -> Bottom
        else if (i === 1) this.select(2); // Left -> Bottom
        else if (i === 3) this.select(2); // Right -> Bottom
        SoundManager.playCursor();
    };

    Window_ActorCommand.prototype.cursorUp = function (wrap) {
        // 如果0号位不可用，则直接return
        if (!this.isCommandEnabled(0)) return;
        const i = this.index();
        if (i === 2) this.select(0);      // Bottom -> Top
        else if (i === 1) this.select(0); // Left -> Top
        else if (i === 3) this.select(0); // Right -> Top
        SoundManager.playCursor();
    };

    Window_ActorCommand.prototype.cursorRight = function (wrap) {
        // 如果3号位不可用，则直接return
        if (!this.isCommandEnabled(3)) return;
        const i = this.index();
        if (i === 1) this.select(3);      // Left -> Right
        else if (i === 0) this.select(3); // Top -> Right
        else if (i === 2) this.select(3); // Bottom -> Right
        SoundManager.playCursor();
    };

    Window_ActorCommand.prototype.cursorLeft = function (wrap) {
        // 如果1号位不可用，则直接return
        if (!this.isCommandEnabled(1)) return;
        const i = this.index();
        if (i === 3) this.select(1);      // Right -> Left
        else if (i === 0) this.select(1); // Top -> Left
        else if (i === 2) this.select(1); // Bottom -> Left
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
    // Scene_Battle Integration (原有代码保持不变)
    //-----------------------------------------------------------------------------

    // -----------------------------------------------------------------------------
    // 重写 Window_BattleStatus 以实现和 _paladinPartyStatus 完全一致的外观
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
        if (this.isAnyInputWindowActive()) {
            this._statusWindow.show();
        } else {
            this._statusWindow.hide();
            Pal98IndicatorManager.hideAll();
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
    // Sprite_Actor & Sprite_Enemy Tweaks (原有代码保持不变)
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

    //-----------------------------------------------------------------------------
    // 仙剑98风格头顶指示器实现（红色箭头回合内永久显示）
    //-----------------------------------------------------------------------------
    // 全局指示器状态管理器
    const Pal98IndicatorManager = {
        config: {
            fps: 15,
            frameInterval: 1000 / 15,
            redArrow: {
                offsetX: -24,
                offsetY: -222,
                frames: ['Data968', 'Data969']
            },
            yellowTriangle: {
                offsetX: -24,
                offsetY: -201,
                frames: ['Data966', 'Data967']
            }
        },
        state: {
            redArrow: { visible: false, target: null },
            yellowTriangle: { visible: false, target: null }
        },
        sprites: {},
        currentFrame: 0,
        lastUpdateTime: 0,

        // 初始化指示器
        initialize: function (battleField) {
            // 预加载所有图片
            this.redArrowFrames = this.config.redArrow.frames.map(
                name => ImageManager.loadSystem(name)
            );
            this.yellowTriangleFrames = this.config.yellowTriangle.frames.map(
                name => ImageManager.loadSystem(name)
            );

            // 创建红色行动指示器
            this.sprites.redArrow = new Sprite();
            this.sprites.redArrow.anchor.set(0.5, 1.0);
            this.sprites.redArrow.scale.set(3);
            this.sprites.redArrow.visible = false;
            this.sprites.redArrow.z = 9999; // 绝对最高层
            this.sprites.redArrow.bitmap = this.redArrowFrames[0]; // 初始帧
            battleField.addChild(this.sprites.redArrow);

            // 创建黄色目标指示器
            this.sprites.yellowTriangle = new Sprite();
            this.sprites.yellowTriangle.anchor.set(0.5, 1.0);
            this.sprites.yellowTriangle.scale.set(3);
            this.sprites.yellowTriangle.visible = false;
            this.sprites.yellowTriangle.z = 9999; // 绝对最高层
            this.sprites.yellowTriangle.bitmap = this.yellowTriangleFrames[0]; // 初始帧
            battleField.addChild(this.sprites.yellowTriangle);

            // 重置动画状态
            this.currentFrame = 0;
            this.lastUpdateTime = Date.now();
        },

        // 更新动画和位置
        update: function (battlerSprites) {
            // 15FPS两帧硬切闪烁
            const now = Date.now();
            if (now - this.lastUpdateTime >= this.config.frameInterval) {
                this.currentFrame = 1 - this.currentFrame;
                this.lastUpdateTime = now;

                if (this.sprites.redArrow.visible) {
                    this.sprites.redArrow.bitmap = this.redArrowFrames[this.currentFrame];
                }
                if (this.sprites.yellowTriangle.visible) {
                    this.sprites.yellowTriangle.bitmap = this.yellowTriangleFrames[this.currentFrame];
                }
            }

            // 更新红色箭头位置（独立更新，不受黄色三角影响）
            if (this.state.redArrow.visible && this.state.redArrow.target) {
                const sprite = battlerSprites.find(
                    s => s._battler && s._battler === this.state.redArrow.target
                );
                if (sprite) {
                    this.sprites.redArrow.x = sprite.x + this.config.redArrow.offsetX;
                    this.sprites.redArrow.y = sprite.y + this.config.redArrow.offsetY;
                    this.sprites.redArrow.visible = true;
                } else {
                    this.sprites.redArrow.visible = false;
                }
            } else {
                this.sprites.redArrow.visible = false;
            }

            // 更新黄色三角位置（独立更新）
            if (this.state.yellowTriangle.visible && this.state.yellowTriangle.target) {
                const sprite = battlerSprites.find(
                    s => s._battler && s._battler === this.state.yellowTriangle.target
                );
                if (sprite) {
                    this.sprites.yellowTriangle.x = sprite.x + this.config.yellowTriangle.offsetX;
                    this.sprites.yellowTriangle.y = sprite.y + this.config.yellowTriangle.offsetY;
                    this.sprites.yellowTriangle.visible = true;
                } else {
                    this.sprites.yellowTriangle.visible = false;
                }
            } else {
                this.sprites.yellowTriangle.visible = false;
            }
        },

        // 显示红色箭头（仅在角色回合开始时调用）
        showRedArrow: function (target) {
            this.state.redArrow.visible = true;
            this.state.redArrow.target = target;
            Pal98IndicatorManager.hideYellowTriangle();
        },

        // 显示黄色三角（选人时调用，不影响红色箭头）
        showYellowTriangle: function (target) {
            this.state.yellowTriangle.visible = true;
            this.state.yellowTriangle.target = target;
        },

        // 只隐藏黄色三角（确认/取消选人时调用）
        hideYellowTriangle: function () {
            this.state.yellowTriangle.visible = false;
            this.state.yellowTriangle.target = null;
        },

        // 隐藏所有指示器（角色行动结束/战斗结束时调用）
        hideAll: function () {
            this.state.redArrow.visible = false;
            this.state.redArrow.target = null;
            this.state.yellowTriangle.visible = false;
            this.state.yellowTriangle.target = null;
        }
    };

    // 在战斗精灵集创建完成后初始化指示器
    const _Spriteset_Battle_createBattleField = Spriteset_Battle.prototype.createBattleField;
    Spriteset_Battle.prototype.createBattleField = function () {
        _Spriteset_Battle_createBattleField.call(this);
        Pal98IndicatorManager.initialize(this._battleField);
    };

    // 重写战斗场景更新方法
    const _Scene_Battle_update = Scene_Battle.prototype.update;
    Scene_Battle.prototype.update = function () {
        _Scene_Battle_update.call(this);
        if (this._spriteset) {
            Pal98IndicatorManager.update(this._spriteset.battlerSprites());
        }
    };

    const _Window_BattleActor_select = Window_BattleActor.prototype.select;
    Window_BattleActor.prototype.select = function (index) {
        console.error("Window_BattleActor_select", index);
        _Window_BattleActor_select.call(this, index);
        if (index >= 0 && index < $gameParty.battleMembers().length) {
            Pal98IndicatorManager.showYellowTriangle($gameParty.battleMembers()[index]);
        } else {
            Pal98IndicatorManager.hideYellowTriangle();
        }
    };

    // 敌人目标闪烁效果，我方目标显示选人三角
    const _Sprite_Battler_updateSelectionEffect = Sprite_Battler.prototype.updateSelectionEffect;
    Sprite_Battler.prototype.updateSelectionEffect = function () {
        if (this._battler.isActor()) {
        } else {
            _Sprite_Battler_updateSelectionEffect.call(this)
        }
    };

    // 取消选择我方目标（取消物品/技能使用）
    const _Scene_Battle_onActorCancel = Scene_Battle.prototype.onActorCancel;
    Scene_Battle.prototype.onActorCancel = function () {
        _Scene_Battle_onActorCancel.call(this);
        Pal98IndicatorManager.hideYellowTriangle();
    };

    // 确认选择我方目标时触发
    const _Scene_Battle_onActorOk = Scene_Battle.prototype.onActorOk;
    Scene_Battle.prototype.onActorOk = function () {
        // 在这里添加确认我方目标前的逻辑
        _Scene_Battle_onActorOk.call(this);
        // 在这里添加确认我方目标后的逻辑
        Pal98IndicatorManager.hideYellowTriangle();
    };

    // 第一重保险：新回合开始时立即隐藏所有指示器
    // const _BattleManager_startTurn = BattleManager.startTurn;
    // BattleManager.startTurn = function () {
    //     Pal98IndicatorManager.hideAll();
    //     _BattleManager_startTurn.call(this);
    // };

    // // 第二重保险：新角色输入阶段开始时隐藏黄色三角
    // const _BattleManager_startInput = BattleManager.startInput;
    // BattleManager.startInput = function () {
    //     Pal98IndicatorManager.hideYellowTriangle();
    //     _BattleManager_startInput.call(this);
    // };

})();