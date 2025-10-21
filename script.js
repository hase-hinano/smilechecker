const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const ctx = overlay.getContext("2d");
const status = document.getElementById("status");
const smileCounter = document.getElementById("smileCounter");
const smileGauge = document.getElementById("smileGauge");
const downloadBtn = document.getElementById("downloadBtn");
const emojiDisplay = document.getElementById("emojiDisplay");

const HAPPY_TH = 0.5;     // トリガー：これを超えたら2秒計測を開始
const HOLD_SEC = 2.0;     // 2秒維持で成立
const START_TH = 0.10;    // 作り始め判定
const RESET_TH = 0.05;    // 作り直し判定
const KEEP_TH = 0.3;      // 維持閾値。計測開始後は 0.3 以上なら継続

let smileStart = false;       // 0.2を超えたら true
let smileCompleted_tm = 0;    // 0.2秒刻みで積算（秒）
let smileReach = false;       // 0.5 を初めて超えたら true
let smile_tm = 0;             // 0.2→0.5 までの積算（副指標）
let smileHold = false;        // 0.5を超えて「2秒計測モード」になっているか

let smileCount = 0;
let smileDuration = 0;
let smiling = false;

function getEventLogs() {
  return JSON.parse(localStorage.getItem("smileEventLogs") || "[]");
}
function saveEventLogs(arr) {
  localStorage.setItem("smileEventLogs", JSON.stringify(arr));
}
function nowDateTimeParts() {
  const dt = new Date();
  const date = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
  const time = `${String(dt.getHours()).padStart(2,"0")}:${String(dt.getMinutes()).padStart(2,"0")}:${String(dt.getSeconds()).padStart(2,"0")}`;
  return { date, time };
}
const downloadEventBtn = document.getElementById("downloadEventBtn");
if (downloadEventBtn) {
  downloadEventBtn.addEventListener("click", () => {
    const logs = getEventLogs();
    if (!logs.length) { alert("まだイベントログがありません"); return; }
    let csv = "date,time,count,latency_smileComplete,latency_smileReach\n";
    for (const r of logs) {
      csv += `${r.date},${r.time},${r.count},${r.latency_smileComplete ?? ""},${r.latency_smileReach ?? ""}\n`;
    }
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
      download: "smile_event_logs.csv"
    });
    a.click();
  });
}

// ===== 日付を日本時間で取得 =====
function getToday() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ===== ログ管理 =====
function getLogs() {
  try {
    const data = localStorage.getItem("smileLogs");
    const parsed = JSON.parse(data);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    console.warn("ログデータ破損のため初期化します");
    localStorage.removeItem("smileLogs");
    return {};
  }
}

function saveLogs(logs) {
  localStorage.setItem("smileLogs", JSON.stringify(logs));
}

// ===== 笑顔ログ（カウントのみ） =====
function addSmileLog() {
  const today = getToday();
  let logs = getLogs();

  // 最新状態を毎回読み直し（他の端末と競合しにくくする）
  logs = getLogs();

  if (typeof logs[today] !== "number") {
    logs[today] = 0;
  }

  logs[today] += 1;

  try {
    saveLogs(logs);
    console.log(`✅ ${today} の笑顔回数: ${logs[today]}`);
  } catch (e) {
    console.error("⚠️ ログ保存エラー:", e);
  }
}

// ===== CSVダウンロード（日付と回数のみ） =====
function downloadCSV() {
  const logs = getLogs();
  const dates = Object.keys(logs);

  if (dates.length === 0) {
    alert("まだログがありません");
    return;
  }

  let csv = "日付,笑顔回数\n";

  dates.forEach(date => {
    const count = typeof logs[date] === "number" ? logs[date] : 0;
    csv += `${date},${count}\n`;
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `smile_logs_${getToday()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}



// ===== ボタンイベント =====
if (typeof downloadBtn !== "undefined" && downloadBtn !== null) {
  downloadBtn.addEventListener("click", downloadCSV);
} else {
  const btn = document.getElementById("downloadBtn");
  if (btn) {
    btn.addEventListener("click", downloadCSV);
  } else {
    console.warn("⚠️ downloadBtn が見つかりません。HTMLを確認してください。");
  }
}

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
      if (!smiling) {
        // 0.2 を初めて超えたら積算開始
        if (!smileStart && happyScore >= START_TH) {
          smileStart = true;
          smileCompleted_tm = 0;
          smileReach = false;
          smile_tm = 0;
        }
        // 0.1 未満に落ちたらリセット（やり直し）
        if (smileStart && happyScore < RESET_TH) {
          smileStart = false;
          smileCompleted_tm = 0;
          smileReach = false;
          smile_tm = 0;
        }
      }
      // 0.2超え状態が続く間は 0.2 秒ずつ積算（200ms インターバル前提）
      if (smileStart) {
        smileCompleted_tm += 0.2;
        // ★副指標：0.5 に到達するまで積算し続ける
        if (!smileReach) {
          if (happyScore >= HAPPY_TH) {
            smileReach = true;  // 笑顔到達
          } else {
            smile_tm += 0.2;
          }
        }
      }

      // 笑顔点数に到達した際の処理
      if (!smileHold && happyScore >= HAPPY_TH) {
        smileHold = true;
        smileDuration = 0; 
      }
      // 笑顔ホールド中の処理
      if(smileHold && happyScore >= KEEP_TH) {
        smileDuration += 0.2;
        // 笑顔ホールド完了
        if(smileDuration >= HOLD_SEC && !smiling) {
          smiling = true;
          const latency_smileComplete = Number(smileCompleted_tm.toFixed(2));
          const latency_smileReach  = smileReach ? Number(smile_tm.toFixed(2)) : null;
          const { date, time } = (function () {
            const dt = new Date();
            const d = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
            const t = `${String(dt.getHours()).padStart(2,"0")}:${String(dt.getMinutes()).padStart(2,"0")}:${String(dt.getSeconds()).padStart(2,"0")}`;
            return { date: d, time: t };
          })();
          
          smileCount++;
         
          smileCounter.innerText = `今日の笑顔人数: ${smileCount}`;
          addSmileLog();
        }

        const ev = getEventLogs();
          ev.push({ date, time, count: smileCount, latency_smileComplete, latency_smileReach });
          saveEventLogs(ev);
        }
      // 0.3未満になった時のリセット
      }else{
          smileHold = false;
          smileDuration = 0;  
      }

        smileGauge.value = Math.min(smileDuration, 2);
      let msg;
      if (smiling) {
        status.innerText = "いい笑顔！いってらっしゃい";
        emojiDisplay.innerText ="😄";
        emojiDisplay.style.opacity = 1;
      } else if (smileHold) {
        status.innerText = "笑顔パワーチャージ中";
        emojiDisplay.innerText ="😊";
        emojiDisplay.style.opacity = 1;
      } else {
        status.innerText = "いちたすいちは??";
        emojiDisplay.innerText ="😢";
        emojiDisplay.style.opacity = 1;
      }

    } else {
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
