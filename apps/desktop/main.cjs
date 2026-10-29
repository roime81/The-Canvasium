const { app, BrowserWindow, dialog } = require("electron");
const { spawn } = require("node:child_process");
const { existsSync, readFileSync } = require("node:fs");
const path = require("node:path");

const port = 3040;
const host = "127.0.0.1";
const services = [];

function resourcePath(...parts) {
  return path.join(app.isPackaged ? process.resourcesPath : path.join(__dirname, "../../dist/desktop"), ...parts);
}

function startService(script, environment) {
  const child = spawn(process.execPath, [script], {
    env: { ...process.env, ...environment, ELECTRON_RUN_AS_NODE: "1" },
    cwd: path.dirname(script),
    stdio: "ignore",
  });
  services.push(child);
  return child;
}

function desktopEnvironment(dataDirectory) {
  const configPath = path.join(dataDirectory, ".env");
  if (!existsSync(configPath)) return {};
  return Object.fromEntries(
    readFileSync(configPath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const [key, ...value] = line.split("=");
        return [key.trim(), value.join("=").trim()];
      }),
  );
}

async function waitForCanvasium() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://${host}:${port}/api/canvas`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Canvasium desktop services did not start.");
}

async function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#ffffff",
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  await window.loadURL(`http://${host}:${port}`);
}

app.whenReady().then(async () => {
  try {
    const webServer = resourcePath("web", "apps", "web", "server.js");
    const backendServer = resourcePath("backend", "dist", "index.cjs");
    if (!existsSync(webServer) || !existsSync(backendServer)) {
      throw new Error("Desktop application resources are missing.");
    }
    const dataDirectory = app.getPath("userData");
    const userConfiguration = desktopEnvironment(dataDirectory);
    startService(backendServer, {
      ...userConfiguration,
      BACKEND_HOST: host,
      BACKEND_PORT: "3001",
      CANVASIUM_DESKTOP: "1",
    });
    startService(webServer, {
      ...userConfiguration,
      HOSTNAME: host,
      PORT: String(port),
      BACKEND_URL: "http://127.0.0.1:3001",
      CANVASIUM_DESKTOP: "1",
      CANVASIUM_DATA_DIR: dataDirectory,
    });
    await waitForCanvasium();
    await createWindow();
  } catch (error) {
    await dialog.showMessageBox({
      type: "error",
      title: "The Canvasium could not start",
      message: error instanceof Error ? error.message : "Unknown startup error.",
    });
    app.quit();
  }
});

app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => services.forEach((service) => service.kill()));
