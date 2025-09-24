const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const ctx = overlay.getContext("2d");
const status = document.getElementById("status");

async function start() {
  // face-api.js のモデルをCDNから読み込み
  await faceapi.nets.tinyFaceDetector.loadFromUri(
    "https://justadudewhohacks.github.io/face-api.js/models"
  );
  await faceapi.nets.faceExpressionNet.loadFromUri(
    "https://justadudewhohacks.github.io/face-api.js/models"
  );

  // カメラを起動
  navigator.mediaDevices.getUserMedia({ video: true }).then((stream) => {
    video.srcObject = stream;
  });
}

video.addEventListener("play", () => {
  overlay.width = video.width;
  overlay.height = video.height;

  setInterval(async () => {
    const displaySize = { width: video.width, height: video.height };
    faceapi.matchDimensions(overlay, displaySize);

    // 顔検出
    const detections = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceExpressions();

    // 検出結果をキャンバスサイズに合わせる
    const resized = faceapi.resizeResults(detections, displaySize);

    // 描画のたびにクリア
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    // 左右反転して描画
    ctx.save();
    ctx.scale(-1, 1);
    ctx.translate(-overlay.width, 0);

    faceapi.draw.drawDetections(overlay, resized);
    faceapi.draw.drawFaceExpressions(overlay, resized);

    ctx.restore();

    // ステータス更新（笑顔検出）
    if (resized.length > 0 && resized[0].expressions) {
      if (resized[0].expressions.happy > 0.7) {
        status.innerText = "いい笑顔！いってらっしゃい😊 ";
      } else {
        status.innerText = "笑顔が足りない😢";
      }
    } else {
      status.innerText = "カメラを起動中...";
    }
  }, 200);
});

start();
