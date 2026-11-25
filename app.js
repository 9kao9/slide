import { addSplitPoint, calculateAllocations, calculateSummary, decodeState, encodeState, getDynamicRangeMax, getHandleGradient, normalizePoints, sanitizeLayout } from "./calculator.js";

const STORAGE_KEY = "slider-business-calculator-v1";
const colors = ["#2787d8", "#ee7042", "#3c9f70", "#806bb5", "#d39d27", "#3b8490"];
const defaultGroup = (number = 1) => ({
  id: crypto.randomUUID(),
  name: `Snack Box แผน ${number}`,
  price: 65,
  cost: 35,
  quantity: 3000,
  points: [40],
  allocationTotal: 1200,
  segmentLabels: ["COGS", "กำไร"],
});

const sharedState = new URLSearchParams(location.search).get("share");
const fromLink = sharedState ? decodeState(sharedState) : null;
const fromStorage = decodeState(localStorage.getItem(STORAGE_KEY) || "");
let state = sanitizeState(fromLink || fromStorage || { groups: [defaultGroup()] });
const channel = "BroadcastChannel" in window ? new BroadcastChannel("slider-business-calculator") : null;

const grid = document.querySelector("#calculatorGrid");
const template = document.querySelector("#calculatorTemplate");
const toast = document.querySelector("#toast");
const saveStatus = document.querySelector("#saveStatus");
let toastTimer;

function sanitizeState(candidate) {
  const groups = Array.isArray(candidate?.groups) && candidate.groups.length ? candidate.groups : [defaultGroup()];
  return {
    groups: groups.slice(0, 12).map((group, index) => {
      const points = normalizePoints(Array.isArray(group.points) ? group.points : [50]).slice(0, 5);
      const suppliedLabels = Array.isArray(group.segmentLabels) ? group.segmentLabels : [];
      return {
        id: typeof group.id === "string" ? group.id : crypto.randomUUID(),
        name: String(group.name || `แผน ${index + 1}`).slice(0, 40),
        price: Math.min(100000000, Math.max(0, Number(group.price) || 0)),
        cost: Math.min(100000000, Math.max(0, Number(group.cost) || 0)),
        quantity: Math.min(100000000, Math.max(0, Number(group.quantity) || 0)),
        layout: sanitizeLayout(group.layout || candidate?.layout),
        points,
        allocationTotal: Math.min(100000000, Math.max(0, Number(group.allocationTotal) || 1200)),
        segmentLabels: Array.from({ length: points.length + 1 }, (_, labelIndex) =>
          String(suppliedLabels[labelIndex] || `ส่วนที่ ${labelIndex + 1}`).slice(0, 24),
        ),
      };
    }),
  };
}

function persist(broadcast = true) {
  localStorage.setItem(STORAGE_KEY, encodeState(state));
  saveStatus.textContent = "บันทึกแล้ว";
  clearTimeout(persist.timer);
  persist.timer = setTimeout(() => (saveStatus.textContent = "บันทึกอัตโนมัติ"), 1200);
  if (broadcast) channel?.postMessage(state);
}

function update(mutator, shouldRender = true) {
  mutator(state);
  state = sanitizeState(state);
  persist();
  if (shouldRender) render();
}

function formatNumber(value) {
  return new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 }).format(value);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function createSlider(group, key, label, min, max, step, suffix) {
  const row = document.createElement("div");
  row.className = "slider-row";
  const value = group[key];
  const dynamicMax = getDynamicRangeMax(value, max);
  const fill = ((value - min) / (dynamicMax - min)) * 100;
  row.innerHTML = `
    <label><span>${label}</span><span class="direct-value"><input type="number" min="0" step="${step}" value="${value}" inputmode="decimal" aria-label="กรอก${label}" /><b>${suffix}</b></span></label>
    <input class="single-range" type="range" min="${min}" max="${dynamicMax}" step="${step}" value="${value}" style="--fill:${fill}%" aria-label="เลื่อน${label}" />
  `;
  const numberInput = row.querySelector('input[type="number"]');
  const rangeInput = row.querySelector('input[type="range"]');
  rangeInput.addEventListener("input", () => {
    group[key] = Number(rangeInput.value);
    rangeInput.style.setProperty("--fill", `${((group[key] - min) / (Number(rangeInput.max) - min)) * 100}%`);
    numberInput.value = group[key];
    refreshSummary(row.closest(".calculator-card"), group);
    persist();
  });
  numberInput.addEventListener("input", () => {
    group[key] = Math.min(100000000, Math.max(0, Number(numberInput.value) || 0));
    const nextMax = getDynamicRangeMax(group[key], max);
    rangeInput.max = nextMax;
    rangeInput.value = group[key];
    rangeInput.style.setProperty("--fill", `${((group[key] - min) / (nextMax - min)) * 100}%`);
    refreshSummary(row.closest(".calculator-card"), group);
    persist();
  });
  return row;
}

function refreshSummary(card, group) {
  const result = calculateSummary(group.price, group.cost, group.quantity);
  card.querySelector(".revenue-value").textContent = `${formatNumber(result.revenue)} ฿`;
  card.querySelector(".profit-value").textContent = `${formatNumber(result.profit)} ฿`;
  card.querySelector(".margin-value").textContent = `${result.margin}%`;
}

function renderSplit(card, group) {
  const allocations = calculateAllocations(group.allocationTotal, group.points);
  const bar = card.querySelector(".split-bar");
  const inputs = card.querySelector(".split-inputs");
  const names = card.querySelector(".segment-names");
  const totalInput = card.querySelector(".allocation-total input");
  bar.replaceChildren();
  inputs.replaceChildren();
  names.replaceChildren();
  totalInput.value = group.allocationTotal;
  totalInput.oninput = () => {
    group.allocationTotal = Math.max(0, Number(totalInput.value) || 0);
    calculateAllocations(group.allocationTotal, group.points).forEach(({ percent, amount }, segmentIndex) => {
      const segment = bar.children[segmentIndex];
      segment.innerHTML = percent >= 14
        ? `<strong>${percent}%</strong><small>${formatNumber(amount)} ฿</small>`
        : `<strong>${percent}%</strong>`;
      segment.setAttribute("aria-label", `${group.segmentLabels[segmentIndex]} ${percent} เปอร์เซ็นต์ ${formatNumber(amount)} บาท`);
    });
    persist();
  };

  allocations.forEach(({ percent, amount }, index) => {
    const nameWrap = document.createElement("label");
    nameWrap.className = "segment-name";
    nameWrap.style.width = `${percent}%`;
    nameWrap.style.setProperty("--segment-color", colors[index % colors.length]);
    const nameInput = document.createElement("input");
    nameInput.value = group.segmentLabels[index] || `ส่วนที่ ${index + 1}`;
    nameInput.maxLength = 24;
    nameInput.setAttribute("aria-label", `ชื่อส่วนที่ ${index + 1}`);
    nameInput.title = "พิมพ์ชื่อ เช่น COGS หรือ กำไร";
    nameInput.addEventListener("input", () => {
      group.segmentLabels[index] = nameInput.value;
      persist();
    });
    nameWrap.append(nameInput);
    names.append(nameWrap);

    const segment = document.createElement("div");
    segment.className = "segment";
    segment.style.width = `${percent}%`;
    segment.style.background = colors[index % colors.length];
    segment.innerHTML = percent >= 14
      ? `<strong>${percent}%</strong><small>${formatNumber(amount)} ฿</small>`
      : `<strong>${percent}%</strong>`;
    segment.setAttribute("aria-label", `${group.segmentLabels[index]} ${percent} เปอร์เซ็นต์ ${formatNumber(amount)} บาท`);
    bar.append(segment);
  });

  group.points.forEach((point, pointIndex) => {
    const input = document.createElement("input");
    const previous = pointIndex === 0 ? 1 : group.points[pointIndex - 1] + 1;
    const next = pointIndex === group.points.length - 1 ? 99 : group.points[pointIndex + 1] - 1;
    input.type = "range";
    input.min = previous;
    input.max = next;
    input.value = point;
    input.style.setProperty("--handle-color", getHandleGradient(pointIndex, colors));
    input.setAttribute("aria-label", `จุดแบ่งที่ ${pointIndex + 1}`);
    input.addEventListener("input", () => {
      group.points[pointIndex] = Number(input.value);
      const liveSegments = calculateAllocations(group.allocationTotal, group.points);
      [...bar.children].forEach((segment, segmentIndex) => {
        const { percent, amount } = liveSegments[segmentIndex];
        segment.style.width = `${percent}%`;
        segment.innerHTML = percent >= 14
          ? `<strong>${percent}%</strong><small>${formatNumber(amount)} ฿</small>`
          : `<strong>${percent}%</strong>`;
        segment.setAttribute("aria-label", `${group.segmentLabels[segmentIndex]} ${percent} เปอร์เซ็นต์ ${formatNumber(amount)} บาท`);
        names.children[segmentIndex].style.width = `${percent}%`;
      });
      persist();
    });
    input.addEventListener("change", () => renderSplit(card, group));
    inputs.append(input);
  });

  card.querySelector(".add-point-button").disabled = group.points.length >= 5;
  card.querySelector(".remove-point-button").disabled = group.points.length === 0;
}

function renderCard(group, index) {
  const card = template.content.firstElementChild.cloneNode(true);
  card.dataset.id = group.id;
  card.classList.add(`card-${group.layout}`);
  card.querySelector(".card-index").textContent = String(index + 1).padStart(2, "0");
  const title = card.querySelector(".card-title");
  title.value = group.name;
  title.addEventListener("input", () => {
    group.name = title.value;
    persist();
  });
  card.querySelectorAll("[data-card-layout]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.cardLayout === group.layout));
    button.addEventListener("click", () => {
      group.layout = button.dataset.cardLayout;
      persist();
      render();
    });
  });

  const sliders = card.querySelector(".sliders");
  sliders.append(
    createSlider(group, "price", "ราคาขายต่อชิ้น", 0, 500, 1, "บาท"),
    createSlider(group, "cost", "ต้นทุนต่อชิ้น", 0, 500, 1, "บาท"),
    createSlider(group, "quantity", "ยอดขายต่อเดือน", 0, 10000, 50, "ชิ้น"),
  );
  refreshSummary(card, group);
  renderSplit(card, group);

  card.querySelector(".duplicate-button").addEventListener("click", () => update((current) => {
    const copy = { ...group, id: crypto.randomUUID(), name: `${group.name} (สำเนา)`, points: [...group.points], segmentLabels: [...group.segmentLabels] };
    current.groups.splice(index + 1, 0, copy);
  }));
  card.querySelector(".remove-button").addEventListener("click", () => {
    if (state.groups.length === 1) return showToast("ต้องมีชุดคำนวณอย่างน้อย 1 ชุด");
    update((current) => current.groups.splice(index, 1));
  });
  card.querySelector(".add-point-button").addEventListener("click", () => {
    if (group.points.length >= 5) return showToast("เพิ่มจุดแบ่งได้สูงสุด 5 จุด");
    group.points = addSplitPoint(group.points);
    group.segmentLabels.push(`ส่วนที่ ${group.segmentLabels.length + 1}`);
    renderSplit(card, group);
    persist();
  });
  card.querySelector(".remove-point-button").addEventListener("click", () => {
    group.points.pop();
    group.segmentLabels.pop();
    renderSplit(card, group);
    persist();
  });
  return card;
}

function render() {
  grid.className = "calculator-grid";
  grid.replaceChildren(...state.groups.map(renderCard));
}

document.querySelector("#addGroupButton").addEventListener("click", () => {
  if (state.groups.length >= 12) return showToast("เพิ่มได้สูงสุด 12 ชุดต่อหน้า");
  update((current) => current.groups.push(defaultGroup(current.groups.length + 1)));
  requestAnimationFrame(() => grid.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "center" }));
});

document.querySelector("#shareButton").addEventListener("click", async () => {
  const url = new URL(location.href);
  url.search = "";
  url.searchParams.set("share", encodeState(state));
  try {
    await navigator.clipboard.writeText(url.toString());
    showToast("คัดลอกลิงก์แล้ว ส่งให้คนอื่นเปิดดูได้เลย");
  } catch {
    history.replaceState(null, "", url);
    showToast("สร้างลิงก์แชร์แล้ว คัดลอกจากแถบที่อยู่ได้เลย");
  }
});

channel?.addEventListener("message", (event) => {
  state = sanitizeState(event.data);
  localStorage.setItem(STORAGE_KEY, encodeState(state));
  render();
  showToast("อัปเดตค่าจากอีกหน้าต่างแล้ว");
});

if (fromLink) showToast("โหลดค่าจากลิงก์ที่แชร์แล้ว");
render();
