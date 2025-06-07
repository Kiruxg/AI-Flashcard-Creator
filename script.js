// AI-Assisted Input
let aiSuggestionTimeout;
const aiInput = document.getElementById("aiInput");
const aiSuggestions = document.getElementById("aiSuggestions");

if (aiInput && aiSuggestions) {
  aiInput.addEventListener(
    "input",
    debounce(async (e) => {
      const text = e.target.value.trim();
      if (text.length < 10) {
        aiSuggestions.innerHTML =
          '<div class="placeholder-text">Start typing to get AI suggestions...</div>';
        return;
      }

      try {
        const response = await fetch("/api/analyze-content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });

        if (!response.ok) throw new Error("Failed to get AI suggestions");

        const data = await response.json();
        updateAISuggestions(data.suggestions);
      } catch (error) {
        console.error("Error getting AI suggestions:", error);
        aiSuggestions.innerHTML =
          '<div class="error-text">Failed to get AI suggestions. Please try again.</div>';
      }
    }, 500)
  );
}

function updateAISuggestions(suggestions) {
  if (!suggestions || !suggestions.length) {
    aiSuggestions.innerHTML =
      '<div class="placeholder-text">No suggestions available for this content.</div>';
    return;
  }

  const suggestionsHTML = suggestions
    .map(
      (suggestion) => `
    <div class="suggestion-item">
      <div class="suggestion-header">
        <i class="fas fa-lightbulb"></i>
        <span>${suggestion.type}</span>
      </div>
      <div class="suggestion-content">
        ${suggestion.content}
      </div>
      <button class="btn btn-sm btn-primary" onclick="applySuggestion('${suggestion.id}')">
        Apply Suggestion
      </button>
    </div>
  `
    )
    .join("");

  aiSuggestions.innerHTML = suggestionsHTML;
}

// Content Upload
const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const cameraButton = document.getElementById("cameraButton");
const cameraPreview = document.getElementById("cameraPreview");
const cameraFlash = document.createElement("div");
cameraFlash.className = "camera-flash";
document.body.appendChild(cameraFlash);

if (dropZone) {
  ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(eventName, preventDefaults, false);
  });

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  ["dragenter", "dragover"].forEach((eventName) => {
    dropZone.addEventListener(eventName, highlight, false);
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(eventName, unhighlight, false);
  });

  function highlight(e) {
    dropZone.classList.add("highlight");
  }

  function unhighlight(e) {
    dropZone.classList.remove("highlight");
  }

  dropZone.addEventListener("drop", handleDrop, false);
}

async function handleDrop(e) {
  const dt = e.dataTransfer;
  const files = dt.files;
  await handleFiles(files);
}

async function handleFiles(files) {
  const file = files[0];
  if (!file) return;

  showLoading("Processing your content...", "This may take a few moments");

  try {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/process-content", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) throw new Error("Failed to process content");

    const data = await response.json();
    handleProcessedContent(data);
  } catch (error) {
    console.error("Error processing content:", error);
    showError("Failed to process content. Please try again.");
  } finally {
    hideLoading();
  }
}

// Camera Handling
if (cameraButton) {
  cameraButton.addEventListener("click", async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const video = document.createElement("video");
      video.srcObject = stream;
      video.autoplay = true;
      cameraPreview.innerHTML = "";
      cameraPreview.appendChild(video);

      // Add capture button
      const captureButton = document.createElement("button");
      captureButton.className = "btn btn-primary";
      captureButton.innerHTML = '<i class="fas fa-camera"></i> Capture';
      captureButton.onclick = () => captureImage(video, stream);
      cameraPreview.appendChild(captureButton);

      // Add gesture hint for mobile
      if ("ontouchstart" in window) {
        const hint = document.createElement("div");
        hint.className = "camera-gesture-hint";
        hint.textContent = "Tap to capture";
        cameraPreview.appendChild(hint);
      }
    } catch (error) {
      console.error("Error accessing camera:", error);
      showError(
        "Failed to access camera. Please ensure you have granted camera permissions."
      );
    }
  });
}

async function captureImage(video, stream) {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);

  // Show flash animation
  cameraFlash.classList.add("active");
  setTimeout(() => cameraFlash.classList.remove("active"), 300);

  // Stop camera stream
  stream.getTracks().forEach((track) => track.stop());

  try {
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg")
    );
    const file = new File([blob], "camera-capture.jpg", { type: "image/jpeg" });
    await handleFiles([file]);
  } catch (error) {
    console.error("Error processing captured image:", error);
    showError("Failed to process captured image. Please try again.");
  }
}

// Web Content
const urlForm = document.getElementById("urlForm");
const urlInput = document.getElementById("urlInput");
const urlPreview = document.getElementById("urlPreview");
const previewContent = document.getElementById("previewContent");

if (urlForm) {
  urlForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const url = urlInput.value.trim();
    if (!url) return;

    showLoading("Fetching content...", "This may take a few moments");

    try {
      const response = await fetch("/api/fetch-web-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) throw new Error("Failed to fetch content");

      const data = await response.json();
      updatePreview(data);
    } catch (error) {
      console.error("Error fetching web content:", error);
      showError("Failed to fetch content. Please check the URL and try again.");
    } finally {
      hideLoading();
    }
  });
}

function updatePreview(data) {
  if (!data || !data.content) {
    previewContent.innerHTML =
      '<div class="error-text">No content could be extracted from this URL.</div>';
    return;
  }

  previewContent.innerHTML = `
    <h4>${data.title || "Untitled"}</h4>
    <div class="content-preview">${data.content}</div>
  `;

  urlPreview.classList.add("show");
}

// Utility Functions
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function showLoading(message, subtitle) {
  const loadingOverlay = document.createElement("div");
  loadingOverlay.className = "loading-overlay";
  loadingOverlay.innerHTML = `
    <div class="loading-content">
      <div class="spinner"></div>
      <div class="loading-message">
        <h3>${message}</h3>
        <p class="loading-subtitle">${subtitle}</p>
      </div>
    </div>
  `;
  document.body.appendChild(loadingOverlay);
}

function hideLoading() {
  const loadingOverlay = document.querySelector(".loading-overlay");
  if (loadingOverlay) {
    loadingOverlay.remove();
  }
}

function showError(message) {
  const errorDiv = document.createElement("div");
  errorDiv.className = "error-message";
  errorDiv.textContent = message;
  document.body.appendChild(errorDiv);
  setTimeout(() => errorDiv.remove(), 5000);
}
