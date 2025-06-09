import { showNotification } from "./utils.js";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Import Firebase configuration
import { auth, AUTH_ERROR_MESSAGES } from "./config.js";

// Google Sign-In placeholder (to be implemented)
// Currently only Firebase email/password authentication is active

// Enhanced debug logging for auth
function debugAuthLog(message, data = null) {
  console.log(`[AUTH] ${message}`, data);
}

// Google Sign-In placeholder functions (to be implemented)
async function handleGoogleSignInPlaceholder() {
  showAuthMessage("Google Sign-In is not yet configured. Please use email/password authentication.", "info");
}

// Make auth functions globally available
window.getCurrentUser = getCurrentUser;
window.signOutUser = signOutUser;
window.isAuthenticated = isAuthenticated;
window.initializeUserSession = initializeUserSession;
window.cleanupUserSession = cleanupUserSession;
window.updateAuthUI = updateAuthUI;

// Fresh Auth Modal Implementation with Firebase Email/Password + Auth0 Google
export function createAuthModal() {
  // Remove existing modal if it exists
  document.getElementById("authModal")?.remove();
  document.getElementById("resetPasswordModal")?.remove();

  const modalHTML = `
    <!-- Auth Modal -->
    <div id="authModal" class="modal" style="display: none;">
      <div class="modal-content">
        <span class="close" id="authModalClose">&times;</span>

        <!-- Auth Header -->
        <div class="auth-header" style="text-align: center; margin-bottom: 2rem;">
          <h2 id="authModalTitle">Welcome to Note2Flash</h2>
          <p id="authModalSubtitle" style="color: var(--text-color-secondary); margin-bottom: 1rem;">
            Sign in to access your flashcards and study progress
          </p>
        </div>

        <!-- Auth Tabs -->
        <div class="auth-tabs" style="display: flex; margin-bottom: 2rem;">
          <button class="tab-btn active" data-tab="login" style="flex: 1; padding: 1rem; border: none; background: none; cursor: pointer; font-size: 1rem; color: var(--primary-color);">
            Login
          </button>
          <button class="tab-btn" data-tab="signup" style="flex: 1; padding: 1rem; border: none; background: none; cursor: pointer; font-size: 1rem; color: var(--text-color-secondary);">
            Sign Up
          </button>
        </div>

        <!-- Google Sign-In Button (Top) -->
        <div class="google-auth" style="margin-bottom: 2rem;">
          <button type="button" class="btn btn-google" id="googleSignInBtn" style="width: 100%; padding: 0.75rem; border: 2px solid #4285f4; background: white; color: #4285f4; border-radius: 8px; font-size: 1rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.5rem; transition: all 0.3s ease;">
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path fill="#4285f4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34a853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#fbbc05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#ea4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>
        </div>

        <!-- Divider -->
        <div class="auth-divider" style="text-align: center; margin: 1.5rem 0; position: relative;">
          <span style="background: var(--background-color); padding: 0 1rem; color: var(--text-color-secondary); position: relative; z-index: 1;">or</span>
          <div style="position: absolute; top: 50%; left: 0; right: 0; height: 1px; background: var(--border-color); z-index: 0;"></div>
        </div>

        <!-- Login Form -->
        <form id="loginForm" class="auth-form">
          <div class="form-group" style="margin-bottom: 1rem;">
            <input
              type="email"
              id="loginEmail"
              placeholder="Email address"
              required
              autocomplete="email"
              style="width: 100%; padding: 0.75rem; border: 2px solid var(--border-color); border-radius: 8px; font-size: 1rem; background: var(--background-color); color: var(--text-color);"
            />
          </div>
          <div class="form-group" style="margin-bottom: 1rem;">
            <input
              type="password"
              id="loginPassword"
              placeholder="Password"
              required
              autocomplete="current-password"
              style="width: 100%; padding: 0.75rem; border: 2px solid var(--border-color); border-radius: 8px; font-size: 1rem; background: var(--background-color); color: var(--text-color);"
            />
          </div>
          <button type="submit" class="btn btn-primary" id="loginBtn" style="width: 100%; padding: 0.75rem; background: var(--primary-color); color: white; border: none; border-radius: 8px; font-size: 1rem; cursor: pointer; margin-bottom: 1rem;">
            Sign In
          </button>
          <button type="button" class="btn btn-link" id="forgotPasswordBtn" style="background: none; border: none; color: var(--primary-color); cursor: pointer; text-decoration: underline; width: 100%; padding: 0.5rem;">
            Forgot Password?
          </button>
        </form>

        <!-- Sign Up Form -->
        <form id="signupForm" class="auth-form" style="display: none;">
          <div class="form-group" style="margin-bottom: 1rem;">
            <input
              type="email"
              id="signupEmail"
              placeholder="Email address"
              required
              autocomplete="email"
              style="width: 100%; padding: 0.75rem; border: 2px solid var(--border-color); border-radius: 8px; font-size: 1rem; background: var(--background-color); color: var(--text-color);"
            />
          </div>
          <div class="form-group" style="margin-bottom: 1rem;">
            <input
              type="password"
              id="signupPassword"
              placeholder="Password (minimum 6 characters)"
              required
              minlength="6"
              autocomplete="new-password"
              style="width: 100%; padding: 0.75rem; border: 2px solid var(--border-color); border-radius: 8px; font-size: 1rem; background: var(--background-color); color: var(--text-color);"
            />
          </div>
          <div class="form-group" style="margin-bottom: 1rem;">
            <input
              type="password"
              id="confirmPassword"
              placeholder="Confirm password"
              required
              autocomplete="new-password"
              style="width: 100%; padding: 0.75rem; border: 2px solid var(--border-color); border-radius: 8px; font-size: 1rem; background: var(--background-color); color: var(--text-color);"
            />
          </div>
          <button type="submit" class="btn btn-primary" id="signupBtn" style="width: 100%; padding: 0.75rem; background: var(--primary-color); color: white; border: none; border-radius: 8px; font-size: 1rem; cursor: pointer;">
            Create Account
          </button>
        </form>

        <!-- Error/Success Messages -->
        <div id="authMessage" style="display: none; padding: 0.75rem; border-radius: 8px; margin-top: 1rem; text-align: center;"></div>
      </div>
    </div>

    <!-- Reset Password Modal -->
    <div id="resetPasswordModal" class="modal" style="display: none;">
      <div class="modal-content">
        <span class="close" id="resetPasswordModalClose">&times;</span>
        <h2 style="text-align: center; margin-bottom: 1rem;">Reset Password</h2>
        <p style="text-align: center; color: var(--text-color-secondary); margin-bottom: 2rem;">
          Enter your email address and we'll send you a link to reset your password.
        </p>
        <form id="resetPasswordForm">
          <div class="form-group" style="margin-bottom: 1rem;">
            <input
              type="email"
              id="resetEmail"
              placeholder="Email address"
              required
              style="width: 100%; padding: 0.75rem; border: 2px solid var(--border-color); border-radius: 8px; font-size: 1rem; background: var(--background-color); color: var(--text-color);"
            />
          </div>
          <button type="submit" class="btn btn-primary" id="sendResetBtn" style="width: 100%; padding: 0.75rem; background: var(--primary-color); color: white; border: none; border-radius: 8px; font-size: 1rem; cursor: pointer; margin-bottom: 1rem;">
            Send Reset Link
          </button>
          <button type="button" class="btn btn-link" id="backToLoginBtn" style="background: none; border: none; color: var(--primary-color); cursor: pointer; text-decoration: underline; width: 100%; padding: 0.5rem;">
            Back to Login
          </button>
        </form>
        <div id="resetMessage" style="display: none; padding: 0.75rem; border-radius: 8px; margin-top: 1rem; text-align: center;"></div>
      </div>
    </div>

    <style>
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      
      .modal {
        position: fixed;
        z-index: 1000;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0,0,0,0.5);
        backdrop-filter: blur(4px);
      }
      
      .modal-content {
        background-color: var(--background-color);
        margin: 5% auto;
        padding: 2rem;
        border-radius: 12px;
        width: 90%;
        max-width: 400px;
        position: relative;
        box-shadow: 0 10px 25px rgba(0,0,0,0.2);
      }
      
      .close {
        position: absolute;
        right: 1rem;
        top: 1rem;
        font-size: 24px;
        font-weight: bold;
        cursor: pointer;
        color: var(--text-color-secondary);
      }
      
      .close:hover {
        color: var(--text-color);
      }
      
      .tab-btn:hover {
        color: var(--primary-color) !important;
      }
      
      .tab-btn.active {
        color: var(--primary-color) !important;
        border-bottom-color: var(--primary-color) !important;
      }
      
      #googleSignInBtn:hover {
        background: #f8f9fa !important;
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(66, 133, 244, 0.2);
      }
      
      .btn:hover {
        opacity: 0.9;
        transform: translateY(-1px);
      }
      
      input:focus {
        outline: none;
        border-color: var(--primary-color) !important;
        box-shadow: 0 0 0 3px rgba(var(--primary-color-rgb), 0.1);
      }
    </style>
  `;

  document.body.insertAdjacentHTML("beforeend", modalHTML);
}

// Initialize user session when authenticated
function initializeUserSession() {
  debugAuthLog("Initializing user session");
  if (!getCurrentUser()) return;
  
  // Initialize user-specific features
  if (window.loadUserDecks) {
    window.loadUserDecks();
  }
  
  // Initialize explain this manager with user data if available
  if (window.explainThisManager && window.explainThisManager.setCurrentUser) {
    window.explainThisManager.setCurrentUser(getCurrentUser());
  }
  
  // Update subscription UI if available
  if (window.updateSubscriptionUI) {
    window.updateSubscriptionUI();
  }
  
  // Initialize edit deck name if available
  if (window.initializeEditDeckName) {
    window.initializeEditDeckName();
  }
  
  debugAuthLog('User session initialized for:', getCurrentUser().email);
}

// Clean up when user logs out
function cleanupUserSession() {
  debugAuthLog("Cleaning up user session");
  
  // Reset global currentUser if available
  if (window.currentUser !== undefined) {
    window.currentUser = null;
  }
  
  // Reset userDecks if available
  if (window.userDecks !== undefined) {
    window.userDecks = [];
  }
  
  // Reset UI state if functions are available
  if (window.updateDeckList) {
    window.updateDeckList([]);
  }
  
  if (window.stopDueCardChecking) {
    window.stopDueCardChecking();
  }
  
  debugAuthLog('User session cleaned up');
}

// Auth UI functions for dual authentication (Firebase + Auth0)
function updateAuthUI() {
  const showLoginBtn = document.getElementById("showLoginBtn");
  const userEmail = document.getElementById("userEmail");
  const logoutBtn = document.getElementById("logoutBtn");
  const userMenuBtn = document.getElementById("userMenuBtn");
  const mobileUserEmail = document.getElementById("mobileUserEmail");
  const mobileLogoutBtn = document.getElementById("mobileLogoutBtn");
  const createDeckBtn = document.getElementById("createDeckBtn");
  const importDeckBtn = document.getElementById("importDeckBtn");
  const loginToCreateBtn = document.getElementById("loginToCreateBtn");

  const currentUser = getCurrentUser();

  if (currentUser) {
    debugAuthLog('Updating UI for authenticated user:', currentUser.email);
    
    // Desktop UI
    if (showLoginBtn) showLoginBtn.style.display = "none";
    if (userEmail) {
      userEmail.textContent = currentUser.email || currentUser.name;
      userEmail.style.display = "block";
    }
    if (userMenuBtn) userMenuBtn.style.display = "flex";

    // Mobile UI
    if (mobileUserEmail) mobileUserEmail.textContent = currentUser.email || currentUser.name;
    if (mobileLogoutBtn) mobileLogoutBtn.style.display = "block";

    // Shared decks UI
    if (createDeckBtn) createDeckBtn.style.display = "block";
    if (importDeckBtn) importDeckBtn.style.display = "block";
    if (loginToCreateBtn) loginToCreateBtn.style.display = "none";

    // Hide auth modal if open
    hideAuthModal();
    hideResetPasswordModal();
    
    // Clear any error messages
    document.querySelectorAll(".auth-error").forEach(el => el.remove());
    // Clear form inputs
    document.querySelectorAll(".auth-form input").forEach(input => input.value = "");
  } else {
    debugAuthLog('Updating UI for unauthenticated state');
    
    // Desktop UI
    if (showLoginBtn) showLoginBtn.style.display = "block";
    if (userEmail) userEmail.style.display = "none";
    if (logoutBtn) logoutBtn.style.display = "none";
    if (userMenuBtn) userMenuBtn.style.display = "none";

    // Mobile UI
    if (mobileLogoutBtn) mobileLogoutBtn.style.display = "none";

    // Shared decks UI
    if (createDeckBtn) createDeckBtn.style.display = "none";
    if (importDeckBtn) importDeckBtn.style.display = "none";
    if (loginToCreateBtn) loginToCreateBtn.style.display = "block";
  }
}

// Firebase logout function
export async function signOutUser() {
  try {
    debugAuthLog("Signing out user");
    
    // Firebase user (email/password only)
    debugAuthLog("Logging out Firebase user");
    await signOut(auth);
    
    // Clean up session
    cleanupUserSession();
    updateAuthUI();
    
    debugAuthLog("User signed out successfully");
  } catch (error) {
    debugAuthLog("Sign out error:", error);
    throw error;
  }
}

// Get current Firebase user
export function getCurrentUser() {
  // Check Firebase user
  if (auth.currentUser) {
    return auth.currentUser;
  }
  
  return null;
}

// Initialize the auth modal with event listeners
export async function initializeAuthModal() {
  debugAuthLog("Initializing Auth Modal");
  
  // Create the modal HTML
  createAuthModal();
  
  // Get modal elements
  const authModal = document.getElementById("authModal");
  const resetPasswordModal = document.getElementById("resetPasswordModal");
  const authModalClose = document.getElementById("authModalClose");
  const resetPasswordModalClose = document.getElementById("resetPasswordModalClose");
  
  // Tab switching
  const tabBtns = document.querySelectorAll("#authModal .tab-btn");
  const loginForm = document.getElementById("loginForm");
  const signupForm = document.getElementById("signupForm");
  
  // Forms
  const loginFormEl = document.getElementById("loginForm");
  const signupFormEl = document.getElementById("signupForm");
  const resetPasswordFormEl = document.getElementById("resetPasswordForm");
  
  // Buttons
  const googleSignInBtn = document.getElementById("googleSignInBtn");
  const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");
  const backToLoginBtn = document.getElementById("backToLoginBtn");
  
  // Close modal handlers
  authModalClose.addEventListener("click", () => hideAuthModal());
  resetPasswordModalClose.addEventListener("click", () => hideResetPasswordModal());
  
  // Click outside modal to close
  authModal.addEventListener("click", (e) => {
    if (e.target === authModal) hideAuthModal();
  });
  resetPasswordModal.addEventListener("click", (e) => {
    if (e.target === resetPasswordModal) hideResetPasswordModal();
  });
  
  // Tab switching
  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-tab");
      switchAuthTab(tab);
    });
  });
  
  // Google Sign-In placeholder
  googleSignInBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleGoogleSignInPlaceholder();
  });
  
  // Firebase Email/Password Login
  loginFormEl.addEventListener("submit", handleEmailLogin);
  
  // Firebase Email/Password Sign Up
  signupFormEl.addEventListener("submit", handleEmailSignup);
  
  // Password Reset
  forgotPasswordBtn.addEventListener("click", () => showResetPasswordModal());
  backToLoginBtn.addEventListener("click", () => {
    hideResetPasswordModal();
    showAuthModal("login");
  });
  resetPasswordFormEl.addEventListener("submit", handlePasswordReset);
  
  // Listen for Firebase auth state changes
  onAuthStateChanged(auth, (user) => {
    debugAuthLog("Firebase auth state changed:", user);
    if (user) {
      debugAuthLog('Firebase user authenticated:', user.email);
      updateAuthUI();
      initializeUserSession();
    } else {
      debugAuthLog('Firebase user logged out');
      updateAuthUI();
      cleanupUserSession();
    }
  });
  
  debugAuthLog("Auth Modal initialized successfully");
}

// Firebase authentication system initialization
export async function initializeAuthSystem() {
  try {
    debugAuthLog("Initializing Firebase authentication system");
    
    // Initialize the auth modal UI
    await initializeAuthModal();
    
    debugAuthLog('Firebase authentication system initialized');
    
  } catch (error) {
    debugAuthLog('Failed to initialize authentication:', error);
    if (window.showNotification) {
      window.showNotification('Authentication initialization failed. Please refresh the page.', 'error');
    }
  }
}

// Remove this function - replaced with placeholder

// Handle Firebase Email/Password Login
async function handleEmailLogin(e) {
  e.preventDefault();
  debugAuthLog("Handling email login");
  
  const email = document.getElementById("loginEmail").value;
  const password = document.getElementById("loginPassword").value;
  const btn = document.getElementById("loginBtn");
  const originalHTML = btn.innerHTML;
  
  try {
    // Show loading state
    btn.disabled = true;
    btn.innerHTML = '<div style="display: inline-block; width: 16px; height: 16px; border: 2px solid transparent; border-top: 2px solid currentColor; border-radius: 50%; animation: spin 1s linear infinite;"></div> Signing in...';
    
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    debugAuthLog("Firebase login successful:", userCredential.user);
    
    showAuthMessage("Successfully signed in!", "success");
    
    // Modal will be hidden by the auth state change listener
    
  } catch (error) {
    debugAuthLog("Firebase login error:", error);
    
    // Restore button
    btn.disabled = false;
    btn.innerHTML = originalHTML;
    
    const errorMessage = AUTH_ERROR_MESSAGES[error.code] || "Failed to sign in. Please try again.";
    showAuthMessage(errorMessage, "error");
  }
}

// Handle Firebase Email/Password Sign Up
async function handleEmailSignup(e) {
  e.preventDefault();
  debugAuthLog("Handling email signup");
  
  const email = document.getElementById("signupEmail").value;
  const password = document.getElementById("signupPassword").value;
  const confirmPassword = document.getElementById("confirmPassword").value;
  const btn = document.getElementById("signupBtn");
  const originalHTML = btn.innerHTML;
  
  // Validate passwords match
  if (password !== confirmPassword) {
    showAuthMessage("Passwords do not match.", "error");
    return;
  }
  
  try {
    // Show loading state
    btn.disabled = true;
    btn.innerHTML = '<div style="display: inline-block; width: 16px; height: 16px; border: 2px solid transparent; border-top: 2px solid currentColor; border-radius: 50%; animation: spin 1s linear infinite;"></div> Creating account...';
    
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    debugAuthLog("Firebase signup successful:", userCredential.user);
    
    showAuthMessage("Account created successfully!", "success");
    
    // Modal will be hidden by the auth state change listener
    
  } catch (error) {
    debugAuthLog("Firebase signup error:", error);
    
    // Restore button
    btn.disabled = false;
    btn.innerHTML = originalHTML;
    
    const errorMessage = AUTH_ERROR_MESSAGES[error.code] || "Failed to create account. Please try again.";
    showAuthMessage(errorMessage, "error");
  }
}

// Handle Password Reset
async function handlePasswordReset(e) {
  e.preventDefault();
  debugAuthLog("Handling password reset");
  
  const email = document.getElementById("resetEmail").value;
  const btn = document.getElementById("sendResetBtn");
  const originalHTML = btn.innerHTML;
  
  try {
    // Show loading state
    btn.disabled = true;
    btn.innerHTML = '<div style="display: inline-block; width: 16px; height: 16px; border: 2px solid transparent; border-top: 2px solid currentColor; border-radius: 50%; animation: spin 1s linear infinite;"></div> Sending...';
    
    await sendPasswordResetEmail(auth, email);
    debugAuthLog("Password reset email sent");
    
    showResetMessage("Password reset link sent to your email!", "success");
    
    // Clear form
    document.getElementById("resetEmail").value = "";
    
  } catch (error) {
    debugAuthLog("Password reset error:", error);
    
    const errorMessage = AUTH_ERROR_MESSAGES[error.code] || "Failed to send reset email. Please try again.";
    showResetMessage(errorMessage, "error");
  } finally {
    // Restore button
    btn.disabled = false;
    btn.innerHTML = originalHTML;
  }
}

// Show/Hide modals
export function showAuthModal(tab = "login") {
  debugAuthLog("Showing auth modal, tab:", tab);
  const modal = document.getElementById("authModal");
  if (modal) {
    modal.style.display = "block";
    switchAuthTab(tab);
    clearAuthMessages();
  }
}

export function hideAuthModal() {
  debugAuthLog("Hiding auth modal");
  const modal = document.getElementById("authModal");
  if (modal) {
    modal.style.display = "none";
    clearAuthMessages();
  }
}

export function showResetPasswordModal() {
  debugAuthLog("Showing reset password modal");
  hideAuthModal();
  const modal = document.getElementById("resetPasswordModal");
  if (modal) {
    modal.style.display = "block";
    clearResetMessages();
  }
}

export function hideResetPasswordModal() {
  debugAuthLog("Hiding reset password modal");
  const modal = document.getElementById("resetPasswordModal");
  if (modal) {
    modal.style.display = "none";
    clearResetMessages();
  }
}

// Switch between login and signup tabs
export function switchAuthTab(tab) {
  debugAuthLog("Switching to tab:", tab);
  
  const tabBtns = document.querySelectorAll("#authModal .tab-btn");
  const loginForm = document.getElementById("loginForm");
  const signupForm = document.getElementById("signupForm");
  const title = document.getElementById("authModalTitle");
  const subtitle = document.getElementById("authModalSubtitle");
  
  // Update tab buttons
  tabBtns.forEach(btn => {
    if (btn.getAttribute("data-tab") === tab) {
      btn.classList.add("active");
      btn.style.color = "var(--primary-color)";
      btn.style.borderBottomColor = "var(--primary-color)";
    } else {
      btn.classList.remove("active");
      btn.style.color = "var(--text-color-secondary)";
      btn.style.borderBottomColor = "transparent";
    }
  });
  
  // Show/hide forms
  if (tab === "login") {
    loginForm.style.display = "block";
    signupForm.style.display = "none";
    title.textContent = "Welcome Back";
    subtitle.textContent = "Sign in to access your flashcards and study progress";
  } else {
    loginForm.style.display = "none";
    signupForm.style.display = "block";
    title.textContent = "Create Account";
    subtitle.textContent = "Join Note2Flash to start creating and studying flashcards";
  }
  
  clearAuthMessages();
}

// Message display functions
function showAuthMessage(message, type) {
  const messageEl = document.getElementById("authMessage");
  if (messageEl) {
    messageEl.textContent = message;
    messageEl.style.display = "block";
    
    if (type === "error") {
      messageEl.style.background = "#fee";
      messageEl.style.color = "#c33";
      messageEl.style.border = "1px solid #fcc";
    } else if (type === "success") {
      messageEl.style.background = "#efe";
      messageEl.style.color = "#363";
      messageEl.style.border = "1px solid #cfc";
    } else if (type === "info") {
      messageEl.style.background = "#e6f3ff";
      messageEl.style.color = "#0066cc";
      messageEl.style.border = "1px solid #b3d9ff";
    }
    
    // Auto-hide success and info messages
    if (type === "success" || type === "info") {
      setTimeout(() => {
        clearAuthMessages();
      }, type === "info" ? 5000 : 3000); // Info messages stay longer
    }
  }
}

function showResetMessage(message, type) {
  const messageEl = document.getElementById("resetMessage");
  if (messageEl) {
    messageEl.textContent = message;
    messageEl.style.display = "block";
    
    if (type === "error") {
      messageEl.style.background = "#fee";
      messageEl.style.color = "#c33";
      messageEl.style.border = "1px solid #fcc";
    } else if (type === "success") {
      messageEl.style.background = "#efe";
      messageEl.style.color = "#363";
      messageEl.style.border = "1px solid #cfc";
    }
  }
}

function clearAuthMessages() {
  const messageEl = document.getElementById("authMessage");
  if (messageEl) {
    messageEl.style.display = "none";
  }
}

function clearResetMessages() {
  const messageEl = document.getElementById("resetMessage");
  if (messageEl) {
    messageEl.style.display = "none";
  }
}

// Check if user is authenticated
export function isAuthenticated() {
  return !!getCurrentUser();
}

// Remove this function - no longer needed

debugAuthLog("Auth Modal module loaded");
