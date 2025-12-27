const EXT_ID = "wd-courses-capture";

export function ensureMount() {
  let host = document.getElementById(EXT_ID);
  if (host) return host.shadowRoot;

  host = document.createElement("div");
  host.id = EXT_ID;
  host.style.all = "initial";
  host.style.position = "fixed";
  host.style.bottom = "16px";
  host.style.right = "16px";
  host.style.zIndex = "2147483647";
  host.attachShadow({ mode: "open" });
  document.documentElement.appendChild(host);

  return host.shadowRoot;
}
