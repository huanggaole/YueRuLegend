//=============================================================================
// DynamicTileLayers.js
// 版本: 1.0
// 作者: YourName
// 日期: 2023-11-01
// 描述: 实现基于瓦片标志(flag)的动态层级系统
//=============================================================================

/*:
 * @plugindesc 动态层级瓦片系统，根据瓦片高度标志(flag)调整瓦片与角色的层级关系
 * @author YourName
 *
 * @help
 * 这个插件允许你使用瓦片的高4位作为高度值(0-15)，实现动态的层级效果。
 * 
 * 使用方法:
 * 1. 在地图编辑器中设置瓦片的高4位作为高度标志
 * 2. 当角色移动时，插件会自动判断瓦片与角色的层级关系
 * 
 * 算法说明:
 * 对于每个瓦片，计算其高度值: tag = flags[tile] >> 12
 * 判断条件: tile.y - tag <= character.y
 * 如果满足条件，瓦片位于角色上方；否则位于角色下方
 * 
 * 注意: 此插件需要配合适当的地图瓦片设置才能发挥最佳效果
 * 
 * @param TileHeightOffset
 * @desc 瓦片高度偏移量，用于微调所有瓦片的高度
 * @type number
 * @default 0
 * 
 * @param CharacterHeightOffset
 * @desc 角色高度偏移量，用于微调所有角色的高度
 * @type number
 * @default 0
 */

(function() {
    Tilemap.prototype._addSpot = function(startX, startY, x, y) {
        const mx = startX + x;
        const my = startY + y;
        const dx = x * this.tileWidth;
        const dy = y * this.tileHeight;
        const tileId0 = this._readMapData(mx, my, 0);
        const tileId1 = this._readMapData(mx, my, 1);
        const tileId2 = this._readMapData(mx, my, 2);
        const tileId3 = this._readMapData(mx, my, 3);
        const shadowBits = this._readMapData(mx, my, 4);
        const upperTileId1 = this._readMapData(mx, my - 1, 1);

        this._addDynamicSpotTile(tileId0, dx, dy, mx, my);
        this._addDynamicSpotTile(tileId1, dx, dy, mx, my);
        this._addShadow(this._lowerLayer, shadowBits, dx, dy);
        if (this._isTableTile(upperTileId1) && !this._isTableTile(tileId1)) {
            if (!Tilemap.isShadowingTile(tileId0)) {
                this._addTableEdge(this._lowerLayer, upperTileId1, dx, dy);
            }
        }
        if (this._isOverpassPosition(mx, my)) {
            this._addTile(this._upperLayer, tileId2, dx, dy);
            this._addTile(this._upperLayer, tileId3, dx, dy);
        } else {
            this._addDynamicSpotTile(tileId2, dx, dy, mx, my);
            this._addDynamicSpotTile(tileId3, dx, dy, mx, my);
        }
    };

    Tilemap.prototype._addDynamicSpotTile = function(tileId, dx, dy, mx, my) {
        const flag = this.flags[tileId] >> 12;
        if(flag != 0){
            if((mx + my + flag + 0.1) >= ($gamePlayer.x + $gamePlayer.y)){
                this._addTile(this._upperLayer, tileId, dx, dy);
            }else{
                this._addTile(this._lowerLayer, tileId, dx, dy);
            }
        } else{
            if (this._isHigherTile(tileId)) {
                this._addTile(this._upperLayer, tileId, dx, dy);
            } else {
                this._addTile(this._lowerLayer, tileId, dx, dy);
            }
        }
    };

})();
