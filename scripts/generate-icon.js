/**
 * 生成 Antigravity Panel 扩展图标
 * 设计：A.P 字母 + 暗色按钮背景
 */
const { createCanvas } = require("canvas");
const fs = require("fs");
const path = require("path");

const SIZE = 128;
const canvas = createCanvas(SIZE, SIZE);
const ctx = canvas.getContext("2d");

// 辅助函数：圆角矩形
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// 最外层：VS Code 风格窗口边框
roundRect(0, 0, SIZE, SIZE, 8);
ctx.fillStyle = "#3c3c3c";
ctx.fill();

// 窗口边框高亮（顶部）
roundRect(0, 0, SIZE, SIZE, 8);
ctx.strokeStyle = "#505050";
ctx.lineWidth = 1;
ctx.stroke();

// 标题栏区域
roundRect(2, 2, SIZE - 4, 20, 6);
ctx.fillStyle = "#323232";
ctx.fill();

// 标题栏三个小圆点（窗口控制按钮）
const dotY = 12;
const dotR = 4;
// 红
ctx.beginPath();
ctx.arc(14, dotY, dotR, 0, Math.PI * 2);
ctx.fillStyle = "#ff5f56";
ctx.fill();
// 黄
ctx.beginPath();
ctx.arc(26, dotY, dotR, 0, Math.PI * 2);
ctx.fillStyle = "#ffbd2e";
ctx.fill();
// 绿
ctx.beginPath();
ctx.arc(38, dotY, dotR, 0, Math.PI * 2);
ctx.fillStyle = "#27ca40";
ctx.fill();

// 内容区域：深海军蓝背景
roundRect(2, 22, SIZE - 4, SIZE - 24, 0);
ctx.fillStyle = "#0a1628";
ctx.fill();
// 底部圆角
roundRect(2, SIZE - 10, SIZE - 4, 8, 6);
ctx.fillStyle = "#0a1628";
ctx.fill();

// "A.P" 文字（居中在内容区）
const contentCenterY = 22 + (SIZE - 24) / 2;
ctx.font = "bold 48px 'Segoe UI', Arial, sans-serif";
ctx.textAlign = "center";
ctx.textBaseline = "middle";
ctx.fillStyle = "#e8e8e8";
ctx.fillText("A.P", SIZE / 2, contentCenterY);

// 保存文件
const outputPath = path.resolve(__dirname, "..", "assets", "icon.png");
const buffer = canvas.toBuffer("image/png");
fs.writeFileSync(outputPath, buffer);

console.log(`✅ 图标已生成: ${outputPath}`);
console.log(`   尺寸: ${SIZE}x${SIZE} 像素`);

