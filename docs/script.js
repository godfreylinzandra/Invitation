let SUPABASE_URL = globalThis.SUPABASE_URL || "";
let SUPABASE_KEY = globalThis.SUPABASE_ANON_KEY || "";
let BUCKET = globalThis.SUPABASE_BUCKET || "";
let PUBLIC_SITE_URL = globalThis.PUBLIC_SITE_URL || "";
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
const qrImage = document.getElementById("qrImage");
const qrLink = document.getElementById("qrLink");
let activeStream = null;
let currentFacingMode = "environment";
let supabaseInitAttempted = false;
let publicConfigPromise = null;
let supabaseSdkPromise = null;

function hasSupabaseConfig() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY && BUCKET);
}

async function loadPublicConfig() {
  if (publicConfigPromise) return publicConfigPromise;
  publicConfigPromise = (async () => {
    if (hasSupabaseConfig()) return;
    if (!window.location.protocol.startsWith("http")) return;

    try {
      const response = await fetch("/.netlify/functions/public-config", { cache: "no-store" });
      if (!response.ok) return;
      const config = await response.json();
      SUPABASE_URL = config.SUPABASE_URL || SUPABASE_URL;
      SUPABASE_KEY = config.SUPABASE_ANON_KEY || SUPABASE_KEY;
      BUCKET = config.SUPABASE_BUCKET || BUCKET || "wedding-photos";
    } catch (error) {
      console.warn("Public config unavailable.", error);
    }
  })();

  return publicConfigPromise;
}

async function ensureSupabaseClient() {
  await loadPublicConfig();
  if (!hasSupabaseConfig()) {
    throw new Error("Supabase config is missing. Check docs/config.js or Netlify environment variables.");
  }
  if (supabase) return supabase;
  if (supabaseInitAttempted) {
    throw new Error("Supabase initialization failed.");
  }
  supabaseInitAttempted = true;

  try {
    await ensureSupabaseSdk();
    supabase = globalThis.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    return supabase;
  } catch (err) {
    throw new Error(`Supabase SDK unavailable: ${err instanceof Error ? err.message : "unknown error"}`);
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-sdk=\"${src}\"]`);
    if (existing) {
      if (globalThis.supabase?.createClient) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.defer = true;
    script.dataset.sdk = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

async function ensureSupabaseSdk() {
  if (globalThis.supabase?.createClient) return;
  if (supabaseSdkPromise) return supabaseSdkPromise;

  const sources = [
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
    "https://unpkg.com/@supabase/supabase-js@2"
  ];

  supabaseSdkPromise = (async () => {
    let lastError = null;
    for (const src of sources) {
      try {
        await loadScript(src);
        if (globalThis.supabase?.createClient) return;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error("Supabase browser SDK could not be loaded.");
  })();

  return supabaseSdkPromise;
}

function setStatus(message) {
  if (statusText) statusText.innerText = message;
}

function setGalleryUploadStatus(message) {
  if (galleryUploadStatus) galleryUploadStatus.innerText = message;
}

function getErrorMessage(error) {
  if (!error) return "Unknown error.";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message || "Unknown error.";
  if (typeof error === "object" && "message" in error) return String(error.message || "Unknown error.");
  return "Unknown error.";
}

function getPublicBaseUrl() {
  const configured = String(PUBLIC_SITE_URL || "").trim();
  if (configured) return configured.replace(/\/+$/, "");

  const host = window.location.hostname;
  const isLocalhost = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (isLocalhost) return "";
  return window.location.origin.replace(/\/+$/, "");
}

function initQrPage() {
  if (!qrImage || !qrLink) return;
  const qrTarget = document.body?.dataset?.qrTarget;
  if (!qrTarget) return;

  const publicBaseUrl = getPublicBaseUrl();
  if (!publicBaseUrl) {
    qrImage.removeAttribute("src");
    qrLink.removeAttribute("href");
    qrLink.textContent = "Set window.PUBLIC_SITE_URL in config.js to generate a public QR link.";
    return;
  }

  const targetUrl = new URL(qrTarget, `${publicBaseUrl}/`).toString();
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(targetUrl)}`;

  qrImage.src = qrUrl;
  qrLink.href = targetUrl;
  qrLink.textContent = targetUrl;
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
  const random = Math.random().toString(36).slice(2, 10);
  const fileName = `photo-${Date.now()}-${random}.jpg`;
  const { error: uploadError } = await supabaseClient.storage.from(BUCKET).upload(fileName, blob);
  if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

  const { data } = supabaseClient.storage.from(BUCKET).getPublicUrl(fileName);
  if (!data?.publicUrl) throw new Error("Storage upload succeeded but no public URL was returned.");

  const { error: insertError } = await supabaseClient.from("wedding_photos").insert({
    file_name: fileName,
    public_url: data.publicUrl,
    uploaded_by: "guest"
  });
  if (insertError) {
    console.warn("Metadata insert failed, but image upload succeeded:", insertError);
  }
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
      setStatus("Camera ready.");
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
    setGalleryUploadStatus(`Upload failed: ${getErrorMessage(error)}`);
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
    await uploadBlobToStorage(blob);
    setStatus("Uploaded successfully. Opening gallery...");
    clearCapturedPreview();
  } catch (error) {
    console.error(error);
    setStatus(`Upload failed: ${getErrorMessage(error)}`);
    return;
  }

  if (uploadBtn) uploadBtn.disabled = true;
  await loadGallery();
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

  try {
    const supabaseClient = await ensureSupabaseClient();

    const { data: rows, error: dbError } = await supabaseClient
      .from("wedding_photos")
      .select("public_url, created_at")
      .order("created_at", { ascending: false });

    if (!dbError && rows?.length) {
      const photos = rows.map(row => ({
        url: row.public_url,
        alt: "Wedding memory"
      }));
      renderGallery(photos);
      return;
    }
    renderGallery([]);
  } catch (error) {
    console.error(error);
    renderGallery([]);
    setGalleryUploadStatus(`Unable to load gallery: ${getErrorMessage(error)}`);
  }
}

if (captureBtn) captureBtn.addEventListener("click", capturePhoto);
if (flipCameraBtn) flipCameraBtn.addEventListener("click", flipCamera);
if (uploadBtn) uploadBtn.addEventListener("click", uploadPhoto);
if (fileInput) fileInput.addEventListener("change", handleFallbackFile);
if (galleryUploadInput) galleryUploadInput.addEventListener("change", handleGalleryUpload);

startCamera();
loadGallery();
initQrPage();

window.addEventListener("beforeunload", stopCameraStream);
