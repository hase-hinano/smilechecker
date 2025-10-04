const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const ctx = overlay.getContext("2d");
const status = document.getElementById("status");
const smileCounter = document.getElementById("smileCounter");
const smileGauge = document.getElementById("smileGauge");

// グローバル変数
let smileCount = 0;
let smileDuration = 0; // 笑顔が続いた時間
let smiling = false;   // すでにカウント中かどうか

// ---- 日ごとのログ管理 ----
function getToday() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
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

// ---- CSVボタンイベントリスナー ----
// ボタンはHTMLの最後に置くことが前提
const downloadBtn = document.getElementById("downloadBtn");
if (downloadBtn) {
  downloadBtn.addEventListener("click", downloadCSV);
} else {
  console.error("downloadBtnが見つかりません");
}

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
      let mainFace = resized.reduce((biggest, face) => {
        return face.detection.box.area > biggest.detection.box.area ? face : biggest;
      }, resized[0]);

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

      if (isSmiling) {
        if (smileDuration < 3) {
          status.innerText = "笑顔認証中…";
        } else {
          status.innerText = "いい笑顔！いってらっしゃい😊";
        }
      } else {
        status.innerText = "笑顔が足りない😢";
      }
    } else {
      smileDuration = 0;
      smiling = false;
      smileGauge.value = 0;
      status.innerText = "カメラを起動中...";
    }
  }, 200);
});
