/*:
 * @target MZ
 * @plugindesc [v1.1] 仙剑98柔情版战斗杂项菜单（下按钮：围攻/道具/防御/逃跑/状态）
 * @author AI Assistant
 *
 * @help
 * 复刻仙剑98柔情版战斗主菜单的“杂项”子菜单（uibattle.c PAL_BattleUIDrawMiscMenu）：
 * 指令盘下按钮（旗图标）弹出五项菜单——围攻/道具/防御/逃跑/状态。
 *
 * ===== 实现方式 =====
 * 菜单窗 Window_PalBattleMisc 直接继承地图 ESC 菜单的 Window_PaladinMenuBase，
 * 底板素材与九宫格拉伸完全一致（Data90~98，平铺式拉伸，呼吸选中字）。
 * 原版布局：框在左上角 PAL_XY(2,20)（320 坐标 → 本工程 ×3），五个选项纵向排列。
 *
 * ⚠ 原版 98 柔情版（非 PAL_CLASSIC，uibattle.c 378-385）的顺序是
 *   【道具(5) / 防御(58) / 围攻(56) / 逃跑(59) / 状态(60)】——围攻在【第 3 项】。
 *   词条已用 WORD_chs.txt 核对：56=围攻 57=道具 58=防御 59=逃跑 60=状态。
 *   本工程把「围攻」放在第 1 项（PalBattleMisc.MENU_ORDER，可运行时改），
 *   改回原版顺序只需：PalBattleMisc.setMenuOrder(["item","guard","autoatk","escape","status"])。
 *
 * 各选项行为（对照 sdlpal uibattle.c 1359-1426）：
 *  · 围攻：原版 fAutoAttack（uibattle.c 1386-1392 第 3 项 kBattleMenuAuto），
 *          由 palBattleAuto.js 实现——全员自动普攻，右上角金色「围攻」，
 *          按 ESC 或再选一次取消；跨回合保持（fight.c 1446）。
 *          ⚠ 围攻 ≠ 合体技：合体技是右侧按钮（kBattleActionCoopMagic，palBattleCoop.js）。
 *  · 道具：原版还有二级菜单 kBattleMenuMiscItemSubMenu —— 【使用】/【投掷】；
 *          这里照做，两个子项分别以 battle_use / battle_throw 模式打开道具窗。
 *  · 防御：kBattleActionDefend → PAL_BattleCommitAction；
 *          伤害侧由 palBattleCore 处理（防御时 def×2，原版 fight.c 4956）。
 *  · 逃跑：kBattleActionFlee → BattleManager.processEscape。
 *          能否逃跑只看事件的「可以逃跑」开关（BattleManager.canEscape），
 *          开关关掉时该菜单项直接置灰；不再按队伍/敌人 ID 判 BOSS。
 *  · 状态：原版是 PAL_PlayerStatus() —— 在战斗画面上【叠加】状态面板，不是切场景。
 *          这里复用地图状态页的 Window_PalStatus 作为战斗内窗口叠加显示。
 *
 * ===== 复用情况 =====
 *  · 状态：Window_PalStatus（palStatus.js）100% 复用，只加一层输入外壳。
 *  · 道具：列表沿用 Window_PaladinItemList（palItemList.js）的底板绘制与过滤，
 *          但几何整体换成原版 PAL 网格（见下方 PAL_ITEM）；说明部分不再用
 *          Window_PaladinItemHelp，改成 Window_PalBattleItemDesc —— 因为原版
 *          的图标框是【后画】并盖住底框下缘，必须是一个能压住列表框的覆盖层。
 *          目标选择仍走 MZ 的 Scene_Battle.onItemOk。
 *
 * 需排在 palBattle / palBattleCoop 之后加载（依赖 Window_PaladinMenuBase、
 * PalBattleCoop、Window_PalStatus、Window_PaladinItemList）。
 */

(() => {
    const PalBattleMisc = (window.PalBattleMisc = {});

    //-----------------------------------------------------------------------------
    // Window_PalBattleMisc（继承地图菜单基类：同素材同九宫格拉伸）
    //-----------------------------------------------------------------------------

    function Window_PalBattleMisc() {
        this.initialize(...arguments);
    }
    Window_PalBattleMisc.prototype = Object.create(Window_PaladinMenuBase.prototype);
    Window_PalBattleMisc.prototype.constructor = Window_PalBattleMisc;

    // 菜单项顺序。原版 98 柔情版（uibattle.c 378-385）是
    //   道具 / 防御 / 围攻 / 逃跑 / 状态
    // 本工程把「围攻」提到第 1 项。运行时改：
    //   PalBattleMisc.setMenuOrder(["item","guard","autoatk","escape","status"])
    const MENU_ORDER = (PalBattleMisc.MENU_ORDER = [
        "autoatk", "item", "guard", "escape", "status"
    ]);

    PalBattleMisc.setMenuOrder = function (order) {
        if (!Array.isArray(order) || !order.length) return MENU_ORDER;
        MENU_ORDER.length = 0;
        for (const s of order) MENU_ORDER.push(s);
        const scene = SceneManager._scene;
        if (scene && scene._palMiscWindow) scene._palMiscWindow.refresh();
        return MENU_ORDER;
    };

    const MENU_TEXT = {
        autoatk: "围攻", item: "道具", guard: "防御", escape: "逃跑", status: "状态"
    };

    Window_PalBattleMisc.prototype.makeCommandList = function () {
        const actor = BattleManager.actor();
        const movable = actor ? actor.canMove() : false;
        // 原版五项一律可选（uibattle.c 378-385：enabled 全 TRUE）；
        // 本工程只按"能否行动"禁用道具/防御，逃跑另看事件的「可以逃跑」开关
        const enabled = { autoatk: true, item: movable, guard: movable,
                          escape: BattleManager.canEscape(), status: true };
        for (const symbol of MENU_ORDER) {
            this.addCommand(MENU_TEXT[symbol] || symbol, symbol, enabled[symbol]);
        }
    };

    // 与地图菜单一致的行高（呼吸字选中效果由 Window_PaladinBase 提供）
    Window_PalBattleMisc.prototype.lineHeight = function () {
        return 48;
    };

    window.Window_PalBattleMisc = Window_PalBattleMisc;

    //-----------------------------------------------------------------------------
    // Window_PalBattleItemSub：道具的二级菜单（使用 / 投掷）
    //-----------------------------------------------------------------------------

    function Window_PalBattleItemSub() {
        this.initialize(...arguments);
    }
    Window_PalBattleItemSub.prototype = Object.create(Window_PaladinMenuBase.prototype);
    Window_PalBattleItemSub.prototype.constructor = Window_PalBattleItemSub;

    Window_PalBattleItemSub.prototype.makeCommandList = function () {
        this.addCommand("使用", "use", true);
        this.addCommand("投掷", "throw", true);
    };

    Window_PalBattleItemSub.prototype.lineHeight = function () {
        return 48;
    };

    //-----------------------------------------------------------------------------
    // Window_PalBattleStatus：战斗内状态面板
    // 原版 PAL_PlayerStatus() 是叠加在战斗画面上的；这里复用地图状态页的
    // Window_PalStatus 绘制，外面套一层输入处理（左右/上下翻人，取消关闭）。
    // 不用 SceneManager.push(Scene_PalStatus)：那会把战斗场景整个顶掉。
    //-----------------------------------------------------------------------------

    function Window_PalBattleStatus() {
        this.initialize(...arguments);
    }
    Window_PalBattleStatus.prototype = Object.create(Window_PalStatus.prototype);
    Window_PalBattleStatus.prototype.constructor = Window_PalBattleStatus;

    Window_PalBattleStatus.prototype.initialize = function (rect) {
        Window_PalStatus.prototype.initialize.call(this, rect);
        this._actorIndex = 0;
        this._isOpen = false;
        this.hide();
    };

    Window_PalBattleStatus.prototype.isOpen = function () {
        return this._isOpen;
    };

    Window_PalBattleStatus.prototype.showStatus = function () {
        this._actorIndex = 0;
        this._isOpen = true;
        this.refreshActor();
        this.show();
    };

    Window_PalBattleStatus.prototype.hideStatus = function () {
        this._isOpen = false;
        this.hide();
    };

    Window_PalBattleStatus.prototype.refreshActor = function () {
        const members = $gameParty.members();
        if (!members.length) return;
        if (this._actorIndex >= members.length) this._actorIndex = members.length - 1;
        if (this._actorIndex < 0) this._actorIndex = 0;
        this.setActor(members[this._actorIndex]);
        this.refresh();
    };

    Window_PalBattleStatus.prototype.update = function () {
        Window_PalStatus.prototype.update.call(this);
        if (!this._isOpen) return;
        const last = $gameParty.members().length - 1;
        if (Input.isTriggered("cancel") || Input.isTriggered("escape") ||
            Input.isTriggered("menu")) {
            SoundManager.playCancel();
            this.processCancel();
        } else if (Input.isTriggered("ok") || Input.isTriggered("right") ||
                   Input.isTriggered("down")) {
            SoundManager.playCursor();
            if (this._actorIndex < last) {
                this._actorIndex++;
                this.refreshActor();
            } else {
                this.processCancel(); // 最后一人再按 → 退出（与地图一致）
            }
        } else if (Input.isTriggered("left") || Input.isTriggered("up")) {
            SoundManager.playCursor();
            if (this._actorIndex > 0) {
                this._actorIndex--;
                this.refreshActor();
            } else {
                this.processCancel();
            }
        }
    };

    Window_PalBattleStatus.prototype.processCancel = function () {
        this.hideStatus();
        const scene = SceneManager._scene;
        if (scene && scene.onPalStatusCancel) scene.onPalStatusCancel();
    };

    //-----------------------------------------------------------------------------
    // Scene_Battle：菜单创建与选项处理
    //-----------------------------------------------------------------------------

    const _Scene_Battle_create = Scene_Battle.prototype.create;
    Scene_Battle.prototype.create = function () {
        _Scene_Battle_create.call(this);
        this.createPalMiscWindow();
        this.createPalItemSubWindow();
        this.createPalStatusWindow();
    };

    // 原版布局：框在左上角 PAL(2,20)（320坐标 ×3）；36=顶部框内边距，
    // 5 行 × 48 + 底部边框 ≈ 336 高
    Scene_Battle.prototype.createPalMiscWindow = function () {
        const k = Graphics.boxWidth / 320;
        const rect = new Rectangle(Math.round(2 * k), Math.round(20 * k), 216, 336);
        this._palMiscWindow = new Window_PalBattleMisc(rect);
        this._palMiscWindow.setHandler("autoatk", this.onMiscAutoAtk.bind(this));
        this._palMiscWindow.setHandler("item", this.onMiscItem.bind(this));
        this._palMiscWindow.setHandler("guard", this.onMiscGuard.bind(this));
        this._palMiscWindow.setHandler("escape", this.onMiscEscape.bind(this));
        this._palMiscWindow.setHandler("status", this.onMiscStatus.bind(this));
        this._palMiscWindow.setHandler("cancel", this.onMiscCancel.bind(this));
        // 必须同时 deactivate：MZ 的窗口默认 active=true，只 hide() 的话
        // isAnyInputWindowActive() 会恒为 true，战斗指令流程会被彻底卡死
        //（详见下方 isAnyInputWindowActive 的说明）。
        this._palMiscWindow.hide();
        this._palMiscWindow.deactivate();
        this.addWindow(this._palMiscWindow);
    };

    // 道具的二级菜单（使用 / 投掷）：与杂项菜单同款底板，挂在杂项菜单右侧
    // 高度 = 行数 × lineHeight + 上下边框余量 96（与 5 行的杂项菜单同算法，
    // 原来写死 144 导致第二行“投掷”压在底边框上）
    Scene_Battle.prototype.createPalItemSubWindow = function () {
        const k = Graphics.boxWidth / 320;
        const rows = 2;
        const rect = new Rectangle(Math.round(2 * k), Math.round(20 * k), 216, rows * 48 + 96);
        this._palItemSubWindow = new Window_PalBattleItemSub(rect);
        this._palItemSubWindow.setHandler("use", this.onItemSubUse.bind(this));
        this._palItemSubWindow.setHandler("throw", this.onItemSubThrow.bind(this));
        this._palItemSubWindow.setHandler("cancel", this.onItemSubCancel.bind(this));
        this._palItemSubWindow.hide();
        this._palItemSubWindow.deactivate();
        this.addWindow(this._palItemSubWindow);
    };

    Scene_Battle.prototype.onItemSubCancel = function () {
        this.closePalItemSub();
        this._actorCommandWindow.activate();
    };

    // 战斗内状态面板（全屏，复用地图状态页的绘制）
    Scene_Battle.prototype.createPalStatusWindow = function () {
        const rect = new Rectangle(0, 0, Graphics.boxWidth, Graphics.boxHeight);
        this._palStatusWindow = new Window_PalBattleStatus(rect);
        this.addWindow(this._palStatusWindow);
    };

    //-----------------------------------------------------------------------------
    // 战斗道具窗：换成仙剑道具列表 UI（palItemList.js）
    //-----------------------------------------------------------------------------

    //=============================================================================
    // 原版道具列表几何（itemmenu.c 51-133）
    // ----------------------------------------------------------------------------
    // 中文版 gConfig.dwWordLength = 10（palcfg.c 570），代入 itemmenu.c 的五个常量：
    //   iItemsPerLine  = 32 / 10      = 3      每行 3 个
    //   iItemTextWidth = 8 * 10 + 20  = 100    每格 100 PAL 宽
    //   iLinesPerPage  = 7 - 0        = 7      7 行（ExtraItemDescLines 默认 0）
    //   iCursorXOffset = 10 * 5 / 2   = 25     光标 x = 15 + 25 + 100k = 40 + 100k
    //   iAmountXOffset = 10 * 8 + 1   = 81     数字右缘 = 15+81+6*2 = 108 + 100k
    // 列表框 = PAL_CreateBoxWithShadow(PAL_XY(2,0), iLinesPerPage-1 = 6, 17, 1, FALSE, 0)
    //   边框瓦片（style 1，Data99~Data917）：上 22×20 / 中 22×18 / 下 22×22，
    //   中间列 16 宽。"Border takes 2 additional rows and columns" →
    //   宽 = 22 + 17*16 + 22 = 316，高 = 20 + 6*18 + 22 = 150。
    //   ⚠ 7 行文字只占 y 12..138，框却到 150 —— 底框因此比文字长一截，
    //     这就是"底框是长的"。
    // 图标框 = SPRITENUM_ITEMBOX(=70 → Data970) 64×64，画在 PAL_XY(0,140)，
    //   而且是【画完列表框之后】才画的（itemmenu.c 196-204）→ 盖住底框下缘 10px。
    // 坐标一律是 320×200 PAL 空间，绘制时统一 ×k（k = Graphics.boxWidth / 320）。
    //=============================================================================
    const PAL_ITEM = {
        boxX: 2, boxY: 0, boxW: 316, boxH: 150,
        // ⚠ textY = 6 而不是原版的 12：
        // 原版 PAL 的文字是"字形顶对齐坐标"的（12 + 18*行），但 MZ 的
        // Bitmap.drawText 会把字形顶放到 y + lineHeight/2 + fontSize*0.35 处
        //（rmmz_core.js 1668），也就是会往下掉约 31px。数字和光标是图片
        //（blt，不受影响），所以整块只能靠 textY 统一上提 6 PAL（≈18px）来补偿，
        // 否则第一行会离框顶太远 —— 表现为"选项的上留白明显多于下留白"。
        textX: 15, textY: 6, cellW: 100, cellH: 18, glyphH: 12,
        cursorX: 40, cursorY: 22, cursorW: 9, cursorH: 6,      // SPRITENUM_CURSOR=69 → Data969
        // ⚠ qtyDy / cursorDy 是**相对文字行顶**的固定偏移（原版：文字 y=12、
        // 数字 y=17、光标 y=22），必须写成常量。之前写成 `qtyY - textY` 是错的：
        // textY 后来为了补偿 MZ drawText 的排版被整体从 12 调到 6，
        // 一相减那个补偿量就被带进数字里，数字整体掉了 28px（实测名字 ink
        // [17,53] 却画在 [51,75]）。
        qtyDy: 2, cursorDy: 10,
        qtyDigits: 2, qtyDigitW: 6, qtyX: 96, qtyRight: 108,
        iconBoxX: 0, iconBoxY: 140, iconBoxW: 64, iconBoxH: 64, // SPRITENUM_ITEMBOX=70 → Data970
        iconX: 8, iconY: 147, iconSize: 48,
        descX: 75, descY: 150, descStep: 16
    };
    const palK = () => Graphics.boxWidth / 320;
    const kPal = (v) => Math.round(v * palK());

    const PAL_ITEM_FONT_SIZE = () => kPal(PAL_ITEM.glyphH); // 原版 12px 字 × k


    // 选中时的呼吸色（与 palItemList 内部保持一致）
    const ITEM_SELECTED_COLORS = ["#FFF8E0", "#E8D8A0", "#FFF8E0", "#FFFFFF"];

    // 战斗中「用了也没作用」的道具：RMMZ effects 为空 **且** 原版 ScriptOnUse 里
    // 没有战斗类 opcode（只有 0x0038 传送 / 0x0062 停追 / 0x0063 引怪 之类的地图指令）。
    // 清单由 tools/pal_audit_item_battleuse.py 生成；投掷模式不受此限制
    //（天师符/五灵符这类原版是 throwable，该出现在投掷列表里）。
    const PAL_NO_BATTLE_ITEM_IDS = {
        55: true, 56: true, 57: true, 59: true, 64: true, 69: true,
        72: true, 73: true, 74: true, 75: true, 76: true, 77: true,
        78: true, 79: true, 96: true, 103: true, 104: true
    };

    //-----------------------------------------------------------------------------
    // 「使用 / 投掷」资格表 —— 直接取原版 OBJECT_ITEM.wFlags（uibattle.c 1415-1423：
    //   使用 → PAL_ItemSelectMenuInit(kItemFlagUsable)     → 只列 usable    (bit0)
    //   投掷 → PAL_ItemSelectMenuInit(kItemFlagThrowable)  → 只列 throwable (bit2)
    // 所以透骨钉/无影神针这类「伤害敌人的道具」原版 usable=0、throwable=1：
    // 使用列表里必须禁用，投掷列表里才亮。武器同理（除天蛇杖外全部 throwable=1）。
    // 清单由 tools/pal_gen_throw_tables.py 从 Objects.csv 的 Word6 生成。
    //-----------------------------------------------------------------------------

    const PAL_USABLE_ITEM = {
        1: true, 2: true, 3: true, 4: true, 5: true, 6: true,
        7: true, 8: true, 9: true, 10: true, 11: true, 12: true,
        13: true, 14: true, 15: true, 16: true, 17: true, 18: true,
        19: true, 20: true, 21: true, 22: true, 23: true, 24: true,
        25: true, 26: true, 27: true, 28: true, 29: true, 30: true,
        31: true, 32: true, 33: true, 34: true, 35: true, 36: true,
        37: true, 38: true, 39: true, 40: true, 41: true, 42: true,
        43: true, 44: true, 45: true, 46: true, 47: true, 48: true,
        49: true, 50: true, 51: true, 52: true, 53: true, 55: true,
        56: true, 57: true, 58: true, 59: true, 62: true, 81: true,
        82: true, 83: true, 84: true, 85: true, 86: true, 87: true,
        88: true, 89: true, 90: true, 91: true, 92: true, 93: true,
        94: true, 95: true, 97: true, 99: true, 101: true, 102: true,
        106: true, 107: true, 108: true, 109: true, 110: true, 111: true,
        113: true, 114: true, 117: true, 118: true, 119: true, 120: true,
        124: true, 125: true, 128: true, 129: true
    };  // 94 项（6 金疮药=原版「金创药」101、107 破天槌=原版「破天锤」279，名称异体补录）
    const PAL_USABLE_WEAPON = {};   // 武器原版都不可「使用」，只能装备/投掷
    const PAL_THROWABLE_ITEM = {
        3: true, 24: true, 40: true, 42: true, 43: true, 49: true,
        53: true, 61: true, 62: true, 63: true, 64: true, 65: true,
        66: true, 67: true, 68: true, 69: true, 70: true, 71: true,
        72: true, 73: true, 74: true, 75: true, 76: true, 77: true,
        78: true, 79: true, 80: true, 81: true, 82: true, 83: true,
        84: true, 85: true, 86: true, 87: true, 88: true, 89: true,
        90: true, 91: true, 92: true, 93: true, 94: true, 95: true,
        96: true, 97: true, 98: true, 99: true, 100: true, 101: true,
        102: true, 103: true, 104: true
    };  // 51 项（80 爆裂蛊=原版对象 146，异体名补录）
    const PAL_THROWABLE_WEAPON = {
        1: true, 2: true, 3: true, 4: true, 5: true, 6: true,
        7: true, 8: true, 9: true, 10: true, 11: true, 12: true,
        13: true, 14: true, 15: true, 16: true, 17: true, 18: true,
        19: true, 20: true, 21: true, 22: true, 23: true, 24: true,
        25: true, 26: true, 27: true, 28: true, 29: true, 31: true,
        32: true, 33: true
    };  // 32 项（缺 30 天蛇杖：原版 throwable=0）

    function Window_PalBattleItemList() {
        this.initialize(...arguments);
    }
    Window_PalBattleItemList.prototype = Object.create(Window_PaladinItemList.prototype);
    Window_PalBattleItemList.prototype.constructor = Window_PalBattleItemList;

    //-----------------------------------------------------------------------------
    // 几何覆盖：把 MZ 的"窗口内边距 + 自适应格子"换成原版的固定 PAL 网格
    //  · padding = 0 → 绘制原点 = 窗口左上角（窗口本身就在 PAL(2,0)），
    //    于是 contents 坐标 = 屏幕坐标 - (2k, 0)，itemRect 直接算得出来
    //  · 行高 18 / 格宽 100 / 字高 12，全部 ×k
    //  · 7 个可见行：innerHeight(继承 palItemList = 7×itemHeight) / itemHeight = 7
    //-----------------------------------------------------------------------------

    Window_PalBattleItemList.prototype.updatePadding = function () {
        this.padding = 0;
    };

    Window_PalBattleItemList.prototype.lineHeight = function () {
        return kPal(PAL_ITEM.glyphH);
    };

    Window_PalBattleItemList.prototype.itemHeight = function () {
        return kPal(PAL_ITEM.cellH);
    };

    Window_PalBattleItemList.prototype.colSpacing = function () {
        return 0;
    };

    Window_PalBattleItemList.prototype.rowSpacing = function () {
        return 0;
    };

    Window_PalBattleItemList.prototype.itemPadding = function () {
        return 0;
    };

    // ⚠ 列表框也必须【不写 stencil】。
    // MZ 的 WindowLayer.render（rmmz_core.js 4297-4326）渲染顺序是
    // "index 大的先、index 小的后"，而每渲染完一个窗口会把它整个矩形写进
    // stencil = 1；后渲染的窗口只在 stencil == 0 的地方画。
    // 于是「说明层盖住列表框底框」这件事，只有在【两者都不写 stencil】时才成立：
    //   列表框（index 大）先渲染 → 说明层（index 小）后渲染 → 说明层盖上去。
    // 之前只清掉说明层的 drawShape 是不够的 —— 列表框照样把它挖掉了
    //（症状：图标框顶部被道具列表的底框切平）。
    Window_PalBattleItemList.prototype.drawShape = function () { };

    // 内容裁剪区：原版 7 行文字只占到 PAL y = 12 + 7*18 = 138，再往下就是底框。
    // 裁到 138（=414px）才不会让 MZ 多画出来的第 8 行从底框里穿出来。
    // 顺带 maxPageRows() = floor(414/54) = 7，正好是原版的 iLinesPerPage。
    Object.defineProperty(Window_PalBattleItemList.prototype, "innerHeight", {
        get: function () {
            // 严格 7 行：PAL y = textY + 7*18。再多就会把第 8 行的头露在底框里，
            //（MZ 的 pickTopIndex/maxPageRows 也靠这个算出 7 行翻页）。
            // 第 7 行的文字底 ≈ rect.y + 30 + 字形高，仍在裁剪区内，不会被切。
            return Math.round((PAL_ITEM.textY + 7 * PAL_ITEM.cellH) * (Graphics.boxWidth / 320));
        },
        configurable: true
    });

    // 内容位图高度 = 裁剪区高度（411），不沿用 MZ 的 innerHeight + itemHeight。
    // MZ 靠 AlphaFilter 的 filterArea 裁内容，那不是真裁剪；位图本身高度才是
    // 硬边界。锁到 411 之后，第 8 行（y≥414）压根画不到位图上，
    // 不可能从底框里穿出来。
    Window_PalBattleItemList.prototype.contentsHeight = function () {
        return this.innerHeight;
    };

    // 让 MZ 的滚动量恰好是「整行 × itemHeight」，与原版 itemmenu.c 的
    // iPageLineOffset 整行翻页一致（否则会滚出半行，格子对不上）
    Window_PalBattleItemList.prototype.overallHeight = function () {
        const extra = Math.max(0, this.maxRows() - this.maxPageRows());
        return this.innerHeight + extra * this.itemHeight();
    };

    // 原版格子：文字在 PAL_XY(15 + 100*col, 12 + 18*row)
    Window_PalBattleItemList.prototype.itemRect = function (index) {
        const cols = this.maxCols();
        const col = index % cols;
        const row = Math.floor(index / cols);
        const x = kPal(PAL_ITEM.textX - PAL_ITEM.boxX) + col * kPal(PAL_ITEM.cellW);
        const y = kPal(PAL_ITEM.textY) + row * kPal(PAL_ITEM.cellH) - this.scrollBaseY();
        return new Rectangle(x, y, kPal(PAL_ITEM.cellW), kPal(PAL_ITEM.cellH));
    };

    Window_PalBattleItemList.prototype.drawItem = function (index) {
        const item = this.itemAt(index);
        if (!item) return;
        const rect = this.itemRect(index);
        this.contents.clearRect(rect.x, rect.y, rect.width, rect.height);
        if (!this._itemsVisible) return;

        const enabled = this.isEnabled(item);
        const selected = index === this.index();
        this.contents.outlineWidth = 0;

        let textColor = "#C4B8AC";
        if (!enabled && !selected) textColor = "#CF6A5A";
        if (!enabled && selected) textColor = "#FCAC9C";
        if (enabled && selected) {
            textColor = this.active ? ITEM_SELECTED_COLORS[Math.floor(Date.now() / 150) % ITEM_SELECTED_COLORS.length] : "#FFF8E0";
        }

        // 名字区：原版名字画在 PAL x=15，数字左缘在 x=96（占 96..108）
        // → 名字可用宽度 = 96 - 15 = 81 PAL（5 个汉字 60 PAL、6 个才 72 PAL，放得下）
        // ⚠ rect.x 已经就是文字起点（15 PAL），所以宽度直接用 81 PAL，
        //   不能再拿"整格宽 100 PAL"去减 —— 那样只剩 19 PAL，
        //   MZ 的 drawText 会把文字横向压缩（maxWidth/textWidth 缩放），
        //   看起来就是"字被挤成一团、发虚"。
        const nameWidth = Math.max(1, (PAL_ITEM.qtyX - PAL_ITEM.textX) * palK());
        this.contents.fontSize = PAL_ITEM_FONT_SIZE();
        this.contents.textColor = "#000000";
        this.contents.drawText(item.name, rect.x + 2, rect.y + 2, nameWidth, this.lineHeight());
        this.contents.textColor = textColor;
        this.contents.drawText(item.name, rect.x, rect.y, nameWidth, this.lineHeight());

        const quantity = $gameParty.numItems(item);
        if (quantity > 1) {
            // 原版 PAL_DrawNumber(kNumAlignRight, 2 位)：数字占 [96+100col, 108+100col]
            // ⚠ 窗口原点在 PAL(2,0)，所以 contents 坐标要减掉 boxX
            const left = kPal(PAL_ITEM.qtyX - PAL_ITEM.boxX) +
                (index % this.maxCols()) * kPal(PAL_ITEM.cellW);
            this.blitQuantityDigits(quantity, left, rect.y + kPal(PAL_ITEM.qtyDy));
        }

        // 原版光标 SPRITENUM_CURSOR 画在 PAL_XY(40 + 100*col, 22 + 18*row)
        //（itemmenu.c 54/191：iCursorXOffset = dwWordLength*5/2 = 25，固定 +25 PAL，
        //  即"指向第二个字的末尾"——原版字形宽 15 PAL）。
        // 本工程字形宽 12 PAL（fontSize 36），2 字名只有 24 PAL 宽，固定 +25 会指到
        // 名字外 —— 短名字时按名字实际宽度贴末尾，3 字及以上保持原版固定 25。
        if (selected) {
            const namePal = item.name.length * PAL_ITEM.glyphH;
            const curOff = Math.min(PAL_ITEM.cursorX - PAL_ITEM.textX, namePal);
            const cx = rect.x + kPal(curOff);
            const cy = rect.y + kPal(PAL_ITEM.cursorDy);
            this.blitCursor(cx, cy);
        }
    };

    // 数量数字：右缘 = 108 + 100*col，每位 6 PAL 宽，最多 2 位（原版 PAL_DrawNumber）
    Window_PalBattleItemList.prototype.blitQuantityDigits = function (quantity, leftX, y) {
        if (this._digitImages.some(img => !img.isReady())) {
            this._digitImages.forEach(img => {
                if (!img.isReady() && !this._listeningImages.has(img)) {
                    img.addLoadListener(() => this.refresh());
                    this._listeningImages.add(img);
                }
            });
            return;
        }
        const k = palK();
        const dw = kPal(PAL_ITEM.qtyDigitW);
        const dh = Math.round(this._digitImages[0].height * k);
        const str = Math.min(Math.abs(quantity) | 0, 99).toString().slice(-PAL_ITEM.qtyDigits);
        // 右对齐：最末位右缘贴 leftX + 2*6
        let cx = leftX + PAL_ITEM.qtyDigits * dw;
        for (let i = str.length - 1; i >= 0; i--) {
            const img = this._digitImages[parseInt(str[i])];
            cx -= dw;
            this.contents.blt(img, 0, 0, img.width, img.height, cx, y, dw, dh);
        }
    };

    Window_PalBattleItemList.prototype.blitCursor = function (x, y) {
        if (!this._palCursorImage) this._palCursorImage = ImageManager.loadSystem("Data969");
        const img = this._palCursorImage;
        if (!img.isReady()) {
            if (!this._palCursorImageListening) {
                this._palCursorImageListening = true;
                img.addLoadListener(() => this.refresh());
            }
            return;
        }
        const k = palK();
        // 原版把光标本身再画一份 +1,+1 的阴影（itemmenu.c 251 后跟 shadow blit 不含光标；
        // 此处按 SPRITENUM_CURSOR 原尺寸直接贴）
        this.contents.blt(img, 0, 0, img.width, img.height, x, y,
            Math.round(img.width * k), Math.round(img.height * k));
    };

    // 投掷伤害表（原版 ScriptOnThrow = Objects.csv Word4 解析结果）：
    //   0x0021 [范围, 伤害] → 固定扣血，无视防御/抗性
    //   0x0042 → 只播特效不造成伤害；0x0066 → 投掷武器：值 = 倍率×5 + 角色武力×rand(0,3)
    //   ⚠ 上毒不再走这张表：0x0028 的施毒与「蛊相克即死」统一由 palPoison.js 处理
    //     （原 poison 字段是一份错误的扁平映射，已被删除）
    const PAL_THROW_DAMAGE = {
        61: { dmg: 90 }, 62: { dmg: 120 }, 63: { dmg: 170 }, 65: { dmg: 135 },
        66: { dmg: 250 }, 67: { dmg: 400 }, 68: { dmg: 300, all: true },
        70: { dmg: 0, all: true }, 71: { dmg: 55, all: true },
        81: { dmg: 0 }, 82: { dmg: 0 }, 83: { dmg: 0 }, 84: { dmg: 0 },
        85: { dmg: 0 }, 86: { dmg: 0 }, 87: { dmg: 0 }, 88: { dmg: 0 },
        89: { dmg: 0 }, 90: { dmg: 0 }, 91: { dmg: 0 }, 92: { dmg: 0 },
        94: { dmg: 0 }, 95: { dmg: 0 },
        97: { dmg: 1 }, 98: { dmg: 4 }, 99: { dmg: 1 }, 100: { dmg: 1 },
        101: { dmg: 3 }, 102: { dmg: 1 }
    };
    const PAL_WEAPON_THROW = {
        1: { mul: 0 }, 2: { mul: 30 }, 3: { mul: 52 }, 4: { mul: 70 },
        5: { mul: 178 }, 6: { mul: 210 }, 7: { mul: 332 }, 8: { mul: 440 },
        9: { mul: 440 }, 10: { mul: 460 }, 11: { mul: 610 }, 12: { mul: 720 },
        13: { mul: 800 }, 14: { mul: 44 }, 15: { mul: 300 }, 16: { mul: 10 },
        17: { mul: 36 }, 18: { mul: 78 }, 19: { mul: 130 }, 20: { mul: 105 },
        21: { mul: 410 }, 22: { mul: 570 }, 23: { mul: 480 }, 24: { mul: 660 },
        25: { mul: 90 }, 26: { mul: 145 }, 27: { mul: 320 }, 28: { mul: 250 },
        29: { mul: 400 }, 31: { mul: 32 }, 32: { mul: 115 }, 33: { mul: 255 }
    };

    PalBattleMisc.throwDamage = function (subject, target, item) {
        if (!item) return 0;
        if (DataManager.isWeapon(item)) {
            // 0x0066：值 = 倍率×5 + 角色武力×rand(0,3)，再代入仙术公式
            const cfg = PAL_WEAPON_THROW[item.id] || { mul: 0 };
            const base = cfg.mul * 5 + subject.atk * Math.floor(Math.random() * 4);
            return PalBattleCore.magicDamage(subject, target, { base: 0, elem: 0 }, base);
        }
        const d = PAL_THROW_DAMAGE[item.id];
        return d ? d.dmg : 0;   // 0x0021 固定伤害
    };

    PalBattleMisc.throwIsAll = function (item) {
        const d = PAL_THROW_DAMAGE[item.id];
        return !!(d && d.all);
    };

    // 投掷施毒交给 palPoison.js（含蛊相克即死），这里保留兼容入口
    PalBattleMisc.throwPoison = function (item) {
        return window.PalPoison ? PalPoison.throwPoisonState(item.id) : 0;
    };

    Window_PalBattleItemList.prototype.isEnabled = function (item) {
        if (!item) return false;
        if ($gameParty.numItems(item) <= 0) return false; // 没拥有就不该亮
        const isItem = DataManager.isItem(item);
        const isWeapon = DataManager.isWeapon(item);
        if (this._mode === "battle_use") {
            // 原版 kItemFlagUsable；再叠加「RMMZ 没有效果」的限制
            const ok = isItem ? PAL_USABLE_ITEM[item.id]
                : (isWeapon ? PAL_USABLE_WEAPON[item.id] : false);
            return !!ok && !PAL_NO_BATTLE_ITEM_IDS[item.id];
        }
        if (this._mode === "battle_throw") {
            // 原版 kItemFlagThrowable（武器几乎全部可投掷，天蛇杖除外）
            return isItem ? !!PAL_THROWABLE_ITEM[item.id]
                : (isWeapon ? !!PAL_THROWABLE_WEAPON[item.id] : false);
        }
        return Window_PaladinItemList.prototype.isEnabled.call(this, item);
    };

    window.Window_PalBattleItemList = Window_PalBattleItemList;

    //-----------------------------------------------------------------------------
    // Window_PalBattleItemDesc：战斗道具的图标框 + 说明文字层
    // ----------------------------------------------------------------------------
    // 原版没有"下方说明窗"这种东西 —— 图标框和说明文字是直接叠在列表框上的
    //（itemmenu.c 196-247）：
    //   · SPRITENUM_ITEMBOX 画在 PAL_XY(0, 140)，64×64，先画 (5,5) 偏移的阴影；
    //     因为它在列表框【之后】画，所以盖住底框下缘 10px（150-140）。
    //   · 道具图（BALL chunk）画在 PAL_XY(8, 147)，48×48。
    //   · 说明文字画在 PAL_XY(75, 150)，每行 +16，最多 3 行。
    // 所以这里用一个全屏透明覆盖窗，按 320×200 坐标整幅绘制，z 序排在列表框之后。
    //-----------------------------------------------------------------------------
    function Window_PalBattleItemDesc() {
        this.initialize(...arguments);
    }
    Window_PalBattleItemDesc.prototype = Object.create(Window_Base.prototype);
    Window_PalBattleItemDesc.prototype.constructor = Window_PalBattleItemDesc;

    Window_PalBattleItemDesc.prototype.initialize = function (rect) {
        Window_Base.prototype.initialize.call(this, rect);
        this.opacity = 0;          // 只留 contents（框和后板全透明）
        this.backOpacity = 0;
        this.frameVisible = false;
        this._descItem = null;
        this._descIconBox = ImageManager.loadSystem("Data970");
        this._descListening = new Set();
        this._descRefreshListener = this.refresh.bind(this);
    };

    // 坐标要精确到屏幕像素 → 去掉内边距，contents 原点 = 窗口左上角 (0,0)
    Window_PalBattleItemDesc.prototype.updatePadding = function () {
        this.padding = 0;
    };

    // ⚠⚠ 关键：这一层必须【不参与窗口遮挡】。
    //
    // MZ 的 WindowLayer.render 是【从高 z 往低 z】渲染，每渲染完一个窗口就把
    // 它的形状写进 stencil 缓冲（rmmz_core.js 4297-4326）：
    //     gl.stencilFunc(gl.EQUAL, 0, ~0);   // 当前窗口只画 stencil==0 的地方
    //     win.render(renderer);
    //     win.drawShape(graphics);           // 再把【自己整个矩形】写进 stencil=1
    // 而 Window.prototype.drawShape 画的就是 this.width × this.height 的整块矩形
    //（不管 frameVisible / opacity 是多少）。
    //
    // 本层是【全屏】覆盖层（960×600），虽然自己 opacity=0、看不见框，
    // 但它的形状照样是整屏 → 于是把 z 更低的列表框整块挖空：
    // 症状就是"道具界面上只有图标框和说明文字，底框和选项全都不见了"。
    //（之前用 2D 画布合成截图验证，绕过了渲染管线，所以没测出来。）
    //
    // 覆盖成空实现即可：本层照常渲染（它读到的 stencil 全是 0），
    // 但不再给下面的窗口挖洞 —— 它作为最上层，本来就该直接盖住列表框。
    Window_PalBattleItemDesc.prototype.drawShape = function () { };

    Window_PalBattleItemDesc.prototype.setItem = function (item) {
        if (this._descItem !== item) {
            this._descItem = item;
            this.refresh();
        }
    };

    // 原版阴影色 PAL_CalcShadowColor(b) = (b & 0xF0) | ((b & 0x0F) >> 1)，
    // 即亮度减半 → 这里用一张"原图 + 50% 黑"的缓存副本近似
    Window_PalBattleItemDesc.prototype.shadowIconBox = function () {
        const src = this._descIconBox;
        const W = PAL_ITEM.iconBoxW, H = PAL_ITEM.iconBoxH;
        if (this._shadowBitmap) return this._shadowBitmap;
        const bmp = new Bitmap(W, H);
        bmp.blt(src, 0, 0, W, H, 0, 0, W, H);
        const ctx = bmp.context;
        ctx.save();
        ctx.globalCompositeOperation = "source-atop";
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
        bmp._baseTexture.update();
        this._shadowBitmap = bmp;
        return bmp;
    };

    Window_PalBattleItemDesc.prototype.refresh = function () {
        this.contents.clear();
        const k = palK();
        const src = this._descIconBox;
        if (!src.isReady()) {
            if (!this._descListening.has(src)) {
                src.addLoadListener(this._descRefreshListener);
                this._descListening.add(src);
            }
            return;
        }

        const bx = kPal(PAL_ITEM.iconBoxX), by = kPal(PAL_ITEM.iconBoxY);
        const bw = kPal(PAL_ITEM.iconBoxW), bh = kPal(PAL_ITEM.iconBoxH);
        // 阴影：原版先贴 (5,5) 偏移的暗色版
        this.contents.blt(this.shadowIconBox(), 0, 0, PAL_ITEM.iconBoxW, PAL_ITEM.iconBoxH,
            bx + kPal(5), by + kPal(5), bw, bh);
        this.contents.blt(src, 0, 0, PAL_ITEM.iconBoxW, PAL_ITEM.iconBoxH, bx, by, bw, bh);

        if (!this._descItem) return;

        // 道具图 PAL_XY(8, 147)
        const iconSet = ImageManager.loadSystem("IconSet");
        const pw = ImageManager.iconWidth;
        const ph = ImageManager.iconHeight;
        if (iconSet.isReady()) {
            const idx = this._descItem.iconIndex;
            const sx = (idx % 16) * pw;
            const sy = Math.floor(idx / 16) * ph;
            const isz = kPal(PAL_ITEM.iconSize);
            this.contents.blt(iconSet, sx, sy, pw, ph, kPal(PAL_ITEM.iconX), kPal(PAL_ITEM.iconY), isz, isz);
        } else if (!this._descListening.has(iconSet)) {
            iconSet.addLoadListener(this._descRefreshListener);
            this._descListening.add(iconSet);
        }

        // 说明文字 PAL_XY(75, 150)，行距 16，去掉 '*' 之外的换行
        const desc = this._descItem.description || "";
        const lines = desc.replace(/\\n/g, "\n").split(/[\r\n*]+/).slice(0, 3);
        this.contents.outlineWidth = 0;
        this.contents.fontSize = PAL_ITEM_FONT_SIZE();
        const tx = kPal(PAL_ITEM.descX);
        const tw = this.contents.width - tx;
        let ty = kPal(PAL_ITEM.descY);
        for (const line of lines) {
            this.contents.textColor = "#000000";
            this.contents.drawText(line, tx + 2, ty + 2, tw, this.lineHeight(), "left");
            this.contents.textColor = "#F7EB99";
            this.contents.drawText(line, tx, ty, tw, this.lineHeight(), "left");
            ty += kPal(PAL_ITEM.descStep);
        }
    };

    // 说明文字行高 = 原版 12 PAL
    Window_PalBattleItemDesc.prototype.lineHeight = function () {
        return kPal(PAL_ITEM.glyphH);
    };

    window.Window_PalBattleItemDesc = Window_PalBattleItemDesc;

    Scene_Battle.prototype.createItemWindow = function () {
        // 列表框：原版尺寸 316×150 PAL，位置 PAL_XY(2, 0)
        const rect = new Rectangle(
            kPal(PAL_ITEM.boxX), kPal(PAL_ITEM.boxY),
            kPal(PAL_ITEM.boxW), kPal(PAL_ITEM.boxH)
        );
        this._itemWindow = new Window_PalBattleItemList(rect);
        this._itemWindow.setMode("battle_use");
        this._itemWindow.setHandler("ok", this.onItemOk.bind(this));
        this._itemWindow.setHandler("cancel", this.onItemCancel.bind(this));

        // 说明层（图标框 + 说明文字）必须盖住列表框的底框（原版是后画的）。
        // MZ 的 WindowLayer 是"index 小的后渲染、画在上面"，所以
        // 【先 addWindow(说明层)，再 addWindow(列表框)】才能让说明层压住列表框。
        // 光调顺序还不够，还得两边都不写 stencil —— 见上面的 drawShape 覆盖。
        const descRect = new Rectangle(0, 0, Graphics.boxWidth, Graphics.boxHeight);
        this._palItemHelpWindow = new Window_PalBattleItemDesc(descRect);
        this.addWindow(this._palItemHelpWindow);
        this._palItemHelpWindow.hide();

        this.addWindow(this._itemWindow);
        this._itemWindow.setHelpWindow(this._palItemHelpWindow);
        this._itemWindow.hide();
        this._itemWindow.deactivate();
    };

    //-----------------------------------------------------------------------------
    // 地图菜单里的道具界面：与战斗共用 Window_PalBattleItemList + Window_PaladinItemHelp
    // ----------------------------------------------------------------------------
    //   列表框  Window_PalBattleItemList  (5, 0, boxW-10, kPal(150))   七行三列
    //   说明窗  Window_PaladinItemHelp    (0, boxH-240, 952, 240)      图标框 + 三行文案
    // 历史实现本身有一处固有缺陷：两个窗口在 y 352..412 上重叠 60px，
    // 而历史上是【列表框】盖住说明窗，于是图标框和第一行文案的顶部被底框切平
    //（就是"图标和介绍文字有些靠上"的观感）。原版的规矩恰好相反 ——
    // SPRITENUM_ITEMBOX 是在底板【之后】blit 的，图标框压着底板底边、
    // 文案从底板底边开始。所以按原版来：
    //   ① 两个窗口都不写 stencil：WindowLayer.render 是从 index 大往小渲染、
    //      每渲染完一个窗口就把自己整个矩形写进 stencil，index 大的先写，
    //      index 小的就只在 stencil==0 处画 —— 重叠区永远归 index 更大的窗口。
    //      两边都清掉 drawShape 之后，"说明窗（index 0，后渲染）"才盖得住列表框。
    //   ② 列表框高度恢复原版 150 PAL（itemmenu.c 117：
    //      PAL_CreateBoxWithShadow(PAL_XY(2,0), 6, 17, 1) = 上20 + 6×18 + 下22）：
    //      之前用 boxH-180 = 420，比原版矮 30px，第 7 行文字压进底边框、
    //      上留白大于下留白（用户反馈"最后一行没有留出足够的下边缘"）。
    //-----------------------------------------------------------------------------
    if (window.Scene_PaladinItem) {
        Window_PaladinItemList.prototype.drawShape = function () { };
        Window_PaladinItemHelp.prototype.drawShape = function () { };

        // ② 列表框用原版高度 150 PAL；内部选项的**排版**与战斗保持一致：
        //    外框仍是历史 (5, 0, boxW-10)，
        //    但列表窗换成 Window_PalBattleItemList —— 字号 kPal(12)、行距 kPal(18)、
        //    3 列 × 7 行、名字限宽 81 PAL、数量右缘 PAL 108、光标 PAL(40, 22)。
        Scene_PaladinItem.prototype.createItemWindow = function () {
            const rect = new Rectangle(
                5, 0, Graphics.boxWidth - 10, kPal(PAL_ITEM.boxH)
            );
            this._itemWindow = new Window_PalBattleItemList(rect);
            this._itemWindow.setHelpWindow(this._helpWindow);
            this._itemWindow.setMode(this._categoryMode === "equip" ? "menu_equip" : "menu_use");
            this._itemWindow.setHandler("ok", this.onItemOk.bind(this));
            this._itemWindow.setHandler("cancel", this.onCancel.bind(this));
            this.addWindow(this._itemWindow);
            this._itemWindow.activate();
            this._itemWindow.selectLast();
        };
    }

    const _commandItem = Scene_Battle.prototype.commandItem;
    Scene_Battle.prototype.commandItem = function () {
        // 打开前套用二级菜单选来的模式（使用 / 投掷）
        if (this._palItemMode && this._itemWindow.setMode) {
            this._itemWindow.setMode(this._palItemMode);
        }
        this._itemWindow.refresh();
        _commandItem.call(this);
        // MZ 的 commandItem 不 select：首次打开时 index 还是 -1，
        // 原版光标永远停在某一格上（说明栏也才有内容）→ 兜底选第一个
        if (this._itemWindow.index() < 0 && this._itemWindow.maxItems() > 0) {
            this._itemWindow.select(0);
        }
        if (this._palItemHelpWindow) this._palItemHelpWindow.show();
    };

    const _onItemOk = Scene_Battle.prototype.onItemOk;
    Scene_Battle.prototype.onItemOk = function () {
        // 投掷：标记 action，让 MZ 走「选敌」流程（投掷目标永远是敌人，
        // 而很多投掷物在项目里 scope=0，needsSelection() 默认是 false）
        const item = this._itemWindow ? this._itemWindow.item() : null;
        const action = BattleManager.inputtingAction();
        if (this._palItemMode === "battle_throw" && item && action) {
            action._palThrow = true;
            action._palThrowAll = PalBattleMisc.throwIsAll(item);
        }
        _onItemOk.call(this);
        if (this._palItemHelpWindow) this._palItemHelpWindow.hide();
    };

    //-----------------------------------------------------------------------------
    // 投掷的目标选择：全体投掷直接打敌全，单体投掷弹选敌
    //-----------------------------------------------------------------------------

    const _isForOpponent = Game_Action.prototype.isForOpponent;
    Game_Action.prototype.isForOpponent = function () {
        if (this._palThrow) return true;
        return _isForOpponent.call(this);
    };

    const _needsSelection = Game_Action.prototype.needsSelection;
    Game_Action.prototype.needsSelection = function () {
        if (this._palThrow) return !this._palThrowAll;
        return _needsSelection.call(this);
    };

    const _makeTargets = Game_Action.prototype.makeTargets;
    Game_Action.prototype.makeTargets = function () {
        if (this._palThrow) {
            if (this._palThrowAll) {
                return $gameTroop.members().filter(e => e && e.isAlive());
            }
            const t = this._targetIndex >= 0 ? $gameTroop.members()[this._targetIndex] : null;
            return t ? [t] : [];
        }
        return _makeTargets.call(this);
    };

    //-----------------------------------------------------------------------------
    // 投掷伤害与消耗
    //-----------------------------------------------------------------------------

    const _makeDamageValue = Game_Action.prototype.makeDamageValue;
    Game_Action.prototype.makeDamageValue = function (target, critical) {
        if (this._palThrow) {
            return PalBattleMisc.throwDamage(this.subject(), target, this.item());
        }
        return _makeDamageValue.call(this, target, critical);
    };

    // 原版 fight.c 4367：投掷后统一从背包 -1（消耗品 MZ 自己会扣，这里只补非消耗品）
    PalBattleMisc.consumeThrownItem = function (action) {
        if (!action._palThrow || action._palThrowConsumed) return;
        action._palThrowConsumed = true;
        const item = action.item();
        if (!item) return;
        const consumable = DataManager.isItem(item) && item.consumable;
        if (!consumable) $gameParty.loseItem(item, 1);
        // 上毒改由 palPoison.js 处理（按单体目标上毒 + 蛊相克即死判定），
        // 这里不再给全体敌人上毒（原版 0x0028 的 operand[0] 决定单/全体）。
    };

    const _applyForThrow = Game_Action.prototype.apply;
    Game_Action.prototype.apply = function (target) {
        const result = _applyForThrow.call(this, target);
        PalBattleMisc.consumeThrownItem(this);
        return result;
    };

    const _createActorCommandWindow = Scene_Battle.prototype.createActorCommandWindow;
    Scene_Battle.prototype.createActorCommandWindow = function () {
        _createActorCommandWindow.call(this);
        this._actorCommandWindow.setHandler("misc", this.commandMisc.bind(this));
    };

    // 指令盘下按钮 → 打开杂项菜单（重新评估各选项可用性，对齐原版每次进菜单刷新）
    Scene_Battle.prototype.commandMisc = function () {
        this._actorCommandWindow.deactivate();
        this._palMiscWindow.refresh();
        this._palMiscWindow.show();
        this._palMiscWindow.activate();
        this._palMiscWindow.select(0);
    };

    Scene_Battle.prototype.closePalMisc = function () {
        this._palMiscWindow.hide();
        this._palMiscWindow.deactivate();
    };

    Scene_Battle.prototype.onMiscCancel = function () {
        this.closePalMisc();
        this._actorCommandWindow.activate();
    };

    // 围攻 = 原版 fAutoAttack（uibattle.c 1386-1392 kBattleMenuAuto → palBattleAuto）。
    // 原版只是把 fAutoAttack 置 TRUE 并退回主指令盘，下一帧由
    // 「fAutoAttack 分支」给当前伙伴提交普攻（uibattle.c 977-989）。
    Scene_Battle.prototype.onMiscAutoAtk = function () {
        this.closePalMisc();
        if (window.PalBattleAuto) PalBattleAuto.enable();
    };

    // 道具 = 原版 kBattleMenuMiscItemSubMenu：先弹【使用】/【投掷】二级菜单
    Scene_Battle.prototype.onMiscItem = function () {
        this.closePalMisc();
        this._palItemSubWindow.refresh();
        this._palItemSubWindow.show();
        this._palItemSubWindow.activate();
        this._palItemSubWindow.select(0);
    };

    Scene_Battle.prototype.closePalItemSub = function () {
        this._palItemSubWindow.hide();
        this._palItemSubWindow.deactivate();
    };

    // 使用 / 投掷：切换道具窗模式后打开（原版两个子项分别
    // PAL_ItemSelectMenuInit(kItemFlagUsable) / (kItemFlagThrowable)）
    Scene_Battle.prototype.onItemSubUse = function () {
        this._palItemMode = "battle_use";
        this.closePalItemSub();
        this.commandItem();
    };

    Scene_Battle.prototype.onItemSubThrow = function () {
        this._palItemMode = "battle_throw";
        this.closePalItemSub();
        this.commandItem();
    };

    // 防御：伪技能999挂状态2（防御力×2，palBattleAnim）
    Scene_Battle.prototype.onMiscGuard = function () {
        this.closePalMisc();
        BattleManager.inputtingAction().setGuard();
        this.onSelectAction();
    };

    // 逃跑（对齐原按钮流程：processEscape；事件未勾选「可以逃跑」时禁用，失败后可继续输入）
    Scene_Battle.prototype.onMiscEscape = function () {
        this.closePalMisc();
        this._actorCommandWindow.deactivate();
        BattleManager.processEscape();
    };

    // 状态：原版是叠加在战斗画面上的面板（PAL_PlayerStatus），
    // 之前 SceneManager.push(Scene_PalStatus) 会把整个战斗场景顶掉，改成战斗内叠加。
    Scene_Battle.prototype.onMiscStatus = function () {
        this.closePalMisc();
        this._actorCommandWindow.deactivate();
        this._palStatusWindow.showStatus();
    };

    Scene_Battle.prototype.onPalStatusCancel = function () {
        this._actorCommandWindow.activate();
    };

    // 从物品窗取消返回时，指令盘当前符号是 "misc"（不在 MZ 默认分支内），兜底恢复
    const _onItemCancel = Scene_Battle.prototype.onItemCancel;
    Scene_Battle.prototype.onItemCancel = function () {
        _onItemCancel.call(this);
        if (this._palItemHelpWindow) this._palItemHelpWindow.hide();
        if (this._actorCommandWindow.currentSymbol() === "misc" &&
            this._actorCommandWindow.visible && !this._actorCommandWindow.active) {
            this._actorCommandWindow.activate();
        }
    };

    //=============================================================================
    // 关键：把杂项子菜单计入“输入窗口”
    // --------------------------------------------------------------------------
    // MZ 的 Scene_Battle.updateInputWindowVisibility 每帧调用
    // needsInputWindowChange()：isAnyInputWindowActive() 为 false 而
    // BattleManager.isInputting() 为 true 时，会走 changeInputWindow()
    // → startActorCommandSelection() → _actorCommandWindow.setup()
    // → activate() + select(0)。
    // 杂项菜单不在 MZ 默认的那六个窗口里，于是子菜单打开期间指令盘被每帧重新
    // 激活，与子菜单同时 active：ESC 被两个窗口各接收一次，指令盘注册更早、
    // 先执行，就走了 commandCancel → selectPreviousCommand（返回上一个角色）。
    // 这里把子菜单计入后，指令盘保持 deactivate，ESC 只会被子菜单接收。
    //=============================================================================

    //=============================================================================
    // ⚠ 必须同时判 visible 和 active
    // --------------------------------------------------------------------------
    // 只判 active 会让本函数在整场战斗中【恒返回 true】，后果是毁灭性的：
    //
    //   Scene_Battle.needsInputWindowChange():
    //       windowActive && inputting → return _actorCommandWindow.actor() !== BattleManager.actor()
    //       windowActive !== inputting (否则)
    //
    //   恒为 true 时：① 战斗开始阶段 inputting=false → true !== false → 走
    //   changeInputWindow() 的 endCommandSelection()；进入 input 后
    //   BattleManager.actor() 仍是 null（因为 startPartyCommandSelection 没跑过），
    //   _actorCommandWindow.actor() 也还是 null → null !== null = false
    //   → needsInputWindowChange() 永远 false → changeInputWindow() 再也不执行
    //   → startActorCommandSelection() 永不调用 → 指令盘永不 setup()
    //   → 四个指令按钮不出指令、不可操作（表现就是"四个按钮不见了"）。
    //
    //   加上 visible 判定后，隐藏期间返回原生结果，指令流程恢复正常。
    //=============================================================================
    const _isAnyInputWindowActive = Scene_Battle.prototype.isAnyInputWindowActive;
    Scene_Battle.prototype.isAnyInputWindowActive = function () {
        if (this._palMiscWindow && this._palMiscWindow.visible &&
            this._palMiscWindow.active) return true;
        if (this._palItemSubWindow && this._palItemSubWindow.visible &&
            this._palItemSubWindow.active) return true;
        if (this._palStatusWindow && this._palStatusWindow.isOpen()) return true;
        return _isAnyInputWindowActive.call(this);
    };

    // 双保险：万一指令盘仍被激活，子菜单存活时 ESC 只关闭子菜单，不回退角色
    const _commandCancel = Scene_Battle.prototype.commandCancel;
    Scene_Battle.prototype.commandCancel = function () {
        if (this._palStatusWindow && this._palStatusWindow.isOpen()) {
            this._palStatusWindow.processCancel();
            return;
        }
        if (this._palItemSubWindow && this._palItemSubWindow.visible) {
            this.onItemSubCancel();
            return;
        }
        if (this._palMiscWindow && this._palMiscWindow.visible) {
            this.onMiscCancel();
            return;
        }
        _commandCancel.call(this);
    };

    //=============================================================================
    // 道具界面打开时隐藏状态栏
    // --------------------------------------------------------------------------
    // palBattle.js 的 updateStatusWindowPosition() 只看 isAnyInputWindowActive()，
    // 而道具列表框本身就是输入窗 → 状态栏一直被 show() 出来。
    // 原版进道具列表时画面下方是不画状态栏的（itemmenu.c 的画面只有
    // 列表框 + 图标框 + 说明文字），所以这里两道保险：
    //   ① shouldOpenStatusWindow() 直接返回 false，连 open() 都不触发；
    //   ② updateStatusWindowPosition() 兜底强制 hide()。
    //=============================================================================

    Scene_Battle.prototype.isPalItemUIOpen = function () {
        return !!((this._itemWindow && this._itemWindow.visible) ||
                  (this._palItemHelpWindow && this._palItemHelpWindow.visible));
    };

    const _shouldOpenStatusWindow = Scene_Battle.prototype.shouldOpenStatusWindow;
    Scene_Battle.prototype.shouldOpenStatusWindow = function () {
        if (this.isPalItemUIOpen()) return false;
        return _shouldOpenStatusWindow.call(this);
    };

    const _updateStatusWindowPosition = Scene_Battle.prototype.updateStatusWindowPosition;
    Scene_Battle.prototype.updateStatusWindowPosition = function () {
        if (this.isPalItemUIOpen()) {
            this._statusWindow.hide();
            if (window.Pal98IndicatorManager) Pal98IndicatorManager.hideAll();
            return;
        }
        _updateStatusWindowPosition.call(this);
    };

    //=============================================================================
    // 子菜单打开期间冻结指令盘方向键（原版此时指令盘不可操作；
    // ESC/鼠标右键取消关闭子菜单后自动解冻）
    //=============================================================================

    const miscMenuOpen = () => {
        const scene = SceneManager._scene;
        if (!scene) return false;
        if (scene._palMiscWindow && scene._palMiscWindow.visible) return true;
        if (scene._palItemSubWindow && scene._palItemSubWindow.visible) return true;
        if (scene._palStatusWindow && scene._palStatusWindow.isOpen()) return true;
        return false;
    };

    for (const method of ["cursorUp", "cursorDown", "cursorLeft", "cursorRight"]) {
        const _cursor = Window_ActorCommand.prototype[method];
        Window_ActorCommand.prototype[method] = function (wrap) {
            if (miscMenuOpen()) return; // 子菜单存活期内不响应方向键
            _cursor.call(this, wrap);
        };
    }
})();
