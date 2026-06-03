const overlay = document.getElementById("videoOverlay");
const video = document.getElementById("manualVideo");
const videoTitle = document.getElementById("videoTitle");
const closeVideoBtn = document.getElementById("closeVideoBtn");
const manualButtons = document.querySelectorAll("[data-video-src]");

function exitFullscreenIfNeeded() {
  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
}

function closeVideo() {
  exitFullscreenIfNeeded();
  video.pause();
  video.removeAttribute("src");
  video.load();
  overlay.hidden = true;
  document.body.classList.remove("video-open");
}

async function requestVideoFullscreen() {
  try {
    if (video.requestFullscreen) {
      await video.requestFullscreen();
      return;
    }
    if (video.webkitEnterFullscreen) {
      video.webkitEnterFullscreen();
    }
  } catch {
    // Some phones block fullscreen; the overlay player remains usable.
  }
}

async function openVideo(button) {
  const src = button.dataset.videoSrc || "";
  const title = button.dataset.videoTitle || "V\u00eddeo manual";
  if (!src) return;

  videoTitle.textContent = title;
  video.src = src;
  overlay.hidden = false;
  document.body.classList.add("video-open");
  video.load();

  try {
    await video.play();
  } catch {
    // If autoplay with sound is blocked, controls are already visible.
  }

  await requestVideoFullscreen();
}

manualButtons.forEach((button) => {
  button.addEventListener("click", () => openVideo(button));
});

closeVideoBtn.addEventListener("click", closeVideo);

overlay.addEventListener("click", (event) => {
  if (event.target === overlay) closeVideo();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !overlay.hidden) closeVideo();
});
