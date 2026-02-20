/*:
 * @target MZ
 * @plugindesc Paladin 48x48 Icon Support
 * @author AI Assistant
 *
 * @param IconSetFilename
 * @text Icon Set Filename
 * @desc The filename of the 48x48 icon set image (without extension) in img/system/
 * @default IconSet48
 *
 * @param IconSize
 * @text Icon Size
 * @desc The size of the icons in pixels (e.g., 48 for 48x48)
 * @type number
 * @default 48
 *
 * @help
 * This plugin changes the system icon size to the specified value (default 48x48).
 * Ideally, update your Database > System 1 > Icon Set to point to a dummy file
 * or the original IconSet, but place a file named "IconSet48.png" (or your
 * configured name) in the img/system/ folder.
 * 
 * The system requires the icon set to be 16 icons wide.
 * Width = 16 * IconSize (e.g., 16 * 48 = 768 pixels).
 */

(() => {
    const pluginName = "Pal_Icon48";
    const parameters = PluginManager.parameters(pluginName);
    const iconSetFilename = parameters["IconSetFilename"] || "IconSet48";
    const iconSize = Number(parameters["IconSize"] || 48);

    // Override ImageManager properties
    Object.defineProperty(ImageManager, "iconWidth", {
        get: function () { return iconSize; },
        configurable: true
    });

    Object.defineProperty(ImageManager, "iconHeight", {
        get: function () { return iconSize; },
        configurable: true
    });

    // Hook into loadSystem to redirect "IconSet" to our custom file
    const _ImageManager_loadSystem = ImageManager.loadSystem;
    ImageManager.loadSystem = function (filename) {
        if (filename === "IconSet") {
            return _ImageManager_loadSystem.call(this, iconSetFilename);
        }
        return _ImageManager_loadSystem.call(this, filename);
    };

    // Note: Window_Base.prototype.drawIcon automatically uses ImageManager.iconWidth/Height
    // so no override is needed there. It calculates:
    // sx = (iconIndex % 16) * pw;
    // sy = Math.floor(iconIndex / 16) * ph;
    // which is correct as long as the image is 16 icons wide (16 * 48 = 768px).

})();
