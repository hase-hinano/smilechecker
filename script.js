
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getDatabase, ref, get, set, child } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

/* -------------------------
   Firebase 設定（ここを置き換える）
   ------------------------- */
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT_ID.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

/* -------------------------
   DOM 要素
   ------------------------- */
const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const ctx = overlay.getContext("2d");
const status = document.getElementById("status");
const smileCounter = document.getElementById("smileCounter");
const smileGauge = document.getElementById("smileGauge");

/* -------------------------
   Device ID（端末識別）
   1台ごとに一意なIDを localStorage に保存
   ------------------------- */
let deviceId = localStorage.getItem("deviceId");
if (!deviceId) {
  deviceId = "tablet_" + Math.random().toString(36).slice(2, 9);
  localStorage.setItem("deviceId", deviceId);
}
console.log("deviceId:", deviceId);

/* -------------------------
   日付取得（日本時間）
   ------------------------- */
function getToday() {
  // ローカル時間（PC/タブレットの時間）を使った YYYY-MM-DD
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/* -------------------------
   localStorage 操作
   保存フォーマット: { "YYYY-MM-DD": count, ... }
   ------------------------- */
function getLocalLogs() {
  return JSON.parse(localStorage.getItem("smileLogs") || "{}");
}
function saveLocalLogs(logs) {
  localStorage.setItem("smileLogs", JSON.stringify(logs));
}

/* -------------------------
   表示初期化（当日のカウント復元）
   ------------------------- */
function initTodayCount() {
  const today = getToday();
  const logs = getLocalLogs();
  const todayCount = logs[today] || 0;
  smileCounter.innerText = `今日の笑顔人数: ${todayCount}`;
  // 内部カウントを合わせる
  smileCount = todayCount;
}
initTodayCount();

/* -------------------------
   Firebase へ保存（当端末分）
   データ構造:
   /smileLogs/{date}/{deviceId} = { count: N, timestamp: ... }
   ------------------------- */
async function saveToFirebaseForToday(deviceCount) {
  try {
    const date = getToday();
    const nodeRef = ref(db, `smileLogs/${date}/${deviceId}`);

    // 既存値を取得（単純実装：get -> set）
    const snap = await get(nodeRef);
    // we just set device-specific count to deviceCount
    await set(nodeRef, { count: deviceCount, timestamp: Date.now() });
    console.log("Firebase: saved", date, deviceId, deviceCount);
  } catch (err) {
    console.error("Firebase 保存エラー:", err);
  }
}

/* -------------------------
   ローカル + Firebase 同期で当日を +1
   ------------------------- */
async function incrementTodayBoth() {
  const today = getToday();
  const logs = getLocalLogs();
  logs[today] = (logs[today] || 0) + 1;
  saveLocalLogs(logs);

  // update UI
  smileCount = logs[today];
  smileCounter.innerText = `今日の笑顔人数: ${smileCount}`;

  // Firebaseへ端末分を保存（端末ごとの合計として上書き）
  // ※この実装は「この端末が報告する端末内合計」を保存します。
  // 他端末との合算はダウンロード時に集計します。
  await saveToFirebaseForToday(smileCount);
}

/* -------------------------
   CSV ダウンロード（Firebase から全端末分を取得して合算）
   - 可能ならFirebaseから取得して日付ごとの合計を出す
   - もしFirebaseが使えない場合は localStorage のデータのみで出力
   ------------------------- */
async function downloadCSV() {
  try {
    // Firebaseから全ログを取りに行く
    const rootRef = ref(db);
    const snap = await get(child(rootRef, "smileLogs"));
    if (snap.exists()) {
      const allData = snap.val(); // { date: { deviceId: {count, timestamp}, ... }, ... }

      // 日付ごとに合算
      const rows = [];
      const dates = Object.keys(allData).sort();
      for (const date of dates) {
        let total = 0;
        const devices = allData[date] || {};
        for (const dev in devices) {
          const rec = devices[dev];
          total += (rec && rec.count) ? Number(rec.count) : 0;
        }
        rows.push({ date, total });
      }

      // CSV 生成
      let csv = "date,total_count\n";
      for (const r of rows) {
        csv += `${r.date},${r.total}\n`;
      }

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "smile_summary_all.csv";
      link.click();
      URL.revokeObjectURL(link.href);
      return;
    } else {
      // Firebase にデータが無い場合は localStorage を使う
      const logs = getLocalLogs();
      if (Object.keys(logs).length === 0) {
        alert("まだログがありません");
        return;
      }
      let csv = "date,total_count\n";
      const dates = Object.keys(logs).sort();
      for (const d of dates) {
        csv += `${d},${logs[d]}\n`;
      }
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "smile_summary_local.csv";
      link.click();
      URL.revokeObjectURL(link.href);
      return;
    }
  } catch (err) {
    console.error("CSVダウンロードでエラー:", err);
    // フォールバック: localStorage から出す
    const logs = getLocalLogs();
    if (Object.keys(logs).length === 0) {
      alert("まだログがありません（エラー発生）");
      return;
    }
    let csv = "date,total_count\n";
    const dates = Object.keys(logs).sort();
    for (const d of dates) {
      csv += `${d},${logs[d]}\n`;
    }
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "smile_summary_local.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  }
}

/* -------------------------
   ダウンロードボタン登録（DOM準備後）
   ------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("downloadBtn");
  if (btn) {
    btn.addEventListener("click", downloadCSV);
  } else {
    console.warn("downloadBtn が見つかりません（HTML を確認して下さい）");
  }
});

/* -------------------------
   ここから先は既存の face-api 部分（ほぼそのまま）
   ------------------------- */

// グローバル変数（表示用）
let smileDuration = 0; // 笑顔が続いた時間
let smiling = false;   // すでにカウント中かどうか

async function startCameraAndModels() {
  // モデル読み込み（face-api は HTML 側で読み込まれている想定）
  await faceapi.nets.tinyFaceDetector.loadFromUri(
    "https://justadudewhohacks.github.io/face-api.js/models"
  );
  await faceapi.nets.faceExpressionNet.loadFromUri(
    "https://justadudewhohacks.github.io/face-api.js/models"
  );

  // カメラ起動
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  video.srcObject = stream;
}

// 起動
startCameraAndModels().catch(err => {
  console.error("起動エラー:", err);
  status.innerText = "カメラの起動に失敗しました";
});

// 再生開始時ループ
video.addEventListener("play", () => {
  overlay.width = video.videoWidth;
  overlay.height = video.videoHeight;

  setInterval(async () => {
    if (video.paused || video.ended) return;

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
          // カウント処理：ローカル + Firebase 同期
          await incrementTodayBoth();

          // UI 更新（incrementTodayBoth 内で更新済みだが念のため）
          smileCounter.innerText = `今日の笑顔人数: ${getLocalLogs()[getToday()] || 0}`;

          smiling = true;
        }
      } else {
        smileDuration = 0;
        smiling = false;
      }

      smileGauge.value = smileDuration;

      if (isSmiling) {
        status.innerText = smileDuration < 3 ? "笑顔認証中…" : "いい笑顔！いってらっしゃい😊";
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
