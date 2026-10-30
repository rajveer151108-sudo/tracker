// =====================================================================
// Spotify account: connection only. Music browsing lives on Home.
// =====================================================================
let toastTimer = null;
function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}

let accountRenderId = 0;

function accountElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text != null) element.textContent = text;
  return element;
}

async function renderAccountPanel() {
  const renderId = ++accountRenderId;
  const body = $("accountPanelBody");
  body.replaceChildren(accountElement("div", "accountPanelLoading", "CHECKING SPOTIFY…"));
  const status = await window.tracker.spStatus();
  if (renderId !== accountRenderId) return;

  const connected = !!status?.connected;
  const writeAccess = !!status?.writeAccess;
  const state = accountElement("section", "accountConnectionState " + (connected ? "connected" : "offline"));
  state.appendChild(accountElement("span", "accountStateDot"));
  const copy = accountElement("div", "accountStateCopy");
  copy.appendChild(accountElement("small", "", connected ? "SPOTIFY CONNECTED" : "SPOTIFY OFFLINE"));
  copy.appendChild(accountElement("strong", "", connected
    ? (writeAccess ? "Playback and library controls are ready" : "Reconnect once to enable playback controls")
    : "Connect Spotify to load your music on Home"));
  state.appendChild(copy);
  body.replaceChildren(state);

  const explanation = accountElement("p", "accountPanelText",
    "Afterglow uses this connection for your Home collections, search, queue and playback. Your Tracker account remains separate and private.");
  body.appendChild(explanation);

  const actions = accountElement("div", "accountPanelActions");
  const connect = accountElement("button", "btn primary", connected
    ? (writeAccess ? "Reconnect Spotify" : "Enable music controls")
    : "Connect Spotify");
  connect.addEventListener("click", async () => {
    connect.disabled = true;
    connect.textContent = "Waiting for browser…";
    const result = await window.tracker.spLogin();
    showToast(result?.ok ? "Spotify connected" : "Login failed: " + (result?.error || "unknown error"));
    if (result?.ok && typeof refreshArcadeHome === "function") refreshArcadeHome(true);
    renderAccountPanel();
  });
  actions.appendChild(connect);

  if (connected) {
    const disconnect = accountElement("button", "btn", "Disconnect");
    disconnect.addEventListener("click", async () => {
      disconnect.disabled = true;
      await window.tracker.spLogout();
      showToast("Spotify disconnected");
      if (typeof refreshArcadeHome === "function") refreshArcadeHome(true);
      renderAccountPanel();
    });
    actions.appendChild(disconnect);
  }
  body.appendChild(actions);
}

function openAccountPanel() {
  if (document.body.dataset.view !== "home") setAppView("home");
  closeSettings();
  closeTracker();
  const panel = $("accountPanel");
  panel.classList.add("open");
  panel.setAttribute("aria-hidden", "false");
  renderAccountPanel();
}

function closeAccountPanel() {
  const panel = $("accountPanel");
  panel.classList.remove("open");
  panel.setAttribute("aria-hidden", "true");
}

$("homeAccountShortcut").addEventListener("click", openAccountPanel);
$("closeAccountPanel").addEventListener("click", closeAccountPanel);
$("accountPanel").addEventListener("click", (event) => {
  if (event.target === $("accountPanel")) closeAccountPanel();
});
