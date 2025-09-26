// Dual authentication system: Firebase for email/password, Auth0 for Google

// Keep Firebase for both auth and data storage
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
  getAuth
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

// Firebase config for Firestore only
const firebaseConfig = {
  apiKey: "AIzaSyDppFcsquQOx2NL2OoDNUqYyscERAH3Buw",
  authDomain: "ai-flashcard-creator.firebaseapp.com",
  projectId: "ai-flashcard-creator",
  storageBucket: "ai-flashcard-creator.firebasestorage.app",
  messagingSenderId: "4926247150",
  appId: "1:4926247150:web:46d1672310259aa125e3ff",
  measurementId: "G-PC3STEJGW2",
};

// Initialize Firebase app, Auth, and Firestore
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

// Expose Firebase instances globally for auth modal
window.auth = auth;
window.db = db;

// Pricing and tier constants (moved from config.js)
export const PRICES = {
  pro: {
    id: "price_pro_monthly",
    amount: 899, // $8.99
    interval: "month",
  },
  premium: {
    id: "price_premium_monthly",
    amount: 1499, // $14.99
    interval: "month",
  },
  premium_yearly: {
    id: "price_premium_yearly",
    amount: 14400, // $144.00
    interval: "year",
  },
};

export const FREE_TIER_LIMITS = {
  DECK_GENERATIONS_PER_MONTH: 3,
  AI_IMAGE_OCCLUSIONS: 5,
  PAGES_PER_DOCUMENT: 5,
  CHARACTERS_PER_DOCUMENT: 10000,
  CARD_TYPES: ["term"], // Term & Definition only
  EXPORTS_PER_MONTH: 1,
  MAX_CARDS_PER_DECK: 10,
  MAX_SAVED_DECKS: 100, // Updated to 100
  OCR_ENABLED: false, // No OCR for free tier
};
import { SpacedRepetition } from "./spacedRepetition.js";
import { SubscriptionManager } from "./subscription.js";
import { DeckManager } from "./deckManager.js";
import { CardTypeManager } from "./cardTypeManager.js";
import { explainThisManager } from "./explainThisManager.js";
import {
  initializeAuthModal,
  initializeAuthSystem,
  showAuthModal,
  hideAuthModal,
  showResetPasswordModal,
  getCurrentUser,
  isAuthenticated,
  signOutUser
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
let performanceButtonTimeout = null;
let dueCardCheckInterval = null; // For checking due cards during sessions
let isActiveStudySession = false; // Track if we're in an active study session
let originalDeckCards = []; // Store original deck cards for due card checking
let isFlipped = false; // Track if current flashcard is flipped

// Configuration constants
const APP_CONFIG = {
  QUIZ_NAME: "Generated Flashcards",
  QUIZ_DESCRIPTION: "Quiz generated from your flashcards"
};

// Make config globally available
window.APP_CONFIG = APP_CONFIG;

// Edit deck name functionality
function showEditDeckNameButton() {
  const editBtn = document.getElementById("editDeckNameBtn");
  if (editBtn) {
    editBtn.style.display = "inline-block";
  }
}

function hideEditDeckNameButton() {
  const editBtn = document.getElementById("editDeckNameBtn");
  const deckInput = document.getElementById("deckNameInput");
  const deckTitle = document.getElementById("deckTitle");
  
  if (editBtn) {
    editBtn.style.display = "none";
  }
  if (deckInput) {
    deckInput.style.display = "none";
  }
  if (deckTitle) {
    deckTitle.style.display = "block";
    deckTitle.textContent = "FlashNotes";
  }
}

function initializeEditDeckName() {
  const editBtn = document.getElementById("editDeckNameBtn");
  const deckInput = document.getElementById("deckNameInput");
  const deckTitle = document.getElementById("deckTitle");

  console.log("Initializing edit deck name functionality", { editBtn, deckInput, deckTitle });
  
  if (!editBtn || !deckInput || !deckTitle) {
    console.warn("Edit deck name elements not found");
    return;
  }

  // Clear any existing event listeners by cloning elements
  const newEditBtn = editBtn.cloneNode(true);
  const newDeckInput = deckInput.cloneNode(true);
  
  editBtn.parentNode.replaceChild(newEditBtn, editBtn);
  deckInput.parentNode.replaceChild(newDeckInput, deckInput);
  
  // Edit button click handler
  newEditBtn.addEventListener("click", function(e) {
    e.preventDefault();
    e.stopPropagation();
    console.log("Edit button clicked!");
    
    const currentName = deckTitle.textContent.trim();
            newDeckInput.value = currentName === "FlashNotes" ? "" : currentName;
    console.log("Setting input value to:", newDeckInput.value);
    
    // Hide title and button, show input
    deckTitle.style.display = "none";
    newEditBtn.style.display = "none";
    newDeckInput.style.display = "block";
    
    console.log("Input display set to block, focusing...");
    setTimeout(() => {
      newDeckInput.focus();
      newDeckInput.select();
    }, 50);
  });

  // Input handlers
  function saveDeckName() {
    const newName = newDeckInput.value.trim();
    if (newName && newName !== "") {
      deckTitle.textContent = newName;
    } else {
      deckTitle.textContent = "FlashNotes";
    }
    newDeckInput.style.display = "none";
    deckTitle.style.display = "block";
    newEditBtn.style.display = "inline-block";
    console.log("Deck name saved:", deckTitle.textContent);
  }

  function cancelEdit() {
    newDeckInput.style.display = "none";
    deckTitle.style.display = "block";
    newEditBtn.style.display = "inline-block";
    console.log("Edit cancelled");
  }

  // Save on Enter key, cancel on Escape
  newDeckInput.addEventListener("keydown", function(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      saveDeckName();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
  });

  // Save when input loses focus
  newDeckInput.addEventListener("blur", function() {
    setTimeout(saveDeckName, 100); // Small delay to allow other interactions
  });
  
  console.log("Edit deck name functionality initialized successfully");
}

// Initialize Authentication
document.addEventListener("DOMContentLoaded", async function () {
  // Initialize the complete authentication system from auth-modal.js
  await initializeAuthSystem();
});

// Note: Auth functions have been moved to auth-modal.js for better organization

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

  // Initialize other components
  initializeTabSwitching();
  initializeSessionRecovery();
  initializeMobileMenu();
  initializeUserMenuDropdown();
<<<<<<< HEAD
  initializeEditDeckName();
=======
  initializeFreeTrialButtons();
>>>>>>> 9109d1b (Added unique twists markdown document)

  // Initialize subscription manager
  const subscriptionManager = new SubscriptionManager();
  subscriptionManager.initialize();

  // Initialize variables
  let monthlyCardCount = 0;
  let spacedRepetition = new SpacedRepetition();
  // Make spacedRepetition globally accessible
  window.spacedRepetitionInstance = spacedRepetition;
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
  window.isFlipped = isFlipped;

  // Expose auth modal functions globally
  window.showAuthModal = showAuthModal;
  window.hideAuthModal = hideAuthModal;
  
  // Expose edit deck name function globally
  window.initializeEditDeckName = initializeEditDeckName;
  
  // Expose updateLoadingMessage function globally
  window.updateLoadingMessage = updateLoadingMessage;

  // Function to check for due cards during study sessions
  function checkForDueCards() {
    if (!isActiveStudySession || !originalDeckCards.length) {
      return;
    }

    console.log('Checking for due cards...', {
      isActiveStudySession,
      originalDeckCardsLength: originalDeckCards.length,
      currentFlashcardsLength: flashcards.length
    });

    const dueCards = spacedRepetition.getDueCards(originalDeckCards);
    console.log(`Found ${dueCards.length} total due cards from original deck`);
    
    // Debug: Show which cards are due
    if (dueCards.length > 0) {
      console.log("🕐 Due cards details:", dueCards.map(card => {
        const cardId = card.id || `card_${originalDeckCards.indexOf(card)}`;
        const cardData = spacedRepetition.getCardData(cardId);
        return {
          cardId,
          front: card.front?.substring(0, 30) + "...",
          state: cardData?.state,
          dueTime: cardData?.due ? new Date(cardData.due).toLocaleString() : "unknown",
          overdue: cardData?.due ? (Date.now() - cardData.due) / 1000 : 0
        };
      }));
    }
    
    // Find cards that are due but not currently in the flashcards array
    const newlyDueCards = dueCards.filter(dueCard => {
      const cardId = dueCard.id || `card_${originalDeckCards.indexOf(dueCard)}`;
      return !flashcards.some(flashcard => {
        const flashcardId = flashcard.id || `card_${originalDeckCards.indexOf(flashcard)}`;
        return flashcardId === cardId;
      });
    });

    console.log(`Found ${newlyDueCards.length} newly due cards to add to session`);

    if (newlyDueCards.length > 0) {
      console.log(`Adding ${newlyDueCards.length} newly due cards to session`);
      
      // Add newly due cards to the current session
      flashcards.push(...newlyDueCards);
      
      // Update window.flashcards reference
      window.flashcards = flashcards;
      
      // Show notification
      showSuccessMessage(`🔄 ${newlyDueCards.length} card(s) are now due for review and have been added to your session!`);
      
      // Update progress display
      updateProgress();
    }
  }

  // Function to start due card checking during study sessions
  function startDueCardChecking() {
    if (dueCardCheckInterval) {
      clearInterval(dueCardCheckInterval);
    }
    
    // Check for due cards every 15 seconds during active study sessions (faster for testing)
    dueCardCheckInterval = setInterval(checkForDueCards, 15000);
    console.log("Started due card checking interval (every 15 seconds)");
    
    // Also check immediately when starting
    setTimeout(checkForDueCards, 1000);
  }

  // Function to stop due card checking
  function stopDueCardChecking() {
    if (dueCardCheckInterval) {
      clearInterval(dueCardCheckInterval);
      dueCardCheckInterval = null;
      console.log("Stopped due card checking interval");
    }
  }

  // Override isPremium for testing
  subscriptionManager.isPremium = () => true;

  // Initialize PDF.js when the library is loaded
  if (typeof pdfjsLib !== "undefined") {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  } else {
    console.warn("PDF.js library not loaded yet");
  }

  // Dual auth: Firebase onAuthStateChanged for email/password, Auth0 authStateChanged for Google
  // The auth state handling is now done in the DOMContentLoaded event above


<<<<<<< HEAD
=======
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

      // Re-initialize free trial buttons for logged-in state
      initializeFreeTrialButtons();
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

      // Re-initialize free trial buttons for logged-out state
      initializeFreeTrialButtons();
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
>>>>>>> 9109d1b (Added unique twists markdown document)

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
    showAuthModal("login");
  });

  // Handle logout
  $(document).on("click", "#logoutBtn, #mobileLogoutBtn", async function () {
    try {
      await signOutUser();
      console.log('User logged out successfully');
    } catch (error) {
      console.error('Logout error:', error);
      showNotification('Error during logout. Please try again.', 'error');
    }
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
  // Note: This handler might be redundant since auth-modal.js handles Google auth
  // But keeping it for backwards compatibility
  $(document).on("click", "#googleLoginBtn", async function () {
    console.log("[APP.JS] Google login button clicked - delegating to auth-modal.js");
    // The auth-modal.js will handle this, but let's make sure user document is created
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
      await signOutUser();
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
  
  // Make loadUserDecks globally accessible
  window.loadUserDecks = loadUserDecks;

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
        ${deck.tags && deck.tags.length > 0 ? `
          <div class="deck-card-tags">
            ${deck.tags.slice(0, 4).map(tag => `
              <span class="deck-tag">${tag}</span>
            `).join('')}
            ${deck.tags.length > 4 ? `<span class="deck-tag-more">+${deck.tags.length - 4} more</span>` : ''}
          </div>
        ` : ''}
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
          window.isFlipped = isFlipped;
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
    } else if (flashcards.length > 0) {
      // Show button for new cards that haven't been studied yet
      studyBtn.show();
      dueCountSpan.text(`(${flashcards.length} new)`);
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
    // Reset session completion flag for new session
    window.sessionCompleted = false;
    
    let cardsToStudy = [];

    if (deck) {
      // Study a specific deck
      cardsToStudy = deck.cards || [];
      // Store original deck cards for due card checking
      originalDeckCards = [...cardsToStudy];
    } else {
      // Study due cards from current flashcards
      const dueCards = spacedRepetition.getDueCards(flashcards);
      const unfamiliarCards = flashcards.filter(
        (card) => card.metadata?.markedAsUnfamiliar
      );

      // Prioritize due cards, then unfamiliar cards
      cardsToStudy = dueCards.length > 0 ? dueCards : unfamiliarCards;
      // Store original deck cards for due card checking
      originalDeckCards = [...flashcards];
    }

    if (cardsToStudy.length === 0) {
      showSuccessMessage(
        "No cards due for review right now! Great job staying on top of your studies."
      );
      return;
    }

    // Start study session tracking
    isActiveStudySession = true;
    startDueCardChecking();

    // Start study session
    flashcards = cardsToStudy;
    currentCardIndex = 0;
    isFlipped = false;
    window.isFlipped = isFlipped;

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

    // Set loading message for flashcard generation
    updateLoadingMessage('Generating Flashcards');
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
    const outputType = $("input[name='urlOutputType']:checked").val(); // Get selected output type
    const cardType = $("#urlCardType").val();
    const cardCount = parseInt($("#urlCardCount").val());
    const summaryType = $("#urlSummaryType").val();

    console.log("URL:", url, "Output Type:", outputType, "Card Type:", cardType, "Card Count:", cardCount, "Summary Type:", summaryType); // Debug log

    if (!url) {
      showErrorMessage("Please enter a URL");
      return;
    }

    // Validate based on output type
    if (outputType === 'flashcards' && !cardType) {
      showErrorMessage("Please select a card type");
      return;
    }

    try {
      // Update loading message based on output type
      if (outputType === 'summary') {
        updateLoadingMessage('Generating FlashNotes');
      } else if (outputType === 'flashcards') {
        updateLoadingMessage('Generating Flashcards');
      }
      
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

      console.log("Starting content generation with type:", outputType); // Debug log

      // Route to appropriate processing based on output type
      if (outputType === 'summary') {
        // Generate FlashNotes only
        await generateSummaryFromContent(processedContent, summaryType);
        showSummaryViewer(true);
      } else if (outputType === 'flashcards') {
        // Generate Flashcards only
        await processText(processedContent, { cardType, cardCount });
      }

      console.log("Content generation completed successfully!"); // Debug log
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

  // Helper function to generate summary with proper parameter handling
  async function generateSummaryFromContent(content, summaryType) {
    // The generateSummary function looks for 'summaryType' element, but we're using 'urlSummaryType'
    // We need to create a temporary element or modify the function call
    
    // Create a temporary element if needed
    let tempElement = document.getElementById('summaryType');
    let createdTemp = false;
    
    if (!tempElement) {
      tempElement = document.createElement('select');
      tempElement.id = 'summaryType';
      tempElement.style.display = 'none';
      document.body.appendChild(tempElement);
      createdTemp = true;
    }
    
    const originalValue = tempElement.value;
    tempElement.value = summaryType || 'quick';
    
    try {
      // Call the generateSummary function from index.html
      if (window.generateSummary) {
        await window.generateSummary(content);
      } else {
        // Fallback if generateSummary is not available globally
        console.error('generateSummary function not found');
        showErrorMessage('Summary generation feature not available');
      }
    } finally {
      // Clean up
      if (createdTemp && tempElement.parentNode) {
        tempElement.parentNode.removeChild(tempElement);
      } else if (tempElement) {
        tempElement.value = originalValue;
      }
    }
  }

  // Helper function to show/hide summary viewer
  function showSummaryViewer(show) {
    const summaryContainer = document.getElementById('summaryContainer');
    if (summaryContainer) {
      summaryContainer.style.display = show ? 'block' : 'none';
    }
  }

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
<<<<<<< HEAD

      // Show helpful tooltip for new users on first card
      if (currentCardIndex === 0 && !localStorage.getItem('seenSpacedRepetitionTip')) {
        setTimeout(() => {
          showSpacedRepetitionTip();
        }, 500);
=======
      $("#feynmanContainer").slideDown(200);
      // initialize confidence readout
      const slider = document.getElementById("confidenceSlider");
      const valueEl = document.getElementById("confidenceValue");
      if (slider && valueEl) {
        valueEl.textContent = slider.value;
        slider.oninput = function () {
          valueEl.textContent = this.value;
        };
>>>>>>> 9109d1b (Added unique twists markdown document)
      }
    });

    // Performance buttons
    $(".performance-buttons button").on("click", function (e) {
      e.preventDefault();
      // Cancel any ongoing speech when rating performance
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }
      const answer = parseInt($(this).data("performance"));

      // Capture Feynman explanation and confidence
      const explanationEl = document.getElementById("feynmanExplanation");
      const confidenceEl = document.getElementById("confidenceSlider");
      const explanation = explanationEl ? explanationEl.value : "";
      const confidence = confidenceEl ? parseInt(confidenceEl.value) : 3;

      // Attach to global card metadata before handling answer
      const card = flashcards[currentCardIndex];
      if (card) {
        card.metadata = card.metadata || {};
        card.metadata.feynman = {
          explanation,
          confidence,
          reviewedAt: new Date().toISOString(),
        };
      }

      handlePerformanceAnswer(confidence);
    });

    // Keyboard shortcuts for performance buttons (1-4)
    $(document).off("keydown.performance").on("keydown.performance", function (e) {
      console.log(`Key pressed: ${e.key}, buttons visible: ${$(".performance-buttons").is(":visible")}, display: ${$(".performance-buttons").css("display")}`);
      
      // Only handle when performance buttons are visible
      if (!$(".performance-buttons").is(":visible") || $(".performance-buttons").css("display") === "none") {
        return;
      }

      // Prevent shortcuts if user is typing in an input field
      if ($(e.target).is("input, textarea, select, [contenteditable]")) {
        return;
      }

      const keyMap = {
        "1": 1, // Again
        "2": 2, // Hard  
        "3": 3, // Good
        "4": 4, // Easy
      };

      if (keyMap[e.key]) {
        e.preventDefault();
        console.log(`Keyboard shortcut ${e.key} pressed for performance ${keyMap[e.key]}`);
        
        // Visual feedback - briefly highlight the button
        const button = $(`.performance-buttons button[data-performance="${keyMap[e.key]}"]`);
        button.addClass("keyboard-pressed");
        setTimeout(() => button.removeClass("keyboard-pressed"), 150);
        
        handlePerformanceAnswer(keyMap[e.key]);
      }
    });

    // Flashcard click handler
    $("#flashcard").on("click", function (e) {
      console.log("🔥 app.js click handler triggered!");
      console.log("Event details:", e);
      console.log("Original event:", e.originalEvent);
      console.log("flashcardHandled flag:", e.originalEvent ? e.originalEvent.flashcardHandled : "no originalEvent");
      console.log("Target:", e.target);
      console.log("Current target:", e.currentTarget);
      console.trace("Stack trace for app.js click:");
      
      // Check if custom flip handler already processed this click
      if (e.originalEvent && e.originalEvent.flashcardHandled) {
        console.log("Custom flip handler already processed this click, skipping app.js handler");
        return;
      }
      
      // Don't flip if clicking on performance buttons or other controls
      if ($(e.target).closest('.performance-buttons, .btn-pronounce, .navigation-buttons').length > 0) {
        return;
      }

      // Cancel any ongoing speech when flipping card
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }

      const flashcard = $(this);
      
      // Clear any existing timeout for performance buttons
      if (performanceButtonTimeout) {
        clearTimeout(performanceButtonTimeout);
        performanceButtonTimeout = null;
      }

      // Toggle the flip state
      if (flashcard.hasClass('flipped')) {
        // Already flipped - flip back to front (keep performance buttons visible)
        flashcard.removeClass('flipped');
        // Don't hide performance buttons - they should stay visible until next card
      } else {
        // Flip to back - show performance buttons after animation + delay
        flashcard.addClass('flipped');
        answerStartTime = Date.now();
        
        // Show performance buttons after flip animation completes + 1.5-2 second delay
        performanceButtonTimeout = setTimeout(() => {
          // Only show if card is still flipped (hasn't been navigated away)
          if (flashcard.hasClass('flipped')) {
            $(".performance-buttons").addClass("show");
            $(".keyboard-hints").fadeIn(200);
          }
          performanceButtonTimeout = null;
        }, 2100); // 600ms flip animation + 1500ms delay = 2100ms total

        // Show helpful tooltip for new users on first card
        if (currentCardIndex === 0 && !localStorage.getItem('seenSpacedRepetitionTip')) {
          setTimeout(() => {
            showSpacedRepetitionTooltip();
          }, 3000); // Show after performance buttons appear
        }
      }
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

    // Clear any pending performance button timeout
    if (performanceButtonTimeout) {
      clearTimeout(performanceButtonTimeout);
      performanceButtonTimeout = null;
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

  // Expose navigateCard globally for use outside this scope
  window.navigateCard = navigateCard;
  
  // Expose initializeStudySession globally for use in create-deck.html dropdown
  window.initializeStudySession = initializeStudySession;

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
      console.log("Reached end of flashcards");
      // Reset index to last card for now
      currentCardIndex = flashcards.length - 1;
      // showQuizPrompt(); // Removed - modal disabled
      return;
    }

    // Get the flashcard container
    const container = document.getElementById("flashcard");
    if (!container) {
      console.error("Flashcard container not found");
      return;
    }

    container.innerHTML = ""; // Clear existing content

    // Create the proper flip structure for CSS animation
    const flashcardInner = document.createElement("div");
    flashcardInner.className = "flashcard-inner";
    
    // Create front and back card containers
    const cardFront = document.createElement("div");
    cardFront.className = "card-front";
    const cardBack = document.createElement("div");
    cardBack.className = "card-back";
    
    // Add card content
    const card = flashcards[currentCardIndex];
    
    // Create content for front and back
    const frontContent = document.createElement("p");
    frontContent.textContent = card.front;
    cardFront.appendChild(frontContent);
    

    
    const backContent = document.createElement("p");
    backContent.textContent = card.back;
    cardBack.appendChild(backContent);
    

    
    // Add flip hint to front
    const flipHint = document.createElement("div");
    flipHint.className = "flip-hint";
    flipHint.innerHTML = '<i class="fas fa-hand-pointer"></i> Click to flip';
    cardFront.appendChild(flipHint);
    
    // Assemble the structure
    flashcardInner.appendChild(cardFront);
    flashcardInner.appendChild(cardBack);
    container.appendChild(flashcardInner);

    // Add pronunciation buttons to front and back
    // Add pronunciation button to front
    const frontPronounceBtn = document.createElement("button");
    frontPronounceBtn.className = "btn-pronounce";
    frontPronounceBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
    frontPronounceBtn.setAttribute("data-text", flashcards[currentCardIndex].front);
    cardFront.appendChild(frontPronounceBtn);

    // Add pronunciation button to back
    const backPronounceBtn = document.createElement("button");
    backPronounceBtn.className = "btn-pronounce";
    backPronounceBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
    backPronounceBtn.setAttribute("data-text", flashcards[currentCardIndex].back);
    cardBack.appendChild(backPronounceBtn);

    // Clear any pending performance button timeout
    if (performanceButtonTimeout) {
      clearTimeout(performanceButtonTimeout);
      performanceButtonTimeout = null;
    }

    // Reset card state - remove flip and hide performance buttons
    $("#flashcard").removeClass("flipped");
    $(".performance-buttons").removeClass("show");
    $(".keyboard-hints").hide();
    
    console.log("app.js updateFlashcard reset - flashcard classes:", $("#flashcard")[0] ? $("#flashcard")[0].className : "not found");

    // Update progress
    updateProgress();
    
    // Update deck tags display
    updateDeckTags();
    
    // Ensure height lock is maintained during card navigation to prevent viewport jumping
    setTimeout(() => {
      $(".grid-item:nth-child(2)").css("height", "970px");
    }, 50); // Quick application to prevent content-based height changes
  }




<<<<<<< HEAD
=======
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

    // Disabled quiz prompt modal (was shown at 100% progress)
    // if (progress >= 100 && !sessionStorage.getItem("quizPromptShown")) {
    //   showQuizPrompt();
    //   sessionStorage.setItem("quizPromptShown", "true");
    // }
  }
>>>>>>> 9109d1b (Added unique twists markdown document)

  // Quiz prompt disabled for now
  function showQuizPrompt() {
    /* disabled */
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
      name: APP_CONFIG.QUIZ_NAME,
      description: APP_CONFIG.QUIZ_DESCRIPTION,
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
    window.isFlipped = isFlipped;
    $(this).toggleClass("flipped");
  });

  // Document processing functions
  async function processDocxFile(content, fileType) {
    try {
      // Load mammoth.js if not already loaded
      if (typeof mammoth === 'undefined') {
        updateLoadingMessage('Loading document processor...');
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.4.2/mammoth.browser.min.js');
        updateLoadingMessage('Processing document...');
      }

      if (fileType === "application/msword") {
        // For legacy DOC files, we can only extract basic text
        // This is a simplified approach - real DOC parsing is complex
        throw new Error("Legacy DOC files require conversion to DOCX for full support. Please save your document as DOCX format.");
      }

      // Convert DOCX to text using mammoth
      const result = await mammoth.extractRawText({arrayBuffer: content});
      
      if (!result.value || result.value.trim().length === 0) {
        throw new Error("No text content could be extracted from this document.");
      }

      // Log any conversion warnings
      if (result.messages && result.messages.length > 0) {
        console.log("DOCX conversion messages:", result.messages);
      }

      return result.value;
    } catch (error) {
      console.error("Error processing DOCX file:", error);
      throw new Error(`Failed to process document: ${error.message}`);
    }
  }

  async function processPowerPointFile(content, fileType) {
    try {
      // For PowerPoint files, we'll use a simplified approach
      // Full PPTX parsing requires complex libraries, so we'll implement basic text extraction
      
      if (fileType === "application/vnd.ms-powerpoint") {
        throw new Error("Legacy PPT files require conversion to PPTX for full support. Please save your presentation as PPTX format.");
      }

      // Load JSZip for extracting PPTX content
      if (typeof JSZip === 'undefined') {
        updateLoadingMessage('Loading presentation processor...');
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
        updateLoadingMessage('Extracting slides...');
      }

      const zip = await JSZip.loadAsync(content);
      let extractedText = "";

      // Extract text from slide XML files
      const slideFiles = Object.keys(zip.files).filter(name => 
        name.startsWith('ppt/slides/slide') && name.endsWith('.xml')
      );

      for (const slideName of slideFiles) {
        const slideContent = await zip.file(slideName).async('text');
        
        // Simple regex to extract text content from XML
        const textMatches = slideContent.match(/<a:t[^>]*>([^<]+)<\/a:t>/g);
        if (textMatches) {
          const slideText = textMatches
            .map(match => match.replace(/<a:t[^>]*>([^<]+)<\/a:t>/, '$1'))
            .join(' ');
          extractedText += slideText + '\n\n';
        }
      }

      if (!extractedText.trim()) {
        throw new Error("No text content could be extracted from this presentation. Make sure the slides contain text.");
      }

      return extractedText;
    } catch (error) {
      console.error("Error processing PowerPoint file:", error);
      throw new Error(`Failed to process presentation: ${error.message}`);
    }
  }

  async function processSpreadsheetFile(content, fileType) {
    try {
      if (fileType === "text/csv") {
        // Simple CSV parsing
        const lines = content.split('\n');
        const data = lines.map(line => {
          // Simple CSV parsing - doesn't handle quotes properly but good enough for basic use
          return line.split(',').map(cell => cell.trim()).join(' ');
        }).filter(line => line.trim());
        
        return data.join('\n');
      }

      // For Excel files, load SheetJS
      if (typeof XLSX === 'undefined') {
        updateLoadingMessage('Loading spreadsheet processor...');
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
        updateLoadingMessage('Processing spreadsheet...');
      }

      if (fileType === "application/vnd.ms-excel") {
        throw new Error("Legacy XLS files require conversion to XLSX for full support. Please save your spreadsheet as XLSX format.");
      }

      // Parse Excel file
      const workbook = XLSX.read(content, {type: 'array'});
      let extractedText = "";

      // Process each worksheet
      workbook.SheetNames.forEach(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert sheet to text
        const sheetText = XLSX.utils.sheet_to_csv(worksheet, {
          header: 1,
          defval: ''
        });
        
        if (sheetText.trim()) {
          extractedText += `Sheet: ${sheetName}\n${sheetText}\n\n`;
        }
      });

      if (!extractedText.trim()) {
        throw new Error("No data could be extracted from this spreadsheet.");
      }

      return extractedText;
    } catch (error) {
      console.error("Error processing spreadsheet file:", error);
      throw new Error(`Failed to process spreadsheet: ${error.message}`);
    }
  }

  // Update file handling functions
  function validateAndProcessFile(file) {
    // Check file type
    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv",
      "text/plain",
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.type)) {
      showErrorMessage(
        "Please upload a PDF, DOC, DOCX, PPT, PPTX, XLS, XLSX, CSV, TXT, or image file (JPG, PNG, GIF, WebP)"
      );
      return;
    }

    // Check file size (max 10MB for most files, 15MB for presentations)
    const maxSize = file.type.includes('presentation') ? 15 * 1024 * 1024 : 10 * 1024 * 1024;
    const sizeMB = Math.round(file.size / (1024 * 1024));
    const maxSizeMB = Math.round(maxSize / (1024 * 1024));
    
    if (file.size > maxSize) {
      showErrorMessage(`File size (${sizeMB}MB) exceeds the ${maxSizeMB}MB limit`);
      return;
    }

    // Show helpful message for legacy formats
    if (file.type === "application/msword" || 
        file.type === "application/vnd.ms-powerpoint" || 
        file.type === "application/vnd.ms-excel") {
      showSuccessMessage(
        `Legacy ${file.name.split('.').pop().toUpperCase()} format detected. For best results, please save as modern format (DOCX, PPTX, XLSX) if possible.`
      );
    }

    // Show card type selection after file validation
    $("#fileInput").hide();
    $("#dropzone").hide();
    $("#cardTypeSelection").addClass("show");

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
              // Process DOCX files using mammoth.js
              text = await processDocxFile(content, file.type);
              break;

            case "application/vnd.ms-powerpoint":
            case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
              // Process PowerPoint files
              text = await processPowerPointFile(content, file.type);
              break;

            case "application/vnd.ms-excel":
            case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
            case "text/csv":
              // Process Excel/CSV files
              text = await processSpreadsheetFile(content, file.type);
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
      } else if (
        file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        file.type === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
        file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        file.type === "application/vnd.ms-excel" ||
        file.type === "application/vnd.ms-powerpoint" ||
        file.type === "application/msword"
      ) {
        reader.readAsArrayBuffer(file);
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

    // Check output type selection
    const outputType = $("input[name='uploadOutputType']:checked").val();
    const cardType = $("#uploadCardType").val();
    const cardCount = parseInt($("#uploadCardCount").val());
    const summaryType = $("#uploadSummaryType").val();

    // Validate based on output type
    if (outputType === 'flashcards' && !cardType) {
      showErrorMessage("Please select a card type");
      return;
    }

    const isPremium = subscriptionManager.isPremium();

    // Validate card count based on premium status (only for flashcards)
    if (outputType === 'flashcards' && !isPremium && cardCount > 10) {
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
          `Free tier limit reached. Please wait ${hoursLeft} hours before generating more content, or upgrade to premium for unlimited access.`
        );
        return;
      }
    }

    // Update loading message based on output type
    if (outputType === 'summary') {
      updateLoadingMessage('Generating FlashNotes');
    } else if (outputType === 'flashcards') {
      updateLoadingMessage('Generating Flashcards');
    }

    // Start loading with minimum duration
    showLoading(true);
    const loadingStartTime = Date.now();

    try {
      // Process the file
      const result = await handleFile(window.uploadedFile);

      // Handle different file types
      if (typeof result === "object" && result.type === "image") {
        // For image files, only flashcards with image occlusion are supported
        if (outputType !== 'flashcards' || cardType !== "image-occlusion") {
          throw new Error(
            "Image files can only be used with Flashcards and Image Occlusion card type. Please select 'Generate Flashcards' and 'Image Occlusion' from the dropdowns."
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

        // Route to appropriate processing based on output type
        if (outputType === 'summary') {
          // Generate FlashNotes only
          await generateSummaryFromContent(result, summaryType);
          showSummaryViewer(true);
        } else if (outputType === 'flashcards') {
          // Generate Flashcards only
          await processText(result, { cardType, cardCount });
        }
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
            generateTags: true, // Request tags to be generated
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

      // Add tags to flashcards if not provided by AI
      flashcards = flashcards.map(card => {
        if (!card.tags || card.tags.length === 0) {
          card.tags = generateTagsFromContent(card.front, card.back);
        }
        return card;
      });

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
      hideEditDeckNameButton();
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

    // Show edit deck name button after generation
    showEditDeckNameButton();

    // Update deck tags display
    updateDeckTags();

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

  // Helper function to generate tags from flashcard content
  function generateTagsFromContent(front, back) {
    const content = `${front} ${back}`.toLowerCase();
    const tags = [];
    
    // Common academic/educational terms
    const termCategories = {
      'science': ['atom', 'molecule', 'chemical', 'biology', 'physics', 'chemistry', 'reaction', 'element', 'compound', 'energy', 'force'],
      'history': ['war', 'century', 'ancient', 'empire', 'revolution', 'king', 'queen', 'battle', 'treaty', 'civilization'],
      'language': ['grammar', 'verb', 'noun', 'sentence', 'vocabulary', 'pronunciation', 'conjugation', 'plural', 'tense'],
      'math': ['equation', 'formula', 'calculate', 'solve', 'theorem', 'geometry', 'algebra', 'number', 'fraction', 'decimal'],
      'literature': ['author', 'novel', 'poem', 'character', 'plot', 'theme', 'metaphor', 'symbolism', 'narrative'],
      'geography': ['country', 'capital', 'continent', 'river', 'mountain', 'ocean', 'climate', 'population', 'border'],
      'business': ['profit', 'revenue', 'market', 'customer', 'strategy', 'management', 'economics', 'finance', 'investment'],
      'technology': ['computer', 'software', 'algorithm', 'data', 'network', 'programming', 'digital', 'internet', 'database']
    };
    
    // Check for category matches
    for (const [category, keywords] of Object.entries(termCategories)) {
      if (keywords.some(keyword => content.includes(keyword))) {
        tags.push(category);
        break; // Only add one category tag
      }
    }
    
    // Extract important nouns and concepts (simple extraction)
    const words = content.split(/\s+/);
    const importantWords = words.filter(word => 
      word.length > 4 && 
      !['what', 'when', 'where', 'which', 'this', 'that', 'these', 'those', 'with', 'from', 'they', 'them', 'have', 'been', 'were', 'will', 'would', 'could', 'should'].includes(word)
    );
    
    // Add 1-2 specific terms
    const specificTerms = importantWords.slice(0, 2).map(word => 
      word.replace(/[^a-zA-Z]/g, '').toLowerCase()
    ).filter(word => word.length > 3);
    
    tags.push(...specificTerms);
    
    // Add difficulty level based on content complexity
    if (content.length > 200 || words.length > 30) {
      tags.push('advanced');
    } else if (content.length > 100 || words.length > 15) {
      tags.push('intermediate');
    } else {
      tags.push('basic');
    }
    
    // Remove duplicates and limit to 4 tags
    return [...new Set(tags)].slice(0, 4);
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
      // Show the deck title container when flashcards are available
      $(".deck-title-container").addClass("show");
      // Reinitialize flashcard controls when showing the viewer
      initializeFlashcardControls();
      // Reset session counter and completion flag for new deck
      $("#sessionCounter").remove();
      window.sessionCompleted = false;
      
      // Lock grid-item height to prevent viewport jumping when performance buttons appear
      setTimeout(() => {
        $(".grid-item:nth-child(2)").css("height", "970px");
      }, 100); // Small delay to ensure layout is settled
    } else {
      $("#flashcardViewer").hide();
      $("#emptyState").show();
      // Hide the deck title container when no flashcards
      $(".deck-title-container").removeClass("show");
      // Clean up session counter when hiding viewer
      $("#sessionCounter").remove();
      // Remove height lock when hiding viewer
      $(".grid-item:nth-child(2)").css("height", "");
      $(".flashcard-viewer").css("height", "");
      
      // Stop session tracking when viewer is closed
      isActiveStudySession = false;
      stopDueCardChecking();
      originalDeckCards = [];
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
        await signOutUser();
        mobileMenu.classList.remove("show");
      } catch (error) {
        console.error("Error signing out:", error);
        showErrorMessage("Error signing out. Please try again.");
      }
    });

    // Update mobile user menu when auth state changes
    window.addEventListener('authStateChanged', (event) => {
      const { user } = event.detail;
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
    // This function is for auth modal tabs only, not input tabs
    // Input tab switching is now handled in individual page scripts
    console.log("Auth tab switching initialized");
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

    // Note: Tab switching is now handled in individual page scripts to avoid conflicts

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

  // Centralized TTS Implementation
  window.initializeTTSButtons = function initializeTTSButtons() {
    const ttsButtons = document.querySelectorAll(".btn-pronounce");
    ttsButtons.forEach((button) => {
      // Remove any existing listeners to prevent duplicates
      button.removeEventListener("click", handleTTSClick);
      // Add the TTS click handler
      button.addEventListener("click", handleTTSClick);
    });
  };

  function handleTTSClick(e) {
    e.preventDefault();
    e.stopPropagation();

    const button = e.currentTarget;
    const textToSpeak =
      button.getAttribute("data-text") ||
      button.parentElement.textContent.trim();

    console.log("🔊 TTS button clicked, speaking:", textToSpeak);

    if ("speechSynthesis" in window) {
      // Cancel any ongoing speech
      speechSynthesis.cancel();

      // Wait for voices to be loaded
      let voices = speechSynthesis.getVoices();

      // If voices aren't loaded yet, wait for them
      if (voices.length === 0) {
        speechSynthesis.onvoiceschanged = () => {
          voices = speechSynthesis.getVoices();
          speakWithSelectedVoice(textToSpeak, voices);
        };
      } else {
        speakWithSelectedVoice(textToSpeak, voices);
      }
    } else {
      console.warn("Speech synthesis not supported in this browser");
    }
  }

  function speakWithSelectedVoice(text, voices) {
    const utterance = new SpeechSynthesisUtterance(text);

    // Find a female English voice (user preference)
    const femaleVoice = voices.find(
      (voice) => voice.lang.includes("en") && voice.name.includes("Female")
    );
    const englishVoice = voices.find((voice) => voice.lang.includes("en"));
    const selectedVoice = femaleVoice || englishVoice || voices[0];

    if (selectedVoice) {
      utterance.voice = selectedVoice;
      console.log("Using voice:", selectedVoice.name);
    }

    // Configure for clarity (user preference)
    utterance.lang = "en-US";
    utterance.rate = 0.9; // Slightly slower for clarity
    utterance.pitch = 1;
    utterance.volume = 1;

    // Add event listeners for better control
    utterance.onstart = () => {
      console.log("Speech started with", selectedVoice?.name || "default voice");
    };

    utterance.onend = () => {
      console.log("Speech ended");
    };

    utterance.onerror = (event) => {
      console.error("Speech error:", event);
    };

    // Ensure the speech synthesis is ready
    if (speechSynthesis.paused) {
      speechSynthesis.resume();
    }

    // Add a small delay before speaking to ensure proper initialization
    setTimeout(() => {
      speechSynthesis.speak(utterance);
    }, 100);
  }

  // Auto-initialize TTS on DOM ready and set up mutation observer for dynamic content
  $(document).ready(function() {
    // Initialize TTS when page loads
    setTimeout(window.initializeTTSButtons, 1000);

    // Re-initialize TTS when flashcard content changes
    const flashcardForTTS = document.getElementById("flashcard");
    if (flashcardForTTS) {
      const ttsObserver = new MutationObserver(function (mutations) {
        let shouldReinitializeTTS = false;
        mutations.forEach(function (mutation) {
          if (mutation.type === "childList") {
            // Check if new TTS buttons were added
            const addedNodes = Array.from(mutation.addedNodes);
            if (
              addedNodes.some(
                (node) =>
                  node.nodeType === 1 &&
                  (node.querySelector(".btn-pronounce") ||
                    node.classList?.contains("btn-pronounce"))
              )
            ) {
              shouldReinitializeTTS = true;
            }
          }
        });

        if (shouldReinitializeTTS) {
          setTimeout(window.initializeTTSButtons, 100);
        }
      });

      ttsObserver.observe(flashcardForTTS, {
        childList: true,
        subtree: true,
      });
    }
  });

  // Initialize file handling
  window.initializeFileHandling = function initializeFileHandling() {
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
  window.addEventListener('authStateChanged', async (event) => {
    const { user, isAuthenticated } = event.detail;
    if (isAuthenticated) {
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

    // Start session tracking
    isActiveStudySession = true;
    originalDeckCards = [...flashcards]; // Store original deck for due card checking
    startDueCardChecking();

    // Start study session
    flashcards = cardsToStudy;
    currentCardIndex = 0;
    isFlipped = false;
    window.isFlipped = isFlipped;

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
    try {
      // Get occlusion data from the editor
      const occlusionData = window.getOcclusionData();
      
      if (!occlusionData || !occlusionData.image || !occlusionData.occlusions || occlusionData.occlusions.length === 0) {
        showErrorMessage("Please create at least one occlusion area before generating flashcards.");
        return;
      }

      console.log("Processing image occlusion with data:", occlusionData);

      // Convert data URL to blob
      const response = await fetch(occlusionData.image);
      const blob = await response.blob();

      // Create form data
      const formData = new FormData();
      formData.append('image', blob, 'occlusion-image.png');
      formData.append('occlusions', JSON.stringify(occlusionData.occlusions));
      formData.append('imageWidth', occlusionData.imageWidth);
      formData.append('imageHeight', occlusionData.imageHeight);
      formData.append('cardType', options.cardType || 'image-occlusion');
      formData.append('cardCount', options.cardCount || occlusionData.occlusions.length);

      // Send to backend for processing
      const result = await fetch('/api/process-image-occlusion', {
        method: 'POST',
        body: formData
      });

      if (!result.ok) {
        throw new Error(`Server error: ${result.status}`);
      }

      const processedData = await result.json();
      console.log("Processed image occlusion data:", processedData);

      // Generate flashcards from occlusion data
      const flashcards = occlusionData.occlusions.map((occlusion, index) => ({
        id: `occ-${Date.now()}-${index}`,
        type: 'image-occlusion',
        image: occlusionData.image,
        occlusions: [occlusion], // Each card shows one occlusion
        allOcclusions: occlusionData.occlusions, // For context
        front: `What is highlighted in this image?`,
        back: occlusion.label || `Area ${index + 1}`,
        imageWidth: occlusionData.imageWidth,
        imageHeight: occlusionData.imageHeight
      }));

      console.log("Generated image occlusion flashcards:", flashcards);

      // Update the flashcard viewer
      updateFlashcardViewer(flashcards);
      showFlashcardViewer(true);

      showSuccessMessage(`Created ${flashcards.length} image occlusion flashcards successfully!`);

    } catch (error) {
      console.error("Error processing image occlusion:", error);
      showErrorMessage(
        `Failed to process image occlusion: ${error.message}. Please try again or contact support if the issue persists.`
      );
    }
  }

  // showDecksLoadingPlaceholder function moved to KnowledgeHub module
});

// Knowledge Hub Module
const KnowledgeHub = {
  deckManager: null,
  selectedTags: new Set(), // Track selected tags

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
        
        // NEW: Add tag filtering
        const matchesTags = this.selectedTags.size === 0 || 
                          (deck.tags && deck.tags.some(tag => this.selectedTags.has(tag)));

        return matchesCategory && matchesSearch && matchesLevel && matchesTags;
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

      // Display decks and update tag filters for current category
      this.displayDecks(decks, false);
      this.updateTagFilters(activeCategory, decks);
    } catch (error) {
      console.error("Error filtering decks:", error);
      showNotification("Failed to load decks. Please try again.", "error");
      this.displayDecks([], false);
    }
  },

  // NEW: Update tag filters based on current category
  async updateTagFilters(activeCategory, filteredDecks) {
    try {
      // Get all tags from decks in the current category
      const categoryTags = new Map(); // tag -> count
      
      filteredDecks.forEach(deck => {
        if (deck.tags) {
          deck.tags.forEach(tag => {
            categoryTags.set(tag, (categoryTags.get(tag) || 0) + 1);
          });
        }
      });

      // Create or update tag filter UI
      this.renderTagFilters(categoryTags, activeCategory);
      
    } catch (error) {
      console.error("Error updating tag filters:", error);
    }
  },

  // NEW: Render tag filter chips
  renderTagFilters(categoryTags, activeCategory) {
    let tagFilterContainer = document.getElementById('tagFilters');
    
    // Create container if it doesn't exist
    if (!tagFilterContainer) {
      const hubControls = document.querySelector('.hub-controls');
      if (hubControls) {
        tagFilterContainer = document.createElement('div');
        tagFilterContainer.id = 'tagFilters';
        tagFilterContainer.className = 'tag-filter-section';
        hubControls.insertAdjacentElement('afterend', tagFilterContainer);
      } else {
        return; // Can't find where to put it
      }
    }

    // Clear existing content
    tagFilterContainer.innerHTML = '';

    if (categoryTags.size === 0) {
      tagFilterContainer.style.display = 'none';
      return;
    }

    // Create header and tag filters
    const categoryName = this.getCategoryDisplayName(activeCategory);
    tagFilterContainer.innerHTML = `
      <div class="tag-filter-header">
        <h4>Filter ${categoryName} by topic:</h4>
        <button class="btn btn-link btn-small clear-tags" ${this.selectedTags.size === 0 ? 'style="display: none;"' : ''}>
          <i class="fas fa-times"></i> Clear filters
        </button>
      </div>
      <div class="tag-filter-chips">
        ${Array.from(categoryTags.entries())
          .sort((a, b) => b[1] - a[1]) // Sort by count (most popular first)
          .slice(0, 12) // Limit to top 12 tags
          .map(([tag, count]) => `
            <button class="tag-filter-chip ${this.selectedTags.has(tag) ? 'active' : ''}" 
                    data-tag="${tag}">
              <span class="tag-name">${tag}</span>
              <span class="tag-count">${count}</span>
            </button>
          `).join('')}
      </div>
    `;

    tagFilterContainer.style.display = 'block';
    
    // Add event listeners
    this.attachTagFilterListeners(tagFilterContainer);
  },

  // NEW: Attach event listeners to tag filters
  attachTagFilterListeners(container) {
    // Tag chip clicks
    container.querySelectorAll('.tag-filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const tag = chip.dataset.tag;
        
        if (this.selectedTags.has(tag)) {
          this.selectedTags.delete(tag);
          chip.classList.remove('active');
        } else {
          this.selectedTags.add(tag);
          chip.classList.add('active');
        }
        
        // Update clear button visibility
        const clearBtn = container.querySelector('.clear-tags');
        clearBtn.style.display = this.selectedTags.size > 0 ? 'inline-flex' : 'none';
        
        // Re-filter decks
        this.filterDecks();
      });
    });

    // Clear filters button
    const clearBtn = container.querySelector('.clear-tags');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.selectedTags.clear();
        container.querySelectorAll('.tag-filter-chip').forEach(chip => {
          chip.classList.remove('active');
        });
        clearBtn.style.display = 'none';
        this.filterDecks();
      });
    }
  },

  // NEW: Get display name for category
  getCategoryDisplayName(category) {
    const categoryMap = {
      'all': 'All Trades',
      'electrician': 'Electrician',
      'plumber': 'Plumber/Pipefitter', 
      'hvac': 'HVAC/Refrigeration',
      'welder': 'Welder',
      'carpenter': 'Carpenter',
      'heavy-equipment': 'Heavy Equipment',
      'sprinkler': 'Sprinkler Fitter',
      'sheet-metal': 'Sheet Metal',
      'safety': 'Safety & OSHA'
    };
    return categoryMap[category] || category;
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
          
          ${deck.tags && deck.tags.length > 0 ? `
            <div class="deck-card-tags">
              ${deck.tags.slice(0, 3).map(tag => `
                <span class="deck-tag">${tag}</span>
              `).join('')}
              ${deck.tags.length > 3 ? `<span class="deck-tag-more">+${deck.tags.length - 3}</span>` : ''}
            </div>
          ` : ''}
          
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
        
        // Clear tag filters when switching categories
        this.selectedTags.clear();
        
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
        tags: ["ohms-law", "safety", "residential", "circuits"],
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
        tags: ["pipes", "pressure", "troubleshooting", "tools"],
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
          await signOutUser();
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

  // Map answers to feedback messages
  const feedbackMap = {
    1: {
      class: "feedback-danger",
      icon: "fas fa-times",
      message: "Again - Will show soon"
    },
    2: {
      class: "feedback-warning", 
      icon: "fas fa-clock",
      message: "Hard - Will show earlier"
    },
    3: {
      class: "feedback-success",
      icon: "fas fa-check", 
      message: "Good - Normal interval"
    },
    4: {
      class: "feedback-primary",
      icon: "fas fa-star",
      message: "Easy - Will show later"
    }
  };

  const feedbackInfo = feedbackMap[answer];
  if (feedbackInfo) {
    feedback.addClass(feedbackInfo.class).html(`
        <i class="${feedbackInfo.icon}"></i>
        <span>${feedbackInfo.message}</span>
      `);

    // Add to page and animate
    $("body").append(feedback);
    feedback.fadeIn(200);

    // Update card's performance in metadata
    const card = flashcards[currentCardIndex];
    if (card && card.metadata) {
      card.metadata.performance = answer;
    }

    // Remove feedback after shorter delay (more discreet)
    setTimeout(() => {
      feedback.fadeOut(300, function () {
        $(this).remove();
      });
    }, 1500);
  }
}

function handlePerformanceAnswer(answer) {
  const card = flashcards[currentCardIndex];

  // ===== SPACED REPETITION DEBUGGING =====
  const answerLabels = {
    1: "AGAIN (Forgot completely)",
    2: "HARD (Struggled to remember)", 
    3: "GOOD (Remembered correctly)",
    4: "EASY (Too easy)"
  };

  console.log("🎯 PERFORMANCE BUTTON CLICKED:", answerLabels[answer] || `Unknown (${answer})`);
  console.log("📋 Current Card:", {
    index: currentCardIndex,
    front: card.front?.substring(0, 50) + "...",
    back: card.back?.substring(0, 50) + "..."
  });

  // Check current spaced repetition state BEFORE processing
  const cardId = card.id || `card_${currentCardIndex}`;
  const spacedRepData = window.spacedRepetitionInstance?.getCardData(cardId);
  
  console.log("🧠 BEFORE Processing - Spaced Repetition State:", {
    cardId,
    state: spacedRepData?.state || "new",
    interval: spacedRepData?.interval || 0,
    repetitions: spacedRepData?.repetitions || 0,
    easeFactor: spacedRepData?.easeFactor || 2500,
    due: spacedRepData?.due ? new Date(spacedRepData.due).toLocaleString() : "never",
    isNew: !spacedRepData || spacedRepData.state === "new",
    isLearning: spacedRepData?.state === "learning",
    isReview: spacedRepData?.state === "review"
  });

  // Clear any pending performance button timeout
  if (performanceButtonTimeout) {
    clearTimeout(performanceButtonTimeout);
    performanceButtonTimeout = null;
  }

  // Calculate response time
  const responseTime = answerStartTime
    ? (Date.now() - answerStartTime) / 1000
    : null;

  console.log("⏱️ Response Time:", responseTime ? `${responseTime.toFixed(2)}s` : "not measured");

  // Reset answer start time for next card
  answerStartTime = null;

  // Ensure card has metadata
  if (!card.metadata) {
    card.metadata = {};
  }

  // Update card metadata with performance
  card.metadata.performance = answer;
  card.metadata.lastReviewed = new Date().toISOString();

<<<<<<< HEAD
  // Show discreet feedback
=======
  // Map confidence (1-5) to SRS answer scale (1 Again, 2 Hard, 3 Good, 4 Easy)
  const confidenceToSrs = { 1: 1, 2: 2, 3: 3, 4: 3, 5: 4 };
  const srsAnswer = confidenceToSrs[answer] ?? 3;

  try {
    if (typeof spacedRepetition?.answerCard === "function" && card?.id) {
      spacedRepetition.answerCard(card.id, srsAnswer, responseTime);
    }
  } catch (e) {
    console.warn("SRS update failed", e);
  }

  // Show feedback
>>>>>>> 9109d1b (Added unique twists markdown document)
  showAnswerFeedback(answer);

  // Debug session state
  console.log("📊 Session State:", {
    isActiveStudySession,
    totalCardsInSession: flashcards.length,
    currentCardIndex,
    originalDeckSize: originalDeckCards.length,
    dueCardCheckingActive: !!dueCardCheckInterval
  });

  // Auto-fix: If session tracking isn't active but we have flashcards, start it
  if (!isActiveStudySession && flashcards.length > 0) {
    console.warn("⚠️ SESSION TRACKING NOT ACTIVE - Auto-starting session tracking");
    isActiveStudySession = true;
    originalDeckCards = [...flashcards];
    startDueCardChecking();
    console.log("✅ Session tracking auto-started:", {
      isActiveStudySession,
      originalDeckSize: originalDeckCards.length,
      dueCardCheckingActive: !!dueCardCheckInterval
    });
  }

  // Update progress immediately
  updateProgress();

  // Hide performance buttons immediately for better UX
  $(".performance-buttons").removeClass("show");
  $(".keyboard-hints").hide();

  // Move to next card after a brief delay to allow feedback visibility
  setTimeout(() => {
    window.navigateCard("next");

    // Reset the card state for the next card (flip cards)
    $("#flashcard").removeClass("flipped");
    $(".performance-buttons").removeClass("show");
    $(".keyboard-hints").hide();
    
    // Reset legacy card state (for non-flip cards)
    $("#showAnswerBtn").show();
    $(".card-back").hide();
  }, 300); // Quick transition for responsive feel

  // Optional: Integrate with spaced repetition system if available
  if (typeof SpacedRepetition !== 'undefined' && window.spacedRepetitionInstance) {
    const cardId = card.id || `card_${currentCardIndex}`;
    try {
      console.log("🔄 Processing with SpacedRepetition.answerCard()...");
      window.spacedRepetitionInstance.answerCard(cardId, answer, responseTime);
      
      // Check state AFTER processing
      const updatedSpacedRepData = window.spacedRepetitionInstance.getCardData(cardId);
      console.log("🧠 AFTER Processing - Spaced Repetition State:", {
        cardId,
        state: updatedSpacedRepData?.state || "new",
        interval: updatedSpacedRepData?.interval || 0,
        repetitions: updatedSpacedRepData?.repetitions || 0,
        easeFactor: updatedSpacedRepData?.easeFactor || 2500,
        due: updatedSpacedRepData?.due ? new Date(updatedSpacedRepData.due).toLocaleString() : "never",
        nextReviewIn: updatedSpacedRepData?.due ? Math.round((updatedSpacedRepData.due - Date.now()) / 1000) + "s" : "never",
        isNew: !updatedSpacedRepData || updatedSpacedRepData.state === "new",
        isLearning: updatedSpacedRepData?.state === "learning",
        isReview: updatedSpacedRepData?.state === "review",
        willShowAgainSoon: updatedSpacedRepData?.due && (updatedSpacedRepData.due - Date.now()) < 300000 // within 5 minutes
      });

      // Special logging for learning cards
      if (updatedSpacedRepData?.state === "learning") {
        console.log("📚 LEARNING CARD DETECTED:", {
          learningStep: updatedSpacedRepData.learningStep || 0,
          willReappearIn: updatedSpacedRepData?.due ? Math.round((updatedSpacedRepData.due - Date.now()) / 1000) + " seconds" : "unknown",
          isWithinSession: updatedSpacedRepData?.due && (updatedSpacedRepData.due - Date.now()) < 300000 // 5 minutes
        });
      }

      // Check if this card should be added back to session soon
      if (updatedSpacedRepData?.due && (updatedSpacedRepData.due - Date.now()) < 300000) {
        console.log("⚠️ CARD WILL REAPPEAR SOON - Will be picked up by due card checker");
      }

    } catch (error) {
      console.error("❌ Spaced repetition integration error:", error);
    }
  } else {
    console.warn("⚠️ SpacedRepetition not available");
  }

  console.log("=" .repeat(80)); // Visual separator
}

// Show spaced repetition tooltip for new users
function showSpacedRepetitionTooltip() {
  const tooltip = $(`
    <div class="performance-tooltip">
      <div class="tooltip-header">
        <i class="fas fa-brain"></i>
        <h5>Smart Spaced Repetition</h5>
      </div>
      <div class="tooltip-content">
        <p>Rate how well you knew this card:</p>
        <ul class="tooltip-buttons">
          <li><span class="tooltip-button-demo again">Again</span> Completely forgot</li>
          <li><span class="tooltip-button-demo hard">Hard</span> Struggled to remember</li>
          <li><span class="tooltip-button-demo good">Good</span> Remembered correctly</li>
          <li><span class="tooltip-button-demo easy">Easy</span> Too easy</li>
        </ul>
        <p>This optimizes when you'll see cards again!</p>
      </div>
      <button class="tooltip-dismiss" onclick="dismissSpacedRepetitionTooltip()">Got it!</button>
    </div>
  `);

  $(".performance-buttons").append(tooltip);
  
  // Show tooltip with animation
  setTimeout(() => {
    tooltip.addClass("show");
  }, 100);

  // Auto-dismiss after 8 seconds
  setTimeout(() => {
    dismissSpacedRepetitionTooltip();
  }, 8000);
}

function dismissSpacedRepetitionTooltip() {
  $(".performance-tooltip").removeClass("show");
  setTimeout(() => {
    $(".performance-tooltip").remove();
  }, 300);
  localStorage.setItem('seenSpacedRepetitionTip', 'true');
}

// Make dismissSpacedRepetitionTooltip globally available
window.dismissSpacedRepetitionTooltip = dismissSpacedRepetitionTooltip;

// Anki-style session progress tracking
function updateProgress() {
  const totalCards = flashcards.length;
  const viewedCards = currentCardIndex + 1;
  const progress = (viewedCards / totalCards) * 100;

  // Update progress bar
  $("#progressBar").css("width", `${progress}%`);
  $("#progressText").text(`Card ${viewedCards}/${totalCards}`);

  // Calculate remaining cards in session (Anki-style)
  const remainingCards = totalCards - viewedCards;

     // Update or create session counter display
   let sessionCounter = $("#sessionCounter");
   if (sessionCounter.length === 0) {
     // Create the session counter if it doesn't exist
     // Hide it only in quiz mode, show it in flashcard mode
     const isQuizMode = window.location.pathname.includes('quiz.html');
     const displayStyle = isQuizMode ? 'display: none;' : '';
     
     $(".progress-info").after(`
       <div id="sessionCounter" class="session-counter" style="${displayStyle}">
         <span class="session-remaining">
           <i class="fas fa-cards"></i> 
           <span class="count">0</span> remaining in session
         </span>
       </div>
     `);
     sessionCounter = $("#sessionCounter");
   }

     // Initialize session completion flag if not exists
   if (typeof window.sessionCompleted === 'undefined') {
     window.sessionCompleted = false;
   }

     // Update the counter (only show in flashcard mode, not quiz mode)
   const isQuizMode = window.location.pathname.includes('quiz.html');
   
   if (remainingCards > 0) {
     sessionCounter.find(".count").text(remainingCards);
     if (!isQuizMode) {
       sessionCounter.show(); // Show in flashcard mode only
     }
   } else if (!window.sessionCompleted && currentCardIndex === totalCards - 1) {
     // Session complete - only show once AND only when on the last card
     window.sessionCompleted = true;
     sessionCounter.find(".session-remaining").html(`
       <i class="fas fa-check-circle"></i> 
       Session complete! All ${totalCards} cards reviewed
     `);
     sessionCounter.removeClass("session-counter").addClass("session-complete");
     // Auto-hide after 3 seconds
     setTimeout(() => {
       sessionCounter.fadeOut();
     }, 3000);
   }

  // Check if user has completed 100% of cards
  if (progress >= 100 && !sessionStorage.getItem("quizPromptShown")) {
    // showQuizPrompt(); // Removed - modal disabled
    sessionStorage.setItem("quizPromptShown", "true");
  }
}

// Update deck-level tags display
function updateDeckTags() {
  const container = document.getElementById("deckTagsContainer");
  const tagsList = document.getElementById("deckTagsList");
  
  if (!container || !tagsList || !flashcards || flashcards.length === 0) {
    if (container) container.style.display = "none";
    return;
  }

  // Aggregate and categorize tags from all flashcards
  const tagCategories = {
    subject: new Set(), // Main subject categories
    subcategory: new Set(), // Subject subcategories
    difficulty: new Set(), // Difficulty levels
    format: new Set(), // Content format types
    concept: new Map() // Key concepts with frequency
  };

  // Define tag category patterns
  const categoryPatterns = {
    subject: /^(science|mathematics|history|language|technology|arts)$/i,
    subcategory: /^(biology|chemistry|physics|astronomy|geology|environmental|algebra|calculus|geometry|statistics|trigonometry|discrete|ancient|medieval|modern|world|military|political|cultural|grammar|vocabulary|literature|writing|speaking|comprehension|programming|networking|ai|databases|web|mobile|finance|marketing|management|entrepreneurship|economics|business|visual|performing|music|design|architecture|digital)$/i,
    difficulty: /^(basic|intermediate|advanced)$/i,
    format: /^(definition|example|comparison|process)$/i
  };

  // Process tags from all flashcards
  flashcards.forEach(card => {
    if (card.tags && Array.isArray(card.tags)) {
      card.tags.forEach(tag => {
        // Categorize tag
        if (categoryPatterns.subject.test(tag)) {
          tagCategories.subject.add(tag);
        } else if (categoryPatterns.subcategory.test(tag)) {
          tagCategories.subcategory.add(tag);
        } else if (categoryPatterns.difficulty.test(tag)) {
          tagCategories.difficulty.add(tag);
        } else if (categoryPatterns.format.test(tag)) {
          tagCategories.format.add(tag);
        } else {
          // Track concept frequency
          const count = tagCategories.concept.get(tag) || 0;
          tagCategories.concept.set(tag, count + 1);
        }
      });
    }
  });

  // Sort concepts by frequency
  const sortedConcepts = Array.from(tagCategories.concept.entries())
    .sort(([,a], [,b]) => b - a)
    .slice(0, 3) // Take top 3 concepts
    .map(([tag]) => tag);

  // Create ordered tag array: Subject → Difficulty → Key Concepts
  const orderedTags = [];
  
  // Add only the primary subject (most frequent)
  if (tagCategories.subject.size > 0) {
    const subjectArray = Array.from(tagCategories.subject);
    orderedTags.push(subjectArray[0]); // Take only the first (most relevant) subject
  }
  
  // Add only one difficulty level (most frequent)
  if (tagCategories.difficulty.size > 0) {
    // Count difficulty occurrences across all cards to find the most common
    const difficultyCount = {};
    flashcards.forEach(card => {
      if (card.tags && Array.isArray(card.tags)) {
        card.tags.forEach(tag => {
          if (categoryPatterns.difficulty.test(tag)) {
            difficultyCount[tag] = (difficultyCount[tag] || 0) + 1;
          }
        });
      }
    });
    
    // Get the most frequent difficulty level
    const mostCommonDifficulty = Object.entries(difficultyCount)
      .sort(([,a], [,b]) => b - a)[0];
    
    if (mostCommonDifficulty) {
      orderedTags.push(mostCommonDifficulty[0]);
    }
  }
  
  // Add key concepts (limit to top 3)
  if (sortedConcepts.length > 0) {
    orderedTags.push(...sortedConcepts);
  }

  // Generate simple horizontal tag display
  const allTagsHTML = orderedTags.length > 0 ? 
    orderedTags.map(tag => `
      <span class="deck-tag" data-tag="${tag}">
        ${tag}
      </span>
    `).join('') : '';

  // Update the container
  if (allTagsHTML.trim()) {
    tagsList.innerHTML = allTagsHTML;
    container.style.display = "block";

    // Add click handlers for tags
    tagsList.querySelectorAll('.deck-tag').forEach(tag => {
      tag.addEventListener('click', () => {
        const tagValue = tag.dataset.tag;
        // Toggle active state
        tag.classList.toggle('active');
        // Dispatch event for tag filtering
        document.dispatchEvent(new CustomEvent('tagFilter', {
          detail: { tag: tagValue, active: tag.classList.contains('active') }
        }));
      });
    });
  } else {
    container.style.display = "none";
  }
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

<<<<<<< HEAD
// ... existing code ...

// Enhanced tag generation with more sophisticated analysis
function generateTagsFromContent(front, back) {
  const content = `${front} ${back}`.toLowerCase();
  const tags = new Set();
  
  // Academic subject categories with expanded keywords
  const subjectCategories = {
    'science': {
      keywords: ['atom', 'molecule', 'chemical', 'biology', 'physics', 'chemistry', 'reaction', 'element', 'compound', 'energy', 'force', 'cell', 'organism', 'evolution', 'genetic', 'quantum', 'nuclear', 'organic', 'inorganic', 'experiment', 'theory', 'hypothesis', 'research', 'data', 'analysis', 'observation', 'conclusion'],
      subcategories: ['biology', 'chemistry', 'physics', 'astronomy', 'geology', 'environmental']
    },
    'mathematics': {
      keywords: ['equation', 'formula', 'calculate', 'solve', 'theorem', 'geometry', 'algebra', 'number', 'fraction', 'decimal', 'function', 'derivative', 'integral', 'matrix', 'vector', 'statistics', 'probability', 'trigonometry', 'calculus', 'arithmetic', 'proof', 'logic', 'set', 'graph'],
      subcategories: ['algebra', 'calculus', 'geometry', 'statistics', 'trigonometry', 'discrete']
    },
    'history': {
      keywords: ['war', 'century', 'ancient', 'empire', 'revolution', 'king', 'queen', 'battle', 'treaty', 'civilization', 'dynasty', 'period', 'era', 'movement', 'reform', 'conquest', 'colonization', 'independence', 'democracy', 'monarchy', 'republic', 'federation', 'alliance'],
      subcategories: ['ancient', 'medieval', 'modern', 'world', 'military', 'political', 'cultural']
    },
    'language': {
      keywords: ['grammar', 'verb', 'noun', 'sentence', 'vocabulary', 'pronunciation', 'conjugation', 'plural', 'tense', 'adjective', 'adverb', 'preposition', 'conjunction', 'article', 'phrase', 'clause', 'idiom', 'metaphor', 'simile', 'rhetoric', 'literature', 'poetry', 'prose'],
      subcategories: ['grammar', 'vocabulary', 'literature', 'writing', 'speaking', 'comprehension']
    },
    'technology': {
      keywords: ['computer', 'software', 'algorithm', 'data', 'network', 'programming', 'digital', 'internet', 'database', 'code', 'application', 'system', 'hardware', 'interface', 'security', 'cloud', 'artificial', 'intelligence', 'machine', 'learning', 'blockchain', 'cybersecurity'],
      subcategories: ['programming', 'networking', 'ai', 'databases', 'web', 'mobile']
    },
    'business': {
      keywords: ['profit', 'revenue', 'market', 'customer', 'strategy', 'management', 'economics', 'finance', 'investment', 'business', 'company', 'organization', 'leadership', 'marketing', 'sales', 'accounting', 'entrepreneurship', 'startup', 'venture', 'capital'],
      subcategories: ['finance', 'marketing', 'management', 'entrepreneurship', 'economics']
    },
    'arts': {
      keywords: ['art', 'music', 'dance', 'theater', 'film', 'design', 'architecture', 'sculpture', 'painting', 'drawing', 'composition', 'performance', 'exhibition', 'gallery', 'museum', 'creative', 'aesthetic', 'style', 'technique', 'medium'],
      subcategories: ['visual', 'performing', 'music', 'design', 'architecture', 'digital']
    }
  };

  // Analyze content for subject categories
  let maxMatches = 0;
  let primarySubject = null;
  let subjectSubcategory = null;

  for (const [subject, data] of Object.entries(subjectCategories)) {
    const matches = data.keywords.filter(keyword => content.includes(keyword)).length;
    if (matches > maxMatches) {
      maxMatches = matches;
      primarySubject = subject;
      
      // Find most relevant subcategory
      const subcategoryMatches = data.subcategories.map(subcat => ({
        subcat,
        matches: content.split(/\s+/).filter(word => word.includes(subcat)).length
      }));
      subjectSubcategory = subcategoryMatches.sort((a, b) => b.matches - a.matches)[0]?.subcat;
    }
  }

  // Add primary subject and subcategory if found
  if (primarySubject) {
    tags.add(primarySubject);
    if (subjectSubcategory) {
      tags.add(subjectSubcategory);
    }
  }

  // Extract key concepts using NLP-like techniques
  const words = content.split(/\s+/);
  const stopWords = new Set(['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'about', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must', 'a', 'an', 'this', 'that', 'these', 'those', 'my', 'your', 'his', 'her', 'its', 'our', 'their']);
  
  // Find important terms (nouns and key phrases)
  const importantTerms = words
    .filter(word => 
      word.length > 3 && 
      !stopWords.has(word) &&
      /^[a-zA-Z]+$/.test(word) // Only pure words, no numbers or special chars
    )
    .map(word => word.toLowerCase());

  // Count term frequency
  const termFrequency = {};
  importantTerms.forEach(term => {
    termFrequency[term] = (termFrequency[term] || 0) + 1;
  });

  // Add top 2 most frequent terms as tags
  const topTerms = Object.entries(termFrequency)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 2)
    .map(([term]) => term);
  
  topTerms.forEach(term => tags.add(term));

  // Add difficulty level based on content analysis
  const wordCount = words.length;
  const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / wordCount;
  const hasComplexTerms = words.some(word => word.length > 12);
  const hasTechnicalTerms = Object.values(subjectCategories).some(data => 
    data.keywords.some(keyword => content.includes(keyword))
  );

  if (wordCount > 50 || avgWordLength > 8 || hasComplexTerms || hasTechnicalTerms) {
    tags.add('advanced');
  } else if (wordCount > 25 || avgWordLength > 6) {
    tags.add('intermediate');
  } else {
    tags.add('basic');
  }

  // Add format/type tags based on content structure
  if (content.includes('?') || content.includes('what is') || content.includes('define')) {
    tags.add('definition');
  }
  if (content.includes('example') || content.includes('instance') || content.includes('such as')) {
    tags.add('example');
  }
  if (content.includes('compare') || content.includes('versus') || content.includes('difference')) {
    tags.add('comparison');
  }
  if (content.includes('process') || content.includes('steps') || content.includes('procedure')) {
    tags.add('process');
  }

  // Convert Set to Array and limit to 5 most relevant tags
  return Array.from(tags).slice(0, 5);
}

// ... existing code ...



// ... existing code ...
=======
// Handle free trial button clicks
function handleFreeTrialClick(event) {
  event.preventDefault();
  // Show auth modal with signup tab
  showAuthModal("signup");
}

// Initialize free trial button event listeners
function initializeFreeTrialButtons() {
  // Get all free trial buttons
  const freeTrialButtons = document.querySelectorAll(
    'a[href="#input-section"], a[href="create-deck.html"], button[onclick*="create-deck.html"], .btn-primary[href*="create-deck"], .btn-primary[href="#input-section"]'
  );

  // Add event listeners to each button
  freeTrialButtons.forEach((button) => {
    // Remove any existing onclick handlers that might interfere
    if (button.onclick) {
      const originalOnclick = button.onclick;
      button.onclick = (event) => {
        // If user is not logged in, show signup modal
        if (!currentUser) {
          handleFreeTrialClick(event);
          return false;
        }
        // If user is logged in, proceed with original action
        return originalOnclick.call(button, event);
      };
    } else {
      // Add new event listener
      button.addEventListener("click", (event) => {
        // If user is not logged in, show signup modal
        if (!currentUser) {
          handleFreeTrialClick(event);
          return;
        }
        // If user is logged in, allow default behavior (navigation)
      });
    }
  });

  // Also handle specific buttons by their text content
  const textBasedButtons = document.querySelectorAll(
    ".btn-primary, .btn-secondary"
  );
  textBasedButtons.forEach((button) => {
    const buttonText = button.textContent.toLowerCase();
    if (
      buttonText.includes("create free") ||
      buttonText.includes("start creating free") ||
      buttonText.includes("get started free") ||
      buttonText.includes("free trial") ||
      buttonText.includes("start free")
    ) {
      // Remove any existing onclick handlers
      if (button.onclick) {
        const originalOnclick = button.onclick;
        button.onclick = (event) => {
          if (!currentUser) {
            handleFreeTrialClick(event);
            return false;
          }
          return originalOnclick.call(button, event);
        };
      } else {
        button.addEventListener("click", (event) => {
          if (!currentUser) {
            handleFreeTrialClick(event);
            return;
          }
        });
      }
    }
  });
}

// Initialize Google Auth Provider
const googleProvider = new GoogleAuthProvider();
>>>>>>> 9109d1b (Added unique twists markdown document)
