// Navigation template as a JavaScript module
export const navTemplate = `
<header class="header">
  <div class="header-content">
    <a href="/" class="site-title">
      <img src="Note2Flash.png" alt="Note2Flash" class="logo" />
    </a>
    <button id="mobileMenuBtn" class="mobile-menu-btn" aria-label="Toggle menu">
      <i class="fas fa-bars"></i>
    </button>
    <nav class="main-nav">
      <a href="/create-deck.html" class="nav-home">Create Flashcards</a>
      <a href="/shared-decks.html" class="nav-decks">Shared Decks</a>
      <a href="/progress.html" class="nav-progress">Study Progress</a>
      <a href="/pricing.html" class="nav-pricing">Pricing</a>
    </nav>
    <div class="user-menu">
      <div class="user-dropdown">
        <button id="userMenuBtn" class="user-menu-btn" style="display: none">
          <span id="userEmail"></span>
          <i class="fas fa-chevron-down"></i>
        </button>
        <div class="dropdown-content">
          <a href="/my-decks.html" class="dropdown-item">
            <i class="fas fa-layer-group"></i>
            My Decks
          </a>
          <button id="logoutBtn" class="dropdown-item">
            <i class="fas fa-sign-out-alt"></i>
            Logout
          </button>
        </div>
      </div>
      <button id="showLoginBtn" class="btn btn-primary">Login</button>
    </div>
  </div>
  <nav id="mobileMenu" class="mobile-nav">
    <a href="/create-deck.html" class="nav-home">Create Flashcards</a>
    <a href="/shared-decks.html" class="nav-decks">Shared Decks</a>
    <a href="/progress.html" class="nav-progress">Study Progress</a>
    <a href="/pricing.html" class="nav-pricing">Pricing</a>
    <div class="mobile-user-menu">
      <span id="mobileUserEmail"></span>
      <button id="mobileShowLoginBtn" class="btn btn-primary">Login</button>
      <button id="mobileLogoutBtn" class="btn btn-secondary" style="display: none">
        Logout
      </button>
    </div>
  </nav>
</header>
`;

// Function to set active nav item based on current page
export function setActiveNavItem() {
  const currentPath = window.location.pathname;
  const navLinks = document.querySelectorAll(".main-nav a, .mobile-nav a");

  navLinks.forEach((link) => {
    // Remove active class from all links
    link.classList.remove("active");

    // Add active class based on current path
    if (currentPath === "/" && link.classList.contains("nav-home")) {
      link.classList.add("active");
    } else if (
      currentPath.includes("create-deck.html") &&
      link.classList.contains("nav-home")
    ) {
      link.classList.add("active");
    } else if (
      currentPath.includes("pricing.html") &&
      link.classList.contains("nav-pricing")
    ) {
      link.classList.add("active");
    } else if (
      currentPath.includes("shared-decks.html") &&
      link.classList.contains("nav-decks")
    ) {
      link.classList.add("active");
    } else if (
      currentPath.includes("progress.html") &&
      link.classList.contains("nav-progress")
    ) {
      link.classList.add("active");
    } else if (
      currentPath.includes("my-decks.html") &&
      link.classList.contains("nav-decks")
    ) {
      link.classList.add("active");
    }
  });
}

// Initialize mobile menu
export function initializeMobileMenu() {
  const mobileMenuBtn = document.getElementById("mobileMenuBtn");
  const mobileMenu = document.getElementById("mobileMenu");

  if (mobileMenuBtn && mobileMenu) {
    mobileMenuBtn.addEventListener("click", () => {
      mobileMenu.classList.toggle("show");
      // Update aria-expanded attribute
      const isExpanded = mobileMenu.classList.contains("show");
      mobileMenuBtn.setAttribute("aria-expanded", isExpanded);
    });
  }
}

// Initialize navigation
export function initializeNavigation() {
  // Insert navigation HTML before the container
  const container = document.querySelector(".container");
  if (container) {
    container.insertAdjacentHTML("beforebegin", navTemplate);
  }

  // Initialize navigation features
  setActiveNavItem();
  initializeMobileMenu();
}
