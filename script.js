const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const ctx = overlay.getContext("2d");
const status = document.getElementById("status");
const smileCounter = document.getElementById("smileCounter");
const smileGauge = document.getElementById("smileGauge");
const downloadBtn = document.getElementById("downloadBtn");
const emojiDisplay = document.getElementById("emojiDisplay");

let smileCount = 0;
let smileDuration = 0;
let smiling = false;

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

function addSmileLog() {
  const today = getToday();
  let logs = getLogs();

  // 他の端末の書き込み競合対策：最新の localStorage を毎回読み直す
  logs = getLogs();

  if (!Array.isArray(logs[today])) {
    logs[today] = [];
  }

  const now = new Date().toLocaleTimeString("ja-JP", { hour12: false });
  logs[today].push(now);

  try {
    saveLogs(logs);
    console.log(`✅ 笑顔ログ追加: ${today} ${now}`);
  } catch (e) {
    console.error("⚠️ ログ保存エラー:", e);
  }
}

function downloadCSV() {
  const logs = getLogs();
  const dates = Object.keys(logs);

  if (dates.length === 0) {
    alert("まだログがありません");
    return;
  }

  let csv = "日付,時刻\n";

  dates.forEach(date => {
    const times = Array.isArray(logs[date]) ? logs[date] : [];
    times.forEach(time => {
      csv += `${date},${time}\n`;
    });
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
      const isSmiling = mainFace.expressions.happy > 0.5;

      if (isSmiling) {
        smileDuration += 0.2; // 200msごとに加算 → 約2秒で満タン
        if (smileDuration >= 2 && !smiling) {
          smileCount++;
          smiling = true;
          smileCounter.innerText = `今日の笑顔人数: ${smileCount}`;
          addSmileLog();
        }

        smileGauge.value = Math.min(smileDuration, 2);
        status.innerText =
          smileDuration < 2
            ? "笑顔パワーチャージ中"
            : "いい笑顔！いってらっしゃい";
        emojiDisplay.innerText =
          smileDuration < 2 ? "😊" : "😄";
        emojiDisplay.style.opacity = 1;
      } else {
        smileDuration = 0;
        smiling = false;
        smileGauge.value = 0;
        status.innerText = "いちたすいちは??";
        emojiDisplay.innerText = "😢";
        emojiDisplay.style.opacity = 1;
        setTimeout(() => (emojiDisplay.style.opacity = 0), 800);
      }
    } else {
      smileDuration = 0;
      smiling = false;
      smileGauge.value = 0;
      status.innerText = "笑顔募集中❣";
      emojiDisplay.style.opacity = 0;
    }
  }, 200);
});






