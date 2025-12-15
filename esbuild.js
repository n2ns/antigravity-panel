/**
 * esbuild 构建配置
 *
 * 双入口构建：
 * - Extension: Node.js CJS 格式
 * - Webview: 浏览器 ESM 格式 (Lit 组件)
 */

const esbuild = require("esbuild");
const path = require("path");
const fs = require("fs");

const isWatch = process.argv.includes("--watch");
const enableSourcemap = process.argv.includes("--sourcemap");

async function run() {
  // Extension 构建配置 (VS Code Node.js 环境)
  const extensionContext = await esbuild.context({
    entryPoints: [path.resolve(__dirname, "src", "extension.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: path.resolve(__dirname, "dist", "extension.js"),
    sourcemap: enableSourcemap ? "inline" : false,
    external: ["vscode"],
    logLevel: "info",
    // 排除 webview 目录，避免 Node.js 环境导入浏览器代码
    plugins: [{
      name: "exclude-webview",
      setup(build) {
        build.onResolve({ filter: /\/webview\// }, (args) => {
          // 允许打包类型定义文件
          if (args.path.endsWith("/types") || args.path.endsWith("/types.js") || args.path.endsWith("/types.ts")) {
            return null; // 继续正常的打包流程
          }
          return { external: true };
        });
      }
    }]
  });

  // Webview 构建配置 (浏览器 ESM 环境)
  const webviewContext = await esbuild.context({
    entryPoints: [path.resolve(__dirname, "src", "ui", "webview", "index.ts")],
    bundle: true,
    platform: "browser",
    format: "esm",
    outfile: path.resolve(__dirname, "dist", "webview.js"),
    sourcemap: enableSourcemap ? "inline" : false,
    target: ["chrome100", "safari15", "firefox100"],
    logLevel: "info",
    minify: !isWatch,
    define: {
      "process.env.NODE_ENV": isWatch ? '"development"' : '"production"',
    },
  });

  console.log("Building Extension and Webview...");

  // Ensure dist directory exists
  const distDir = path.resolve(__dirname, "dist");
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir);
  }

  // Copy CSS file to dist directory
  const srcCss = path.resolve(__dirname, "src", "ui", "webview.css");
  const distCss = path.resolve(__dirname, "dist", "webview.css");
  fs.copyFileSync(srcCss, distCss);
  console.log("Copied webview.css to dist/");

  if (isWatch) {
    console.log("Watch mode enabled");
    await Promise.all([
      extensionContext.watch(),
      webviewContext.watch(),
    ]);
    console.log("Watching for changes...");
  } else {
    await Promise.all([
      extensionContext.rebuild(),
      webviewContext.rebuild(),
    ]);
    console.log("Build completed successfully!");
    await extensionContext.dispose();
    await webviewContext.dispose();
  }
}

run().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
