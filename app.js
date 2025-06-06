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
import { CardTypeManager } from "./cardTypeManager_new.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  initializeAuthModal,
  showAuthModal,
  hideAuthModal,
  showResetPasswordModal,
} from "./auth-modal.js";

// Import utilities and dependencies
import {
  showNotification,
  autoSaveInterval,
  startAutoSave,
  initializeSessionRecovery,
  saveSession,
  restoreSession,
} from "./utils.js";

// Declare global variables
let currentUser = null;
let deckManager = null;
let userDecks = [];
let cardTypeManager = new CardTypeManager();

// Global variables for flashcard state
let currentCardIndex = 0;
let flashcards = [];
let answerStartTime = null;

// Initialize Firebase and auth modal
document.addEventListener("DOMContentLoaded", function () {
  // Initialize the centralized auth modal
  initializeAuthModal();

  // Initialize any other app functionality here
});

$(document).ready(function () {
  // Load PDF.js worker
  loadScript(
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"
  )
    .then(() => {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      console.log("PDF.js loaded successfully");
    })
    .catch((err) => console.error("Error loading PDF.js:", err));

  // Initialize file handling
  initializeFileHandling();

  // Initialize other components
  initializeTabSwitching();
  initializeSessionRecovery();
  initializeMobileMenu();
  initializeUserMenuDropdown();

  // Initialize subscription manager
  const subscriptionManager = new SubscriptionManager();
  subscriptionManager.initialize();

  // Initialize variables
  let monthlyCardCount = 0;
  let spacedRepetition = new SpacedRepetition();
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

  // Expose necessary variables to window object for saveSession
  window.flashcards = flashcards;
  window.currentCardIndex = currentCardIndex;

  // Expose auth modal functions globally
  window.showAuthModal = showAuthModal;
  window.hideAuthModal = hideAuthModal;

  // Initialize Google Auth Provider
  const googleProvider = new GoogleAuthProvider();

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
    // Expose currentUser to window object
    window.currentUser = user;
    console.log(
      "Auth state changed, user:",
      user ? user.email : "not logged in"
    );

    // Get UI elements
    const userMenuBtn = document.getElementById("userMenuBtn");
    const showLoginBtn = document.getElementById("showLoginBtn");
    const userEmail = document.getElementById("userEmail");
    const createDeckBtn = document.getElementById("createDeckBtn");
    const importDeckBtn = document.getElementById("importDeckBtn");
    const loginToCreateBtn = document.getElementById("loginToCreateBtn");

    if (user) {
      currentUser = user;

      // Check email verification
      // For testing: allow access even if not verified
      // if (!user.emailVerified) {
      //   showVerificationRequired();
      //   await signOut(auth);
      //   return;
      // }

      deckManager = new DeckManager(user.uid);

      // Initialize KnowledgeHub with the deckManager instance
      await KnowledgeHub.init(deckManager);
      console.log("KnowledgeHub.init() completed, calling initialize()...");
      if (!window.disableKnowledgeHubAutoInit) {
        KnowledgeHub.initialize();
      }

      // Update desktop view
      if (userMenuBtn) {
        userMenuBtn.style.display = "flex";
        userEmail.textContent = user.email;
      }
      if (showLoginBtn) showLoginBtn.style.display = "none";

      // Update shared decks view
      if (createDeckBtn) createDeckBtn.style.display = "block";
      if (importDeckBtn) importDeckBtn.style.display = "block";
      if (loginToCreateBtn) loginToCreateBtn.style.display = "none";

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
      window.currentUser = null;
      deckManager = null;

      // Update desktop view
      if (userMenuBtn) userMenuBtn.style.display = "none";
      if (showLoginBtn) showLoginBtn.style.display = "block";
      if (userEmail) userEmail.textContent = "";

      // Update shared decks view
      if (createDeckBtn) createDeckBtn.style.display = "none";
      if (importDeckBtn) importDeckBtn.style.display = "none";
      if (loginToCreateBtn) loginToCreateBtn.style.display = "block";

      // Initialize KnowledgeHub without deckManager for shared decks only
      await KnowledgeHub.init(null);
      if (!window.disableKnowledgeHubAutoInit) {
        KnowledgeHub.initialize();
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
    $("#authModal .auth-form").hide();
    $("#loginForm").show();
  });

  // Close modal when clicking the close button
  $(document).on("click", ".close", function () {
    const modalId = $(this).closest(".modal").attr("id");
    hideModal(modalId);
  });

  // // Close modal when clicking outside
  // $(window).on("click", function (event) {
  //   if ($(event.target).hasClass("modal")) {
  //     hideModal($(event.target).attr("id"));
  //   }
  // });

  // Switch between login and signup tabs
  $(document).on("click", "#authTabs .tab-btn", function () {
    const tab = $(this).data("tab");
    $("#authTabs .tab-btn").removeClass("active");
    $(this).addClass("active");
    $("#authModal .auth-form").hide();
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
      showNotification(
        "Verification email has been sent. Please check your inbox.",
        "success"
      );
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
        // For testing: allow login even if not verified
        // await signOut(auth);
        // showAuthError(
        //   "Please verify your email before logging in. Check your inbox for the verification email.",
        //   "loginForm"
        // );
        // return;
      }

      hideModal("authModal");
    } catch (error) {
      console.error("Login error:", error.code, error.message); // <-- Add this line
      let userMessage = "";

      // Map Firebase error codes to user-friendly messages
      switch (error.code) {
        case "auth/invalid-credential":
          userMessage =
            "The email or password you entered is incorrect. Please try again.";
          break;
        case "auth/wrong-password":
          userMessage =
            "Incorrect password. Please try again or use the 'Forgot Password' link below.";
          break;
        case "auth/user-not-found":
          userMessage =
            "No account found with this email. Please check your email or sign up for a new account.";
          break;
        case "auth/too-many-requests":
          userMessage =
            "Too many failed login attempts. Please try again later or reset your password.";
          break;
        case "auth/network-request-failed":
          userMessage =
            "Network error. Please check your internet connection and try again.";
          break;
        case "auth/user-disabled":
          userMessage =
            "This account has been disabled. Please contact support for assistance.";
          break;
        case "auth/invalid-email":
          userMessage = "Please enter a valid email address.";
          break;
        case "auth/email-already-in-use":
          userMessage =
            "An account with this email already exists. Please try logging in instead.";
          break;
        case "auth/weak-password":
          userMessage =
            "Password is too weak. Please use a stronger password (at least 6 characters).";
          break;
        case "auth/operation-not-allowed":
          userMessage =
            "This sign-in method is not enabled. Please try a different method or contact support.";
          break;
        default:
          userMessage = "An error occurred during login. Please try again.";
      }

      // Add helpful suggestions for common errors
      if (
        error.code === "auth/wrong-password" ||
        error.code === "auth/invalid-credential"
      ) {
        userMessage +=
          " <br><a href='#' id='triggerResetPassword' class='auth-link'>Forgot password?</a>";
      } else if (error.code === "auth/user-not-found") {
        userMessage +=
          " <br><span class='auth-link'>Check your email or <a href='#' id='triggerSignup'>sign up</a>.</span>";
      } else if (error.code === "auth/too-many-requests") {
        userMessage +=
          " <br><span class='auth-link'>You can reset your password or try again later.</span>";
      } else if (error.code === "auth/network-request-failed") {
        userMessage +=
          " <br><span class='auth-link'>Check your internet connection and try again.</span>";
      }

      showAuthError(userMessage, "loginForm");

      // Add click handler for reset password link
      setTimeout(() => {
        const resetLink = document.getElementById("triggerResetPassword");
        if (resetLink) {
          resetLink.addEventListener("click", function (e) {
            e.preventDefault();
            hideModal("authModal");
            showResetPasswordModal();
          });
        }
        const signupLink = document.getElementById("triggerSignup");
        if (signupLink) {
          signupLink.addEventListener("click", function (e) {
            e.preventDefault();
            $("#authTabs .tab-btn").removeClass("active");
            $("#authTabs .tab-btn[data-tab='signup']").addClass("active");
            $("#authModal .auth-form").hide();
            $("#signupForm").show();
          });
        }
      }, 0);
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

      // Sign out the user since email is not verified
      await signOut(auth);

      // Instead of hiding modal and showNotification, show verification prompt in modal
      showAuthError(
        "Account created! A verification email has been sent. Please check your inbox and verify your email to continue.",
        "signupForm"
      );
      // Optionally, disable the signup form to prevent resubmission
      $("#signupForm input, #signupForm button").prop("disabled", true);
    } catch (error) {
      showAuthError(
        AUTH_ERROR_MESSAGES[error.code] || "An error occurred during signup.",
        "signupForm"
      );
    }
  });

  // Google login (Google accounts are pre-verified)
  $(document).on("click", "#googleLoginBtn", async function () {
    console.log("Google login button clicked");
    try {
      console.log(
        "Attempting signInWithPopup with googleProvider",
        googleProvider
      );
      const result = await signInWithPopup(auth, googleProvider);
      console.log("signInWithPopup result:", result);
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
      console.error(
        "Google login error:",
        error,
        error.code,
        error.message,
        error.stack
      );
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
    showResetPasswordModal();
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
      showNotification(
        "Password reset link has been sent to your email.",
        "success"
      );
      hideModal("resetPasswordModal");
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
      showNotification("Error signing out. Please try again.", "error");
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
      showNotification("Failed to load decks: " + error.message, "error");
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
          showNotification("Failed to load deck: " + error.message, "error");
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
          showNotification("Failed to delete deck: " + error.message, "error");
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
          showNotification("Failed to export deck: " + error.message, "error");
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
      updateQuizNowButton();
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

  // Add function to update Quiz Now button
  function updateQuizNowButton() {
    const quizBtn = $("#quizNowBtn");

    if (flashcards.length === 0) {
      quizBtn.hide();
      return;
    }

    // Show quiz button if there are any flashcards (minimum 3 for a meaningful quiz)
    if (flashcards.length >= 3) {
      quizBtn.show();
    } else {
      quizBtn.hide();
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

  // Add event handler for Quiz Now button
  $("#quizNowBtn").on("click", function () {
    if (flashcards && flashcards.length >= 3) {
      // Create deck object from current flashcards
      const quizDeck = {
        id: "current-deck",
        name: "Current Flashcards",
        description: "Quiz from your generated flashcards",
        cards: flashcards,
        cardCount: flashcards.length,
      };

      // Store deck data and redirect to quiz page
      sessionStorage.setItem("quizDeck", JSON.stringify(quizDeck));
      window.location.href = "/quiz.html";
    } else {
      showErrorMessage("You need at least 3 flashcards to take a quiz.");
    }
  });

  // Text form submission
  $("#textForm").on("submit", async function (e) {
    e.preventDefault();
    const text = $("#textInput").val().trim();
    const cardType = $("#textCardType").val();
    const cardCount = parseInt($("#textCardCount").val());

    if (!text) {
      showErrorMessage("Please enter some text to generate flashcards.");
      return;
    }

    showLoading(true);
    try {
      await processText(text, { cardType, cardCount });
      showSuccessMessage("Flashcards generated successfully!");
    } catch (error) {
      console.error("Error generating flashcards:", error);
      showErrorMessage(
        error.message || "Failed to generate flashcards. Please try again."
      );
    } finally {
      showLoading(false);
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
    const urlInput = $("#urlInput").val();
    const url = urlInput ? urlInput.trim() : "";
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
    // Remove any existing event listeners
    $("#prevCardBtn, #nextCardBtn").off("click");
    $("#shuffleBtn").off("click");
    $("#showAnswerBtn").off("click");
    $(".performance-buttons button").off("click");
    $("#flashcard").off("click");

    // Navigation buttons
    $("#prevCardBtn").on("click", function (e) {
      e.preventDefault();
      navigateCard("prev");
    });

    $("#nextCardBtn").on("click", function (e) {
      e.preventDefault();
      navigateCard("next");
    });

    // Show answer button
    $("#showAnswerBtn").on("click", function (e) {
      e.preventDefault();
      // Cancel any ongoing speech when showing answer
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }
      answerStartTime = Date.now();

      $(".card-back").slideDown(200);
      $(this).hide();
      $(".performance-buttons").slideDown(200);
    });

    // Performance buttons
    $(".performance-buttons button").on("click", function (e) {
      e.preventDefault();
      // Cancel any ongoing speech when rating performance
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }
      const answer = parseInt($(this).data("performance"));
      handlePerformanceAnswer(answer);
    });

    // Flashcard click handler
    $("#flashcard").on("click", function () {
      // Cancel any ongoing speech when flipping card
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }
      // Rest of the click handler code...
    });

    // Initial progress update
    updateProgress();
  }

  function navigateCard(direction) {
    console.log(
      "navigateCard called with direction:",
      direction,
      "currentIndex:",
      currentCardIndex
    );

    // Cancel any ongoing speech when navigating
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }

    const oldIndex = currentCardIndex;

    if (direction === "prev" && currentCardIndex > 0) {
      currentCardIndex--;
    } else if (direction === "next") {
      // Allow going past the last card to trigger quiz mode
      currentCardIndex++;
    }

    // Only update if the index actually changed
    if (oldIndex !== currentCardIndex) {
      console.log("Card index changed from", oldIndex, "to", currentCardIndex);
      updateFlashcard();
    }
  }

  function updateFlashcard() {
    console.log(
      "updateFlashcard called, currentCardIndex:",
      currentCardIndex,
      "totalCards:",
      flashcards.length
    );
    if (!flashcards || flashcards.length === 0) {
      console.log("No flashcards available");
      return;
    }

    // Check if we've gone past the last card
    if (currentCardIndex >= flashcards.length) {
      console.log("Reached end of flashcards, attempting to show quiz prompt");
      // Reset index to last card for now
      currentCardIndex = flashcards.length - 1;
      showQuizPrompt();
      return;
    }

    // Get the flashcard container
    const container = document.getElementById("flashcard");
    if (!container) {
      console.error("Flashcard container not found");
      return;
    }

    container.innerHTML = ""; // Clear existing content

    // Create a new instance of CardTypeManager
    const cardManager = new CardTypeManager();

    // Render the card using the appropriate renderer
    cardManager.renderCard(
      flashcards[currentCardIndex],
      flashcards[currentCardIndex].type || "cloze",
      container
    );

    // Add pronunciation buttons to front and back
    const cardFront = container.querySelector(".card-front");
    const cardBack = container.querySelector(".card-back");

    if (cardFront && cardBack) {
      // Add pronunciation button to front
      const frontPronounceBtn = document.createElement("button");
      frontPronounceBtn.className = "btn-pronounce";
      frontPronounceBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
      frontPronounceBtn.onclick = (e) => {
        e.stopPropagation();
        speakText(flashcards[currentCardIndex].front);
      };
      cardFront.appendChild(frontPronounceBtn);

      // Add pronunciation button to back
      const backPronounceBtn = document.createElement("button");
      backPronounceBtn.className = "btn-pronounce";
      backPronounceBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
      backPronounceBtn.onclick = (e) => {
        e.stopPropagation();
        speakText(flashcards[currentCardIndex].back);
      };
      cardBack.appendChild(backPronounceBtn);
    }

    // Reset card state
    $("#showAnswerBtn").show();
    $(".performance-buttons").hide();
    $(".card-back").hide();

    // Update progress
    updateProgress();
  }

  // Add text-to-speech function
  function speakText(text) {
    // Cancel any ongoing speech
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }

    // Wait for voices to be loaded
    let voices = window.speechSynthesis.getVoices();

    // If voices aren't loaded yet, wait for them
    if (voices.length === 0) {
      window.speechSynthesis.onvoiceschanged = () => {
        voices = window.speechSynthesis.getVoices();
        speakWithVoice(text, voices);
      };
    } else {
      speakWithVoice(text, voices);
    }
  }

  function speakWithVoice(text, voices) {
    const utterance = new SpeechSynthesisUtterance(text);

    // Find a good English voice
    const englishVoice =
      voices.find(
        (voice) => voice.lang.includes("en") && voice.name.includes("Female")
      ) ||
      voices.find((voice) => voice.lang.includes("en")) ||
      voices[0];

    if (englishVoice) {
      utterance.voice = englishVoice;
    }

    // Configure for ESL
    utterance.lang = "en-US";
    utterance.rate = 0.9; // Slightly slower for clarity
    utterance.pitch = 1;
    utterance.volume = 1;

    // Add event listeners for better control
    utterance.onstart = () => {
      console.log("Speech started");
    };

    utterance.onend = () => {
      console.log("Speech ended");
    };

    utterance.onerror = (event) => {
      console.error("Speech error:", event);
    };

    // Ensure the speech synthesis is ready
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }

    // Add a small delay before speaking to ensure proper initialization
    setTimeout(() => {
      window.speechSynthesis.speak(utterance);
    }, 100);
  }

  // Enhanced progress tracking with practice/confident counts
  function updateProgress() {
    const totalCards = flashcards.length;
    const viewedCards = currentCardIndex + 1;
    const progress = (viewedCards / totalCards) * 100;

    // Update progress bar
    $("#progressBar").css("width", `${progress}%`);
    $("#progressText").text(`Card ${viewedCards}/${totalCards}`);

    // Calculate practice/confident counts
    let needPracticeCount = 0;
    let confidentCount = 0;

    flashcards.forEach((card) => {
      if (card.metadata && card.metadata.performance) {
        if (card.metadata.performance === 1) {
          needPracticeCount++;
        } else if (card.metadata.performance === 5) {
          confidentCount++;
        }
      }
    });

    // Update or create counts display
    let countsDisplay = $("#practiceConfidentCounts");
    if (countsDisplay.length === 0) {
      // Create the counts display if it doesn't exist
      $("#progressText").after(`
        <div id="practiceConfidentCounts" class="practice-confident-counts">
          <span class="need-practice-count">
            <i class="fas fa-exclamation-triangle"></i> 
            Need Practice: <span class="count">0</span>
          </span>
          <span class="confident-count">
            <i class="fas fa-check-circle"></i> 
            Confident: <span class="count">0</span>
          </span>
        </div>
      `);
      countsDisplay = $("#practiceConfidentCounts");
    }

    // Update the counts
    countsDisplay.find(".need-practice-count .count").text(needPracticeCount);
    countsDisplay.find(".confident-count .count").text(confidentCount);

    // Check if user has completed 100% of cards
    if (progress >= 100 && !sessionStorage.getItem("quizPromptShown")) {
      showQuizPrompt();
      sessionStorage.setItem("quizPromptShown", "true");
    }
  }

  function showQuizPrompt() {
    console.log("showQuizPrompt called");
    let quizPrompt = document.querySelector(".quiz-prompt");

    if (!quizPrompt) {
      console.log("Creating new quiz prompt element");
      quizPrompt = document.createElement("div");
      quizPrompt.className = "quiz-prompt";
      quizPrompt.innerHTML = `
        <div class="quiz-prompt-content">
          <h3><i class="fas fa-graduation-cap"></i> Ready to Test Your Knowledge?</h3>
          <p>You've completed all of your flashcards! Would you like to take a quiz to reinforce your learning?</p>
          <div class="quiz-prompt-actions">
            <button class="btn btn-primary" id="startQuizBtn">
              <i class="fas fa-check"></i> Start Quiz
            </button>
            <button class="btn btn-secondary" id="continuePracticeBtn">
              <i class="fas fa-redo"></i> Continue Practice
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(quizPrompt);

      // Add event listeners
      document.getElementById("startQuizBtn").addEventListener("click", () => {
        console.log("Start Quiz button clicked");
        quizPrompt.classList.remove("show");
        startQuizMode();
      });

      document
        .getElementById("continuePracticeBtn")
        .addEventListener("click", () => {
          console.log("Continue Practice button clicked");
          quizPrompt.classList.remove("show");
          currentCardIndex = 0;
          updateFlashcard();
        });
    }

    console.log("Showing quiz prompt modal");
    quizPrompt.classList.add("show");
    // Store in session that we've shown the prompt
    sessionStorage.setItem("quizPromptShown", "true");
  }

  function startQuizMode() {
    console.log("startQuizMode called");
    if (!flashcards || flashcards.length === 0) {
      console.error("No flashcards available for quiz mode");
      return;
    }
    console.log("Starting quiz with", flashcards.length, "cards");

    // Create a quiz deck from current flashcards
    const quizDeck = {
      name: "Generated Flashcard Quiz",
      description: "Quiz generated from your flashcards",
      cards: flashcards,
      id: `quiz_${Date.now()}`,
      createdAt: new Date().toISOString(),
    };

    // Store the deck in sessionStorage and redirect to quiz.html
    sessionStorage.setItem("quizDeck", JSON.stringify(quizDeck));
    window.location.href = "/quiz.html";
  }

  // Utility function for shuffling arrays (kept for other uses)
  function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
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
      // Dispatch event for flashcards cleared
      document.dispatchEvent(new CustomEvent("flashcardsCleared"));
      return;
    }

    // Update flashcard display
    currentCardIndex = 0;
    updateFlashcard();

    // Update Study Now button
    updateStudyNowButton();
    updateQuizNowButton();

    // Show the viewer
    showFlashcardViewer(true);

    // Dispatch event for flashcards generated
    document.dispatchEvent(
      new CustomEvent("flashcardsGenerated", {
        detail: { flashcards },
      })
    );
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
      showNotification("Your subscription has been reactivated!", "success");
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
    const $currentPlan = $("#currentPlan");
    const $nextBillingDate = $("#nextBillingDate");
    const $cancelSubBtn = $("#cancelSubBtn");
    const $reactivateSubBtn = $("#reactivateSubBtn");

    if (subscriptionDetails.isPremium) {
      $subscriptionStatus.show();

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

    startAutoSave(); // Use the imported startAutoSave from utils.js
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
    $(".input-tabs .tab-btn").on("click", function () {
      const tab = $(this).data("tab");

      // Switch tabs
      $(".input-tabs .tab-btn").removeClass("active");
      $(this).addClass("active");
      $("#authModal .auth-form").hide();
      $(`#${tab}Tab`).show();
    });
  }

  // Camera handling functions
  // ... existing code ...

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
    // ... existing code ...

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
      // ... existing code ...
    });

    // Add 'Coming Soon' tooltip to Import button and disable it
    const importBtn = document.getElementById("importDeckBtn");
    if (importBtn) {
      importBtn.setAttribute("title", "Import feature coming soon!");
      importBtn.setAttribute("disabled", "disabled");
      importBtn.style.cursor = "not-allowed";
      importBtn.addEventListener("click", function (e) {
        e.preventDefault();
        showSuccessMessage("Import feature is coming soon!");
      });
    }
  });

  // ... existing code ...

  // Initialize file handling
  function initializeFileHandling() {
    const dropzone = document.getElementById("dropzone");
    const fileInput = document.getElementById("fileInput");
    const contentTab = document.getElementById("contentTab");

    // Only initialize if we're on a page with file upload functionality
    if (!contentTab || !contentTab.classList.contains("active")) {
      return;
    }

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

  // Initialize file handling if content tab is active by default
  $(document).ready(function () {
    const contentTab = document.getElementById("contentTab");
    if (contentTab && contentTab.classList.contains("active")) {
      initializeFileHandling();
    }
  });

  // Filter and sort decks
  async function filterDecks() {
    const activeCategory = document.querySelector(".category-tab.active")
      ?.dataset.category;
    const searchQuery =
      document.getElementById("deckSearch")?.value.toLowerCase() || "";
    const sortBy = document.getElementById("sortDeck")?.value || "recent";
    const levelFilter = document.getElementById("filterLevel")?.value || "all";

    if (!activeCategory) {
      console.warn("No active category found");
      return;
    }

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
  function displayDecks(decks, isLoading = false) {
    const deckGrid = document.getElementById("savedDecks");
    if (!deckGrid) {
      console.warn("Deck grid element not found");
      return;
    }

    if (isLoading) {
      showDecksLoadingPlaceholder();
      return;
    }

    deckGrid.innerHTML = "";

    if (decks.length === 0) {
      deckGrid.innerHTML = `
        <div class="no-decks-message">
          <i class="fas fa-search"></i>
          <p>No decks found matching your criteria</p>
          <button class="btn btn-primary" onclick="document.getElementById('createDeckBtn')?.click()">
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
            <i class="fas fa-eye"></i> ${deck.stats?.views || 0} views
          </span>
          <span class="deck-card-stat">
            <i class="fas fa-heart"></i> ${deck.stats?.favorites || 0} favorites
          </span>
          <span class="deck-card-stat">
            <i class="fas fa-cards"></i> ${deck.cards?.length || 0} cards
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
        <span class="deck-card-level ${deck.level || "beginner"}">${
        deck.level || "beginner"
      }</span>
      `;
      deckGrid.appendChild(deckCard);
    });
  }

  // Global functions for deck actions (accessible from displayDecks)
  function openDeck(deckId) {
    console.log("Opening shared deck:", deckId);
    showNotification(
      "Shared deck study feature coming soon! Deck ID: " + deckId,
      "info"
    );
  }

  function editDeck(deckId) {
    if (!window.currentUser) {
      showNotification("Please log in to edit decks.", "warning");
      return;
    }
    console.log("Editing deck:", deckId);
    showNotification(
      "Deck editing feature coming soon! Deck ID: " + deckId,
      "info"
    );
  }

  // Initialize Knowledge Hub when document is ready
  document.addEventListener("DOMContentLoaded", () => {
    // ... existing initialization code ...
    // Note: KnowledgeHub initialization is now handled in the auth state change listener
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

  // showDecksLoadingPlaceholder function moved to KnowledgeHub module
});

// Knowledge Hub Module
const KnowledgeHub = {
  deckManager: null,

  async init(deckManager) {
    this.deckManager = deckManager;
  },

  // Filter and sort decks
  async filterDecks() {
    console.log("KnowledgeHub.filterDecks() called");

    const activeCategory = document.querySelector(".category-tab.active")
      ?.dataset.category;
    const searchQuery =
      document.getElementById("deckSearch")?.value.toLowerCase() || "";
    const sortBy = document.getElementById("sortDeck")?.value || "recent";
    const levelFilter = document.getElementById("filterLevel")?.value || "all";

    if (!activeCategory) {
      console.warn("No active category found");
      return;
    }

    // Show loading state
    this.displayDecks([], true);

    try {
      let decks = await getSharedDecks();
      console.log("Fetched shared decks from Firestore:", decks);
      console.log("Active category:", activeCategory);

      // Apply filters
      decks = decks.filter((deck) => {
        const matchesCategory =
          activeCategory === "all" || deck.category === activeCategory;
        const matchesSearch =
          deck.name?.toLowerCase().includes(searchQuery) ||
          deck.description?.toLowerCase().includes(searchQuery);
        const matchesLevel =
          levelFilter === "all" || deck.level === levelFilter;
        return matchesCategory && matchesSearch && matchesLevel;
      });
      console.log("Filtered decks to display:", decks);

      // Apply sorting
      decks.sort((a, b) => {
        switch (sortBy) {
          case "recent":
            return (
              new Date(b.updatedAt || b.createdAt) -
              new Date(a.updatedAt || a.createdAt)
            );
          case "popular":
            return (b.stats?.views || 0) - (a.stats?.views || 0);
          case "cards":
            return (b.cards?.length || 0) - (a.cards?.length || 0);
          case "rating":
            return (
              (b.stats?.favorites || 0) / ((b.stats?.views || 0) + 1) -
              (a.stats?.favorites || 0) / ((a.stats?.views || 0) + 1)
            );
          default:
            return 0;
        }
      });

      // Display decks with loading state false
      this.displayDecks(decks, false);
    } catch (error) {
      console.error("Error filtering decks:", error);
      showNotification("Failed to load decks. Please try again.", "error");
      this.displayDecks([], false);
    }
  },

  // Display decks in the grid
  displayDecks(decks, isLoading = false) {
    const deckGrid = document.getElementById("savedDecks");
    if (!deckGrid) return;

    if (isLoading) {
      // Show loading placeholders
      deckGrid.innerHTML = Array(6)
        .fill()
        .map(
          () => `
        <div class="deck-card loading-placeholder">
          <div class="skeleton-title"></div>
          <div class="skeleton-category"></div>
          <div class="skeleton-description"></div>
          <div class="skeleton-stat"></div>
          <div class="skeleton-button"></div>
        </div>
      `
        )
        .join("");
      return;
    }

    if (decks.length === 0) {
      deckGrid.innerHTML = `
        <div class="no-decks-message">
          <i class="fas fa-search"></i>
          <p>No decks found matching your criteria.</p>
          ${!this.deckManager ? "<p>Log in to create your own decks!</p>" : ""}
        </div>
      `;
      return;
    }

    deckGrid.innerHTML = decks
      .map(
        (deck) => `
        <div class="deck-card" data-deck-id="${deck.id}">
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
              <i class="fas fa-eye"></i> ${deck.stats?.views || 0} views
            </span>
            <span class="deck-card-stat">
              <i class="fas fa-heart"></i> ${
                deck.stats?.favorites || 0
              } favorites
            </span>
            <span class="deck-card-stat">
              <i class="fas fa-cards"></i> ${deck.cards?.length || 0} cards
            </span>
          </div>
          <div class="deck-card-actions">
            <button class="btn btn-primary study-deck" data-deck-id="${
              deck.id
            }">
              <i class="fas fa-play"></i> Study
            </button>
            ${
              this.deckManager
                ? `<button class="btn btn-secondary edit-deck" data-deck-id="${deck.id}">
                    <i class="fas fa-edit"></i> Edit
                  </button>`
                : ""
            }
          </div>
          <span class="deck-card-level ${deck.level || "beginner"}">${
          deck.level || "beginner"
        }</span>
        </div>
      `
      )
      .join("");

    // Add event listeners after HTML is created
    this.attachDeckEventListeners();
  },

  // Attach event listeners to deck cards
  attachDeckEventListeners() {
    const deckGrid = document.getElementById("savedDecks");
    if (!deckGrid) return;

    // Use event delegation for study buttons
    deckGrid.addEventListener("click", (e) => {
      const studyBtn = e.target.closest(".study-deck");
      const editBtn = e.target.closest(".edit-deck");

      if (studyBtn) {
        e.preventDefault();
        const deckId = studyBtn.getAttribute("data-deck-id");
        if (deckId) {
          this.openDeck(deckId);
        }
      } else if (editBtn) {
        e.preventDefault();
        const deckId = editBtn.getAttribute("data-deck-id");
        if (deckId) {
          this.editDeck(deckId);
        }
      }
    });
  },

  // Deck actions
  openDeck(deckId) {
    if (!window.currentUser) {
      if (typeof showAuthModal === "function") {
        showAuthModal();
      } else {
        window.location.href = "/?auth=required";
      }
      return;
    }
    this.showDeckViewer(deckId);
  },

  async showDeckViewer(deckId) {
    try {
      // Show loading
      showLoading(true);

      // Fetch deck data (for now using placeholder data)
      const deck = await this.getDeckById(deckId);

      if (!deck || !deck.cards || deck.cards.length === 0) {
        showErrorMessage("This deck has no cards or could not be loaded.");
        return;
      }

      // Create deck viewer modal
      const modal = document.createElement("div");
      modal.className = "modal";
      modal.id = "deckViewerModal";
      modal.innerHTML = `
        <div class="modal-content" style="max-width: 1000px;">
          <span class="close">&times;</span>
          <div class="deck-viewer-header">
            <h2>${deck.name}</h2>
            <p class="deck-description">${deck.description || ""}</p>
            <div class="deck-meta">
              <span class="deck-category ${deck.category}">${
        deck.category
      }</span>
              <span class="deck-level ${deck.level || "beginner"}">${
        deck.level || "beginner"
      }</span>
              <span class="deck-cards-count">${deck.cards.length} cards</span>
            </div>
          </div>
          
          <div class="deck-viewer-content">
            <div class="deck-viewer-controls">
              <button id="studyDeckBtn" class="btn btn-primary btn-large">
                <i class="fas fa-play"></i> Start Studying
              </button>
              <button id="previewDeckBtn" class="btn btn-secondary">
                <i class="fas fa-eye"></i> Preview Cards
              </button>
              <button id="importDeckToLibraryBtn" class="btn btn-secondary">
                <i class="fas fa-download"></i> Import to My Library
              </button>
            </div>
            
            <div class="deck-preview" id="deckPreview" style="display: none;">
              <div class="preview-controls">
                <button id="prevPreviewBtn" class="btn btn-sm btn-secondary">
                  <i class="fas fa-chevron-left"></i>
                </button>
                <span id="previewCounter">1 / ${deck.cards.length}</span>
                <button id="nextPreviewBtn" class="btn btn-sm btn-secondary">
                  <i class="fas fa-chevron-right"></i>
                </button>
              </div>
              <div class="preview-card">
                <div class="preview-card-front">
                  <h4>Front:</h4>
                  <p id="previewFront"></p>
                </div>
                <div class="preview-card-back">
                  <h4>Back:</h4>
                  <p id="previewBack"></p>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(modal);
      modal.style.display = "block";

      // Initialize preview functionality
      let currentPreviewIndex = 0;

      const updatePreview = () => {
        const card = deck.cards[currentPreviewIndex];
        document.getElementById("previewFront").textContent = card.front;
        document.getElementById("previewBack").textContent = card.back;
        document.getElementById("previewCounter").textContent = `${
          currentPreviewIndex + 1
        } / ${deck.cards.length}`;

        document.getElementById("prevPreviewBtn").disabled =
          currentPreviewIndex === 0;
        document.getElementById("nextPreviewBtn").disabled =
          currentPreviewIndex === deck.cards.length - 1;
      };

      // Event listeners
      modal.querySelector(".close").addEventListener("click", () => {
        modal.remove();
      });

      modal.addEventListener("click", (e) => {
        if (e.target === modal) {
          modal.remove();
        }
      });

      document.getElementById("studyDeckBtn").addEventListener("click", () => {
        modal.remove();
        this.startStudySession(deck);
      });

      document
        .getElementById("previewDeckBtn")
        .addEventListener("click", () => {
          const preview = document.getElementById("deckPreview");
          if (preview.style.display === "none") {
            preview.style.display = "block";
            updatePreview();
            document.getElementById("previewDeckBtn").innerHTML =
              '<i class="fas fa-eye-slash"></i> Hide Preview';
          } else {
            preview.style.display = "none";
            document.getElementById("previewDeckBtn").innerHTML =
              '<i class="fas fa-eye"></i> Preview Cards';
          }
        });

      document
        .getElementById("prevPreviewBtn")
        .addEventListener("click", () => {
          if (currentPreviewIndex > 0) {
            currentPreviewIndex--;
            updatePreview();
          }
        });

      document
        .getElementById("nextPreviewBtn")
        .addEventListener("click", () => {
          if (currentPreviewIndex < deck.cards.length - 1) {
            currentPreviewIndex++;
            updatePreview();
          }
        });

      document
        .getElementById("importDeckToLibraryBtn")
        .addEventListener("click", async () => {
          try {
            await this.importDeckToLibrary(deck);
            showSuccessMessage("Deck imported to your library!");
          } catch (error) {
            console.error("Error importing deck:", error);
            showErrorMessage("Failed to import deck. Please try again.");
          }
        });
    } catch (error) {
      console.error("Error showing deck viewer:", error);
      showErrorMessage("Failed to load deck. Please try again.");
    } finally {
      showLoading(false);
    }
  },

  async getDeckById(deckId) {
    // For now, return sample data. In a real implementation, this would fetch from Firestore
    // You can replace this with actual Firestore queries later
    const sampleDecks = [
      {
        id: "electrician-basics",
        name: "Electrician Basics",
        description: "Fundamental electrical concepts and safety procedures",
        category: "electrician",
        level: "beginner",
        cards: [
          {
            front: "What is Ohm's Law?",
            back: "Ohm's Law states that the current through a conductor between two points is directly proportional to the voltage across the two points. V = I × R",
          },
          {
            front:
              "What is the standard voltage for residential electrical systems in the US?",
            back: "120V for standard outlets and 240V for heavy appliances like dryers and electric stoves",
          },
          {
            front: "What does GFCI stand for?",
            back: "Ground Fault Circuit Interrupter - a safety device that shuts off electrical power when it detects ground faults",
          },
          {
            front: "What is the purpose of a circuit breaker?",
            back: "To protect electrical circuits from damage caused by overcurrent/overload or short circuit",
          },
          {
            front: "What gauge wire is typically used for 20-amp circuits?",
            back: "12 AWG (American Wire Gauge) wire is typically used for 20-amp circuits",
          },
        ],
      },
      {
        id: "plumbing-basics",
        name: "Plumbing Fundamentals",
        description: "Essential plumbing knowledge for apprentices",
        category: "plumber",
        level: "beginner",
        cards: [
          {
            front:
              "What is the standard pressure for residential water systems?",
            back: "Between 40-60 PSI (pounds per square inch), with 50 PSI being optimal",
          },
          {
            front: "What does PVC stand for?",
            back: "Polyvinyl Chloride - a type of plastic pipe commonly used in plumbing",
          },
        ],
      },
    ];

    return sampleDecks.find((deck) => deck.id === deckId) || sampleDecks[0];
  },

  startStudySession(deck) {
    // Set the flashcards globally so the existing study interface can use them
    window.flashcards = deck.cards;
    window.currentCardIndex = 0;
    window.isFlipped = false;

    // If we're on the shared-decks page, redirect to main app with the deck data
    if (window.location.pathname.includes("shared-decks")) {
      // Store deck data in session storage for retrieval on main page
      sessionStorage.setItem("studyDeck", JSON.stringify(deck));
      window.location.href = "/create-deck.html?study=shared";
      return;
    }

    // If we're already on a page with flashcard viewer, use it
    if (
      typeof window.updateFlashcard === "function" &&
      typeof window.showFlashcardViewer === "function"
    ) {
      window.updateFlashcard();
      window.showFlashcardViewer(true);
      showSuccessMessage(`Starting study session: ${deck.name}`);
    } else {
      // Fallback: redirect to main app
      sessionStorage.setItem("studyDeck", JSON.stringify(deck));
      window.location.href = "/create-deck.html?study=shared";
    }
  },

  async importDeckToLibrary(deck) {
    if (!this.deckManager) {
      throw new Error("Please log in to import decks to your library");
    }

    const importedDeck = {
      name: `${deck.name} (Imported)`,
      description: deck.description,
      cards: deck.cards,
      category: deck.category || "imported",
      level: deck.level || "beginner",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      importedFrom: deck.id,
      originalAuthor: deck.createdBy || "Unknown",
    };

    await this.deckManager.createDeck(importedDeck);
  },

  editDeck(deckId) {
    if (!window.currentUser) {
      if (typeof showAuthModal === "function") {
        showAuthModal();
      } else {
        window.location.href = "/?auth=required";
      }
      return;
    }
    console.log("Editing deck:", deckId);
    showNotification(
      "Deck editing feature coming soon! Deck ID: " + deckId,
      "info"
    );
  },

  // Initialize Knowledge Hub
  initialize() {
    console.log("KnowledgeHub.initialize() called");
    if (!this.deckManager) {
      console.log(
        "No DeckManager (user not logged in) - shared decks only mode"
      );
    }

    const categoryTabs = document.querySelectorAll(".category-tab");
    const searchInput = document.getElementById("deckSearch");
    const sortSelect = document.getElementById("sortDeck");
    const levelFilter = document.getElementById("filterLevel");
    console.log("Elements found:", {
      categoryTabs: categoryTabs.length,
      searchInput: !!searchInput,
      sortSelect: !!sortSelect,
      levelFilter: !!levelFilter,
    });

    if (!categoryTabs.length) {
      console.warn(
        "Knowledge Hub elements not found. Make sure you're on the correct page."
      );
      return;
    }

    // Initialize category tabs
    categoryTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        categoryTabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        this.filterDecks();
      });
    });

    // Initialize search
    let searchTimeout;
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          this.filterDecks();
        }, 300);
      });
    }

    // Initialize filters
    if (sortSelect) {
      sortSelect.addEventListener("change", () => this.filterDecks());
    }
    if (levelFilter) {
      levelFilter.addEventListener("change", () => this.filterDecks());
    }

    // Only initialize deck creation features if user is logged in
    if (this.deckManager) {
      const createDeckBtn = document.getElementById("createDeckBtn");
      const createDeckModal = document.getElementById("createDeckModal");
      const createDeckForm = document.getElementById("createDeckForm");
      const closeModalBtn = createDeckModal?.querySelector(".close");

      // Initialize create deck modal
      if (createDeckBtn && createDeckModal) {
        createDeckBtn.addEventListener("click", () => {
          createDeckModal.style.display = "block";
        });

        if (closeModalBtn) {
          closeModalBtn.addEventListener("click", () => {
            createDeckModal.style.display = "none";
          });
        }

        window.addEventListener("click", (e) => {
          if (e.target === createDeckModal) {
            createDeckModal.style.display = "none";
          }
        });

        // Handle deck creation
        if (createDeckForm) {
          createDeckForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const deckName = document.getElementById("newDeckName").value;
            const category = document.getElementById("deckCategory").value;
            const level = document.getElementById("deckLevel").value;
            const description =
              document.getElementById("deckDescription").value;

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

              await this.deckManager.createDeck(deck);
              createDeckModal.style.display = "none";
              createDeckForm.reset();
              await this.filterDecks();
              showNotification("Deck created successfully!", "success");
            } catch (error) {
              console.error("Error creating deck:", error);
              showNotification(
                "Failed to create deck. Please try again.",
                "error"
              );
            }
          });
        }
      }
    }

    // Initial load of decks
    console.log("Calling initial filterDecks()...");
    this.filterDecks();
  },
};

// Make KnowledgeHub available globally for shared-decks page
window.KnowledgeHub = KnowledgeHub;

// Minimal function to fetch shared decks
async function getSharedDecks() {
  try {
    // Fetch from Firestore sharedDecks collection
    const sharedDecksRef = collection(db, "sharedDecks");
    const snapshot = await getDocs(sharedDecksRef);
    const firebaseDecks = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    if (firebaseDecks.length > 0) {
      return firebaseDecks;
    }

    // Fallback to sample data if no decks in Firestore
    return [
      {
        id: "electrician-basics",
        name: "Electrician Basics",
        description:
          "Fundamental electrical concepts and safety procedures for electrical apprentices",
        category: "electrician",
        level: "beginner",
        stats: { views: 1245, favorites: 89, downloads: 234 },
        cards: [
          {
            front: "What is Ohm's Law?",
            back: "Ohm's Law states that the current through a conductor between two points is directly proportional to the voltage across the two points. V = I × R",
          },
          {
            front:
              "What is the standard voltage for residential electrical systems in the US?",
            back: "120V for standard outlets and 240V for heavy appliances like dryers and electric stoves",
          },
          {
            front: "What does GFCI stand for?",
            back: "Ground Fault Circuit Interrupter - a safety device that shuts off electrical power when it detects ground faults",
          },
          {
            front: "What is the purpose of a circuit breaker?",
            back: "To protect electrical circuits from damage caused by overcurrent/overload or short circuit",
          },
          {
            front: "What gauge wire is typically used for 20-amp circuits?",
            back: "12 AWG (American Wire Gauge) wire is typically used for 20-amp circuits",
          },
        ],
      },
      {
        id: "plumbing-basics",
        name: "Plumbing Fundamentals",
        description:
          "Essential plumbing knowledge for apprentices and journeymen",
        category: "plumber",
        level: "beginner",
        stats: { views: 987, favorites: 67, downloads: 156 },
        cards: [
          {
            front:
              "What is the standard pressure for residential water systems?",
            back: "Between 40-60 PSI (pounds per square inch), with 50 PSI being optimal",
          },
          {
            front: "What does PVC stand for?",
            back: "Polyvinyl Chloride - a type of plastic pipe commonly used in plumbing",
          },
          {
            front: "What is the difference between supply and drain lines?",
            back: "Supply lines bring fresh water to fixtures under pressure, while drain lines remove wastewater using gravity",
          },
        ],
      },
      {
        id: "hvac-refrigeration",
        name: "HVAC & Refrigeration Basics",
        description:
          "Core concepts in heating, ventilation, air conditioning, and refrigeration systems",
        category: "hvac",
        level: "intermediate",
        stats: { views: 756, favorites: 45, downloads: 98 },
        cards: [
          {
            front:
              "What is the ideal relative humidity range for indoor comfort?",
            back: "Between 30-50% relative humidity for optimal comfort and health",
          },
          {
            front: "What does SEER rating measure?",
            back: "Seasonal Energy Efficiency Ratio - measures the cooling efficiency of air conditioners and heat pumps",
          },
        ],
      },
      {
        id: "welding-safety",
        name: "Welding Safety Fundamentals",
        description:
          "Critical safety procedures and equipment for welding operations",
        category: "welder",
        level: "beginner",
        stats: { views: 642, favorites: 78, downloads: 123 },
        cards: [
          {
            front: "What PPE is required for arc welding?",
            back: "Welding helmet with proper filter lens, welding gloves, flame-resistant clothing, safety boots, and respiratory protection when needed",
          },
          {
            front: "What causes porosity in welds?",
            back: "Contamination from moisture, oil, rust, or inadequate shielding gas coverage",
          },
        ],
      },
      {
        id: "carpentry-tools",
        name: "Essential Carpentry Tools",
        description: "Must-know tools and their proper usage in carpentry work",
        category: "carpenter",
        level: "beginner",
        stats: { views: 543, favorites: 34, downloads: 87 },
        cards: [
          {
            front: "What is the difference between a rip cut and a cross cut?",
            back: "A rip cut is parallel to the wood grain, while a cross cut is perpendicular to the grain",
          },
          {
            front: "What is the standard spacing for wall studs?",
            back: '16 inches on center (OC) or 24 inches on center, with 16" OC being most common',
          },
        ],
      },
      {
        id: "osha-safety-basics",
        name: "OSHA Safety Basics",
        description:
          "Fundamental workplace safety regulations and best practices",
        category: "safety",
        level: "beginner",
        stats: { views: 892, favorites: 112, downloads: 201 },
        cards: [
          {
            front: "What does OSHA stand for?",
            back: "Occupational Safety and Health Administration",
          },
          {
            front:
              "At what height must fall protection be used in construction?",
            back: "6 feet or higher in construction work",
          },
          {
            front: "What are the 'Fatal Four' in construction?",
            back: "Falls, Struck by Object, Electrocution, and Caught-in/Between accidents",
          },
        ],
      },
    ];
  } catch (error) {
    console.error("Error fetching shared decks:", error);
    return [];
  }
}

function initializeUserMenuDropdown() {
  const userMenuBtn = document.getElementById("userMenuBtn");
  const dropdownContent = document.querySelector(".dropdown-content");

  if (userMenuBtn && dropdownContent) {
    // Toggle dropdown on button click
    userMenuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      userMenuBtn.classList.toggle("active");
      dropdownContent.classList.toggle("show");
    });

    // Close dropdown when clicking outside
    document.addEventListener("click", (e) => {
      if (!userMenuBtn.contains(e.target)) {
        userMenuBtn.classList.remove("active");
        dropdownContent.classList.remove("show");
      }
    });

    // Handle logout button click
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", async () => {
        try {
          await signOut(auth);
          showNotification("Logged out successfully", "success");
          window.location.href = "/";
        } catch (error) {
          console.error("Error signing out:", error);
          showNotification("Error signing out. Please try again.", "error");
        }
      });
    }
  }
}

// Prevent modal from closing on overlay click
$(window)
  .off("click")
  .on("click", function (event) {
    // Only close if the X/cancel button is clicked, not overlay
    // Do nothing here to prevent overlay click from closing modal
  });

function showAnswerFeedback(answer, updatedCard) {
  // Remove any existing feedback
  $(".answer-feedback").remove();

  // Create feedback element
  const feedback = $("<div>").addClass("answer-feedback");

  if (answer === 1) {
    // Need Practice
    feedback.addClass("feedback-danger").html(`
        <i class="fas fa-tools"></i>
        <span>Card marked for review</span>
      `);
  } else if (answer === 5) {
    // Confident
    feedback.addClass("feedback-success").html(`
        <i class="fas fa-check-circle"></i>
        <span>Great job! Card marked as confident</span>
      `);
  }

  // Add to page and animate
  $("body").append(feedback);
  feedback.fadeIn(200);

  // Update card's performance in metadata
  const card = flashcards[currentCardIndex];
  if (card && card.metadata) {
    card.metadata.performance = answer;
  }

  // Remove feedback after delay
  setTimeout(() => {
    feedback.fadeOut(200, function () {
      $(this).remove();
    });
  }, 2000);
}

function handlePerformanceAnswer(answer) {
  const card = flashcards[currentCardIndex];

  // Calculate response time
  const responseTime = answerStartTime
    ? (Date.now() - answerStartTime) / 1000
    : null;

  // Reset answer start time for next card
  answerStartTime = null;

  // Ensure card has metadata
  if (!card.metadata) {
    card.metadata = {};
  }

  // Update card metadata with performance
  card.metadata.performance = answer;
  card.metadata.lastReviewed = new Date().toISOString();

  // Show feedback
  showAnswerFeedback(answer);

  // Update progress immediately
  updateProgress();

  // Move to next card after a brief delay
  setTimeout(() => {
    navigateCard("next");

    // Reset the card state for the next card
    $("#showAnswerBtn").show();
    $(".performance-buttons").hide();
    $(".card-back").hide();
  }, 1000);
}

// Check for shared deck session on page load
document.addEventListener("DOMContentLoaded", () => {
  // Check if we're on the create-deck page with study=shared parameter
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("study") === "shared") {
    const sharedDeckData = sessionStorage.getItem("studyDeck");
    if (sharedDeckData) {
      try {
        const deck = JSON.parse(sharedDeckData);

        // Set flashcards globally
        window.flashcards = deck.cards;
        window.currentCardIndex = 0;
        window.isFlipped = false;

        // Wait for the page to fully load then show the flashcard viewer
        setTimeout(() => {
          if (
            typeof window.updateFlashcard === "function" &&
            typeof window.showFlashcardViewer === "function"
          ) {
            window.updateFlashcard();
            window.showFlashcardViewer(true);
            showSuccessMessage(`Started studying: ${deck.name}`);

            // Clear the session storage
            sessionStorage.removeItem("studyDeck");

            // Update URL without the study parameter
            const newUrl = window.location.href.split("?")[0];
            window.history.replaceState({}, document.title, newUrl);
          }
        }, 1000);
      } catch (error) {
        console.error("Error loading shared deck:", error);
        sessionStorage.removeItem("studyDeck");
      }
    }
  }
});
