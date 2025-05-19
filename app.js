import {
  auth,
  db,
  PRICES,
  FREE_TIER_LIMITS,
  AUTH_ERROR_MESSAGES,
} from "./config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut,
  sendEmailVerification,
  applyActionCode,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  increment,
  collection,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { SpacedRepetition } from "./spacedRepetition.js";
import { SubscriptionManager } from "./subscription.js";
import { DeckManager } from "./deckManager.js";

$(document).ready(function () {
  // Initialize variables
  let flashcards = [];
  let currentCardIndex = 0;
  let isFlipped = false;
  let currentUser = null;
  let userDecks = [];
  let monthlyCardCount = 0;
  let spacedRepetition = new SpacedRepetition();
  let deckManager = null;
  let autoSaveInterval = null;
  let lastSavedState = null;
  let isGenerating = false;
  let networkStatus = {
    online: navigator.onLine,
    lastCheck: Date.now(),
  };
  let loadingStartTime = 0;
  const MIN_LOADING_TIME = 1500; // Minimum time to show loading indicator (1.5 seconds)
  let lastGenerationTime = null;
  const FREE_TIER_COOLDOWN = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  // Initialize PDF.js
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  // Initialize Google Auth Provider
  const googleProvider = new GoogleAuthProvider();

  // Initialize subscription manager
  const subscriptionManager = new SubscriptionManager();
  subscriptionManager.initialize();

  // Initialize deck manager when user logs in
  onAuthStateChanged(auth, async (user) => {
    try {
      if (user) {
        console.log("User authenticated:", user.uid);
        currentUser = user;
        deckManager = new DeckManager(user.uid);

        // Update desktop view
        const userMenu = document.getElementById("userMenu");
        const showLoginBtn = document.getElementById("showLoginBtn");
        const userEmail = document.getElementById("userEmail");

        // Update mobile view
        const mobileUserEmail = document.getElementById("mobileUserEmail");
        const mobileShowLoginBtn =
          document.getElementById("mobileShowLoginBtn");
        const mobileLogoutBtn = document.getElementById("mobileLogoutBtn");

        if (window.innerWidth > 768) {
          // Desktop view
          if (userMenu) userMenu.style.display = "flex";
          if (showLoginBtn) showLoginBtn.style.display = "none";
          if (userEmail) userEmail.textContent = user.email;
        } else {
          // Mobile view
          if (mobileUserEmail) mobileUserEmail.textContent = user.email;
          if (mobileShowLoginBtn) mobileShowLoginBtn.style.display = "none";
          if (mobileLogoutBtn) mobileLogoutBtn.style.display = "block";
        }

        // Wait for auth state to be fully initialized
        await new Promise((resolve) => setTimeout(resolve, 100));

        try {
          await loadUserDecks();
          await loadStudyProgress();
          await updateSubscriptionUI();
          updatePremiumFeatures();
        } catch (error) {
          console.error("Error initializing user data:", error);
          if (error.code === "permission-denied") {
            // Force a token refresh and retry
            await user.getIdToken(true);
            await loadUserDecks();
            await loadStudyProgress();
            await updateSubscriptionUI();
            updatePremiumFeatures();
          }
        }
      } else {
        console.log("User signed out");
        currentUser = null;
        deckManager = null;

        // Update desktop view
        const userMenu = document.getElementById("userMenu");
        const showLoginBtn = document.getElementById("showLoginBtn");
        const userEmail = document.getElementById("userEmail");

        // Update mobile view
        const mobileUserEmail = document.getElementById("mobileUserEmail");
        const mobileShowLoginBtn =
          document.getElementById("mobileShowLoginBtn");
        const mobileLogoutBtn = document.getElementById("mobileLogoutBtn");

        if (window.innerWidth > 768) {
          // Desktop view
          if (userMenu) userMenu.style.display = "none";
          if (showLoginBtn) showLoginBtn.style.display = "block";
          if (userEmail) userEmail.textContent = "";
        } else {
          // Mobile view
          if (mobileUserEmail) mobileUserEmail.textContent = "";
          if (mobileShowLoginBtn) mobileShowLoginBtn.style.display = "block";
          if (mobileLogoutBtn) mobileLogoutBtn.style.display = "none";
        }

        userDecks = [];
        updateDeckList();
      }
    } catch (error) {
      console.error("Error in auth state change handler:", error);
      // Show error to user if it's a critical error
      if (error.code === "auth/network-request-failed") {
        showErrorMessage("Network error. Please check your connection.");
      }
    }
  });

  // Auth UI functions
  function updateAuthUI() {
    if (currentUser) {
      $("#userEmail").text(currentUser.email);
      document.getElementById("userEmail").style.display = "block";
      document.getElementById("loginBtn").style.display = "none";
      document.getElementById("logoutBtn").style.display = "block";
      $("#authModal").hide();
      $("#resetPasswordModal").hide();
      // Clear any error messages
      $(".auth-error").remove();
      // Clear form inputs
      $(".auth-form input").val("");
    } else {
      document.getElementById("userEmail").style.display = "none";
      document.getElementById("loginBtn").style.display = "block";
      document.getElementById("logoutBtn").style.display = "none";
    }
  }

  function showAuthError(message, formId) {
    // Remove any existing error messages in the specific form
    $(`#${formId} .auth-error`).remove();
    // Add new error message
    $(`#${formId}`).prepend(`<div class="auth-error">${message}</div>`);
  }

  // Modal functions
  function showModal(modalId) {
    $(`#${modalId}`).show();
    // Clear any existing error messages
    $(`#${modalId} .auth-error`).remove();
    // Clear form inputs
    $(`#${modalId} input`).val("");
  }

  function hideModal(modalId) {
    $(`#${modalId}`).hide();
    // Clear any error messages
    $(`#${modalId} .auth-error`).remove();
    // Clear form inputs
    $(`#${modalId} input`).val("");
  }

  // Show login modal
  $(document).on("click", "#showLoginBtn", function () {
    showModal("authModal");
    // Reset to login tab
    $("#authTabs .tab-btn").removeClass("active");
    $("#authTabs .tab-btn[data-tab='login']").addClass("active");
    $(".auth-form").hide();
    $("#loginForm").show();
  });

  // Close modal when clicking the close button
  $(document).on("click", ".close", function () {
    const modalId = $(this).closest(".modal").attr("id");
    hideModal(modalId);
  });

  // Close modal when clicking outside
  $(window).on("click", function (event) {
    if ($(event.target).hasClass("modal")) {
      hideModal($(event.target).attr("id"));
    }
  });

  // Switch between login and signup tabs
  $(document).on("click", "#authTabs .tab-btn", function () {
    const tab = $(this).data("tab");
    $("#authTabs .tab-btn").removeClass("active");
    $(this).addClass("active");
    $(".auth-form").hide();
    $(`#${tab}Form`).show();
  });

  // Show verification required message
  function showVerificationRequired() {
    const $container = $(".container");
    // Remove any existing verification message
    $("#verificationRequired").remove();

    // Add verification required message
    $container.prepend(`
      <div id="verificationRequired" class="verification-required">
        <div class="verification-content">
          <h3>Email Verification Required</h3>
          <p>Please verify your email address to access all features.</p>
          <p>Check your inbox for the verification email.</p>
          <button id="resendVerificationBtn" class="btn btn-primary">Resend Verification Email</button>
        </div>
      </div>
    `);
  }

  // Handle resend verification email
  $(document).on("click", "#resendVerificationBtn", async function () {
    if (!currentUser) return;

    try {
      await sendEmailVerification(currentUser);
      alert("Verification email has been sent. Please check your inbox.");
    } catch (error) {
      showAuthError(
        AUTH_ERROR_MESSAGES[error.code] || "Error sending verification email.",
        "verificationRequired"
      );
    }
  });

  // Login form submission
  $("#loginForm").on("submit", async function (e) {
    e.preventDefault();
    const email = $("#loginEmail").val();
    const password = $("#loginPassword").val();

    if (!email || !password) {
      showAuthError("Please enter both email and password", "loginForm");
      return;
    }

    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      if (!userCredential.user.emailVerified) {
        // Sign out the user if email is not verified
        await signOut(auth);
        showAuthError(
          "Please verify your email before logging in. Check your inbox for the verification email.",
          "loginForm"
        );
        return;
      }

      hideModal("authModal");
    } catch (error) {
      showAuthError(
        AUTH_ERROR_MESSAGES[error.code] || "An error occurred during login.",
        "loginForm"
      );
    }
  });

  // Signup form submission
  $("#signupForm").on("submit", async function (e) {
    e.preventDefault();
    const email = $("#signupEmail").val();
    const password = $("#signupPassword").val();
    const confirmPassword = $("#confirmPassword").val();

    if (!email || !password || !confirmPassword) {
      showAuthError("Please fill in all fields", "signupForm");
      return;
    }

    if (password.length < 6) {
      showAuthError(
        "Password should be at least 6 characters long",
        "signupForm"
      );
      return;
    }

    if (password !== confirmPassword) {
      showAuthError("Passwords do not match", "signupForm");
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      // Send verification email
      await sendEmailVerification(userCredential.user);

      // Create user document
      await setDoc(doc(db, "users", userCredential.user.uid), {
        email: email,
        createdAt: new Date(),
        lastLogin: new Date(),
        isPremium: false,
        cardsGenerated: 0,
        decksCreated: 0,
        tokenUsage: {},
        emailVerified: false,
      });

      hideModal("authModal");
      alert("Account created! Please check your email to verify your account.");
    } catch (error) {
      showAuthError(
        AUTH_ERROR_MESSAGES[error.code] || "An error occurred during signup.",
        "signupForm"
      );
    }
  });

  // Google login (Google accounts are pre-verified)
  $(document).on("click", "#googleLoginBtn", async function () {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      // Check if user document exists, if not create it
      const userRef = doc(db, "users", result.user.uid);
      const docSnap = await getDoc(userRef);
      if (!docSnap.exists()) {
        await setDoc(userRef, {
          email: result.user.email,
          createdAt: new Date(),
          lastLogin: new Date(),
          isPremium: false,
          cardsGenerated: 0,
          decksCreated: 0,
          tokenUsage: {},
          emailVerified: true, // Google accounts are pre-verified
        });
      }
      hideModal("authModal");
    } catch (error) {
      showAuthError(
        AUTH_ERROR_MESSAGES[error.code] ||
          "An error occurred during Google login.",
        "loginForm"
      );
    }
  });

  // Forgot password
  $(document).on("click", "#forgotPasswordBtn", function () {
    hideModal("authModal");
    showModal("resetPasswordModal");
  });

  // Password reset form submission
  $("#resetPasswordForm").on("submit", async function (e) {
    e.preventDefault();
    const email = $("#resetEmail").val();

    if (!email) {
      showAuthError("Please enter your email address", "resetPasswordForm");
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      hideModal("resetPasswordModal");
      alert("Password reset link has been sent to your email.");
    } catch (error) {
      showAuthError(
        AUTH_ERROR_MESSAGES[error.code] ||
          "An error occurred while sending reset email.",
        "resetPasswordForm"
      );
    }
  });

  // Logout
  $(document).on("click", "#logoutBtn", async function () {
    try {
      await signOut(auth);
      currentUser = null;
      updateAuthUI();
    } catch (error) {
      console.error("Error signing out:", error);
      alert("Error signing out. Please try again.");
    }
  });

  // Deck management
  async function loadUserDecks() {
    if (!deckManager) {
      console.warn(
        "Deck manager not initialized. User may not be authenticated."
      );
      return;
    }

    if (!currentUser) {
      console.warn("No current user found. User may have been logged out.");
      return;
    }

    try {
      // Ensure we have a fresh token
      await currentUser.getIdToken(true);

      console.log("Loading decks for user:", currentUser.uid);
      userDecks = await deckManager.loadDecks();
      console.log("Successfully loaded decks:", userDecks.length);
      updateDeckList(userDecks);
    } catch (error) {
      console.error("Error loading decks:", error);
      console.error("Error details:", {
        code: error.code,
        message: error.message,
        stack: error.stack,
        userId: currentUser?.uid,
        isAuthenticated: !!currentUser,
        authState: auth.currentUser ? "authenticated" : "not authenticated",
      });

      // Check if the error is due to authentication
      if (
        error.code === "permission-denied" ||
        error.message.includes("permission")
      ) {
        console.warn(
          "Authentication error detected. Attempting to refresh auth state..."
        );

        try {
          // Force a token refresh
          await currentUser.getIdToken(true);
          // Reload the user to ensure auth state is fresh
          await currentUser.reload();

          // If still authenticated, try loading decks again
          if (auth.currentUser) {
            console.log("Auth state refreshed, retrying deck load...");
            userDecks = await deckManager.loadDecks();
            updateDeckList(userDecks);
            return;
          } else {
            console.error("User no longer authenticated after refresh");
            showErrorMessage("Session expired. Please log in again.");
            // Trigger a sign out to clear the invalid state
            await signOut(auth);
          }
        } catch (retryError) {
          console.error("Failed to refresh auth state:", retryError);
          showErrorMessage("Authentication error. Please log in again.");
          // Trigger a sign out to clear the invalid state
          await signOut(auth);
        }
      } else if (
        error.code === "unavailable" ||
        error.code === "network-request-failed"
      ) {
        showErrorMessage(
          "Network error. Please check your connection and try again."
        );
      } else {
        showErrorMessage("Failed to load decks. Please try again.");
      }
    }
  }

  // Add success message function
  function showSuccessMessage(message) {
    // Remove any existing messages
    $(".success-message, .error-message").remove();

    const $message = $(`
      <div class="success-message">
        <p style="margin: 0;">${message}</p>
        <button class="close-toast" style="position: absolute; top: 8px; right: 8px; background: none; border: none; color: inherit; cursor: pointer; opacity: 0.7; hover: opacity: 1;">×</button>
      </div>
    `);

    $("body").append($message);

    // Add close button functionality
    $message.find(".close-toast").on("click", function () {
      $message.addClass("fade-out");
      setTimeout(() => $message.remove(), 300);
    });

    // Auto-hide after 5 seconds
    setTimeout(() => {
      if ($message.is(":visible")) {
        $message.addClass("fade-out");
        setTimeout(() => $message.remove(), 300);
      }
    }, 5000);
  }

  // Add error message display function
  function showErrorMessage(message) {
    // Remove any existing messages
    $(".success-message, .error-message").remove();

    const $message = $(`
      <div class="error-message">
        <p style="margin: 0;">${message}</p>
        <button class="close-toast" style="position: absolute; top: 8px; right: 8px; background: none; border: none; color: inherit; cursor: pointer; opacity: 0.7; hover: opacity: 1;">×</button>
      </div>
    `);

    $("body").append($message);

    // Add close button functionality
    $message.find(".close-toast").on("click", function () {
      $message.addClass("fade-out");
      setTimeout(() => $message.remove(), 300);
    });

    // Auto-hide after 5 seconds
    setTimeout(() => {
      if ($message.is(":visible")) {
        $message.addClass("fade-out");
        setTimeout(() => $message.remove(), 300);
      }
    }, 5000);
  }

  // Update the displayFlashcards function to remove edit button
  function displayFlashcards(flashcards) {
    const container = document.getElementById("flashcards-container");
    container.innerHTML = "";

    flashcards.forEach((card, index) => {
      const cardElement = document.createElement("div");
      cardElement.className = "flashcard";
      cardElement.dataset.cardId = card.id;
      cardElement.innerHTML = `
        <div class="flashcard-inner">
          <div class="flashcard-front">
            ${card.front}
          </div>
          <div class="flashcard-back">
            ${card.back}
          </div>
        </div>
      `;

      container.appendChild(cardElement);
    });
  }

  // Add export functions after the deck management functions
  function exportDeck(deck) {
    const exportFormats = {
      txt: exportToText,
      csv: exportToCSV,
      json: exportToJSON,
      anki: exportToAnki,
      pdf: exportToPDF,
      print: exportToPrint,
      share: shareDeck,
    };

    function exportToText(deck) {
      const content = deck.cards
        .map((card, index) => {
          return `Card ${index + 1}:\nFront: ${card.front}\nBack: ${
            card.back
          }\n\n`;
        })
        .join("---\n\n");

      return new Blob([content], { type: "text/plain" });
    }

    function exportToCSV(deck) {
      const headers = "Front,Back\n";
      const rows = deck.cards
        .map(
          (card) =>
            `"${card.front.replace(/"/g, '""')}","${card.back.replace(
              /"/g,
              '""'
            )}"`
        )
        .join("\n");

      return new Blob([headers + rows], { type: "text/csv" });
    }

    function exportToJSON(deck) {
      const exportData = {
        name: deck.name,
        createdAt: deck.createdAt,
        cardCount: deck.cardCount,
        cards: deck.cards,
      };

      return new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json",
      });
    }

    function exportToAnki(deck) {
      // Create Anki-compatible text file
      const content = deck.cards
        .map((card) => {
          // Escape special characters and newlines
          const front = card.front.replace(/\t/g, " ").replace(/\n/g, "<br>");
          const back = card.back.replace(/\t/g, " ").replace(/\n/g, "<br>");
          return `${front}\t${back}\t${deck.name}`;
        })
        .join("\n");

      return new Blob([content], { type: "text/plain" });
    }

    async function exportToPDF(deck) {
      // Create a new jsPDF instance
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      const cardWidth = pageWidth - 2 * margin;
      let y = margin;
      const lineHeight = 7;
      const cardSpacing = 15;

      // Add title
      doc.setFontSize(16);
      doc.text(deck.name, margin, y);
      y += lineHeight * 2;

      // Add cards
      doc.setFontSize(12);
      deck.cards.forEach((card, index) => {
        // Check if we need a new page
        if (y > doc.internal.pageSize.getHeight() - margin) {
          doc.addPage();
          y = margin;
        }

        // Add card number
        doc.setFont(undefined, "bold");
        doc.text(`Card ${index + 1}`, margin, y);
        y += lineHeight;

        // Add front
        doc.setFont(undefined, "normal");
        const frontLines = doc.splitTextToSize(
          `Front: ${card.front}`,
          cardWidth
        );
        doc.text(frontLines, margin, y);
        y += lineHeight * frontLines.length;

        // Add back
        const backLines = doc.splitTextToSize(`Back: ${card.back}`, cardWidth);
        doc.text(backLines, margin, y);
        y += lineHeight * backLines.length + cardSpacing;
      });

      return doc.output("blob");
    }

    function exportToPrint(deck) {
      // Create print-friendly HTML
      const printWindow = window.open("", "_blank");
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>${deck.name} - Flashcards</title>
          <style>
            @media print {
              @page {
                size: A4;
                margin: 2cm;
              }
              .card {
                page-break-inside: avoid;
                margin-bottom: 2cm;
                border: 1px solid #ccc;
                padding: 1cm;
                border-radius: 0.5cm;
              }
              .card-number {
                font-size: 0.8em;
                color: #666;
                margin-bottom: 0.5cm;
              }
              .front, .back {
                margin: 0.5cm 0;
              }
              .front::before {
                content: "Front: ";
                font-weight: bold;
              }
              .back::before {
                content: "Back: ";
                font-weight: bold;
              }
              .cut-line {
                border-top: 1px dashed #ccc;
                margin: 1cm 0;
              }
            }
          </style>
        </head>
        <body>
          <h1>${deck.name}</h1>
          ${deck.cards
            .map(
              (card, index) => `
            <div class="card">
              <div class="card-number">Card ${index + 1}</div>
              <div class="front">${card.front}</div>
              <div class="back">${card.back}</div>
              <div class="cut-line"></div>
            </div>
          `
            )
            .join("")}
          <script>
            window.onload = () => window.print();
          </script>
        </body>
        </html>
      `);
      printWindow.document.close();
    }

    async function shareDeck(deck) {
      try {
        // Create a shareable link
        const shareData = {
          name: deck.name,
          cards: deck.cards,
          createdAt: deck.createdAt,
          sharedBy: currentUser?.email || "Anonymous",
        };

        // Store in Firestore
        const shareRef = doc(collection(db, "sharedDecks"));
        await setDoc(shareRef, {
          ...shareData,
          shareId: shareRef.id,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000
          ).toISOString(), // 7 days
        });

        // Create shareable URL
        const shareUrl = `${window.location.origin}/shared/${shareRef.id}`;

        // Use Web Share API if available
        if (navigator.share) {
          await navigator.share({
            title: `Flashcards: ${deck.name}`,
            text: `Check out these flashcards: ${deck.name}`,
            url: shareUrl,
          });
        } else {
          // Fallback to copying to clipboard
          await navigator.clipboard.writeText(shareUrl);
          showSuccessMessage("Share link copied to clipboard!");
        }
      } catch (error) {
        console.error("Error sharing deck:", error);
        showErrorMessage("Failed to share deck");
      }
    }

    // Create export modal with enhanced options
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.innerHTML = `
      <div class="modal-content">
        <span class="close">&times;</span>
        <h2>Export Deck: ${deck.name}</h2>
        <div class="export-options">
          <div class="export-group">
            <h3>Download Formats</h3>
            <button class="btn btn-secondary" data-format="txt">
              <i class="fas fa-file-alt"></i> Text File
            </button>
            <button class="btn btn-secondary" data-format="csv">
              <i class="fas fa-file-csv"></i> CSV
            </button>
            <button class="btn btn-secondary" data-format="json">
              <i class="fas fa-file-code"></i> JSON
            </button>
            <button class="btn btn-secondary" data-format="anki">
              <i class="fas fa-graduation-cap"></i> Anki
            </button>
            <button class="btn btn-secondary" data-format="pdf">
              <i class="fas fa-file-pdf"></i> PDF
            </button>
          </div>
          <div class="export-group">
            <h3>Print & Share</h3>
            <button class="btn btn-secondary" data-format="print">
              <i class="fas fa-print"></i> Print Cards
            </button>
            <button class="btn btn-primary" data-format="share">
              <i class="fas fa-share-alt"></i> Share Deck
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    modal.style.display = "block";

    // Handle export format selection
    modal.querySelectorAll(".export-options button").forEach((button) => {
      button.addEventListener("click", async () => {
        const format = button.dataset.format;
        try {
          showLoading(true);
          let blob;

          if (format === "pdf") {
            // Load jsPDF dynamically
            if (!window.jspdf) {
              await loadScript(
                "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"
              );
            }
            blob = await exportFormats[format](deck);
          } else {
            blob = exportFormats[format](deck);
          }

          if (format === "print") {
            exportFormats[format](deck);
          } else if (format === "share") {
            await exportFormats[format](deck);
          } else if (blob) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${deck.name
              .toLowerCase()
              .replace(/\s+/g, "-")}.${format}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }

          modal.remove();
          showSuccessMessage(
            `Deck exported successfully as ${format.toUpperCase()}`
          );
        } catch (error) {
          console.error(`Error exporting as ${format}:`, error);
          showErrorMessage(`Failed to export as ${format}`);
        } finally {
          showLoading(false);
        }
      });
    });

    // Close modal
    modal
      .querySelector(".close")
      .addEventListener("click", () => modal.remove());
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  // Helper function to load external scripts
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // Add session recovery and auto-save functions
  function initializeSessionRecovery() {
    // Check for saved session
    const savedSession = localStorage.getItem("flashcardSession");
    if (savedSession) {
      try {
        const session = JSON.parse(savedSession);
        if (
          session.timestamp &&
          Date.now() - session.timestamp < 24 * 60 * 60 * 1000
        ) {
          // 24 hours
          if (confirm("Would you like to restore your last session?")) {
            restoreSession(session);
          } else {
            localStorage.removeItem("flashcardSession");
          }
        } else {
          localStorage.removeItem("flashcardSession");
        }
      } catch (error) {
        console.error("Error restoring session:", error);
        localStorage.removeItem("flashcardSession");
      }
    }

    // Setup auto-save
    startAutoSave();

    // Setup network monitoring
    window.addEventListener("online", handleNetworkChange);
    window.addEventListener("offline", handleNetworkChange);
  }

  function startAutoSave() {
    if (autoSaveInterval) {
      clearInterval(autoSaveInterval);
    }

    autoSaveInterval = setInterval(() => {
      if (flashcards.length > 0 && !isGenerating) {
        saveSession();
      }
    }, 30000); // Auto-save every 30 seconds
  }

  function saveSession() {
    const session = {
      flashcards,
      currentCardIndex,
      deckName: $("#deckName").val(),
      timestamp: Date.now(),
      textInput: $("#textInput").val(),
    };

    lastSavedState = session;
    localStorage.setItem("flashcardSession", JSON.stringify(session));
  }

  function restoreSession(session) {
    flashcards = session.flashcards;
    currentCardIndex = session.currentCardIndex;
    $("#deckName").val(session.deckName);
    $("#textInput").val(session.textInput);

    updateFlashcard();
    showFlashcardViewer(true);
    showSuccessMessage("Session restored successfully");
  }

  function handleNetworkChange() {
    networkStatus.online = navigator.onLine;
    networkStatus.lastCheck = Date.now();

    const networkIndicator =
      document.getElementById("networkStatus") || createNetworkIndicator();
    networkIndicator.className = `network-status ${
      navigator.onLine ? "online" : "offline"
    }`;
    networkIndicator.textContent = navigator.onLine ? "Online" : "Offline";

    if (!navigator.onLine) {
      showErrorMessage("You are offline. Some features may be limited.");
    } else {
      showSuccessMessage("Back online!");
      // Retry any failed operations
      retryFailedOperations();
    }
  }

  function createNetworkIndicator() {
    const indicator = document.createElement("div");
    indicator.id = "networkStatus";
    indicator.className = "network-status";
    document.body.appendChild(indicator);
    return indicator;
  }

  async function retryFailedOperations() {
    const failedOps = JSON.parse(
      localStorage.getItem("failedOperations") || "[]"
    );
    if (failedOps.length > 0) {
      showLoading(true);
      try {
        for (const op of failedOps) {
          switch (op.type) {
            case "saveDeck":
              await deckManager.saveDeck(op.data.deckName, op.data.flashcards);
              break;
            case "generateFlashcards":
              await processText(op.data.text);
              break;
          }
        }
        localStorage.removeItem("failedOperations");
        showSuccessMessage("Recovered pending operations");
      } catch (error) {
        console.error("Error retrying operations:", error);
        showErrorMessage("Some operations could not be recovered");
      } finally {
        showLoading(false);
      }
    }
  }

  // Initialize mobile menu
  function initializeMobileMenu() {
    const mobileMenuBtn = document.getElementById("mobileMenuBtn");
    const mobileMenu = document.getElementById("mobileMenu");
    const mobileShowLoginBtn = document.getElementById("mobileShowLoginBtn");
    const mobileLogoutBtn = document.getElementById("mobileLogoutBtn");
    const mobileUserEmail = document.getElementById("mobileUserEmail");

    // Toggle mobile menu
    mobileMenuBtn.addEventListener("click", () => {
      mobileMenu.classList.toggle("show");
      // Update aria-expanded
      const isExpanded = mobileMenu.classList.contains("show");
      mobileMenuBtn.setAttribute("aria-expanded", isExpanded);
      // Update icon
      mobileMenuBtn.querySelector("i").className = isExpanded
        ? "fas fa-times"
        : "fas fa-bars";
    });

    // Close mobile menu when clicking outside
    document.addEventListener("click", (e) => {
      if (!mobileMenu.contains(e.target) && !mobileMenuBtn.contains(e.target)) {
        mobileMenu.classList.remove("show");
        mobileMenuBtn.setAttribute("aria-expanded", "false");
        mobileMenuBtn.querySelector("i").className = "fas fa-bars";
      }
    });

    // Handle mobile login/logout
    mobileShowLoginBtn.addEventListener("click", () => {
      showLoginModal();
      mobileMenu.classList.remove("show");
    });

    mobileLogoutBtn.addEventListener("click", async () => {
      try {
        await signOut(auth);
        mobileMenu.classList.remove("show");
      } catch (error) {
        console.error("Error signing out:", error);
        showErrorMessage("Error signing out. Please try again.");
      }
    });

    // Update mobile user menu when auth state changes
    auth.onAuthStateChanged((user) => {
      if (user) {
        mobileUserEmail.textContent = user.email;
        mobileShowLoginBtn.style.display = "none";
        mobileLogoutBtn.style.display = "block";
      } else {
        mobileUserEmail.textContent = "";
        mobileShowLoginBtn.style.display = "block";
        mobileLogoutBtn.style.display = "none";
      }
    });
  }

  // Initialize tab switching
  function initializeTabSwitching() {
    const tabButtons = document.querySelectorAll(".input-tabs .tab-btn");
    const tabContents = document.querySelectorAll(".input-tab-content");

    // On load, show only the active tab content
    tabContents.forEach((content) => {
      if (content.classList.contains("active")) {
        content.style.display = "block";
      } else {
        content.style.display = "none";
      }
    });

    tabButtons.forEach((button) => {
      button.addEventListener("click", () => {
        // Remove active from all buttons and contents
        tabButtons.forEach((btn) => btn.classList.remove("active"));
        tabContents.forEach((content) => {
          content.classList.remove("active");
          content.style.display = "none";
        });

        // Add active to clicked button and show corresponding content
        button.classList.add("active");
        const tab = button.dataset.tab;
        const tabIdMap = {
          text: "textTab",
          file: "fileUploadTab",
        };
        const targetTabId = tabIdMap[tab];
        const targetTab = document.getElementById(targetTabId);
        if (targetTab) {
          targetTab.classList.add("active");
          targetTab.style.display = "block";
        }
      });
    });
  }

  // Initialize everything when document is ready
  $(document).ready(function () {
    // Initialize tab switching
    initializeTabSwitching();

    // Initialize file handling
    initializeFileHandling();

    // Initialize session recovery
    initializeSessionRecovery();

    // Initialize mobile menu
    initializeMobileMenu();

    // Add save deck button handler
    $(document).on("click", "#saveDeckBtn", async function () {
      if (!flashcards || flashcards.length === 0) {
        showErrorMessage("No flashcards to save");
        return;
      }
      if (!currentUser) {
        showErrorMessage("Please log in to save decks");
        return;
      }
      let defaultName = "My Deck";
      if (flashcards.length > 0 && flashcards[0].front) {
        defaultName =
          flashcards[0].front.substring(0, 20) +
          (flashcards[0].front.length > 20 ? "..." : "");
      }
      const deckName = prompt("Enter a name for your deck:", defaultName);
      if (!deckName) {
        showErrorMessage("Please enter a deck name");
        return;
      }
      try {
        showLoading(true);
        await deckManager.saveDeck(deckName, flashcards);
        await loadUserDecks(); // Refresh the deck list
        showSuccessMessage("Deck saved successfully!");
      } catch (error) {
        console.error("Error saving deck:", error);
        showErrorMessage("Failed to save deck: " + error.message);
      } finally {
        showLoading(false);
      }
    });

    // Fix text input to allow spaces
    $("#textInput").on("keydown", function (e) {
      // Allow all key inputs including spaces
      return true;
    });

    // Add beforeunload handler
    window.addEventListener("beforeunload", (e) => {
      if (flashcards.length > 0 && !isGenerating) {
        saveSession();
      }
    });

    updateCardCountOptions();
  });

  // Update the card type selection handler to show card count options
  $("#cameraCardType, #fileCardType").on("change", function () {
    const $select = $(this);
    const $cardCountGroup = $select
      .closest(".input-tab-content")
      .find(".card-count-group");
    if ($select.val()) {
      $cardCountGroup.show();
      updateCardCountOptions(); // Update options when shown
    } else {
      $cardCountGroup.hide();
    }
  });

  // Update card count options
  function updateCardCountOptions() {
    const isLoggedIn = !!currentUser;
    const isPremium =
      isLoggedIn &&
      subscriptionManager &&
      subscriptionManager.isPremium &&
      subscriptionManager.isPremium();
    const allowedCounts = isPremium
      ? [5, 10, 15, 20, 25, 30, 35, 40, 45, 50]
      : [5, 10];
    ["cardCount", "fileCardCount"].forEach((id) => {
      const select = document.getElementById(id);
      if (select) {
        // Remove all options
        select.innerHTML = "";
        allowedCounts.forEach((count) => {
          const option = document.createElement("option");
          option.value = count;
          option.textContent = count;
          if (count === 10) option.selected = true;
          select.appendChild(option);
        });
      }
    });
  }

  // Update the generate cards button click handler
  $("#generateCardsBtn").on("click", async function () {
    const activeTab = $(".input-tab-content.active");
    const cardType = activeTab.find("select[id$='CardType']").val();
    const cardCount = parseInt(activeTab.find("select[id$='CardCount']").val());

    if (!cardType) {
      showErrorMessage("Please select a card type");
      return;
    }

    const isPremium = subscriptionManager.isPremium();

    // Validate card count based on premium status
    if (!isPremium && cardCount > 10) {
      showErrorMessage(
        "Free users can only generate up to 10 cards. Please upgrade to premium for more options."
      );
      return;
    }

    // Rest of the generate cards button handler code...
  });

  // Update processText function
  async function processText(text) {
    if (isGenerating) return;
    isGenerating = true;

    try {
      const activeTab = $(".input-tab-content.active");
      const cardType = activeTab.find("select[id$='CardType']").val();
      const cardCount = parseInt(
        activeTab.find("select[id$='CardCount']").val()
      );

      // Rest of the processText function code...
    } catch (error) {
      console.error("Error generating flashcards:", error);
      throw error;
    } finally {
      isGenerating = false;
    }
  }

  // Update loading indicator references
  const fileUploadLoadingIndicator = document.getElementById(
    "fileUploadLoadingIndicator"
  );
  const flashcardViewerLoadingIndicator = document.getElementById(
    "flashcardViewerLoadingIndicator"
  );

  // Function to show loading indicator
  function showLoadingIndicator(context = "fileUpload") {
    const indicator =
      context === "fileUpload"
        ? fileUploadLoadingIndicator
        : flashcardViewerLoadingIndicator;
    if (indicator) {
      indicator.style.display = "flex";
      indicator.style.opacity = "1";
    }
  }

  // Function to hide loading indicator
  function hideLoadingIndicator(context = "fileUpload") {
    const indicator =
      context === "fileUpload"
        ? fileUploadLoadingIndicator
        : flashcardViewerLoadingIndicator;
    if (indicator) {
      indicator.style.opacity = "0";
      setTimeout(() => {
        indicator.style.display = "none";
      }, 300); // Match the CSS transition duration
    }
  }

  // Update any existing loading indicator references to use the new functions
  // For example, in your file upload handler:
  async function handleFileUpload() {
    showLoadingIndicator("fileUpload");
    try {
      // Your file upload logic here
    } finally {
      hideLoadingIndicator("fileUpload");
    }
  }

  // And in your flashcard generation handler:
  async function generateFlashcards() {
    showLoadingIndicator("flashcardViewer");
    try {
      // Your flashcard generation logic here
    } finally {
      hideLoadingIndicator("flashcardViewer");
    }
  }

  // Add updateDeckList function
  function updateDeckList(decks = []) {
    const deckList = document.querySelector(".saved-decks");
    if (!deckList) {
      console.warn("Deck list container not found");
      return;
    }

    if (!decks || decks.length === 0) {
      deckList.innerHTML = `
        <div class="no-decks-message">
          <p>No saved decks yet. Create your first deck to get started!</p>
        </div>
      `;
      return;
    }

    deckList.innerHTML = decks
      .map(
        (deck) => `
      <div class="deck-card" data-deck-id="${deck.id}">
        <div class="deck-header">
          <h3>${deck.name}</h3>
          <div class="deck-actions">
            <button class="btn btn-primary study-deck" title="Study Deck">
              <i class="fas fa-graduation-cap"></i> Study
            </button>
            <button class="btn btn-secondary export-deck" title="Export Deck">
              <i class="fas fa-download"></i> Export
            </button>
            <button class="btn btn-danger delete-deck" title="Delete Deck">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
        <div class="deck-info">
          <span><i class="fas fa-cards"></i> ${deck.cards.length} cards</span>
          <span><i class="fas fa-clock"></i> Created ${new Date(
            deck.createdAt
          ).toLocaleDateString()}</span>
        </div>
      </div>
    `
      )
      .join("");

    // Add event listeners for deck actions
    deckList.querySelectorAll(".study-deck").forEach((button) => {
      button.addEventListener("click", (e) => {
        const deckId = e.target.closest(".deck-card").dataset.deckId;
        const deck = decks.find((d) => d.id === deckId);
        if (deck) {
          initializeStudySession(deck);
        }
      });
    });

    deckList.querySelectorAll(".export-deck").forEach((button) => {
      button.addEventListener("click", (e) => {
        const deckId = e.target.closest(".deck-card").dataset.deckId;
        const deck = decks.find((d) => d.id === deckId);
        if (deck) {
          exportDeck(deck);
        }
      });
    });

    deckList.querySelectorAll(".delete-deck").forEach((button) => {
      button.addEventListener("click", async (e) => {
        const deckCard = e.target.closest(".deck-card");
        const deckId = deckCard.dataset.deckId;
        if (
          confirm(
            "Are you sure you want to delete this deck? This action cannot be undone."
          )
        ) {
          try {
            await deckManager.deleteDeck(deckId);
            deckCard.remove();
            showSuccessMessage("Deck deleted successfully");
            // If no decks left, show the no decks message
            if (deckList.children.length === 0) {
              updateDeckList([]);
            }
          } catch (error) {
            console.error("Error deleting deck:", error);
            showErrorMessage("Failed to delete deck");
          }
        }
      });
    });
  }

  function initializeFileHandling() {
    const dropzone = document.getElementById("dropzone");
    const fileInput = document.getElementById("fileInput");

    if (!dropzone || !fileInput) return;

    // Click on dropzone triggers file input
    dropzone.addEventListener("click", () => fileInput.click());

    // Drag and drop support
    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });
    dropzone.addEventListener("dragleave", () => {
      dropzone.classList.remove("dragover");
    });
    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
      if (e.dataTransfer.files.length > 0) {
        fileInput.files = e.dataTransfer.files;
        validateAndProcessFile(e.dataTransfer.files[0]);
      }
    });

    // Process file immediately on selection
    fileInput.addEventListener("change", (e) => {
      if (e.target.files.length > 0) {
        validateAndProcessFile(e.target.files[0]);
      }
    });
  }

  function validateAndProcessFile(file) {
    if (!file) {
      showErrorMessage("No file selected.");
      return;
    }

    // Only allow .txt, .pdf, .docx files
    if (!file.name.match(/\.(txt|pdf|docx)$/i)) {
      showErrorMessage(
        "Unsupported file type. Please upload a .txt, .pdf, or .docx file."
      );
      return;
    }

    // Show the file name
    const fileNameDisplay = document.getElementById("selectedFileName");
    const fileNameText = document.getElementById("fileNameText");
    if (fileNameDisplay && fileNameText) {
      fileNameText.textContent = file.name;
      fileNameDisplay.style.display = "flex";
    }

    // Enable the Generate Flashcards button
    const processBtn = document.getElementById("processFileBtn");
    if (processBtn) processBtn.disabled = false;

    // Store the file for later processing
    window.uploadedFile = file;
  }

  // Handle Generate Flashcards button click for file upload
  $(document).on("click", "#processFileBtn", async function () {
    const file = window.uploadedFile;
    if (!file) {
      showErrorMessage("No file selected.");
      return;
    }
    let extractedText = "";
    if (file.name.match(/\.txt$/i)) {
      // TXT: Read as text
      const reader = new FileReader();
      reader.onload = function (e) {
        extractedText = e.target.result;
        processText(extractedText);
      };
      reader.readAsText(file);
      return;
    } else if (file.name.match(/\.pdf$/i)) {
      // PDF: Use pdf.js
      const reader = new FileReader();
      reader.onload = async function (e) {
        const typedarray = new Uint8Array(e.target.result);
        try {
          const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
          let textContent = "";
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            textContent +=
              content.items.map((item) => item.str).join(" ") + "\n";
          }
          processText(textContent);
        } catch (err) {
          showErrorMessage("Failed to read PDF file.");
        }
      };
      reader.readAsArrayBuffer(file);
      return;
    } else if (file.name.match(/\.docx$/i)) {
      // DOCX: Use mammoth.js
      const reader = new FileReader();
      reader.onload = async function (e) {
        try {
          const result = await mammoth.extractRawText({
            arrayBuffer: e.target.result,
          });
          processText(result.value);
        } catch (err) {
          showErrorMessage("Failed to read DOCX file.");
        }
      };
      reader.readAsArrayBuffer(file);
      return;
    }
  });

  // Enforce before generating cards
  function getSelectedCardCount() {
    const activeTab = document.querySelector(".input-tab-content.active");
    if (!activeTab) return 10;
    const select = activeTab.querySelector(".card-count-select");
    if (!select) return 10;
    return parseInt(select.value, 10);
  }

  $(document).on("click", "#generateBtn, #processFileBtn", async function () {
    const cardCount = getSelectedCardCount();
    const isLoggedIn = !!currentUser;
    const isPremium =
      isLoggedIn &&
      subscriptionManager &&
      subscriptionManager.isPremium &&
      subscriptionManager.isPremium();
    if (!isPremium && cardCount > 10) {
      showErrorMessage(
        "Free users can only generate up to 10 cards. Please log in and upgrade to premium for more."
      );
      return;
    }
    // ... existing code for generating flashcards ...
  });

  function showFlashcardViewer(show) {
    const viewer = document.getElementById("flashcardViewer");
    const placeholder = document.getElementById("flashcardViewerPlaceholder");
    if (viewer) viewer.style.display = show ? "block" : "none";
    if (placeholder) placeholder.style.display = show ? "none" : "flex";
  }
});
