// In-browser LLM via WebLLM (WebGPU). Weights download once, then load from the browser cache.
const WEBLLM_URL = "https://esm.run/@mlc-ai/web-llm@0.2.79";

// Edit this list. IDs must exist in WebLLM's prebuilt model list (unavailable ones are hidden automatically).
const MODELS = [
  {id:"SmolLM2-360M-Instruct-q4f16_1-MLC", label:"SmolLM2 360M (fast, basic, ~0.4 GB)"},
  {id:"Llama-3.2-1B-Instruct-q4f16_1-MLC", label:"Llama 3.2 1B (light, ~0.9 GB)"},
  {id:"Qwen2.5-1.5B-Instruct-q4f16_1-MLC", label:"Qwen 2.5 1.5B (balanced, ~1.1 GB)"},
  {id:"Llama-3.2-3B-Instruct-q4f16_1-MLC", label:"Llama 3.2 3B (better reasoning, ~2.3 GB)"},
  {id:"Phi-3.5-mini-instruct-q4f16_1-MLC", label:"Phi 3.5 mini 3.8B (strongest here, ~3.7 GB)"}
];
const PROMPTS = [
  "Structure a portfolio for 60% BTC, 30% ETH, 10% cash with a 20% max drawdown.",
  "Explain a cash-and-carry trade and its main risks.",
  "How should I hedge spot holdings with perpetual futures?",
  "What does persistently high funding imply for positioning?"
];
const SYSTEM = `You are the PerpPerspective assistant, helping investors think through crypto derivatives trade ideas and portfolio structure.
Rules:
- Lead with risk: position sizing, leverage, liquidation distance, funding costs, basis risk, counterparty and exchange risk.
- Ask for missing constraints (capital, horizon, risk tolerance, venue) before giving specifics. If the user already gave them, use them.
- Present ideas as scenarios with entry logic, invalidation level, and what would make you wrong. Give ranges, not certainties.
- Never promise returns or predict prices. You do not have live market data; say so and ask the user for current prices, funding and basis when needed.
- Be concise and structured. End substantive answers with one line: educational discussion, not financial advice.`;

const $ = id => document.getElementById(id);
const sel = $("m-select"), loadBtn = $("m-load"), delBtn = $("m-del"), status = $("m-status");
const bar = document.querySelector(".bar"), barFill = $("m-bar"), log = $("log");
const msg = $("msg"), sendBtn = $("send"), stopBtn = $("stop");

let webllm, engine, loadedId = null, busy = false;
let history = [];

function add(cls, text){
  const d = document.createElement("div");
  d.className = "msg " + cls; d.textContent = text;
  log.appendChild(d); log.scrollTop = log.scrollHeight; return d;
}
function setReady(on){ msg.disabled = sendBtn.disabled = !on; }

PROMPTS.forEach(p => {
  const b = document.createElement("button"); b.type = "button"; b.textContent = p;
  b.onclick = () => { msg.value = p; msg.focus(); };
  $("chips").appendChild(b);
});
add("note", "Load a model to start. Ideas here are for discussion, not advice.");

MODELS.forEach(m => sel.add(new Option(m.label, m.id)));

async function init(){
  if (!("gpu" in navigator)) {
    status.textContent = "This browser has no WebGPU support. Try recent Chrome, Edge or Safari on a desktop or recent phone.";
    loadBtn.disabled = true; sel.disabled = true; return;
  }
  try {
    webllm = await import(WEBLLM_URL);
    const avail = new Set(webllm.prebuiltAppConfig.model_list.map(m => m.model_id));
    [...sel.options].forEach(o => { if (!avail.has(o.value)) o.remove(); });
    if (!sel.options.length) { status.textContent = "None of the configured models are available in this WebLLM version. Update MODELS in chat.js."; loadBtn.disabled = true; return; }
    await refreshCacheState();
  } catch (e) {
    status.textContent = "Could not load the WebLLM library. Check your connection and try again.";
    loadBtn.disabled = true; console.error(e);
  }
}

async function refreshCacheState(){
  const cached = await webllm.hasModelInCache(sel.value).catch(() => false);
  loadBtn.textContent = cached ? "Load from cache" : "Download and load";
  delBtn.hidden = !cached;
  status.textContent = cached ? "Already downloaded on this device." : "Not downloaded yet. The first load downloads the weights once.";
}
sel.addEventListener("change", () => webllm && !busy && refreshCacheState());

loadBtn.addEventListener("click", async () => {
  if (busy) return;
  busy = true; setReady(false); loadBtn.disabled = sel.disabled = true; bar.hidden = false; barFill.style.width = "0";
  try {
    if (!engine) engine = new webllm.MLCEngine();
    engine.setInitProgressCallback(p => {
      barFill.style.width = Math.round(p.progress * 100) + "%";
      status.textContent = p.text;
    });
    await engine.reload(sel.value);
    loadedId = sel.value; history = [];
    status.textContent = "Loaded: " + sel.selectedOptions[0].text + ". Running on your device.";
    add("note", "Model ready. Ask away.");
    setReady(true); msg.focus();
  } catch (e) {
    status.textContent = "Load failed: " + (e.message || e) + ". Try a smaller model or free up memory.";
    console.error(e);
  } finally {
    busy = false; loadBtn.disabled = sel.disabled = false; bar.hidden = true;
    refreshCacheState().then(() => { if (loadedId) status.textContent = "Loaded: " + sel.selectedOptions[0].text + "."; });
  }
});

delBtn.addEventListener("click", async () => {
  if (!confirm("Delete the cached download for this model?")) return;
  if (loadedId === sel.value) { await engine.unload(); loadedId = null; setReady(false); }
  await webllm.deleteModelAllInfoInCache(sel.value);
  refreshCacheState();
});

async function send(){
  const text = msg.value.trim();
  if (!text || busy || !loadedId) return;
  busy = true; msg.value = ""; setReady(false); sendBtn.hidden = true; stopBtn.hidden = false;
  add("user", text); history.push({role:"user", content:text});
  const ctx = $("m-ctx").value.trim();
  const system = SYSTEM + (ctx ? "\n\nUser's portfolio and constraints:\n" + ctx : "");
  const out = add("bot", "…"); let reply = "";
  try {
    const stream = await engine.chat.completions.create({
      messages: [{role:"system", content:system}, ...history.slice(-12)],
      stream: true, temperature: 0.6, max_tokens: 700
    });
    for await (const chunk of stream) {
      reply += chunk.choices[0]?.delta?.content || "";
      out.textContent = reply || "…"; log.scrollTop = log.scrollHeight;
    }
  } catch (e) {
    if (!reply) out.textContent = "Something went wrong generating a reply. Try again, or load a smaller model.";
    console.error(e);
  }
  if (reply) history.push({role:"assistant", content:reply});
  busy = false; sendBtn.hidden = false; stopBtn.hidden = true; setReady(true); msg.focus();
}
sendBtn.addEventListener("click", send);
stopBtn.addEventListener("click", () => engine && engine.interruptGenerate());
msg.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });

init();
