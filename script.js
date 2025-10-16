const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const ctx = overlay.getContext("2d");
const status = document.getElementById("status");
const smileCounter = document.getElementById("smileCounter");
const smileGauge = document.getElementById("smileGauge");
const emojiDisplay = document.getElementById("emojiDisplay"); // ← 絵文字表示用
const downloadBtn = document.getElementById("downloadBtn");


let smileCount = 0;
let smileDuration = 0;
let smiling = false;

// --- 日本時間で今日の日付を取得 ---
function getToday() {
  const now = new Date();
  const jstYear = now.getFullYear();
  const jstMonth = now.getMonth() + 1;
  const jstDate = now.getDate();
  return `${jstYear}-${String(jstMonth).padStart(2, "0")}-${String(jstDate).padStart(2, "0")}`;
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
  if (!logs[today]) logs[today] = [];
  logs[today].push(new Date().toLocaleTimeString("ja-JP"));
  saveLogs(logs);
}

// --- CSVダウンロード ---
function downloadCSV() {
  const logs = getLogs();
  if (Object.keys(logs).length === 0) {
    alert("まだログがありません");
    return;
  }

  let csv = "date,time\n";
  for (let date in logs) {
    logs[date].forEach((time) => {
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

// --- 顔認識 ---
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
      const isSmiling = mainFace.expressions.happy > 0.5;

      if (isSmiling) {
        smileDuration += 0.2;
        smileGauge.value = smileDuration;

        if (smileDuration < 2) {
          status.innerText = "笑顔認証中…";
          emojiDisplay.innerText = "😊";
        } else {
          if (!smiling) {
            smileCount++;
            smiling = true;
            smileCounter.innerText = `今日の笑顔人数: ${smileCount}`;
            incrementToday();
          }
          status.innerText = "いい笑顔！いってらっしゃい😊";
          emojiDisplay.innerText = "😄";
        }

        emojiDisplay.style.opacity = 1;
      } else {
        smileDuration = 0;
        smileGauge.value = 0;
        smiling = false;
        status.innerText = "笑顔が足りない😢";
        emojiDisplay.innerText = "😢";
        emojiDisplay.style.opacity = 1;
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

