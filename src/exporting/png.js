const buildExportContainer = ({ schedulePanel, listPanel, styleText }) => {
  const container = document.createElement("div");
  container.className = "export-image";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.gap = "18px";
  container.style.padding = "18px";
  container.style.background = "#ffffff";
  container.style.color = "#111827";

  const title = document.createElement("h2");
  title.textContent = "Schedule View";
  title.style.margin = "0";
  title.style.fontSize = "18px";
  title.style.fontWeight = "700";

  const scheduleClone = schedulePanel.cloneNode(true);
  scheduleClone.classList.add("is-active");
  scheduleClone.style.display = "flex";
  scheduleClone.style.flexDirection = "column";
  scheduleClone.style.height = "auto";
  scheduleClone.style.minHeight = "auto";

  const scheduleGrid = scheduleClone.querySelector(".schedule-grid");
  if (scheduleGrid) {
    scheduleGrid.style.overflow = "visible";
    scheduleGrid.style.maxHeight = "none";
  }

  const courseTitle = document.createElement("h2");
  courseTitle.textContent = "Course List";
  courseTitle.style.margin = "8px 0 0";
  courseTitle.style.fontSize = "18px";
  courseTitle.style.fontWeight = "700";

  const listClone = listPanel.cloneNode(true);
  listClone.classList.add("is-active");
  listClone.style.display = "block";

  const styleTag = document.createElement("style");
  styleTag.textContent = styleText;

  const wrapper = document.createElement("div");
  wrapper.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  wrapper.appendChild(styleTag);
  wrapper.appendChild(container);
  container.appendChild(title);
  container.appendChild(scheduleClone);
  container.appendChild(courseTitle);
  container.appendChild(listClone);

  return { wrapper, container };
};

const createPNGFromNode = async ({ wrapper, container }) => {
  const tempHost = document.createElement("div");
  tempHost.style.position = "fixed";
  tempHost.style.top = "-99999px";
  tempHost.style.left = "-99999px";
  tempHost.style.pointerEvents = "none";
  tempHost.style.opacity = "0";
  tempHost.appendChild(wrapper);
  document.body.appendChild(tempHost);

  const width = Math.ceil(container.scrollWidth);
  const height = Math.ceil(container.scrollHeight);

    // IMPORTANT:
  // Remove Material Symbols nodes before SVG->canvas export.
  // They rely on a cross-origin Google Fonts stylesheet (panel.html),
  // which taints the canvas and breaks toDataURL().
  wrapper.querySelectorAll(".material-symbols-rounded").forEach((el) => {
    el.remove();
  });

  const serialized = new XMLSerializer().serializeToString(wrapper);

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <foreignObject width="100%" height="100%">
        ${serialized}
      </foreignObject>
    </svg>
  `;

  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  const image = new Image();

  const pngUrl = await new Promise((resolve, reject) => {
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Unable to create canvas context."));
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    image.onerror = () => reject(new Error("Unable to render export image."));
    image.src = url;
  });

  URL.revokeObjectURL(url);
  tempHost.remove();

  return pngUrl;
};

export async function exportSchedulePNG(ctx) {
  const schedulePanel = ctx.root.querySelector('[data-panel="schedule"]');
  const listPanel = ctx.root.querySelector('[data-panel="list"]');
  const styleText = Array.from(ctx.root.querySelectorAll("style"))
    .map((style) => style.textContent)
    .join("\n");

  if (!schedulePanel || !listPanel) return;

  const { wrapper, container } = buildExportContainer({
    schedulePanel,
    listPanel,
    styleText,
  });

  const pngUrl = await createPNGFromNode({ wrapper, container });

  const link = document.createElement("a");
  link.href = pngUrl;
  link.download = "workday-schedule.png";
  document.body.appendChild(link);
  link.click();
  link.remove();
}