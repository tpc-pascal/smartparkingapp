const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function applyPatches(file, edits) {
  const fp = path.join(root, file);
  if (!fs.existsSync(fp)) { console.log('[patch-skia] SKIP (not found):', file); return; }
  let content = fs.readFileSync(fp, 'utf8');
  let changed = false;
  for (const { search, replace } of edits) {
    if (content.includes(replace)) { continue; }
    const idx = content.indexOf(search);
    if (idx === -1) { console.log('[patch-skia] MISS:', file, '— pattern not found'); continue; }
    content = content.slice(0, idx) + replace + content.slice(idx + search.length);
    changed = true;
  }
  if (changed) {
    fs.writeFileSync(fp, content, 'utf8');
    console.log('[patch-skia] PATCHED:', file);
  } else {
    console.log('[patch-skia] OK (already patched):', file);
  }
}

// ── Camera.tsx (fix preview forced false when Skia FP active) ──────────────
const cameraPatches = [
  { search: 'isRenderingWithSkia ? false : (props.preview ?? true)', replace: 'isRenderingWithSkia ? (props.preview ?? false) : (props.preview ?? true)' },
  { search: 'isRenderingWithSkia ? false : props.preview ?? true', replace: 'isRenderingWithSkia ? (props.preview ?? false) : (props.preview ?? true)' },
];
applyPatches('node_modules/react-native-vision-camera/src/Camera.tsx', cameraPatches);
applyPatches('node_modules/react-native-vision-camera/lib/module/Camera.js', cameraPatches);
applyPatches('node_modules/react-native-vision-camera/lib/commonjs/Camera.js', cameraPatches);

// ── Source TSX ──────────────────────────────────────────────────────────────
applyPatches('node_modules/react-native-vision-camera/src/skia/SkiaCameraCanvas.tsx', [
  {
    search: `import React, { useCallback, useState } from 'react'\nimport type { LayoutChangeEvent, ViewProps } from 'react-native'`,
    replace: `import React, { useCallback, useState } from 'react'\nimport { View } from 'react-native'\nimport type { LayoutChangeEvent, ViewProps } from 'react-native'`,
  },
  {
    search: `  const [width, setWidth] = useState(0)\n  const [height, setHeight] = useState(0)`,
    replace: `  const [size, setSize] = useState({ width: 0, height: 0 })`,
  },
  {
    search: `    setWidth(Math.round(layout.width))\n    setHeight(Math.round(layout.height))`,
    replace: `    setSize({ width: Math.round(layout.width), height: Math.round(layout.height) })`,
  },
  {
    search: `  return (\n    <SkiaProxy.Canvas {...props} onLayout={onLayout} pointerEvents="none">\n      {children}\n      <SkiaProxy.Image x={0} y={0} width={width} height={height} fit={resizeMode} image={texture} />\n    </SkiaProxy.Canvas>\n  )`,
    replace: `  return (\n    <View onLayout={onLayout} style={{ flex: 1 }}>\n      <SkiaProxy.Canvas {...props} pointerEvents="none"\n        style={size.width > 0\n          ? Object.assign({}, props.style, { width: size.width, height: size.height })\n          : { flex: 1 }\n        }\n      >\n        {children}\n        {size.width > 0 && (\n          <SkiaProxy.Image x={0} y={0} width={size.width} height={size.height} fit={resizeMode} image={texture} />\n        )}\n      </SkiaProxy.Canvas>\n    </View>\n  )`,
  },
]);

// ── Module (ESM) ────────────────────────────────────────────────────────────
applyPatches('node_modules/react-native-vision-camera/lib/module/skia/SkiaCameraCanvas.js', [
  {
    search: `import React, { useCallback, useState } from 'react';`,
    replace: `import React, { useCallback, useState } from 'react';\nimport { View } from 'react-native';`,
  },
  {
    search: `  const [width, setWidth] = useState(0);\n  const [height, setHeight] = useState(0);`,
    replace: `  const [size, setSize] = useState({ width: 0, height: 0 });`,
  },
  {
    search: `    setWidth(Math.round(layout.width));\n    setHeight(Math.round(layout.height));`,
    replace: `    setSize({ width: Math.round(layout.width), height: Math.round(layout.height) });`,
  },
  {
    search: `  return React.createElement(SkiaProxy.Canvas, _extends({}, props, {\n    onLayout: onLayout,\n    pointerEvents: "none"\n  }), children, React.createElement(SkiaProxy.Image, {\n    x: 0, y: 0,\n    width: width,\n    height: height,\n    fit: resizeMode,\n    image: texture\n  }));`,
    replace: `  return React.createElement(View, { onLayout: onLayout, style: { flex: 1 } },\n    React.createElement(SkiaProxy.Canvas, _extends({}, props, {\n      style: size.width > 0\n        ? Object.assign({}, props.style, { width: size.width, height: size.height })\n        : { flex: 1 },\n      pointerEvents: "none"\n    }), children, size.width > 0 && React.createElement(SkiaProxy.Image, {\n      x: 0, y: 0,\n      width: size.width,\n      height: size.height,\n      fit: resizeMode,\n      image: texture\n    })));`,
  },
]);

// ── CommonJS ────────────────────────────────────────────────────────────────
applyPatches('node_modules/react-native-vision-camera/lib/commonjs/skia/SkiaCameraCanvas.js', [
  {
    search: `var _react = _interopRequireWildcard(require("react"));`,
    replace: `var _react = _interopRequireWildcard(require("react"));\nvar _reactNative = require("react-native");`,
  },
  {
    search: `  const [width, setWidth] = (0, _react.useState)(0);\n  const [height, setHeight] = (0, _react.useState)(0);`,
    replace: `  const [size, setSize] = (0, _react.useState)({ width: 0, height: 0 });`,
  },
  {
    search: `    setWidth(Math.round(layout.width));\n    setHeight(Math.round(layout.height));`,
    replace: `    setSize({ width: Math.round(layout.width), height: Math.round(layout.height) });`,
  },
  {
    search: `  return _react.default.createElement(_SkiaProxy.SkiaProxy.Canvas, _extends({}, props, {\n    onLayout: onLayout,\n    pointerEvents: "none"\n  }), children, _react.default.createElement(_SkiaProxy.SkiaProxy.Image, {\n    x: 0, y: 0,\n    width: width,\n    height: height,\n    fit: resizeMode,\n    image: texture\n  }));`,
    replace: `  return _react.default.createElement(_reactNative.View, { onLayout: onLayout, style: { flex: 1 } },\n    _react.default.createElement(_SkiaProxy.SkiaProxy.Canvas, _extends({}, props, {\n      style: size.width > 0\n        ? Object.assign({}, props.style, { width: size.width, height: size.height })\n        : { flex: 1 },\n      pointerEvents: "none"\n    }), children, size.width > 0 && _react.default.createElement(_SkiaProxy.SkiaProxy.Image, {\n      x: 0, y: 0,\n      width: size.width,\n      height: size.height,\n      fit: resizeMode,\n      image: texture\n    })));`,
  },
]);
