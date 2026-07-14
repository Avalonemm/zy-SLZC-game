import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(import.meta.dirname, "..");
const mode = process.argv.includes("--release") ? "release" : "quick";
const browserOnly = process.argv.includes("--browser-only");
const uiModeArgument = process.argv.find((argument) => argument.startsWith("--ui="))?.slice(5);
const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const outputDir = join(root, "output", "regression", timestamp);
const screenshotDir = join(outputDir, "screenshots");
const serverUrl = "http://127.0.0.1:3100";
const appUrl = "http://127.0.0.1:5174";
const chromePort = 9341;
const commandResults = [];
const gitCommit = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).stdout?.trim() || "unknown";
const childProcesses = [];
let launchedChrome = null;

mkdirSync(screenshotDir, { recursive: true });

try {
  if (!browserOnly) {
    run("server tests", "npm.cmd", ["test", "--workspace", "server"]);
    run("production build", "npm.cmd", ["run", "build"]);
  }
  const art = browserOnly
    ? { ok: false }
    : run("art assets", "npm.cmd", ["run", "verify:art", "--", "--strict"], { allowFailure: true });
  if (mode === "release" && !browserOnly) {
    run("server restart recovery", "npm.cmd", ["run", "smoke:restart"], { timeoutMs: 120_000 });
  }

  await startQaServices();
  if (!browserOnly) {
    run("formal four-player flow", "node", ["scripts/smoke-local-game-flow.mjs"], {
      timeoutMs: 90_000,
      env: { SERVER_URL: serverUrl }
    });
  }
  await ensureHeadlessChrome();

  const defaultUiModes = mode === "release"
    ? ["full", "opening", "role-call", "scoring", "build-animation", "roles", "opponents", "targeting", "skills", "skill-thief", "role-effects", "card-inspector", "utility-menu", "ui-tuning", "action-feedback", "extreme-layout"]
    : ["dense", "action-feedback", "extreme-layout"];
  const uiModes = uiModeArgument || process.env.ZY_REGRESSION_UI_MODES
    ? (uiModeArgument ?? process.env.ZY_REGRESSION_UI_MODES).split(",").map((value) => value.trim()).filter(Boolean)
    : defaultUiModes;

  for (const uiMode of uiModes) {
    const viewports = uiMode === "utility-menu"
      ? "1296x776,1893x881"
      : uiMode === "extreme-layout"
        ? "768x600,778x638,1024x640,1262x827,1365x668,1893x881"
      : ["role-call", "scoring"].includes(uiMode)
        ? "768x600,778x638,1024x640,1262x827,1365x668,1893x881"
      : ["roles", "opponents", "skills", "skill-thief", "role-effects"].includes(uiMode)
        ? "768x600,778x638,1024x640,1262x827,1365x668,1893x881"
      : ["opening", "build-animation"].includes(uiMode)
        ? "1893x881,1365x668,1262x827"
      : mode === "release" && ["roles", "targeting", "skills", "skill-thief", "role-effects"].includes(uiMode)
        ? "1262x827"
        : "1893x881,1365x668";
    run(`browser ${uiMode}`, "node", ["scripts/verify-game-ui-layout.mjs"], {
      allowFailure: true,
      timeoutMs: mode === "release" || ["opening", "opponents", "extreme-layout", "role-effects", "role-call", "scoring"].includes(uiMode)
        ? 300_000
        : 180_000,
      env: {
        APP_URL: appUrl,
        SERVER_URL: serverUrl,
        CHROME_PORT: String(chromePort),
        UI_QA_MODE: uiMode,
        UI_QA_VIEWPORTS: viewports,
        UI_QA_SCREENSHOT_DIR: screenshotDir
      }
    });
  }

  const functionalOk = commandResults
    .filter((result) => result.name !== "art assets")
    .every((result) => result.ok);
  const releaseReady = functionalOk && art.ok;
  writeReports({ functionalOk, releaseReady, artOk: art.ok });
  if (!functionalOk) process.exitCode = 1;
} catch (error) {
  commandResults.push({ name: "regression runner", ok: false, output: String(error?.stack || error) });
  writeReports({ functionalOk: false, releaseReady: false, artOk: false });
  process.exitCode = 1;
} finally {
  for (const child of childProcesses.reverse()) stopProcessTree(child);
  stopProcessTree(launchedChrome);
}

process.exit(process.exitCode ?? 0);

function stopProcessTree(child) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      windowsHide: true,
      stdio: "ignore"
    });
    child.unref();
    return;
  }
  child.kill("SIGTERM");
  child.unref();
}

function run(name, command, args, options = {}) {
  console.log(`[regression] ${name}...`);
  const startedAt = Date.now();
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    shell: process.platform === "win32" && command.endsWith(".cmd"),
    timeout: options.timeoutMs,
    env: { ...process.env, ...options.env }
  });
  const output = `${result.stdout || ""}${result.stderr || ""}${result.error ? `\n${result.error.stack || result.error}` : ""}`.trim();
  const entry = {
    name,
    ok: result.status === 0,
    exitCode: result.status,
    durationMs: Date.now() - startedAt,
    output
  };
  commandResults.push(entry);
  console.log(`[regression] ${name}: ${entry.ok ? "passed" : "failed"} (${(entry.durationMs / 1000).toFixed(1)}s)`);
  if (!entry.ok && !options.allowFailure) {
    throw new Error(`${name} failed\n${output}`);
  }
  return entry;
}

async function startQaServices() {
  const serviceOutput = [];
  const commonEnv = {
    ...process.env,
    PORT: "3100",
    CLIENT_ORIGIN: appUrl,
    ZY_ENABLE_SMALL_TEST_ROOMS: "1",
    ZY_ENABLE_UI_QA: "1",
    ROOM_SNAPSHOT_PATH: join(tmpdir(), `zy-regression-${timestamp}.json`)
  };
  const server = spawn("npm.cmd", ["run", "dev", "--workspace", "server"], {
    cwd: root,
    env: commonEnv,
    windowsHide: true,
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"]
  });
  const client = spawn("npm.cmd", ["run", "dev", "--workspace", "client", "--", "--port", "5174", "--strictPort", "--force"], {
    cwd: root,
    env: { ...commonEnv, VITE_SERVER_URL: serverUrl },
    windowsHide: true,
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"]
  });
  for (const [name, child] of [["server", server], ["client", client]]) {
    child.stdout?.on("data", (chunk) => serviceOutput.push(`[${name}] ${chunk}`));
    child.stderr?.on("data", (chunk) => serviceOutput.push(`[${name}] ${chunk}`));
  }
  childProcesses.push(server, client);
  try {
    await waitForUrl(`${serverUrl}/health`, 20_000);
    await waitForUrl(appUrl, 20_000);
  } catch (error) {
    throw new Error(`${error.message}\n${serviceOutput.join("").slice(-6000)}`);
  }
}

async function ensureHeadlessChrome() {
  try {
    await waitForUrl(`http://127.0.0.1:${chromePort}/json/version`, 1_000);
    return;
  } catch {
    // Start a dedicated background browser below.
  }
  const chromePath = findChrome();
  if (!chromePath) throw new Error("Cannot find Chrome or Edge for browser regression checks.");
  const profileDir = join(tmpdir(), `zy-regression-chrome-${timestamp}`);
  launchedChrome = spawn(chromePath, [
    "--headless=new",
    `--remote-debugging-port=${chromePort}`,
    `--user-data-dir=${profileDir}`,
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank"
  ], { windowsHide: true, stdio: "ignore" });
  await waitForUrl(`http://127.0.0.1:${chromePort}/json/version`, 10_000);
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate));
}

async function waitForUrl(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Service is still starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function writeReports(summary) {
  mkdirSync(outputDir, { recursive: true });
  const report = {
    generatedAt: new Date().toISOString(),
    gitCommit,
    mode,
    ...summary,
    commands: commandResults
  };
  writeFileSync(join(outputDir, "report.json"), JSON.stringify(report, null, 2));
  const rows = commandResults.map((result) =>
    `| ${result.ok ? "通过" : "失败"} | ${result.name} | ${(result.durationMs / 1000).toFixed(1)} 秒 |`
  ).join("\n");
  const failures = commandResults.filter((result) => !result.ok);
  const failureDetails = failures.length === 0
    ? "无。"
    : failures.map((result) => `### ${result.name}\n\n\`\`\`text\n${result.output.slice(-6000)}\n\`\`\``).join("\n\n");
  const markdown = `# 富饶之城回归报告\n\n- 生成时间：${report.generatedAt}\n- 提交：${gitCommit}\n- 模式：${mode}\n- 功能回归：${summary.functionalOk ? "通过" : "失败"}\n- 正式美术：${summary.artOk ? "完整" : "未完整（不影响功能回归，但阻止 1.0.0）"}\n- 1.0.0 发布条件：${summary.releaseReady ? "满足" : "未满足"}\n\n## 检查结果\n\n| 状态 | 检查 | 用时 |\n|---|---|---:|\n${rows}\n\n## 失败详情\n\n${failureDetails}\n\n## 截图\n\n浏览器验收截图位于：\`${screenshotDir}\`。\n`;
  writeFileSync(join(outputDir, "report.md"), markdown);
  console.log(JSON.stringify({ reportDir: outputDir, ...summary }, null, 2));
}
