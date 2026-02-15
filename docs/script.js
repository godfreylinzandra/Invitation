const DEFAULT_INVITE = {
  couple: "Anna & Mark",
  date: "March 20, 2026",
  location: "Manila, Philippines"
};

const MOCK_GALLERY = [
  {
    url: "https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=1200&q=80",
    alt: "Bride and groom smiling under flower arch"
  },
  {
    url: "https://images.unsplash.com/photo-1520854221256-17451cc331bf?auto=format&fit=crop&w=1200&q=80",
    alt: "Wedding rings and bouquet"
  },
  {
    url: "https://images.unsplash.com/photo-1522673607200-164d1b6ce486?auto=format&fit=crop&w=1200&q=80",
    alt: "Guests celebrating at reception"
  }
];

const SUPABASE_URL = globalThis.SUPABASE_URL || "";
const SUPABASE_KEY = globalThis.SUPABASE_ANON_KEY || "";
const BUCKET = globalThis.SUPABASE_BUCKET || "";
const hasSupabaseConfig = Boolean(SUPABASE_URL && SUPABASE_KEY && BUCKET);
let supabase = null;

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const previewImg = document.getElementById("preview");
const fileInput = document.getElementById("fileInput");
const captureBtn = document.getElementById("capture");
const flipCameraBtn = document.getElementById("flipCamera");
const uploadBtn = document.getElementById("upload");
const statusText = document.getElementById("status");
const gallery = document.getElementById("gallery");
const photoCount = document.getElementById("photoCount");
const galleryUploadInput = document.getElementById("galleryUploadInput");
const galleryUploadStatus = document.getElementById("galleryUploadStatus");
const galleryQrImage = document.getElementById("galleryQrImage");
const galleryLink = document.getElementById("galleryLink");
let activeStream = null;
let currentFacingMode = "environment";
let supabaseInitAttempted = false;

async function ensureSupabaseClient() {
  if (!hasSupabaseConfig || supabase) return supabase;
  if (supabaseInitAttempted) return null;
  supabaseInitAttempted = true;

  try {
    if (globalThis.supabase?.createClient) {
      supabase = globalThis.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      return supabase;
    }

    const module = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/supabase.js");
    supabase = module.createClient(SUPABASE_URL, SUPABASE_KEY);
    return supabase;
  } catch (err) {
    console.warn("Supabase SDK unavailable. Falling back to local storage mode.", err);
    return null;
  }
}

function setStatus(message) {
  if (statusText) statusText.innerText = message;
}

function setGalleryUploadStatus(message) {
  if (galleryUploadStatus) galleryUploadStatus.innerText = message;
}

function initGalleryShareTools() {
  if (!galleryQrImage || !galleryLink) return;

  const galleryUrl = new URL("gallery.html", window.location.href).toString();
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(galleryUrl)}`;

  galleryQrImage.src = qrUrl;
  galleryLink.href = galleryUrl;
  galleryLink.textContent = galleryUrl;
}

function getLocalPhotos() {
  try {
    return JSON.parse(localStorage.getItem("weddingPhotos") || "[]");
  } catch {
    return [];
  }
}

function saveLocalPhoto(dataUrl) {
  const photos = getLocalPhotos();
  photos.unshift({
    id: Date.now(),
    url: dataUrl,
    alt: `Wedding memory from ${DEFAULT_INVITE.couple}`
  });
  localStorage.setItem("weddingPhotos", JSON.stringify(photos.slice(0, 50)));
}

function clearCapturedPreview() {
  if (!previewImg) return;
  previewImg.hidden = true;
  previewImg.removeAttribute("src");
  if (canvas) {
    canvas.width = 0;
    canvas.height = 0;
  }
}

async function uploadBlobToStorage(blob) {
  const supabaseClient = await ensureSupabaseClient();
  if (hasSupabaseConfig && supabaseClient) {
    const fileName = `photo-${Date.now()}.jpg`;
    const { error } = await supabaseClient.storage.from(BUCKET).upload(fileName, blob);
    if (error) throw error;
    return "remote";
  }

  const localDataUrl = await new Promise(resolve => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(blob);
  });
  if (localDataUrl) saveLocalPhoto(localDataUrl);
  return "local";
}

function stopCameraStream() {
  if (!activeStream) return;
  activeStream.getTracks().forEach(track => track.stop());
  activeStream = null;
}

async function requestCameraStream() {
  const preferred = [
    {
      video: {
        facingMode: { ideal: currentFacingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    },
    {
      video: {
        facingMode: currentFacingMode
      },
      audio: false
    },
    {
      video: true,
      audio: false
    }
  ];

  let lastError = null;
  for (const constraints of preferred) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError;
}

async function startCamera() {
  if (!video || !captureBtn) return;

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setStatus("Camera API is not available in this browser.");
    return;
  }

  try {
    stopCameraStream();
    const stream = await requestCameraStream();
    activeStream = stream;

    let cameraReady = false;
    const onCameraReady = () => {
      if (cameraReady) return;
      cameraReady = true;
      captureBtn.disabled = false;
      if (flipCameraBtn) flipCameraBtn.disabled = false;
      setStatus(hasSupabaseConfig ? "Camera ready." : "Camera ready. Mock mode is active.");
    };

    video.addEventListener("loadedmetadata", onCameraReady, { once: true });
    video.addEventListener("canplay", onCameraReady, { once: true });

    video.srcObject = activeStream;
    await video.play();

    if (video.readyState >= 1) {
      onCameraReady();
    }
  } catch (err) {
    console.error("Camera error:", err);
    const secureHint = window.location.protocol === "https:" || window.location.hostname === "localhost"
      ? "Please check permission settings."
      : "Use HTTPS or localhost, then allow camera permissions.";
    setStatus(`Cannot access camera. ${secureHint}`);
  }
}

async function flipCamera() {
  currentFacingMode = currentFacingMode === "environment" ? "user" : "environment";
  setStatus("Switching camera...");
  await startCamera();
}

function capturePhoto() {
  if (!video || !canvas || !previewImg || !uploadBtn) return;

  if (!video.videoWidth || !video.videoHeight) {
    setStatus("Camera is still loading. Try again in a moment.");
    return;
  }

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    setStatus("Unable to capture image from camera.");
    return;
  }

  context.drawImage(video, 0, 0);
  previewImg.src = canvas.toDataURL("image/jpeg", 0.9);
  previewImg.hidden = false;
  uploadBtn.disabled = false;
  setStatus("Photo captured.");
}

function handleFallbackFile(event) {
  if (!canvas || !previewImg || !uploadBtn) return;
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const image = new Image();
    image.onload = () => {
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      if (!context) {
        setStatus("Unable to process selected image.");
        return;
      }
      context.drawImage(image, 0, 0);
      previewImg.src = canvas.toDataURL("image/jpeg", 0.9);
      previewImg.hidden = false;
      uploadBtn.disabled = false;
      setStatus("Photo selected. Ready to upload.");
    };
    image.src = String(reader.result);
  };
  reader.readAsDataURL(file);
}

async function handleGalleryUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  setGalleryUploadStatus("Uploading photo...");
  try {
    await uploadBlobToStorage(file);
    setGalleryUploadStatus("Photo uploaded to gallery.");
    await loadGallery();
  } catch (error) {
    console.error(error);
    setGalleryUploadStatus("Upload failed. Please try another photo.");
  } finally {
    event.target.value = "";
  }
}

async function uploadPhoto() {
  if (!canvas) return;

  const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.9));
  if (!blob) {
    setStatus("No photo found. Capture first.");
    return;
  }

  try {
    const destination = await uploadBlobToStorage(blob);
    setStatus(destination === "remote" ? "Uploaded successfully. Opening gallery..." : "Saved locally in mock mode. Opening gallery...");
    clearCapturedPreview();
  } catch (error) {
    console.error(error);
    setStatus("Upload failed. Please try again.");
    return;
  }

  if (uploadBtn) uploadBtn.disabled = true;
  loadGallery();
  window.setTimeout(() => {
    window.location.href = "gallery.html";
  }, 500);
}

function renderGallery(items) {
  if (!gallery) return;

  gallery.innerHTML = "";
  if (photoCount) {
    photoCount.innerText = `${items.length} photo${items.length === 1 ? "" : "s"}`;
  }
  items.forEach(item => {
    const img = document.createElement("img");
    img.src = item.url;
    img.alt = item.alt || "Wedding photo";
    img.loading = "lazy";
    gallery.appendChild(img);
  });
}

async function loadGallery() {
  if (!gallery) return;
  const supabaseClient = await ensureSupabaseClient();

  if (hasSupabaseConfig && supabaseClient) {
    const { data: files, error } = await supabaseClient.storage.from(BUCKET).list();
    if (!error && files?.length) {
      const photos = files.map(file => {
        const { data } = supabaseClient.storage.from(BUCKET).getPublicUrl(file.name);
        return { url: data.publicUrl, alt: `${DEFAULT_INVITE.couple} wedding memory` };
      });
      renderGallery(photos);
      return;
    }
  }

  const local = getLocalPhotos();
  renderGallery(local.length ? local : MOCK_GALLERY);
}

if (captureBtn) captureBtn.addEventListener("click", capturePhoto);
if (flipCameraBtn) flipCameraBtn.addEventListener("click", flipCamera);
if (uploadBtn) uploadBtn.addEventListener("click", uploadPhoto);
if (fileInput) fileInput.addEventListener("change", handleFallbackFile);
if (galleryUploadInput) galleryUploadInput.addEventListener("change", handleGalleryUpload);

startCamera();
loadGallery();
initGalleryShareTools();

window.addEventListener("beforeunload", stopCameraStream);

