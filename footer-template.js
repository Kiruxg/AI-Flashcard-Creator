// Footer template as a JavaScript module
export const footerTemplate = `
<footer class="footer">
    <div class="footer-content">
        <div class="footer-section company-info">
            <div class="footer-logo">
                <img src="Note2Flash_logo.png" alt="Note2Flash" class="footer-logo-img" />
                <h3>Note2Flash</h3>
            </div>
            <p class="company-description">
                Transform your study materials into smart flashcards with AI. Perfect for trades professionals, 
                apprentices, and certification candidates who want to study more effectively.
            </p>
            <div class="contact-info">
                <p><strong>Contact us:</strong></p>
                <p><a href="mailto:support@note2flash.com">support@note2flash.com</a></p>
            </div>
        </div>

        <div class="footer-section">
            <h4>Product</h4>
            <ul class="footer-links">
                <li><a href="index.html">Home</a></li>
                <li><a href="pricing.html">Pricing</a></li>
                <li><a href="index.html#how-it-works">How It Works</a></li>
                <li><a href="index.html#features">Features</a></li>
                <li><a href="progress.html">Study Progress</a></li>
            </ul>
        </div>

        <div class="footer-section">
            <h4>Trade Categories</h4>
            <ul class="footer-links">
                <li><a href="shared-decks.html">All Trades</a></li>
                <li><a href="shared-decks.html?category=electrician">Electricians</a></li>
                <li><a href="shared-decks.html?category=hvac">HVAC/Refrigeration</a></li>
                <li><a href="shared-decks.html?category=safety">Safety & OSHA</a></li>
                <li><a href="shared-decks.html?category=heavy-equipment">Heavy Equipment</a></li>
            </ul>
        </div>

        <div class="footer-section">
            <h4>Legal</h4>
            <ul class="footer-links">
                <li><a href="privacy-policy.html">Privacy Policy</a></li>
                <li><a href="terms-of-service.html">Terms of Service</a></li>
                <li><a href="mailto:support@note2flash.com">Support</a></li>
            </ul>
        </div>
    </div>

    <div class="footer-bottom">
        <div class="footer-bottom-content">
            <p>&copy; 2025 Note2Flash. All rights reserved.</p>
            <p class="made-with">Made with ❤️ for trades professionals</p>
        </div>
    </div>
</footer>
`;

// Initialize footer
export function initializeFooter() {
  // Check if footer already exists to avoid duplicates
  if (document.querySelector(".footer")) {
    return;
  }

  // Create footer element
  const footerElement = createFooterElement();

  // Find the best insertion point
  const container = document.querySelector(".container");
  const body = document.body;

  if (container && container.parentNode === body) {
    // Insert after the main container
    container.insertAdjacentElement("afterend", footerElement);
  } else {
    // Fallback: append to body before scripts
    const scripts = document.querySelectorAll("script");
    if (scripts.length > 0) {
      scripts[0].parentNode.insertBefore(footerElement, scripts[0]);
    } else {
      body.appendChild(footerElement);
    }
  }
}

// Create footer DOM element
function createFooterElement() {
  const footerDiv = document.createElement("div");
  footerDiv.innerHTML = footerTemplate;
  return footerDiv.firstElementChild;
}

// Auto-initialize footer when DOM is ready (removed to avoid conflicts)
// Individual pages will handle initialization
