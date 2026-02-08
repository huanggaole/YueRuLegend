/*:
 * @target MZ
 * @plugindesc High-layer tiles as Sprites for correct Isometric Occlusion z-sorting.
 * @help
 * Replaces pure layer-based rendering for "High" tiles (flagged with 4 bits height)
 * with Sprite-based rendering.
 *
 * This ensures that tiles with height flags (e.g. Trees, Walls) are sorted
 * individually against characters based on their Y coordinate.
 *
 * 插件功能：
 * 将带有高度标志（flags >> 12 > 0）的瓦片渲染为独立Sprite，
 * 从而利用RMMZ内置的Z-sort（根据Y坐标排序）实现正确的斜45度遮挡关系。
 */

// Define Sprite_DynamicTile class
function Sprite_DynamicTile() {
    this.initialize(...arguments);
}

Sprite_DynamicTile.prototype = Object.create(Sprite.prototype);
Sprite_DynamicTile.prototype.constructor = Sprite_DynamicTile;

Sprite_DynamicTile.prototype.initialize = function (tileId, mx, my, bias, height) {
    Sprite.prototype.initialize.call(this);
    this._tileId = tileId;
    this._mx = mx;
    this._my = my;
    this._sortBias = bias || 0; // Bias for sorting (0 for solids, 48 for ground)
    this._height = height || 0;
    this.anchor.x = 0;
    this.anchor.y = 1;
    this.z = 3;

    // Check if it is a table tile
    const flags = $gameMap.tilesetFlags();
    this._isTable = Tilemap.isTileA2(tileId) && (flags[tileId] & 0x80);

    this.initBitmap();
    this.updatePosition();
    this.createDebugSprite();
};

Sprite_DynamicTile.prototype.createDebugSprite = function () {
    // Create a small text sprite to show height
    const bitmap = new Bitmap(32, 20);
    bitmap.fontSize = 14;
    bitmap.drawText(this._height, 0, 0, 32, 20, "center");

    const sprite = new Sprite(bitmap);
    sprite.anchor.x = 0.5;
    sprite.anchor.y = 1;
    sprite.x = $gameMap.tileWidth() / 2;
    sprite.y = -10; // Float above the tile base
    this.addChild(sprite);
};

// ... initBitmap ...

Sprite_DynamicTile.prototype.update = function () {
    Sprite.prototype.update.call(this);
    this.updatePosition();
};

Sprite_DynamicTile.prototype.updatePosition = function () {
    const tw = $gameMap.tileWidth();
    const th = $gameMap.tileHeight();

    const scrolledX = $gameMap.adjustX(this._mx);
    const scrolledY = $gameMap.adjustY(this._my);

    this.x = Math.floor(scrolledX * tw);
    this.y = Math.floor((scrolledY + 1) * th);

    // SortY = Y - Bias.
    // Solid: Bias 0. SortY = Bottom.
    // Ground: Bias 48. SortY = Top.
    this._sortY = this.y - this._sortBias;
};

// ...

Tilemap.prototype._addDynamicTile = function (tileId, mx, my, flag) {
    // Determine Bias based on Passability
    const tileFlag = this.flags[tileId];
    const isSolid = (tileFlag & 0x0F) !== 0;

    // Bias Logic:
    // Solid: 0 (Beats Character which is -6)
    // Ground: 48 (Behind Character)
    const bias = isSolid ? 0 : 48;

    const sprite = new Sprite_DynamicTile(tileId, mx, my, bias);
    this.addChild(sprite);
    this._dynamicSprites.push(sprite);
};

Sprite_DynamicTile.prototype.initBitmap = function () {
    // Logic adapted from Tilemap.prototype._addNormalTile and Sprite_Character
    const tileId = this._tileId;
    const tileset = $gameMap.tileset();

    // Determine setNumber (assuming B-E tiles for now, as A tiles are complex autotiles)
    // Note: If using A-tiles as high tiles, we might need Autotile logic.
    // Standard RMMZ implementation for _addNormalTile:
    let setNumber = 0;
    if (Tilemap.isTileA5(tileId)) {
        setNumber = 4;
    } else {
        setNumber = 5 + Math.floor(tileId / 256);
    }

    // Load bitmap
    if (tileset && tileset.tilesetNames[setNumber]) {
        this.bitmap = ImageManager.loadTileset(tileset.tilesetNames[setNumber]);
    }

    // Set frame
    const w = $gameMap.tileWidth();
    const h = $gameMap.tileHeight();
    const sx = ((Math.floor(tileId / 128) % 2) * 8 + (tileId % 8)) * w;
    const sy = (Math.floor((tileId % 256) / 8) % 16) * h;

    this.setFrame(sx, sy, w, h);

    // Handle Table table edge case? 
    // Usually Tables (A2) are drawn with specific logic. 
    // This sprite implementation primarily targets B-E Object tiles.
};

Sprite_DynamicTile.prototype.update = function () {
    Sprite.prototype.update.call(this);
    this.updatePosition();
};

Sprite_DynamicTile.prototype.updatePosition = function () {
    // Calculate Screen Coordinates based on Map Coordinates
    const tw = $gameMap.tileWidth();
    const th = $gameMap.tileHeight();

    // Use adjustX/Y for looping support
    const scrolledX = $gameMap.adjustX(this._mx);
    const scrolledY = $gameMap.adjustY(this._my);

    // Use Math.floor to match RMMZ's Integer-based Screen Coordinates
    // This prevents "Jumping" caused by float precision mismatches with Characters
    this.x = Math.floor(scrolledX * tw);
    this.y = Math.floor((scrolledY + 1) * th);

    // Sort Priority:
    // Game_Character screenY is (y+1)*th - shiftY (usually 6).
    // Sort Priority:
    // Game_Character screenY is (y+1)*th - shiftY (usually 6).
    // If Solid (Wall), Bias = 0. SortY = Bottom. (> Char Bottom-6). Object Covers Char.
    // If Passable (Ground), Bias = 48. SortY = Top. (<< Char Bottom-6). Char Covers Ground.
    this._sortY = this.y - this._sortBias;
};

// Extend Tilemap
const _Tilemap_initialize = Tilemap.prototype.initialize;
Tilemap.prototype.initialize = function () {
    _Tilemap_initialize.call(this);
    this._dynamicSprites = [];
};

const _Tilemap_updateTransform = Tilemap.prototype.updateTransform;
Tilemap.prototype.updateTransform = function () {
    // We hook here if we need to clean up sprites when map refreshes significantly?
    // Actually _addAllSpots handles the clear.
    _Tilemap_updateTransform.call(this);
};

// Override _addAllSpots to clear our sprites
// We can't easily hook _addAllSpots without overwriting or alias
const _Tilemap_addAllSpots = Tilemap.prototype._addAllSpots;
Tilemap.prototype._addAllSpots = function (startX, startY) {
    this._clearDynamicSprites();
    _Tilemap_addAllSpots.call(this, startX, startY);
};

Tilemap.prototype._clearDynamicSprites = function () {
    if (this._dynamicSprites) {
        for (const sprite of this._dynamicSprites) {
            this.removeChild(sprite);
            sprite.destroy();
        }
        this._dynamicSprites = [];
    }
};

Tilemap.prototype._addDynamicTile = function (tileId, mx, my) {
    const sprite = new Sprite_DynamicTile(tileId, mx, my);
    this.addChild(sprite);
    this._dynamicSprites.push(sprite);
};

Tilemap.prototype._processHighTile = function (tileId, dx, dy, mx, my) {
    if (tileId === 0) return false;

    // Check height flag (High 4 bits)
    const flag = this.flags[tileId] >> 12;

    if (flag > 0) {
        // It's a high tile -> Create Sprite
        this._addDynamicTile(tileId, mx, my, flag);
        return true; // Handled as sprite
    } else {
        return false; // Not a high tile
    }
};

// Override _addSpot from DynamicTileLayers.js
Tilemap.prototype._addSpot = function (startX, startY, x, y) {
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

    // Layer 0 (Ground)
    // Check if it's a High Tile first. If so, it becomes a sprite.
    if (!this._processHighTile(tileId0, dx, dy, mx, my)) {
        this._addSpotTile(tileId0, dx, dy);
    }

    // Layer 1 (Ground Object)
    // Check if it's a High Tile first.
    if (!this._processHighTile(tileId1, dx, dy, mx, my)) {
        this._addSpotTile(tileId1, dx, dy);
    }

    this._addShadow(this._lowerLayer, shadowBits, dx, dy);

    if (this._isTableTile(upperTileId1) && !this._isTableTile(tileId1)) {
        if (!Tilemap.isShadowingTile(tileId0)) {
            this._addTableEdge(this._lowerLayer, upperTileId1, dx, dy);
        }
    }

    // Upper Layers (2, 3)
    // If it is a High Tile (Height > 0), it becomes a Sprite (Z=3, Sorted).
    // If it is NOT a High Tile (Height 0), we must rely on standard RMMZ priority:
    // - Star (*): _upperLayer (Z=4, Always Above Character).
    // - Not Star: _lowerLayer (Z=0, Always Behind Character).

    if (!this._processHighTile(tileId2, dx, dy, mx, my)) {
        if (this._isHigherTile(tileId2)) {
            this._addTile(this._upperLayer, tileId2, dx, dy);
        } else {
            this._addTile(this._lowerLayer, tileId2, dx, dy);
        }
    }

    if (!this._processHighTile(tileId3, dx, dy, mx, my)) {
        if (this._isHigherTile(tileId3)) {
            this._addTile(this._upperLayer, tileId3, dx, dy);
        } else {
            this._addTile(this._lowerLayer, tileId3, dx, dy);
        }
    }
};

// Global counter for ALL Sprites to ensure stable sorting
let _globalSpriteIdCounter = 0;

// Patch Sprite to assign unique spriteId
const _Sprite_initialize = Sprite.prototype.initialize;
Sprite.prototype.initialize = function () {
    _Sprite_initialize.apply(this, arguments);
    this.spriteId = _globalSpriteIdCounter++;
    this._sortY = undefined; // Initialize sortY
};

Tilemap.prototype._addDynamicTile = function (tileId, mx, my, flag) {
    // Determine Bias based on Height (Flag)
    // Flag is the 4-bit height value (0-15).

    // Note: The 'flag' argument IS the height (shifted value passed from _processHighTile).
    const height = flag;

    // Dynamic Height Bias
    // Height 1: Ground (Bias 48 -> Behind).
    // Height > 1: Object occlusion extends "South" by (Height) tiles.
    // Bias = -(Height * 48).
    // Example Height 3: Bias -144. SortY = Bottom + 144.
    // Character @ Y+2: SortY = Bottom + 96 - 6 = +90.
    // Result: 144 > 90. Tile Occludes Character 2 tiles down.

    const bias = -(height - 1) * 48;

    const sprite = new Sprite_DynamicTile(tileId, mx, my, bias, height);
    this.addChild(sprite);
    this._dynamicSprites.push(sprite);
};

// Override _compareChildOrder to support custom Depth sorting
Tilemap.prototype._compareChildOrder = function (a, b) {
    if (a.z !== b.z) {
        return a.z - b.z;
    }
    const aY = (a._sortY !== undefined) ? a._sortY : a.y;
    const bY = (b._sortY !== undefined) ? b._sortY : b.y;

    if (aY !== bY) {
        return aY - bY;
    }

    // Stable sort using unique spriteId
    return a.spriteId - b.spriteId;
};

Tilemap.prototype._processHighTile = function (tileId, dx, dy, mx, my) {
    if (tileId === 0) return;

    // Check height flag (High 4 bits)
    const flag = this.flags[tileId] >> 12;

    if (flag > 0) {
        // It's a high tile -> Create Sprite
        this._addDynamicTile(tileId, mx, my, flag);
    } else {
        // Standard handling
        if (this._isHigherTile(tileId)) {
            this._addTile(this._upperLayer, tileId, dx, dy);
        } else {
            this._addTile(this._lowerLayer, tileId, dx, dy);
        }
    }
};
