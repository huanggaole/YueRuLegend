/*:
 * @target MZ
 * @plugindesc v1.0.2 等距投影插件 - 将RMMZ默认正交投影修改为斜45度投影
 * @author YourName
 * @url 
 * @help IsometricView.js
 * 
 * @param transformA
 * @text 变换矩阵 a
 * @desc 仿射变换矩阵的a值
 * @type number
 * @decimals 2
 * @min -10
 * @max 10
 * @default 1
 * 
 * @param transformB
 * @text 变换矩阵 b
 * @desc 仿射变换矩阵的b值
 * @type number
 * @decimals 2
 * @min -10
 * @max 10
 * @default -1
 * 
 * @param transformC
 * @text 变换矩阵 c
 * @desc 仿射变换矩阵的c值
 * @type number
 * @decimals 2
 * @min -1000
 * @max 1000
 * @default 320
 * 
 * @param transformD
 * @text 变换矩阵 d
 * @desc 仿射变换矩阵的d值
 * @type number
 * @decimals 2
 * @min -10
 * @max 10
 * @default 0.5
 * 
 * @param transformE
 * @text 变换矩阵 e
 * @desc 仿射变换矩阵的e值
 * @type number
 * @decimals 2
 * @min -10
 * @max 10
 * @default 0.5
 * 
 * @param transformF
 * @text 变换矩阵 f
 * @desc 仿射变换矩阵的f值
 * @type number
 * @decimals 2
 * @min -1000
 * @max 1000
 * @default 0
 *
 * @help IsometricView.js
 * ============================================================================
 * 等距投影插件
 * ============================================================================
 * 
 * 这个插件将RMMZ的默认正交投影修改为等距投影（斜45度投影）。
 * 
 * 主要功能：
 * 1. 将48x48的瓦片通过仿射变换转换为菱形
 * 2. 修改角色移动方向，从正交方向改为斜向移动
 * 3. 可自定义变换矩阵参数
 * 
 * 变换矩阵格式：
 * | a  b  c |
 * | d  e  f |
 * | 0  0  1 |
 * 
 * 默认参数实现标准等距投影：
 * a=1, b=-1, c=0, d=0.5, e=0.5, f=0
 * 
 * ============================================================================
 */

(() => {
    'use strict';

    // 获取插件参数
    const pluginName = 'IsometricView';
    const parameters = PluginManager.parameters(pluginName);

    const TRANSFORM_MATRIX = {
        a: parseFloat(parameters['transformA']) || 1,
        b: parseFloat(parameters['transformB']) || -1,
        c: parseFloat(parameters['transformC']) || 0,
        d: parseFloat(parameters['transformD']) || 0.5,
        e: parseFloat(parameters['transformE']) || 0.5,
        f: parseFloat(parameters['transformF']) || 0
    };

    // 计算居中偏移量（从插件参数读取）
    const CENTERING_OFFSET = {
        x: parseFloat(parameters['centeringOffsetX'] || '320'),
        y: parseFloat(parameters['centeringOffsetY'] || '0')
    };

    // 重写Tilemap以实现真正的瓦片变换
    const _Tilemap_initialize = Tilemap.prototype.initialize;
    Tilemap.prototype.initialize = function() {
        _Tilemap_initialize.call(this);
        this._isometricEnabled = true;
        this._margin = 250;
    };

    // 重写瓦片层的创建以应用变换
    const _Tilemap__createLayers = Tilemap.prototype._createLayers;
    Tilemap.prototype._createLayers = function() {
        _Tilemap__createLayers.call(this);

        // 启用瓦片层的等距变换
        if (this._isometricEnabled) {
            [this._lowerLayer, this._upperLayer].forEach(layer => {
                if (layer) {
                    layer.transform.setFromMatrix(new PIXI.Matrix(
                        TRANSFORM_MATRIX.a, TRANSFORM_MATRIX.d,
                        TRANSFORM_MATRIX.b, TRANSFORM_MATRIX.e,
                        TRANSFORM_MATRIX.c, TRANSFORM_MATRIX.f,
                    ));
                }
            });
        }
    };

    // 重写Spriteset_Map以确保整个地图场景应用变换
    const _Spriteset_Map_createTilemap = Spriteset_Map.prototype.createTilemap;
    Spriteset_Map.prototype.createTilemap = function() {
        _Spriteset_Map_createTilemap.call(this);

        // 对整个tilemap容器应用变换
        if (this._tilemap) {
            this._tilemap.transform.setFromMatrix(new PIXI.Matrix(
                TRANSFORM_MATRIX.a, TRANSFORM_MATRIX.d,
                TRANSFORM_MATRIX.b, TRANSFORM_MATRIX.e,
                TRANSFORM_MATRIX.c, TRANSFORM_MATRIX.f,
            ));
        }
    };

    const _Spriteset_Map_createCharacters = Spriteset_Map.prototype.createCharacters;
    Spriteset_Map.prototype.createCharacters = function() {
        _Spriteset_Map_createCharacters.call(this);

        // 对角色精灵应用逆变换，抵消tilemap的仿射变换
        if (this._characterSprites) {
            this._characterSprites.forEach(sprite => {
                if (sprite) {
                    // 计算逆变换矩阵
                    
                    const det = TRANSFORM_MATRIX.a * TRANSFORM_MATRIX.e - TRANSFORM_MATRIX.b * TRANSFORM_MATRIX.d;
                    const inverseMatrix = new PIXI.Matrix(
                        TRANSFORM_MATRIX.e / det, -TRANSFORM_MATRIX.d / det, // a, d
                        -TRANSFORM_MATRIX.b / det, TRANSFORM_MATRIX.a / det, // b, e
                        (TRANSFORM_MATRIX.b * TRANSFORM_MATRIX.f - TRANSFORM_MATRIX.c * TRANSFORM_MATRIX.e) / det, // etx - 不需要位移逆变换  
                        (TRANSFORM_MATRIX.c * TRANSFORM_MATRIX.d - TRANSFORM_MATRIX.a * TRANSFORM_MATRIX.f) / det  // ty - 不需要位移逆变换
                    );

                    sprite.transform.setFromMatrix(inverseMatrix);
                    // 应用逆变换矩阵
                    // 现在只有一次变换，角色应该正常显示
                    // 不需要逆变换，只需要设置正常的2倍缩放
                    sprite.scale.set(2, 4);
                }
            });
        }
    };
    
    
    // 点击地图的坐标进行逆仿射运算
    /*
    Scene_Map.prototype.onMapTouch = function() {
        console.log(TouchInput.x, TouchInput.y);
        // 获取点击位置的瓦片ID
        $gameTemp.setDestination($gameMap.canvasToMapX(newx), $gameMap.canvasToMapY(newy));
    };
    */
    // 禁用默认的地图触摸事件
    Scene_Map.prototype.isMapTouchOk = function() {
        return false;
    };

    // 添加插件指令
    PluginManager.registerCommand(pluginName, "toggleIsometric", args => {
        // 重新刷新地图以应用/取消变换
        SceneManager._scene.createSpriteset();
        $gameMap.refresh();
    });

    PluginManager.registerCommand(pluginName, "setTransformMatrix", args => {
        TRANSFORM_MATRIX.a = parseFloat(args.a) || TRANSFORM_MATRIX.a;
        TRANSFORM_MATRIX.b = parseFloat(args.b) || TRANSFORM_MATRIX.b;
        TRANSFORM_MATRIX.c = parseFloat(args.c) || TRANSFORM_MATRIX.c;
        TRANSFORM_MATRIX.d = parseFloat(args.d) || TRANSFORM_MATRIX.d;
        TRANSFORM_MATRIX.e = parseFloat(args.e) || TRANSFORM_MATRIX.e;
        TRANSFORM_MATRIX.f = parseFloat(args.f) || TRANSFORM_MATRIX.f;

        // 重新应用变换
        SceneManager._scene.createSpriteset();
        $gameMap.refresh();
    });

})();