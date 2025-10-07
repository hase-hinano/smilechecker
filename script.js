const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const ctx = overlay.getContext("2d");
const status = document.getElementById("status");
const smileCounter = document.getElementById("smileCounter");
const smileGauge = document.getElementById("smileGauge");
const downloadBtn = document.getElementById("downloadBtn");

let smileCount = 0;
let smileDuration = 0;
let smiling = false;

// Google Apps Script Web AppのURLをここに貼る
const SHEET_URL = "＜https://script.google.com/macros/s/AKfycbxcBh5lCQDpm_jIkm-uBxijth1FtiD3pdqDH5LzNp33pTBgsk2enX46EyxdDpsrtKw5/exec＞";

// ---- 日ごとのログ管理 ----
function getToday() {
  const now = new Date();
  now.setHours(now.getHours() + 9); // JST補正
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getLogs() {
  return JSON.parse(localStorage.getItem("smileLogs") || "{}");
}

function saveLogs(logs) {
  localStorage.setItem("smileLogs", JSON.stringify(logs));
}

function incrementToday() {
  const today = getToday();
  const logs = getLogs();
  logs[today] = (logs[today] || 0) + 1;
  saveLogs(logs);
  sendToSheet(today, logs[today]);
}

// ---- Googleスプレッドシートに送信 ----
function sendToSheet(date, total_count) {
  fetch(SHEET_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date, total_count })
  })
    .then((r) => r.text())
    .then((res) => console.log("送信成功:", res))
    .catch((err) => console.error("送信エラー:", err));
}

// ---- CSVダウンロード ----
function downloadCSV() {
  const logs = getLogs();
  if (Object.keys(logs).length === 0) {
    alert("まだログがありません");
    return;
  }

  let csv = "date,total_count\n";
  for (let date in logs) {
    csv += `${date},${logs[date]}\n`;
  }

  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "smile_logs.csv";
  a.click();
}
downloadBtn.addEventListener("click", downloadCSV);

// ---- 顔認識スタート ----
async function start() {
  await faceapi.nets.tinyFaceDetector.loadFromUri(
    "https://justadudewhohacks.github.io/face-api.js/models"
  );
  await faceapi.nets.faceExpressionNet.loadFromUri(
    "https://justadudewhohacks.github.io/face-api.js/models"
  );

  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  video.srcObject = stream;
}

start();

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
    faceapi.draw.drawFaceExpressions(overlay, resized);
    ctx.restore();

    if (resized.length > 0) {
      const mainFace = resized.reduce((a, b) =>
        a.detection.box.area > b.detection.box.area ? a : b
      );
      const isSmiling = mainFace.expressions.happy > 0.7;

      if (isSmiling) {
        smileDuration += 0.2;
        if (smileDuration >= 3 && !smiling) {
          smileCount++;
          smiling = true;
          smileCounter.innerText = `今日の笑顔人数: ${smileCount}`;
          incrementToday();
        }
      } else {
        smileDuration = 0;
        smiling = false;
      }

      smileGauge.value = smileDuration;
      status.innerText = isSmiling
        ? smileDuration < 3
          ? "笑顔認証中…"
          : "いい笑顔！いってらっしゃい😊"
        : "笑顔が足りない😢";
    } else {
      smileDuration = 0;
      smiling = false;
      smileGauge.value = 0;
      status.innerText = "カメラを起動中...";
    }
  }, 200);
});

