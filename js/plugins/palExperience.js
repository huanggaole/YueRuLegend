/*:
 * @target MZ
 * @plugindesc 重写仙剑98柔情版角色升级经验算法
 * @author Your Name
 *
 * @help
 * 仙剑98柔情版的升级经验定义:
 * Exp(N): 等于从 N 到 N + 1 级升级所需经验
 * Exp(N) = 15 + N * (N - 1) * 25 / 2
 * 当 N >= 52 时, Exp(N) = 32000
 */

(() => {
    Game_Actor.prototype.expForLevel = function(level) {
        if (level === 1) return 0;
        let totalExp = 0;
        for (let i = 1; i < level; i++) {
            let expNeeded = 15 + i * (i - 1) * 25 / 2;
            if (i >= 52) {
                expNeeded = 32000;
            }
            totalExp += expNeeded;
        }
        return totalExp;
    };
})();
