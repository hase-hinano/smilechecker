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

// --- 日本時間で今日の日付を取得（安全版） ---
function getToday() {
  const now = new Date();
  // JSTの年、月、日を直接取得
  const jstYear  = now.getFullYear();
  const jstMonth = now.getMonth() + 1; // 0始まりなので+1
  const jstDate  = now.getDate();

  // 常にYYYY-MM-DD形式に整形
  const y = jstYear;
  const m = String(jstMonth).padStart(2, "0");
  const d = String(jstDate).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// --- ログ管理 ---
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
}

// --- CSVダウンロード ---
function downloadCSV() {
  const logs = getLogs();
  if (Object.keys(logs).length === 0) {
    alert("まだログがありません");
    return;
  }

  let csv = "date,total_count\n";
  for (let date in logs) csv += `${date},${logs[date]}\n`;

  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "smile_logs.csv";
  a.click();
}
downloadBtn.addEventListener("click", downloadCSV);

// --- 顔認識 ---
async function start() {
  await faceapi.nets.tinyFaceDetector.loadFromUri("https://justadudewhohacks.github.io/face-api.js/models");
  await faceapi.nets.faceExpressionNet.loadFromUri("https://justadudewhohacks.github.io/face-api.js/models");

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

    const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
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
      const mainFace = resized.reduce((a, b) => a.detection.box.area > b.detection.box.area ? a : b);
      const isSmiling = mainFace.expressions.happy > 0.7;

      if (isSmiling) {
        smileDuration += 0.2;
        if (smileDuration >= 1.5 && !smiling) {
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
        ? (smileDuration < 1.5 ? "笑顔認証中…" : "いい笑顔！いってらっしゃい😊")
        : "笑顔が足りない😢";
    } else {
      smileDuration = 0;
      smiling = false;
      smileGauge.value = 0;
      status.innerText = "カメラを起動中...";
    }
  }, 200);
});




