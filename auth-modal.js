// Import Firebase auth functions
import { auth, AUTH_ERROR_MESSAGES } from "./config.js";
import {
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { showNotification } from "./utils.js";

// Initialize Google provider with scopes
const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('email');
googleProvider.addScope('profile');

// Enhanced debug logging for auth
function debugAuthLog(message, data = null) {
  console.log(`[AUTH] ${message}`, data);
}

// Reusable Auth Modal Component
export function createAuthModal() {
  // Remove any existing modals with the same IDs to prevent duplicates
  document.getElementById("authModal")?.remove();
  document.getElementById("resetPasswordModal")?.remove();

  const modalHTML = `
    <!-- Auth Modal -->
    <div id="authModal" class="modal">
      <div class="modal-content">
        <span class="close">&times;</span>

        <!-- Auth Tabs -->
        <div class="auth-tabs" id="authTabs">
          <button class="tab-btn active" data-tab="login">Login</button>
          <button class="tab-btn" data-tab="signup">Sign Up</button>
        </div>

        <!-- Login Form -->
        <form id="loginForm" class="auth-form">
          <div class="form-group">
            <input
              type="email"
              id="loginEmail"
              placeholder="Email"
              required
              autocomplete="email"
            />
          </div>
          <div class="form-group">
            <input
              type="password"
              id="loginPassword"
              placeholder="Password"
              required
              autocomplete="current-password"
            />
          </div>
          <button type="submit" class="btn btn-primary" id="loginBtn">Login</button>
          <button type="button" class="btn btn-link" id="forgotPasswordBtn">
            Forgot Password?
          </button>
        </form>

        <!-- Sign Up Form -->
        <form id="signupForm" class="auth-form" style="display: none">
          <div class="form-group">
            <input
              type="email"
              id="signupEmail"
              placeholder="Email"
              required
              autocomplete="email"
            />
          </div>
          <div class="form-group">
            <input
              type="password"
              id="signupPassword"
              placeholder="Password"
              required
              minlength="6"
              autocomplete="new-password"
            />
            <small class="form-text"
              >Password must be at least 6 characters long</small
            >
          </div>
          <div class="form-group">
            <input
              type="password"
              id="confirmPassword"
              placeholder="Confirm Password"
              required
              autocomplete="new-password"
            />
          </div>
          <button type="submit" class="btn btn-primary" id="signupBtn">
            Create Account
          </button>
        </form>

        <!-- Social Login -->
        <div class="auth-divider">
          <span>or</span>
        </div>
        <div class="social-login">
          <button type="button" class="btn btn-secondary" id="googleLoginBtn">
            <img
              src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
              alt="Google"
              width="18"
              height="18"
            />
            Continue with Google
          </button>
        </div>
      </div>
    </div>

    <!-- Reset Password Modal -->
    <div id="resetPasswordModal" class="modal">
      <div class="modal-content">
        <span class="close">&times;</span>
        <h2>Reset Password</h2>
        <form id="resetPasswordForm" class="auth-form">
          <div class="form-group">
            <input
              type="email"
              id="resetEmail"
              placeholder="Enter your email"
              required
              autocomplete="email"
            />
          </div>
          <button type="submit" class="btn btn-primary">Send Reset Link</button>
        </form>
      </div>
    </div>
  `;

  // Add the modals to the document
  document.body.insertAdjacentHTML("beforeend", modalHTML);
}

// Initialize auth modal on any page
export function initializeAuthModal() {
  // Create the auth modal
  createAuthModal();

  debugAuthLog("Initializing auth modal");

  // Check for redirect result on page load
  getRedirectResult(auth)
    .then((result) => {
      if (result) {
        debugAuthLog("Redirect result found:", result);
        hideAuthModal();
        showNotification("Successfully signed in with Google!", "success");
        window.location.reload();
      } else {
        debugAuthLog("No redirect result found");
      }
    })
    .catch((error) => {
      if (error.code !== "auth/no-redirect-event") {
        debugAuthLog("Redirect sign-in error:", error);
        console.error("Redirect sign-in error:", error);
        showAuthError(
          AUTH_ERROR_MESSAGES[error.code] || "Failed to sign in with Google",
          "loginForm"
        );
      }
    });

  // Add event listeners for auth modal
  const authModal = document.getElementById("authModal");
  const resetPasswordModal = document.getElementById("resetPasswordModal");
  const closeButtons = document.querySelectorAll(".modal .close");
  const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");
  const resetPasswordForm = document.getElementById("resetPasswordForm");
  const googleLoginBtn = document.getElementById("googleLoginBtn");

  // Close modals when clicking the close button
  closeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const modal = button.closest(".modal");
      if (modal.id === "authModal") {
        hideAuthModal();
      } else if (modal.id === "resetPasswordModal") {
        hideResetPasswordModal();
      }
    });
  });

  // Handle forgot password button click
  if (forgotPasswordBtn) {
    forgotPasswordBtn.addEventListener("click", () => {
      hideAuthModal();
      showResetPasswordModal();
    });
  }

  // Handle reset password form submission
  if (resetPasswordForm) {
    resetPasswordForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("resetEmail").value;

      if (!email) {
        showAuthError("Please enter your email address", "resetPasswordForm");
        return;
      }

      try {
        debugAuthLog("Sending password reset email to:", email);
        await sendPasswordResetEmail(auth, email);
        // Show generic message in the modal, do not close it
        showAuthSuccess(
          "If an account with that email exists, a reset link has been sent.",
          "resetPasswordForm"
        );
      } catch (error) {
        debugAuthLog("Password reset error:", error);
        showAuthError(
          AUTH_ERROR_MESSAGES[error.code] ||
            "An error occurred while sending reset email.",
          "resetPasswordForm"
        );
      }
    });
  }

  // Handle Google login with enhanced error handling
  if (googleLoginBtn) {
    googleLoginBtn.addEventListener("click", async () => {
      debugAuthLog("Google login button clicked");
      
      // Disable button to prevent multiple clicks
      googleLoginBtn.disabled = true;
      googleLoginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in...';
      
      try {
        debugAuthLog("Attempting Google sign-in with provider:", googleProvider);
        
        // Try popup first
        try {
          debugAuthLog("Trying popup sign-in");
          const result = await signInWithPopup(auth, googleProvider);
          debugAuthLog("Popup sign-in successful:", result);
          
          hideAuthModal();
          showNotification("Successfully signed in with Google!", "success");
          
          // Reload to refresh the UI state
          setTimeout(() => {
            window.location.reload();
          }, 1000);
          
        } catch (popupError) {
          debugAuthLog("Popup sign-in failed:", popupError);
          
          // If popup fails (blocked), fall back to redirect
          if (
            popupError.code === "auth/popup-blocked" ||
            popupError.code === "auth/popup-closed-by-user" ||
            popupError.code === "auth/cancelled-popup-request"
          ) {
            debugAuthLog("Popup blocked or closed, trying redirect...");
            showAuthSuccess("Popup blocked, redirecting to Google...", "loginForm");
            
            // Small delay before redirect
            setTimeout(async () => {
              try {
                await signInWithRedirect(auth, googleProvider);
              } catch (redirectError) {
                debugAuthLog("Redirect sign-in error:", redirectError);
                throw redirectError;
              }
            }, 1000);
            
          } else {
            throw popupError;
          }
        }
        
      } catch (error) {
        debugAuthLog("Google sign-in error:", error);
        console.error("Google sign-in error:", error);
        
        // Re-enable button
        googleLoginBtn.disabled = false;
        googleLoginBtn.innerHTML = `
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" 
               alt="Google" width="18" height="18">
          Continue with Google
        `;
        
        let errorMessage = "Failed to sign in with Google";
        
        // Provide more specific error messages
        switch (error.code) {
          case "auth/unauthorized-domain":
            errorMessage = "This domain is not authorized for Google sign-in";
            break;
          case "auth/operation-not-allowed":
            errorMessage = "Google sign-in is not enabled for this project";
            break;
          case "auth/network-request-failed":
            errorMessage = "Network error. Please check your connection";
            break;
          default:
            errorMessage = AUTH_ERROR_MESSAGES[error.code] || errorMessage;
        }
        
        showAuthError(errorMessage, "loginForm");
      }
    });
  }
}

// Helper functions for auth modal
export function showAuthModal(tab = "login") {
  const authModal = document.getElementById("authModal");
  if (authModal) {
    authModal.style.display = "block";
    switchAuthTab(tab);
  }
}

export function hideAuthModal() {
  const authModal = document.getElementById("authModal");
  if (authModal) {
    authModal.style.display = "none";
  }
}

export function switchAuthTab(tab) {
  const loginForm = document.getElementById("loginForm");
  const signupForm = document.getElementById("signupForm");
  const tabBtns = document.querySelectorAll(".auth-tabs .tab-btn");

  tabBtns.forEach((b) => b.classList.remove("active"));

  if (tab === "login") {
    document.querySelector('[data-tab="login"]').classList.add("active");
    loginForm.style.display = "block";
    signupForm.style.display = "none";
  } else {
    document.querySelector('[data-tab="signup"]').classList.add("active");
    loginForm.style.display = "none";
    signupForm.style.display = "block";
  }
}

export function showResetPasswordModal() {
  const resetModal = document.getElementById("resetPasswordModal");
  if (resetModal) {
    resetModal.style.display = "block";
  }
}

export function hideResetPasswordModal() {
  const resetModal = document.getElementById("resetPasswordModal");
  if (resetModal) {
    resetModal.style.display = "none";
  }
}

// Helper function to show auth errors
function showAuthError(message, formId) {
  const form = document.getElementById(formId);
  if (form) {
    // Remove any existing error messages
    const existingError = form.querySelector(".auth-error");
    if (existingError) {
      existingError.remove();
    }
    // Add new error message
    const errorDiv = document.createElement("div");
    errorDiv.className = "auth-error";
    errorDiv.textContent = message;
    form.insertBefore(errorDiv, form.firstChild);
  }
}

// Add a helper function to show success messages in the form
function showAuthSuccess(message, formId) {
  const form = document.getElementById(formId);
  if (form) {
    // Remove any existing error or success messages
    const existingError = form.querySelector(".auth-error");
    if (existingError) existingError.remove();
    const existingSuccess = form.querySelector(".auth-success");
    if (existingSuccess) existingSuccess.remove();
    // Add new success message
    const successDiv = document.createElement("div");
    successDiv.className = "auth-success";
    successDiv.textContent = message;
    form.insertBefore(successDiv, form.firstChild);
  }
}
