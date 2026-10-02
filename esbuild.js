/**
 * esbuild build configuration
 *
 * Three entry points:
 * - Extension: Node.js CJS format
 * - Webview JS: browser ESM format (Lit components)
 * - Webview CSS: bundles the modular CSS files
 */

const esbuild = require("esbuild");
const path = require("path");
const fs = require("fs");

const isWatch = process.argv.includes("--watch");
const enableSourcemap = process.argv.includes("--sourcemap");

async function run() {
  // Extension build (VS Code Node.js environment)
  const extensionContext = await esbuild.context({
    entryPoints: [path.resolve(__dirname, "src", "extension.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: path.resolve(__dirname, "dist", "extension.js"),
    sourcemap: enableSourcemap ? "inline" : false,
    minify: !isWatch,
    external: ["vscode"],
    logLevel: "info",
    // Exclude the webview directory so browser code is not pulled into the Node.js bundle
    plugins: [{
      name: "exclude-webview",
      setup(build) {
        build.onResolve({ filter: /\/webview\// }, (args) => {
          // Type definition modules may still be bundled
          if (args.path.endsWith("/types") || args.path.endsWith("/types.js") || args.path.endsWith("/types.ts")) {
            return null; // continue with normal bundling
          }
          return { external: true };
        });
      }
    }]
  });

  // Webview JS build (browser ESM environment)
  const webviewContext = await esbuild.context({
    entryPoints: [path.resolve(__dirname, "src", "view", "webview", "index.ts")],
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

  // Webview CSS build (bundles the modular CSS)
  const cssContext = await esbuild.context({
    entryPoints: [path.resolve(__dirname, "src", "view", "webview.css")],
    bundle: true,
    outfile: path.resolve(__dirname, "dist", "webview.css"),
    logLevel: "info",
    minify: !isWatch,
  });

  console.log("Building Extension, Webview JS, and Webview CSS...");

  // Ensure dist directory exists
  const distDir = path.resolve(__dirname, "dist");
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir);
  }

  if (isWatch) {
    console.log("Watch mode enabled");
    await Promise.all([
      extensionContext.watch(),
      webviewContext.watch(),
      cssContext.watch(),
    ]);
    console.log("Watching for changes...");
  } else {
    await Promise.all([
      extensionContext.rebuild(),
      webviewContext.rebuild(),
      cssContext.rebuild(),
    ]);
    console.log("Build completed successfully!");
    await extensionContext.dispose();
    await webviewContext.dispose();
    await cssContext.dispose();
  }
}

run().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
