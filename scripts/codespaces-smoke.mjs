const webUrl = process.env.CANVASIUM_WEB_URL ?? "http://127.0.0.1:3000";
const backendUrl = process.env.CANVASIUM_BACKEND_URL ?? "http://127.0.0.1:3001";
const deadline = Date.now() + 30_000;

async function waitFor(url) {
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return response;
      lastError = new Error(`${url} returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError instanceof Error ? lastError.message : lastError}`);
}

const page = await waitFor(webUrl);
const html = await page.text();
if (!html.includes("<title>The Canvasium</title>")) {
  throw new Error("The frontend responded, but the Canvasium page title was missing.");
}
console.log(`Frontend ready at ${webUrl}`);

const health = await waitFor(`${backendUrl}/health`);
const healthBody = await health.json();
if (healthBody.status !== "ok") throw new Error("Backend health check did not return status=ok.");
console.log(`Backend ready at ${backendUrl}`);

const response = await fetch(`${webUrl}/api/plan`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-canvasium-offline": "true",
  },
  body: JSON.stringify({ prompt: "Build a sales dashboard" }),
  signal: AbortSignal.timeout(10_000),
});
if (!response.ok) throw new Error(`Prompt API returned HTTP ${response.status}.`);
const result = await response.json();
if (result.generatedBy !== "starter-planner" || result.plan?.activeLayoutMode !== "dashboard") {
  throw new Error("Prompt API did not return the expected offline dashboard plan.");
}
console.log("Prompt API and Next.js proxy passed (offline dashboard plan).");

const invalid = await fetch(`${webUrl}/api/plan`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ prompt: "" }),
  signal: AbortSignal.timeout(10_000),
});
if (invalid.status !== 400) throw new Error(`Invalid prompt should return HTTP 400, got ${invalid.status}.`);
console.log("Invalid-prompt validation passed.");
