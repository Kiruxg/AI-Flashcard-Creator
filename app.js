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

  // Text form submission
  $("#textForm").on("submit", function (e) {
    e.preventDefault();
    const text = $("#textInput").val().trim();
    if (text) {
      processText(text);
    }
  });

  // Flashcard navigation
  function initializeFlashcardControls() {
    // Remove any existing event listeners first
    $("#prevBtn, #nextBtn").off("click");
    $("#shuffleBtn").off("click");
    $("#showAnswerBtn, #flipCard").off("click");
    $(".performance-buttons button").off("click");
    $(document).off("keydown.flashcard");

    // Keyboard navigation
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
            $('[data-performance="1"]').click();
          }
          break;
        case "2":
          if ($(".performance-buttons").is(":visible")) {
            $('[data-performance="3"]').click();
          }
          break;
        case "3":
          if ($(".performance-buttons").is(":visible")) {
            $('[data-performance="5"]').click();
          }
          break;
      }
    });

    // Navigation buttons
    $("#prevBtn").on("click", function (e) {
      e.preventDefault();
      navigateCard("prev");
    });

    $("#nextBtn").on("click", function (e) {
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

    // Show Answer button
    $("#showAnswerBtn, #flipCard").on("click", function (e) {
      e.preventDefault();
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
      }
    });

    // Performance buttons
    $(".performance-buttons button").on("click", async function (e) {
      e.preventDefault();
      const performance = parseInt($(this).data("performance"));
      const card = flashcards[currentCardIndex];

      // Update card metadata based on performance
      if (!card.metadata) {
        card.metadata = {};
      }
      card.metadata.markedAsUnfamiliar = performance < 3;

      // Record performance
      await saveStudyProgress(card.id, performance);
      spacedRepetition.calculateNextReview(card.id, performance);

      // Move to next card
      navigateCard("next");
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

    // Update navigation state
    $("#prevBtn").prop("disabled", currentCardIndex === 0);
    $("#nextBtn").prop("disabled", currentCardIndex === flashcards.length - 1);

    // Update counter
    $("#cardCounter").text(`${currentCardIndex + 1} / ${flashcards.length}`);

    // Update progress
    updateProgress();
  }

  function updateProgress() {
    const totalCards = flashcards.length;
    const markedCards = flashcards.filter(
      (card) => card.metadata?.markedAsUnfamiliar
    ).length;
    const progress = (markedCards / totalCards) * 100;

    $("#progressBar").css("width", `${progress}%`);
    $("#progressText").text(`${markedCards}/${totalCards} cards marked`);
  }

  // Flashcard flip
  $("#flashcard").on("click", function () {
    isFlipped = !isFlipped;
    $(this).toggleClass("flipped");
  });

  // Update file handling functions
  function validateAndProcessFile(file) {
    // Check file type using native File API
    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain"
    ];

    // Get file extension
    const extension = file.name.split('.').pop().toLowerCase();
    const mimeType = file.type;

    // Check if either the MIME type or extension is allowed
    const isValidType = allowedTypes.includes(mimeType) || 
                       ['pdf', 'doc', 'docx', 'txt'].includes(extension);

    if (!isValidType) {
      showErrorMessage("Please upload a PDF, DOC, DOCX, or TXT file");
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

    const cardType = $("#cardType").val();
    if (!cardType) {
      showErrorMessage("Please select a card type");
      return;
    }

    const cardCount = parseInt($("#cardCount").val());
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
      const text = await handleFile(window.uploadedFile);
      if (!text) {
        throw new Error("No text content could be extracted from the file");
      }

      // Generate flashcards
      await processText(text);

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
  async function processText(text) {
    if (isGenerating) return;
    isGenerating = true;

    try {
      const cardType = $("#cardType").val();
      const cardCount = parseInt($("#cardCount").val());

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
        const error = await response.json();
        throw new Error(
          error.details || error.message || "Failed to generate flashcards"
        );
      }

      const data = await response.json();
      flashcards = data.flashcards;

      // Update UI with flashcards
      updateFlashcardViewer(flashcards);

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
      loadingIndicator.style.display = "flex";
      loadingIndicator.style.opacity = "1";
    } else {
      const elapsedTime = Date.now() - loadingStartTime;
      const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsedTime);

      // Add fade out animation
      loadingIndicator.style.opacity = "0";

      // Wait for the minimum time and animation to complete before hiding
      setTimeout(() => {
        loadingIndicator.style.display = "none";
      }, remainingTime + 300); // Add 300ms for fade out animation
    }
  }

  // Update the loading indicator styles
  document.head.insertAdjacentHTML(
    "beforeend",
    `
    <style>
      #loadingIndicator {
        transition: opacity 0.3s ease;
        opacity: 0;
      }
    </style>
  `
  );

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
    const isPremium = subscriptionManager.isPremium();
    
    if (isPremium) {
      $(".premium-feature").removeClass("locked");
      $("#premiumBadge").show();
      $(".premium-option").show();
    } else {
      $(".premium-feature").addClass("locked");
      $("#premiumBadge").hide();
      $(".premium-option").hide();
    }
    updateCardCountOptions();
  }

  // Update card count options based on premium status
  function updateCardCountOptions() {
    const isPremium = subscriptionManager.isPremium();
    const $cardCountSelects = $("#cardCount, #cameraCardCount, #fileCardCount");
    
    $cardCountSelects.each(function () {
      const $select = $(this);
      const $premiumOptions = $select.find(".premium-option");
      
      if (isPremium) {
        // Enable and show premium options for premium users
        $premiumOptions.prop('disabled', false).show();
      } else {
        // Disable and hide premium options for non-premium users
        $premiumOptions.prop('disabled', true).hide();
        
        // Reset to max free tier value if premium option was selected
        const currentValue = parseInt($select.val());
        if (currentValue > 10) {
          $select.val("10");
        }
        
        // Remove any premium options from the select element
        $premiumOptions.detach();
      }
    });
  }

  // Add event listener to prevent selecting disabled options
  $(document).on('change', '#cardCount, #cameraCardCount, #fileCardCount', function() {
    const $select = $(this);
    const selectedValue = parseInt($select.val());
    const isPremium = subscriptionManager.isPremium();
    
    if (!isPremium && selectedValue > 10) {
      $select.val("10");
      showErrorMessage("Free users can only generate up to 10 cards. Please upgrade to premium for more options.");
    }
  });

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
    if (!tabButtons.length) {
      console.warn("No tab buttons found");
      return;
    }

    tabButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const tab = button.dataset.tab;
        if (!tab) {
          console.warn("Tab button missing data-tab attribute");
          return;
        }

        // Map tab names to their corresponding IDs
        const tabIdMap = {
          'text': 'textTab',
          'camera': 'cameraUploadTab',
          'file': 'fileUploadTab'
        };

        const targetTabId = tabIdMap[tab];
        if (!targetTabId) {
          console.warn(`Unknown tab type: ${tab}`);
          return;
        }

        // Update tab buttons
        tabButtons.forEach((btn) => {
          if (btn) btn.classList.remove("active");
        });
        button.classList.add("active");

        // Update tab content
        const tabContents = document.querySelectorAll(".input-tab-content");
        tabContents.forEach((content) => {
          if (content) content.classList.remove("active");
        });

        const targetTab = document.getElementById(targetTabId);
        if (targetTab) {
          targetTab.classList.add("active");
        } else {
          console.warn(`Tab content element #${targetTabId} not found`);
        }

        // Stop camera when switching away from camera tab
        if (tab !== "camera" && cameraStream) {
          stopCamera();
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

    // Initialize flashcard controls
    initializeFlashcardControls();

    // Initialize session recovery
    initializeSessionRecovery();

    // Initialize mobile menu
    initializeMobileMenu();

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

    // Initialize camera functionality
    initializeCamera();

    // Stop camera when leaving page
    window.addEventListener("beforeunload", () => {
      stopCamera();
    });
  });

  // Update camera initialization to remove duplicate tab switching code
  function initializeCamera() {
    const startCameraBtn = document.getElementById("startCameraBtn");
    const captureBtn = document.getElementById("captureBtn");
    const retakeBtn = document.getElementById("retakeBtn");
    const processImageBtn = document.getElementById("processImageBtn");
    const cameraFeed = document.getElementById("cameraFeed");
    const cameraCanvas = document.getElementById("cameraCanvas");
    const cameraStatus = document.getElementById("cameraStatus");
    const capturedImage = document.getElementById("capturedImage");
    const capturedImageContainer = document.querySelector(".captured-image");

    // Start camera
    startCameraBtn.addEventListener("click", async () => {
      try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        cameraFeed.srcObject = cameraStream;
        startCameraBtn.disabled = true;
        captureBtn.disabled = false;
        cameraStatus.textContent = "Camera started";
        cameraStatus.style.color = "var(--success-color)";
      } catch (error) {
        console.error("Error accessing camera:", error);
        cameraStatus.textContent = "Error accessing camera: " + error.message;
        cameraStatus.style.color = "var(--error-color)";
      }
    });

    // ... rest of the camera initialization code ...
  }

  // Study Session Management
  let currentStudySession = null;

  function initializeStudySession(deck) {
    currentStudySession = {
      deck,
      currentCardIndex: 0,
      cards: [...deck.cards],
      sessionStats: {
        correct: 0,
        incorrect: 0,
        total: deck.cards.length,
        startTime: Date.now(),
        lastCardTime: Date.now(),
        cardTimes: [], // Array to store time spent on each card
        streak: 0, // Current streak of correct answers
        longestStreak: 0,
        accuracy: 0,
        cardsByDifficulty: {
          easy: 0,
          medium: 0,
          hard: 0,
        },
      },
      studyTimer: {
        startTime: Date.now(),
        pausedTime: 0,
        isPaused: false,
        totalPausedTime: 0,
      },
    };

    // Start the study timer
    startStudyTimer();

    // Show study interface
    document.querySelector(".deck-management").style.display = "none";
    document.querySelector(".study-interface").style.display = "block";
    document.querySelector(".study-history").style.display = "none";

    // Update the study interface HTML
    const studyInterface = document.querySelector(".study-interface");
    studyInterface.innerHTML = `
        <div class="study-header">
            <h2>Study Session</h2>
            <div class="study-stats">
                <span class="stat-item">
                    <i class="fas fa-chart-line"></i>
                    <span class="stat-value" id="studyAccuracy">0%</span>
                    <span class="stat-label">Accuracy</span>
                </span>
                <span class="stat-item">
                    <i class="fas fa-fire"></i>
                    <span class="stat-value" id="currentStreak">0</span>
                    <span class="stat-label">Current Streak</span>
                </span>
                <span class="stat-item">
                    <i class="fas fa-clock"></i>
                    <span class="stat-value" id="studyTime">00:00</span>
                    <span class="stat-label">Study Time</span>
                </span>
                <span class="stat-item">
                    <i class="fas fa-tachometer-alt"></i>
                    <span class="stat-value" id="cardsPerMinute">0</span>
                    <span class="stat-label">Cards/Min</span>
                </span>
            </div>
        </div>

        <div class="study-card">
            <div class="card-content">
                <div class="card-front"></div>
                <div class="card-back" style="display: none"></div>
            </div>
            <div class="card-controls">
                <button class="btn btn-secondary" id="prevBtn" disabled>
                    <i class="fas fa-arrow-left"></i> Previous
                </button>
                <button class="btn btn-primary" id="flipCard">
                    <i class="fas fa-sync-alt"></i> Show Answer
                </button>
                <button class="btn btn-secondary" id="pauseBtn">
                    <i class="fas fa-pause"></i> Pause
                </button>
                <button class="btn btn-secondary" id="nextBtn" disabled>
                    Next <i class="fas fa-arrow-right"></i>
                </button>
                <div class="performance-buttons" style="display: none">
                    <button class="btn btn-danger" data-performance="1">
                        <i class="fas fa-times"></i> Don't Know
                    </button>
                    <button class="btn btn-warning" data-performance="3">
                        <i class="fas fa-question"></i> Hard
                    </button>
                    <button class="btn btn-success" data-performance="5">
                        <i class="fas fa-check"></i> Know
                    </button>
                </div>
            </div>
        </div>

        <div class="study-progress">
            <div class="progress-container">
                <div class="progress-bar" style="width: 0%"></div>
            </div>
            <div class="progress-stats">
                <span id="cardsReviewed">0</span> / <span id="totalCards">0</span> cards
                <span class="difficulty-stats">
                    <span class="difficulty easy"><i class="fas fa-circle"></i> Easy: <span id="easyCount">0</span></span>
                    <span class="difficulty medium"><i class="fas fa-circle"></i> Medium: <span id="mediumCount">0</span></span>
                    <span class="difficulty hard"><i class="fas fa-circle"></i> Hard: <span id="hardCount">0</span></span>
                </span>
            </div>
        </div>

        <div class="study-complete" style="display: none">
            <h3>Study Session Complete!</h3>
            <div class="session-stats">
                <div class="stat-card">
                    <i class="fas fa-check-circle"></i>
                    <span class="stat-value" id="sessionCorrect">0</span>
                    <span class="stat-label">Correct</span>
                </div>
                <div class="stat-card">
                    <i class="fas fa-times-circle"></i>
                    <span class="stat-value" id="sessionIncorrect">0</span>
                    <span class="stat-label">Incorrect</span>
                </div>
                <div class="stat-card">
                    <i class="fas fa-percentage"></i>
                    <span class="stat-value" id="sessionAccuracy">0%</span>
                    <span class="stat-label">Accuracy</span>
                </div>
                <div class="stat-card">
                    <i class="fas fa-clock"></i>
                    <span class="stat-value" id="sessionDuration">00:00</span>
                    <span class="stat-label">Duration</span>
                </div>
                <div class="stat-card">
                    <i class="fas fa-fire"></i>
                    <span class="stat-value" id="sessionStreak">0</span>
                    <span class="stat-label">Longest Streak</span>
                </div>
                <div class="stat-card">
                    <i class="fas fa-tachometer-alt"></i>
                    <span class="stat-value" id="sessionCardsPerMinute">0</span>
                    <span class="stat-label">Cards/Min</span>
                </div>
            </div>
            <div class="session-actions">
                <button class="btn btn-primary" id="restartSession">
                    <i class="fas fa-redo"></i> Restart Session
                </button>
                <button class="btn btn-secondary" id="endSession">
                    <i class="fas fa-home"></i> Return to Decks
                </button>
            </div>
        </div>
    `;

    // Initialize event listeners
    initializeStudyEventListeners();
    initializeStudyTimer();

    // Initialize study stats
    updateStudyStats();
    showNextCard();
  }

  // Add study timer functions
  function startStudyTimer() {
    if (!currentStudySession) return;

    currentStudySession.studyTimer.startTime = Date.now();
    currentStudySession.studyTimer.isPaused = false;
    updateStudyTimer();
  }

  function pauseStudyTimer() {
    if (!currentStudySession || currentStudySession.studyTimer.isPaused) return;

    currentStudySession.studyTimer.pausedTime = Date.now();
    currentStudySession.studyTimer.isPaused = true;
  }

  function resumeStudyTimer() {
    if (!currentStudySession || !currentStudySession.studyTimer.isPaused)
      return;

    currentStudySession.studyTimer.totalPausedTime +=
      Date.now() - currentStudySession.studyTimer.pausedTime;
    currentStudySession.studyTimer.isPaused = false;
    updateStudyTimer();
  }

  function updateStudyTimer() {
    if (!currentStudySession || currentStudySession.studyTimer.isPaused) return;

    const elapsed =
      Date.now() -
      currentStudySession.studyTimer.startTime -
      currentStudySession.studyTimer.totalPausedTime;
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);

    document.querySelector("#studyTime").textContent = `${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

    // Update cards per minute
    const cardsReviewed = currentStudySession.currentCardIndex;
    const minutesStudied = Math.max(1, minutes + seconds / 60);
    const cardsPerMinute = (cardsReviewed / minutesStudied).toFixed(1);
    document.querySelector("#cardsPerMinute").textContent = cardsPerMinute;

    // Schedule next update
    setTimeout(updateStudyTimer, 1000);
  }

  function initializeStudyTimer() {
    const pauseBtn = document.querySelector("#pauseBtn");
    pauseBtn.addEventListener("click", () => {
      if (currentStudySession.studyTimer.isPaused) {
        resumeStudyTimer();
        pauseBtn.innerHTML = '<i class="fas fa-pause"></i> Pause';
      } else {
        pauseStudyTimer();
        pauseBtn.innerHTML = '<i class="fas fa-play"></i> Resume';
      }
    });
  }

  function initializeStudyEventListeners() {
    // Previous button
    document.querySelector("#prevBtn").addEventListener("click", () => {
      if (currentStudySession.currentCardIndex > 0) {
        currentStudySession.currentCardIndex--;
        showNextCard();
      }
    });

    // Next button
    document.querySelector("#nextBtn").addEventListener("click", () => {
      if (
        currentStudySession.currentCardIndex <
        currentStudySession.cards.length - 1
      ) {
        currentStudySession.currentCardIndex++;
        showNextCard();
      }
    });

    // Shuffle button
    document.querySelector("#shuffleBtn").addEventListener("click", () => {
      // Fisher-Yates shuffle algorithm
      for (let i = currentStudySession.cards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [currentStudySession.cards[i], currentStudySession.cards[j]] = [
          currentStudySession.cards[j],
          currentStudySession.cards[i],
        ];
      }
      currentStudySession.currentCardIndex = 0;
      showNextCard();
    });

    // Performance buttons (Know/Don't Know)
    document
      .querySelectorAll(".performance-buttons button")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const performance = parseInt(button.dataset.performance);
          recordCardPerformance(performance);
        });
      });

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
      if (!currentStudySession) return;

      switch (e.key) {
        case "ArrowLeft":
          if (currentStudySession.currentCardIndex > 0) {
            currentStudySession.currentCardIndex--;
            showNextCard();
          }
          break;
        case "ArrowRight":
          if (
            currentStudySession.currentCardIndex <
            currentStudySession.cards.length - 1
          ) {
            currentStudySession.currentCardIndex++;
            showNextCard();
          }
          break;
        case " ": // Space bar
          e.preventDefault();
          const flipButton = document.querySelector("#flipCard");
          if (flipButton.style.display !== "none") {
            flipButton.click();
          } else {
            document.querySelector('[data-performance="5"]').click(); // Mark as "I know it!"
          }
          break;
        case "1":
          if (
            document.querySelector(".performance-buttons").style.display !==
            "none"
          ) {
            document.querySelector('[data-performance="1"]').click(); // Mark as "Unfamiliar"
          }
          break;
        case "r":
          document.querySelector("#shuffleBtn").click(); // Shuffle cards
          break;
      }
    });
  }

  function showNextCard() {
    const { currentCardIndex, cards } = currentStudySession;
    if (currentCardIndex >= cards.length) {
      endStudySession();
      return;
    }

    const card = cards[currentCardIndex];
    document.querySelector(".card-front").textContent = card.front;
    document.querySelector(".card-back").textContent = card.back;
    document.querySelector(".card-back").style.display = "none";
    document.querySelector(".performance-buttons").style.display = "none";
    document.querySelector("#flipCard").style.display = "block";

    // Update navigation buttons
    document.querySelector("#prevBtn").disabled = currentCardIndex === 0;
    document.querySelector("#nextBtn").disabled =
      currentCardIndex === cards.length - 1;

    // Update progress
    const progress = ((currentCardIndex + 1) / cards.length) * 100;
    document.querySelector(".progress-bar").style.width = `${progress}%`;
    document.querySelector("#cardsReviewed").textContent = currentCardIndex + 1;
    document.querySelector("#totalCards").textContent = cards.length;
  }

  function recordCardPerformance(performance) {
    const { currentCardIndex, cards, sessionStats } = currentStudySession;
    const card = cards[currentCardIndex];

    // Record time spent on this card
    const timeSpent = Date.now() - sessionStats.lastCardTime;
    sessionStats.cardTimes.push(timeSpent);
    sessionStats.lastCardTime = Date.now();

    // Update session stats
    if (performance >= 4) {
      sessionStats.correct++;
      sessionStats.streak++;
      sessionStats.cardsByDifficulty.easy++;
    } else if (performance >= 2) {
      sessionStats.incorrect++;
      sessionStats.streak = 0;
      sessionStats.cardsByDifficulty.medium++;
    } else {
      sessionStats.incorrect++;
      sessionStats.streak = 0;
      sessionStats.cardsByDifficulty.hard++;
    }

    // Update longest streak
    sessionStats.longestStreak = Math.max(
      sessionStats.longestStreak,
      sessionStats.streak
    );

    // Update accuracy
    sessionStats.accuracy = Math.round(
      (sessionStats.correct / (sessionStats.correct + sessionStats.incorrect)) *
        100
    );

    // Update UI
    document.querySelector("#currentStreak").textContent = sessionStats.streak;
    document.querySelector(
      "#studyAccuracy"
    ).textContent = `${sessionStats.accuracy}%`;
    document.querySelector("#easyCount").textContent =
      sessionStats.cardsByDifficulty.easy;
    document.querySelector("#mediumCount").textContent =
      sessionStats.cardsByDifficulty.medium;
    document.querySelector("#hardCount").textContent =
      sessionStats.cardsByDifficulty.hard;

    // Update spaced repetition data
    if (
      spacedRepetition &&
      typeof spacedRepetition.calculateNextReview === "function"
    ) {
      const nextReview = spacedRepetition.calculateNextReview(
        card.id,
        performance
      );
      if (currentUser) {
        saveStudyProgress(card.id, performance);
      }
    }

    // Move to next card
    currentStudySession.currentCardIndex++;
    showNextCard();

    // Update Study Now button
    updateStudyNowButton();
  }

  function endStudySession() {
    const { sessionStats, studyTimer } = currentStudySession;
    const duration = Math.round(
      (Date.now() - studyTimer.startTime - studyTimer.totalPausedTime) / 1000
    );

    // Update session complete stats
    document.querySelector("#sessionCorrect").textContent =
      sessionStats.correct;
    document.querySelector("#sessionIncorrect").textContent =
      sessionStats.incorrect;
    document.querySelector(
      "#sessionAccuracy"
    ).textContent = `${sessionStats.accuracy}%`;
    document.querySelector("#sessionStreak").textContent =
      sessionStats.longestStreak;

    // Format duration
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    document.querySelector("#sessionDuration").textContent = `${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

    // Calculate and display cards per minute
    const cardsPerMinute =
      (sessionStats.correct + sessionStats.incorrect) /
      Math.max(1, duration / 60).toFixed(1);
    document.querySelector("#sessionCardsPerMinute").textContent =
      cardsPerMinute;

    // Show completion screen
    document.querySelector(".study-card").style.display = "none";
    document.querySelector(".study-progress").style.display = "none";
    document.querySelector(".study-complete").style.display = "block";

    // Save session data
    if (currentUser) {
      saveStudySessionData();
    }

    // Update overall stats
    updateStudyStats();
  }

  async function saveStudySessionData() {
    if (!currentUser || !currentStudySession) return;

    try {
      const sessionRef = doc(
        collection(db, "users", currentUser.uid, "studySessions")
      );
      const sessionData = {
        deckId: currentStudySession.deck.id,
        deckName: currentStudySession.deck.name,
        startTime: currentStudySession.studyTimer.startTime,
        duration:
          Date.now() -
          currentStudySession.studyTimer.startTime -
          currentStudySession.studyTimer.totalPausedTime,
        stats: currentStudySession.sessionStats,
        cardsStudied: currentStudySession.cards.length,
        userId: currentUser.uid,
        timestamp: new Date(),
      };

      await setDoc(sessionRef, sessionData);
    } catch (error) {
      console.error("Error saving study session:", error);
    }
  }

  function updateStudyNowButton() {
    const $studyNowBtn = $("#studyNowBtn");
    const $dueCount = $studyNowBtn.find(".due-count");
    const stats = spacedRepetition.getStudyStats();

    if (stats.cardsDue > 0) {
      $studyNowBtn.show();
      $dueCount.text(`${stats.cardsDue} due`);
    } else {
      $studyNowBtn.hide();
    }
  }

  function updateStudyStats() {
    const stats = spacedRepetition.getStudyStats();
    document.querySelector("#studyAccuracy").textContent = `${stats.accuracy}%`;
    document.querySelector("#studyStreak").textContent = stats.studyStreak;
    document.querySelector("#cardsRemaining").textContent = stats.cardsDue;
  }

  function showStudyHistory() {
    document.querySelector(".deck-management").style.display = "none";
    document.querySelector(".study-interface").style.display = "none";
    document.querySelector(".study-history").style.display = "block";

    const stats = spacedRepetition.getStudyStats();
    const history = spacedRepetition.getStudyHistory();
    const difficulty = spacedRepetition.getDifficultyDistribution();

    // Update overall stats
    document.querySelector("#totalReviews").textContent = stats.totalReviews;
    document.querySelector(
      "#overallAccuracy"
    ).textContent = `${stats.accuracy}%`;
    document.querySelector("#longestStreak").textContent = stats.studyStreak;

    // Create study history chart
    const ctx = document.querySelector("#studyHistoryChart").getContext("2d");
    new Chart(ctx, {
      type: "line",
      data: {
        labels: history.map((day) => day.date.toLocaleDateString()),
        datasets: [
          {
            label: "Cards Reviewed",
            data: history.map((day) => day.reviews),
            borderColor: "rgb(75, 192, 192)",
            tension: 0.1,
          },
          {
            label: "Accuracy",
            data: history.map((day) =>
              day.reviews > 0 ? (day.correct / day.reviews) * 100 : 0
            ),
            borderColor: "rgb(255, 99, 132)",
            tension: 0.1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
          },
        },
      },
    });

    // Create difficulty distribution chart
    const diffCtx = document.querySelector("#difficultyChart").getContext("2d");
    new Chart(diffCtx, {
      type: "doughnut",
      data: {
        labels: ["Easy", "Medium", "Hard"],
        datasets: [
          {
            data: [difficulty.easy, difficulty.medium, difficulty.hard],
            backgroundColor: [
              "rgb(75, 192, 192)",
              "rgb(255, 205, 86)",
              "rgb(255, 99, 132)",
            ],
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
      },
    });
  }

  // Event Listeners
  document.addEventListener("DOMContentLoaded", () => {
    // ... existing event listeners ...

    // Study session event listeners
    document.querySelector("#flipCard").addEventListener("click", flipCard);
    document
      .querySelectorAll(".performance-buttons button")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const performance = parseInt(button.dataset.performance);
          recordCardPerformance(performance);
        });
      });

    document.querySelector("#restartSession").addEventListener("click", () => {
      if (currentStudySession) {
        currentStudySession.currentCardIndex = 0;
        currentStudySession.sessionStats = {
          correct: 0,
          incorrect: 0,
          total: currentStudySession.cards.length,
        };
        document.querySelector(".study-card").style.display = "block";
        document.querySelector(".study-progress").style.display = "block";
        document.querySelector(".study-complete").style.display = "none";
        showNextCard();
      }
    });

    document.querySelector("#endSession").addEventListener("click", () => {
      document.querySelector(".deck-management").style.display = "block";
      document.querySelector(".study-interface").style.display = "none";
      document.querySelector(".study-history").style.display = "none";
      currentStudySession = null;
    });

    // Add study button to deck cards
    document.querySelector(".saved-decks").addEventListener("click", (e) => {
      if (e.target.matches(".study-deck")) {
        const deckId = e.target.closest(".deck-card").dataset.deckId;
        const deck =
          currentStudySession?.deck.id === deckId
            ? currentStudySession.deck
            : deckManager.getDeck(deckId);

        if (deck) {
          initializeStudySession(deck);
        }
      }
    });
  });

  // Add file handling initialization function
  function initializeFileHandling() {
    const dropzone = document.getElementById("dropzone");
    const fileInput = document.getElementById("fileInput");

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

  // Add reset function for new file upload
  function resetGenerationUI() {
    window.uploadedFile = null;
    $("#fileInput").show();
    $("#dropzone").show();
    $("#cardTypeSelection").hide();
    $("#textInput").val("");
    $("#cardType").val("");
    $("#cardCount").val("10");
  }

  // Add click handler for new file upload with confirmation
  $("#newFileBtn").on("click", function () {
    // Only show confirmation if there are flashcards or a file is uploaded
    if (flashcards.length > 0 || window.uploadedFile) {
      if (
        confirm(
          "Are you sure you want to upload a new file? This will clear your current flashcards."
        )
      ) {
        resetGenerationUI();
      }
    } else {
      resetGenerationUI();
    }
  });

  function updateFlashcardViewer(flashcards) {
    if (!flashcards || flashcards.length === 0) {
      showFlashcardViewer(false);
      updateStudyNowButton(); // Update Study Now button
      return;
    }

    // Reset card state
    currentCardIndex = 0;
    isFlipped = false;

    // Update card content
    const card = flashcards[currentCardIndex];
    $("#frontText").text(card.front);
    $("#backText").text(card.back);

    // Reset card state
    $(".card-back").hide();
    $("#showAnswerBtn").show();
    $(".performance-buttons").hide();

    // Update navigation state
    $("#prevBtn").prop("disabled", currentCardIndex === 0);
    $("#nextBtn").prop("disabled", currentCardIndex === flashcards.length - 1);

    // Update counter
    $("#cardCounter").text(`${currentCardIndex + 1} / ${flashcards.length}`);

    // Update progress and Study Now button
    updateProgress();
    updateStudyNowButton();

    // Show the viewer
    showFlashcardViewer(true);
  }

  function updateStudyNowButton() {
    const $studyNowBtn = $("#studyNowBtn");
    const $dueCount = $studyNowBtn.find(".due-count");
    const stats = spacedRepetition.getStudyStats();

    if (stats.cardsDue > 0) {
      $studyNowBtn.show();
      $dueCount.text(`${stats.cardsDue} due`);
    } else {
      $studyNowBtn.hide();
    }
  }

  // Camera and OCR handling
  let cameraStream = null;
  let isProcessing = false;

  // Initialize camera functionality
  function initializeCamera() {
    const startCameraBtn = document.getElementById("startCameraBtn");
    const captureBtn = document.getElementById("captureBtn");
    const retakeBtn = document.getElementById("retakeBtn");
    const processImageBtn = document.getElementById("processImageBtn");
    const cameraFeed = document.getElementById("cameraFeed");
    const cameraCanvas = document.getElementById("cameraCanvas");
    const cameraStatus = document.getElementById("cameraStatus");
    const capturedImage = document.getElementById("capturedImage");
    const capturedImageContainer = document.querySelector(".captured-image");

    // Tab switching
    document.querySelectorAll(".input-tabs .tab-btn").forEach((button) => {
      button.addEventListener("click", () => {
        const tab = button.dataset.tab;
        document
          .querySelectorAll(".input-tabs .tab-btn")
          .forEach((btn) => btn.classList.remove("active"));
        document
          .querySelectorAll(".input-tab-content")
          .forEach((content) => content.classList.remove("active"));
        button.classList.add("active");
        document.getElementById(`${tab}Tab`).classList.add("active");

        // Stop camera when switching away from camera tab
        if (tab !== "camera" && cameraStream) {
          stopCamera();
        }
      });
    });

    // Start camera
    startCameraBtn.addEventListener("click", async () => {
      try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        cameraFeed.srcObject = cameraStream;
        startCameraBtn.disabled = true;
        captureBtn.disabled = false;
        cameraStatus.textContent = "Camera started";
        cameraStatus.style.color = "var(--success-color)";
      } catch (error) {
        console.error("Error accessing camera:", error);
        cameraStatus.textContent = "Error accessing camera: " + error.message;
        cameraStatus.style.color = "var(--error-color)";
      }
    });

    // Capture image
    captureBtn.addEventListener("click", () => {
      if (!cameraStream) return;

      const context = cameraCanvas.getContext("2d");
      cameraCanvas.width = cameraFeed.videoWidth;
      cameraCanvas.height = cameraFeed.videoHeight;
      context.drawImage(cameraFeed, 0, 0);

      // Convert canvas to image
      const imageData = cameraCanvas.toDataURL("image/jpeg", 0.8);
      capturedImage.src = imageData;
      capturedImageContainer.style.display = "block";
      cameraFeed.style.display = "none";
      captureBtn.style.display = "none";
      retakeBtn.style.display = "inline-block";
      processImageBtn.style.display = "inline-block";
    });

    // Retake photo
    retakeBtn.addEventListener("click", () => {
      capturedImageContainer.style.display = "none";
      cameraFeed.style.display = "block";
      captureBtn.style.display = "inline-block";
      retakeBtn.style.display = "none";
      processImageBtn.style.display = "none";
    });

    // Process image
    processImageBtn.addEventListener("click", async () => {
      if (isProcessing) return;
      isProcessing = true;

      try {
        showLoading(true);
        updateLoadingMessage("Processing handwritten notes...");

        // Get the image data
        const imageData = capturedImage.src;

        // Send to server for OCR processing
        const response = await fetch(
          "http://localhost:12345/api/process-handwriting",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              image: imageData,
              userId: currentUser?.uid,
              isPremium: subscriptionManager.isPremium(),
            }),
          }
        );

        if (!response.ok) {
          throw new Error("Failed to process image");
        }

        const data = await response.json();

        // Process the extracted text
        if (data.text) {
          // Pre-fill the text input
          document.getElementById("textInput").value = data.text;

          // Switch to text tab
          document.querySelector('[data-tab="text"]').click();

          showSuccessMessage(
            "Notes processed successfully! Review and generate flashcards."
          );
        } else {
          throw new Error("No text could be extracted from the image");
        }
      } catch (error) {
        console.error("Error processing image:", error);
        showErrorMessage("Failed to process image: " + error.message);
      } finally {
        isProcessing = false;
        showLoading(false);
      }
    });
  }

  // Stop camera
  function stopCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      cameraStream = null;
    }

    const cameraFeed = document.getElementById("cameraFeed");
    const startCameraBtn = document.getElementById("startCameraBtn");
    const captureBtn = document.getElementById("captureBtn");
    const cameraStatus = document.getElementById("cameraStatus");

    cameraFeed.srcObject = null;
    startCameraBtn.disabled = false;
    captureBtn.disabled = true;
    cameraStatus.textContent = "Camera not started";
    cameraStatus.style.color = "var(--text-secondary)";
  }

  // Add touch gesture support for camera
  function initializeCameraGestures() {
    const cameraFeed = document.getElementById("cameraFeed");
    const captureBtn = document.getElementById("captureBtn");
    let touchStartY = 0;
    let touchEndY = 0;
    const SWIPE_THRESHOLD = 100;

    // Add flash element
    const flash = document.createElement("div");
    flash.className = "camera-flash";
    document.body.appendChild(flash);

    // Add gesture hint
    const hint = document.createElement("div");
    hint.className = "camera-gesture-hint";
    hint.textContent = "Swipe up to capture";
    cameraFeed.parentElement.appendChild(hint);

    // Handle touch events for swipe to capture
    cameraFeed.addEventListener(
      "touchstart",
      (e) => {
        touchStartY = e.touches[0].clientY;
      },
      { passive: true }
    );

    cameraFeed.addEventListener(
      "touchmove",
      (e) => {
        touchEndY = e.touches[0].clientY;
      },
      { passive: true }
    );

    cameraFeed.addEventListener(
      "touchend",
      () => {
        const swipeDistance = touchStartY - touchEndY;
        if (swipeDistance > SWIPE_THRESHOLD && !isProcessing) {
          // Trigger capture
          captureBtn.click();
          // Show flash animation
          flash.classList.add("active");
          setTimeout(() => flash.classList.remove("active"), 300);
        }
      },
      { passive: true }
    );

    // Double tap to switch camera
    let lastTap = 0;
    cameraFeed.addEventListener(
      "touchend",
      (e) => {
        const currentTime = new Date().getTime();
        const tapLength = currentTime - lastTap;
        if (tapLength < 300 && tapLength > 0) {
          // Double tap detected - switch camera
          switchCamera();
        }
        lastTap = currentTime;
      },
      { passive: true }
    );
  }

  // Switch between front and back camera
  async function switchCamera() {
    if (!cameraStream) return;

    const currentFacingMode = cameraStream
      .getVideoTracks()[0]
      .getSettings().facingMode;
    const newFacingMode = currentFacingMode === "user" ? "environment" : "user";

    try {
      // Stop current stream
      cameraStream.getTracks().forEach((track) => track.stop());

      // Get new stream
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: newFacingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });

      // Update video element
      const cameraFeed = document.getElementById("cameraFeed");
      cameraFeed.srcObject = cameraStream;
    } catch (error) {
      console.error("Error switching camera:", error);
      showErrorMessage("Failed to switch camera");
    }
  }

  // Update camera initialization
  function initializeCamera() {
    // ... existing camera initialization code ...

    // Initialize touch gestures
    initializeCameraGestures();

    // ... rest of the existing code ...
  }

  // Handle window resize
  let resizeTimeout;
  window.addEventListener("resize", () => {
    // Debounce resize events
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (currentUser) {
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
          if (userEmail) userEmail.textContent = currentUser.email;
        } else {
          // Mobile view
          if (mobileUserEmail) mobileUserEmail.textContent = currentUser.email;
          if (mobileShowLoginBtn) mobileShowLoginBtn.style.display = "none";
          if (mobileLogoutBtn) mobileLogoutBtn.style.display = "block";
        }
      }
    }, 250); // Wait 250ms after the last resize event
  });

  // Update the card type selection handler to show card count options
  $("#cameraCardType, #fileCardType").on("change", function () {
    const $select = $(this);
    const $cardCountGroup = $select.closest('.input-tab-content').find('.card-count-group');
    if ($select.val()) {
      $cardCountGroup.show();
      updateCardCountOptions(); // Update options when shown
    } else {
      $cardCountGroup.hide();
    }
  });

  // Update card count options
  function updateCardCountOptions() {
    const isPremium = subscriptionManager.isPremium();
    const $cardCountSelects = $("#cameraCardCount, #fileCardCount");
    
    $cardCountSelects.each(function () {
      const $select = $(this);
      const $premiumOptions = $select.find(".premium-option");
      
      if (isPremium) {
        $premiumOptions.show();
      } else {
        $premiumOptions.hide();
        // Reset to max free tier value if premium option was selected
        if (parseInt($select.val()) > 10) {
          $select.val("10");
        }
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
      const cardCount = parseInt(activeTab.find("select[id$='CardCount']").val());

      // Rest of the processText function code...
    } catch (error) {
      console.error("Error generating flashcards:", error);
      throw error;
    } finally {
      isGenerating = false;
    }
  }

  // Update loading indicator references
  const fileUploadLoadingIndicator = document.getElementById("fileUploadLoadingIndicator");
  const flashcardViewerLoadingIndicator = document.getElementById("flashcardViewerLoadingIndicator");

  // Function to show loading indicator
  function showLoadingIndicator(context = 'fileUpload') {
    const indicator = context === 'fileUpload' ? fileUploadLoadingIndicator : flashcardViewerLoadingIndicator;
    if (indicator) {
      indicator.style.display = "flex";
      indicator.style.opacity = "1";
    }
  }

  // Function to hide loading indicator
  function hideLoadingIndicator(context = 'fileUpload') {
    const indicator = context === 'fileUpload' ? fileUploadLoadingIndicator : flashcardViewerLoadingIndicator;
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
    showLoadingIndicator('fileUpload');
    try {
      // Your file upload logic here
    } finally {
      hideLoadingIndicator('fileUpload');
    }
  }

  // And in your flashcard generation handler:
  async function generateFlashcards() {
    showLoadingIndicator('flashcardViewer');
    try {
      // Your flashcard generation logic here
    } finally {
      hideLoadingIndicator('flashcardViewer');
    }
  }
});
