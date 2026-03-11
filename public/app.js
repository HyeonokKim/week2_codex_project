const state = {
  activeRange: "5Y",
  fedSchedule: null,
  fearGreed: null,
  fedFunds: null,
  isLoadingLiquidity: false,
  isLoadingOptions: false,
  fx: null,
  indexes: null,
  lastLiquidityCheckAt: null,
  lastOptionsCheckAt: null,
  liquidityRequestToken: 0,
  marketTemperature: null,
  netLiquidity: [],
  optionsRequestToken: 0,
  refreshTimers: {
    liquidity: null,
    marketStatus: null,
    options: null,
  },
  searchTimer: null,
  searchResults: [],
  selectedSymbol: "AAPL",
  summary: null,
  vix: null,
};

const elements = {
  backToTopButton: document.getElementById("back-to-top-button"),
  chart: document.getElementById("liquidity-chart"),
  chartNote: document.getElementById("chart-note"),
  chartTooltip: document.getElementById("chart-tooltip"),
  fedCalendar: document.getElementById("fed-calendar"),
  fedStatus: document.getElementById("fed-status"),
  fearGreedChange: document.getElementById("fear-greed-change"),
  fearGreedDescription: document.getElementById("fear-greed-description"),
  fearGreedLabel: document.getElementById("fear-greed-label"),
  fearGreedMarker: document.getElementById("fear-greed-marker"),
  fearGreedNote: document.getElementById("fear-greed-note"),
  fearGreedValue: document.getElementById("fear-greed-value"),
  fedFundsChange: document.getElementById("fed-funds-change"),
  fedFundsDate: document.getElementById("fed-funds-date"),
  fedFundsDescription: document.getElementById("fed-funds-description"),
  fedFundsNote: document.getElementById("fed-funds-note"),
  fedFundsSignal: document.getElementById("fed-funds-signal"),
  fedFundsValue: document.getElementById("fed-funds-value"),
  indexesNote: document.getElementById("indexes-note"),
  fxJpyChange: document.getElementById("fx-jpy-change"),
  fxJpyChart: document.getElementById("fx-jpy-chart"),
  fxJpyDate: document.getElementById("fx-jpy-date"),
  fxJpyValue: document.getElementById("fx-jpy-value"),
  fxNote: document.getElementById("fx-note"),
  fxUsdChange: document.getElementById("fx-usd-change"),
  fxUsdChart: document.getElementById("fx-usd-chart"),
  fxUsdDate: document.getElementById("fx-usd-date"),
  fxUsdValue: document.getElementById("fx-usd-value"),
  nasdaqChange: document.getElementById("nasdaq-change"),
  nasdaqChart: document.getElementById("nasdaq-chart"),
  nasdaqDate: document.getElementById("nasdaq-date"),
  nasdaqValue: document.getElementById("nasdaq-value"),
  liquidityStatus: document.getElementById("liquidity-status"),
  marketSession: document.getElementById("market-session"),
  metricAssets: document.getElementById("metric-assets"),
  metricChange: document.getElementById("metric-change"),
  metricDate: document.getElementById("metric-date"),
  metricNet: document.getElementById("metric-net"),
  metricRrp: document.getElementById("metric-rrp"),
  metricTga: document.getElementById("metric-tga"),
  optionsOutput: document.getElementById("options-output"),
  optionsStatus: document.getElementById("options-status"),
  rangeButtons: Array.from(document.querySelectorAll(".range-button")),
  searchResults: document.getElementById("search-results"),
  symbolForm: document.getElementById("symbol-form"),
  symbolInput: document.getElementById("symbol-input"),
  sp500Change: document.getElementById("sp500-change"),
  sp500Chart: document.getElementById("sp500-chart"),
  sp500Date: document.getElementById("sp500-date"),
  sp500Value: document.getElementById("sp500-value"),
  temperatureDelta: document.getElementById("temperature-delta"),
  temperatureDescription: document.getElementById("temperature-description"),
  temperatureMarker: document.getElementById("temperature-marker"),
  temperatureNote: document.getElementById("temperature-note"),
  temperaturePanel: document.getElementById("temperature-panel"),
  temperatureSignal: document.getElementById("temperature-signal"),
  temperatureUpdated: document.getElementById("temperature-updated"),
  temperatureValue: document.getElementById("temperature-value"),
  vixChange: document.getElementById("vix-change"),
  vixChart: document.getElementById("vix-chart"),
  vixDate: document.getElementById("vix-date"),
  vixDescription: document.getElementById("vix-description"),
  vixSignal: document.getElementById("vix-signal"),
  vixValue: document.getElementById("vix-value"),
};

const RANGE_TO_YEARS = {
  "1Y": 1,
  "3Y": 3,
  "5Y": 5,
  MAX: null,
};

const AUTO_REFRESH_MS = {
  liquidity: 5 * 60 * 1000,
  marketStatus: 60 * 1000,
  options: 30 * 1000,
};

const MARKET_TIME_ZONE = "America/New_York";
const MARKET_OPEN_MINUTES = 9 * 60 + 30;
const MARKET_CLOSE_MINUTES = 16 * 60;
const BACK_TO_TOP_THRESHOLD = 480;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getEasternTimeNow() {
  return new Date(
    new Date().toLocaleString("en-US", {
      timeZone: MARKET_TIME_ZONE,
    })
  );
}

function isMarketWeekday(day) {
  return day >= 1 && day <= 5;
}

function getNextMarketOpen(easternNow) {
  const nextOpen = new Date(easternNow);
  nextOpen.setSeconds(0, 0);

  const day = easternNow.getDay();
  const minutesNow = easternNow.getHours() * 60 + easternNow.getMinutes();

  if (isMarketWeekday(day) && minutesNow < MARKET_OPEN_MINUTES) {
    nextOpen.setHours(9, 30, 0, 0);
    return nextOpen;
  }

  nextOpen.setDate(nextOpen.getDate() + 1);
  nextOpen.setHours(9, 30, 0, 0);

  while (!isMarketWeekday(nextOpen.getDay())) {
    nextOpen.setDate(nextOpen.getDate() + 1);
  }

  return nextOpen;
}

function formatCountdown(msRemaining) {
  const totalMinutes = Math.max(0, Math.ceil(msRemaining / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${hours}시간 ${minutes}분`;
}

function renderMarketSession() {
  if (!elements.marketSession) {
    return;
  }

  const easternNow = getEasternTimeNow();
  const day = easternNow.getDay();
  const minutesNow = easternNow.getHours() * 60 + easternNow.getMinutes();
  const isOpen =
    isMarketWeekday(day) &&
    minutesNow >= MARKET_OPEN_MINUTES &&
    minutesNow < MARKET_CLOSE_MINUTES;

  if (isOpen) {
    elements.marketSession.innerHTML =
      '<span class="market-session-line">현재 시장상태 : ON</span>';
    elements.marketSession.className = "market-session is-open";
    return;
  }

  const nextOpen = getNextMarketOpen(easternNow);
  const countdown = formatCountdown(nextOpen.getTime() - easternNow.getTime());

  elements.marketSession.innerHTML =
    '<span class="market-session-line">현재 시장상태 : OFF</span>' +
    `<span class="market-session-countdown">다음 장 시작까지 ${escapeHtml(countdown)}</span>`;
  elements.marketSession.className = "market-session is-closed";
}

async function fetchJson(url) {
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({
    error: "응답을 해석하지 못했습니다.",
  }));

  if (!response.ok) {
    throw new Error(payload.error || "요청에 실패했습니다.");
  }

  return payload;
}

function formatUsdBillionsFromMillions(value) {
  if (value == null) {
    return "-";
  }

  const billions = value / 1_000;
  const maximumFractionDigits = Math.abs(billions) >= 100 ? 0 : 1;

  return `$${billions.toLocaleString("en-US", {
    maximumFractionDigits,
    minimumFractionDigits: maximumFractionDigits,
  })}B`;
}

function formatDeltaFromMillions(value) {
  if (value == null) {
    return "-";
  }

  const prefix = value >= 0 ? "+" : "";
  return `${prefix}${formatUsdBillionsFromMillions(value)}`;
}

function formatDate(value, options = { year: "numeric", month: "short", day: "numeric" }) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "UTC",
    ...options,
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatTime(value) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatNumber(value, digits = 0) {
  if (value == null) {
    return "-";
  }

  return Number(value).toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function formatFxValue(value, digits = 2) {
  if (value == null) {
    return "-";
  }

  return `₩${Number(value).toLocaleString("ko-KR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  })}`;
}

function formatFxChange(value, digits = 2) {
  if (value == null) {
    return "-";
  }

  const absoluteValue = Math.abs(value);
  const prefix = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${prefix}${formatFxValue(absoluteValue, digits)}`;
}

function formatCurrency(value) {
  if (value == null) {
    return "-";
  }

  return `$${Number(value).toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

function mixChannel(start, end, ratio) {
  return Math.round(start + (end - start) * ratio);
}

function mixColor(start, end, ratio) {
  const normalized = Math.min(Math.max(ratio, 0), 1);
  const [startRed, startGreen, startBlue] = start;
  const [endRed, endGreen, endBlue] = end;

  return `rgb(${mixChannel(startRed, endRed, normalized)}, ${mixChannel(
    startGreen,
    endGreen,
    normalized
  )}, ${mixChannel(startBlue, endBlue, normalized)})`;
}

function getTemperatureColor(current, baseline, range) {
  if (current >= baseline) {
    const ratio = (current - baseline) / Math.max(range.max - baseline, 0.1);
    return mixColor([154, 164, 175], [240, 68, 82], ratio);
  }

  const ratio = (baseline - current) / Math.max(baseline - range.min, 0.1);
  return mixColor([154, 164, 175], [49, 130, 246], ratio);
}

function setLiquidityStatus(message) {
  elements.liquidityStatus.textContent = message;
}

function setOptionsStatus(message) {
  elements.optionsStatus.textContent = message;
}

function setFedStatus(message) {
  elements.fedStatus.textContent = message;
}

function renderMetrics(summary) {
  elements.metricNet.textContent = formatUsdBillionsFromMillions(summary.netLiquidity);
  elements.metricAssets.textContent = formatUsdBillionsFromMillions(summary.assets);
  elements.metricTga.textContent = formatUsdBillionsFromMillions(summary.treasuryCash);
  elements.metricRrp.textContent = formatUsdBillionsFromMillions(summary.reverseRepo);
  elements.metricChange.textContent = formatDeltaFromMillions(summary.weeklyChange);
  elements.metricDate.textContent = `Latest: ${formatDate(summary.latestDate)}`;
}

function renderMarketTemperature(marketTemperature) {
  state.marketTemperature = marketTemperature;

  if (!marketTemperature) {
    return;
  }

  const position = Math.min(
    Math.max(
      ((marketTemperature.current - marketTemperature.range.min) /
        (marketTemperature.range.max - marketTemperature.range.min)) *
        100,
      0
    ),
    100
  );
  const delta = marketTemperature.current - marketTemperature.baseline;
  const color = getTemperatureColor(
    marketTemperature.current,
    marketTemperature.baseline,
    marketTemperature.range
  );

  elements.temperaturePanel.style.setProperty("--thermo-position", `${position}%`);
  elements.temperaturePanel.style.setProperty("--thermo-color", color);
  elements.temperatureSignal.textContent = marketTemperature.signal;
  elements.temperatureSignal.classList.remove("is-buy", "is-sell", "is-neutral");
  elements.temperatureSignal.classList.add(`is-${marketTemperature.bias}`);
  elements.temperatureUpdated.textContent = state.lastLiquidityCheckAt
    ? `기준선 ${marketTemperature.baseline.toFixed(1)}°C · ${formatTime(state.lastLiquidityCheckAt)} 확인`
    : `기준선 ${marketTemperature.baseline.toFixed(1)}°C`;
  elements.temperatureValue.textContent = `${marketTemperature.current.toFixed(1)}°C`;
  elements.temperatureDelta.textContent =
    delta === 0
      ? "기준선과 동일"
      : `기준선 대비 ${delta > 0 ? "+" : "-"}${Math.abs(delta).toFixed(1)}°C`;
  elements.temperatureDescription.textContent = marketTemperature.description;
  elements.temperatureNote.textContent = marketTemperature.note;
}

function formatPlainChange(value, digits = 1) {
  if (value == null) {
    return "-";
  }

  const prefix = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${prefix}${Math.abs(value).toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  })}`;
}

function getFearGreedTone(label) {
  if (label.includes("공포")) {
    return "fear";
  }

  if (label.includes("탐욕")) {
    return "greed";
  }

  return "neutral";
}

function renderFedSchedule(fedSchedule) {
  state.fedSchedule = fedSchedule;

  if (!fedSchedule?.meetings?.length) {
    elements.fedCalendar.innerHTML = `<div class="empty-state">표시할 FOMC 일정이 없습니다.</div>`;
    setFedStatus("Fed 일정을 불러오지 못했습니다.");
    return;
  }

  elements.fedCalendar.innerHTML = fedSchedule.meetings
    .map((meeting) => {
      const badgeClass =
        meeting.status === "today" ? "is-live" : meeting.status === "next" ? "is-next" : "";
      const offsetText =
        meeting.status === "today"
          ? "진행 중"
          : meeting.dayOffset === 0
            ? "오늘"
            : `D-${meeting.dayOffset}`;
      const meta = meeting.minutesReleaseDate
        ? `의사록 공개 ${escapeHtml(meeting.minutesReleaseDate)}`
        : meeting.isProjection
          ? "경제전망(SEP) 포함 회의"
          : "공식 일정";

      return `
        <article class="fed-item">
          <span class="fed-item-badge ${badgeClass}">${escapeHtml(meeting.badge)}</span>
          <div>
            <strong class="fed-item-title">${escapeHtml(meeting.dateLabel)}</strong>
            <span class="fed-item-meta">${escapeHtml(meta)}</span>
          </div>
          <span class="fed-item-offset">${escapeHtml(offsetText)}</span>
        </article>
      `;
    })
    .join("");
  setFedStatus(fedSchedule.note || "Fed 공식 일정을 표시합니다.");
}

function renderSparkline(svg, points, tone) {
  svg.innerHTML = "";

  if (!Array.isArray(points) || points.length < 2) {
    return;
  }

  const width = 280;
  const height = 92;
  const padding = { top: 6, right: 4, bottom: 8, left: 4 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  const yMin = min - span * 0.1;
  const yMax = max + span * 0.1;
  const xAt = (index) =>
    padding.left + (index / Math.max(points.length - 1, 1)) * plotWidth;
  const yAt = (value) =>
    padding.top + ((yMax - value) / Math.max(yMax - yMin, 1)) * plotHeight;

  const midpoint = padding.top + plotHeight / 2;
  svg.append(
    createSvgNode("line", {
      class: "fx-grid-line",
      x1: padding.left,
      x2: width - padding.right,
      y1: midpoint,
      y2: midpoint,
    })
  );

  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${xAt(index)} ${yAt(point.value)}`)
    .join(" ");
  const areaPath = `${linePath} L ${xAt(points.length - 1)} ${height - padding.bottom} L ${xAt(
    0
  )} ${height - padding.bottom} Z`;

  svg.append(
    createSvgNode("path", {
      class: `fx-fill-${tone}`,
      d: areaPath,
    })
  );
  svg.append(
    createSvgNode("path", {
      class: `fx-line fx-line-${tone}`,
      d: linePath,
    })
  );
}

function renderFxCard({ changeElement, chartElement, dateElement, tone, valueElement }, data) {
  if (!data) {
    valueElement.textContent = "-";
    dateElement.textContent = "-";
    changeElement.textContent = "-";
    changeElement.classList.remove("is-up", "is-down");
    chartElement.innerHTML = "";
    return;
  }

  valueElement.textContent = formatFxValue(data.latest);
  dateElement.textContent = formatDate(data.latestDate, {
    month: "short",
    day: "numeric",
  });
  changeElement.textContent = `전일 대비 ${formatFxChange(data.dailyChange)}`;
  changeElement.classList.toggle("is-up", data.dailyChange > 0);
  changeElement.classList.toggle("is-down", data.dailyChange < 0);
  renderSparkline(chartElement, data.points, tone);
}

function renderFx(fx) {
  state.fx = fx;

  renderFxCard(
    {
      changeElement: elements.fxUsdChange,
      chartElement: elements.fxUsdChart,
      dateElement: elements.fxUsdDate,
      tone: "usd",
      valueElement: elements.fxUsdValue,
    },
    fx?.usdKrw
  );
  renderFxCard(
    {
      changeElement: elements.fxJpyChange,
      chartElement: elements.fxJpyChart,
      dateElement: elements.fxJpyDate,
      tone: "jpy",
      valueElement: elements.fxJpyValue,
    },
    fx?.jpyKrw100
  );

  elements.fxNote.textContent =
    fx?.note || "달러/원과 엔/원 시계열을 불러오지 못했습니다.";
}

function renderIndexCard({ changeElement, chartElement, dateElement, tone, valueElement }, data) {
  if (!data) {
    valueElement.textContent = "-";
    dateElement.textContent = "-";
    changeElement.textContent = "-";
    changeElement.classList.remove("is-up", "is-down");
    chartElement.innerHTML = "";
    return;
  }

  valueElement.textContent = formatNumber(data.latest, 0);
  dateElement.textContent = `${formatDate(data.latestDate, {
    month: "short",
    day: "numeric",
  })} · ${data.source}`;
  changeElement.textContent = `전일 대비 ${formatPlainChange(data.dailyChange, 2)}`;
  changeElement.classList.toggle("is-up", data.dailyChange > 0);
  changeElement.classList.toggle("is-down", data.dailyChange < 0);
  renderSparkline(chartElement, data.points, tone);
}

function renderIndexes(indexes) {
  state.indexes = indexes;

  renderIndexCard(
    {
      changeElement: elements.sp500Change,
      chartElement: elements.sp500Chart,
      dateElement: elements.sp500Date,
      tone: "sp500",
      valueElement: elements.sp500Value,
    },
    indexes?.sp500
  );

  renderIndexCard(
    {
      changeElement: elements.nasdaqChange,
      chartElement: elements.nasdaqChart,
      dateElement: elements.nasdaqDate,
      tone: "nasdaq",
      valueElement: elements.nasdaqValue,
    },
    indexes?.nasdaq
  );

  elements.indexesNote.textContent =
    indexes?.sp500 && indexes?.nasdaq
      ? "FRED 기준 S&P 500과 Nasdaq Composite 최근 90영업일 흐름입니다."
      : "S&P 500과 Nasdaq 지수를 불러오지 못했습니다.";
}

function renderVix(vix) {
  state.vix = vix;

  if (!vix) {
    elements.vixValue.textContent = "-";
    elements.vixChange.textContent = "-";
    elements.vixDescription.textContent = "VIX를 불러오지 못했습니다.";
    elements.vixDate.textContent = "-";
    elements.vixChart.innerHTML = "";
    return;
  }

  elements.vixSignal.textContent = vix.signal;
  elements.vixSignal.classList.toggle("is-caution", vix.latest >= 20);
  elements.vixValue.textContent = formatNumber(vix.latest, 2);
  elements.vixChange.textContent = `전일 대비 ${formatPlainChange(vix.dailyChange, 2)}`;
  elements.vixChange.classList.toggle("is-up", vix.dailyChange > 0);
  elements.vixChange.classList.toggle("is-down", vix.dailyChange < 0);
  elements.vixDescription.textContent = vix.description;
  elements.vixDate.textContent = `${formatDate(vix.latestDate, {
    month: "short",
    day: "numeric",
  })} · ${vix.source}`;
  renderSparkline(elements.vixChart, vix.points, "vix");
}

function renderFedFunds(fedFunds) {
  state.fedFunds = fedFunds;

  if (!fedFunds) {
    elements.fedFundsValue.textContent = "-";
    elements.fedFundsSignal.textContent = "-";
    elements.fedFundsChange.textContent = "-";
    elements.fedFundsDate.textContent = "-";
    elements.fedFundsDescription.textContent = "연방기금금리를 불러오지 못했습니다.";
    elements.fedFundsNote.textContent = "-";
    return;
  }

  elements.fedFundsValue.textContent = `${formatNumber(fedFunds.latest, 2)}%`;
  elements.fedFundsSignal.textContent = fedFunds.signal;
  elements.fedFundsSignal.classList.toggle("is-caution", fedFunds.latest >= 4);
  elements.fedFundsChange.textContent = `전일 대비 ${formatPlainChange(fedFunds.dailyChange, 2)}%p`;
  elements.fedFundsChange.classList.toggle("is-up", fedFunds.dailyChange > 0);
  elements.fedFundsChange.classList.toggle("is-down", fedFunds.dailyChange < 0);
  elements.fedFundsDate.textContent = `${formatDate(fedFunds.latestDate, {
    month: "short",
    day: "numeric",
  })} · ${fedFunds.source}`;
  elements.fedFundsDescription.textContent = fedFunds.description;
  elements.fedFundsNote.textContent = fedFunds.nextMeetingNote;
}

function renderFearGreed(fearGreed) {
  state.fearGreed = fearGreed;

  if (!fearGreed) {
    elements.fearGreedValue.textContent = "-";
    elements.fearGreedChange.textContent = "-";
    elements.fearGreedDescription.textContent = "공포탐욕지수를 불러오지 못했습니다.";
    elements.fearGreedNote.textContent = "-";
    elements.fearGreedLabel.textContent = "-";
    elements.fearGreedMarker.style.left = "50%";
    return;
  }

  const tone = getFearGreedTone(fearGreed.label);
  const markerPosition = Math.min(Math.max(fearGreed.score, 0), 100);
  const details = fearGreed.components
    .slice(0, 2)
    .map((component) => component.detail)
    .filter(Boolean)
    .join(" · ");

  elements.fearGreedLabel.textContent = fearGreed.label;
  elements.fearGreedLabel.classList.remove("is-fear", "is-greed", "is-caution");
  elements.fearGreedLabel.classList.add(
    tone === "fear" ? "is-fear" : tone === "greed" ? "is-greed" : "is-caution"
  );
  elements.fearGreedValue.textContent = formatNumber(fearGreed.score, 1);
  elements.fearGreedChange.textContent = `전일 대비 ${formatPlainChange(fearGreed.dailyChange, 1)}`;
  elements.fearGreedChange.classList.toggle("is-up", fearGreed.dailyChange > 0);
  elements.fearGreedChange.classList.toggle("is-down", fearGreed.dailyChange < 0);
  elements.fearGreedDescription.textContent = fearGreed.description;
  elements.fearGreedNote.textContent = details
    ? `${formatDateTime(fearGreed.timestamp)} · ${details}`
    : `${formatDateTime(fearGreed.timestamp)} · ${fearGreed.source}`;
  elements.fearGreedMarker.style.left = `${markerPosition}%`;
}

function getRangePoints() {
  if (!state.netLiquidity.length) {
    return [];
  }

  const years = RANGE_TO_YEARS[state.activeRange];

  if (!years) {
    return state.netLiquidity;
  }

  const latestDate = new Date(`${state.netLiquidity.at(-1).date}T00:00:00Z`);
  const cutoff = Date.UTC(
    latestDate.getUTCFullYear() - years,
    latestDate.getUTCMonth(),
    latestDate.getUTCDate()
  );

  return state.netLiquidity.filter(
    (point) => new Date(`${point.date}T00:00:00Z`).getTime() >= cutoff
  );
}

function createSvgNode(name, attributes = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
}

function buildTicks(min, max, count = 5) {
  const span = Math.max(max - min, 1);
  const rawStep = span / Math.max(count - 1, 1);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const step =
    (normalized <= 1 && 1) ||
    (normalized <= 2 && 2) ||
    (normalized <= 5 && 5) ||
    10;
  const niceStep = step * magnitude;
  const start = Math.floor(min / niceStep) * niceStep;
  const end = Math.ceil(max / niceStep) * niceStep;
  const ticks = [];

  for (let value = start; value <= end + niceStep / 2; value += niceStep) {
    ticks.push(value);
  }

  return ticks;
}

function renderChart() {
  const points = getRangePoints();
  const svg = elements.chart;

  svg.innerHTML = "";

  if (!points.length) {
    setLiquidityStatus("순유동성 데이터를 불러오지 못했습니다.");
    elements.chartNote.textContent = "차트를 그릴 데이터가 없습니다.";
    return;
  }

  const width = 960;
  const height = 360;
  const padding = { top: 22, right: 18, bottom: 42, left: 72 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const values = points.map((point) => point.netLiquidity / 1_000);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const span = Math.max(maxValue - minValue, 1);
  const yMin = minValue - span * 0.08;
  const yMax = maxValue + span * 0.08;
  const ticks = buildTicks(yMin, yMax);

  const xAt = (index) =>
    padding.left + (index / Math.max(points.length - 1, 1)) * plotWidth;
  const yAt = (value) =>
    padding.top + ((yMax - value) / Math.max(yMax - yMin, 1)) * plotHeight;

  const defs = createSvgNode("defs");
  const gradient = createSvgNode("linearGradient", {
    id: "liquidityFill",
    x1: "0%",
    x2: "0%",
    y1: "0%",
    y2: "100%",
  });
  gradient.append(
    createSvgNode("stop", {
      offset: "0%",
      "stop-color": "#3182f6",
      "stop-opacity": "0.28",
    }),
    createSvgNode("stop", {
      offset: "100%",
      "stop-color": "#3182f6",
      "stop-opacity": "0.02",
    })
  );
  defs.append(gradient);
  svg.append(defs);

  ticks.forEach((tick) => {
    const y = yAt(tick);
    svg.append(
      createSvgNode("line", {
        class: "chart-grid-line",
        x1: padding.left,
        x2: width - padding.right,
        y1: y,
        y2: y,
      })
    );

    const label = createSvgNode("text", {
      class: "chart-axis-label",
      x: padding.left - 12,
      y: y + 4,
      "text-anchor": "end",
    });
    label.textContent = `${formatNumber(tick, 0)}B`;
    svg.append(label);
  });

  const linePath = points
    .map((point, index) => {
      const x = xAt(index);
      const y = yAt(point.netLiquidity / 1_000);
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  const areaPath = `${linePath} L ${xAt(points.length - 1)} ${height - padding.bottom} L ${xAt(
    0
  )} ${height - padding.bottom} Z`;

  svg.append(
    createSvgNode("path", {
      class: "chart-area",
      d: areaPath,
    })
  );

  svg.append(
    createSvgNode("path", {
      class: "chart-line",
      d: linePath,
    })
  );

  const hoverLine = createSvgNode("line", {
    class: "chart-hover-line",
    x1: 0,
    x2: 0,
    y1: padding.top,
    y2: height - padding.bottom,
  });
  const hoverDot = createSvgNode("circle", {
    class: "chart-hover-dot",
    cx: 0,
    cy: 0,
    r: 7,
  });

  svg.append(hoverLine, hoverDot);

  const overlay = createSvgNode("rect", {
    x: padding.left,
    y: padding.top,
    width: plotWidth,
    height: plotHeight,
    fill: "transparent",
    style: "cursor: crosshair;",
  });
  svg.append(overlay);

  const tooltip = elements.chartTooltip;

  const showPoint = (index) => {
    const point = points[index];
    const x = xAt(index);
    const y = yAt(point.netLiquidity / 1_000);

    hoverLine.setAttribute("x1", x);
    hoverLine.setAttribute("x2", x);
    hoverDot.setAttribute("cx", x);
    hoverDot.setAttribute("cy", y);

    tooltip.classList.remove("is-hidden");
    tooltip.style.left = `${(x / width) * 100}%`;
    tooltip.style.top = `${(y / height) * 100}%`;
    tooltip.innerHTML = `
      <span>${escapeHtml(formatDate(point.date))}</span>
      <strong>${escapeHtml(formatUsdBillionsFromMillions(point.netLiquidity))}</strong>
    `;

    elements.chartNote.textContent = `${formatDate(point.date)} 기준. 총자산 ${formatUsdBillionsFromMillions(
      point.assets
    )}, TGA ${formatUsdBillionsFromMillions(point.treasuryCash)}, RRP ${formatUsdBillionsFromMillions(
      point.reverseRepo
    )}`;
  };

  overlay.addEventListener("mousemove", (event) => {
    const { left, width: boundsWidth } = svg.getBoundingClientRect();
    const ratio = Math.min(
      Math.max((event.clientX - left - (padding.left / width) * boundsWidth) / ((plotWidth / width) * boundsWidth), 0),
      1
    );
    const index = Math.round(ratio * Math.max(points.length - 1, 0));
    showPoint(index);
  });

  overlay.addEventListener("mouseleave", () => {
    showPoint(points.length - 1);
  });

  showPoint(points.length - 1);

  const firstLabel = createSvgNode("text", {
    class: "chart-axis-label",
    x: padding.left,
    y: height - 12,
  });
  firstLabel.textContent = formatDate(points[0].date, {
    month: "short",
    year: "numeric",
  });

  const lastLabel = createSvgNode("text", {
    class: "chart-axis-label",
    x: width - padding.right,
    y: height - 12,
    "text-anchor": "end",
  });
  lastLabel.textContent = formatDate(points.at(-1).date, {
    month: "short",
    year: "numeric",
  });

  svg.append(firstLabel, lastLabel);
}

function renderSearchResults(results) {
  state.searchResults = results;

  if (!results.length) {
    elements.searchResults.innerHTML = "";
    elements.searchResults.classList.remove("is-visible");
    return;
  }

  elements.searchResults.innerHTML = results
    .map(
      (result) => `
        <button class="search-result" data-symbol="${escapeHtml(result.symbol)}" type="button" role="option">
          <span>
            <strong class="search-result-symbol">${escapeHtml(result.symbol)}</strong>
            <span class="search-result-name">${escapeHtml(result.name)}</span>
          </span>
          <span class="search-result-meta">${escapeHtml(result.exchange)}${result.isEtf ? " · ETF" : ""}</span>
        </button>
      `
    )
    .join("");
  elements.searchResults.classList.add("is-visible");
}

function hideSearchResults() {
  elements.searchResults.classList.remove("is-visible");
}

function updateBackToTopButton() {
  if (!elements.backToTopButton) {
    return;
  }

  const shouldShow = window.scrollY > BACK_TO_TOP_THRESHOLD;
  elements.backToTopButton.classList.toggle("is-visible", shouldShow);
}

function renderOptionCard(contract, tone) {
  if (!contract) {
    return `
      <article class="option-card ${tone}-card">
        <div class="option-card-head">
          <span class="option-tag">${tone}</span>
        </div>
        <p class="option-expiry">옵션 데이터를 찾지 못했습니다.</p>
      </article>
    `;
  }

  return `
    <article class="option-card ${tone}-card">
      <div class="option-card-head">
        <span class="option-tag">${tone}</span>
        <strong class="option-strike">${escapeHtml(formatCurrency(contract.strike))}</strong>
      </div>
      <p class="option-expiry">${escapeHtml(contract.expiry)}</p>
      <div class="option-stats">
        <div class="option-stat">
          <span class="option-stat-label">Open Interest</span>
          <strong class="option-stat-value">${escapeHtml(formatNumber(contract.openInterest))}</strong>
        </div>
        <div class="option-stat">
          <span class="option-stat-label">Volume</span>
          <strong class="option-stat-value">${escapeHtml(formatNumber(contract.volume))}</strong>
        </div>
        <div class="option-stat">
          <span class="option-stat-label">Bid / Ask</span>
          <strong class="option-stat-value">${escapeHtml(formatCurrency(contract.bid))} / ${escapeHtml(
            formatCurrency(contract.ask)
          )}</strong>
        </div>
        <div class="option-stat">
          <span class="option-stat-label">Last</span>
          <strong class="option-stat-value">${escapeHtml(formatCurrency(contract.last))}</strong>
        </div>
      </div>
    </article>
  `;
}

function renderOptions(payload) {
  const lastTrade = payload.lastTrade?.raw || "기초자산 가격 정보 없음";

  elements.optionsOutput.innerHTML = `
    <section>
      <div class="option-summary-header">
        <div>
          <p class="section-label">${escapeHtml(payload.exchange)}</p>
          <h3>${escapeHtml(payload.symbol)}</h3>
          <p>${escapeHtml(payload.name)}</p>
        </div>
        <p>${escapeHtml(lastTrade)}</p>
      </div>
      <div class="option-cards">
        ${renderOptionCard(payload.call, "call")}
        ${renderOptionCard(payload.put, "put")}
      </div>
    </section>
  `;
}

async function loadNetLiquidity({ silent = false } = {}) {
  if (state.isLoadingLiquidity && silent) {
    return;
  }

  const requestToken = ++state.liquidityRequestToken;
  state.isLoadingLiquidity = true;

  if (!silent) {
    setLiquidityStatus("FRED 시계열을 불러오는 중...");
  }

  try {
    const payload = await fetchJson("/api/net-liquidity");

    if (requestToken !== state.liquidityRequestToken) {
      return;
    }

    state.netLiquidity = payload.points;
    state.summary = payload.summary;
    state.fx = payload.fx;
    state.fedSchedule = payload.fedSchedule;
    state.fearGreed = payload.fearGreed;
    state.fedFunds = payload.fedFunds;
    state.marketTemperature = payload.marketTemperature;
    state.indexes = payload.indexes;
    state.vix = payload.vix;
    state.lastLiquidityCheckAt = new Date();
    renderMetrics(payload.summary);
    renderMarketTemperature(payload.marketTemperature);
    renderFedSchedule(payload.fedSchedule);
    renderFedFunds(payload.fedFunds);
    renderVix(payload.vix);
    renderFearGreed(payload.fearGreed);
    renderIndexes(payload.indexes);
    renderFx(payload.fx);
    renderChart();
    setLiquidityStatus(
      `최신 관측일 ${formatDate(payload.summary.latestDate)} · 마지막 확인 ${formatTime(
        state.lastLiquidityCheckAt
      )} · 5분마다 자동 갱신`
    );
  } catch (error) {
    if (requestToken !== state.liquidityRequestToken) {
      return;
    }

    setLiquidityStatus(error.message);
  } finally {
    if (requestToken === state.liquidityRequestToken) {
      state.isLoadingLiquidity = false;
    }
  }
}

async function loadOptions(symbol, { silent = false } = {}) {
  const normalizedSymbol = String(symbol || "")
    .trim()
    .toUpperCase();

  if (!normalizedSymbol || (state.isLoadingOptions && silent)) {
    return;
  }

  const requestToken = ++state.optionsRequestToken;
  const isNewSymbol = normalizedSymbol !== state.selectedSymbol;
  state.selectedSymbol = normalizedSymbol;

  if (!silent) {
    elements.symbolInput.value = normalizedSymbol;
  }

  state.isLoadingOptions = true;

  if (!silent || isNewSymbol) {
    setOptionsStatus(`${normalizedSymbol} 옵션 체인을 조회하는 중...`);
    elements.optionsOutput.innerHTML = `<div class="empty-state">데이터를 불러오는 중입니다.</div>`;
  }

  try {
    const payload = await fetchJson(
      `/api/options?symbol=${encodeURIComponent(normalizedSymbol)}`
    );

    if (requestToken !== state.optionsRequestToken) {
      return;
    }

    state.lastOptionsCheckAt = new Date();
    renderOptions(payload);
    setOptionsStatus(
      `${payload.symbol} 기준 최대 미결제약정 콜옵션과 풋옵션입니다. 마지막 확인 ${formatTime(
        state.lastOptionsCheckAt
      )} · 30초마다 자동 갱신`
    );
  } catch (error) {
    if (requestToken !== state.optionsRequestToken) {
      return;
    }

    elements.optionsOutput.innerHTML = `<div class="options-error">${escapeHtml(
      error.message
    )}</div>`;
    setOptionsStatus(error.message);
  } finally {
    if (requestToken === state.optionsRequestToken) {
      state.isLoadingOptions = false;
    }
  }
}

async function handleSearchInput() {
  const query = elements.symbolInput.value.trim();

  if (state.searchTimer) {
    clearTimeout(state.searchTimer);
  }

  if (query.length < 1) {
    hideSearchResults();
    return;
  }

  state.searchTimer = window.setTimeout(async () => {
    try {
      const payload = await fetchJson(`/api/symbols?q=${encodeURIComponent(query)}`);

      if (elements.symbolInput.value.trim() !== query) {
        return;
      }

      renderSearchResults(payload.results);
    } catch (error) {
      hideSearchResults();
    }
  }, 180);
}

function bindEvents() {
  elements.rangeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.activeRange = button.dataset.range;
      elements.rangeButtons.forEach((item) =>
        item.classList.toggle("is-active", item === button)
      );
      renderChart();
    });
  });

  elements.symbolInput.addEventListener("input", handleSearchInput);

  elements.searchResults.addEventListener("click", (event) => {
    const target = event.target.closest("[data-symbol]");

    if (!target) {
      return;
    }

    hideSearchResults();
    loadOptions(target.dataset.symbol);
  });

  elements.symbolForm.addEventListener("submit", (event) => {
    event.preventDefault();
    hideSearchResults();
    loadOptions(elements.symbolInput.value);
  });

  document.addEventListener("click", (event) => {
    if (!elements.symbolForm.contains(event.target)) {
      hideSearchResults();
    }
  });

  if (elements.backToTopButton) {
    elements.backToTopButton.addEventListener("click", () => {
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    });
  }

  window.addEventListener("scroll", updateBackToTopButton, { passive: true });
}

function setupAutoRefresh() {
  state.refreshTimers.liquidity = window.setInterval(() => {
    if (document.hidden) {
      return;
    }

    loadNetLiquidity({ silent: true });
  }, AUTO_REFRESH_MS.liquidity);

  state.refreshTimers.options = window.setInterval(() => {
    if (document.hidden || !state.selectedSymbol) {
      return;
    }

    loadOptions(state.selectedSymbol, { silent: true });
  }, AUTO_REFRESH_MS.options);

  state.refreshTimers.marketStatus = window.setInterval(() => {
    if (document.hidden) {
      return;
    }

    renderMarketSession();
  }, AUTO_REFRESH_MS.marketStatus);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      return;
    }

    renderMarketSession();
    loadNetLiquidity({ silent: true });

    if (state.selectedSymbol) {
      loadOptions(state.selectedSymbol, { silent: true });
    }
  });
}

async function init() {
  if ("scrollRestoration" in window.history) {
    window.history.scrollRestoration = "manual";
  }

  window.scrollTo(0, 0);
  bindEvents();
  renderMarketSession();
  updateBackToTopButton();
  setupAutoRefresh();
  await loadNetLiquidity();
  await loadOptions(state.selectedSymbol);
}

init();
