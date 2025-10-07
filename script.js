const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const ctx = overlay.getContext("2d");
const status = document.getElementById("status");
const smileCounter = document.getElementById("smileCounter");
const smileGauge = document.getElementById("smileGauge");

// ---- Firebase 初期化 ----
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getDatabase, ref, set, get, child } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

// 🔹ここを書き換える（Firebaseの設定情報に）🔹
const firebaseConfig = {
  apiKey: "あなたのAPIキー",
  authDomain: "あなたのプロジェクトID.firebaseapp.com",
  databaseURL: "https://あなたのプロジェクトID.firebaseio.com",
  projectId: "あなたのプロジェクトID",
  storageBucket: "あなたのプロジェクトID.appspot.com",
  messagingSenderId: "送信者ID",
  appId: "アプリID"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ---- グローバル変数 ----
let smileCount = 0;
let smileDuration = 0;
let smiling = false;

// ---- 日ごとのログ管理（日本時間対応） ----
function getToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getLogs() {
  return JSON.parse(localStorage.getItem("smileLogs") || "{}");
}

function saveLogs(logs) {
  localStorage.setItem("smileLogs", JSON.stringify(logs));
}

// ---- ローカル＋Firebase両方に記録 ----
async function incrementToday() {
  const today = getToday();

  // 🔸ローカル保存
  const logs = getLogs();
  logs[today] = (logs[today] || 0) + 1;
  saveLogs(logs);

  // 🔸Firebase保存（全タブレット共有）
  const dbRef = ref(db, `smileLogs/${today}`);
  const snapshot = await get(dbRef);

  let total = 1;
  if (snapshot.exists()) {
    total = snapshot.val().count + 1;
  }

  await set(dbRef, { count: total });
  console.log(`Firebase保存完了: ${today} → ${total}`);
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

// ---- ボタンイベント ----
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

// ---- 笑顔検出ループ ----
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
          incrementToday(); // ← Firebase + ローカル 両方更新
        }
      } else {
        smileDuration = 0;
        smiling = false;
      }

      smileGauge.value = smileDuration;
      status.innerText =
        isSmiling
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
