// extension ID
const EXT_ID = "Workday - Schedule Tool";

// first time its called it mounts the extension, in subsequents calls it the returns extensions shadow root
export function ensureMount() {
  let host = document.getElementById(EXT_ID);
  if (host) return host.shadowRoot;

  // creates container for extension, sets styles, then appends extension to the page
  host = document.createElement("div");
  host.id = EXT_ID;
  host.style.all = "initial";
  host.style.position = "fixed";
  host.style.bottom = "16px";
  host.style.right = "16px";
  host.style.zIndex = "999999999";
  host.attachShadow({ mode: "open" });
  document.documentElement.appendChild(host);

  return host.shadowRoot;
}
