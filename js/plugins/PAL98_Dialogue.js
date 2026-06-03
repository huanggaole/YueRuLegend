/*:
 * @target MZ
 * @plugindesc [v2.0] 仙剑98柔情版 文字对话样式 | PAL98 Classic Dialogue System
 * @author Antigravity
 *
 * @help
 * ============================================================================
 * 仙剑98柔情版 对话系统 v2.0
 * ============================================================================
 * 完整复刻《仙剑奇侠传98柔情版》的经典对话显示风格：
 *
 * 【对话模式】通过 RMMZ 事件编辑器的"显示文字"命令来控制显示方式：
 *   - 位置：上方 (kDialogUpper)  → 名字在屏幕左上，文字在下方
 *   - 位置：下方 (kDialogLower)  → 名字在屏幕左下，文字在上方
 *   - 位置：中间 (kDialogCenter) → 文字在屏幕中央
 *
 * 【角色名字】
 *   方式A: 使用 RMMZ 内置"姓名"字段填写说话者名字
 *   方式B: 在文字首行以 "名字：" 或 "名字:" 格式开头，插件自动解析
 *
 * 【头像】
 *   使用 RMMZ 内置"脸图"字段。
 *   上方对话 → 头像在屏幕左上角（文字在头像右侧）
 *   下方对话 → 头像在屏幕右下角（文字在左侧）
 *
 * 【双人对话】
 *   连续使用上方+下方对话，画面上会同时显示两段对话（持久保留）
 *
 * @param FontSize
 * @text 字号
 * @type number
 * @default 48
 *
 * @param LineHeight
 * @text 行高
 * @type number
 * @default 54
 *
 * @param TitleColor
 * @text 角色名颜色
 * @type string
 * @default #38c0a8
 *
 * @param BodyColor
 * @text 正文颜色
 * @type string
 * @default #ffffff
 *
 * @param ShadowOffsetX
 * @text 阴影X偏移
 * @type number
 * @default 3
 *
 * @param ShadowOffsetY
 * @text 阴影Y偏移
 * @type number
 * @default 3
 *
 * @param FaceScale
 * @text 头像缩放比例
 * @type number
 * @decimals 2
 * @default 3.0
 *
 * @param DialogueRegionHeight
 * @text 对话区域高度(暂作保留)
 * @type number
 * @default 180
 *
 * @param TopFaceX
 * @text 上方头像X
 * @type number
 * @default -66
 *
 * @param TopFaceY
 * @text 上方头像Y
 * @type number
 * @default -66
 *
 * @param BottomFaceX
 * @text 下方头像X
 * @type number
 * @default -66
 *
 * @param BottomFaceY
 * @text 下方头像Y
 * @type number
 * @default -66
 *
 * @param TopTextX
 * @text 上方文字X
 * @type number
 * @default -132
 *
 * @param TopTextY
 * @text 上方文字Y
 * @type number
 * @default 0
 *
 * @param BottomTextX
 * @text 下方文字X
 * @type number
 * @default 0
 *
 * @param BottomTextY
 * @text 下方文字Y
 * @type number
 * @default 66
 */

(() => {
    'use strict';

    const pluginName = "PAL98_Dialogue";
    const params = PluginManager.parameters(pluginName);

    // ===== 参数读取 =====
    const PAL_FONT_SIZE = Number(params['FontSize'] || 48);
    const PAL_LINE_HEIGHT = Number(params['LineHeight'] || 54);
    const PAL_NAME_COLOR = String(params['TitleColor'] || '#38c0a8');
    const PAL_TEXT_COLOR = String(params['BodyColor'] || '#ffffff');
    const PAL_SHADOW_X = Number(params['ShadowOffsetX'] || 3);
    const PAL_SHADOW_Y = Number(params['ShadowOffsetY'] || 3);
    const PAL_FACE_SCALE = Number(params['FaceScale'] || 3.0);
    const PAL_TOP_MX = Number(params['TopFaceX'] || -66);
    const PAL_TOP_MY = Number(params['TopFaceY'] || -66);
    const PAL_BOT_MX = Number(params['BottomFaceX'] || -66);
    const PAL_BOT_MY = Number(params['BottomFaceY'] || -66);
    const PAL_TOP_TEXT_X = Number(params['TopTextX'] || -132);
    const PAL_TOP_TEXT_Y = Number(params['TopTextY'] || 0);
    const PAL_BOT_TEXT_X = Number(params['BottomTextX'] || 0);
    const PAL_BOT_TEXT_Y = Number(params['BottomTextY'] || 66);
    // 每页最多显示行数（不含名字行）
    const PAL_MAX_LINES = 4;
    // 名字行到正文的间距
    const PAL_NAME_BODY_GAP = 0;

    // ===== 辅助：在 Bitmap 上绘制带阴影的文字（仙剑风格）=====
    // 先画黑色偏移阴影，再画主色文字
    function drawShadowText(bitmap, text, x, y, maxWidth, lineHeight, align, mainColor) {
        bitmap.outlineWidth = 0;          // 关闭描边，仙剑用的是实体阴影而非描边
        // 1. 黑色阴影
        bitmap.textColor = '#000000';
        bitmap.drawText(text, x + PAL_SHADOW_X, y + PAL_SHADOW_Y, maxWidth, lineHeight, align);
        // 2. 主色
        bitmap.textColor = mainColor;
        bitmap.drawText(text, x, y, maxWidth, lineHeight, align);
    }

    // ===== 隐藏默认 Window_NameBox =====
    Window_NameBox.prototype.updateOpenness = function () {
        this.openness = 0;
    };
    // 不让它影响窗口布局
    const _WNB_start = Window_NameBox.prototype.start;
    Window_NameBox.prototype.start = function () {
        this.visible = false;
        this.openness = 0;
    };

    // ===== Window_Message 全面重写 =====

    // ---------- initialize ----------
    const _WM_init = Window_Message.prototype.initialize;
    Window_Message.prototype.initialize = function (rect) {
        // 使用全屏区域
        const fullRect = new Rectangle(0, 0, Graphics.boxWidth, Graphics.boxHeight);
        _WM_init.call(this, fullRect);
        this.opacity = 0;
        this.backOpacity = 0;
        this.frameVisible = false;
        this._palFaceSprites = { top: null, bottom: null };
        this._palActiveSide = null;   // 'top' or 'bottom'
        this._palSpeakerName = '';
        this._palPageTexts = [];      // 当前页的文字行
        this._palCurrentLine = 0;
        this._palNeedsRedraw = false;
        this._createPalFaceSprites();
        this._createPalMiddleScrollSprites();
    };

    // ---------- 创建头像精灵 ----------
    Window_Message.prototype._createPalFaceSprites = function () {
        const topSprite = new Sprite();
        const bottomSprite = new Sprite();
        topSprite.visible = false;
        bottomSprite.visible = false;
        this.addChild(topSprite);
        this.addChild(bottomSprite);
        this._palFaceSprites.top = topSprite;
        this._palFaceSprites.bottom = bottomSprite;
    };

    // ---------- 创建中间卷轴精灵 ----------
    Window_Message.prototype._createPalMiddleScrollSprites = function () {
        this._palMiddleScrollSprites = { left: new Sprite(), center: new TilingSprite(), right: new Sprite() };
        this._palMiddleScrollSprites.left.bitmap = ImageManager.loadSystem('Data944');
        this._palMiddleScrollSprites.center.bitmap = ImageManager.loadSystem('Data945');
        this._palMiddleScrollSprites.right.bitmap = ImageManager.loadSystem('Data946');

        this._palMiddleScrollSprites.left.scale.set(3, 3);
        this._palMiddleScrollSprites.center.scale.set(3, 3);
        this._palMiddleScrollSprites.right.scale.set(3, 3);

        this._palMiddleScrollSprites.left.visible = false;
        this._palMiddleScrollSprites.center.visible = false;
        this._palMiddleScrollSprites.right.visible = false;

        // 放在背景层，文字之下
        if (this._clientArea) {
            this._clientArea.addChildAt(this._palMiddleScrollSprites.left, 0);
            this._clientArea.addChildAt(this._palMiddleScrollSprites.center, 0);
            this._clientArea.addChildAt(this._palMiddleScrollSprites.right, 0);
        } else {
            this.addChildToBack(this._palMiddleScrollSprites.right);
            this.addChildToBack(this._palMiddleScrollSprites.center);
            this.addChildToBack(this._palMiddleScrollSprites.left);
        }
    };

    // ---------- updatePlacement：窗口始终全屏，只更新当前方位 ----------
    Window_Message.prototype.updatePlacement = function () {
        this._positionType = $gameMessage.positionType();
        this.x = 0;
        this.y = 0;
        this.width = Graphics.boxWidth;
        this.height = Graphics.boxHeight;
    };

    // ---------- updateBackground ----------
    Window_Message.prototype.updateBackground = function () {
        this.setBackgroundType(2); // 完全透明
    };

    // ---------- 强制透明 ----------
    const _WM_show = Window_Message.prototype.show;
    Window_Message.prototype.show = function () {
        _WM_show.call(this);
        this.opacity = 0;
        this.backOpacity = 0;
        this.frameVisible = false;
    };

    // ---------- startMessage：解析名字，准备绘制 ----------
    const _WM_startMessage = Window_Message.prototype.startMessage;
    Window_Message.prototype.startMessage = function () {
        // 1. 解析说话者名字
        let speakerName = $gameMessage.speakerName() || '';
        let texts = $gameMessage._texts.slice(); // 复制

        if (!speakerName && texts.length > 0) {
            // 尝试从第一行解析 "名字：" 格式
            const firstLine = texts[0];
            const match = firstLine.match(/^([^\n\r：:]{1,10})[：:](.*)/);
            if (match) {
                speakerName = match[1];
                // 替换第一行为冒号后的内容
                const rest = match[2];
                if (rest.trim()) {
                    texts[0] = rest;
                } else {
                    texts.shift(); // 移除空行
                }
                $gameMessage._texts = texts;
            }
        }

        this._palSpeakerName = speakerName;
        this._positionType = $gameMessage.positionType();
        this._palActiveSide = (this._positionType === 0) ? 'top' :
            (this._positionType === 2) ? 'bottom' : 'middle';

        _WM_startMessage.call(this);
    };

    // ---------- newPage：核心定位逻辑 ----------
    const _WM_newPage = Window_Message.prototype.newPage;
    Window_Message.prototype.newPage = function (textState) {
        const pos = this._positionType; // 0=top,1=mid,2=bottom
        const side = this._palActiveSide;

        // 有选择地清除画面区域（实现双人对话持久显示）
        this._clearPalRegion(pos);

        // 阻止 super 的 contents.clear() 清掉全屏
        const origClear = this.contents.clear.bind(this.contents);
        this.contents.clear = () => { };
        _WM_newPage.call(this, textState);
        this.contents.clear = origClear;

        // 重置字体设置
        this._applyPalFontSettings();

        // 计算起始坐标
        const coords = this._getPalTextCoords(pos);

        // 加载并定位头像
        this._loadPalFace(pos);

        // 绘制名字行
        if (this._palSpeakerName) {
            this._drawPalName(this._palSpeakerName, coords.nameX, coords.nameY);
        }

        // 重置字体颜色为正文颜色（_drawPalName 会把 textColor 留在 NameColor，需要还原）
        this._applyPalFontSettings();

        // 中间卷轴显示逻辑
        if (pos === 1 && this._palMiddleScrollSprites) {
            const leftSpr = this._palMiddleScrollSprites.left;
            const centerSpr = this._palMiddleScrollSprites.center;
            const rightSpr = this._palMiddleScrollSprites.right;

            // 预估原图宽度，如果尚未加载完成先给个默认值
            const lImgW = leftSpr.bitmap.isReady() ? leftSpr.bitmap.width : 16;
            const lImgH = leftSpr.bitmap.isReady() ? leftSpr.bitmap.height : 24;
            const rImgW = rightSpr.bitmap.isReady() ? rightSpr.bitmap.width : 16;

            const scale = 3;
            const lw = lImgW * scale;
            const rw = rImgW * scale;

            // 计算中间平铺部分的宽度（文字宽度 + 两侧边距）
            const textPadding = 24;
            const centerW = (coords.textWidth || 200) + textPadding * 2;

            const totalW = lw + centerW + rw;
            const startX = (Graphics.boxWidth - totalW) / 2;
            // 卷轴垂直中心对齐到文字的垂直中心
            const startY = coords.textY + PAL_LINE_HEIGHT / 2 - (lImgH * scale) / 2;

            leftSpr.x = startX;
            leftSpr.y = startY;
            leftSpr.visible = true;

            centerSpr.x = startX + lw;
            centerSpr.y = startY;
            centerSpr.width = Math.ceil(centerW / scale); // TilingSprite 的 width 是缩放前的大小
            centerSpr.height = lImgH;
            centerSpr.visible = true;

            rightSpr.x = startX + lw + centerW;
            rightSpr.y = startY;
            rightSpr.visible = true;

            // 重新微调文字的 X 坐标使其完美在卷轴中居中
            coords.textX = startX + lw + textPadding;
        }

        // 设置 textState 起始坐标（正文从名字行下方开始）
        textState.x = coords.textX;
        textState.startX = coords.textX;
        textState.y = coords.textY;
        textState.height = PAL_LINE_HEIGHT;
        textState.left = coords.textX;

        // 初始化最新文字坐标，供停顿图标使用
        this._palLastTextX = textState.x;
        this._palLastTextY = textState.y;
    };

    // ---------- 分区清除 ----------
    Window_Message.prototype._clearPalRegion = function (posType) {
        const w = Graphics.boxWidth;
        const h = Graphics.boxHeight;
        if (posType === 0) { // 上方：清除上半部分
            this.contents.clearRect(0, 0, w, h / 2);
            if (this._palFaceSprites.top) this._palFaceSprites.top.visible = false;
        } else if (posType === 2) { // 下方：清除下半部分
            this.contents.clearRect(0, h / 2, w, h / 2);
            if (this._palFaceSprites.bottom) this._palFaceSprites.bottom.visible = false;
        } else { // 中间：清除全部
            this.contents.clear();
            if (this._palFaceSprites.top) this._palFaceSprites.top.visible = false;
            if (this._palFaceSprites.bottom) this._palFaceSprites.bottom.visible = false;
            if (this._palMiddleScrollSprites) {
                this._palMiddleScrollSprites.left.visible = false;
                this._palMiddleScrollSprites.center.visible = false;
                this._palMiddleScrollSprites.right.visible = false;
            }
        }
    };

    // ---------- 计算名字和正文的坐标 ----------
    Window_Message.prototype._getPalTextCoords = function (posType) {
        const faceW = ImageManager.faceWidth * PAL_FACE_SCALE;
        const faceH = ImageManager.faceHeight * PAL_FACE_SCALE;
        const hasFace = $gameMessage.faceName() !== '';

        // 计算正文比名字的缩进量
        const textIndent = hasFace ? PAL_FONT_SIZE : PAL_FONT_SIZE * 2;

        if (posType === 0) {
            // 上方对话
            // 名字：左上角，距顶部 PAL_TOP_MY
            const nameX = hasFace ? PAL_TOP_TEXT_X + faceW : 0;
            const nameY = PAL_TOP_TEXT_Y;
            // 正文在名字下方，加入缩进
            const textX = nameX + textIndent;
            const textY = this._palSpeakerName
                ? nameY + PAL_LINE_HEIGHT + PAL_NAME_BODY_GAP
                : nameY;
            return { nameX, nameY, textX, textY };
        } else if (posType === 2) {
            // 下方对话
            // 文字区域高度 = 名字行 + 正文行
            const totalLines = PAL_MAX_LINES + (this._palSpeakerName ? 1 : 0);
            const totalHeight = totalLines * PAL_LINE_HEIGHT + PAL_NAME_BODY_GAP;
            // 名字行位置（从屏幕底部往上算）
            const nameY = Graphics.boxHeight - PAL_BOT_TEXT_Y - totalHeight;
            const nameX = PAL_BOT_TEXT_X;
            // 正文在名字下方，加入缩进
            const textY = this._palSpeakerName
                ? nameY + PAL_LINE_HEIGHT + PAL_NAME_BODY_GAP
                : nameY;
            const textX = nameX + textIndent;
            return { nameX, nameY, textX, textY };
        } else {
            // 中间卷轴
            // 获取正文内容并计算宽度（假设中间文本只有一行，且无名字）
            const text = $gameMessage.allText();
            const textInfo = this.textSizeEx(text);
            const textWidth = textInfo.width || 200;

            // 文本和卷轴在屏幕中水平居中，Y坐标指定为大约 200 像素
            const textX = (Graphics.boxWidth - textWidth) / 2;
            const textY = 160;

            return { nameX: 0, nameY: 0, textX, textY, textWidth };
        }
    };

    // ---------- 绘制名字（带阴影） ----------
    Window_Message.prototype._drawPalName = function (name, x, y) {
        const bitmap = this.contents;
        const oldFontSize = bitmap.fontSize;
        bitmap.fontSize = PAL_FONT_SIZE;
        drawShadowText(bitmap, name + '：', x, y, 800, PAL_LINE_HEIGHT, 'left', PAL_NAME_COLOR);
        bitmap.fontSize = oldFontSize;
    };

    // ---------- 加载并设置头像精灵位置 ----------
    Window_Message.prototype._loadPalFace = function (posType) {
        const faceName = $gameMessage.faceName();
        const faceIndex = $gameMessage.faceIndex();
        const faceW = ImageManager.faceWidth;
        const faceH = ImageManager.faceHeight;

        const topSprite = this._palFaceSprites.top;
        const bottomSprite = this._palFaceSprites.bottom;

        if (!faceName) {
            // 无头像
            if (posType === 0 && topSprite) topSprite.visible = false;
            if (posType === 2 && bottomSprite) bottomSprite.visible = false;
            return;
        }

        const bitmap = ImageManager.loadFace(faceName);
        const sprite = posType === 0 ? topSprite : bottomSprite;
        if (!sprite) return;

        const applyFrame = () => {
            const cols = 4;
            const fx = (faceIndex % cols) * faceW;
            const fy = Math.floor(faceIndex / cols) * faceH;
            sprite.bitmap = bitmap;
            sprite.setFrame(fx, fy, faceW, faceH);
            sprite.scale.x = PAL_FACE_SCALE;
            sprite.scale.y = PAL_FACE_SCALE;
            sprite.visible = true;

            if (posType === 0) {
                // 上方：头像在左上角
                sprite.x = PAL_TOP_MX;
                sprite.y = PAL_TOP_MY;
            } else if (posType === 2) {
                // 下方：头像在右下角
                sprite.x = Graphics.boxWidth - faceW * PAL_FACE_SCALE - PAL_BOT_MX;
                sprite.y = Graphics.boxHeight - faceH * PAL_FACE_SCALE - PAL_BOT_MY;
            }
        };

        if (bitmap.isReady()) {
            applyFrame();
        } else {
            bitmap.addLoadListener(applyFrame);
        }
    };

    // ---------- drawMessageFace：禁用默认头像绘制（我们用精灵） ----------
    Window_Message.prototype.drawMessageFace = function () {
        // 由 _loadPalFace 处理，此处不执行默认行为
    };

    // ---------- loadMessageFace：配合让 updateLoading 不等待 ----------
    Window_Message.prototype.loadMessageFace = function () {
        const faceName = $gameMessage.faceName();
        if (faceName) {
            // 先异步触发 _loadPalFace
            this._loadPalFace(this._positionType);
        }
        this._faceBitmap = null; // 不让 updateLoading 卡住
    };

    // ---------- 字体设置 ----------
    Window_Message.prototype._applyPalFontSettings = function () {
        this.contents.fontFace = $gameSystem.mainFontFace(); // 使用项目字体（Unifont点阵黑）
        this.contents.fontSize = PAL_FONT_SIZE;
        this.contents.textColor = PAL_TEXT_COLOR;
        this.contents.outlineWidth = 0;   // 无描边，使用阴影
    };

    Window_Message.prototype.resetFontSettings = function () {
        this._applyPalFontSettings();
    };

    Window_Message.prototype.lineHeight = function () {
        return PAL_LINE_HEIGHT;
    };

    // ---------- 文字渲染：覆写 flushTextState 实现仙剑阴影 ----------
    // RMMZ 的流程是：processCharacter 把字符累积到 textState.buffer，
    // 再由 flushTextState 统一调 contents.drawText 绘制。
    // 因此阴影必须在 flushTextState 里拦截，processNormalCharacter 永远不会被调用。
    const _WM_flushTextState = Window_Message.prototype.flushTextState ||
        Window_Base.prototype.flushTextState;
    Window_Message.prototype.flushTextState = function (textState) {
        const text = textState.buffer;
        if (!text || text === '' || !textState.drawing) {
            // 没有内容或不需要绘制时，走原逻辑（只更新坐标）
            _WM_flushTextState.call(this, textState);
            return;
        }

        const bitmap = this.contents;
        const rtl = textState.rtl;
        const width = this.textWidth(text);
        const height = textState.height;
        const x = rtl ? textState.x - width : textState.x;
        const y = textState.y;

        // 保存当前颜色
        const mainColor = bitmap.textColor;

        if (this._positionType === 1) {
            // 中间卷轴：纯黑文字，无阴影
            bitmap.textColor = '#000000';
            bitmap.drawText(text, x, y, width + 10, height, 'left');
        } else {
            // 1. 黑色阴影（偏移绘制）
            bitmap.textColor = '#000000';
            bitmap.drawText(text, x + PAL_SHADOW_X, y + PAL_SHADOW_Y, width + 10, height, 'left');

            // 2. 主色文字
            bitmap.textColor = mainColor;
            bitmap.drawText(text, x, y, width + 10, height, 'left');
        }

        // 更新 textState 坐标（与原版 flushTextState 逻辑一致）
        textState.x += rtl ? -width : width;

        // 记录最后输出文字的坐标，供停顿图标使用
        this._palLastTextX = textState.x;
        this._palLastTextY = textState.y;

        textState.buffer = this.createTextBuffer(rtl);
        const outputWidth = Math.abs(textState.x - textState.startX);
        if (textState.outputWidth < outputWidth) {
            textState.outputWidth = outputWidth;
        }
        textState.outputHeight = y - textState.startY + height;
    };


    // ---------- needsNewPage：基于实际内容位置判断是否需要翻页 ----------
    Window_Message.prototype.needsNewPage = function (textState) {
        if (this.isEndOfText(textState)) return false;
        // 当前行的底部超出内容区则翻页
        return textState.y + textState.height > this.contents.height;
    };

    // ---------- terminateMessage：清理 ----------
    const _WM_terminate = Window_Message.prototype.terminateMessage;
    Window_Message.prototype.terminateMessage = function () {
        _WM_terminate.call(this);
        // 全部对话结束时清理画面和头像
        if (this._palFaceSprites.top) this._palFaceSprites.top.visible = false;
        if (this._palFaceSprites.bottom) this._palFaceSprites.bottom.visible = false;
        if (this._palMiddleScrollSprites) {
            this._palMiddleScrollSprites.left.visible = false;
            this._palMiddleScrollSprites.center.visible = false;
            this._palMiddleScrollSprites.right.visible = false;
        }
        this.contents.clear();
        this._palSpeakerName = '';
        this._palActiveSide = null;
    };

    // ---------- ▼ 停顿图标：金色三角形，紧接在文字末尾 ----------
    // ---------- ▼ 停顿图标：金色三角形，紧接在文字末尾 ----------
    Window_Message.prototype._refreshPauseSign = function () {
        const SIZE_W = 30;
        const SIZE_H = 20;
        const sprite = this._pauseSignSprite;
        if (!sprite) return;

        const colors = [
            '#d6ad4e', '#d9b45a', '#e0c066', '#e7cc72', '#edda7e',
            '#f3e472', '#edda7e', '#e7cc72', '#e0c066', '#d9b45a'
        ];

        // 创建横向长图，容纳所有颜色的三角形（精灵图）
        sprite.bitmap = new Bitmap(SIZE_W * colors.length, SIZE_H);
        const ctx = sprite.bitmap.context;

        for (let i = 0; i < colors.length; i++) {
            const offsetX = i * SIZE_W;
            ctx.fillStyle = colors[i];
            ctx.beginPath();
            ctx.moveTo(offsetX, 0);
            ctx.lineTo(offsetX + SIZE_W, 0);
            ctx.lineTo(offsetX + SIZE_W / 2, SIZE_H);
            ctx.closePath();
            ctx.fill();
        }
        sprite.bitmap.baseTexture.update();

        sprite.anchor.set(0.5, 0.5);
        sprite.setFrame(0, 0, SIZE_W, SIZE_H);
        sprite.visible = false;

        // 动画状态初始化
        this._palPauseColorIndex = 0;
        this._palPauseTimer = 0;
    };

    Window_Message.prototype._updatePauseSign = function () {
        const sprite = this._pauseSignSprite;
        if (!sprite) return;

        // 不在中间系统卷轴显示停顿倒三角
        if (!this.pause || this._positionType === 1) {
            sprite.visible = false;
            return;
        }

        if (this._palLastTextX !== undefined && this._palLastTextY !== undefined) {
            // 放在最后一个字符的右侧，垂直居中
            // 坐标基于 window，需要加上内边距
            sprite.x = this.padding + this._palLastTextX + 20;
            // 加上 10 的偏移，直接调整精灵图的位置，而不是画在画布外面
            sprite.y = this.padding + this._palLastTextY + PAL_LINE_HEIGHT / 2 + 10;
        }

        sprite.visible = this.isOpen();

        if (sprite.visible) {
            // 呼吸颜色动画（替代透明度闪烁）
            if (this._palPauseTimer === undefined) this._palPauseTimer = 0;
            if (this._palPauseColorIndex === undefined) this._palPauseColorIndex = 0;

            this._palPauseTimer++;
            if (this._palPauseTimer >= 4) { // 每 4 帧切换一次颜色
                this._palPauseTimer = 0;
                this._palPauseColorIndex = (this._palPauseColorIndex + 1) % 10;
                sprite.setFrame(this._palPauseColorIndex * 30, 0, 30, 20);
            }

            // 确保是不透明的
            sprite.alpha = 1.0;
        }
    };

    // ---------- newLineX：RMMZ 原版用来计算每行开始X ----------
    // 我们在 newPage 里已经正确设置了 textState.x，这里配合
    Window_Message.prototype.newLineX = function (textState) {
        const pos = this._positionType;
        const hasFace = $gameMessage.faceName() !== '';
        const textIndent = hasFace ? PAL_FONT_SIZE : PAL_FONT_SIZE * 2;

        if (pos === 0) {
            const baseNameX = hasFace ? PAL_TOP_TEXT_X + ImageManager.faceWidth * PAL_FACE_SCALE : PAL_TOP_TEXT_X;
            return baseNameX + textIndent;
        } else if (pos === 2) {
            return PAL_BOT_TEXT_X + textIndent;
        } else {
            return PAL_TOP_MX + textIndent;
        }
    };

})();
