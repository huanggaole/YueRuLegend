/*:
 * @target MZ
 * @plugindesc High-layer tiles as Sprites using Region Layer for Height encoding.
 * 
 * @param showDebug
 * @text Show Debug Heights
 * @desc Set to true to see height numbers rendered above tiles.
 * @type boolean
 * @default false
 * 
 * @help
 * Replaces pure layer-based rendering for tiles with height > 0 (encoded in Region Layer)
 * with Sprite-based rendering.
 *
 * Region encoding:
 * Region ID = Upper_Height * 10 + Lower_Height
 * - Lower_Height: units digit (Z=0, 1)
 * - Upper_Height: tens digit (Z=2, 3)
 */

const DTL_params = PluginManager.parameters('DynamicTileLayers');

// Define Sprite_DynamicTile class
function Sprite_DynamicTile() {
    this.initialize(...arguments);
}

Sprite_DynamicTile.prototype = Object.create(Sprite.prototype);
Sprite_DynamicTile.prototype.constructor = Sprite_DynamicTile;

Sprite_DynamicTile.SHOW_DEBUG = String(DTL_params['showDebug']).toLowerCase() === 'true';

Sprite_DynamicTile.prototype.initialize = function (tileId, mx, my, bias, height) {
    Sprite.prototype.initialize.call(this);
    this._tileId = tileId;
    this._mx = mx;
    this._my = my;
    this._sortBias = bias || 0; 
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
    if (!Sprite_DynamicTile.SHOW_DEBUG) return;

    const bitmap = new Bitmap(32, 20);
    bitmap.fontSize = 14;
    bitmap.drawText(this._height, 0, 0, 32, 20, "center");

    const sprite = new Sprite(bitmap);
    sprite.anchor.x = 0.5;
    sprite.anchor.y = 1;
    sprite.x = $gameMap.tileWidth() / 2;
    sprite.y = -10; 
    this.addChild(sprite);
};

Sprite_DynamicTile.prototype.initBitmap = function () {
    const tileId = this._tileId;
    const tileset = $gameMap.tileset();

    let setNumber = 0;
    if (Tilemap.isTileA5(tileId)) {
        setNumber = 4;
    } else {
        setNumber = 5 + Math.floor(tileId / 256);
    }

    if (tileset && tileset.tilesetNames[setNumber]) {
        this.bitmap = ImageManager.loadTileset(tileset.tilesetNames[setNumber]);
    }

    const w = $gameMap.tileWidth();
    const h = $gameMap.tileHeight();
    const sx = ((Math.floor(tileId / 128) % 2) * 8 + (tileId % 8)) * w;
    const sy = (Math.floor((tileId % 256) / 8) % 16) * h;

    // Use exact original frame and scale.
    // The "background pad" logic in _addSpot now perfectly solves any 
    // physical cracks or bleeding without modifying geometry!
    this.setFrame(sx, sy, w, h);
    this.scale.x = 1.0;
    this.scale.y = 1.0;
};

Sprite_DynamicTile.prototype.update = function () {
    Sprite.prototype.update.call(this);
    this.updatePosition();
};

Sprite_DynamicTile.prototype.updatePosition = function () {
    const tw = $gameMap.tileWidth();
    const th = $gameMap.tileHeight();

    // To prevent 1px black gaps (WebGL texture bleeding) between adjacent tiles,
    // we must exactly replicate RMMZ Tilemap's integer rounding logic instead of
    // using the float 'scrolledX' which drifts by 0.5px.
    const effX = $gameMap.adjustX(this._mx) + $gameMap.displayX();
    const effY = $gameMap.adjustY(this._my) + $gameMap.displayY();

    // RMMZ Tilemap uses Math.ceil for its origin tracking!
    const displayX_px = Math.ceil($gameMap.displayX() * tw);
    const displayY_px = Math.ceil($gameMap.displayY() * th);

    this.x = Math.round(effX * tw) - displayX_px;
    this.y = Math.round((effY + 1) * th) - displayY_px;

    this._sortX = this.x + tw / 2;
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
    _Tilemap_updateTransform.call(this);
};

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

const _Tilemap_update = Tilemap.prototype.update;
Tilemap.prototype.update = function () {
    _Tilemap_update.call(this);

    if (this._dynamicSprites) {
        for (const sprite of this._dynamicSprites) {
            sprite.update();
        }
    }
};

// Override _addSpot
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
    
    // Read Region Layer for heights
    const regionId = this._readMapData(mx, my, 5) || 0;

    // Process layer 0 and ALWAYS draw static backdrop pad
    this._processHighTile(tileId0, dx, dy, mx, my, regionId, 0);
    this._addSpotTile(tileId0, dx, dy);

    // Process layer 1 and ALWAYS draw static backdrop pad
    this._processHighTile(tileId1, dx, dy, mx, my, regionId, 1);
    this._addSpotTile(tileId1, dx, dy);

    this._addShadow(this._lowerLayer, shadowBits, dx, dy);

    if (this._isTableTile(upperTileId1) && !this._isTableTile(tileId1)) {
        if (!Tilemap.isShadowingTile(tileId0)) {
            this._addTableEdge(this._lowerLayer, upperTileId1, dx, dy);
        }
    }

    // Process layer 2
    const isDyn2 = this._processHighTile(tileId2, dx, dy, mx, my, regionId, 2);
    if (isDyn2) {
        // Dynamic: force static backdrop to lowerLayer so it doesn't cover characters
        this._addTile(this._lowerLayer, tileId2, dx, dy);
    } else {
        if (this._isHigherTile(tileId2)) {
            this._addTile(this._upperLayer, tileId2, dx, dy);
        } else {
            this._addTile(this._lowerLayer, tileId2, dx, dy);
        }
    }

    // Process layer 3
    const isDyn3 = this._processHighTile(tileId3, dx, dy, mx, my, regionId, 3);
    if (isDyn3) {
        // Dynamic: force static backdrop to lowerLayer
        this._addTile(this._lowerLayer, tileId3, dx, dy);
    } else {
        if (this._isHigherTile(tileId3)) {
            this._addTile(this._upperLayer, tileId3, dx, dy);
        } else {
            this._addTile(this._lowerLayer, tileId3, dx, dy);
        }
    }
};

let _globalSpriteIdCounter = 0;

const _Sprite_initialize = Sprite.prototype.initialize;
Sprite.prototype.initialize = function () {
    _Sprite_initialize.apply(this, arguments);
    this.spriteId = _globalSpriteIdCounter++;
    this._sortY = undefined; 
    this._sortX = undefined; 
};

Tilemap.prototype._addDynamicTile = function (tileId, mx, my, height) {
    const bias = -(height - 1) * 48;
    const sprite = new Sprite_DynamicTile(tileId, mx, my, bias, height);
    this.addChild(sprite);
    this._dynamicSprites.push(sprite);
};

Tilemap.prototype._compareChildOrder = function (a, b) {
    if (a.z !== b.z) {
        return a.z - b.z;
    }
    const aY = (a._sortY !== undefined) ? a._sortY : a.y;
    const bY = (b._sortY !== undefined) ? b._sortY : b.y;

    let aDepth = aY;
    let bDepth = bY;

    if (this._isometricEnabled) {
        const isCharA = !!a._character;
        const isCharB = !!b._character;
        const aX = (a._sortX !== undefined) ? a._sortX : a.x;
        const bX = (b._sortX !== undefined) ? b._sortX : b.x;
        aDepth = aX + aY;
        bDepth = bX + bY;
    }

    if (aDepth !== bDepth) {
        return aDepth - bDepth;
    }

    return a.spriteId - b.spriteId;
};

Tilemap.prototype._isHigherTile = function (tileId) {
    return this.flags[tileId] & 0x10;
};

// Movement overrides reverted to restore smooth character walking

Tilemap.prototype._processHighTile = function (tileId, dx, dy, mx, my, regionId, layerIndex) {
    if (tileId === 0) return false;

    let height = 0;
    if (layerIndex < 2) {
        height = regionId % 10;
    } else {
        height = Math.floor(regionId / 10);
    }

    if (height > 0) {
        this._addDynamicTile(tileId, mx, my, height);
        return true;
    }
    
    return false;
};
