/* MeGPT v5 - client-only chat UI using WebLLM (browser models)
   - Saves conversations to localStorage
   - New chat / rename / delete
   - System prompt and model selection
   - Typing animation + "thinking" behavior
   NOTE: WebLLM model names and availability depend on the CDN/provider.
*/

const STORAGE_KEY = "megpt_v5_data_v1";

let state = {
  threads: {},      // id -> { name, messages: [{role, text, ts}] }
  current: null,
  settings: { model: "llama-3.1-8B-Instruct-q4f32_1-MLC", systemPrompt: "You are MeGPT — helpful, concise, and friendly. Answer clearly and safely.", theme: "light" }
};

// ui elements
const threadsEl = document.getElementById("threads");
const newChatBtn = document.getElementById("newChatBtn");
const modelSelect = document.getElementById("modelSelect");
const systemPromptEl = document.getElementById("systemPrompt");
const chatArea = document.getElementById("chatArea");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("sendBtn");
const typingIndicator = document.getElementById("typingIndicator");
const chatTitle = document.getElementById("chatTitle");
const chatSubtitle = document.getElementById("chatSubtitle");
const toggleTheme = document.getElementById("toggleTheme");
const exportBtn = document.getElementById("exportBtn");
const importBtn = document.getElementById("importBtn");
const clearBtn = document.getElementById("clearBtn");
const copyBtn = document.getElementById("copyBtn");

// init web-llm engine
let engine = null;
async function initEngine(modelName) {
  try {
    if (!window.webllm || !window.webllm.MLCEngine) {
      console.warn("web-llm not available in this environment.");
      return;
    }
    engine = new window.webllm.MLCEngine();
    // Attempt to load the model name provided by settings
    await engine.reload(modelName);
    console.log("Model loaded:", modelName);
  } catch (err) {
    console.error("Engine init error:", err);
  }
}

// storage helpers
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      state = JSON.parse(raw);
    } catch (e) { /* ignore */ }
  } else {
    // bootstrap with one welcome chat
    const id = newThreadId();
    state.threads[id] = { name: "Welcome", messages: [{ role: "bot", text: "Hello 👋 — I'm MeGPT. Click New Chat to start or type a message.", ts: Date.now() }] };
    state.current = id;
    saveState();
  }
}

// utils
function newThreadId(){ return "t_" + Date.now(); }
function formatTime(ts){ const d=new Date(ts); return d.toLocaleString(); }

// UI rendering
function renderThreads() {
  threadsEl.innerHTML = "";
  for (let id of Object.keys(state.threads).reverse()){
    const thread = state.threads[id];
    const div = document.createElement("div");
    div.className = "chat-item" + (state.current === id ? " active" : "");
    div.dataset.id = id;
    div.onclick = () => { state.current = id; saveState(); render(); };
    const title = document.createElement("div");
    title.className = "chat-title"; title.textContent = thread.name;
    const snippet = document.createElement("div");
    snippet.className = "chat-snippet";
    const last = thread.messages[thread.messages.length - 1];
    snippet.textContent = last ? (last.role === "user" ? "You: " : "MeGPT: ") + (last.text.slice(0,60)) : "Empty";
    div.appendChild(title); div.appendChild(snippet);
    threadsEl.appendChild(div);
  }
}

function renderChat() {
  chatArea.innerHTML = "";
  if (!state.current) return;
  const thread = state.threads[state.current];
  chatTitle.textContent = thread.name || "Chat";
  chatSubtitle.textContent = `Messages: ${thread.messages.length}`;
  for (let msg of thread.messages){
    const m = document.createElement("div");
    m.className = "msg " + (msg.role === "user" ? "user" : "bot");
    m.textContent = msg.text;
    chatArea.appendChild(m);
  }
  chatArea.scrollTop = chatArea.scrollHeight;
}

// create / manage threads
function createNewChat(name="New Chat"){
  const id = newThreadId();
  state.threads[id] = { name, messages: [] };
  state.current = id;
  saveState();
  render();
  // focus input
  inputEl.focus();
}
function clearCurrent(){
  if (!state.current) return;
  state.threads[state.current].messages = [];
  saveState();
  render();
}
function exportState(){
  const data = JSON.stringify(state, null, 2);
  const blob = new Blob([data], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "megpt_chats.json"; a.click();
  URL.revokeObjectURL(url);
}
function importState(file){
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const obj = JSON.parse(e.target.result);
      state = obj;
      saveState();
      render();
      alert("Imported successfully.");
    } catch(e){ alert("Invalid file."); }
  };
  reader.readAsText(file);
}

// messaging
async function sendMessage() {
  const text = inputEl.value.trim();
  if (!text) return;
  if (!state.current) createNewChat();
  // push user message
  const thread = state.threads[state.current];
  const userMsg = { role:"user", text, ts: Date.now() };
  thread.messages.push(userMsg);
  saveState();
  render();

  // show typing indicator
  showTyping(true);

  // add temporary bot "Thinking..." bubble
  const thinking = { role:"bot", text:"Thinking...", ts:Date.now() };
  thread.messages.push(thinking);
  saveState();
  render();

  // run model (web-llm) or fallback echo
  let replyText = "";
  try {
    if (engine && engine.chat && engine.chat.completions) {
      const sys = state.settings.systemPrompt || systemPromptEl.value;
      const messages = [{role:"system", content:sys}].concat(
        thread.messages
          .filter(m => m.role === "user" || m.role === "bot")
          .map(m => ({ role: m.role === "user" ? "user" : "assistant", content: m.text }))
      ).slice(-20); // keep short context

      const resp = await engine.chat.completions.create({ messages });
      replyText = resp.choices[0].message.content;
    } else {
      // fallback: simple canned behavior (safe)
      replyText = "I can't load a browser model here — but MeGPT is ready. Try this page in a modern browser, or load a supported web-llm model.";
    }
  } catch (err) {
    console.error(err);
    replyText = "Model error: " + (err.message || String(err));
  }

  // replace thinking bubble with real reply
  thread.messages.pop();
  thread.messages.push({ role:"bot", text: replyText, ts: Date.now() });
  saveState();

  showTyping(false);
  render();
}

// typing UI
function showTyping(on){
  typingIndicator.classList.toggle("hidden", !on);
}

// init & events
function render(){
  renderThreads();
  renderChat();
  modelSelect.value = state.settings.model;
  systemPromptEl.value = state.settings.systemPrompt;
  document.getElementById("app").className = state.settings.theme || "light";
}

newChatBtn.onclick = () => createNewChat("Chat " + (Object.keys(state.threads).length + 1));
sendBtn.onclick = sendMessage;
inputEl.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } };
modelSelect.onchange = async (e) => {
  state.settings.model = e.target.value;
  saveState();
  // reload engine with new model
  await initEngine(e.target.value);
};
systemPromptEl.onchange = (e) => { state.settings.systemPrompt = e.target.value; saveState(); };
toggleTheme.onclick = () => {
  state.settings.theme = state.settings.theme === "dark" ? "light" : "dark";
  render();
  saveState();
};
exportBtn.onclick = exportState;
importBtn.onclick = () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json";
  input.onchange = () => importState(input.files[0]);
  input.click();
};
clearBtn.onclick = () => { if (confirm("Clear this conversation?")) { clearCurrent(); } };
copyBtn.onclick = () => {
  if (!state.current) return;
  const t = state.threads[state.current];
  const text = t.messages.map(m => `${m.role === "user" ? "You" : "MeGPT"}: ${m.text}`).join("\n\n");
  navigator.clipboard.writeText(text).then(()=> alert("Copied to clipboard."));
};

// init
loadState();
render();
initEngine(state.settings.model).catch(()=>console.warn("Engine may not be available in this environment."));