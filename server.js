const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { URL } = require("node:url");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");

const FRED_SERIES = {
  jpyUsd: "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DEXJPUS",
  totalAssets: "https://fred.stlouisfed.org/graph/fredgraph.csv?id=WALCL",
  treasuryCash: "https://fred.stlouisfed.org/graph/fredgraph.csv?id=WDTGAL",
  reverseRepo: "https://fred.stlouisfed.org/graph/fredgraph.csv?id=RRPONTSYD",
  usdKrw: "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DEXKOUS",
  vix: "https://fred.stlouisfed.org/graph/fredgraph.csv?id=VIXCLS",
};

const NASDAQ_SYMBOLS_URL =
  "https://www.nasdaqtrader.com/dynamic/symdir/nasdaqtraded.txt";
const NASDAQ_OPTIONS_URL = (symbol) =>
  `https://api.nasdaq.com/api/quote/${encodeURIComponent(
    symbol
  )}/option-chain?assetclass=stocks&limit=9999`;
const FED_FOMC_CALENDAR_URL =
  "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm";
const STOCK_FEAR_GREED_URL = "https://onoff.markets/data/stocks-fear-greed.json";

const CACHE_TTL_MS = {
  netLiquidity: 5 * 60 * 1000,
  options: 30 * 1000,
  symbols: 24 * 60 * 60 * 1000,
};

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
};

const EXCHANGE_NAMES = {
  A: "NYSE American",
  B: "BX",
  C: "Cboe",
  I: "ISE",
  J: "MIAX",
  K: "MEMX",
  N: "NYSE",
  P: "NYSE Arca",
  Q: "Nasdaq",
  V: "IEX",
  X: "PHLX",
  Z: "Cboe BZX",
};

const DEFAULT_HEADERS = {
  accept: "application/json,text/plain,text/csv,text/html;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
  origin: "https://www.nasdaq.com",
  referer: "https://www.nasdaq.com/",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const cache = new Map();
const pending = new Map();

function getCachedValue(key) {
  const entry = cache.get(key);

  if (!entry || entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }

  return entry.value;
}

async function withCache(key, ttlMs, loader) {
  const cached = getCachedValue(key);

  if (cached) {
    return cached;
  }

  if (pending.has(key)) {
    return pending.get(key);
  }

  const promise = (async () => {
    try {
      const value = await loader();
      cache.set(key, {
        expiresAt: Date.now() + ttlMs,
        value,
      });
      return value;
    } finally {
      pending.delete(key);
    }
  })();

  pending.set(key, promise);
  return promise;
}

async function fetchText(url) {
  let response;

  try {
    response = await fetch(url, {
      headers: DEFAULT_HEADERS,
    });
  } catch (error) {
    throw new HttpError(
      502,
      `외부 데이터 소스에 연결하지 못했습니다: ${new URL(url).hostname}`
    );
  }

  if (!response.ok) {
    const status = response.status === 404 ? 404 : 502;
    throw new HttpError(
      status,
      `외부 데이터 소스가 ${response.status} 응답을 반환했습니다: ${new URL(url).hostname}`
    );
  }

  return response.text();
}

async function fetchJson(url) {
  const text = await fetchText(url);

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new HttpError(
      502,
      `외부 데이터 소스 응답을 해석하지 못했습니다: ${new URL(url).hostname}`
    );
  }
}

function parseCsvSeries(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  const rows = [];

  for (const line of lines.slice(1)) {
    if (!line) {
      continue;
    }

    const separatorIndex = line.indexOf(",");

    if (separatorIndex === -1) {
      continue;
    }

    const date = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();

    rows.push({
      date,
      value:
        rawValue === "" || rawValue === "." ? null : Number(rawValue.replace(/,/g, "")),
    });
  }

  return rows.filter((row) => row.date);
}

function parsePipeFile(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split("|");
  const rows = [];

  for (const line of lines.slice(1)) {
    if (!line || line.startsWith("File Creation Time")) {
      continue;
    }

    const values = line.split("|");

    if (values.length !== headers.length) {
      continue;
    }

    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index];
    });
    rows.push(row);
  }

  return rows;
}

function decodeHtmlEntities(value) {
  return String(value)
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function stripTags(value) {
  return decodeHtmlEntities(String(value).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function normalizeSearchText(value) {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}

function parseNumber(value) {
  if (value == null) {
    return null;
  }

  const normalized = String(value).replace(/[$,%\s]/g, "").replace(/,/g, "");

  if (!normalized || normalized === "--" || normalized === "N/A") {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function toIsoDate(dateValue) {
  return new Date(`${dateValue}T00:00:00Z`).toISOString().slice(0, 10);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function centeredRangeScore(value, min, max, invert = false) {
  if (![value, min, max].every(Number.isFinite) || max <= min) {
    return 0;
  }

  const centered = ((value - min) / (max - min)) * 2 - 1;
  return invert ? -centered : centered;
}

function buildFxSummary(points, pointLimit = 90) {
  const cleanPoints = points.filter(
    (point) => point && point.value != null && Number.isFinite(point.value)
  );

  if (cleanPoints.length < 2) {
    throw new HttpError(502, "환율 시계열을 구성할 수 없습니다.");
  }

  const latest = cleanPoints.at(-1);
  const previous = cleanPoints.at(-2);

  return {
    dailyChange: latest.value - previous.value,
    latest: latest.value,
    latestDate: latest.date,
    points: cleanPoints.slice(-pointLimit),
    previousClose: previous.value,
  };
}

function buildSeriesSummary(points, pointLimit = 90) {
  const cleanPoints = points.filter(
    (point) => point && point.value != null && Number.isFinite(point.value)
  );

  if (cleanPoints.length < 2) {
    throw new HttpError(502, "시계열 데이터를 구성할 수 없습니다.");
  }

  const latest = cleanPoints.at(-1);
  const previous = cleanPoints.at(-2);

  return {
    dailyChange: latest.value - previous.value,
    latest: latest.value,
    latestDate: latest.date,
    points: cleanPoints.slice(-pointLimit),
    previousClose: previous.value,
  };
}

function parseMonthName(monthLabel) {
  const normalized = monthLabel.slice(0, 3).toLowerCase();
  const monthIndex = {
    apr: 4,
    aug: 8,
    dec: 12,
    feb: 2,
    jan: 1,
    jul: 7,
    jun: 6,
    mar: 3,
    may: 5,
    nov: 11,
    oct: 10,
    sep: 9,
  }[normalized];

  return monthIndex || null;
}

function toUtcIsoDate(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

function resolveFomcMeetingDates(year, monthLabel, rawDateText) {
  const months = monthLabel
    .split("/")
    .map((value) => parseMonthName(value.trim()))
    .filter(Boolean);
  const cleanDateText = rawDateText.replace(/\*/g, "").replace(/\s*\(.+\)\s*/g, "").trim();
  const dayParts = cleanDateText.split("-").map((value) => value.trim()).filter(Boolean);

  if (!months.length || !dayParts.length) {
    return {
      endDate: null,
      startDate: null,
    };
  }

  const startDay = Number(dayParts[0]);
  const endDay = Number(dayParts.at(-1));

  if (!Number.isFinite(startDay) || !Number.isFinite(endDay)) {
    return {
      endDate: null,
      startDate: null,
    };
  }

  const startMonth = months[0];
  const endMonth =
    months.length > 1 ? months.at(-1) : endDay < startDay ? Math.min(startMonth + 1, 12) : startMonth;

  return {
    endDate: toUtcIsoDate(year, endMonth, endDay),
    startDate: toUtcIsoDate(year, startMonth, startDay),
  };
}

function buildFedSchedule(htmlText, maxMeetings = 8) {
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const yearsToScan = [currentYear, currentYear + 1];
  const meetings = [];

  for (const year of yearsToScan) {
    const sectionMatch = new RegExp(
      `<a id="[^"]+">${year} FOMC Meetings<\\/a><\\/h4><\\/div>([\\s\\S]*?)<div class="panel-footer">`,
      "i"
    ).exec(htmlText);

    if (!sectionMatch) {
      continue;
    }

    const meetingRegex =
      /<div class="(?:fomc-meeting--shaded )?row fomc-meeting"[^>]*>[\s\S]*?<div class="(?:fomc-meeting--shaded )?fomc-meeting__month[^>]*><strong>([^<]+)<\/strong><\/div>[\s\S]*?<div class="fomc-meeting__date[^>]*>([^<]+)<\/div>[\s\S]*?<div class="col-xs-12 col-md-4 col-lg-4 fomc-meeting__minutes">([\s\S]*?)<\/div>\s*<\/div>/g;

    for (const match of sectionMatch[1].matchAll(meetingRegex)) {
      const monthLabel = stripTags(match[1]);
      const dateText = stripTags(match[2]);
      const minutesBlock = match[3] || "";
      const minutesReleaseMatch = /Released ([A-Za-z]+ \d{1,2}, \d{4})/i.exec(minutesBlock);
      const { startDate, endDate } = resolveFomcMeetingDates(year, monthLabel, dateText);

      meetings.push({
        dateLabel: `${monthLabel} ${dateText}`,
        endDate,
        isProjection: dateText.includes("*"),
        minutesReleaseDate: minutesReleaseMatch ? minutesReleaseMatch[1] : null,
        monthLabel,
        startDate,
        year,
      });
    }
  }

  const todayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  const upcomingMeetings = meetings
    .filter((meeting) => meeting.endDate)
    .sort((left, right) => left.startDate.localeCompare(right.startDate))
    .filter((meeting) => {
      const endUtc = new Date(`${meeting.endDate}T00:00:00Z`).getTime();
      return endUtc >= todayUtc;
    })
    .slice(0, maxMeetings)
    .map((meeting, index) => {
      const startUtc = new Date(`${meeting.startDate}T00:00:00Z`).getTime();
      const endUtc = new Date(`${meeting.endDate}T00:00:00Z`).getTime();
      const dayOffset = Math.round((startUtc - todayUtc) / 86_400_000);
      const isLive = startUtc <= todayUtc && endUtc >= todayUtc;

      return {
        ...meeting,
        badge: isLive ? "LIVE" : index === 0 ? "NEXT" : meeting.isProjection ? "SEP" : "FOMC",
        dayOffset,
        status: isLive ? "today" : dayOffset < 0 ? "completed" : index === 0 ? "next" : "upcoming",
      };
    });

  return {
    meetings: upcomingMeetings,
    note: "Fed 공식 FOMC 일정입니다. 별표(*)는 Summary of Economic Projections가 포함된 회의입니다.",
    source: FED_FOMC_CALENDAR_URL,
  };
}

function buildVixSummary(points) {
  const summary = buildSeriesSummary(points, 90);
  let signal = "안정";
  let description = "변동성이 낮은 편입니다. 단기 공포가 과도하게 높지 않은 상태입니다.";

  if (summary.latest >= 30) {
    signal = "변동성 경계";
    description = "VIX가 높은 구간입니다. 단기 공포와 헤지 수요가 강한 상태로 봅니다.";
  } else if (summary.latest >= 20) {
    signal = "변동성 주의";
    description = "VIX가 평시보다 높은 편입니다. 시장 경계감이 커진 구간입니다.";
  } else if (summary.latest >= 15) {
    signal = "보통";
    description = "VIX가 중간 영역입니다. 공포와 안도 사이의 일반적인 변동성 구간입니다.";
  }

  return {
    ...summary,
    description,
    signal,
    source: "FRED VIXCLS",
  };
}

function normalizeFearGreedLabel(label) {
  const normalized = String(label || "").trim().toLowerCase();

  if (normalized === "extreme fear") {
    return "극단적 공포";
  }

  if (normalized === "fear") {
    return "공포";
  }

  if (normalized === "neutral") {
    return "중립";
  }

  if (normalized === "greed") {
    return "탐욕";
  }

  if (normalized === "extreme greed") {
    return "극단적 탐욕";
  }

  return label || "-";
}

function buildFearGreedSummary(payload) {
  const history = Array.isArray(payload?.history)
    ? payload.history
        .filter((entry) => entry && Number.isFinite(entry.score))
        .map((entry) => ({
          date: entry.date,
          value: entry.score,
        }))
    : [];
  const latest = Number(payload?.score);

  if (!Number.isFinite(latest) || history.length < 2) {
    throw new HttpError(502, "공포탐욕지수 데이터를 구성할 수 없습니다.");
  }

  const previous = history[1];
  const label = normalizeFearGreedLabel(payload.label);
  let description = "탐욕보다는 경계 쪽에 가까운 심리 상태입니다.";

  if (latest <= 25) {
    description = "시장 심리가 극단적 공포 구간입니다. 위험 회피 성향이 강한 상태입니다.";
  } else if (latest <= 45) {
    description = "시장 심리가 공포 구간입니다. 매수보다 방어가 우세한 흐름입니다.";
  } else if (latest <= 55) {
    description = "시장 심리가 중립권입니다. 과열과 과매도 사이에 있습니다.";
  } else if (latest <= 75) {
    description = "시장 심리가 탐욕 구간입니다. 위험 선호가 살아난 상태입니다.";
  } else {
    description = "시장 심리가 극단적 탐욕 구간입니다. 과열 경계가 필요한 상태입니다.";
  }

  return {
    components: Object.entries(payload.components || {})
      .map(([key, component]) => ({
        detail: component.detail,
        key,
        score: component.score,
        weight: component.weight,
      }))
      .sort((left, right) => right.weight - left.weight)
      .slice(0, 3),
    dailyChange: latest - previous.value,
    description,
    history: history.slice(0, 30).reverse(),
    label,
    range: {
      max: 100,
      min: 0,
    },
    score: latest,
    source: "OnOff Markets Stocks Fear & Greed",
    timestamp: payload.timestamp,
  };
}

function buildMarketTemperature(points, usdKrwSummary, jpyKrwSummary) {
  const recentLiquidity = points.slice(-52);
  const liquidityValues = recentLiquidity.map((point) => point.netLiquidity);
  const liquidityLevelScore = centeredRangeScore(
    recentLiquidity.at(-1)?.netLiquidity,
    Math.min(...liquidityValues),
    Math.max(...liquidityValues)
  );
  const liquidityMomentumScore = clamp(
    (recentLiquidity.at(-1)?.netLiquidity - recentLiquidity.at(-2)?.netLiquidity) / 350_000,
    -1,
    1
  );

  const usdValues = usdKrwSummary.points.slice(-60).map((point) => point.value);
  const usdKrwScore = centeredRangeScore(
    usdKrwSummary.latest,
    Math.min(...usdValues),
    Math.max(...usdValues),
    true
  );

  const jpyValues = jpyKrwSummary.points.slice(-60).map((point) => point.value);
  const jpyKrwScore = centeredRangeScore(
    jpyKrwSummary.latest,
    Math.min(...jpyValues),
    Math.max(...jpyValues),
    true
  );

  const compositeScore =
    liquidityLevelScore * 0.48 +
    liquidityMomentumScore * 0.27 +
    usdKrwScore * 0.15 +
    jpyKrwScore * 0.1;
  const current = clamp(36.5 + compositeScore * 2.8, 34.0, 39.0);

  let signal = "중립";
  let bias = "neutral";
  let description = "유동성과 환율 흐름이 기준선 근처에서 균형을 이루고 있습니다.";

  if (current >= 37.8) {
    signal = "매도 경계";
    bias = "sell";
    description = "시장 체온이 높습니다. 유동성 과열과 위험 선호가 강한 구간으로 해석합니다.";
  } else if (current >= 37.0) {
    signal = "과열 주의";
    bias = "sell";
    description = "시장 체온이 기준보다 높습니다. 추격 매수보다 과열 여부를 점검할 구간입니다.";
  } else if (current <= 35.0) {
    signal = "매수 탐색";
    bias = "buy";
    description = "시장 체온이 낮습니다. 냉각이 깊어진 구간으로, 분할 매수 관찰에 가까운 상태입니다.";
  } else if (current <= 35.8) {
    signal = "매수 관심";
    bias = "buy";
    description = "시장 체온이 기준보다 낮습니다. 과열보다 냉각 쪽에 가까운 흐름입니다.";
  }

  return {
    baseline: 36.5,
    bias,
    current: Number(current.toFixed(1)),
    description,
    note: "순유동성 레벨, 주간 변화, 달러/원과 엔/원의 최근 위치를 합성한 휴리스틱 지표입니다.",
    range: {
      max: 39.0,
      min: 34.0,
    },
    signal,
  };
}

async function loadSymbolIndex() {
  return withCache("symbols:index", CACHE_TTL_MS.symbols, async () => {
    const rawText = await fetchText(NASDAQ_SYMBOLS_URL);
    const rows = parsePipeFile(rawText)
      .filter((row) => row.Symbol && row["Test Issue"] === "N")
      .map((row) => ({
        exchange: EXCHANGE_NAMES[row["Listing Exchange"]] || row["Listing Exchange"] || "US",
        isEtf: row.ETF === "Y",
        name: row["Security Name"].trim(),
        nameNorm: normalizeSearchText(row["Security Name"]),
        symbol: row.Symbol.trim().toUpperCase(),
      }));

    const bySymbol = new Map();

    for (const row of rows) {
      bySymbol.set(row.symbol, row);
    }

    return {
      bySymbol,
      rows,
    };
  });
}

function scoreSymbolMatch(entry, query) {
  const symbol = entry.symbol;
  const name = entry.nameNorm;

  if (symbol === query) {
    return 1_000;
  }

  if (symbol.startsWith(query)) {
    return 800 - symbol.length;
  }

  if (name.startsWith(query)) {
    return 700 - entry.name.length / 100;
  }

  if (name.includes(query)) {
    return 500 - name.indexOf(query) / 100;
  }

  if (symbol.includes(query)) {
    return 400 - symbol.indexOf(query) / 100;
  }

  const tokens = query.split(" ").filter(Boolean);
  const tokenHits = tokens.filter((token) => name.includes(token)).length;
  return tokenHits ? tokenHits * 50 : 0;
}

async function searchSymbols(query, limit = 8) {
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    return [];
  }

  const { rows } = await loadSymbolIndex();

  return rows
    .map((entry) => ({
      ...entry,
      score: scoreSymbolMatch(entry, normalizedQuery),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.symbol.localeCompare(right.symbol);
    })
    .slice(0, limit)
    .map(({ exchange, isEtf, name, symbol }) => ({
      exchange,
      isEtf,
      name,
      symbol,
    }));
}

async function loadNetLiquidity() {
  return withCache("fred:net-liquidity", CACHE_TTL_MS.netLiquidity, async () => {
    const [
      assetsCsv,
      treasuryCsv,
      reverseRepoCsv,
      usdKrwCsv,
      jpyUsdCsv,
      vixCsv,
      fedCalendarHtml,
      fearGreedJson,
    ] = await Promise.all([
      fetchText(FRED_SERIES.totalAssets),
      fetchText(FRED_SERIES.treasuryCash),
      fetchText(FRED_SERIES.reverseRepo),
      fetchText(FRED_SERIES.usdKrw),
      fetchText(FRED_SERIES.jpyUsd),
      fetchText(FRED_SERIES.vix),
      fetchText(FED_FOMC_CALENDAR_URL),
      fetchJson(STOCK_FEAR_GREED_URL),
    ]);

    const assets = parseCsvSeries(assetsCsv);
    const treasuryCash = parseCsvSeries(treasuryCsv);
    const reverseRepo = parseCsvSeries(reverseRepoCsv);
    const usdKrw = parseCsvSeries(usdKrwCsv);
    const jpyUsd = parseCsvSeries(jpyUsdCsv);
    const vix = parseCsvSeries(vixCsv);

    const treasuryMap = new Map(
      treasuryCash.filter((row) => row.value != null).map((row) => [row.date, row.value])
    );
    const jpyUsdMap = new Map(
      jpyUsd.filter((row) => row.value != null).map((row) => [row.date, row.value])
    );

    const points = [];
    let reverseRepoIndex = 0;
    let latestReverseRepo = null;

    for (const assetRow of assets) {
      while (
        reverseRepoIndex < reverseRepo.length &&
        reverseRepo[reverseRepoIndex].date <= assetRow.date
      ) {
        if (reverseRepo[reverseRepoIndex].value != null) {
          latestReverseRepo = reverseRepo[reverseRepoIndex].value;
        }
        reverseRepoIndex += 1;
      }

      const treasuryValue = treasuryMap.get(assetRow.date);

      if (assetRow.value == null || treasuryValue == null || latestReverseRepo == null) {
        continue;
      }

      const reverseRepoMillions = latestReverseRepo * 1_000;

      points.push({
        assets: assetRow.value,
        date: toIsoDate(assetRow.date),
        netLiquidity: assetRow.value - (treasuryValue + reverseRepoMillions),
        reverseRepo: reverseRepoMillions,
        treasuryCash: treasuryValue,
      });
    }

    if (points.length < 2) {
      throw new HttpError(502, "순유동성 시계열을 구성할 수 없습니다.");
    }

    const latest = points.at(-1);
    const previous = points.at(-2);
    const usdKrwSummary = buildFxSummary(
      usdKrw.map((row) => ({
        date: toIsoDate(row.date),
        value: row.value,
      }))
    );
    const jpyKrwSummary = buildFxSummary(
      usdKrw.map((row) => {
        const jpyValue = jpyUsdMap.get(row.date);

        if (row.value == null || jpyValue == null || jpyValue === 0) {
          return null;
        }

        return {
          date: toIsoDate(row.date),
          value: (row.value / jpyValue) * 100,
        };
      })
    );
    const marketTemperature = buildMarketTemperature(points, usdKrwSummary, jpyKrwSummary);
    const fedSchedule = buildFedSchedule(fedCalendarHtml);
    const vixSummary = buildVixSummary(
      vix.map((row) => ({
        date: toIsoDate(row.date),
        value: row.value,
      }))
    );
    const fearGreed = buildFearGreedSummary(fearGreedJson);

    return {
      fedSchedule,
      fearGreed,
      fx: {
        jpyKrw100: {
          ...jpyKrwSummary,
          label: "100 JPY/KRW",
        },
        note: "USD/KRW는 FRED DEXKOUS, 엔/원은 DEXKOUS와 DEXJPUS를 조합한 100엔당 원화 기준입니다.",
        usdKrw: {
          ...usdKrwSummary,
          label: "USD/KRW",
        },
      },
      marketTemperature,
      points,
      summary: {
        assets: latest.assets,
        latestDate: latest.date,
        netLiquidity: latest.netLiquidity,
        reverseRepo: latest.reverseRepo,
        treasuryCash: latest.treasuryCash,
        weeklyChange: latest.netLiquidity - previous.netLiquidity,
      },
      vix: vixSummary,
    };
  });
}

function normalizeOptionContract({
  expiry,
  last,
  change,
  bid,
  ask,
  openInterest,
  strike,
  type,
  volume,
}) {
  return {
    ask,
    bid,
    change,
    expiry,
    last,
    openInterest,
    strike,
    type,
    volume,
  };
}

function pickHighestOpenInterest(rows) {
  let activeExpiry = "";
  let topCall = null;
  let topPut = null;

  for (const row of rows) {
    if (row.expirygroup && row.strike == null) {
      activeExpiry = row.expirygroup;
      continue;
    }

    const strike = parseNumber(row.strike);

    if (strike == null) {
      continue;
    }

    const expiry = activeExpiry || row.expirygroup || row.expiryDate || "Unknown expiry";

    const call = normalizeOptionContract({
      ask: parseNumber(row.c_Ask),
      bid: parseNumber(row.c_Bid),
      change: parseNumber(row.c_Change),
      expiry,
      last: parseNumber(row.c_Last),
      openInterest: parseNumber(row.c_Openinterest),
      strike,
      type: "call",
      volume: parseNumber(row.c_Volume),
    });

    if (
      call.openInterest != null &&
      (!topCall || call.openInterest > topCall.openInterest)
    ) {
      topCall = call;
    }

    const put = normalizeOptionContract({
      ask: parseNumber(row.p_Ask),
      bid: parseNumber(row.p_Bid),
      change: parseNumber(row.p_Change),
      expiry,
      last: parseNumber(row.p_Last),
      openInterest: parseNumber(row.p_Openinterest),
      strike,
      type: "put",
      volume: parseNumber(row.p_Volume),
    });

    if (put.openInterest != null && (!topPut || put.openInterest > topPut.openInterest)) {
      topPut = put;
    }
  }

  return {
    call: topCall,
    put: topPut,
  };
}

function parseLastTrade(lastTradeText) {
  const match = /LAST TRADE:\s*\$?([0-9.,]+)\s*\(AS OF (.+)\)/i.exec(lastTradeText || "");

  if (!match) {
    return {
      raw: lastTradeText || null,
      value: null,
    };
  }

  return {
    asOf: match[2],
    raw: lastTradeText,
    value: Number(match[1].replace(/,/g, "")),
  };
}

async function loadOptionsSummary(symbol) {
  const cleanSymbol = String(symbol || "")
    .trim()
    .toUpperCase();

  if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(cleanSymbol)) {
    throw new HttpError(400, "유효한 미국 주식 티커를 입력해 주세요.");
  }

  return withCache(`options:${cleanSymbol}`, CACHE_TTL_MS.options, async () => {
    const [optionChain, symbolIndex] = await Promise.all([
      fetchJson(NASDAQ_OPTIONS_URL(cleanSymbol)),
      loadSymbolIndex(),
    ]);

    const rows = optionChain?.data?.table?.rows;

    if (!Array.isArray(rows) || rows.length === 0) {
      throw new HttpError(
        404,
        `${cleanSymbol} 종목의 옵션 체인을 찾지 못했습니다.`
      );
    }

    const { call, put } = pickHighestOpenInterest(rows);

    if (!call && !put) {
      throw new HttpError(
        404,
        `${cleanSymbol} 종목의 옵션 미결제약정 데이터를 찾지 못했습니다.`
      );
    }

    const metadata = symbolIndex.bySymbol.get(cleanSymbol) || null;

    return {
      call,
      exchange: metadata?.exchange || "US",
      lastTrade: parseLastTrade(optionChain?.data?.lastTrade),
      name: metadata?.name || cleanSymbol,
      put,
      symbol: cleanSymbol,
      updatedAt: new Date().toISOString(),
    };
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function sendError(response, statusCode, message) {
  sendJson(response, statusCode, {
    error: message,
  });
}

async function serveStaticAsset(requestPath, response) {
  const resolvedPath = requestPath === "/" ? "/index.html" : requestPath;
  const normalizedPath = path
    .normalize(decodeURIComponent(resolvedPath))
    .replace(/^(\.\.[/\\])+/, "")
    .replace(/^[/\\]+/, "");
  const filePath = path.join(PUBLIC_DIR, normalizedPath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendError(response, 403, "접근이 허용되지 않은 경로입니다.");
    return;
  }

  let fileBuffer;

  try {
    fileBuffer = await fs.readFile(filePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendError(response, 404, "페이지를 찾지 못했습니다.");
      return;
    }
    throw error;
  }

  const extension = path.extname(filePath);

  response.writeHead(200, {
    "cache-control": "no-store",
    "content-type": MIME_TYPES[extension] || "application/octet-stream",
  });
  response.end(fileBuffer);
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);

  try {
    if (requestUrl.pathname === "/api/net-liquidity") {
      const payload = await loadNetLiquidity();
      sendJson(response, 200, payload);
      return;
    }

    if (requestUrl.pathname === "/api/symbols") {
      const query = requestUrl.searchParams.get("q") || "";
      const results = await searchSymbols(query);
      sendJson(response, 200, { results });
      return;
    }

    if (requestUrl.pathname === "/api/options") {
      const symbol = requestUrl.searchParams.get("symbol") || "";
      const payload = await loadOptionsSummary(symbol);
      sendJson(response, 200, payload);
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      sendError(response, 405, "지원하지 않는 요청 메서드입니다.");
      return;
    }

    await serveStaticAsset(requestUrl.pathname, response);
  } catch (error) {
    const statusCode = error instanceof HttpError ? error.status : 500;
    const message =
      error instanceof HttpError
        ? error.message
        : "서버에서 요청을 처리하는 중 오류가 발생했습니다.";

    sendError(response, statusCode, message);
  }
});

server.listen(PORT, () => {
  console.log(`US market dashboard listening on http://localhost:${PORT}`);
});
