document.addEventListener("click", (event) => {
  const expand = event.target.closest(".video-expand");
  if (!expand) return;
  const video = expand.closest(".video-embed")?.querySelector("video");
  if (!video) return;

  const dialog = document.createElement("dialog");
  dialog.className = "video-dialog";
  const expandedVideo = video.cloneNode(true);
  expandedVideo.controls = true;
  expandedVideo.autoplay = true;
  const close = document.createElement("button");
  close.className = "video-close";
  close.type = "button";
  close.textContent = "close";
  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (click) => {
    if (click.target === dialog) dialog.close();
  });
  dialog.append(expandedVideo, close);
  dialog.addEventListener("close", () => {
    expandedVideo.pause();
    dialog.remove();
  }, { once: true });
  document.body.append(dialog);
  dialog.showModal();
  const playback = expandedVideo.play();
  if (playback) playback.catch(() => {});
});
