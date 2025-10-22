const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const ctx = overlay.getContext("2d");
const status = document.getElementById("status");
const smileCounter = document.getElementById("smileCounter");
const smileGauge = document.getElementById("smileGauge");
const downloadBtn = document.getElementById("downloadBtn");
const emojiDisplay = document.getElementById("emojiDisplay");

const HAPPY_TH = 0.5;   // トリガー：これを超えたら2秒計測を開始
const HOLD_SEC = 2.0;   // 維持時間：2秒
const START_TH = 0.10;  // 笑顔作り始め判定
const RESET_TH = 0.05;  // 作り直し判定
const KEEP_TH = 0.3;    // 維持閾値（これ未満になるとリセット）

let smileStart = false;     // 笑顔作り開始
let smileCompleted_tm = 0;  // 0.2秒刻みで積算
let smileReach = false;     // 0.5に到達したか
let smile_tm = 0;           // 0.2→0.5までの積算（副指標）
let smileHold = false;      // 0.5を超えて「2秒計測モード」になっているか
let smileCount = 0;         // 今日の笑顔数
let smileDuration = 0;      // 維持時間
let smiling = false;        // 笑顔成立中フラグ

// ===== ローカルストレージ操作 =====
function getEventLogs() {
  return JSON.parse(localStorage.getItem("smileEventLogs") || "[]");
}
function saveEventLogs(arr) {
  localStorage.setItem("smileEventLogs", JSON.stringify(arr));
}
function getLogs() {
  try {
    const data = localStorage.getItem("smileLogs");
    const parsed = JSON.parse(data);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    console.warn("ログ破損 → 初期化");
    localStorage.removeItem("smileLogs");
    return {};
  }
}
function saveLogs(logs) {
  localStorage.setItem("smileLogs", JSON.stringify(logs));
}
function getToday() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function nowDateTimeParts() {
  const dt = new Date();
  const date = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  const time = `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}:${String(dt.getSeconds()).padStart(2, "0")}`;
  return { date, time };
}

// ===== 日ごとの笑顔回数ログ =====
function addSmileLog() {
  const today = getToday();
  let logs = getLogs();
  if (typeof logs[today] !== "number") logs[today] = 0;
  logs[today] += 1;
  try {
    saveLogs(logs);
    console.log(`✅ ${today} の笑顔回数: ${logs[today]}`);
  } catch (e) {
    console.error("⚠️ ログ保存エラー:", e);
  }
}

// ===== CSVダウンロード（全情報を1つに統合） =====
function downloadCSV() {
  const logs = getLogs();              // 日ごとの累計
  const eventLogs = getEventLogs();    // 各イベント詳細

  if (!eventLogs.length) {
    alert("まだ笑顔のログがありません");
    return;
  }

  // CSVヘッダー
  let csv = "日付,時刻,その日までの笑顔回数,笑顔になるまでの時間(秒),笑顔到達までの時間(秒)\n";

  // イベントデータを日付・時刻順に並べ替え
  eventLogs.sort((a, b) => {
    if (a.date === b.date) return a.time.localeCompare(b.time);
    return a.date.localeCompare(b.date);
  });

  // 各イベントをCSVに追記
  for (const ev of eventLogs) {
    const date = ev.date;
    const time = ev.time;
    const count = ev.count ?? (logs[date] || 0);
    const latencySmileComplete = ev.latency_smileComplete ?? "";
    const latencySmileReach = ev.latency_smileReach ?? "";
    csv += `${date},${time},${count},${latencySmileComplete},${latencySmileReach}\n`;
  }

  // CSVファイル生成・ダウンロード
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `smile_all_logs_${getToday()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

if (downloadBtn) downloadBtn.addEventListener("click", downloadCSV);

// ===== モデル読み込み & カメラ起動 =====
async function start() {
  await faceapi.nets.tinyFaceDetector.loadFromUri("https://justadudewhohacks.github.io/face-api.js/models");
  await faceapi.nets.faceExpressionNet.loadFromUri("https://justadudewhohacks.github.io/face-api.js/models");
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  video.srcObject = stream;
}
start();

// ===== 顔検出処理 =====
video.addEventListener("play", () => {
  overlay.width = video.videoWidth;
  overlay.height = video.videoHeight;

  setInterval(async () => {
    const displaySize = { width: video.videoWidth, height: video.videoHeight };
    faceapi.matchDimensions(overlay, displaySize);

    const detections = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceExpressions();
    const resized = faceapi.resizeResults(detections, displaySize);

    ctx.clearRect(0, 0, overlay.width, overlay.height);
    ctx.save();
    ctx.scale(-1, 1);
    ctx.translate(-overlay.width, 0);
    faceapi.draw.drawDetections(overlay, resized);
    ctx.restore();

    if (resized.length > 0) {
      const mainFace = resized.reduce((a, b) =>
        a.detection.box.area > b.detection.box.area ? a : b
      );
      const happyScore = mainFace.expressions.happy;

      // ===== 笑顔開始判定 =====
      if (!smiling) {
        if (!smileStart && happyScore >= START_TH) {
          smileStart = true;
          smileCompleted_tm = 0;
          smileReach = false;
          smile_tm = 0;
        }
        if (smileStart && happyScore < RESET_TH) {
          smileStart = false;
          smileCompleted_tm = 0;
          smileReach = false;
          smile_tm = 0;
          smiling = false; // ←再スタートを許可
        }
      }

      // ===== 積算時間更新 =====
      if (smileStart) {
        smileCompleted_tm += 0.2;
        if (!smileReach) {
          if (happyScore >= HAPPY_TH) smileReach = true;
          else smile_tm += 0.2;
        }
      }

      // ===== 笑顔ホールド判定 =====
      if (!smileHold && happyScore >= HAPPY_TH) {
        smileHold = true;
        smileDuration = 0;
      }

      if (smileHold && happyScore >= KEEP_TH) {
        smileDuration += 0.2;

        // ===== 笑顔成立 =====
        if (smileDuration >= HOLD_SEC && !smiling) {
          smiling = true;
          const latency_smileComplete = Number(smileCompleted_tm.toFixed(2));
          const latency_smileReach = smileReach ? Number(smile_tm.toFixed(2)) : null;
          const { date, time } = nowDateTimeParts();

          smileCount++;
          smileCounter.innerText = `今日の笑顔人数: ${smileCount}`;
          addSmileLog();

          // ✅ イベントログ保存をここに配置
          const ev = getEventLogs();
          ev.push({ date, time, count: smileCount, latency_smileComplete, latency_smileReach });
          saveEventLogs(ev);
        }
      } else if (happyScore < KEEP_TH) {
        smileHold = false;
        smileDuration = 0;
        smiling = false;
      }

      // ===== 表示制御 =====
      smileGauge.value = Math.min(smileDuration, HOLD_SEC);
      if (smiling) {
        status.innerText = "いい笑顔！いってらっしゃい🌸<br>スタンプの場所は〇〇！";
        emojiDisplay.innerText = "😄";
      } else if (smileHold) {
        status.innerText = "笑顔パワーチャージ中...";
        emojiDisplay.innerText = "😊";
      } else {
        status.innerText = "いちたすいちは??";
        emojiDisplay.innerText = "😢";
      }
      emojiDisplay.style.opacity = 1;

    } else {
      // 顔がいない場合リセット
      smileDuration = 0;
      smiling = false;
      smileHold = false;
      smileStart = false;
      smileCompleted_tm = 0;
      smileReach = false;
      smile_tm = 0;
      smileGauge.value = 0;
      status.innerText = "笑顔募集中❣";
      emojiDisplay.style.opacity = 0;
    }
  }, 200);
});


