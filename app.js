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
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  initializeAuthModal,
  showAuthModal,
  hideAuthModal,
} from "./auth-modal.js";

// Initialize Firebase and auth modal
document.addEventListener("DOMContentLoaded", function () {
  // Initialize the centralized auth modal
  initializeAuthModal();

  // Initialize any other app functionality here
});

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

  // Initialize Google Auth Provider
  const googleProvider = new GoogleAuthProvider();

  // Initialize subscription manager
  const subscriptionManager = new SubscriptionManager();
  subscriptionManager.initialize();

  // Override isPremium for testing
  subscriptionManager.isPremium = () => true;

  // Initialize PDF.js when the library is loaded
  if (typeof pdfjsLib !== "undefined") {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  } else {
    console.warn("PDF.js library not loaded yet");
  }

  // Initialize deck manager when user logs in
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser = user;
      deckManager = new DeckManager(user.uid);

      // Update desktop view
      const userMenu = document.getElementById("userMenu");
      const showLoginBtn = document.getElementById("showLoginBtn");
      const userEmail = document.getElementById("userEmail");

      // Update mobile view
      const mobileUserEmail = document.getElementById("mobileUserEmail");
      const mobileShowLoginBtn = document.getElementById("mobileShowLoginBtn");
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

      await loadUserDecks();
      await loadStudyProgress();
      await updateSubscriptionUI();
      updatePremiumFeatures();

      // Add dashboard button for logged in users
      addDashboardButton();

      // Add subscription tier check and card type update
      await updateCardTypesForUserTier();
    } else {
      currentUser = null;
      deckManager = null;

      // Update desktop view
      const userMenu = document.getElementById("userMenu");
      const showLoginBtn = document.getElementById("showLoginBtn");
      const userEmail = document.getElementById("userEmail");

      // Update mobile view
      const mobileUserEmail = document.getElementById("mobileUserEmail");
      const mobileShowLoginBtn = document.getElementById("mobileShowLoginBtn");
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
    if (!deckManager) return;

    try {
      userDecks = await deckManager.loadDecks();
      updateDeckList(userDecks);
    } catch (error) {
      console.error("Error loading decks:", error);
      alert("Failed to load decks: " + error.message);
    }
  }

  function updateDeckList(decks = []) {
    const deckList = document.querySelector(".saved-decks");
    if (!deckList) return;

    if (!decks || decks.length === 0) {
      deckList.innerHTML = '<p class="no-decks">No saved decks yet</p>';
      return;
    }

    deckList.innerHTML = decks
      .map(
        (deck) => `
      <div class="deck-card" data-deck-id="${deck.id}">
        <h3>${deck.name}</h3>
        <p>${deck.cards ? deck.cards.length : 0} cards</p>
        <div class="deck-actions">
          <button class="btn btn-primary study-deck">
            <i class="fas fa-graduation-cap"></i> Study
          </button>
          <button class="btn btn-secondary load-deck">
            <i class="fas fa-edit"></i> Edit
          </button>
          <button class="btn btn-danger delete-deck">
            <i class="fas fa-trash"></i> Delete
          </button>
          <button class="btn btn-info export-deck">
            <i class="fas fa-download"></i> Export
          </button>
        </div>
      </div>
    `
      )
      .join("");

    // Add event listeners for deck actions
    deckList.querySelectorAll(".study-deck").forEach((button) => {
      button.addEventListener("click", async function () {
        const deckId = this.closest(".deck-card").dataset.deckId;
        const deck = decks.find((d) => d.id === deckId);
        if (deck) {
          initializeStudySession(deck);
        }
      });
    });

    deckList.querySelectorAll(".load-deck").forEach((button) => {
      button.addEventListener("click", async function () {
        const deckId = this.closest(".deck-card").dataset.deckId;
        try {
          showLoading(true);
          const deck = await deckManager.getDeck(deckId);
          flashcards = deck.cards;
          currentCardIndex = 0;
          isFlipped = false;
          updateFlashcard();
          showFlashcardViewer(true);
        } catch (error) {
          console.error("Error loading deck:", error);
          alert("Failed to load deck: " + error.message);
        } finally {
          showLoading(false);
        }
      });
    });

    deckList.querySelectorAll(".delete-deck").forEach((button) => {
      button.addEventListener("click", async function () {
        if (!confirm("Are you sure you want to delete this deck?")) return;

        const deckId = this.closest(".deck-card").dataset.deckId;
        try {
          showLoading(true);
          await deckManager.deleteDeck(deckId);
          await loadUserDecks();
        } catch (error) {
          console.error("Error deleting deck:", error);
          alert("Failed to delete deck: " + error.message);
        } finally {
          showLoading(false);
        }
      });
    });

    deckList.querySelectorAll(".export-deck").forEach((button) => {
      button.addEventListener("click", async function () {
        const deckId = this.closest(".deck-card").dataset.deckId;
        try {
          const deck = await deckManager.getDeck(deckId);
          exportDeck(deck);
        } catch (error) {
          console.error("Error exporting deck:", error);
          alert("Failed to export deck: " + error.message);
        }
      });
    });
  }

  // Save study progress
  async function saveStudyProgress(cardId, performance) {
    if (!currentUser) return;

    try {
      const progressRef = doc(
        db,
        "studyProgress",
        currentUser.uid,
        "cards",
        cardId
      );
      const progressData = spacedRepetition.calculateNextReview(
        cardId,
        performance
      );

      await setDoc(progressRef, {
        ...progressData,
        lastReviewed: new Date(),
        userId: currentUser.uid,
      });
    } catch (error) {
      console.error("Error saving study progress:", error);
    }
  }

  // Load study progress
  async function loadStudyProgress() {
    if (!currentUser) return;

    try {
      const progressRef = collection(
        db,
        "studyProgress",
        currentUser.uid,
        "cards"
      );
      const snapshot = await getDocs(progressRef);

      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        spacedRepetition.reviewData.set(doc.id, data);
      });

      // Update Study Now button after loading progress
      updateStudyNowButton();
    } catch (error) {
      console.error("Error loading study progress:", error);
    }
  }

  // Add function to update Study Now button with due card count
  function updateStudyNowButton() {
    const studyBtn = $("#studyNowBtn");
    const dueCountSpan = studyBtn.find(".due-count");

    if (flashcards.length === 0) {
      studyBtn.hide();
      return;
    }

    // Get cards due for review
    const dueCards = spacedRepetition.getDueCards(flashcards);
    const unfamiliarCards = flashcards.filter(
      (card) =>
        card.metadata?.markedAsUnfamiliar &&
        spacedRepetition.reviewData.get(card.id)
    );

    const totalDueCards = dueCards.length;

    if (totalDueCards > 0) {
      studyBtn.show();
      dueCountSpan.text(`(${totalDueCards} due)`);
      studyBtn.removeClass("btn-primary").addClass("btn-success");
    } else if (unfamiliarCards.length > 0) {
      studyBtn.show();
      dueCountSpan.text(`(${unfamiliarCards.length} to review)`);
      studyBtn.removeClass("btn-success").addClass("btn-primary");
    } else {
      studyBtn.hide();
    }
  }

  // Add study session initialization
  function initializeStudySession(deck = null) {
    let cardsToStudy = [];

    if (deck) {
      // Study a specific deck
      cardsToStudy = deck.cards || [];
    } else {
      // Study due cards from current flashcards
      const dueCards = spacedRepetition.getDueCards(flashcards);
      const unfamiliarCards = flashcards.filter(
        (card) => card.metadata?.markedAsUnfamiliar
      );

      // Prioritize due cards, then unfamiliar cards
      cardsToStudy = dueCards.length > 0 ? dueCards : unfamiliarCards;
    }

    if (cardsToStudy.length === 0) {
      showSuccessMessage(
        "No cards due for review right now! Great job staying on top of your studies."
      );
      return;
    }

    // Start study session
    flashcards = cardsToStudy;
    currentCardIndex = 0;
    isFlipped = false;

    // Show study session UI
    showFlashcardViewer(true);
    updateFlashcard();

    // Show study session info
    const dueCards = spacedRepetition.getDueCards(cardsToStudy);
    const sessionType =
      dueCards.length > 0 ? "Due for Review" : "Unfamiliar Cards";
    showSuccessMessage(
      `Starting ${sessionType} session: ${cardsToStudy.length} cards to review`
    );
  }

  // Add event handler for Study Now button
  $("#studyNowBtn").on("click", function () {
    initializeStudySession();
  });

  // Text form submission
  $("#textForm").on("submit", function (e) {
    e.preventDefault();
    const text = $("#textInput").val().trim();
    if (text) {
      processText(text);
    }
  });

  // URL form submission and input handling
  $("#urlForm").on("submit", async function (e) {
    e.preventDefault();
    console.log("URL form submitted"); // Debug log

    const url = $("#urlInput").val().trim();
    const cardType = $("#urlCardType").val();
    const cardCount = parseInt($("#urlCardCount").val());

    console.log("URL:", url, "Card Type:", cardType, "Card Count:", cardCount); // Debug log

    if (!url) {
      showErrorMessage("Please enter a URL");
      return;
    }

    if (!cardType) {
      showErrorMessage("Please select a card type");
      return;
    }

    try {
      showLoading(true);

      console.log("Starting fetch request to backend..."); // Debug log

      // First fetch the content from the URL
      const fetchResponse = await fetch(
        "http://localhost:12345/api/fetch-web-content",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url }),
        }
      );

      console.log(
        "Fetch response status:",
        fetchResponse.status,
        fetchResponse.statusText
      ); // Debug log

      if (!fetchResponse.ok) {
        const errorData = await fetchResponse.json().catch(() => ({}));
        console.log("Fetch error data:", errorData); // Debug log
        throw new Error(
          errorData.message || "Failed to fetch content from URL"
        );
      }

      const urlData = await fetchResponse.json();
      console.log("URL data received:", urlData); // Debug log

      if (!urlData.content || urlData.content.trim().length === 0) {
        // Check if it's a YouTube URL for better error message
        const isYouTubeUrl =
          url.includes("youtube.com") || url.includes("youtu.be");
        console.log("Is YouTube URL:", isYouTubeUrl); // Debug log

        if (isYouTubeUrl) {
          // Show a more helpful error message for YouTube with alternatives
          const videoId = url.match(
            /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/
          )?.[1];
          console.log("YouTube video ID:", videoId); // Debug log

          showErrorMessage(`
            YouTube transcript extraction is not yet implemented in the backend.
            
            Alternatives you can try:
            • Copy the video transcript manually (if available in the video description)
            • Use the video's auto-generated captions (click CC → More → Transcript)
            • Try a different article or webpage URL
            • Upload a text file or document instead
            
            Video: "${urlData.title || "YouTube Video"}"
          `);
          return; // Don't throw error, just show helpful message
        } else {
          throw new Error(
            "No content could be extracted from this URL. The page may be behind a paywall, require JavaScript, or have restricted access."
          );
        }
      }

      console.log(
        "Content extracted successfully, length:",
        urlData.content.length
      ); // Debug log

      // Check content length and truncate if too large
      const MAX_CONTENT_LENGTH = 50000; // 50KB limit for API
      let processedContent = urlData.content;

      if (urlData.content.length > MAX_CONTENT_LENGTH) {
        console.log(
          `Content too large (${urlData.content.length} chars), truncating to ${MAX_CONTENT_LENGTH} chars`
        ); // Debug log
        processedContent = urlData.content.substring(0, MAX_CONTENT_LENGTH);

        // Try to cut at a sentence boundary to avoid incomplete sentences
        const lastPeriod = processedContent.lastIndexOf(".");
        const lastExclamation = processedContent.lastIndexOf("!");
        const lastQuestion = processedContent.lastIndexOf("?");
        const lastSentenceEnd = Math.max(
          lastPeriod,
          lastExclamation,
          lastQuestion
        );

        if (lastSentenceEnd > MAX_CONTENT_LENGTH * 0.8) {
          // If we find a sentence ending in the last 20%
          processedContent = processedContent.substring(0, lastSentenceEnd + 1);
          console.log(
            `Truncated at sentence boundary, final length: ${processedContent.length} chars`
          ); // Debug log
        }

        showSuccessMessage(
          `Large article detected (${Math.round(
            urlData.content.length / 1000
          )}KB). Using first ${Math.round(
            processedContent.length / 1000
          )}KB for flashcard generation.`
        );
      }

      console.log("Starting flashcard generation..."); // Debug log

      // Then generate flashcards from the extracted content
      await processText(processedContent, { cardType, cardCount });

      console.log("Flashcard generation completed successfully!"); // Debug log
    } catch (error) {
      console.error("Error processing URL:", error);

      // More specific error messages based on the type of error
      let errorMessage = error.message;

      if (error.message.includes("fetch")) {
        errorMessage =
          "Unable to connect to the content extraction service. Please check if the backend server is running on localhost:12345.";
      }

      showErrorMessage(errorMessage);
    } finally {
      showLoading(false);
    }
  });

  // Enable/disable URL submit button based on input
  $("#urlInput").on("input", function () {
    const url = $(this).val().trim();
    const isValidUrl =
      url &&
      (url.startsWith("http://") ||
        url.startsWith("https://") ||
        url.includes("."));
    console.log("URL input changed:", url, "Valid:", isValidUrl); // Debug log
    $("#generateFromUrlBtn").prop("disabled", !isValidUrl);
  });

  // Check URL input on page load in case there's already content
  $(document).ready(function () {
    const url = $("#urlInput").val().trim();
    const isValidUrl =
      url &&
      (url.startsWith("http://") ||
        url.startsWith("https://") ||
        url.includes("."));
    $("#generateFromUrlBtn").prop("disabled", !isValidUrl);
  });

  // Add specific click handler for generateFromUrlBtn to ensure it works
  $("#generateFromUrlBtn").on("click", function (e) {
    console.log("Generate from URL button clicked"); // Debug log
    e.preventDefault();
    $("#urlForm").submit();
  });

  // Flashcard navigation
  function initializeFlashcardControls() {
    // Remove any existing event listeners first
    $("#prevCardBtn, #nextCardBtn").off("click");
    $("#shuffleBtn").off("click");
    $("#showAnswerBtn, #flipCard").off("click");
    $(".performance-buttons button").off("click");
    $(document).off("keydown.flashcard");

    // Keyboard navigation with enhanced options
    $(document).on("keydown.flashcard", function (e) {
      if (!$("#flashcardViewer").is(":visible")) return;

      switch (e.key) {
        case "ArrowLeft":
          navigateCard("prev");
          break;
        case "ArrowRight":
          navigateCard("next");
          break;
        case " ": // Space bar
          e.preventDefault();
          $("#showAnswerBtn, #flipCard").click();
          break;
        case "1":
          if ($(".performance-buttons").is(":visible")) {
            handlePerformanceAnswer(spacedRepetition.answerTypes.AGAIN);
          }
          break;
        case "2":
          if ($(".performance-buttons").is(":visible")) {
            handlePerformanceAnswer(spacedRepetition.answerTypes.HARD);
          }
          break;
        case "3":
          if ($(".performance-buttons").is(":visible")) {
            handlePerformanceAnswer(spacedRepetition.answerTypes.GOOD);
          }
          break;
        case "4":
          if ($(".performance-buttons").is(":visible")) {
            handlePerformanceAnswer(spacedRepetition.answerTypes.EASY);
          }
          break;
      }
    });

    // Navigation buttons - Fixed IDs
    $("#prevCardBtn").on("click", function (e) {
      e.preventDefault();
      navigateCard("prev");
    });

    $("#nextCardBtn").on("click", function (e) {
      e.preventDefault();
      navigateCard("next");
    });

    // Shuffle button
    $("#shuffleBtn").on("click", function (e) {
      e.preventDefault();
      flashcards = flashcards.sort(() => Math.random() - 0.5);
      currentCardIndex = 0;
      updateFlashcard();
      showSuccessMessage("Cards shuffled");
    });

    // Show Answer button with timing
    let answerStartTime = null;
    $("#showAnswerBtn, #flipCard").on("click", function (e) {
      e.preventDefault();
      answerStartTime = Date.now();

      const $btn = $(this);
      const $cardBack = $btn
        .closest(".card-controls")
        .prev()
        .find(".card-back");
      const $performanceButtons = $btn
        .closest(".card-controls")
        .find(".performance-buttons");

      if ($cardBack.length) {
        $cardBack.slideDown(200);
        $btn.hide();
        $performanceButtons.slideDown(200);

        // Update performance buttons with interval predictions
        updatePerformanceButtonPreviews();
      }
    });

    // Enhanced performance buttons with response time tracking
    function handlePerformanceAnswer(answer) {
      const card = flashcards[currentCardIndex];

      // Calculate response time
      const responseTime = answerStartTime
        ? (Date.now() - answerStartTime) / 1000
        : null;

      // Ensure card has an ID for spaced repetition tracking
      if (!card.id) {
        card.id = `card_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`;
      }

      // Use the advanced spaced repetition system
      const updatedCard = spacedRepetition.answerCard(
        card.id,
        answer,
        responseTime
      );

      // Update card metadata
      if (!card.metadata) {
        card.metadata = {};
      }
      card.metadata.markedAsUnfamiliar =
        answer === spacedRepetition.answerTypes.AGAIN;
      card.metadata.lastReviewed = new Date().toISOString();
      card.metadata.spacedRepetitionData = updatedCard;

      // Track study session for streak calculation
      trackStudySession();

      // Update progress immediately after marking
      updateProgress();

      // Update Study Now button with new due count
      updateStudyNowButton();

      // Show feedback based on answer
      showAnswerFeedback(answer, updatedCard);

      // Move to next card after a brief delay
      setTimeout(() => {
        navigateCard("next");
      }, 1000);
    }

    // Bind performance buttons
    $(".performance-buttons button").on("click", function (e) {
      e.preventDefault();
      const answer = parseInt($(this).data("performance"));
      handlePerformanceAnswer(answer);
    });
  }

  function navigateCard(direction) {
    const oldIndex = currentCardIndex;
    if (direction === "prev" && currentCardIndex > 0) {
      currentCardIndex--;
    } else if (
      direction === "next" &&
      currentCardIndex < flashcards.length - 1
    ) {
      currentCardIndex++;
    }

    // Only update if the index actually changed
    if (oldIndex !== currentCardIndex) {
      updateFlashcard();
    }
  }

  function updateFlashcard() {
    const card = flashcards[currentCardIndex];
    if (!card) return;

    // Update card content
    $("#frontText").text(card.front);
    $("#backText").text(card.back);

    // Reset card state
    $(".card-back").hide();
    $("#showAnswerBtn").show();
    $(".performance-buttons").hide();

    // Update navigation state - Fixed IDs
    $("#prevCardBtn").prop("disabled", currentCardIndex === 0);
    $("#nextCardBtn").prop(
      "disabled",
      currentCardIndex === flashcards.length - 1
    );

    // Update progress
    updateProgress();
  }

  // Enhanced progress tracking
  function updateProgress() {
    const totalCards = flashcards.length;
    const markedCards = flashcards.filter(
      (card) => card.metadata?.markedAsUnfamiliar
    ).length;
    const progress = (markedCards / totalCards) * 100;

    $("#progressBar").css("width", `${progress}%`);
    // Show both current card position and marking progress
    $("#progressText").text(
      `Card ${
        currentCardIndex + 1
      }/${totalCards} • ${markedCards} marked as unfamiliar`
    );
  }

  // Flashcard flip
  $("#flashcard").on("click", function () {
    isFlipped = !isFlipped;
    $(this).toggleClass("flipped");
  });

  // Update file handling functions
  function validateAndProcessFile(file) {
    // Check file type
    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.type)) {
      showErrorMessage(
        "Please upload a PDF, DOC, DOCX, TXT, or image file (JPG, PNG, GIF, WebP)"
      );
      return;
    }

    // Check file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      showErrorMessage("File size must be less than 10MB");
      return;
    }

    // Show card type selection after file validation
    $("#fileInput").hide();
    $("#dropzone").hide();
    $("#cardTypeSelection").show();

    // Store the file for later processing
    window.uploadedFile = file;
  }

  // Add handleFile function before the generateCardsBtn click handler
  async function handleFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = async function (e) {
        try {
          const content = e.target.result;
          let text = "";

          // Check if it's an image file for image occlusion
          if (file.type.startsWith("image/")) {
            // For image files, return the data URL for image occlusion
            resolve({
              type: "image",
              data: content,
              filename: file.name,
              mimeType: file.type,
            });
            return;
          }

          switch (file.type) {
            case "application/pdf":
              // Use a different worker configuration that complies with CSP
              const loadingTask = pdfjsLib.getDocument({
                data: content,
                cMapUrl:
                  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/",
                cMapPacked: true,
                standardFontDataUrl:
                  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/standard_fonts/",
                disableWorker: false, // Enable worker but use CDN version
              });

              const pdf = await loadingTask.promise;
              const numPages = pdf.numPages;

              // Extract text from each page
              for (let i = 1; i <= numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                text +=
                  textContent.items.map((item) => item.str).join(" ") + "\n";
              }
              break;

            case "application/msword":
            case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
              // For DOC/DOCX files, we'll need to use a server-side conversion
              // For now, show an error message
              throw new Error(
                "DOC/DOCX files are not supported in the browser. Please convert to PDF or TXT first."
              );
              break;

            case "text/plain":
              text = content;
              break;

            default:
              throw new Error("Unsupported file type");
          }

          // Clean up the extracted text
          text = text
            .replace(/\r\n/g, "\n") // Normalize line endings
            .replace(/\n{3,}/g, "\n\n") // Remove excessive newlines
            .replace(/\s+/g, " ") // Normalize spaces
            .trim();

          resolve(text);
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => reject(new Error("Error reading file"));

      // Read the file based on its type
      if (file.type === "application/pdf") {
        reader.readAsArrayBuffer(file);
      } else if (file.type.startsWith("image/")) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    });
  }

  // Add card type selection handler
  $("#generateCardsBtn").on("click", async function () {
    if (!window.uploadedFile) {
      showErrorMessage("Please upload a file first");
      return;
    }

    const cardType = $("#uploadCardType").val();
    if (!cardType) {
      showErrorMessage("Please select a card type");
      return;
    }

    const cardCount = parseInt($("#uploadCardCount").val());
    const isPremium = subscriptionManager.isPremium();

    // Validate card count based on premium status
    if (!isPremium && cardCount > 10) {
      showErrorMessage(
        "Free users can only generate up to 10 cards. Please upgrade to premium for more options."
      );
      return;
    }

    // Check free tier limits
    if (!isPremium) {
      if (
        lastGenerationTime &&
        Date.now() - lastGenerationTime < FREE_TIER_COOLDOWN
      ) {
        const hoursLeft = Math.ceil(
          (FREE_TIER_COOLDOWN - (Date.now() - lastGenerationTime)) /
            (60 * 60 * 1000)
        );
        showErrorMessage(
          `Free tier limit reached. Please wait ${hoursLeft} hours before generating more cards, or upgrade to premium for unlimited cards.`
        );
        return;
      }
    }

    // Start loading with minimum duration
    showLoading(true);
    const loadingStartTime = Date.now();

    try {
      // Process the file
      const result = await handleFile(window.uploadedFile);

      // Handle different file types
      if (typeof result === "object" && result.type === "image") {
        // For image files, check if image occlusion is selected
        if (cardType !== "image-occlusion") {
          throw new Error(
            "Image files can only be used with Image Occlusion card type. Please select 'Image Occlusion' from the card type dropdown."
          );
        }

        // Process image for image occlusion
        await processImageForOcclusion(result, { cardType, cardCount });
      } else {
        // For text content, ensure it's not image occlusion
        if (cardType === "image-occlusion") {
          throw new Error(
            "Image Occlusion requires an image file. Please upload an image or select a different card type."
          );
        }

        if (!result) {
          throw new Error("No text content could be extracted from the file");
        }

        // Generate flashcards from text
        await processText(result, { cardType, cardCount });
      }

      // Ensure loading screen stays for at least 3 seconds
      const elapsedTime = Date.now() - loadingStartTime;
      const remainingTime = Math.max(0, 3000 - elapsedTime);

      if (remainingTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, remainingTime));
      }

      // Update last generation time for free tier
      if (!isPremium) {
        lastGenerationTime = Date.now();
      }
    } catch (error) {
      console.error("Error generating flashcards:", error);
      showErrorMessage(
        error.message || "Failed to generate flashcards. Please try again."
      );
    } finally {
      showLoading(false);
    }
  });

  // Modify processText function to respect free tier limits
  async function processText(text, options = {}) {
    if (isGenerating) return;
    isGenerating = true;

    try {
      // Get card type and count from options or fallback to form values
      const cardType =
        options.cardType ||
        $("#uploadCardType").val() ||
        $("#urlCardType").val();
      const cardCount =
        options.cardCount ||
        parseInt($("#uploadCardCount").val()) ||
        parseInt($("#urlCardCount").val());

      // Always treat as premium for testing
      const isPremium = true;

      // Make the API request
      const response = await fetch(
        "http://localhost:12345/api/generate-flashcards",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text,
            cardType,
            cardCount,
            options: {
              userId: currentUser?.uid,
              isPremium: true, // Always send premium status
            },
          }),
        }
      );

      if (!response.ok) {
        console.log(
          "API response not ok, status:",
          response.status,
          response.statusText
        ); // Debug log

        let errorMessage = "Failed to generate flashcards";

        if (response.status === 413) {
          errorMessage =
            "Content is too large for processing. Try with shorter text or reduce the number of cards.";
        } else if (response.status === 429) {
          errorMessage =
            "Too many requests. Please wait a moment before trying again.";
        } else if (response.status === 500) {
          errorMessage = "Server error. Please try again later.";
        } else if (response.status >= 400 && response.status < 500) {
          errorMessage =
            "Invalid request. Please check your content and try again.";
        }

        const error = await response.json().catch(() => ({}));
        console.log("API error details:", error); // Debug log

        // Check for specific OpenAI configuration errors
        if (
          error.details &&
          error.details.includes("'messages' must contain the word 'json'")
        ) {
          throw new Error(
            "Backend configuration issue: The AI service is not properly configured. Please contact support or try again later."
          );
        }

        throw new Error(error.details || error.message || errorMessage);
      }

      const data = await response.json();
      flashcards = data.flashcards;

      // Update UI with flashcards
      updateFlashcardViewer(flashcards);
      showFlashcardViewer(true);

      // Update card count for premium users
      if (isPremium && currentUser) {
        monthlyCardCount += flashcards.length;
        await setDoc(doc(db, "users", currentUser.uid), {
          monthlyCardCount,
        });
      }

      // Show success message
      showSuccessMessage("Flashcards generated successfully");
      console.log("Flashcard generation completed successfully");
    } catch (error) {
      console.error("Error generating flashcards:", error);
      throw error;
    } finally {
      isGenerating = false;
    }
  }

  // Add updateFlashcardViewer function
  function updateFlashcardViewer(flashcards) {
    if (!flashcards || flashcards.length === 0) {
      showFlashcardViewer(false);
      return;
    }

    // Update flashcard display
    currentCardIndex = 0;
    updateFlashcard();

    // Update Study Now button
    updateStudyNowButton();

    // Show the viewer
    showFlashcardViewer(true);
  }

  // Helper function to update loading message
  function updateLoadingMessage(message) {
    const loadingMessage = document.querySelector(".loading-message h3");
    if (loadingMessage) {
      loadingMessage.textContent = message;
    }
  }

  // Helper function to clean and format card content
  function cleanCardContent(content) {
    if (!content) return "";

    return (
      content
        .trim()
        // Remove multiple spaces
        .replace(/\s+/g, " ")
        // Remove any HTML tags
        .replace(/<[^>]*>/g, "")
        // Fix common formatting issues
        .replace(/\n\s*\n/g, "\n")
        // Ensure proper sentence endings
        .replace(/([^.!?])\s*$/, "$1.")
        // Remove any markdown formatting
        .replace(/[*_`#]/g, "")
    );
  }

  // Add a function to validate AI response
  function validateAIResponse(cards) {
    return cards.every((card) => {
      // Check required fields
      if (!card.front || !card.back) return false;

      // Check content length
      if (card.front.length < 10 || card.back.length < 20) return false;

      // Check for common issues
      if (card.front === card.back) return false;
      if (card.front.includes("undefined") || card.back.includes("undefined"))
        return false;

      return true;
    });
  }

  // Add error handling for AI-specific issues
  const AI_ERROR_MESSAGES = {
    context_length_exceeded:
      "The text is too long. Please try with a shorter text or split it into smaller sections.",
    invalid_request:
      "The AI service is having trouble processing this content. Please try rephrasing or using different text.",
    rate_limit_exceeded:
      "Too many requests. Please wait a moment before trying again.",
    content_filter:
      "The content contains material that cannot be processed. Please check the text and try again.",
    model_overloaded:
      "The AI service is currently busy. Please try again in a few moments.",
  };

  // UI update functions
  function showFlashcardViewer(show) {
    if (show) {
      $("#emptyState").hide();
      $("#flashcardViewer").show();
      // Reinitialize flashcard controls when showing the viewer
      initializeFlashcardControls();
    } else {
      $("#flashcardViewer").hide();
      $("#emptyState").show();
    }
  }

  function showLoading(show) {
    const loadingIndicator = document.getElementById("loadingIndicator");

    if (show) {
      loadingStartTime = Date.now();
      // Remove any previous fade-out class
      loadingIndicator.classList.remove("fade-out");
      // Add show class to display and animate in
      loadingIndicator.classList.add("show");
    } else {
      const elapsedTime = Date.now() - loadingStartTime;
      const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsedTime);

      // Add fade-out class for smooth transition
      loadingIndicator.classList.add("fade-out");

      // Wait for the minimum time and animation to complete before hiding
      setTimeout(() => {
        loadingIndicator.classList.remove("show", "fade-out");
      }, remainingTime + 300); // Add 300ms for fade out animation
    }
  }

  // Add refund-related error messages
  const SUBSCRIPTION_ERRORS = {
    card_declined: "Your card was declined. Please try a different card.",
    insufficient_funds: "Your card has insufficient funds.",
    expired_card: "Your card has expired. Please update your card details.",
    processing_error:
      "There was an error processing your payment. Please try again.",
    rate_limit: "Too many attempts. Please try again later.",
    invalid_request: "Invalid payment information. Please check your details.",
    authentication_required:
      "Additional authentication is required. Please check your email.",
    subscription_canceled: "Your subscription has been canceled.",
    subscription_past_due:
      "Your subscription is past due. Please update your payment method.",
    subscription_unpaid:
      "Your subscription is unpaid. Please update your payment method.",
    refund_window_expired: "Refund request is outside the 7-day window",
    refund_processing_error: "Error processing refund request",
    refund_already_processed:
      "Refund has already been processed for this subscription",
  };

  // Handle subscription buttons
  $(document).on("click", "#monthlySubBtn, #yearlySubBtn", async function () {
    if (!currentUser) {
      $("#authModal").show();
      return;
    }

    const priceId = $(this).data("price-id");
    const isUpgrade = $(this).data("upgrade") === "true";
    const currentPlan = $(this).data("current-plan");

    if (!priceId) {
      console.error("Price ID not found");
      alert("Error: Price ID not configured. Please contact support.");
      return;
    }

    try {
      showLoading(true);
      const response = await fetch("/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          priceId: priceId,
          userId: currentUser.uid,
          isUpgrade: isUpgrade,
          currentPlan: currentPlan,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create checkout session");
      }

      const { sessionId } = await response.json();
      const stripe = await loadStripe(PRICES.MONTHLY.id.split("_")[0]);

      const { error } = await stripe.redirectToCheckout({ sessionId });
      if (error) {
        throw new Error(error.message);
      }
    } catch (error) {
      console.error("Subscription error:", error);
      const errorMessage =
        SUBSCRIPTION_ERRORS[error.code] ||
        "An error occurred while processing your subscription. Please try again.";
      showSubscriptionError(errorMessage);
    } finally {
      showLoading(false);
    }
  });

  // Handle subscription cancellation
  $(document).on("click", "#cancelSubBtn", async function () {
    const subscriptionDetails = subscriptionManager.getSubscriptionDetails();
    const subscriptionStart = new Date(subscriptionDetails.startDate);
    const now = new Date();
    const daysSinceStart = (now - subscriptionStart) / (1000 * 60 * 60 * 24);
    const isRefundEligible = daysSinceStart <= 7;

    let cancelOptions = {
      title: "Cancel Subscription",
      message: isRefundEligible
        ? "Would you like to request a refund? You're within the 7-day refund window."
        : "Are you sure you want to cancel your subscription? You'll continue to have access until the end of your billing period.",
      showRefundOption: isRefundEligible,
    };

    const result = await showCancelConfirmationModal(cancelOptions);
    if (!result.confirmed) return;

    try {
      showLoading(true);
      const response = await fetch("/cancel-subscription", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: currentUser.uid,
          cancelAtPeriodEnd: !result.requestRefund,
          requestRefund: result.requestRefund,
          reason: result.reason,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error.message || "Failed to cancel subscription");
      }

      const result = await response.json();
      await updateSubscriptionUI();

      if (result.refund) {
        showSuccessMessage(
          "Subscription canceled and refund processed successfully. The refund will appear in your account within 5-10 business days."
        );
      } else {
        showSuccessMessage(result.message);
      }
    } catch (error) {
      console.error("Error canceling subscription:", error);
      showSubscriptionError(
        SUBSCRIPTION_ERRORS[error.code] ||
          error.message ||
          "An error occurred while canceling your subscription. Please try again."
      );
    } finally {
      showLoading(false);
    }
  });

  // Handle subscription reactivation
  $(document).on("click", "#reactivateSubBtn", async function () {
    try {
      showLoading(true);
      const response = await fetch("/reactivate-subscription", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: currentUser.uid,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to reactivate subscription");
      }

      await updateSubscriptionUI();
      alert("Your subscription has been reactivated!");
    } catch (error) {
      console.error("Error reactivating subscription:", error);
      showSubscriptionError(
        SUBSCRIPTION_ERRORS[error.code] ||
          "An error occurred while reactivating your subscription. Please try again."
      );
    } finally {
      showLoading(false);
    }
  });

  // Update subscription UI
  async function updateSubscriptionUI() {
    const subscriptionDetails = subscriptionManager.getSubscriptionDetails();
    const $subscriptionStatus = $("#subscriptionStatus");
    const $pricingOptions = $(".pricing-options");
    const $currentPlan = $("#currentPlan");
    const $nextBillingDate = $("#nextBillingDate");
    const $cancelSubBtn = $("#cancelSubBtn");
    const $reactivateSubBtn = $("#reactivateSubBtn");

    if (subscriptionDetails.isPremium) {
      $subscriptionStatus.show();
      $pricingOptions.hide();

      // Update plan details
      $currentPlan.text(`Current Plan: ${subscriptionDetails.planName}`);

      // Format and show next billing date
      const nextBilling = new Date(subscriptionDetails.nextBillingDate);
      $nextBillingDate.text(
        `Next billing date: ${nextBilling.toLocaleDateString()}`
      );

      // Show appropriate buttons based on subscription status
      if (subscriptionDetails.status === "active") {
        $cancelSubBtn.show();
        $reactivateSubBtn.hide();
      } else if (subscriptionDetails.status === "canceled") {
        $cancelSubBtn.hide();
        $reactivateSubBtn.show();
        $nextBillingDate.text(
          "Subscription will end on: " + nextBilling.toLocaleDateString()
        );
      } else if (subscriptionDetails.status === "refunded") {
        $cancelSubBtn.hide();
        $reactivateSubBtn.hide();
        $nextBillingDate.text(
          "Subscription refunded on: " +
            new Date(
              subscriptionDetails.refundDetails.date
            ).toLocaleDateString()
        );
        showSuccessMessage(
          `Refund processed successfully. Amount: $${(
            subscriptionDetails.refundDetails.amount / 100
          ).toFixed(2)}`
        );
      } else if (subscriptionDetails.status === "past_due") {
        $cancelSubBtn.show();
        $reactivateSubBtn.hide();
        $nextBillingDate.text("Payment required to maintain access");
        showSubscriptionError(
          "Your subscription is past due. Please update your payment method."
        );
      }
    } else {
      $subscriptionStatus.hide();
      $pricingOptions.show();
    }

    // Update pricing buttons based on current subscription
    updatePricingButtons(subscriptionDetails);
  }

  // Update pricing buttons based on current subscription
  function updatePricingButtons(subscriptionDetails) {
    const $monthlyBtn = $("#monthlySubBtn");
    const $yearlyBtn = $("#yearlySubBtn");

    if (subscriptionDetails.isPremium) {
      // If user has monthly plan, show upgrade to yearly
      if (subscriptionDetails.planName === "Monthly") {
        $monthlyBtn.hide();
        $yearlyBtn
          .show()
          .text("Upgrade to Yearly")
          .data("upgrade", "true")
          .data("current-plan", "monthly");
      }
      // If user has yearly plan, show downgrade to monthly
      else if (subscriptionDetails.planName === "Yearly") {
        $yearlyBtn.hide();
        $monthlyBtn
          .show()
          .text("Downgrade to Monthly")
          .data("upgrade", "true")
          .data("current-plan", "yearly");
      }
    } else {
      // Reset buttons for new subscriptions
      $monthlyBtn
        .show()
        .text("Subscribe Monthly")
        .removeData("upgrade")
        .removeData("current-plan");
      $yearlyBtn
        .show()
        .text("Subscribe Yearly")
        .removeData("upgrade")
        .removeData("current-plan");
    }
  }

  // Show subscription error
  function showSubscriptionError(message) {
    // Remove any existing error messages
    $(".subscription-error").remove();

    // Add new error message
    $(".subscription-status").prepend(`
      <div class="subscription-error">
        <p>${message}</p>
        <button class="btn btn-link" onclick="this.parentElement.remove()">Dismiss</button>
      </div>
    `);
  }

  // Update UI based on subscription status
  function updatePremiumFeatures() {
    // Always show premium features for testing
    $(".premium-feature").removeClass("locked");
    $("#premiumBadge").show();
    $(".premium-option").show();
    updateCardCountOptions();
  }

  // Update card count options
  function updateCardCountOptions() {
    const $cardCountSelects = $("#cardCount");
    $cardCountSelects.each(function () {
      const $select = $(this);
      // Show all options
      $select.find(".premium-option").show();
    });
  }

  // Update the card type selection handler to show card count options
  $("#cardType").on("change", function () {
    const $cardCountGroup = $("#cardCountGroup");
    if ($(this).val()) {
      $cardCountGroup.show();
      updateCardCountOptions(); // Update options when shown
    } else {
      $cardCountGroup.hide();
    }
  });

  // Add cancel confirmation modal
  function showCancelConfirmationModal(options) {
    return new Promise((resolve) => {
      const modalHtml = `
        <div class="modal" id="cancelConfirmationModal">
          <div class="modal-content">
            <span class="close">&times;</span>
            <h2>${options.title}</h2>
            <p>${options.message}</p>
            ${
              options.showRefundOption
                ? `
              <div class="refund-option">
                <label>
                  <input type="checkbox" id="requestRefund">
                  Request a refund (within 7 days of purchase)
                </label>
                <div id="refundReasonContainer" style="display: none; margin-top: 1rem;">
                  <label for="refundReason">Reason for refund:</label>
                  <textarea id="refundReason" rows="3" placeholder="Please let us know why you're requesting a refund..."></textarea>
                </div>
              </div>
            `
                : ""
            }
            <div class="modal-actions">
              <button class="btn btn-secondary" id="cancelBtn">Cancel</button>
              <button class="btn btn-primary" id="confirmBtn">Confirm</button>
            </div>
          </div>
        </div>
      `;

      // Add modal to DOM
      $("body").append(modalHtml);
      const $modal = $("#cancelConfirmationModal");
      $modal.show();

      // Handle refund option toggle
      if (options.showRefundOption) {
        $("#requestRefund").on("change", function () {
          $("#refundReasonContainer").toggle(this.checked);
        });
      }

      // Handle modal close
      $modal.find(".close, #cancelBtn").on("click", function () {
        $modal.remove();
        resolve({ confirmed: false });
      });

      // Handle confirmation
      $("#confirmBtn").on("click", function () {
        const requestRefund = $("#requestRefund").is(":checked");
        const reason = $("#refundReason").val();

        if (requestRefund && !reason.trim()) {
          showSubscriptionError(
            "Please provide a reason for the refund request"
          );
          return;
        }

        $modal.remove();
        resolve({
          confirmed: true,
          requestRefund,
          reason: reason.trim(),
        });
      });
    });
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

    // Check if all required elements exist
    if (
      !mobileMenuBtn ||
      !mobileMenu ||
      !mobileShowLoginBtn ||
      !mobileLogoutBtn ||
      !mobileUserEmail
    ) {
      console.warn(
        "Some mobile menu elements are missing. Mobile menu functionality may be limited."
      );
      return;
    }

    // Toggle mobile menu
    mobileMenuBtn.addEventListener("click", () => {
      mobileMenu.classList.toggle("show");
      // Update aria-expanded
      const isExpanded = mobileMenu.classList.contains("show");
      mobileMenuBtn.setAttribute("aria-expanded", isExpanded);
      // Update icon
      const icon = mobileMenuBtn.querySelector("i");
      if (icon) {
        icon.className = isExpanded ? "fas fa-times" : "fas fa-bars";
      }
    });

    // Close mobile menu when clicking outside
    document.addEventListener("click", (e) => {
      if (!mobileMenu.contains(e.target) && !mobileMenuBtn.contains(e.target)) {
        mobileMenu.classList.remove("show");
        mobileMenuBtn.setAttribute("aria-expanded", "false");
        const icon = mobileMenuBtn.querySelector("i");
        if (icon) {
          icon.className = "fas fa-bars";
        }
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
    document.querySelectorAll(".input-tabs .tab-btn").forEach((button) => {
      button.addEventListener("click", () => {
        const tab = button.dataset.tab;

        // Update tab buttons
        document.querySelectorAll(".input-tabs .tab-btn").forEach((btn) => {
          btn.classList.remove("active");
        });
        button.classList.add("active");

        // Update tab content
        document.querySelectorAll(".input-tab-content").forEach((content) => {
          content.classList.remove("active");
        });
        document.getElementById(`${tab}Tab`).classList.add("active");

        // Stop camera when switching away from camera tab
        if (tab !== "camera" && cameraStream) {
          stopCamera();
        }
      });
    });
  }

  // Camera handling functions
  let cameraStream = null;
  let capturedImage = null;

  async function initializeCamera() {
    const cameraPreview = document.getElementById("cameraPreview");
    const cameraFeed = document.getElementById("cameraFeed");
    const cameraStatus = document.getElementById("cameraStatus");
    const captureBtn = document.getElementById("captureBtn");
    const retakeBtn = document.getElementById("retakeBtn");
    const processImageBtn = document.getElementById("processImageBtn");
    const capturedImage = document.getElementById("capturedImage");
    const cameraContainer = document.getElementById("cameraPreview");

    if (
      !cameraPreview ||
      !cameraFeed ||
      !cameraStatus ||
      !captureBtn ||
      !retakeBtn ||
      !processImageBtn ||
      !capturedImage
    ) {
      console.warn(
        "Some camera elements are missing. Camera functionality may be limited."
      );
      return;
    }

    // Handle camera button click
    document
      .getElementById("cameraBtn")
      ?.addEventListener("click", async () => {
        try {
          // Show camera preview
          cameraContainer.style.display = "block";
          document.getElementById("dropzone").style.display = "none";

          // Request camera access
          cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" },
            audio: false,
          });

          // Set up video stream
          cameraFeed.srcObject = cameraStream;
          cameraStatus.textContent = "Camera ready";
          captureBtn.disabled = false;

          // Wait for video to be ready
          await new Promise((resolve) => {
            cameraFeed.onloadedmetadata = resolve;
          });

          // Start playing the video
          await cameraFeed.play();
        } catch (error) {
          console.error("Error accessing camera:", error);
          cameraStatus.textContent = "Error accessing camera: " + error.message;
          showErrorMessage(
            "Could not access camera. Please ensure camera permissions are granted."
          );
        }
      });

    // Handle capture button
    captureBtn.addEventListener("click", () => {
      const canvas = document.getElementById("cameraCanvas");
      const context = canvas.getContext("2d");

      // Set canvas size to match video
      canvas.width = cameraFeed.videoWidth;
      canvas.height = cameraFeed.videoHeight;

      // Draw current video frame to canvas
      context.drawImage(cameraFeed, 0, 0, canvas.width, canvas.height);

      // Convert canvas to image
      capturedImage.src = canvas.toDataURL("image/jpeg");
      document.querySelector(".captured-image").style.display = "block";

      // Update UI
      captureBtn.style.display = "none";
      retakeBtn.style.display = "block";
      processImageBtn.style.display = "block";
      cameraStatus.textContent = "Image captured";
    });

    // Handle retake button
    retakeBtn.addEventListener("click", () => {
      // Reset UI
      document.querySelector(".captured-image").style.display = "none";
      captureBtn.style.display = "block";
      retakeBtn.style.display = "none";
      processImageBtn.style.display = "none";
      cameraStatus.textContent = "Camera ready";
    });

    // Handle process image button
    processImageBtn.addEventListener("click", async () => {
      try {
        showLoading(true);
        cameraStatus.textContent = "Processing image...";

        // Convert captured image to blob
        const response = await fetch(capturedImage.src);
        const blob = await response.blob();

        // Process the image as a file
        await validateAndProcessFile(blob);

        // Clean up
        stopCamera();
        cameraContainer.style.display = "none";
        document.getElementById("dropzone").style.display = "flex";
      } catch (error) {
        console.error("Error processing image:", error);
        cameraStatus.textContent = "Error processing image: " + error.message;
        showErrorMessage("Failed to process image. Please try again.");
      } finally {
        showLoading(false);
      }
    });
  }

  function stopCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      cameraStream = null;
    }
    const cameraFeed = document.getElementById("cameraFeed");
    if (cameraFeed) {
      cameraFeed.srcObject = null;
    }
  }

  // Initialize everything when document is ready
  $(document).ready(function () {
    // Initialize tab switching
    initializeTabSwitching();

    // Initialize flashcard controls
    initializeFlashcardControls();

    // Initialize session recovery
    initializeSessionRecovery();

    // Initialize mobile menu
    initializeMobileMenu();

    // Initialize camera functionality
    initializeCamera();

    // Initialize billing toggle
    function initializeBillingToggle() {
      const $billingOptions = $(".billing-option");
      const $prices = $(".price");

      // Set initial state only if billing options exist
      if ($billingOptions.length === 0) return;

      // Set body attribute for CSS targeting
      $("body").attr("data-billing", "monthly");

      // Initialize price visibility - hide all first, then show monthly
      $prices.removeClass("active").hide();
      $(".price.monthly").addClass("active").show();

      $billingOptions.on("click", function () {
        const billingType = $(this).data("billing");

        // Update billing option states
        $billingOptions.removeClass("active");
        $(this).addClass("active");

        // Update body attribute
        $("body").attr("data-billing", billingType);

        // Update price visibility
        $prices.removeClass("active").hide();
        $(`.price.${billingType}`).addClass("active").show();

        // Update subscription buttons if they exist
        updateSubscriptionButtons(billingType);
      });
    }

    // Update subscription buttons based on billing type
    function updateSubscriptionButtons(billingType) {
      const $proBtn = $("#proSubBtn");
      const $ultimateBtn = $("#ultimateSubBtn");

      if ($proBtn.length) {
        $proBtn.text(
          billingType === "yearly"
            ? "Get Pro Yearly - Save 25%!"
            : "Get Pro Monthly"
        );
      }

      if ($ultimateBtn.length) {
        $ultimateBtn.text(
          billingType === "yearly"
            ? "Get Ultimate Yearly - Save 42%!"
            : "Get Ultimate Monthly"
        );
      }
    }

    // Initialize billing toggle when document is ready
    initializeBillingToggle();

    // Add tab switching handler
    $(".input-tabs .tab-btn").on("click", function () {
      const tab = $(this).data("tab");
      $(".input-tabs .tab-btn").removeClass("active");
      $(".input-tab-content").removeClass("active");
      $(this).addClass("active");
      $(`#${tab}Tab`).addClass("active");

      // Initialize file handling when content tab is active
      if (tab === "content") {
        initializeFileHandling();
      }
    });

    // Initialize file handling if content tab is active by default
    if ($("#contentTab").hasClass("active")) {
      initializeFileHandling();
    }

    // Add save deck button handler
    $("#saveDeckBtn").on("click", async function () {
      const deckName = $("#deckName").val().trim();
      if (!deckName) {
        showErrorMessage("Please enter a deck name");
        return;
      }
      if (!flashcards || flashcards.length === 0) {
        showErrorMessage("No flashcards to save");
        return;
      }
      if (!currentUser) {
        showErrorMessage("Please log in to save decks");
        return;
      }

      try {
        showLoading(true);
        await deckManager.saveDeck(deckName, flashcards);
        await loadUserDecks(); // Refresh the deck list
        showSuccessMessage("Deck saved successfully!");
        $("#deckName").val(""); // Clear the deck name input
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

    // Stop camera when leaving page
    window.addEventListener("beforeunload", () => {
      stopCamera();
    });
  });

  // ... existing code ...

  // Add file handling initialization function
  function initializeFileHandling() {
    const dropzone = document.getElementById("dropzone");
    const fileInput = document.getElementById("fileInput");

    if (!dropzone || !fileInput) {
      console.warn(
        "File handling elements not found. Make sure the content upload tab is active."
      );
      return;
    }

    // Handle file selection
    dropzone.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", (e) => {
      if (e.target.files.length > 0) {
        validateAndProcessFile(e.target.files[0]);
      }
    });

    // Handle drag and drop
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
        validateAndProcessFile(e.dataTransfer.files[0]);
      }
    });
  }

  // ... existing code ...

  // Knowledge Hub Initialization
  function initializeKnowledgeHub() {
    const categoryTabs = document.querySelectorAll(".category-tab");
    const searchInput = document.getElementById("deckSearch");
    const sortSelect = document.getElementById("sortDeck");
    const levelFilter = document.getElementById("filterLevel");
    const createDeckBtn = document.getElementById("createDeckBtn");
    const createDeckModal = document.getElementById("createDeckModal");
    const createDeckForm = document.getElementById("createDeckForm");
    const closeModalBtn = createDeckModal.querySelector(".close");

    // Initialize category tabs
    categoryTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        categoryTabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        filterDecks();
      });
    });

    // Initialize search
    let searchTimeout;
    searchInput.addEventListener("input", (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        filterDecks();
      }, 300);
    });

    // Initialize filters
    sortSelect.addEventListener("change", filterDecks);
    levelFilter.addEventListener("change", filterDecks);

    // Initialize create deck modal
    createDeckBtn.addEventListener("click", () => {
      createDeckModal.style.display = "block";
    });

    closeModalBtn.addEventListener("click", () => {
      createDeckModal.style.display = "none";
    });

    window.addEventListener("click", (e) => {
      if (e.target === createDeckModal) {
        createDeckModal.style.display = "none";
      }
    });

    // Handle deck creation
    createDeckForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const deckName = document.getElementById("newDeckName").value;
      const category = document.getElementById("deckCategory").value;
      const level = document.getElementById("deckLevel").value;
      const description = document.getElementById("deckDescription").value;

      try {
        const deck = {
          name: deckName,
          category,
          level,
          description,
          cards: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: currentUser.uid,
          stats: {
            views: 0,
            favorites: 0,
            downloads: 0,
          },
        };

        await deckManager.createDeck(deck);
        createDeckModal.style.display = "none";
        createDeckForm.reset();
        await loadDecks();
        showNotification("Deck created successfully!", "success");
      } catch (error) {
        console.error("Error creating deck:", error);
        showNotification("Failed to create deck. Please try again.", "error");
      }
    });

    // Initial load of decks
    loadDecks();
  }

  // Filter and sort decks
  async function filterDecks() {
    const activeCategory = document.querySelector(".category-tab.active")
      .dataset.category;
    const searchQuery = document
      .getElementById("deckSearch")
      .value.toLowerCase();
    const sortBy = document.getElementById("sortDeck").value;
    const levelFilter = document.getElementById("filterLevel").value;

    try {
      let decks = await deckManager.getDecks();

      // Apply filters
      decks = decks.filter((deck) => {
        const matchesCategory =
          activeCategory === "all" || deck.category === activeCategory;
        const matchesSearch =
          deck.name.toLowerCase().includes(searchQuery) ||
          deck.description.toLowerCase().includes(searchQuery);
        const matchesLevel =
          levelFilter === "all" || deck.level === levelFilter;
        return matchesCategory && matchesSearch && matchesLevel;
      });

      // Apply sorting
      decks.sort((a, b) => {
        switch (sortBy) {
          case "recent":
            return new Date(b.updatedAt) - new Date(a.updatedAt);
          case "popular":
            return b.stats.views - a.stats.views;
          case "cards":
            return b.cards.length - a.cards.length;
          case "rating":
            return (
              b.stats.favorites / (b.stats.views || 1) -
              a.stats.favorites / (a.stats.views || 1)
            );
          default:
            return 0;
        }
      });

      displayDecks(decks);
    } catch (error) {
      console.error("Error filtering decks:", error);
      showNotification("Failed to load decks. Please try again.", "error");
    }
  }

  // Display decks in the grid
  function displayDecks(decks) {
    const deckGrid = document.getElementById("savedDecks");
    deckGrid.innerHTML = "";

    if (decks.length === 0) {
      deckGrid.innerHTML = `
        <div class="no-decks-message">
          <i class="fas fa-search"></i>
          <p>No decks found matching your criteria</p>
          <button class="btn btn-primary" onclick="document.getElementById('createDeckBtn').click()">
            Create Your First Deck
          </button>
        </div>
      `;
      return;
    }

    decks.forEach((deck) => {
      const deckCard = document.createElement("div");
      deckCard.className = "deck-card";
      deckCard.innerHTML = `
        <div class="deck-card-header">
          <h3 class="deck-card-title">${deck.name}</h3>
          <span class="deck-card-category ${deck.category}">${
        deck.category
      }</span>
        </div>
        <p class="deck-card-description">${
          deck.description || "No description provided"
        }</p>
        <div class="deck-card-stats">
          <span class="deck-card-stat">
            <i class="fas fa-eye"></i> ${deck.stats.views || 0} views
          </span>
          <span class="deck-card-stat">
            <i class="fas fa-heart"></i> ${deck.stats.favorites || 0} favorites
          </span>
          <span class="deck-card-stat">
            <i class="fas fa-cards"></i> ${deck.cards.length} cards
          </span>
        </div>
        <div class="deck-card-actions">
          <button class="btn btn-primary" onclick="openDeck('${deck.id}')">
            <i class="fas fa-play"></i> Study
          </button>
          <button class="btn btn-secondary" onclick="editDeck('${deck.id}')">
            <i class="fas fa-edit"></i> Edit
          </button>
        </div>
        <span class="deck-card-level ${deck.level}">${deck.level}</span>
      `;
      deckGrid.appendChild(deckCard);
    });
  }

  // Open a deck for studying
  async function openDeck(deckId) {
    try {
      const deck = await deckManager.getDeck(deckId);
      if (!deck) {
        throw new Error("Deck not found");
      }

      // Update deck stats
      deck.stats.views = (deck.stats.views || 0) + 1;
      await deckManager.updateDeck(deckId, { stats: deck.stats });

      // Navigate to study page
      window.location.href = `study.html?deck=${deckId}`;
    } catch (error) {
      console.error("Error opening deck:", error);
      showNotification("Failed to open deck. Please try again.", "error");
    }
  }

  // Edit a deck
  async function editDeck(deckId) {
    try {
      const deck = await deckManager.getDeck(deckId);
      if (!deck) {
        throw new Error("Deck not found");
      }

      // Navigate to edit page
      window.location.href = `edit.html?deck=${deckId}`;
    } catch (error) {
      console.error("Error editing deck:", error);
      showNotification("Failed to edit deck. Please try again.", "error");
    }
  }

  // Initialize Knowledge Hub when document is ready
  document.addEventListener("DOMContentLoaded", () => {
    // ... existing initialization code ...
    initializeKnowledgeHub();
  });

  // ... existing code ...

  // Add subscription tier check and card type update
  async function updateCardTypesForUserTier() {
    // Use isPremium instead of getUserTier since getUserTier doesn't exist
    const isPremium = subscriptionManager.isPremium();
    const userTier = isPremium ? "premium" : "free";
    // Only update if cardTypeManager exists and has the method
    if (
      typeof cardTypeManager !== "undefined" &&
      cardTypeManager.updateCardTypeSelectors
    ) {
      cardTypeManager.updateCardTypeSelectors(userTier);
    }
  }

  // Update card type validation in form submission
  $("#generateCardsBtn").on("click", async function (e) {
    e.preventDefault();

    // Use isPremium instead of getUserTier since getUserTier doesn't exist
    const isPremium = subscriptionManager.isPremium();
    const userTier = isPremium ? "premium" : "free";
    const cardType = $(this)
      .closest("form")
      .find('select[id$="CardType"]')
      .val();

    // Only validate if cardTypeManager exists and has the method
    if (
      typeof cardTypeManager !== "undefined" &&
      cardTypeManager.isCardTypeAvailable
    ) {
      if (!cardTypeManager.isCardTypeAvailable(cardType, userTier)) {
        showErrorMessage(
          "This card type is not available in your current plan. Please upgrade to access more card types."
        );
        return;
      }
    }

    // Continue with existing card generation logic for file upload...
    // This should trigger the file processing logic
  });

  // Update card type options when user logs in or subscription changes
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      await updateCardTypesForUserTier();
    }
  });

  // Removed subscription change listener - onSubscriptionChange method doesn't exist
  // subscriptionManager.onSubscriptionChange(async () => {
  //   await updateCardTypesForUserTier();
  // });

  // ... existing code ...
  // Quota tracker logic for free users
  async function updateQuotaTracker() {
    // Use isPremium instead of getUserTier since getUserTier doesn't exist
    const isPremium = subscriptionManager.isPremium();
    const userTier = isPremium ? "premium" : "free";

    if (userTier !== "free") {
      $("#quotaTracker").hide();
      return;
    }
    // Fetch usage from localStorage or backend (for demo, use localStorage)
    const usedFlashcards = parseInt(
      localStorage.getItem("usedFlashcards") || "0"
    );
    const usedOcclusions = parseInt(
      localStorage.getItem("usedOcclusions") || "0"
    );
    const maxFlashcards = 20; // 4 decks x 5 cards (or use FREE_TIER_LIMITS)
    const maxOcclusions = 5;
    $("#flashcardQuotaText").text(
      `Flashcards left: ${Math.max(
        0,
        maxFlashcards - usedFlashcards
      )} / ${maxFlashcards}`
    );
    $("#occlusionQuotaText").text(
      `AI Image Occlusions left: ${Math.max(
        0,
        maxOcclusions - usedOcclusions
      )} / ${maxOcclusions}`
    );
    $("#quotaTracker").show();
  }

  // Call on page load
  updateQuotaTracker();

  // Upgrade button handler
  $(document).on("click", "#upgradeBtn", function () {
    window.location.href = "/pricing.html";
  });

  // Add comprehensive study session menu
  function showStudyMenu() {
    if (!currentUser) {
      showErrorMessage("Please log in to access study sessions");
      return;
    }

    // Create study menu modal
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.innerHTML = `
      <div class="modal-content">
        <span class="close">&times;</span>
        <h2>📚 Study Session</h2>
        
        <div class="study-options">
          <div class="study-option-card" id="studyDueCards">
            <div class="option-header">
              <i class="fas fa-clock text-warning"></i>
              <h3>Due for Review</h3>
            </div>
            <p id="dueCardsCount">Loading...</p>
            <p class="option-description">Cards scheduled for review based on spaced repetition</p>
          </div>
          
          <div class="study-option-card" id="studyUnfamiliarCards">
            <div class="option-header">
              <i class="fas fa-exclamation-triangle text-danger"></i>
              <h3>Unfamiliar Cards</h3>
            </div>
            <p id="unfamiliarCardsCount">Loading...</p>
            <p class="option-description">Cards you've marked as unfamiliar</p>
          </div>
          
          <div class="study-option-card" id="studyAllCards">
            <div class="option-header">
              <i class="fas fa-th-large text-primary"></i>
              <h3>All Current Cards</h3>
            </div>
            <p id="allCardsCount">Loading...</p>
            <p class="option-description">Review all cards in the current deck</p>
          </div>
        </div>
        
        <div class="saved-decks-study">
          <h3>📁 Study Saved Decks</h3>
          <div id="studyDecksList">
            Loading decks...
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    modal.style.display = "block";

    // Populate study statistics
    updateStudyMenuStats();
    loadDecksForStudy();

    // Handle study option clicks
    modal.querySelector("#studyDueCards").addEventListener("click", () => {
      modal.remove();
      startSpacedRepetitionSession("due");
    });

    modal
      .querySelector("#studyUnfamiliarCards")
      .addEventListener("click", () => {
        modal.remove();
        startSpacedRepetitionSession("unfamiliar");
      });

    modal.querySelector("#studyAllCards").addEventListener("click", () => {
      modal.remove();
      startSpacedRepetitionSession("all");
    });

    // Handle modal close
    modal
      .querySelector(".close")
      .addEventListener("click", () => modal.remove());
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  // Update study menu statistics
  function updateStudyMenuStats() {
    if (flashcards.length === 0) {
      document.getElementById("dueCardsCount").textContent = "No cards loaded";
      document.getElementById("unfamiliarCardsCount").textContent =
        "No cards loaded";
      document.getElementById("allCardsCount").textContent = "No cards loaded";
      return;
    }

    const stats = spacedRepetition.getStats(flashcards);
    const dueCards = spacedRepetition.getDueCards(flashcards);
    const unfamiliarCards = flashcards.filter(
      (card) => card.metadata?.markedAsUnfamiliar
    );

    document.getElementById(
      "dueCardsCount"
    ).textContent = `${dueCards.length} cards ready for review`;
    document.getElementById(
      "unfamiliarCardsCount"
    ).textContent = `${unfamiliarCards.length} cards marked as unfamiliar`;
    document.getElementById(
      "allCardsCount"
    ).textContent = `${flashcards.length} total cards`;
  }

  // Load decks for study menu
  async function loadDecksForStudy() {
    const decksList = document.getElementById("studyDecksList");

    if (!deckManager || userDecks.length === 0) {
      decksList.innerHTML = "<p>No saved decks available</p>";
      return;
    }

    decksList.innerHTML = userDecks
      .map(
        (deck) => `
      <div class="study-deck-item" data-deck-id="${deck.id}">
        <div class="deck-info">
          <h4>${deck.name}</h4>
          <p>${deck.cards ? deck.cards.length : 0} cards</p>
        </div>
        <button class="btn btn-small btn-primary">Study</button>
      </div>
    `
      )
      .join("");

    // Add event listeners for deck study buttons
    decksList.querySelectorAll(".study-deck-item").forEach((item) => {
      item.addEventListener("click", async () => {
        const deckId = item.dataset.deckId;
        const deck = userDecks.find((d) => d.id === deckId);
        if (deck) {
          document.querySelector(".modal").remove();
          await initializeStudySession(deck);
        }
      });
    });
  }

  // Start spaced repetition session
  function startSpacedRepetitionSession(type) {
    let cardsToStudy = [];
    let sessionTitle = "";

    switch (type) {
      case "due":
        cardsToStudy = spacedRepetition.getDueCards(flashcards);
        sessionTitle = "Due for Review";
        break;
      case "unfamiliar":
        cardsToStudy = flashcards.filter(
          (card) => card.metadata?.markedAsUnfamiliar
        );
        sessionTitle = "Unfamiliar Cards";
        break;
      case "all":
        cardsToStudy = flashcards;
        sessionTitle = "All Current Cards";
        break;
    }

    if (cardsToStudy.length === 0) {
      showSuccessMessage(
        `No cards due for review right now! Great job staying on top of your studies.`
      );
      return;
    }

    // Start study session
    flashcards = cardsToStudy;
    currentCardIndex = 0;
    isFlipped = false;

    // Show study session UI
    showFlashcardViewer(true);
    updateFlashcard();

    // Show study session info
    showSuccessMessage(
      `Starting ${sessionTitle} session: ${cardsToStudy.length} cards to review`
    );
  }

  // Add event handler for Study Now button
  $("#studyNowBtn").on("click", function () {
    initializeStudySession();
  });

  // Add spaced repetition dashboard
  function showSpacedRepetitionDashboard() {
    if (!currentUser) {
      showErrorMessage("Please log in to view your study dashboard");
      return;
    }

    // Create dashboard modal
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.innerHTML = `
      <div class="modal-content">
        <span class="close">&times;</span>
        <h2>📊 Study Dashboard</h2>
        
        <div class="dashboard-stats">
          <div class="stat-card">
            <div class="stat-icon">📚</div>
            <div class="stat-content">
              <h3 id="totalCardsStudied">-</h3>
              <p>Cards Studied</p>
            </div>
          </div>
          
          <div class="stat-card">
            <div class="stat-icon">⚡</div>
            <div class="stat-content">
              <h3 id="dailyStreak">-</h3>
              <p>Day Streak</p>
            </div>
          </div>
          
          <div class="stat-card">
            <div class="stat-icon">📈</div>
            <div class="stat-content">
              <h3 id="averageScore">-</h3>
              <p>Average Score</p>
            </div>
          </div>
          
          <div class="stat-card">
            <div class="stat-icon">🎯</div>
            <div class="stat-content">
              <h3 id="retentionRate">-</h3>
              <p>Retention Rate</p>
            </div>
          </div>
        </div>
        
        <div class="review-schedule">
          <h3>📅 Review Schedule</h3>
          <div id="reviewScheduleList">
            Loading review schedule...
          </div>
        </div>
        
        <div class="dashboard-actions">
          <button class="btn btn-primary" id="startReviewSession">
            <i class="fas fa-play"></i> Start Review Session
          </button>
          <button class="btn btn-secondary" id="viewAllDecks">
            <i class="fas fa-folder"></i> View All Decks
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    modal.style.display = "block";

    // Populate dashboard data
    updateDashboardStats();
    updateReviewSchedule();

    // Handle dashboard actions
    modal.querySelector("#startReviewSession").addEventListener("click", () => {
      modal.remove();
      showStudyMenu();
    });

    modal.querySelector("#viewAllDecks").addEventListener("click", () => {
      modal.remove();
      // Navigate to deck management or show deck list
      document.querySelector('.nav-tabs .tab-btn[data-tab="decks"]')?.click();
    });

    // Handle modal close
    modal
      .querySelector(".close")
      .addEventListener("click", () => modal.remove());
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  // Update dashboard statistics
  function updateDashboardStats() {
    const reviewData = spacedRepetition.reviewData;
    let totalStudied = 0;
    let totalScore = 0;
    let correctAnswers = 0;
    let totalAnswers = 0;

    reviewData.forEach((data) => {
      totalStudied++;
      if (data.repetitions > 0) {
        totalScore += data.easeFactor;
        totalAnswers++;
        if (data.repetitions > 1) {
          correctAnswers++;
        }
      }
    });

    // Update DOM elements
    document.getElementById("totalCardsStudied").textContent = totalStudied;
    document.getElementById("dailyStreak").textContent = calculateStreak();
    document.getElementById("averageScore").textContent =
      totalAnswers > 0
        ? `${((totalScore / totalAnswers) * 20).toFixed(0)}%`
        : "0%";
    document.getElementById("retentionRate").textContent =
      totalAnswers > 0
        ? `${((correctAnswers / totalAnswers) * 100).toFixed(0)}%`
        : "0%";
  }

  // Calculate study streak
  function calculateStreak() {
    // Simple streak calculation - this could be enhanced with actual daily study tracking
    const lastStudied = localStorage.getItem("lastStudyDate");
    const today = new Date().toDateString();

    if (lastStudied === today) {
      return parseInt(localStorage.getItem("studyStreak") || "1");
    } else {
      return 0;
    }
  }

  // Update review schedule
  function updateReviewSchedule() {
    const scheduleList = document.getElementById("reviewScheduleList");
    const reviewData = spacedRepetition.reviewData;
    const schedule = new Map();

    // Group cards by review date
    reviewData.forEach((data, cardId) => {
      const reviewDate = new Date(data.nextReview).toDateString();
      if (!schedule.has(reviewDate)) {
        schedule.set(reviewDate, []);
      }
      schedule.get(reviewDate).push({ cardId, data });
    });

    // Create schedule display
    const sortedDates = Array.from(schedule.keys()).sort(
      (a, b) => new Date(a) - new Date(b)
    );
    const today = new Date().toDateString();

    if (sortedDates.length === 0) {
      scheduleList.innerHTML = "<p>No cards scheduled for review</p>";
      return;
    }

    scheduleList.innerHTML = sortedDates
      .slice(0, 7)
      .map((date) => {
        const cards = schedule.get(date);
        const isToday = date === today;
        const isPast = new Date(date) < new Date(today);

        return `
        <div class="schedule-item ${isToday ? "today" : ""} ${
          isPast ? "overdue" : ""
        }">
          <div class="schedule-date">
            ${
              isToday
                ? "Today"
                : isPast
                ? "Overdue"
                : new Date(date).toLocaleDateString()
            }
          </div>
          <div class="schedule-count">${cards.length} cards</div>
        </div>
      `;
      })
      .join("");
  }

  // Enhanced progress tracking
  function trackStudySession() {
    const today = new Date().toDateString();
    const lastStudied = localStorage.getItem("lastStudyDate");
    const currentStreak = parseInt(localStorage.getItem("studyStreak") || "0");

    if (lastStudied !== today) {
      const newStreak =
        lastStudied === new Date(Date.now() - 86400000).toDateString()
          ? currentStreak + 1
          : 1;

      localStorage.setItem("studyStreak", newStreak.toString());
      localStorage.setItem("lastStudyDate", today);
    }
  }

  // Add dashboard button to navigation (if it doesn't exist)
  function addDashboardButton() {
    const dashboardBtn = document.getElementById("dashboardBtn");
    if (!dashboardBtn) {
      // Add to user menu or navigation
      const userMenu = document.getElementById("userMenu");
      if (userMenu) {
        const dashboardLink = document.createElement("button");
        dashboardLink.id = "dashboardBtn";
        dashboardLink.className = "btn btn-link";
        dashboardLink.innerHTML = '<i class="fas fa-chart-line"></i> Dashboard';
        dashboardLink.addEventListener("click", showSpacedRepetitionDashboard);
        userMenu.appendChild(dashboardLink);
      }
    }
  }

  // Call trackStudySession when a card is reviewed
  // This should be called in the performance button handler

  // Add processImageForOcclusion function
  async function processImageForOcclusion(imageData, options = {}) {
    // For now, this is a placeholder - in a full implementation,
    // this would show an image occlusion editor where users can draw occlusion areas
    showErrorMessage(
      "Image Occlusion feature is under development. The UI structure is ready, but the full image processing functionality needs to be implemented on the backend."
    );

    // Future implementation would:
    // 1. Display the image in an occlusion editor
    // 2. Allow users to draw rectangular occlusion areas
    // 3. Generate flashcards with the image and occlusion data
    // 4. Send the image and occlusion coordinates to the backend for processing

    console.log("Image data:", imageData);
    console.log("Options:", options);
  }
});
