import { addSplitPoint, buildRoomHash, calculateAllocations, calculateSummary, decodeState, encodeState, getDynamicRangeMax, getHandleGradient, moveGroupBoundary, movePointWithLocks, normalizePoints, parseRoomHash, sanitizeLayout, setSegmentAmount, snapGroupBoundaryIndex } from "./calculator.js?v=20261125-8";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./supabase-config.js?v=20261125-2";
import { createUndoHistory, recordUndoState, undoState } from "./history.js?v=20261125-5";

const STORAGE_KEY = "slider-business-calculator-v1";
const colors = ["#2787d8", "#ee7042", "#3c9f70", "#806bb5", "#d39d27", "#3b8490"];
const defaultGroup = (number = 1) => ({
  id: crypto.randomUUID(),
  name: `Snack Box แผน ${number}`,
  price: 65,
  cost: 35,
  packagingCost: 0,
  shippingCost: 0,
  quantity: 3000,
  points: [40],
  allocationTotal: 1200,
  segmentLabels: ["COGS", "กำไร"],
  segmentLocks: [false, false],
  groupBoundaryIndex: 0,
});

const sharedState = new URLSearchParams(location.search).get("share");
const fromLink = sharedState ? decodeState(sharedState) : null;
const fromStorage = decodeState(localStorage.getItem(STORAGE_KEY) || "");
let state = sanitizeState(fromLink || fromStorage || { groups: [defaultGroup()] });
let editHistory = createUndoHistory(encodeState(state));
const channel = "BroadcastChannel" in window ? new BroadcastChannel("slider-business-calculator") : null;
let roomCredentials = parseRoomHash(location.hash);
let supabaseClient = null;
let remoteChannel = null;
let remoteReady = false;
let remoteSaveTimer = null;
const clientId = crypto.randomUUID();

const grid = document.querySelector("#calculatorGrid");
const template = document.querySelector("#calculatorTemplate");
const toast = document.querySelector("#toast");
const saveStatus = document.querySelector("#saveStatus");
const undoButton = document.querySelector("#undoButton");
let toastTimer;
let ctrlKeyPressed = false;

window.addEventListener("keydown", (event) => {
  if (event.key === "Control") ctrlKeyPressed = true;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.shiftKey) {
    event.preventDefault();
    undoLastChange();
  }
});
window.addEventListener("keyup", (event) => {
  if (event.key === "Control") ctrlKeyPressed = false;
});
window.addEventListener("blur", () => {
  ctrlKeyPressed = false;
});

function sanitizeState(candidate) {
  const groups = Array.isArray(candidate?.groups) && candidate.groups.length ? candidate.groups : [defaultGroup()];
  return {
    groups: groups.slice(0, 12).map((group, index) => {
      const points = normalizePoints(Array.isArray(group.points) ? group.points : [50]).slice(0, 5);
      const suppliedLabels = Array.isArray(group.segmentLabels) ? group.segmentLabels : [];
      const suppliedLocks = Array.isArray(group.segmentLocks) ? group.segmentLocks : [];
      const fallbackGroupBoundaryIndex = Math.floor((points.length - 1) / 2);
      const suppliedGroupBoundaryIndex = Number(group.groupBoundaryIndex);
      return {
        id: typeof group.id === "string" ? group.id : crypto.randomUUID(),
        name: String(group.name || `แผน ${index + 1}`).slice(0, 40),
        price: Math.min(100000000, Math.max(0, Number(group.price) || 0)),
        cost: Math.min(100000000, Math.max(0, Number(group.cost) || 0)),
        packagingCost: Math.min(100000000, Math.max(0, Number(group.packagingCost) || 0)),
        shippingCost: Math.min(100000000, Math.max(0, Number(group.shippingCost) || 0)),
        quantity: Math.min(100000000, Math.max(0, Number(group.quantity) || 0)),
        layout: sanitizeLayout(group.layout || candidate?.layout),
        points,
        allocationTotal: Math.min(100000000, Math.max(0, Number(group.allocationTotal) || 1200)),
        segmentLabels: Array.from({ length: points.length + 1 }, (_, labelIndex) =>
          String(suppliedLabels[labelIndex] || `ส่วนที่ ${labelIndex + 1}`).slice(0, 24),
        ),
        segmentLocks: Array.from({ length: points.length + 1 }, (_, lockIndex) => Boolean(suppliedLocks[lockIndex])),
        groupBoundaryIndex: points.length
          ? Math.min(points.length - 1, Math.max(0, Number.isInteger(suppliedGroupBoundaryIndex) ? suppliedGroupBoundaryIndex : fallbackGroupBoundaryIndex))
          : -1,
      };
    }),
  };
}

function getHistoryKey() {
  const active = document.activeElement;
  const cardId = active?.closest?.(".calculator-card")?.dataset.id || "page";
  const control = active?.getAttribute?.("aria-label") || active?.id || "action";
  return `${cardId}:${control}`;
}

function refreshUndoButton() {
  undoButton.disabled = editHistory.past.length === 0;
}

function persist(broadcast = true, { recordHistory = true } = {}) {
  const encoded = encodeState(state);
  if (recordHistory) recordUndoState(editHistory, encoded, getHistoryKey());
  localStorage.setItem(STORAGE_KEY, encoded);
  refreshUndoButton();
  saveStatus.textContent = "บันทึกแล้ว";
  clearTimeout(persist.timer);
  persist.timer = setTimeout(() => (saveStatus.textContent = "บันทึกอัตโนมัติ"), 1200);
  if (broadcast && !roomCredentials) channel?.postMessage(state);
  queueRemoteSync();
}

function undoLastChange() {
  const previous = undoState(editHistory);
  if (!previous) return showToast("ยังไม่มีรายการให้ย้อนกลับ");
  const restored = decodeState(previous);
  if (!restored) return;
  state = sanitizeState(restored);
  render();
  persist(true, { recordHistory: false });
  showToast("ย้อนกลับการแก้ไขล่าสุดแล้ว");
}

async function saveRemoteState() {
  if (!roomCredentials || !supabaseClient) return false;
  const { data, error } = await supabaseClient.rpc("save_live_room", {
    p_room_id: roomCredentials.room,
    p_edit_key: roomCredentials.key,
    p_state: state,
  });
  if (error || data === false) {
    saveStatus.textContent = "บันทึกออนไลน์ไม่สำเร็จ";
    return false;
  }
  saveStatus.textContent = "ออนไลน์ • บันทึกแล้ว";
  return true;
}

function queueRemoteSync() {
  if (!roomCredentials || !supabaseClient) return;
  if (remoteReady && remoteChannel) {
    remoteChannel.send({
      type: "broadcast",
      event: "state-update",
      payload: { sender: clientId, state },
    });
  }
  clearTimeout(remoteSaveTimer);
  remoteSaveTimer = setTimeout(saveRemoteState, 350);
}

async function initializeRealtime({ createIfMissing = false } = {}) {
  if (!roomCredentials || !window.supabase?.createClient) return false;
  if (remoteChannel) await supabaseClient.removeChannel(remoteChannel);
  saveStatus.textContent = "กำลังเชื่อมต่อห้องสด…";
  supabaseClient ||= window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data, error } = await supabaseClient.rpc("load_live_room", {
    p_room_id: roomCredentials.room,
    p_edit_key: roomCredentials.key,
  });
  if (error) {
    saveStatus.textContent = "เชื่อมต่อออนไลน์ไม่สำเร็จ";
    showToast(`เชื่อมต่อห้องสดไม่สำเร็จ: ${error.message}`);
    return false;
  }
  if (data) {
    state = sanitizeState(data);
    editHistory = createUndoHistory(encodeState(state));
    localStorage.setItem(STORAGE_KEY, encodeState(state));
    render();
  } else if (createIfMissing) {
    const saved = await saveRemoteState();
    if (!saved) return false;
  } else {
    showToast("ไม่พบห้องนี้ หรือลิงก์ไม่ถูกต้อง");
    return false;
  }

  const topic = `room:${roomCredentials.room}:${roomCredentials.key}`;
  remoteChannel = supabaseClient
    .channel(topic)
    .on("broadcast", { event: "state-update" }, ({ payload }) => {
      if (!payload?.state || payload.sender === clientId) return;
      state = sanitizeState(payload.state);
      const encoded = encodeState(state);
      editHistory = createUndoHistory(encoded);
      localStorage.setItem(STORAGE_KEY, encoded);
      render();
      refreshUndoButton();
      saveStatus.textContent = "ออนไลน์ • อัปเดตสด";
    })
    .subscribe((status) => {
      remoteReady = status === "SUBSCRIBED";
      if (remoteReady) saveStatus.textContent = "ออนไลน์ • ซิงก์สด";
      if (["CHANNEL_ERROR", "TIMED_OUT"].includes(status)) saveStatus.textContent = "การเชื่อมต่อสดขัดข้อง";
    });
  return true;
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

function formatPercent(value) {
  return new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 }).format(value);
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
  const result = calculateSummary(group.price, group.cost, group.quantity, group.packagingCost, group.shippingCost);
  card.querySelector(".revenue-value").textContent = `${formatNumber(result.revenue)} ฿`;
  card.querySelector(".profit-value").textContent = `${formatNumber(result.profit)} ฿`;
  card.querySelector(".margin-value").textContent = `${result.margin}%`;
}

function renderSplit(card, group) {
  const allocations = calculateAllocations(group.allocationTotal, group.points);
  const bar = card.querySelector(".split-bar");
  const inputs = card.querySelector(".split-inputs");
  const names = card.querySelector(".segment-names");
  const groupSummary = card.querySelector(".group-summary");
  const groupBrackets = card.querySelector(".group-brackets");
  const groupMasterInputs = card.querySelector(".group-master-inputs");
  const totalInput = card.querySelector(".allocation-total input");
  bar.replaceChildren();
  inputs.replaceChildren();
  names.replaceChildren();
  groupBrackets.replaceChildren();
  groupMasterInputs.replaceChildren();
  totalInput.value = group.allocationTotal;
  totalInput.oninput = () => {
    group.allocationTotal = Math.max(0, Number(totalInput.value) || 0);
    calculateAllocations(group.allocationTotal, group.points).forEach(({ percent, amount }, segmentIndex) => {
      const segment = bar.children[segmentIndex];
      segment.innerHTML = percent >= 14
        ? `<strong>${formatPercent(percent)}%</strong><small>${formatNumber(amount)} ฿</small>`
        : `<strong>${formatPercent(percent)}%</strong>`;
      segment.setAttribute("aria-label", `${group.segmentLabels[segmentIndex]} ${percent} เปอร์เซ็นต์ ${formatNumber(amount)} บาท`);
    });
    persist();
  };

  allocations.forEach(({ percent, amount }, index) => {
    const nameWrap = document.createElement("div");
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
    const lockButton = document.createElement("button");
    const refreshLockButton = () => {
      const isLocked = group.segmentLocks[index];
      lockButton.textContent = isLocked ? "🔒" : "🔓";
      lockButton.setAttribute("aria-pressed", String(isLocked));
      lockButton.setAttribute("aria-label", `${isLocked ? "ปลดล็อก" : "ล็อก"}${group.segmentLabels[index]}`);
      lockButton.title = isLocked ? "ปลดล็อกค่านี้" : "ล็อกค่านี้ไม่ให้เปลี่ยนตามจุดอื่น";
    };
    lockButton.type = "button";
    lockButton.className = "segment-lock";
    lockButton.addEventListener("click", () => {
      group.segmentLocks[index] = !group.segmentLocks[index];
      refreshLockButton();
      persist();
    });
    refreshLockButton();
    const amountLabel = document.createElement("label");
    amountLabel.className = "segment-amount";
    const amountInput = document.createElement("input");
    amountInput.type = "number";
    amountInput.min = "0";
    amountInput.step = "1";
    amountInput.inputMode = "decimal";
    amountInput.value = amount;
    amountInput.setAttribute("aria-label", `จำนวนเงินของ${group.segmentLabels[index]}`);
    const commitAmount = () => {
      clearTimeout(amountInput.commitTimer);
      group.points = setSegmentAmount(group.points, index, amountInput.value, group.allocationTotal, group.segmentLocks);
      renderSplit(card, group);
      persist();
    };
    amountInput.addEventListener("input", () => {
      clearTimeout(amountInput.commitTimer);
      amountInput.commitTimer = setTimeout(commitAmount, 350);
    });
    amountInput.addEventListener("change", commitAmount);
    amountLabel.append(amountInput);
    nameWrap.append(nameInput, lockButton, amountLabel);
    names.append(nameWrap);

    const segment = document.createElement("div");
    segment.className = "segment";
    segment.style.width = `${percent}%`;
    segment.style.background = colors[index % colors.length];
    segment.innerHTML = percent >= 14
      ? `<strong>${formatPercent(percent)}%</strong><small>${formatNumber(amount)} ฿</small>`
      : `<strong>${formatPercent(percent)}%</strong>`;
    segment.setAttribute("aria-label", `${group.segmentLabels[index]} ${percent} เปอร์เซ็นต์ ${formatNumber(amount)} บาท`);
    bar.append(segment);
  });

  group.points.forEach((point, pointIndex) => {
    const input = document.createElement("input");
    input.type = "range";
    input.min = 0.01;
    input.max = 99.99;
    input.step = 0.01;
    input.value = point;
    input.style.setProperty("--handle-color", getHandleGradient(pointIndex, colors));
    input.setAttribute("aria-label", `จุดแบ่งที่ ${pointIndex + 1}`);
    input.addEventListener("input", () => {
      group.points = movePointWithLocks(group.points, pointIndex, Number(input.value), group.segmentLocks);
      const liveSegments = calculateAllocations(group.allocationTotal, group.points);
      [...bar.children].forEach((segment, segmentIndex) => {
        const { percent, amount } = liveSegments[segmentIndex];
        segment.style.width = `${percent}%`;
        segment.innerHTML = percent >= 14
          ? `<strong>${formatPercent(percent)}%</strong><small>${formatNumber(amount)} ฿</small>`
          : `<strong>${formatPercent(percent)}%</strong>`;
        segment.setAttribute("aria-label", `${group.segmentLabels[segmentIndex]} ${percent} เปอร์เซ็นต์ ${formatNumber(amount)} บาท`);
        names.children[segmentIndex].style.width = `${percent}%`;
      });
      [...inputs.children].forEach((pointInput, inputIndex) => {
        pointInput.value = group.points[inputIndex];
      });
      persist();
    });
    input.addEventListener("change", () => renderSplit(card, group));
    inputs.append(input);
  });

  if (group.points.length) {
    groupSummary.hidden = false;
    let masterPointIndex = Math.min(group.points.length - 1, Math.max(0, group.groupBoundaryIndex));
    group.groupBoundaryIndex = masterPointIndex;
    const updateGroupSummary = () => {
      const liveAllocations = calculateAllocations(group.allocationTotal, group.points);
      const leftSegments = liveAllocations.slice(0, masterPointIndex + 1);
      const rightSegments = liveAllocations.slice(masterPointIndex + 1);
      const leftPercent = leftSegments.reduce((total, item) => total + item.percent, 0);
      const rightPercent = 100 - leftPercent;
      const leftAmount = leftSegments.reduce((total, item) => total + item.amount, 0);
      const rightAmount = rightSegments.reduce((total, item) => total + item.amount, 0);
      const values = [
        { percent: leftPercent, amount: leftAmount },
        { percent: rightPercent, amount: rightAmount },
      ];
      [...groupBrackets.children].forEach((bracket, index) => {
        const value = values[index];
        bracket.style.width = `${value.percent}%`;
        bracket.querySelector("span").textContent = `กลุ่ม ${index + 1} · ${formatPercent(value.percent)}% · ${formatNumber(value.amount)} ฿`;
      });
    };

    ["group-bracket-left", "group-bracket-right"].forEach((className, index) => {
      const bracket = document.createElement("div");
      bracket.className = `group-bracket ${className}`;
      const label = document.createElement("span");
      bracket.append(label);
      groupBrackets.append(bracket);
    });

    const masterInput = document.createElement("input");
    masterInput.type = "range";
    masterInput.min = 0.01;
    masterInput.max = 99.99;
    masterInput.step = 0.01;
    masterInput.value = group.points[masterPointIndex];
    masterInput.setAttribute("aria-label", "จุดแบ่งกลุ่มหลัก");
    masterInput.title = "ลากเพื่อปรับทั้งกลุ่ม • กด Ctrl ค้างเพื่อย้ายไปเกาะจุดแบ่งอื่น";
    masterInput.addEventListener("pointerdown", (event) => {
      masterInput.dataset.reassign = String(event.ctrlKey);
      masterInput.classList.toggle("is-reassigning", event.ctrlKey);
    });
    masterInput.addEventListener("input", (event) => {
      const reassigning = ctrlKeyPressed || event.ctrlKey || masterInput.dataset.reassign === "true";
      if (reassigning) {
        masterPointIndex = snapGroupBoundaryIndex(group.points, Number(masterInput.value));
        group.groupBoundaryIndex = masterPointIndex;
        masterInput.value = group.points[masterPointIndex];
        masterInput.classList.add("is-reassigning");
        updateGroupSummary();
        persist();
        return;
      }
      group.points = moveGroupBoundary(group.points, masterPointIndex, Number(masterInput.value), group.segmentLocks);
      const liveAllocations = calculateAllocations(group.allocationTotal, group.points);
      [...bar.children].forEach((segment, segmentIndex) => {
        const { percent, amount } = liveAllocations[segmentIndex];
        segment.style.width = `${percent}%`;
        segment.innerHTML = percent >= 14
          ? `<strong>${formatPercent(percent)}%</strong><small>${formatNumber(amount)} ฿</small>`
          : `<strong>${formatPercent(percent)}%</strong>`;
        names.children[segmentIndex].style.width = `${percent}%`;
        names.children[segmentIndex].querySelector(".segment-amount input").value = amount;
      });
      [...inputs.children].forEach((pointInput, inputIndex) => {
        pointInput.value = group.points[inputIndex];
      });
      masterInput.value = group.points[masterPointIndex];
      updateGroupSummary();
      persist();
    });
    const finishMasterInteraction = () => {
      masterInput.dataset.reassign = "false";
      masterInput.classList.remove("is-reassigning");
      persist();
    };
    masterInput.addEventListener("pointerup", finishMasterInteraction);
    masterInput.addEventListener("change", finishMasterInteraction);
    groupMasterInputs.append(masterInput);
    updateGroupSummary();
  } else {
    groupSummary.hidden = true;
  }

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
    createSlider(group, "cost", "ต้นทุนสินค้า/ชิ้น", 0, 500, 1, "บาท"),
    createSlider(group, "packagingCost", "ค่าบรรจุภัณฑ์/ชิ้น", 0, 500, 1, "บาท"),
    createSlider(group, "shippingCost", "ค่าขนส่ง/ชิ้น", 0, 500, 1, "บาท"),
    createSlider(group, "price", "ราคาขาย/ชิ้น", 0, 500, 1, "บาท"),
    createSlider(group, "quantity", "ยอดขายต่อเดือน", 0, 10000, 50, "ชิ้น"),
  );
  refreshSummary(card, group);
  renderSplit(card, group);

  card.querySelector(".duplicate-button").addEventListener("click", () => update((current) => {
    const copy = { ...group, id: crypto.randomUUID(), name: `${group.name} (สำเนา)`, points: [...group.points], segmentLabels: [...group.segmentLabels], segmentLocks: [...group.segmentLocks] };
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
    group.segmentLocks = Array(group.points.length + 1).fill(false);
    renderSplit(card, group);
    persist();
  });
  card.querySelector(".remove-point-button").addEventListener("click", () => {
    group.points.pop();
    group.segmentLabels.pop();
    group.segmentLocks.pop();
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

undoButton.addEventListener("click", undoLastChange);

document.querySelector("#shareButton").addEventListener("click", async () => {
  const url = new URL(location.href);
  url.searchParams.delete("share");
  if (!roomCredentials) {
    roomCredentials = { room: crypto.randomUUID(), key: crypto.randomUUID() };
    url.hash = buildRoomHash(roomCredentials.room, roomCredentials.key);
    history.replaceState(null, "", url);
    const connected = await initializeRealtime({ createIfMissing: true });
    if (!connected) return;
  } else {
    url.hash = buildRoomHash(roomCredentials.room, roomCredentials.key);
  }
  try {
    await navigator.clipboard.writeText(url.toString());
    showToast("คัดลอกลิงก์ห้องสดแล้ว ทุกคนในลิงก์นี้จะเห็นพร้อมกัน");
  } catch {
    history.replaceState(null, "", url);
    showToast("สร้างห้องสดแล้ว คัดลอกลิงก์จากแถบที่อยู่ได้เลย");
  }
});

channel?.addEventListener("message", (event) => {
  if (roomCredentials) return;
  state = sanitizeState(event.data);
  const encoded = encodeState(state);
  editHistory = createUndoHistory(encoded);
  localStorage.setItem(STORAGE_KEY, encoded);
  refreshUndoButton();
  render();
  showToast("อัปเดตค่าจากอีกหน้าต่างแล้ว");
});

if (fromLink) showToast("โหลดค่าจากลิงก์ที่แชร์แล้ว");
render();
refreshUndoButton();
if (roomCredentials) initializeRealtime();
