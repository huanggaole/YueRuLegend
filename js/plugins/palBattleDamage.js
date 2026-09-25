/*:
 * @target MZ
 * @plugindesc [v1.1] 仙剑98柔情版伤害数字：白色伤害 / 绿色恢复HP / 蓝色恢复MP（图片拼合）
 * @author AI Assistant
 *
 * @help
 * 复刻仙剑98柔情版的伤害数字显示：数字由 img/system 下的图片拼合而成，
 * 替代 RPG Maker 默认的文字渲染。
 *   白色（伤害，HP/MP）   : Data919.PNG ~ Data928.PNG （0~9）
 *   绿色（恢复HP）        : Data956.PNG ~ Data965.PNG （0~9）
 *   蓝色（恢复MP）        : Data929.PNG ~ Data938.PNG （0~9）
 * 配色规则与原版一致：伤害=白色，恢复体力=绿色，恢复真气=蓝色。
 * Miss/闪避不显示任何文字（由 palBattleAnim 统一关闭弹窗，被打者摆防御姿势）。
 * 暴击：原版仅把攻击音效换成暴击音效（fight.c 2063-2070），无额外画面；
 * 此处增强为数字放大 1.3 倍 + 白色闪光，便于识别。
 *
 * 需排在 palBattleCore 之后加载。
 */

(() => {
    // colorType: 0=HP伤害 1=HP恢复 2=MP伤害 3=MP恢复 → 数字图起始编号
    const DIGIT_BASE = [919, 956, 919, 929];
    const DIGIT_SCALE = 3; // PAL 素材 ×3，与战斗画面比例一致
    const DIGIT_STEP = 15; // 数字间水平间距（像素）
    const CRIT_SCALE = 1.3; // 暴击数字放大（增强表现，原版无）

    // 暴击标记需在 createDigits 之前拿到（setup 里 critical 处理在拼数字之后）
    const _setup = Sprite_Damage.prototype.setup;
    Sprite_Damage.prototype.setup = function (target) {
        this._palCritical = !!(target.result() && target.result().critical);
        _setup.call(this, target);
    };

    Sprite_Damage.prototype.createDigits = function (value) {
        const string = Math.abs(value).toString();
        const base = DIGIT_BASE[this._colorType] || 919;
        const scale = DIGIT_SCALE * (this._palCritical ? CRIT_SCALE : 1);
        for (let i = 0; i < string.length; i++) {
            const sprite = new Sprite();
            sprite.bitmap = ImageManager.loadSystem("Data" + (base + Number(string[i])));
            sprite.anchor.x = 0.5;
            sprite.anchor.y = 1;
            sprite.scale.x = scale;
            sprite.scale.y = scale;
            sprite.y = -40;
            sprite.ry = sprite.y;
            sprite.dy = -i; // 逐位错峰弹落（沿用 MZ 原逻辑）
            sprite.x = (i - (string.length - 1) / 2) * DIGIT_STEP;
            this.addChild(sprite);
        }
    };

    // 暴击闪光：白闪（原版无画面变化，仅音效不同；此为增强）
    Sprite_Damage.prototype.setupCriticalEffect = function () {
        this._flashColor = [255, 255, 255, 160];
        this._flashDuration = 60;
    };

    // “Miss/闪避”文字配色与数字一致：伤害白 / 恢复绿 / 蓝
    const _damageColor = Sprite_Damage.prototype.damageColor;
    Sprite_Damage.prototype.damageColor = function () {
        switch (this._colorType) {
            case 0:
            case 2:
                return "#ffffff";
            case 1:
                return "#40e040";
            case 3:
                return "#40a0f8";
            default:
                return _damageColor.call(this);
        }
    };
})();
