/*:
 * @target MZ
 * @plugindesc [v1.0] 仙剑98柔情版 中毒/异常状态的界面表现（战斗头像按毒染色 + 眠定乱封状态字 + 状态界面毒名单）
 * @author AI Assistant
 *
 * @help
 * 本插件只做「把已经在跑的毒/异常状态画出来」，不改任何数值逻辑。
 * 毒数据仍由 palPoison.js 管理（附加/解除/回合计数都在那边）。
 *
 * 需排在 palWindow.js（Window_PaladinPartyStatus）、palStatus.js（Window_PalStatus）、
 * palPoison.js（PalPoison）之后加载。
 *
 * ===== ① 战斗栏头像按毒染色（uibattle.c 127-162）=====
 * 原版不是画图标，而是把【整张头像】重绘成毒的颜色：
 *     PAL_RLEBlitMonoColor(头像, 屏, pos, poison.wColor, 0)
 * 而 MonoColor 的实现（palcommon.c 530 / 602-616）是：
 *     bColor &= 0xF0;                     // 只取毒色的高 4 位 → 16 色块的起始索引
 *     out    = (srcIdx & 0x0F) | bColor;  // 头像自身的低 4 位（明度）保留
 * 也就是：头像被映射成「从 (wColor & 0xF0) 开始的 16 级色阶」，明度仍是原图的明度。
 * 死亡时 bPoisonColor = 0 → 走 0x00 块（黑白色阶）。
 *
 * 本工程拿到的是已经渲染好的 RGBA 头像（img/system/actorN.png），拿不到原版索引，
 * 因此按等价做法实现：算每像素亮度 L → 映射到色阶第 round(L*15) 级。
 *
 * 毒色取自 Pat.mkf chunk 0（palette.c PAL_GetPalette：6 位分量 << 2）：
 *     赤毒16  尸毒64  瘴毒33  毒丝224  三尸蛊128  鹤顶红160
 *     孔雀胆80 血海棠96 断肠草192 金蚕蛊176
 *   → & 0xF0 后：赤0x10 瘴0x20 尸0x40 孔雀胆0x50 血海棠0x60 三尸蛊0x80
 *                 鹤顶红0xA0 金蚕蛊0xB0 断肠草0xC0 毒丝0xE0
 * 可用 tools/pal_dump_ui_colors.py 复核。
 *
 * ===== ② 战斗栏四个状态字（uibattle.c 66-101 / 243-255）=====
 * 原版只画 4 种（其余 STATUS 的 word 是 0，永不显示），且仅 HP > 0 时画：
 *     疯魔 乱 (35,19) 0x5F    定身 定 (44,12) 0xBF
 *     昏睡 眠 (54,1)  0x0E    咒封 封 (55,20) 0x3C
 * 坐标是相对信息框原点的 PAL 像素；本工程底板 Data918 画在 (x+2*s, y+3*s)，
 * 所以屏幕坐标 = x + (2 + px) * s, y + (3 + py) * s。
 *
 * 状态 → 字的映射优先读 States.json 的备注 <pal98Status:乱>，
 * 读不到再兜底 GLYPH_STATE_IDS（工程惯例：真值由 tools/pal_patch_status_glyph.py
 * 写进备注，插件只读）。
 *
 * ===== ③ 状态界面毒名单（uigame.c 1245-1253 / palcfg.c 370-376）=====
 * 原版把身上所有 wPoisonLevel <= 3 的毒名列出来，颜色 = poison.wColor + 10，最多 16 条。
 * 位置是固定竖列：x=185，y=58+18*j（8 行，超出原版表也叠在 184）——
 * 即【头像右侧、头饰装备名下方】，不是左下角。
 * 注意：原版状态界面**不显示**异常状态（rgPlayerStatus 在 uigame.c 出现 0 次），
 * 本插件也照此办理，眠/定/乱/封不进状态界面。
 *
 * ===== 调参 =====
 *   PAL98.setStatusFx({ poisonTint: false })      关掉头像染色
 *   PAL98.setStatusFx({ glyphSizePAL: 20 })       状态字改大
 *   PAL98.setStatusFx({ poisonListOffsetY: 30 })  毒名单整体下移
 *   PalStatusFx.refresh()                         立即重画所有相关窗口
 */
(() => {
    "use strict";

    const PalStatusFx = (window.PalStatusFx = {});

    //=============================================================================
    // 可调参数
    //=============================================================================
    const cfg = (window.PAL98_STATUS_UI = {
        enabled: true,

        // ---- ① 头像毒染色 ----
        poisonTint: true,        // 中毒 → 头像整张按毒色阶重绘
        deadGrayscale: true,     // 死亡 → 0x00 块（黑白），对应 uibattle.c 149
        tintStrength: 1,         // 0..1，与原始头像混合（1 = 完全用毒色阶）
        tintGamma: 1,            // 亮度 gamma，>1 压暗、<1 提亮（只影响取色档位）

        // ---- ② 状态字 ----
        statusGlyphs: true,      // 眠 / 定 / 乱 / 封
        glyphSizePAL: 16,        // PAL 汉字 16×16
        glyphOffsetX: 0,         // 微调（屏幕 px）
        glyphOffsetY: 0,
        glyphOutlineColor: "rgba(0, 0, 0, 0.85)",
        glyphOutlineWidth: 0,    // 原版无描边；看不清再开 3~4

        // 信息框原点相对 drawActorStatus 传入 (x, y) 的偏移（PAL px）
        //   palWindow.js:855 底板画在 (x + 2*s, y + 3*s)
        boxOffsetX: 2,
        boxOffsetY: 3,

        // ---- ③ 状态界面毒名单 ----
        poisonList: true,
        // 原版是固定竖列（palcfg.c 370-376 RolePoisonNames）：
        //   x=185，y = 58, 76, 94, …, 184（每行 +18 PAL，共 8 行；第 9 个起原版表就叠在 184）
        // 位置在头像右侧（RoleEquipImageBoxes[0] 头饰图标下方）——不是左下角。
        poisonListOffsetX: 0,    // 微调（屏幕 px）
        poisonListOffsetY: 0,
        poisonListMax: 16,       // MAX_POISONS
        poisonListShadow: true
    });

    //=============================================================================
    // 毒色阶：Pat.mkf chunk 0，每块 16 级
    //=============================================================================
    const RAMPS = {
        // 0x00 死亡 / 黑白
        0x00: [
            [0, 0, 0], [24, 24, 24], [40, 40, 40], [56, 56, 56],
            [72, 72, 72], [88, 88, 88], [104, 104, 104], [120, 120, 120],
            [136, 136, 136], [152, 152, 152], [168, 168, 168], [184, 184, 184],
            [200, 200, 200], [216, 216, 216], [236, 236, 236], [252, 252, 252]
        ],
        // 0x10 赤毒
        0x10: [
            [52, 0, 0], [68, 0, 0], [80, 0, 0], [92, 4, 4],
            [108, 8, 4], [120, 16, 12], [136, 24, 20], [148, 32, 24],
            [164, 40, 32], [176, 56, 44], [188, 72, 60], [200, 88, 76],
            [212, 108, 92], [224, 128, 112], [236, 148, 132], [252, 172, 156]
        ],
        // 0x20 瘴毒
        0x20: [
            [72, 20, 8], [84, 24, 12], [96, 24, 12], [108, 24, 12],
            [124, 40, 16], [144, 60, 28], [160, 80, 36], [176, 100, 44],
            [192, 120, 60], [212, 144, 72], [224, 164, 84], [240, 184, 96],
            [252, 200, 112], [252, 220, 132], [252, 240, 156], [252, 248, 176]
        ],
        // 0x40 尸毒
        0x40: [
            [20, 12, 8], [28, 20, 12], [40, 28, 20], [52, 40, 28],
            [64, 52, 36], [72, 64, 44], [84, 76, 56], [96, 88, 64],
            [108, 100, 76], [116, 112, 84], [128, 124, 96], [140, 136, 112],
            [152, 148, 124], [164, 160, 144], [180, 176, 160], [196, 184, 172]
        ],
        // 0x50 孔雀胆毒
        0x50: [
            [0, 0, 60], [0, 0, 76], [4, 4, 92], [8, 8, 108],
            [12, 12, 124], [20, 20, 140], [28, 28, 148], [40, 40, 160],
            [52, 52, 172], [64, 64, 184], [80, 80, 196], [96, 96, 204],
            [112, 112, 216], [132, 132, 228], [152, 152, 240], [168, 168, 252]
        ],
        // 0x60 血海棠毒
        0x60: [
            [28, 16, 56], [36, 20, 68], [44, 24, 80], [52, 32, 92],
            [60, 40, 104], [72, 48, 116], [84, 56, 128], [96, 68, 140],
            [108, 80, 152], [124, 92, 164], [136, 108, 176], [152, 124, 188],
            [168, 140, 200], [184, 160, 212], [200, 176, 224], [216, 196, 236]
        ],
        // 0x80 三尸蛊毒
        0x80: [
            [0, 16, 8], [0, 28, 16], [0, 40, 24], [0, 56, 32],
            [0, 72, 40], [4, 88, 52], [8, 104, 64], [16, 120, 76],
            [28, 136, 92], [44, 152, 108], [60, 168, 128], [80, 184, 148],
            [100, 200, 168], [120, 216, 184], [144, 232, 200], [168, 252, 220]
        ],
        // 0xA0 鹤顶红毒
        0xA0: [
            [48, 16, 0], [64, 24, 0], [84, 32, 4], [96, 40, 8],
            [108, 48, 12], [120, 60, 24], [132, 72, 32], [144, 84, 44],
            [156, 100, 56], [168, 116, 68], [180, 132, 84], [192, 148, 100],
            [204, 164, 120], [220, 184, 140], [236, 200, 164], [252, 224, 192]
        ],
        // 0xB0 金蚕蛊毒
        0xB0: [
            [36, 12, 4], [48, 20, 8], [60, 28, 12], [72, 36, 16],
            [88, 52, 28], [100, 64, 36], [112, 76, 48], [128, 92, 60],
            [140, 112, 72], [156, 128, 88], [168, 144, 108], [184, 164, 124],
            [196, 180, 144], [212, 200, 168], [228, 220, 192], [244, 240, 220]
        ],
        // 0xC0 断肠草毒
        0xC0: [
            [20, 28, 8], [24, 36, 8], [28, 44, 12], [40, 52, 16],
            [48, 60, 20], [56, 68, 24], [64, 76, 28], [72, 84, 36],
            [80, 92, 44], [88, 100, 52], [96, 108, 64], [108, 120, 76],
            [120, 128, 88], [132, 140, 104], [144, 152, 120], [156, 160, 132]
        ],
        // 0xE0 毒丝
        0xE0: [
            [36, 20, 12], [48, 28, 16], [60, 40, 24], [72, 52, 32],
            [88, 68, 44], [100, 80, 52], [112, 92, 64], [124, 108, 76],
            [136, 120, 88], [148, 136, 104], [160, 148, 120], [176, 164, 136],
            [188, 180, 152], [200, 196, 168], [212, 208, 184], [224, 220, 200]
        ]
    };

    // 毒对象 ID（Objects.csv）→ 色块起始索引 = wColor & 0xF0
    const POISON_BLOCK = {
        551: 0x10, 552: 0x40, 553: 0x20, 554: 0xE0,
        555: 0x80, 556: 0xA0, 557: 0x50, 558: 0x60,
        559: 0xC0, 560: 0xB0, 561: 0x00, 562: 0x00
    };

    // 毒名单颜色 = palette[wColor + 10]（uigame.c 1251）
    //  → 块内下标 = (wColor & 0x0F) + 10
    const POISON_NAME_IDX = {
        551: 10, 552: 10, 553: 11, 554: 10,
        555: 10, 556: 10, 557: 10, 558: 10,
        559: 10, 560: 10, 561: 10, 562: 10
    };

    //=============================================================================
    // 状态字表（uibattle.c 66-101）
    //=============================================================================
    const GLYPHS = {
        confused: { ch: "乱", word: 0x1D, pos: [35, 19], color: "#A8A8FC" },
        slow: { ch: "定", word: 0x1B, pos: [44, 12], color: "#F4F0DC" },
        sleep: { ch: "眠", word: 0x1C, pos: [54, 1], color: "#ECECEC" },
        silence: { ch: "封", word: 0x1A, pos: [55, 20], color: "#F0EC5C" }
    };
    const GLYPH_ORDER = ["confused", "slow", "sleep", "silence"];
    PalStatusFx.GLYPHS = GLYPHS;

    // 兜底名单：States.json 备注没写 <pal98Status:xx> 时用
    //   （真值由 tools/pal_patch_status_glyph.py 写进备注，插件优先读备注）
    const GLYPH_STATE_IDS = {
        4: "slow", 5: "slow", 7: "slow",        // 定身5 / 定身4 / 定身
        6: "silence",                            // 咒封
        9: "confused", 11: "confused",           // 疯魔 / 疯魔5
        10: "sleep", 19: "sleep"                 // 昏睡3 / 昏睡5
    };
    PalStatusFx.GLYPH_STATE_IDS = GLYPH_STATE_IDS;

    const NOTE_RE = /<pal98Status\s*:\s*([乱定眠封]|confused|slow|sleep|silence)\s*>/i;

    function normalizeGlyphKey(s) {
        switch (s) {
            case "乱": return "confused";
            case "定": return "slow";
            case "眠": return "sleep";
            case "封": return "silence";
            default: return String(s).toLowerCase();
        }
    }

    const _glyphCache = new Map();

    PalStatusFx.glyphOfState = function (stateId) {
        if (_glyphCache.has(stateId)) return _glyphCache.get(stateId);
        let key = GLYPH_STATE_IDS[stateId] || null;
        const st = $dataStates && $dataStates[stateId];
        if (st && st.note) {
            const m = st.note.match(NOTE_RE);
            if (m) key = normalizeGlyphKey(m[1]);
        }
        _glyphCache.set(stateId, key);
        return key;
    };

    PalStatusFx.clearGlyphCache = function () { _glyphCache.clear(); };

    /** 当前生效的状态字（去重，按 confused/slow/sleep/silence 原版顺序） */
    PalStatusFx.glyphsOf = function (battler) {
        const hit = {};
        for (const st of battler.states()) {
            const key = PalStatusFx.glyphOfState(st.id);
            if (key) hit[key] = true;
        }
        return GLYPH_ORDER.filter(k => hit[k]).map(k => GLYPHS[k]);
    };

    //=============================================================================
    // 毒查询
    //=============================================================================
    /** 最高等级的毒（level <= 3），返回 PalPoison 定义；无则 null */
    PalStatusFx.topPoisonOf = function (battler) {
        const PP = window.PalPoison;
        if (!PP) return null;
        let best = null;
        let bestLv = -1;
        for (const st of battler.states()) {
            const def = PP.def(st.id);
            if (!def) continue;
            const lv = PP.levelOf(st.id);
            if (lv > 3) continue;               // uibattle.c 132：只认 <= 3
            if (lv >= bestLv) { bestLv = lv; best = def; }
        }
        return best;
    };

    /** 头像该用的 16 级色阶；没中毒且活着 → null（原版走普通 blit） */
    PalStatusFx.poisonRampOf = function (battler) {
        if (!battler || !battler.isAlive()) {
            return cfg.deadGrayscale ? RAMPS[0x00] : null;
        }
        const def = PalStatusFx.topPoisonOf(battler);
        if (!def) return null;
        return RAMPS[POISON_BLOCK[def.pal] || 0x00] || null;
    };

    /** 状态界面毒名单：[{ name, color, stateId }] */
    PalStatusFx.poisonListOf = function (battler) {
        const PP = window.PalPoison;
        if (!PP) return [];
        const out = [];
        for (const st of battler.states()) {
            const def = PP.def(st.id);
            if (!def) continue;
            if (PP.levelOf(st.id) > 3) continue;    // uigame.c 1249
            const ramp = RAMPS[POISON_BLOCK[def.pal] || 0x00];
            const idx = Math.min(15, POISON_NAME_IDX[def.pal] || 10);
            const c = ramp[idx];
            out.push({
                stateId: st.id,
                name: def.name || st.name,
                color: PalStatusFx.rgbToCss(c)
            });
        }
        return out;
    };

    PalStatusFx.rgbToCss = function (c) {
        return "#" + ((1 << 24) + (c[0] << 16) + (c[1] << 8) + c[2])
            .toString(16).slice(1).toUpperCase();
    };

    //=============================================================================
    // 头像染色（亮度 → 色阶）
    //=============================================================================
    const _tintCache = new Map();

    PalStatusFx.tintedFace = function (srcBmp, ramp) {
        const w = srcBmp.width;
        const h = srcBmp.height;
        if (!w || !h) return null;

        const key = (srcBmp.url || "") + "|" + w + "x" + h + "|" +
            ramp[0].join(",") + "|" + cfg.tintStrength + "|" + cfg.tintGamma;
        if (_tintCache.has(key)) return _tintCache.get(key);

        const bmp = new Bitmap(w, h);
        bmp.blt(srcBmp, 0, 0, w, h, 0, 0, w, h);

        const ctx = bmp.context;
        const img = ctx.getImageData(0, 0, w, h);
        const d = img.data;
        const g = cfg.tintGamma;
        const k = cfg.tintStrength;
        for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] === 0) continue;
            let l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
            if (g !== 1) l = Math.pow(l, g);
            let idx = Math.round(l * 15);
            if (idx < 0) idx = 0; else if (idx > 15) idx = 15;
            const c = ramp[idx];
            if (k >= 1) {
                d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
            } else {
                d[i] += (c[0] - d[i]) * k;
                d[i + 1] += (c[1] - d[i + 1]) * k;
                d[i + 2] += (c[2] - d[i + 2]) * k;
            }
        }
        ctx.putImageData(img, 0, 0);
        bmp.baseTexture.update();

        _tintCache.set(key, bmp);
        return bmp;
    };

    PalStatusFx.clearTintCache = function () { _tintCache.clear(); };

    //=============================================================================
    // 状态字位图缓存
    //=============================================================================
    const _glyphBmpCache = new Map();

    PalStatusFx.glyphBitmap = function (glyph, sizePx) {
        const key = glyph.ch + "|" + glyph.color + "|" + sizePx + "|" +
            cfg.glyphOutlineColor + "|" + cfg.glyphOutlineWidth;
        if (_glyphBmpCache.has(key)) return _glyphBmpCache.get(key);

        const bmp = new Bitmap(sizePx, sizePx);
        bmp.fontFace = $gameSystem.mainFontFace();
        bmp.fontSize = sizePx;
        bmp.textColor = glyph.color;
        bmp.outlineColor = cfg.glyphOutlineColor;
        bmp.outlineWidth = cfg.glyphOutlineWidth;
        bmp.drawText(glyph.ch, 0, 0, sizePx, sizePx, "center");

        _glyphBmpCache.set(key, bmp);
        return bmp;
    };

    PalStatusFx.clearGlyphBmpCache = function () { _glyphBmpCache.clear(); };

    //=============================================================================
    // ① + ② 挂到 Window_PaladinPartyStatus.drawActorStatus
    //    （palBattle.js:254 的 Window_BattleStatus 也走这个函数 → 战斗栏一并生效）
    //=============================================================================
    const Proto = window.Window_PaladinPartyStatus && Window_PaladinPartyStatus.prototype;
    if (!Proto) {
        console.error("[palStatusEffect] 找不到 Window_PaladinPartyStatus，请检查加载顺序");
        return;
    }

    const _drawActorStatus = Proto.drawActorStatus;

    Proto.drawActorStatus = function (bitmap, actor, x, y, scale) {
        _drawActorStatus.call(this, bitmap, actor, x, y, scale);
        if (!cfg.enabled || !actor) return;
        const s = scale || 3;
        try {
            // ⚠ 用 Proto.xxx.call(this)：Window_BattleStatus 并不是
            //   Window_PaladinPartyStatus 的子类（palBattle.js:254 只是借函数来画），
            //   写 this.xxx 会拿到 undefined。
            if (cfg.poisonTint) Proto.palDrawPoisonFace.call(this, bitmap, actor, x, y, s);
            if (cfg.statusGlyphs && actor.hp > 0) {
                Proto.palDrawStatusGlyphs.call(this, bitmap, actor, x, y, s);
            }
        } catch (e) {
            console.error("[palStatusEffect] drawActorStatus 失败:", e);
        }
    };

    Proto.palDrawPoisonFace = function (bitmap, actor, x, y, scale) {
        const ramp = PalStatusFx.poisonRampOf(actor);
        if (!ramp) return;
        const faceImg = ImageManager.loadSystem("actor" + actor.actorId());
        if (!faceImg || !faceImg.isReady()) return;
        const tinted = PalStatusFx.tintedFace(faceImg, ramp);
        if (!tinted) return;
        bitmap.blt(tinted, 0, 0, tinted.width, tinted.height,
            x, y, tinted.width * scale, tinted.height * scale);
    };

    Proto.palDrawStatusGlyphs = function (bitmap, actor, x, y, scale) {
        const list = PalStatusFx.glyphsOf(actor);
        if (!list.length) return;
        const size = Math.round(cfg.glyphSizePAL * scale);
        for (const g of list) {
            const gx = Math.round(x + (cfg.boxOffsetX + g.pos[0]) * scale) + cfg.glyphOffsetX;
            const gy = Math.round(y + (cfg.boxOffsetY + g.pos[1]) * scale) + cfg.glyphOffsetY;
            const bmp = PalStatusFx.glyphBitmap(g, size);
            bitmap.blt(bmp, 0, 0, size, size, gx, gy, size, size);
        }
    };

    //=============================================================================
    // ③ 状态界面毒名单
    //=============================================================================
    const SProto = window.Window_PalStatus && Window_PalStatus.prototype;
    if (SProto) {
        const _refresh = SProto.refresh;
        SProto.refresh = function () {
            _refresh.call(this);
            if (!cfg.enabled || !cfg.poisonList) return;
            try {
                this.drawPoisonList();
            } catch (e) {
                console.error("[palStatusEffect] 毒名单绘制失败:", e);
            }
        };

        SProto.drawPoisonList = function () {
            if (!this._actor) return;
            const list = PalStatusFx.poisonListOf(this._actor).slice(0, cfg.poisonListMax);
            if (!list.length) return;

            // 原版 uigame.c 1245-1253：PAL_DrawText(PAL_GetWord(w), RolePoisonNames[j++], wColor+10)
            // 98 版布局（palcfg.c 370-376）：固定竖列 x=185，y=58+18*j（j=0..7，超出叠在 184），
            // 文字左上角对齐坐标点，带 1 PAL 阴影。坐标相对 320x200 底板。
            const scale = 3;
            const bx = (this.contentsWidth() - 320 * scale) / 2;   // 与 drawBackground 的底板对齐
            const by = (this.contentsHeight() - 200 * scale) / 2;
            const c = this.contents;
            const fs = Math.round(16 * scale);                     // font.mkf 16x16 字形 × 3

            for (let j = 0; j < list.length; j++) {
                const px = 185;
                const py = 58 + Math.min(j, 7) * 18;               // 表只给了 8 行，超出原版就叠着
                const x = bx + px * scale + cfg.poisonListOffsetX;
                const y = by + py * scale + cfg.poisonListOffsetY;
                const w = fs * 2 + 8;                              // 两个 16 宽汉字 + 余量
                if (cfg.poisonListShadow) {
                    c.textColor = "#000000";
                    c.drawText(list[j].name, x + scale, y + scale, w, fs, "left"); // 阴影 1 PAL
                }
                c.textColor = list[j].color;
                c.drawText(list[j].name, x, y, w, fs, "left");
            }
            this.resetFontSettings();
        };
    }

    //=============================================================================
    // 运行时调参
    //=============================================================================
    const PAL98 = window.PAL98 || (window.PAL98 = {});

    PAL98.setStatusFx = function (o) {
        Object.assign(cfg, o || {});
        PalStatusFx.clearTintCache();
        PalStatusFx.clearGlyphBmpCache();
        PalStatusFx.clearGlyphCache();
        PalStatusFx.refresh();
        return cfg;
    };

    PalStatusFx.refresh = function () {
        PalStatusFx.clearGlyphCache();
        const scene = SceneManager._scene;
        if (!scene) return;
        const tryRefresh = w => {
            if (w && typeof w.refresh === "function") { try { w.refresh(); } catch (e) { } }
        };
        tryRefresh(scene._statusWindow);
        tryRefresh(scene._palStatusWindow);
        if (scene._windowLayer) {
            for (const ch of scene._windowLayer.children) {
                if (ch instanceof Window_PaladinPartyStatus || ch instanceof Window_PalStatus) {
                    tryRefresh(ch);
                }
            }
        }
    };

    PalStatusFx.cfg = cfg;
})();
