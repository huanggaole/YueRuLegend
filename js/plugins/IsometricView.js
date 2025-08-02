/*:
 * @plugindesc 将地图转换为斜45°等轴测风格，支持仿射矩阵变换与输入适配
 * @author Trae AI
 * 
 * @param 缩放因子X
 * @desc X轴缩放比例 (斜45°建议0.707)
 * @default 0.707
 * 
 * @param 缩放因子Y
 * @desc Y轴缩放比例 (斜45°建议0.353)
 * @default 0.353
 * 
 * @param 旋转角度
 * @desc 图块旋转角度(度) (斜45°建议45)
 * @default 45
 * 
 * @help
 * 1. 插件通过仿射矩阵对所有图块和角色进行坐标变换，实现斜45°视角
 * 2. 玩家输入方向会自动映射到变换后的坐标系（例如：上键对应东北方向）
 */

(() => {
    const pluginName = "IsometricView";
    const parameters = PluginManager.parameters(pluginName);

    // 定义一个三行三列的二维仿射变换矩阵
    
    const affineMatrix = [
        [1,  -1, 0],
        [1/2, 1/2, 0],
        [0, 0, 1]
    ];
    
    /*
    const affineMatrix = [
        [1/3,  -1/3, 16],
        [5/32, 5/32, 0],
        [0, 0, 1]
    ];
    // 修正仿射矩阵：增大缩放系数 + 适配816x624屏幕分辨率
    const affineMatrix = [
        [1.0, 0.0, 0],  // x: 缩放1.0倍 + 偏移408（屏幕宽度816的一半）
        [0.0, 1.0, 0],   // y: 缩放0.5倍 + 偏移312（屏幕高度624的一半）
        [0, 0, 1]
    ];
    */
    // -------------------------------------------------------------------------
    // 1. 地图图块重新绘制：将地图图块按照仿射变换矩阵变换后再绘制
    // -------------------------------------------------------------------------
    Tilemap.Layer.prototype._updateVertexBuffer = function() {
        const numElements = this._elements.length;
        const required = numElements * Tilemap.Layer.VERTEX_STRIDE;
        if (this._vertexArray.length < required) {
            this._vertexArray = new Float32Array(required * 2);
        }
        const vertexArray = this._vertexArray;
        let index = 0;
        // 获取仿射矩阵（从插件中定义的全局变量）
        const a = affineMatrix[0][0];  // 矩阵参数 a (x缩放/旋转)
        const b = affineMatrix[0][1];  // 矩阵参数 b (y缩放/旋转)
        const tx = affineMatrix[0][2]; // 矩阵参数 tx (x偏移)
        const c = affineMatrix[1][0];  // 矩阵参数 c (x倾斜/旋转)
        const d = affineMatrix[1][1];  // 矩阵参数 d (y缩放/旋转)
        const ty = affineMatrix[1][2]; // 矩阵参数 ty (y偏移)

        for (const item of this._elements) {
            const setNumber = item[0];
            const tid = setNumber >> 2;
            const sxOffset = 1024 * (setNumber & 1);
            const syOffset = 1024 * ((setNumber >> 1) & 1);
            const sx = item[1] + sxOffset;
            const sy = item[2] + syOffset;
            const dx = item[3];  // 图块左上角原始X坐标
            const dy = item[4];  // 图块左上角原始Y坐标
            const w = item[5];   // 图块宽度
            const h = item[6];   // 图块高度
            const frameLeft = sx + 0.5;
            const frameTop = sy + 0.5;
            const frameRight = sx + w - 0.5;
            const frameBottom = sy + h - 0.5;

            // 计算图块四个顶点的原始坐标（未变换，已减去相机滚动偏移）
            // 计算图块四个顶点的原始坐标（修正相机单位为像素）
            const tw = $gameMap.tileWidth();  // 获取图块宽度（像素）
            const th = $gameMap.tileHeight(); // 获取图块高度（像素）
            // 【删除原cameraX/cameraY计算，避免与玩家坐标冲突】

            // 获取主角（玩家）的地图坐标（像素单位，取整避免浮点误差）
            const player = $gamePlayer;
            const playerMapX = Math.floor(player.scrolledX() * tw + tw / 2); // 强制取整
            const playerMapY = Math.floor(player.scrolledY() * th + th / 2); // 强制取整
            // 屏幕中心坐标（像素）
            const screenCenterX = Graphics.width / 2;
            const screenCenterY = Graphics.height / 2;

            const vertices = [
                {x: dx, y: dy},                // 左上角（原始地图坐标，不再减cameraX）
                {x: dx + w, y: dy},            // 右上角
                {x: dx + w, y: dy + h},        // 右下角
                {x: dx, y: dy + h}             // 左下角
            ];

            // 对四个顶点分别应用仿射变换（动态平移 = 主角坐标为原点）
            const transformed = vertices.map(v => {
                // 步骤1：顶点坐标 - 主角坐标（将主角设为原点）
                const adjX = v.x - playerMapX;
                const adjY = v.y - playerMapY;
                // 步骤2：应用仿射变换（仅缩放/旋转，无固定平移）
                const x = a * adjX + b * adjY;
                const y = c * adjX + d * adjY;
                // 步骤3：+ 屏幕中心坐标（将主角平移回屏幕中心）
                return { 
                    x: Math.floor(x + screenCenterX), 
                    y: Math.floor(y + screenCenterY) 
                };
            });

            // 按顺序提交变换后的顶点数据（左上→右上→右下→左下）
            // 顶点 1: 左上角
            vertexArray[index++] = tid;
            vertexArray[index++] = frameLeft;
            vertexArray[index++] = frameTop;
            vertexArray[index++] = frameRight;
            vertexArray[index++] = frameBottom;
            vertexArray[index++] = sx;
            vertexArray[index++] = sy;
            vertexArray[index++] = transformed[0].x;  // 变换后的X
            vertexArray[index++] = transformed[0].y;  // 变换后的Y

            // 顶点 2: 右上角
            vertexArray[index++] = tid;
            vertexArray[index++] = frameLeft;
            vertexArray[index++] = frameTop;
            vertexArray[index++] = frameRight;
            vertexArray[index++] = frameBottom;
            vertexArray[index++] = sx + w;
            vertexArray[index++] = sy;
            vertexArray[index++] = transformed[1].x;  // 变换后的X
            vertexArray[index++] = transformed[1].y;  // 变换后的Y

            // 顶点 3: 右下角
            vertexArray[index++] = tid;
            vertexArray[index++] = frameLeft;
            vertexArray[index++] = frameTop;
            vertexArray[index++] = frameRight;
            vertexArray[index++] = frameBottom;
            vertexArray[index++] = sx + w;
            vertexArray[index++] = sy + h;
            vertexArray[index++] = transformed[2].x;  // 变换后的X
            vertexArray[index++] = transformed[2].y;  // 变换后的Y

            // 顶点 4: 左下角
            vertexArray[index++] = tid;
            vertexArray[index++] = frameLeft;
            vertexArray[index++] = frameTop;
            vertexArray[index++] = frameRight;
            vertexArray[index++] = frameBottom;
            vertexArray[index++] = sx;
            vertexArray[index++] = sy + h;
            vertexArray[index++] = transformed[3].x;  // 变换后的X
            vertexArray[index++] = transformed[3].y;  // 变换后的Y
        }
        this._vertexBuffer.update(vertexArray);
    };
    
    // -------------------------------------------------------------------------
    // 2. 相机映射：相机对准的位置应该进行仿射坐标变换
    // -------------------------------------------------------------------------

    // -------------------------------------------------------------------------
    // 3. 输入方向映射：将玩家输入映射到变换后的坐标系
    // -------------------------------------------------------------------------
    Game_CharacterBase.prototype.screenX = function() {
        // 主角始终返回屏幕中心X（与图块变换逻辑同步）
        return Math.floor(Graphics.width / 2);
    };
    
    Game_CharacterBase.prototype.screenY = function() {
        // 主角始终返回屏幕中心Y（与图块变换逻辑同步）
        return Math.floor(Graphics.height / 2);
    };
    
    // -------------------------------------------------------------------------
    // 4. 所有图块的大小变为原来的2倍
    // -------------------------------------------------------------------------
    /*
    const _Sprite_Character_initMembers = Sprite_Character.prototype.initMembers;
    Sprite_Character.prototype.initMembers = function() {
        _Sprite_Character_initMembers.call(this);
        this.scale.x = 2;
	    this.scale.y = 2;
    }
    */
    // 新增：限制可见图块范围不超过地图实际尺寸
    const _Tilemap_updateVisibleRegion = Tilemap.prototype.updateVisibleRegion;
    Tilemap.prototype.updateVisibleRegion = function() {
        // 注释掉原始计算，直接控制可见区域
        // _Tilemap_updateVisibleRegion.call(this); 
        
        // 获取玩家当前图块坐标
        const playerX = $gamePlayer.x;
        const playerY = $gamePlayer.y;
        const mapWidth = $gameMap.width();
        const mapHeight = $gameMap.height();
        
        // 强制设置：以玩家为中心，上下左右各20格
        this._visibleTiles.left = Math.max(0, playerX - 20);
        this._visibleTiles.right = Math.min(mapWidth, playerX + 20);
        this._visibleTiles.top = Math.max(0, playerY - 20);
        this._visibleTiles.bottom = Math.min(mapHeight, playerY + 20);
    };
    // 新增：修正相机滚动逻辑，消除延迟抖动
    const _Game_Player_updateScroll = Game_Player.prototype.updateScroll;
    Game_Player.prototype.updateScroll = function(lastScrolledX, lastScrolledY) {
        // 禁用默认滚动逻辑（避免原始方向移动）
        // _Game_Player_updateScroll.call(this, lastScrolledX, lastScrolledY);
        
        // 强制相机位置与玩家位置完全同步（无延迟）
        const tw = $gameMap.tileWidth();
        const th = $gameMap.tileHeight();
        const targetX = this.scrolledX() - (Graphics.width / 2) / tw;
        const targetY = this.scrolledY() - (Graphics.height / 2) / th;
        $gameMap.setDisplayPos(targetX, targetY);
    };
})();