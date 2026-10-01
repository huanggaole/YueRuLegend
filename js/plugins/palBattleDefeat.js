/*:
 * @target MZ
 * @plugindesc [v1.3] 仙剑98柔情版游戏失败演出（画面直接渐红 + 居中无框文字「胜败乃兵家常事也/大侠请重新来过吧」+ 读取最后存档 / 无存档则从头开始）
 * @author AI Assistant
 *
 * @help
 * 复刻仙剑98柔情版的战斗失败表现。流程逐条对照原版事件脚本
 * （tools/_scripts_dump.json idx 41075-41083，即 0x0007「开始战斗」指令
 *  operand[1] 指向的失败分支）：
 *
 *   41075  0x0043 (1,1)    设置背景音乐 → 本工程由 System.json 的 defeatMe
 *                          「001大侠再来（我方全灭）」承担（MZ 已在
 *                          BattleManager.processDefeat 里 playDefeatMe）
 *   41076  0x004F          PAL_FadeToRed()：画面渐红
 *   41077  0x003B          屏幕【居中】对话框（kDialogCenter）
 *   41078  0xFFFF 0x334F   $00（设置打字机延时=0 → 整句立刻出现，非正文）
 *   41079  0xFFFF 0x3350   胜败乃兵家常事也
 *   41080  0xFFFF 0x3351   大侠请重新来过吧
 *   41081  0xFFFF 0x3352   $02（同上，非正文）
 *   41082  0x004E          PAL_ReloadInNextTick(bCurrentSaveSlot)：读回最后存档
 *   41083  0x0000          结束
 *
 * ⚠【没有文字底框】0x003B 是 kDialogCenter，不是 kDialogCenterWindow（0x003E）。
 *   原版 text.c 里建框的只有 kDialogCenterWindow 那一个分支：
 *     PAL_CreateSingleLineBoxWithShadow(...) / PAL_DeleteBox(lpBox)
 *     （text.c 1687 / 1706）
 *   kDialogCenter 走 else 分支，只有 TEXT_DisplayText —— 文字直接叠在渐红
 *   画面上，没有任何底板/边框。
 *   文字起点 PAL_XY(80, 40)（text.c 1320-1322），行距 18
 *   （y = posDialogText.y + nCurrentDialogLine * 18）。
 *   首条 $00 虽是控制码（不显示）但仍占掉第 0 行 → 两条正文落在第 1、2 行
 *   = PAL y 58 / 76。
 *   ⚠ 但原版 x=80 是【左缘起点、不居中】（真正的居中是 kDialogCenterWindow
 *   的 160）。本工程按需求改成水平+垂直双向居中：centerX/centerY（默认开），
 *   关掉就退回原版 PAL(80, 58) 那套左对齐坐标。
 *   居中按【画布】Graphics.width/height（960×600）算，不是 boxWidth/boxHeight
 *   （952×592 —— SceneManager.initGraphics 会内缩 boxMargin=4）。
 *   文字是直接 addChild 到场景上的全屏覆盖层，不在 WindowLayer 里，
 *   所以要用画布尺寸；用 box 会整体偏 4px。
 *   文字带阴影：text.c 1600 是 TEXT_DisplayText(..., isDialog=FALSE)，
 *   内部 PAL_DrawTextUnescape(..., fShadow = !isDialog = TRUE)。
 *   （反倒是有框的 kDialogCenterWindow 传 isDialog=TRUE → 不带阴影。）
 *   阴影是【三重】的（text.c 1144-1152，注释说 Win95 版只有一层是 bug，
 *   sdlpal 两个版本都用三层）：先在 (+1,0) (0,+1) (+1,+1) 各画一遍索引 0
 *   （纯黑），再画正文。
 *
 * 【显示后等任意键】脚本里 4 条 0xFFFF 之后紧接 0x004E，但 0x004E 不在
 *   PAL_InterpretInstruction 的 switch 里，走 script.c 3472 的 default 分支：
 *     PAL_ClearDialog(TRUE) → nCurrentDialogLine>0 → PAL_DialogWaitForKey()
 *   → 原版是【等玩家按任意键】再读档，不是自动跳。
 *
 * 【画面渐红】原版是调色板操作（palette.c 595-666 PAL_FadeToRed）：
 *   32 步，每步 UTIL_Delay(75)（合计 ≈2.4 秒），逐项逼近
 *      R → (R+G+B)/4 + 64      G → 0      B → 0
 *   并跳过索引 0x4F（源码注释 "so that texts will not be affected"）。
 *   本工程没有调色板，改用 PIXI.filters.ColorMatrixFilter 做等价变换：
 *      R' = 0.25R + 0.25G + 0.25B + 64/255      G' = 0      B' = 0
 *   同样 32 步 × 75ms，从单位矩阵插值到该矩阵。
 *   文字层在渐变结束后才创建 → 天然不受影响（对应原版跳过 0x4F）。
 *
 * ⚠【必须挡掉 MZ 的"退场渐黑"】否则玩家看到的是"先黑一下，然后突然变红"。
 *   Scene_Battle.prototype.stop（rmmz_scenes.js:3125）在
 *     needsSlowFadeOut()（3151，下一场景是 Scene_Gameover 时为 true）
 *   时会 startFadeOut(this.slowFadeSpeed() = 48, false)。
 *   而 Scene_Base.isBusy() = isFading() = (_fadeDuration > 0)
 *   （rmmz_scenes.js:64-70），SceneManager.changeScene 又要求
 *   !isCurrentSceneBusy() → 整段 48 帧渐黑被【完整播完】（屏幕真的黑掉），
 *   之后 Scene_Gameover 才创建、直接换上【亮】的战场快照 → 视觉上就是
 *   "黑一下 → 突然变红"，完全不是原版的"直接逐帧渐红"。
 *   本插件覆写 Scene_Battle.prototype.stop：当下一场景是 Scene_Gameover 且
 *   cfg.noBattleFadeOut 时，只做 _active = false + 关三个指令窗口，不淡出。
 *   实测（tools/pal_defeat_transition_probe.js）：
 *     修复前 屏幕平均亮度 60→50→33→15 黑到底，再瞬间跳回 60 渐红；
 *     修复后 第一帧就是亮底图，60→58→55→53→49→46→42→39 一路平滑变红。
 *
 * 【为什么先截屏】原版 PAL_FadeToRed 作用的 gpScreen 此刻还留着战斗最后一帧
 *   （VIDEO_CopyEntireSurface(g_Battle.lpSceneBuf, gpScreen) 之后战斗才清理），
 *   所以渐红的底图就是战场。MZ 进 Scene_Gameover 时旧场景已销毁，故在
 *   BattleManager.updateBattleEnd 跳转前调 SceneManager.snapForBackground()
 *   留一张战场快照当底图。
 *
 * 【失败后去向】按原版 0x004E：自动读取最后一次存档
 *   （DataManager.latestSavefileId()）；一个存档都没有时【从头开始】
 *   （DataManager.setupNewGame() → Scene_Map），而不是回标题画面
 *   （回标题会让玩家还得再点一次"新的游戏"，体验断层）。
 *
 * 【⚠ 挡掉 MZ 默认的失败提示】rmmz_managers.js 2983
 *   BattleManager.displayDefeatMessage() 会
 *     $gameMessage.add(TextManager.defeat.format($gameParty.name()))
 *   → 「XXX的队伍被打败了」对话框。而且它还堵着流程：
 *     Scene_Battle.update 的 `if (active && !this.isBusy())` 里 isBusy 来自
 *     Scene_Message（$gameMessage.isBusy()），BattleManager.isBusy() 也判
 *     $gameMessage.isBusy()（rmmz_managers.js 2397）→ 关掉对话框之前
 *     updateBattleEnd() 根本不会跑。
 *   本插件与胜利结算（palBattleVictory.js:453 displayVictoryMessage 置空）
 *   保持一致，把 displayDefeatMessage 置空 → 战斗结束后直接进入渐红演出。
 *
 * 运行时调参：
 *   PAL98_DEFEAT.fadeSteps / fadeStepMs / autoReload / dialogHoldMs
 *   fontSize / lineHeight / textX / textY / firstLine（均为 PAL 320×200 基准）
 *   centerX / centerY（默认 true：水平+垂直双向居中）、offsetX / offsetY
 *   color / shadowColor / shadowOffset / anyKey
 *   autoReload / onNoSave（"newgame" 从头开始 | "title" 回标题）
 *   hideDefeatMessage（挡掉「XXX的队伍失败了」）/ noBattleFadeOut（挡掉退场渐黑）
 *   控制台：PAL98.setDefeat({fadeStepMs: 40}) / PAL98.setDefeat({anyKey: false})
 *           PAL98.setDefeat({centerX: false})   // 退回原版 PAL x=80 左对齐
 *
 * 需排在 palBattle / palBattleCore 之后加载。
 */

(() => {
    const PalBattleDefeat = (window.PalBattleDefeat = {});

    //=============================================================================
    // 可调参数
    //=============================================================================
    const cfg = (window.PAL98_DEFEAT = {
        enabled: true,
        fadeSteps: 32,      // palette.c 633：for (i = 0; i < 32; i++)
        fadeStepMs: 75,     // palette.c 665：UTIL_Delay(75)
        dialogHoldMs: 0,    // 0 = 等玩家按键；>0 = 显示 N 毫秒后自动读档
        autoReload: true,   // 原版 0x004E；false = 回标题画面
        onNoSave: "newgame",// 没有最近存档时的去向："newgame" 从头开始 / "title" 回标题
        hideDefeatMessage: true, // 挡掉 MZ 默认的「XXX的队伍被打败了」对话框
        noBattleFadeOut: true,   // 挡掉 Scene_Battle.stop 的 48 帧退场渐黑（否则"黑一下再突然变红"）
        // 以下均为 PAL 320×200 基准（text.c 1320-1322 / 行距 18）
        fontSize: 16,       // PAL 字高 16 → 本工程 ×3 = 48（与 System.json fontSize 一致）
        lineHeight: 18,     // PAL 行距
        textX: 80,          // kDialogCenter 文字左缘（不是居中；kDialogCenterWindow 才是 160）
        textY: 40,          // kDialogCenter 文字首行 y
        firstLine: 1,       // $00 占掉第 0 行 → 正文从第 1 行开始
        // ⚠ 需求：两行文字水平 + 垂直均居中。开启后忽略上面的 textX/textY/firstLine
        centerX: true,
        centerY: true,
        offsetX: 0,         // 居中后再微调（屏幕像素，不是 PAL）
        offsetY: 0,
        color: "#ffffff",   // FONT_COLOR_DEFAULT
        shadowColor: "#000000",
        shadowOffset: 1,    // text.c 1148-1150：(+1,0)/(0,+1)/(+1,+1) 三重阴影
        anyKey: true        // 原版 PAL_DialogWaitForKey = 任意键；false = 只认确定键
    });
    const PAL98 = window.PAL98 || (window.PAL98 = {});
    PAL98.setDefeat = function (o) {
        if (o) for (const k of Object.keys(o)) cfg[k] = o[k];
        return Object.assign({}, cfg);
    };

    //=============================================================================
    // 文案（原版 MSG_chs.txt，编号 = 行首 ID；脚本取 0x334F~0x3352 共 4 条，
    // 其中 $00/$02 是 text.c 1534-1540 的"设置打字机延时"控制码，不是正文）
    //   13135 (0x334F) = $00
    //   13136 (0x3350) = 胜败乃兵家常事也
    //   13137 (0x3351) = 大侠请重新来过吧
    //   13138 (0x3352) = $02
    //=============================================================================
    PalBattleDefeat.LINES = ["胜败乃兵家常事也", "大侠请重新来过吧"];

    //=============================================================================
    // 渐红目标矩阵（palette.c 642-659 的等价变换）
    //   R' = 0.25R + 0.25G + 0.25B + 64/255；G' = 0；B' = 0；A' = A
    //=============================================================================
    const IDENTITY = [
        1, 0, 0, 0, 0,
        0, 1, 0, 0, 0,
        0, 0, 1, 0, 0,
        0, 0, 0, 1, 0
    ];
    const RED_MATRIX = [
        0.25, 0.25, 0.25, 0, 64 / 255,
        0, 0, 0, 0, 0,
        0, 0, 0, 0, 0,
        0, 0, 0, 1, 0
    ];

    //=============================================================================
    // 任意键判定：原版 PAL_DialogWaitForKey（text.c 1451）等的是任意键
    //=============================================================================
    const ANY_KEYS = ["ok", "cancel", "menu", "shift", "pageup", "pagedown",
        "left", "right", "up", "down", "debug", "control", "tab"];
    function anyKeyTriggered() {
        for (const name of ANY_KEYS) {
            if (Input.isTriggered(name)) return true;
        }
        return !!TouchInput.isTriggered();
    }

    //=============================================================================
    // ① 挡掉 MZ 默认的「XXX的队伍被打败了」对话框
    //   rmmz_managers.js 2983 displayDefeatMessage → $gameMessage.add(...)。
    //   不挡的话 Scene_Battle.update 的 `!this.isBusy()` 一直不成立
    //   （isBusy 来自 Scene_Message → $gameMessage.isBusy()），
    //   BattleManager.isBusy()（2397）也一样 → updateBattleEnd() 永远跑不到，
    //   玩家必须先手动关掉对话框才能进渐红演出。
    //   与 palBattleVictory.js:453 的 displayVictoryMessage 置空同款处理。
    //=============================================================================
    BattleManager.displayDefeatMessage = function () {
        if (cfg.enabled && cfg.hideDefeatMessage) return;
        $gameMessage.add(TextManager.defeat.format($gameParty.name()));
    };

    //=============================================================================
    // ② 跳转前不要 MZ 的"退场渐黑"
    // --------------------------------------------------------------------------
    // Scene_Battle.prototype.stop（rmmz_scenes.js:3125）：
    //   if (this.needsSlowFadeOut()) this.startFadeOut(this.slowFadeSpeed(), false);
    // 而 needsSlowFadeOut()（3151）在【下一场景是 Scene_Gameover】时返回 true
    //   → startFadeOut(48, false)。
    //
    // 致命之处在于 Scene_Base.isBusy() = isFading() = (_fadeDuration > 0)
    // （rmmz_scenes.js:64-70），而 SceneManager.changeScene 要求
    // !isCurrentSceneBusy() → ★ 整段 48 帧渐黑会被【完整播完】（屏幕真的黑掉），
    // 之后 Scene_Gameover 才创建、直接换上【亮】的战场快照
    //   → 玩家看到的就是"先黑一下，然后突然变红"。
    //
    // 本插件的演出本来就是"底图立刻可见 + 逐帧渐红"，所以这里整段跳过淡出。
    // 实测（tools/pal_defeat_transition_probe.js，不改的话）：
    //   屏幕平均亮度 60 → 50 → 33 → 15 一路黑到底，然后瞬间跳回 60 再渐红。
    //=============================================================================
    const _sceneBattleStop = Scene_Battle.prototype.stop;
    Scene_Battle.prototype.stop = function () {
        if (cfg.enabled && cfg.noBattleFadeOut && SceneManager.isNextScene(Scene_Gameover)) {
            Scene_Base.prototype.stop.call(this);   // _active = false
            this._statusWindow.close();
            this._partyCommandWindow.close();
            this._actorCommandWindow.close();
            return;                                  // ⚠ 关键：不调 startFadeOut
        }
        _sceneBattleStop.call(this);
    };

    //=============================================================================
    // ③ 跳转前截屏：留住战场最后一帧当渐红底图
    //=============================================================================
    const _updateBattleEnd = BattleManager.updateBattleEnd;
    BattleManager.updateBattleEnd = function () {
        if (cfg.enabled && !this._escaped && $gameParty.isAllDead() && !this._canLose) {
            // ⚠ 必须在 goto 之前：SceneManager.goto 会 stop() 掉旧场景，
            //    之后再 snap 就只剩空舞台了。
            SceneManager.snapForBackground();
        }
        return _updateBattleEnd.call(this);
    };

    //=============================================================================
    // ③ Scene_Gameover 重写
    //=============================================================================

    // 音乐：原版是 0x0043 播 music 1；本工程 defeatMe 已由 processDefeat 播过，
    // 这里别再用（空的）gameoverMe 把它顶掉。
    Scene_Gameover.prototype.playGameoverMusic = function () {
        const me = $dataSystem.defeatMe || $dataSystem.gameoverMe;
        if (me && me.name) AudioManager.playMe(me);
    };

    Scene_Gameover.prototype.createBackground = function () {
        this._backSprite = new Sprite();
        const snap = cfg.enabled ? SceneManager.backgroundBitmap() : null;
        this._backSprite.bitmap = snap || ImageManager.loadSystem("GameOver");
        this._usedSnap = !!snap;
        this.addChild(this._backSprite);
        if (cfg.enabled && snap) {
            // 渐红滤镜只作用在底图上（文字层后建，天然不受影响 → 原版跳过 0x4F）
            this._redFilter = new PIXI.filters.ColorMatrixFilter();
            this._backSprite.filters = [this._redFilter];
        }
    };

    // 用快照时底图本身已是整屏，不能走 MZ 的"缩放并居中"（会把战场拉变形）
    Scene_Gameover.prototype.adjustBackground = function () {
        if (!this._usedSnap) {
            this.scaleSprite(this._backSprite);
            this.centerSprite(this._backSprite);
        }
    };

    const _goStart = Scene_Gameover.prototype.start;
    Scene_Gameover.prototype.start = function () {
        if (!cfg.enabled) { _goStart.call(this); return; }
        Scene_Base.prototype.start.call(this);
        this.adjustBackground();
        // 不做 startFadeIn：原版是直接把当前画面渐红，中间没有"先黑一下"。
        // 底图（战场快照）立刻可见，接下来 32 步渐红。
        this._palDefeat = {
            state: "fade",
            step: 0,
            stepMs: 0,
            dialog: null,
            holdMs: 0,
            leaving: false,
            startedAt: performance.now(),   // 诊断用：渐变总耗时
            fadeDoneAt: 0
        };
        if (this._redFilter) this._redFilter.matrix = IDENTITY.slice();
    };

    Scene_Gameover.prototype.updatePalDefeat = function () {
        const d = this._palDefeat;
        if (!d || d.leaving) return;
        const dt = Math.min(250, this._palDefeatDelta || 0);
        if (d.state === "fade") {
            d.stepMs += dt;
            const stepMs = Math.max(1, cfg.fadeStepMs);
            while (d.stepMs >= stepMs && d.step < cfg.fadeSteps) {
                d.stepMs -= stepMs;
                d.step++;
            }
            const t = cfg.fadeSteps > 0 ? d.step / cfg.fadeSteps : 1;
            if (this._redFilter) {
                const m = IDENTITY.slice();
                for (let i = 0; i < 20; i++) m[i] += (RED_MATRIX[i] - m[i]) * t;
                this._redFilter.matrix = m;
            }
            if (d.step >= cfg.fadeSteps) {
                if (!d.fadeDoneAt) d.fadeDoneAt = performance.now();
                d.state = "dialog";
                this.createPalDefeatDialog();
            }
        } else if (d.state === "dialog") {
            this.redrawPalDefeatDialog();
            d.holdMs += dt;
            const auto = cfg.dialogHoldMs > 0 && d.holdMs >= cfg.dialogHoldMs;
            const keyed = cfg.anyKey ? anyKeyTriggered()
                : (Input.isTriggered("ok") || TouchInput.isTriggered());
            if (auto || keyed) {
                this.leavePalDefeat();
            }
        }
    };

    //=============================================================================
    // 居中文字（0x003B kDialogCenter）——⚠ 没有底板、没有边框
    //   · 左缘 PAL x=80，首行 PAL y=40，行距 18（text.c 1320-1322 / 1660-1661）
    //     （kDialogCenter 不是居中排版；kDialogCenterWindow 的 160 才是居中）
    //   · $00 占掉第 0 行 → 两条正文落在第 1、2 行 = PAL y 58 / 76
    //   · 三重阴影（text.c 1144-1152）
    //=============================================================================
    Scene_Gameover.prototype.createPalDefeatDialog = function () {
        const d = this._palDefeat;
        const k = Graphics.boxWidth / 320;          // 320×200 PAL → 960×600
        const fs = Math.round(cfg.fontSize * k);    // 16 → 48
        const lh = Math.round(cfg.lineHeight * k);  // 18 → 54
        const sh = Math.max(1, Math.round(cfg.shadowOffset * k));
        const lines = PalBattleDefeat.LINES;

        // 位图只包住文字本身（+1 个阴影偏移），不画任何底板
        const scratch = new Bitmap(8, 8);
        scratch.fontFace = $gameSystem.mainFontFace();
        scratch.fontSize = fs;
        let tw = 0;
        for (const line of lines) tw = Math.max(tw, scratch.measureTextWidth(line));

        const w = Math.ceil(tw) + sh;
        const h = lh * lines.length + sh;
        const sprite = new Sprite(new Bitmap(w, h));
        // 居中（默认）：整块文字在屏幕正中；关掉则退回原版 PAL 左对齐坐标。
        // ⚠ 这里用 Graphics.width/height（画布，960×600），不是 boxWidth/boxHeight
        //   （UI 安全区，952×592，SceneManager.initGraphics 内缩 boxMargin=4）。
        //   文字是直接挂在场景上的全屏覆盖层，不在 WindowLayer 里，所以按画布居中。
        sprite.x = cfg.centerX
            ? Math.round((Graphics.width - w) / 2) + (cfg.offsetX | 0)
            : Math.round(cfg.textX * k) + (cfg.offsetX | 0);
        sprite.y = cfg.centerY
            ? Math.round((Graphics.height - h) / 2) + (cfg.offsetY | 0)
            : Math.round((cfg.textY + cfg.firstLine * cfg.lineHeight) * k) + (cfg.offsetY | 0);
        this.addChild(sprite);
        d.dialog = { sprite: sprite, fs: fs, lh: lh, k: k, sh: sh, wid: w, ready: false };
        this.redrawPalDefeatDialog();
    };

    Scene_Gameover.prototype.redrawPalDefeatDialog = function () {
        const d = this._palDefeat;
        if (!d || !d.dialog || d.dialog.ready) return;
        const { sprite, fs, lh, sh, wid } = d.dialog;
        const bitmap = sprite.bitmap;
        bitmap.clear();
        bitmap.fontFace = $gameSystem.mainFontFace();
        bitmap.fontSize = fs;
        bitmap.outlineWidth = 0;
        // 给 maxWidth 留出阴影的余量，否则 MZ 的 drawText 会误判换行
        const maxW = wid + sh;
        // $00 / $02 已把打字机延时设成 0 → 整句立刻出现（不做逐字显示）
        PalBattleDefeat.LINES.forEach((line, i) => {
            const y = i * lh;
            // 三重阴影（原版 (+1,0)/(0,+1)/(+1,+1)，颜色索引 0 = 纯黑）
            bitmap.textColor = cfg.shadowColor;
            bitmap.drawText(line, sh, y, maxW, lh, "left");
            bitmap.drawText(line, 0, y + sh, maxW, lh, "left");
            bitmap.drawText(line, sh, y + sh, maxW, lh, "left");
            // 正文
            bitmap.textColor = cfg.color;
            bitmap.drawText(line, 0, y, maxW, lh, "left");
        });
        d.dialog.ready = true;
    };

    Scene_Gameover.prototype.gotoTitle = function () {
        SoundManager.playCancel();
        SceneManager.goto(Scene_Title);
    };

    // 没有最近存档 → 从头开始（对齐 Scene_Title.commandNewGame，rmmz_scenes.js 599）
    Scene_Gameover.prototype.startNewGame = function () {
        DataManager.setupNewGame();   // 内含 $gamePlayer.setupForNewGame() → 传送到起始地图
        this.fadeOutAll();
        SceneManager.goto(Scene_Map);
    };

    // 0x004E：读回最后一次存档；没有存档就从头开始（onNoSave）
    Scene_Gameover.prototype.leavePalDefeat = function () {
        const d = this._palDefeat;
        if (!d || d.leaving) return;
        d.leaving = true;
        if (!cfg.autoReload) { this.gotoTitle(); return; }
        const id = DataManager.latestSavefileId();
        const hasSave = id > 0 && DataManager.savefileExists(id);
        if (!hasSave) {
            if (cfg.onNoSave === "title") { this.gotoTitle(); return; }
            this.startNewGame();
            return;
        }
        this.fadeOutAll();
        DataManager.loadGame(id).then(() => {
            // 对齐 Scene_Load.onLoadSuccess 的收尾（Scene_LoadBase 的方法这里没有）
            if ($gameSystem.versionId() !== $dataSystem.versionId) {
                $gamePlayer.reserveTransfer($gameMap.mapId(), $gamePlayer.x, $gamePlayer.y);
                $gamePlayer.requestMapReload();
            }
            SceneManager.goto(Scene_Map);
        }).catch(() => { this.startNewGame(); });
    };

    const _goUpdate = Scene_Gameover.prototype.update;
    Scene_Gameover.prototype.update = function () {
        const d = this._palDefeat;
        if (cfg.enabled && d) {
            // 计一个稳定的帧间隔（首次为 0，避免开局跳一大步）
            const now = performance.now();
            this._palDefeatDelta = this._palDefeatLast ? now - this._palDefeatLast : 0;
            this._palDefeatLast = now;
            this.updatePalDefeat();
            // 原版 MZ 的"按键回标题"要挡掉：本演出结束后是读档（0x004E）
            Scene_Base.prototype.update.call(this);
            return;
        }
        _goUpdate.call(this);
    };

    // 渐红进行中不响应 MZ 默认的"任意键回标题"
    const _goIsTriggered = Scene_Gameover.prototype.isTriggered;
    Scene_Gameover.prototype.isTriggered = function () {
        if (cfg.enabled && this._palDefeat && !this._palDefeat.leaving) return false;
        return _goIsTriggered.call(this);
    };
})();
