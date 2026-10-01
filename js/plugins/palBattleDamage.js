/*:
 * @target MZ
 * @plugindesc [v1.3] 仙剑98柔情版伤害数字：蓝色伤害 / 米白恢复HP / 绿色恢复MP；位置·轨迹·时长·同时性对齐逆向源码
 * @author AI Assistant
 *
 * @help
 * 依据 sdlpal 逆向源码复刻战斗伤害数字（与 RMMZ 默认弹窗完全不同）：
 *
 *  数值  fight.c:638        显示「当前HP − 上次备份HP」的净值；0 不显示（uibattle.c:1751）
 *  位置  fight.c:640-641    敌人：数字顶端 = 敌人脚底 − 115（320 系）
 *        fight.c:670-671    玩家 HP −75；fight.c:695-696 玩家 MP −67
 *        水平：定长 5 位右对齐，每位宽 6px（ui.c:705-720），个位中心落在 battler 中心 +3px
 *        本工程 960×600 = PAL 320×200 ×3，故 k = Graphics.boxWidth/320 = 3（两轴同比例）。
 *  同时  fight.c:619-653    PAL_BattleDisplayStatChange() 用【一个循环】把所有变化的敌我
 *        全部 ShowNum 掉 → 群体攻击的伤害数字是同一帧一起迸出，不是逐个。
 *        RMMZ 默认走 BattleManager.updateAction() 每帧 shift 一个目标 + 日志队列
 *        popupDamage 逐个等待，本插件把两处都改成同帧完成。
 *  轨迹  uibattle.c:1760    匀速垂直上飘 1px / 40ms，x 不动
 *  时长  uibattle.c:1753    10 帧 × 40ms = 400ms 后瞬间消失（无淡出、无弹跳、无缩放）
 *  上限  uibattle.h:81      同屏最多 16 个，满了直接丢弃（uibattle.c:1796 找不到空槽即不弹）
 *  配色  ui.c:677           伤害=Data929（蓝）/ 回血=Data919（米白）/ 回真气=Data956（绿）
 *  其它  Miss / 闪避 / 敌人真气变化 一律不显示（原版 wNum > 0 才画）
 *        暴击无画面差异，原版只换音效（fight.c:2063-2070）
 *
 * 敌人数字高度的实测依据（数据来自本工程 Troops.json 反推的 EnemyPos 表）：
 *   敌人脚底 PAL y = 100 / 106 / 110 / 130 / 140（再叠加 Enemies.csv 的 wYPosOffset 0~28）
 *   img/sv_enemies 待机帧高度中位数 = 88 PAL px
 *   → 数字顶端一般落在头顶上方约 12~27 PAL px；矮个子敌人（如史莱姆 20px）会明显偏高，
 *     这是原版行为（偏移是常量，不随精灵高度变化）。
 *
 * 运行时调参：window.PAL98_DAMAGE（enemyTop / playerHp / playerMp / topMargin），
 *   控制台 PAL98.setEnemyNumTop(115) / PAL98.setPlayerNumTop(75, 67)。
 *
 * 需排在 palBattleCore 之后加载。
 */

(() => {
    // colorType: 0=HP伤害 1=HP恢复 2=MP伤害 3=MP恢复 → 数字图起始编号
    // 原版语义（ui.c:677 + fight.c:650/654/708）：Blue(929)=伤害、Yellow(919)=回血、Cyan(956)=加真气
    const DIGIT_BASE = [929, 919, 929, 956];

    const DIGIT_SCALE = 3;                    // PAL 素材 ×3，与战斗画面比例一致
    const DIGIT_W = 6, DIGIT_H = 8;           // 原版点阵尺寸（320 系）
    const DIGIT_STEP = DIGIT_W * DIGIT_SCALE; // 18px = 原版 6px × k，正好等于图宽，相邻不叠压

    const FRAME_MS = 40;                      // BATTLE_FPS = 25（battle.h:28），飘字速度随 window.PAL98_SPEED 缩放
    if (window.PAL98_SPEED == null) window.PAL98_SPEED = 1; // 默认 1 = 原版速度
    const LIFE_FRAMES = 24;                   // 400ms @60fps（原版 10 帧 × 40ms）
    const RISE_STEP = 1;                      // 每 40ms 上飘 1 个 320 单位 ≈ 3px
    const MAX_SHOWNUM = 16;                   // BATTLEUI_MAX_SHOWNUM（uibattle.h:81）
    const SHOW_MP_DRAIN = false;              // 原版不显示真气减少（fight.c:706 只显示增加）

    // 数字顶端相对 battler 脚底的竖直偏移（320 系），集中暴露、可运行时调
    const PAL98_DAMAGE = window.PAL98_DAMAGE = {
        enemyTop: 115,   // fight.c:641  敌人：数字顶端 = 脚底 − 115
        playerHp: 75,    // fight.c:671  玩家 HP
        playerMp: 67,    // fight.c:696  玩家 MP
        topMargin: 10    // fight.c:643/673/699  数字顶端不高于屏幕 10
    };
    const PAL98 = window.PAL98 = window.PAL98 || {};
    PAL98.setEnemyNumTop = function (v) {
        PAL98_DAMAGE.enemyTop = Number(v) || 0;
        return PAL98_DAMAGE.enemyTop;
    };
    PAL98.setPlayerNumTop = function (hp, mp) {
        if (hp !== undefined) PAL98_DAMAGE.playerHp = Number(hp) || 0;
        if (mp !== undefined) PAL98_DAMAGE.playerMp = Number(mp) || 0;
        return [PAL98_DAMAGE.playerHp, PAL98_DAMAGE.playerMp];
    };

    const k = () => Graphics.boxWidth / 320;  // 960×600 → 3（与 320×200 等比 ×3）

    // 数字顶端相对 battler 脚底的竖直偏移（320 系）
    function topOffsetOf(battler, colorType) {
        if (battler && battler.isEnemy && battler.isEnemy()) return PAL98_DAMAGE.enemyTop;
        return colorType >= 2 ? PAL98_DAMAGE.playerMp : PAL98_DAMAGE.playerHp;
    }

    let active = 0; // 同屏弹窗计数（对应 rgShowNum 的 16 个槽位）

    //=============================================================================
    // Sprite_Damage
    //=============================================================================

    // 快照优先：多段攻击同一帧结算时，后一击会 clearResult() 覆盖前一击，
    //  palBattleAnim 在 startDamagePopup 时把结算数据快照进 _palShot 传进来，
    // 这里不再读实时的 result()（那是最后一击的数据）
    Sprite_Damage.prototype.setup = function (target) {
        const result = this._palShot || target.result();
        this._duration = Math.round(LIFE_FRAMES / (window.PAL98_SPEED || 1));
        this._palStart = performance.now();
        if (result.missed || result.evaded) return; // 原版：Miss/闪避无任何文字
        if (result.hpAffected || result.hpDamage !== 0) {
            this._colorType = result.hpDamage >= 0 ? 0 : 1;
            this.createDigits(result.hpDamage);
        } else if (target.isActor && target.isActor() && target.isAlive() &&
            result.mpDamage !== 0) {
            // 敌人没有真气数字；玩家只显示真气增加（fight.c:706）
            if (result.mpDamage > 0) { // RMMZ：正值 = 减少
                if (!SHOW_MP_DRAIN) return;
                this._colorType = 2;
                this.createDigits(result.mpDamage);
            } else {
                this._colorType = 3;
                this.createDigits(-result.mpDamage);
            }
        }
    };

    // 原版无暴击画面差异，只换音效（fight.c:2063-2070）
    Sprite_Damage.prototype.setupCriticalEffect = function () { };

    Sprite_Damage.prototype.createDigits = function (value) {
        const string = Math.abs(value).toString();
        const base = DIGIT_BASE[this._colorType] || 929;
        for (let i = 0; i < string.length; i++) {
            const sprite = new Sprite();
            sprite.bitmap = ImageManager.loadSystem("Data" + (base + Number(string[i])));
            sprite.anchor.x = 0.5;
            sprite.anchor.y = 1;
            sprite.scale.x = DIGIT_SCALE;
            sprite.scale.y = DIGIT_SCALE;
            sprite.y = 0; // 数字底部贴在 Sprite_Damage 原点（之后整体匀速上移）
            // 定长 5 位右对齐：个位（最右）中心 = battler 中心 + 3（320 系）≈ +9px
            sprite.x = (i - (string.length - 1)) * DIGIT_STEP + DIGIT_STEP / 2;
            this.addChild(sprite);
        }
    };

    // 匀速上飘 + 400ms 到点消失（uibattle.c:1753-1761）
    Sprite_Damage.prototype.update = function () {
        Sprite.prototype.update.call(this);
        if (this._duration > 0) {
            this._duration--;
            const elapsed = performance.now() - (this._palStart || performance.now());
            if (elapsed >= LIFE_FRAMES * (1000 / 60) / (window.PAL98_SPEED || 1)) this._duration = 0; // 掉帧也按时消失
            const up = Math.floor(elapsed / (FRAME_MS / (window.PAL98_SPEED || 1))) * RISE_STEP * k();
            for (const child of this.children) {
                child.y = -up;
            }
        }
        this.updateFlash();
    };

    Sprite_Damage.prototype.updateChild = function () { };   // 不用 MZ 的弹跳
    Sprite_Damage.prototype.updateOpacity = function () { };  // 原版无淡出

    // 数字图是 ImageManager 缓存的共享 Bitmap，销毁会让后续弹窗变空白
    Sprite_Damage.prototype.destroy = function (options) {
        for (const child of this.children) {
            child.bitmap = null;
        }
        if (this._palCounted) {
            active--;
            this._palCounted = false;
        }
        Sprite.prototype.destroy.call(this, options);
    };

    //=============================================================================
    // 群体伤害同时迸出（fight.c:619-653）
    //
    // 原版：一次行动的所有目标在【同一战斗帧】内结算完 —— PAL_BattleDisplayStatChange()
    // 用一个循环把全部变化的敌我都 ShowNum 掉，所以群体攻击的伤害数字是一起出现的。
    //
    // RMMZ 有两个地方把它拆成了逐个：
    //   ① rmmz_managers.js:2745 BattleManager.updateAction() 每帧只 shift 一个目标
    //      → 3 个目标要 3 帧，且中间还被 spriteset/log 的 isBusy 卡住；
    //   ② rmmz_windows.js:5727 displayActionResults() 把 popupDamage 压进日志队列，
    //      Window_BattleLog 每帧只出队一条。
    // 这里两处都改成同帧完成。
    //
    // 注意：performActionStart（Game_Actor/Game_Enemy 快照 BattleManager._targets）在
    // startAction 当帧就被日志队列执行掉了，早于第一次 updateAction，所以此处清空
    // _targets 不会影响攻击序列取目标。
    //=============================================================================

    const _updateAction = BattleManager.updateAction;
    BattleManager.updateAction = function () {
        if (!this._targets || this._targets.length <= 1) return _updateAction.call(this);
        const targets = this._targets.slice();
        this._targets.length = 0;
        for (const target of targets) {
            this.invokeAction(this._subject, target);
        }
        // _targets 已空 → 下一次 updateAction 会走原函数的 endAction() 分支
    };

    // 弹数字改为同步（原：压进日志队列逐条出队）
    Window_BattleLog.prototype.popupDamage = function () { };

    const _displayActionResults = Window_BattleLog.prototype.displayActionResults;
    Window_BattleLog.prototype.displayActionResults = function (subject, target) {
        _displayActionResults.call(this, subject, target);
        if (target && target.shouldPopupDamage && target.shouldPopupDamage()) {
            target.startDamagePopup();
        }
        if (subject && subject !== target && subject.shouldPopupDamage &&
            subject.shouldPopupDamage()) {
            subject.startDamagePopup(); // 吸血等：施术者自身也弹
        }
    };

    //=============================================================================
    // Sprite_Battler：位置、上限、不堆叠（rmmz_sprites.js:572）
    //=============================================================================

    Sprite_Battler.prototype.createDamageSprite = function (entry) {
        if (active >= MAX_SHOWNUM) return; // 16 个槽位满了就丢弃
        const sprite = new Sprite_Damage();
        sprite.x = this.x; // 个位中心落在 battler 中心 + 3（320 系）
        sprite._palShot = entry || null; // 多段攻击的伤害快照（见 setup 注释）
        sprite.setup(this._battler);
        sprite._palShot = null;
        if (sprite.children.length === 0) return; // 无可显示内容（Miss / 0 / 敌人真气）
        const off = topOffsetOf(this._battler, sprite._colorType);
        const min = PAL98_DAMAGE.topMargin * k();
        let top = this.y - off * k();
        if (top < min) top = min; // fight.c:643/673/699
        sprite.y = top + DIGIT_H * DIGIT_SCALE; // anchor.y = 1 → 数字底部
        // 伤害数字恒在最上层（原版是画在特效之上的 UI 层）：
        // 仙术特效现在固定 fxZ=9000，数字若继续走 battleField 的 Y 排序会被盖住
        sprite.zIndex = (window.PalBattleMagic ? PalBattleMagic.fxZ : 9000) + 500;
        active++;
        sprite._palCounted = true;
        this._damages.push(sprite);
        this.parent.addChild(sprite);
    };
})();
