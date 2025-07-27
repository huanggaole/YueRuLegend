// 插件代码示例
(function() {
    // 重写标题窗口初始化，移除了选项菜单，仅保留新游戏和继续游戏选项。
    Window_TitleCommand.prototype.makeCommandList = function() {
        const continueEnabled = this.isContinueEnabled();
        this.addCommand(TextManager.newGame, "newGame");
        this.addCommand(TextManager.continue_, "continue", continueEnabled);
    };

    // 重写窗体行高（字变大）
    Window_Base.prototype.lineHeight = function() {
        return 52;
    };

    Window_Base.prototype.drawText = function(text, x, y, maxWidth, align) {
        // 先保存当前字体颜色
        const originalColor = this.contents.textColor;
        
        // 1. 绘制阴影（黑色，右下偏移）
        this.contents.textColor = '#000000';
        this.contents.drawText(text, x + 2, y + 2, maxWidth, this.lineHeight(), align);
        
        // 2. 绘制文字（白色，原始位置）
        this.contents.textColor = '#ffffff';
        this.contents.drawText(text, x, y, maxWidth, this.lineHeight(), align);
        
        // 恢复原始颜色
        this.contents.textColor = originalColor;
    };

    // 去除选项的背景
    Window_Selectable.prototype.drawItemBackground = function(index) {
        // const rect = this.itemRect(index);
        // this.drawBackgroundRect(rect);
    };

    /**
    // 更新呼吸效果方法
    Window_Selectable.prototype.updateBreathingEffect = function() {
        if (this.active && this.index() >= 0) {
            // 调整呼吸速度，数值越小变化越慢
            this._breathingIntensity += 0.5;
            if (this._breathingIntensity > Math.PI * 2) {
                this._breathingIntensity = 0;
            }
            this.redrawCurrentItem();
        }
    };

    // 仙剑98柔情版风格的呼吸颜色函数
    Window_Selectable.prototype.breathingTextColor = function() {
        // 使用正弦函数创建平滑的往返动画
        const intensity = (Math.sin(this._breathingIntensity) + 1) / 2;
        
        // 白色 (255, 255, 255) 与黄色 (231, 208, 96) 之间插值
        const r = Math.floor(231 + (255 - 231) * intensity);  // 231 -> 255
        const g = Math.floor(208 + (255 - 208) * intensity);  // 208 -> 255
        const b = Math.floor(96 + (255 - 96) * (1 - intensity)); // 96 -> 255 (反向变化创造黄色效果)
        
        return ColorManager.rgbToCssColor(r, g, b);
    };
    */
    // 重写绘制项目方法
    // 保存原始的update方法
    const _Window_Selectable_update = Window_Selectable.prototype.update;

    Window_Selectable.prototype.update = function(index) {
       // 先调用原始的update方法
        _Window_Selectable_update.call(this);
        
        // 只有当窗口可见且有项目时才执行
        if (this.visible && this.maxItems() > 0) {
            this.updateItemColors();
        }
    };

    // 新增方法：更新所有项目的颜色
    Window_Selectable.prototype.updateItemColors = function() {
        // 遍历所有项目
        for (let i = 0; i < this.maxItems(); i++) {
            // 保存当前文字颜色
            const originalColor = this.contents.textColor;
            
            // 根据选中状态设置颜色
            this.contents.textColor = (i==this.index()) ? '#E7D060' : '#ffffff';
            
            // 重绘当前项目
            this.redrawItem(i);
            
            // 恢复原始颜色
            this.contents.textColor = originalColor;
        }
    };

    // 10阶颜色数组：从最暗(0)到最亮(5)再到最暗(9)
    const selectedColors = [
        '#d6ad4e', // 0: 最暗(214,173,78)
        '#d9b45a',
        '#e0c066',
        '#e7cc72',
        '#edda7e',
        '#f3e472', // 5: 最亮(243,228,114)
        '#edda7e',
        '#e7cc72',
        '#e0c066',
        '#d9b45a'
    ];
    Window_TitleCommand.prototype.redrawItem = function(index) {
        // console.log(this);
        // 清除当前项目区域的绘制内容
        const rect = this.itemRect(index);
        this.contents.clearRect(rect.x, rect.y, rect.width, rect.height);
        // 先保存当前字体颜色
        const originalColor = this.contents.textColor;
        
        // 1. 绘制阴影（黑色，右下偏移）
        this.contents.textColor = '#000000';
        this.contents.drawText(this._list[index].name, rect.x + 3, rect.y + 3, rect.width, this.lineHeight());
        
        // 2. 绘制文字（白色，原始位置）
        this.contents.textColor = (index == this.index())?selectedColors[Math.floor(new Date().getMilliseconds() / 100) % 10]:'#ffffff';
        this.contents.drawText(this._list[index].name, rect.x, rect.y, rect.width, this.lineHeight());
        
        // 恢复原始颜色
        this.contents.textColor = originalColor;
        
    };
})();