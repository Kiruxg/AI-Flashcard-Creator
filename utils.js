// Global variables
export let autoSaveInterval = null;

// Utility Functions
export function showNotification(message, type = "info") {
  const notification = document.createElement("div");
  notification.className = `notification ${type}`;
  notification.textContent = message;

  document.body.appendChild(notification);

  // Trigger animation
  setTimeout(() => notification.classList.add("show"), 10);

  // Remove after 3 seconds
  setTimeout(() => {
    notification.classList.remove("show");
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

export function startAutoSave() {
  if (autoSaveInterval) {
    clearInterval(autoSaveInterval);
  }
  autoSaveInterval = setInterval(saveSession, 30000); // Save every 30 seconds
}

export function initializeSessionRecovery() {
  // Restore previous session if exists
  const savedSession = localStorage.getItem("studySession");
  if (savedSession) {
    try {
      const session = JSON.parse(savedSession);
      restoreSession(session);
    } catch (error) {
      console.error("Error restoring session:", error);
      localStorage.removeItem("studySession");
    }
  }

  startAutoSave();
}

// Helper function to save session
export function saveSession() {
  // Get currentUser from window object or auth
  const currentUser =
    window.currentUser ||
    (typeof auth !== "undefined" ? auth.currentUser : null);

  if (!currentUser) {
    console.log("No user logged in, skipping session save");
    return;
  }

  // Get flashcard-specific data if available
  const flashcardData = window.flashcards
    ? {
        flashcards: window.flashcards,
        currentCardIndex: window.currentCardIndex,
        deckName: document.getElementById("deckName")?.value,
        textInput: document.getElementById("textInput")?.value,
      }
    : null;

  const session = {
    userId: currentUser.uid,
    timestamp: Date.now(),
    ...(flashcardData || {}), // Include flashcard data if available
  };

  // Save to both storage keys to maintain compatibility
  localStorage.setItem("studySession", JSON.stringify(session));
  if (flashcardData) {
    localStorage.setItem("flashcardSession", JSON.stringify(session));
  }
}

// Helper function to restore session
export function restoreSession(session) {
  if (!session || !session.userId) return;

  // Restore flashcard data if available
  if (session.flashcards) {
    window.flashcards = session.flashcards;
    window.currentCardIndex = session.currentCardIndex;
    if (document.getElementById("deckName")) {
      document.getElementById("deckName").value = session.deckName || "";
    }
    if (document.getElementById("textInput")) {
      document.getElementById("textInput").value = session.textInput || "";
    }
  }

  // Trigger any necessary UI updates
  if (typeof window.updateFlashcard === "function") {
    window.updateFlashcard();
  }
  if (typeof window.showFlashcardViewer === "function") {
    window.showFlashcardViewer(true);
  }
  if (typeof window.showSuccessMessage === "function") {
    window.showSuccessMessage("Session restored successfully");
  }
}
