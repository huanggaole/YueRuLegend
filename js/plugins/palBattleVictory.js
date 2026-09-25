/*:
 * @target MZ
 * @plugindesc [v1.1] 仙剑98柔情版战斗胜利结算与升级画面
 * @author AI Assistant
 *
 * @help
 * 复刻仙剑98柔情版的战斗胜利界面（布局参数逐帧测量自原版录像 28s，
 * 游戏坐标 640×480，录像分辨率 1276×996 ≈ 2× 放大 + 36px 标题栏）：
 *   面板一：x 176, y 154, 宽 262, 高 75 →「获得经验值」+ 白色数字（右对齐，右缘留白 19）
 *   面板二：x 139, y 262, 宽 327, 高 75 →「打败敌人得」+ 白色数字（5 位定宽字段居中）
 *     +「文钱」；数字图片高 19（6×8 素材 ×2.4），文字 36px 居中偏下 2px
 *   （高度 75 按原版“文字墨高/底板高 ≈ 0.61”比例确定：录像逐像素量得米色底板 62、
 *     文字墨高 37.5；但米色测量未含底部投影边，且需与本工程字体匹配，
 *     按用户比对截图校准为 75。两面板垂直间距 46。
 *     位置按 Graphics 尺寸对 640×480 等比换算。）
 * 数字由 img/system 下 Data919.PNG~Data928.PNG（0~9）拼合。
 * 面板背景为仙剑三切片底框素材：Data944.PNG（左边缘）、Data945.PNG（可平铺中间）、
 * Data946.PNG（右边缘），纵向拉伸铺满面板高（原版比例 ≈ ×1.82）。
 *
 * 战斗胜利后若有人升级，继续弹出原版升级界面：
 *   顶部三切片横条：“<姓名>修行提升”；
 *   下方九宫格面板（Data99/910~917），列出 修行/体力/真气/武术/灵力/防御/身法/吉运
 *   旧值 → 新值；白色数字 Data919~928，蓝色数字（体力/真气上限）Data929~938，
 *   斜杠用 Data939。升级后体力/真气按原版规则全满。
 *
 * 流程：战斗胜利 → 播放胜利 ME、发放经验金钱 → 结算面板
 * →（有人升级则）逐个显示升级界面 → 返回地图。
 *
 * 需排在 palBattle / palBattleCore / palBattleAnim / palBattleDamage 之后加载。
 */

(() => {
    const PalBattleVictory = (window.PalBattleVictory = {});

    // 数字图（白色 0~9，与伤害数字同款素材）
    const digitImage = d => ImageManager.loadSystem("Data" + (919 + d));

    //=============================================================================
    // 面板绘制（三切片底框：Data944 左 / Data945 中平铺 / Data946 右，比例 ×3，
    // 与 Window_PaladinHorzBar 同款素材；面板高度=切片高度×3）
    //=============================================================================

    function drawPanelFrame(bitmap) {
        const left = ImageManager.loadSystem("Data944");
        const center = ImageManager.loadSystem("Data945");
        const right = ImageManager.loadSystem("Data946");
        if (!left.isReady() || !center.isReady() || !right.isReady()) return false;
        // 纵向拉伸铺满面板高度（切片原高 34，原版比例 ≈ ×1.82）
        const scale = bitmap.height / left.height;
        const w = bitmap.width;
        const lW = left.width * scale;
        const rW = right.width * scale;
        const cH = bitmap.height;
        // 左边缘
        bitmap.blt(left, 0, 0, left.width, left.height, 0, 0, lW, cH);
        // 右边缘
        bitmap.blt(right, 0, 0, right.width, right.height, w - rW, 0, rW, cH);
        // 中间平铺
        const fillW = w - lW - rW;
        if (fillW > 0) {
            const tileW = center.width * scale;
            for (let x = 0; x < fillW; x += tileW) {
                const drawW = Math.min(tileW, fillW - x);
                bitmap.blt(center, 0, 0, drawW / scale, center.height, lW + x, 0, drawW, cH);
            }
        }
        return true;
    }

    // 在 bitmap 上拼白色数字，返回总宽度（未加载完成返回 -1）。
    // rightX 为数字串右边缘；ds 为素材放大倍数；spacing 为字间空隙。
    function drawDigits(bitmap, value, rightX, centerY, ds, spacing) {
        const str = Math.max(0, Math.floor(value)).toString();
        const imgs = [];
        for (let i = 0; i < str.length; i++) imgs.push(digitImage(Number(str[i])));
        if (imgs.some(img => !img.isReady())) return -1;
        const dw = imgs[0].width * ds, dh = imgs[0].height * ds;
        let x = rightX - (dw + spacing) * str.length + spacing;
        const y = centerY - dh / 2;
        for (const img of imgs) {
            bitmap.blt(img, 0, 0, img.width, img.height, x, y, dw, dh);
            x += dw + spacing;
        }
        return (dw + spacing) * str.length - spacing;
    }

    // 通用数字段绘制（白/蓝混合，斜杠用 Data939）：
    //   segments: [{s:"126", base:919}, {s:"/", img:939}, {s:"150", base:929}]
    //   align: "right" 时 x 为右边缘；返回总宽度，素材未就绪返回 -1
    function drawSegments(bitmap, segments, x, centerY, scale, align) {
        const spacing = 2;
        const dw = 6 * scale, dh = 8 * scale; // 数字/斜杠原始素材均为 6×8 / 5×8
        const segW = seg => {
            let w = 0;
            for (const ch of seg.s) w += (ch === "/" ? 5 * scale : dw) + spacing;
            return Math.max(0, w - spacing);
        };
        const total = segments.reduce((a, s) => a + segW(s), 0) + spacing * (segments.length - 1);
        let cx = align === "right" ? x - total : x;
        const y = centerY - dh / 2;
        for (const seg of segments) {
            if (seg.img) {
                const img = ImageManager.loadSystem("Data" + seg.img);
                if (!img.isReady()) return -1;
                bitmap.blt(img, 0, 0, img.width, img.height, cx, y, img.width * scale, img.height * scale);
                cx += segW(seg) + spacing;
            } else {
                for (const ch of seg.s) {
                    if (ch === "/") {
                        const img = ImageManager.loadSystem("Data939");
                        if (!img.isReady()) return -1;
                        bitmap.blt(img, 0, 0, img.width, img.height, cx, y, img.width * scale, img.height * scale);
                    } else {
                        const img = ImageManager.loadSystem("Data" + (seg.base + Number(ch)));
                        if (!img.isReady()) return -1;
                        bitmap.blt(img, 0, 0, img.width, img.height, cx, y, dw, dh);
                    }
                    cx += (ch === "/" ? 5 * scale : dw) + spacing;
                }
                cx += spacing; // 段间额外间距（segW 已扣末位 spacing）
            }
        }
        return total;
    }

    // 九宫格面板（Data99 左上 / 910 上 / 911 右上 / 912 左 / 913 中 / 914 右 /
    //               915 左下 / 916 下 / 917 右下），比例 ×3
    function drawPanel9(bitmap) {
        const ids = [99, 910, 911, 912, 913, 914, 915, 916, 917];
        const imgs = ids.map(n => ImageManager.loadSystem("Data" + n));
        if (imgs.some(img => !img.isReady())) return false;
        const S = 3, w = bitmap.width, h = bitmap.height;
        const [tl, t, tr, l, c, r, bl, b, br] = imgs;
        const ml = Math.max(tl.width, l.width, bl.width) * S;
        const mr = Math.max(tr.width, r.width, br.width) * S;
        const mt = Math.max(tl.height, t.height, tr.height) * S;
        const mb = Math.max(bl.height, b.height, br.height) * S;
        const tile = (img, dx, dy, tw, th) => {
            if (tw <= 0 || th <= 0) return;
            const iw = img.width * S, ih = img.height * S;
            for (let yy = 0; yy < th; yy += ih) {
                for (let xx = 0; xx < tw; xx += iw) {
                    const ddw = Math.min(iw, tw - xx), ddh = Math.min(ih, th - yy);
                    bitmap.blt(img, 0, 0, ddw / S, ddh / S, dx + xx, dy + yy, ddw, ddh);
                }
            }
        };
        tile(tl, 0, 0, ml, mt);
        tile(tr, w - mr, 0, mr, mt);
        tile(bl, 0, h - mb, ml, mb);
        tile(br, w - mr, h - mb, mr, mb);
        tile(t, ml, 0, w - ml - mr, mt);
        tile(b, ml, h - mb, w - ml - mr, mb);
        tile(l, 0, mt, ml, h - mt - mb);
        tile(r, w - mr, mt, mr, h - mt - mb);
        tile(c, ml, mt, w - ml - mr, h - mt - mb);
        return true;
    }

    //=============================================================================
    // Scene_Battle：显示胜利结算
    //=============================================================================

    Scene_Battle.prototype.showPalVictory = function (exp, gold, onDone) {
        this._palVictory = {
            exp, gold, onDone,
            state: "fadeIn", t: 0, holdT: 0,
            container: new Sprite(),
            listener: null
        };
        const cont = this._palVictory.container;
        cont.opacity = 0;
        this.addChild(cont);
        this.buildPalVictoryPanels();
    };

    Scene_Battle.prototype.buildPalVictoryPanels = function () {
        const v = this._palVictory;
        if (!v) return;
        // 原版布局（640×480 游戏坐标，逐帧测量自原版录像 28s，见文件头注释）
        const kx = Graphics.boxWidth / 640;
        const ky = Graphics.boxHeight / 480;
        const H = Math.round(75 * ky); // 原版文字墨高/底板高 ≈ 0.61（36px 字、62 为米色区测量值，未含投影边）
        const x1 = Math.round(176 * kx), y1 = Math.round(154 * ky), W1 = Math.round(262 * kx);
        const x2 = Math.round(139 * kx), y2 = Math.round(262 * ky), W2 = Math.round(327 * kx);
        v.layout = { kx, ky, H };
        v.panels = [
            { label: "获得经验值", value: v.exp, suffix: "", x: x1, y: y1, w: W1 },
            { label: "打败敌人得", value: v.gold, suffix: "文钱", x: x2, y: y2, w: W2 }
        ];
        for (const p of v.panels) {
            const sprite = new Sprite(new Bitmap(p.w, H));
            sprite.x = p.x;
            sprite.y = p.y;
            v.container.addChild(sprite);
            p.sprite = sprite;
        }
        this.redrawPalVictoryPanels();
    };

    Scene_Battle.prototype.redrawPalVictoryPanels = function () {
        const v = this._palVictory;
        if (!v || !v.panels) return;
        const { kx, ky, H } = v.layout;
        // 数字：6×8 素材放大到高约 19（原版比例 2.4×），字间空隙 ≈ 2.6
        const ds = 2.4 * kx;
        const spacing = 2.6 * kx;
        // 文字垂直居中偏下 2px（原版阴影在下方，视觉重心略低）
        const cy = H / 2 + 2 * ky;
        // 等素材加载完成后重绘（每次 update 尝试，直到成功）
        let allReady = true;
        for (const p of v.panels) {
            const bitmap = p.sprite.bitmap;
            bitmap.clear();
            if (!drawPanelFrame(bitmap)) { allReady = false; continue; }
            bitmap.fontFace = $gameSystem.mainFontFace();
            bitmap.fontSize = Math.round(36 * kx);
            bitmap.textColor = "#000000";
            bitmap.outlineWidth = 0;
            // 标签：左缘内缩 12
            bitmap.drawText(p.label, 12 * kx, 0, 200 * kx, H, "left");
            if (p.suffix) {
                // 面板二：数字在定宽 5 位字段内居中（字段 rel 166~251），「文钱」紧随其后
                const fieldCenter = (166 + 251) / 2 * kx;
                const str = Math.max(0, Math.floor(p.value)).toString();
                const dw = 6 * ds;
                const total = (dw + spacing) * str.length - spacing;
                const digitsW = drawDigits(bitmap, p.value, fieldCenter + total / 2, cy, ds, spacing);
                if (digitsW < 0) { allReady = false; continue; }
                bitmap.drawText(p.suffix, 247 * kx, 0, 80 * kx, H, "left");
            } else {
                // 面板一：数字右对齐，右缘留白 19
                const digitsW = drawDigits(bitmap, p.value, p.w - 19 * kx, cy, ds, spacing);
                if (digitsW < 0) { allReady = false; continue; }
            }
        }
        v.panelsReady = allReady;
    };

    const _Scene_Battle_update = Scene_Battle.prototype.update;
    Scene_Battle.prototype.update = function () {
        _Scene_Battle_update.call(this);
        const v = this._palVictory;
        if (!v) return;
        v.t += 16.7;
        if (!v.panelsReady) this.redrawPalVictoryPanels();
        if (v.state === "fadeIn") {
            v.container.opacity = Math.min(255, v.container.opacity + 255 / 15);
            if (v.container.opacity >= 255 && v.panelsReady) {
                v.state = "hold";
                v.holdT = 0;
            }
        } else if (v.state === "hold") {
            v.holdT += 16.7;
            const pressed = v.holdT > 500 &&
                (Input.isTriggered("ok") || Input.isTriggered("cancel") || TouchInput.isTriggered());
            if (pressed || v.holdT > 3500) {
                v.state = "fadeOut";
            }
        } else if (v.state === "fadeOut") {
            v.container.opacity = Math.max(0, v.container.opacity - 255 / 12);
            if (v.container.opacity <= 0) {
                this.removeChild(v.container);
                this._palVictory = null;
                if (v.onDone) v.onDone();
            }
        }
    };

    //=============================================================================
    // 升级界面（原版：胜利后若有人升级，逐个弹出“<姓名>修行提升”界面）
    //=============================================================================

    Scene_Battle.prototype.showPalLevelUps = function (onAllDone) {
        const queue = PalBattleVictory.levelUpQueue.splice(0);
        if (queue.length === 0) { if (onAllDone) onAllDone(); return; }
        this._palLevelUp = {
            queue, index: 0, onAllDone,
            state: "fadeIn", holdT: 0, ready: false,
            container: new Sprite()
        };
        this._palLevelUp.container.opacity = 0;
        this.addChild(this._palLevelUp.container);
        this.buildPalLevelUpScreen(queue[0]);
    };

    Scene_Battle.prototype.buildPalLevelUpScreen = function (data) {
        const lu = this._palLevelUp;
        if (!lu) return;
        lu.container.removeChildren();
        // 行定义：8 行基础属性 + 可选“习得仙术”行
        const rows = [
            { label: "修行", old: [{ s: String(data.pre.level), base: 919 }], neo: [{ s: String(data.cur.level), base: 919 }] },
            { label: "体力", old: [{ s: String(data.pre.hp), base: 919 }, { s: "/", img: 939 }, { s: String(data.pre.mhp), base: 929 }],
              neo: [{ s: String(data.cur.hp), base: 919 }, { s: "/", img: 939 }, { s: String(data.cur.mhp), base: 929 }] },
            { label: "真气", old: [{ s: String(data.pre.mp), base: 919 }, { s: "/", img: 939 }, { s: String(data.pre.mmp), base: 929 }],
              neo: [{ s: String(data.cur.mp), base: 919 }, { s: "/", img: 939 }, { s: String(data.cur.mmp), base: 929 }] },
            { label: "武术", old: [{ s: String(data.pre.atk), base: 919 }], neo: [{ s: String(data.cur.atk), base: 919 }] },
            { label: "灵力", old: [{ s: String(data.pre.mat), base: 919 }], neo: [{ s: String(data.cur.mat), base: 919 }] },
            { label: "防御", old: [{ s: String(data.pre.def), base: 919 }], neo: [{ s: String(data.cur.def), base: 919 }] },
            { label: "身法", old: [{ s: String(data.pre.agi), base: 919 }], neo: [{ s: String(data.cur.agi), base: 919 }] },
            { label: "吉运", old: [{ s: String(data.pre.luk), base: 919 }], neo: [{ s: String(data.cur.luk), base: 919 }] }
        ];
        if (data.newSkills && data.newSkills.length > 0) {
            rows.push({ label: "习得仙术", text: data.newSkills.join("、") });
        }
        const rowH = 46;
        const W = 460;
        const barH = 102; // 34×3
        const mt = 20 * 3, mb = 22 * 3; // 九宫格上下边框
        const panelH = mt + rows.length * rowH + mb;
        const gap = 12;
        const boxW = Graphics.boxWidth, boxH = Graphics.boxHeight;
        const x = Math.floor((boxW - W) / 2);
        const totalH = barH + gap + panelH;
        const y0 = Math.max(4, Math.floor((boxH - totalH) / 2));
        lu.current = { data, rows, W, rowH, x, barY: y0, panelY: y0 + barH + gap, panelH };
        const bar = new Sprite(new Bitmap(W, barH));
        bar.x = x; bar.y = y0;
        const panel = new Sprite(new Bitmap(W, panelH));
        panel.x = x; panel.y = y0 + barH + gap;
        lu.container.addChild(bar);
        lu.container.addChild(panel);
        lu.current.bar = bar;
        lu.current.panel = panel;
        this.redrawPalLevelUpScreen();
    };

    Scene_Battle.prototype.redrawPalLevelUpScreen = function () {
        const lu = this._palLevelUp;
        if (!lu || !lu.current) return;
        const cur = lu.current;
        const data = cur.data;
        // 顶部横条：“李逍遥修行提升”
        const barBmp = cur.bar.bitmap;
        barBmp.clear();
        if (!drawPanelFrame(barBmp)) { lu.ready = false; return; }
        barBmp.fontFace = $gameSystem.mainFontFace();
        barBmp.fontSize = 34;
        barBmp.outlineWidth = 0;
        barBmp.textColor = "#000000";
        barBmp.drawText(data.name + "修行提升", 0, 0, barBmp.width, barBmp.height, "center");
        // 九宫格面板
        const pBmp = cur.panel.bitmap;
        pBmp.clear();
        if (!drawPanel9(pBmp)) { lu.ready = false; return; }
        pBmp.fontFace = $gameSystem.mainFontFace();
        pBmp.fontSize = 27;
        pBmp.outlineWidth = 0;
        const mt = 20 * 3;
        const oldRight = 232;  // 旧值列右边缘
        const arrowX = 240, arrowW = 64;
        const neoLeft = 316;   // 新值列左边缘
        for (let i = 0; i < cur.rows.length; i++) {
            const row = cur.rows[i];
            const ry = mt + i * cur.rowH;
            const cy = ry + cur.rowH / 2;
            // 行标签（白字黑影）
            pBmp.textColor = "#000000";
            pBmp.drawText(row.label, 32 + 2, ry + 2, 100, cur.rowH, "left");
            pBmp.textColor = "#ffffff";
            pBmp.drawText(row.label, 32, ry, 100, cur.rowH, "left");
            if (row.text) {
                pBmp.textColor = "#000000";
                pBmp.drawText(row.text, neoLeft + 2, ry + 2, 200, cur.rowH, "left");
                pBmp.textColor = "#ffffff";
                pBmp.drawText(row.text, neoLeft, ry, 200, cur.rowH, "left");
                continue;
            }
            // 旧值（右对齐）
            if (drawSegments(pBmp, row.old, oldRight, cy, 3, "right") < 0) { lu.ready = false; return; }
            // 箭头
            pBmp.textColor = "#000000";
            pBmp.drawText("→", arrowX + 2, ry + 2, arrowW, cur.rowH, "center");
            pBmp.textColor = "#ffffff";
            pBmp.drawText("→", arrowX, ry, arrowW, cur.rowH, "center");
            // 新值（左对齐）
            if (drawSegments(pBmp, row.neo, neoLeft, cy, 3, "left") < 0) { lu.ready = false; return; }
        }
        lu.ready = true;
    };

    Scene_Battle.prototype.updatePalLevelUp = function () {
        const lu = this._palLevelUp;
        if (!lu) return;
        if (!lu.ready) this.redrawPalLevelUpScreen();
        if (lu.state === "fadeIn") {
            lu.container.opacity = Math.min(255, lu.container.opacity + 255 / 15);
            if (lu.container.opacity >= 255 && lu.ready) {
                lu.state = "hold";
                lu.holdT = 0;
            }
        } else if (lu.state === "hold") {
            lu.holdT += 16.7;
            const pressed = lu.holdT > 400 &&
                (Input.isTriggered("ok") || Input.isTriggered("cancel") || TouchInput.isTriggered());
            if (pressed || lu.holdT > 6000) lu.state = "fadeOut";
        } else if (lu.state === "fadeOut") {
            lu.container.opacity = Math.max(0, lu.container.opacity - 255 / 12);
            if (lu.container.opacity <= 0) {
                lu.index++;
                if (lu.index < lu.queue.length) {
                    lu.state = "fadeIn";
                    this.buildPalLevelUpScreen(lu.queue[lu.index]);
                } else {
                    this.removeChild(lu.container);
                    this._palLevelUp = null;
                    if (lu.onAllDone) lu.onAllDone();
                }
            }
        }
    };

    const _Scene_Battle_update2 = Scene_Battle.prototype.update;
    Scene_Battle.prototype.update = function () {
        _Scene_Battle_update2.call(this);
        if (this._palLevelUp) this.updatePalLevelUp();
    };

    //=============================================================================
    // BattleManager：胜利流程接管
    //=============================================================================

    const _startBattle = BattleManager.startBattle;
    BattleManager.startBattle = function () {
        this._palVictoryPending = false;
        PalBattleVictory.levelUpQueue.length = 0;
        _startBattle.call(this);
    };

    BattleManager.processVictory = function () {
        if (this._palVictoryPending) return; // 面板显示期间不再重复进入
        this._palVictoryPending = true;
        $gameParty.removeBattleStates();
        $gameParty.performVictory();
        this.playVictoryMe();
        this.replayBgmAndBgs();
        this.makeRewards();
        const exp = this._rewards.exp;
        const gold = this._rewards.gold;
        // 先发放奖励，保证面板数字与实际获得一致（原版面板数值即本场所得）
        this.gainRewards();
        const done = () => this.endBattle(0);
        const scene = SceneManager._scene;
        if (scene && scene.showPalVictory) {
            this._phase = null; // 面板显示期间冻结战斗流程
            scene.showPalVictory(exp, gold, () => {
                // 有人升级则逐个显示升级界面，全部看完再退出战斗
                if (PalBattleVictory.levelUpQueue.length > 0 && scene.showPalLevelUps) {
                    scene.showPalLevelUps(done);
                } else {
                    done();
                }
            });
        } else {
            done();
        }
    };

    // 原版“××胜利了！”/道具获得等日志消息全部隐藏（画面已由结算面板替代）
    BattleManager.displayVictoryMessage = function () { };
    BattleManager.displayRewards = function () { };

    //=============================================================================
    // 升级数据捕获：拦截原版 $gameMessage 式升级提示，改为胜利后弹出升级界面
    //=============================================================================

    PalBattleVictory.levelUpQueue = [];

    function snapshotParams(actor) {
        return {
            level: actor._level,
            hp: Math.floor(actor.hp), mp: Math.floor(actor.mp),
            mhp: actor.param(0), mmp: actor.param(1),
            atk: actor.param(2), def: actor.param(3), mat: actor.param(4),
            agi: actor.param(6), luk: actor.param(7)
        };
    }

    const _changeExp = Game_Actor.prototype.changeExp;
    Game_Actor.prototype.changeExp = function (exp, show) {
        const inVictory = BattleManager._palVictoryPending;
        if (inVictory) this._palPreLevel = snapshotParams(this);
        const lastLevel = this._level;
        _changeExp.call(this, exp, show);
        if (inVictory && this._level > lastLevel) {
            // 原版升级后体力/真气全满
            this._hp = this.param(0);
            this._mp = this.param(1);
            this.refresh();
        }
    };

    const _displayLevelUp = Game_Actor.prototype.displayLevelUp;
    Game_Actor.prototype.displayLevelUp = function (newSkills) {
        if (BattleManager._palVictoryPending && this._palPreLevel) {
            const pre = this._palPreLevel;
            this._palPreLevel = null;
            PalBattleVictory.levelUpQueue.push({
                name: this.name(),
                pre,
                cur: snapshotParams(this),
                newSkills: (newSkills || []).map(skill => skill.name)
            });
            return; // 拦截原版 $gameMessage 升级提示
        }
        _displayLevelUp.call(this, newSkills);
    };
})();
