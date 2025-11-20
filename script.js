let chatBox = document.getElementById("chat");
let threadsBox = document.getElementById("threads");
let currentThread = null;

const engine = new window.webllm.MLCEngine();
engine.reload("Llama-3.1-8B-Instruct-q4f32_1-MLC");

// ========== DARK MODE ==========
function toggleDarkMode() {
    document.body.classList.toggle("dark");
    localStorage.setItem("dark", document.body.classList.contains("dark"));
}

if (localStorage.getItem("dark") === "true") {
    document.body.classList.add("dark");
}

// ========== THREAD SYSTEM ==========
function loadThreads() {
    threadsBox.innerHTML = "";

    let threads = JSON.parse(localStorage.getItem("threads") || "{}");
    for (let id in threads) {
        let div = document.createElement("div");
        div.textContent = threads[id].name;
        div.onclick = () => openThread(id);
        threadsBox.appendChild(div);
    }
}

function newChat() {
    let id = "thread_" + Date.now();
    let threads = JSON.parse(localStorage.getItem("threads") || "{}");

    threads[id] = { name: "New Chat", messages: [] };
    localStorage.setItem("threads", JSON.stringify(threads));

    openThread(id);
}

function openThread(id) {
    currentThread = id;
    chatBox.innerHTML = "";

    let threads = JSON.parse(localStorage.getItem("threads"));
    let messages = threads[id].messages;

    for (let m of messages) {
        addBubble(m.role, m.text);
    }
}

function saveMessage(role, text) {
    let threads = JSON.parse(localStorage.getItem("threads"));
    threads[currentThread].messages.push({ role, text });
    localStorage.setItem("threads", JSON.stringify(threads));
}

// ========== CHAT SYSTEM ==========
function addBubble(role, text) {
    let div = document.createElement("div");
    div.className = `bubble ${role}`;
    div.textContent = text;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

async function sendMessage() {
    if (!currentThread) newChat();

    let input = document.getElementById("message").value;
    if (!input) return;

    document.getElementById("message").value = "";

    addBubble("user", input);
    saveMessage("user", input);

    addBubble("bot", "Thinking...");
    
    const reply = await engine.chat.completions.create({
        messages: [{ role: "user", content: input }]
    });

    let answer = reply.choices[0].message.content;

    chatBox.lastChild.textContent = answer;
    saveMessage("bot", answer);
}

// Load threads on start
loadThreads();