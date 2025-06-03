// Reusable Auth Modal Component
export function createAuthModal() {
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
  `;

  return modalHTML;
}

// Initialize auth modal on any page
export function initializeAuthModal() {
  // Only create if it doesn't exist
  if (!document.getElementById("authModal")) {
    // Insert the modal HTML into the body
    document.body.insertAdjacentHTML("beforeend", createAuthModal());
  }

  const authModal = document.getElementById("authModal");
  const loginForm = document.getElementById("loginForm");
  const signupForm = document.getElementById("signupForm");
  const tabBtns = document.querySelectorAll(".auth-tabs .tab-btn");
  const closeBtn = authModal.querySelector(".close");

  // Show modal when login button is clicked (both desktop and mobile)
  const showLoginBtn = document.getElementById("showLoginBtn");
  const mobileShowLoginBtn = document.getElementById("mobileShowLoginBtn");

  if (showLoginBtn) {
    showLoginBtn.addEventListener("click", () => {
      showAuthModal("login");
    });
  }

  if (mobileShowLoginBtn) {
    mobileShowLoginBtn.addEventListener("click", () => {
      showAuthModal("login");
    });
  }

  // Close modal when clicking the close button
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      hideAuthModal();
    });
  }

  // Close modal when clicking outside
  window.addEventListener("click", (e) => {
    if (e.target === authModal) {
      hideAuthModal();
    }
  });

  // Switch between login and signup tabs
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      switchAuthTab(tab);
    });
  });
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
