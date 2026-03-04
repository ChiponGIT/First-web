// -------------------------
// Tiny utilities
// -------------------------
const $ = (q) => document.querySelector(q);
const $$ = (q) => Array.from(document.querySelectorAll(q));

const store = {
  get(key, fallback){
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  },
  set(key, value){
    localStorage.setItem(key, JSON.stringify(value));
  }
};

const nowTime = () => new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'});

function setLastChecked(){
  $("#lastChecked").textContent = `last checked: ${new Date().toLocaleString()}`;
}

// -------------------------
// Tabs
// -------------------------
$$(".tab").forEach(btn => {
  btn.addEventListener("click", () => {
    $$(".tab").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const t = btn.dataset.tab;

    $$(".view").forEach(v => v.classList.remove("active"));
    $(`#tab-${t}`).classList.add("active");
  });
});

// -------------------------
// Clock + online pill
// -------------------------
function tick(){
  $("#clock").textContent = nowTime();
  $("#netPill").textContent = navigator.onLine ? "online" : "offline";
  $("#netPill").classList.toggle("off", !navigator.onLine);
}
tick();
setInterval(tick, 1000);
window.addEventListener("online", tick);
window.addEventListener("offline", tick);

// -------------------------
// Settings
// -------------------------
const SETTINGS_KEY = "dash_settings_v1";
const settings = store.get(SETTINGS_KEY, {
  theme: "dark",
  accent: "#36ffd2",
  density: "cozy"
});

function applySettings(){
  document.body.dataset.theme = settings.theme;
  document.body.dataset.density = settings.density;
  document.documentElement.style.setProperty("--accent", settings.accent);

  $("#themeMode").value = settings.theme;
  $("#accent").value = settings.accent;
  $("#density").value = settings.density;
}
applySettings();

$("#themeMode").addEventListener("change", (e) => {
  settings.theme = e.target.value;
  store.set(SETTINGS_KEY, settings);
  applySettings();
});
$("#accent").addEventListener("input", (e) => {
  settings.accent = e.target.value;
  store.set(SETTINGS_KEY, settings);
  applySettings();
});
$("#density").addEventListener("change", (e) => {
  settings.density = e.target.value;
  store.set(SETTINGS_KEY, settings);
  applySettings();
});
$("#reset").addEventListener("click", () => {
  localStorage.removeItem(SETTINGS_KEY);
  location.reload();
});

// -------------------------
// Data lists (saved locally)
// -------------------------
const TWITCH_KEY = "dash_twitch_list_v1";
const YT_KEY = "dash_yt_list_v1";

let twitchList = store.get(TWITCH_KEY, []);
let ytList = store.get(YT_KEY, []);

// -------------------------
// Render helpers
// -------------------------
function renderList(container, items, type){
  const el = $(container);
  el.innerHTML = "";

  if (!items.length){
    el.innerHTML = `<div class="item"><div class="left">
      <div class="name">No ${type} yet</div>
      <div class="meta">Add one above ✨</div>
    </div></div>`;
    return;
  }

  items.forEach((it) => {
    const item = document.createElement("div");
    item.className = "item";

    const statusPill = it.live
      ? `<span class="pill live">LIVE</span>`
      : `<span class="pill off">OFFLINE</span>`;

    item.innerHTML = `
      <div class="left">
        <div class="name">${escapeHtml(it.name)}</div>
        <div class="meta">${escapeHtml(it.meta || "—")}</div>
      </div>
      <div class="actions">
        ${statusPill}
        ${it.url ? `<a class="iconBtn" href="${it.url}" target="_blank" rel="noopener">Open</a>` : ""}
        <button class="iconBtn danger" data-remove="${escapeHtml(it.name)}">Remove</button>
      </div>
    `;

    item.querySelector("[data-remove]").addEventListener("click", () => {
      if (type === "streamers") {
        twitchList = twitchList.filter(x => x.name !== it.name);
        store.set(TWITCH_KEY, twitchList);
        renderTwitch();
      } else {
        ytList = ytList.filter(x => x.name !== it.name);
        store.set(YT_KEY, ytList);
        renderYT();
      }
    });

    el.appendChild(item);
  });
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

// -------------------------
// Twitch (UI ready, logic stub for now)
// -------------------------
function renderTwitch(){
  renderList("#twitchList", twitchList, "streamers");
}
renderTwitch();

$("#twitchAddForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("#twitchName").value.trim();
  if (!name) return;

  if (!twitchList.some(x => x.name.toLowerCase() === name.toLowerCase())){
    twitchList.unshift({
      name,
      live: false,
      meta: "not checked yet",
      url: `https://www.twitch.tv/${encodeURIComponent(name)}`
    });
    store.set(TWITCH_KEY, twitchList);
    renderTwitch();
  }
  $("#twitchName").value = "";
});

async function checkTwitch(){
  // NOTE:
  // Real Twitch live checks need Twitch API (Client-ID + OAuth token) or a proxy.
  // For now we simulate "checked" so your UI works.
  const stamp = new Date().toLocaleTimeString();
  twitchList = twitchList.map(s => ({
    ...s,
    live: false,
    meta: `checked ${stamp} • (API wiring needed)`
  }));
  store.set(TWITCH_KEY, twitchList);
  renderTwitch();
  setLastChecked();
}

$("#twitchCheck").addEventListener("click", checkTwitch);

let twitchTimer = null;
$("#twitchAuto").addEventListener("change", (e) => {
  if (e.target.checked){
    checkTwitch();
    twitchTimer = setInterval(checkTwitch, 60000);
  } else {
    clearInterval(twitchTimer);
    twitchTimer = null;
  }
});

// -------------------------
// YouTube (works via RSS)
// -------------------------
function renderYT(){
  renderList("#ytList", ytList, "channels");
}
renderYT();

$("#ytAddForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const id = $("#ytId").value.trim();
  if (!id) return;

  if (!ytList.some(x => x.name.toLowerCase() === id.toLowerCase())){
    ytList.unshift({
      name: id,
      live: false,
      meta: "not checked yet",
      url: `https://www.youtube.com/channel/${encodeURIComponent(id)}/live`
    });
    store.set(YT_KEY, ytList);
    renderYT();
  }
  $("#ytId").value = "";
});

async function checkYouTube(){
  const stamp = new Date().toLocaleTimeString();
  const updated = [];

  for (const ch of ytList){
    try {
      // RSS feed for a channel uploads
      const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(ch.name)}`;

      // Fetch the RSS and parse as XML
      const res = await fetch(feedUrl, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const xml = new DOMParser().parseFromString(text, "text/xml");

      // Check if recent entry is a live broadcast:
      // YouTube often includes <yt:liveBroadcastContent>live</yt:liveBroadcastContent> when applicable.
      const liveNode = xml.querySelector("entry yt\\:liveBroadcastContent, entry liveBroadcastContent");
      const isLive = (liveNode && liveNode.textContent.trim().toLowerCase() === "live");

      // Grab latest title if present
      const titleNode = xml.querySelector("entry > title");
      const title = titleNode ? titleNode.textContent.trim() : "—";

      updated.push({
        ...ch,
        live: !!isLive,
        meta: isLive ? `LIVE now • ${title}` : `checked ${stamp} • latest: ${title}`
      });
    } catch (err){
      updated.push({
        ...ch,
        live: false,
        meta: `error checking • ${err.message}`
      });
    }
  }

  ytList = updated;
  store.set(YT_KEY, ytList);
  renderYT();
  setLastChecked();
}

$("#ytCheck").addEventListener("click", checkYouTube);

let ytTimer = null;
$("#ytAuto").addEventListener("change", (e) => {
  if (e.target.checked){
    checkYouTube();
    ytTimer = setInterval(checkYouTube, 60000);
  } else {
    clearInterval(ytTimer);
    ytTimer = null;
  }
});
