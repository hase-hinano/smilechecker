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
  return JSON.parse(localStorage.getItem("smileLogs") || "{}");
}

function saveLogs(logs) {
  localStorage.setItem("smileLogs", JSON.stringify(logs));
}

function addSmileLog() {
  const today = getToday();
  const logs = getLogs();
  if (!logs[today]) logs[today] = [];
  const now = new Date().toLocaleTimeString("ja-JP", { hour12: false });
  logs[today].push(now);
  saveLogs(logs);
}

// ===== CSVダウンロード =====
function downloadCSV() {
  const logs = getLogs();
  if (Object.keys(logs).length === 0) {
    alert("まだログがありません");
    return;
  }

  let csv = "date,time\n";
  for (let date in logs) {
    logs[date].forEach(time => {
      csv += `${date},${time}\n`;
    });
  }

  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "smile_logs.csv";
  a.click();
}

downloadBtn.addEventListener("click", downloadCSV);

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
            ? "笑顔認証中…"
            : "いい笑顔！いってらっしゃい😊";
        emojiDisplay.innerText =
          smileDuration < 2 ? "😊" : "😄";
        emojiDisplay.style.opacity = 1;
      } else {
        smileDuration = 0;
        smiling = false;
        smileGauge.value = 0;
        status.innerText = "笑顔が足りない😢";
        emojiDisplay.innerText = "😢";
        emojiDisplay.style.opacity = 1;
        setTimeout(() => (emojiDisplay.style.opacity = 0), 800);
      }
    } else {
      smileDuration = 0;
      smiling = false;
      smileGauge.value = 0;
      status.innerText = "カメラを起動中...";
      emojiDisplay.style.opacity = 0;
    }
  }, 200);
});
