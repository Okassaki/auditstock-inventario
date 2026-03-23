const { spawn } = require("child_process");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");

console.log("Building web app with expo export...");

const child = spawn(
  "pnpm",
  ["exec", "expo", "export", "--platform", "web"],
  {
    cwd: projectRoot,
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=512" },
    stdio: "inherit",
  }
);

child.on("exit", (code) => {
  if (code === 0) {
    console.log("Web build complete! Output: dist/");
  } else {
    console.error("Web build failed with code:", code);
  }
  process.exit(code || 0);
});
