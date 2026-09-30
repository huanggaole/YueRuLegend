/*:
 * @target MZ
 * @plugindesc [v1.0] 仙剑98柔情版飞龙探云手（偷窃）：成功率判定/偷物品与金钱/三切片提示框展示结果
 * @author AI Assistant
 *
 * @help
 * 复刻原版 opcode 0x006A PAL_BattleStealFromEnemy（fight.c 5192-5298）：
 *
 * ===== 判定 =====
 * 飞龙探云手 ScriptOnSuccess 末尾（Scripts.json 43144-43145）：
 *   0x0047 0x00AE → 先播音效 sfx174
 *   0x006A 0x0006 → PAL_BattleStealFromEnemy(target, wStealRate=6)
 * 成功条件（fight.c 5253-5254）：
 *   敌人剩余可偷次数 > 0 && (RandomLong(0,10) <= 6)
 *   → 7/11 ≈ 63.6% 成功率；剩余次数随成功递减，偷完后再偷必失败
 *
 * ===== 后果 =====
 * · 偷物品（wStealItem≠0；98 版全部可偷敌人都是这种）：
 *     剩余次数 -1，背包 +1，提示「获得 <物品名>」
 * · 偷金钱（wStealItem=0；98 版数据里没有这种敌人，仍按原版实现）：
 *     c = 剩余池 / RandomLong(2,3)（整数除），池 -= c，金钱 +c，
 *     提示「获得 c 文钱」
 * · 失败：无任何提示（原版静默，连数字都不弹）
 *
 * ===== 展示 =====
 * 三切片提示框（左 Data944 / 中 Data945 平铺 / 右 Data946，×3），
 * 与左上真气栏同素材同拼法；屏幕顶部居中显示 1.4s 后淡出。白字黑影。
 *
 * ===== 物品名解析 =====
 * 敌人备注 steal.name 与 RMMZ 数据库按名字匹配（物品/武器/防具都搜）；
 * 个别历史异体名做别名映射（金创药→金疮药、爆烈蛊→爆裂蛊），
 * 这两处原版词条与数据库用字不同，已逐条核对（tools 核对脚本输出 14 处 MISS 全部可解析）。
 *
 * 需排在 palBattleSkillFx / palBattleCore 之后加载。
 */
(() => {
    const PalBattleSteal = (window.PalBattleSteal = {});

    // Scripts.json 43145：0x006A operand[0] = 6
    PalBattleSteal.RATE = 6;
    // 提示框素材（与左上真气栏同一套三切片）
    const SLICE_L = "Data944", SLICE_C = "Data945", SLICE_R = "Data946";
    const SLICE_SCALE = 3;
    const BOX_MS = 1400;
    const FADE_MS = 200;

    const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));

    // 原版词条与数据库用字的差异（已逐条核对）
    const NAME_ALIAS = { "金创药": "金疮药", "爆烈蛊": "爆裂蛊" };

    PalBattleSteal.resolveItem = function (name) {
        const nm = NAME_ALIAS[name] || name;
        for (const db of [$dataItems, $dataWeapons, $dataArmors]) {
            if (!db) continue;
            for (const o of db) {
                if (o && o.name === nm) return o;
            }
        }
        return null;
    };

    //=============================================================================
    // 偷窃判定（fight.c 5253-5297）
    //=============================================================================

    PalBattleSteal.attempt = function (subject, target) {
        // 0x0047 0x00AE：偷取动作前先播音效 174
        if (window.PalBattleCore && PalBattleCore.playPalSe) {
            PalBattleCore.playPalSe(174);
        }
        const meta = window.PalBattleCore ? PalBattleCore.enemyMeta(target) : null;
        const st = meta && meta.steal;
        if (!st) return;
        if (target._palStealLeft === undefined) target._palStealLeft = st.n || 0;
        const left = target._palStealLeft;

        // RandomLong(0,10) <= wStealRate（wStealRate=6 → 7/11）
        if (!(left > 0 && randInt(0, 10) <= PalBattleSteal.RATE)) return;

        if (st.item) {
            // 偷物品：次数 -1，背包 +1
            target._palStealLeft = left - 1;
            const item = this.resolveItem(st.name || "");
            if (item) $gameParty.gainItem(item, 1);
            this.showBox(`获得 ${item ? item.name : (st.name || "??")}`);
        } else {
            // 偷金钱：c = 池 / rand(2,3)（整数除），池 -= c
            const c = Math.floor(left / randInt(2, 3));
            target._palStealLeft = left - c;
            if (c > 0) {
                $gameParty.gainGold(c);
                this.showBox(`获得 ${c} 文钱`);
            }
        }
    };

    //=============================================================================
    // 三切片提示框（左 Data944 / 中 Data945 平铺 / 右 Data946）
    //=============================================================================

    const boxes = []; // { sprite, until, text }

    PalBattleSteal.showBox = function (text) {
        const scene = SceneManager._scene;
        if (!scene || !scene._spriteset) return;
        const bmp = this.buildBoxBitmap(text);
        if (!bmp) return; // 素材未就绪，监听里会重画
        const sp = new Sprite(bmp);
        sp.x = Math.floor((Graphics.boxWidth - bmp.width) / 2);
        sp.y = 44;
        sp.z = 9000; // 压在战斗精灵之上（palBattle 的 z 排序只动 z=0/undefined 的）
        scene.addChild(sp);
        boxes.push({ sprite: sp, until: performance.now() + BOX_MS });
        if (boxes.length > 3) { // 同屏最多留 3 条，挤掉最老的
            const old = boxes.shift();
            old.sprite.destroy();
        }
    };

    // 拼框位图；素材未加载完时挂监听返回 null
    PalBattleSteal.buildBoxBitmap = function (text) {
        const l = ImageManager.loadSystem(SLICE_L);
        const c = ImageManager.loadSystem(SLICE_C);
        const r = ImageManager.loadSystem(SLICE_R);
        if (!(l.isReady() && c.isReady() && r.isReady())) {
            const redraw = () => {
                for (const b of boxes) b.sprite.bitmap = PalBattleSteal.buildBoxBitmap(b.text) || b.sprite.bitmap;
            };
            if (!l.isReady()) l.addLoadListener(redraw);
            if (!c.isReady()) c.addLoadListener(redraw);
            if (!r.isReady()) r.addLoadListener(redraw);
            return null;
        }
        const k = SLICE_SCALE;
        const h = l.height * k;
        // 文字宽度决定中片长度
        const tmp = new Bitmap(1, 1);
        tmp.fontSize = 30;
        const textW = Math.ceil(tmp.measureTextWidth(text));
        tmp.destroy();
        const padX = 28;
        const w = l.width * k + (textW + padX * 2) + r.width * k;
        const bmp = new Bitmap(w, h);
        // 左片
        bmp.blt(l, 0, 0, l.width, l.height, 0, 0, l.width * k, h);
        // 中片平铺
        const cw = c.width * k;
        for (let x = l.width * k; x < w - r.width * k; x += cw) {
            const dw = Math.min(cw, w - r.width * k - x);
            bmp.blt(c, 0, 0, dw / k, c.height, x, 0, dw, h);
        }
        // 右片
        bmp.blt(r, 0, 0, r.width, r.height, w - r.width * k, 0, r.width * k, h);
        // 文字：白字黑影，垂直居中
        bmp.fontSize = 30;
        bmp.textColor = "#FFFFFF";
        bmp.outlineColor = "rgba(0, 0, 0, 0.95)";
        bmp.outlineWidth = 4;
        bmp.drawText(text, l.width * k, 0, textW + padX * 2, h, "center");
        return bmp;
    };

    //=============================================================================
    // 到期淡出
    //=============================================================================

    PalBattleSteal.update = function () {
        if (!boxes.length) return;
        const now = performance.now();
        for (let i = boxes.length - 1; i >= 0; i--) {
            const b = boxes[i];
            const remain = b.until - now;
            if (remain <= 0) {
                b.sprite.destroy();
                boxes.splice(i, 1);
            } else if (remain < FADE_MS) {
                b.sprite.opacity = Math.floor(255 * (remain / FADE_MS));
            }
        }
    };

    const _update = Scene_Battle.prototype.update;
    Scene_Battle.prototype.update = function () {
        _update.call(this);
        PalBattleSteal.update();
    };

    //=============================================================================
    // 挂载：仙术结算后（mid 98 = 飞龙探云手）对敌方单体执行偷窃
    //=============================================================================

    const _apply = Game_Action.prototype.apply;
    Game_Action.prototype.apply = function (target) {
        const result = _apply.call(this, target);
        if (!this._palStolen && this.isSkill() && target &&
            target.isEnemy && target.isEnemy() && target.isAlive()) {
            const core = window.PalBattleCore;
            const pal = core ? core.parseMeta(this.item()) : null;
            if (pal && pal.mid === 98) {
                this._palStolen = true; // 多目标也只偷一次（原版仙术为单体，此处兜底）
                PalBattleSteal.attempt(this.subject(), target);
            }
        }
        return result;
    };
})();
