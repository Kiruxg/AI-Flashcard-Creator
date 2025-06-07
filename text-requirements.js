// Text Requirements Validator
// Handles minimum text length validation for flashcard generation

class TextRequirements {
  constructor() {
    this.MIN_CHARS = 100;
    this.RECOMMENDED_CHARS = 300;
    this.init();
  }

  init() {
    // Find text input and related elements
    this.textInput = document.getElementById('textInput');
    this.charCount = document.getElementById('charCount');
    this.requirementMessage = document.getElementById('textRequirementMessage');
    this.generateBtn = document.getElementById('generateFromTextBtn');

    if (!this.textInput) return; // Exit if textInput doesn't exist on this page

    // Set up event listeners
    this.textInput.addEventListener('input', () => this.handleTextChange());
    this.textInput.addEventListener('paste', () => {
      // Handle paste with slight delay to get updated content
      setTimeout(() => this.handleTextChange(), 10);
    });

    // Initial check
    this.handleTextChange();
  }

  handleTextChange() {
    const text = this.textInput.value; // Don't trim for character count
    const trimmedText = text.trim();
    const charLength = text.length; // Count all characters including spaces
    const wordCount = trimmedText.split(/\s+/).filter(word => word.length > 0).length;

    // Update character count
    this.updateCharCount(charLength);

    // Update button state and messages (use trimmed length for validation)
    this.updateRequirements(trimmedText.length, wordCount);
  }

  updateCharCount(charLength) {
    if (!this.charCount) return;

    this.charCount.textContent = charLength;
    
    // Remove all count classes
    this.charCount.classList.remove('below-minimum', 'minimum-met', 'optimal');
    
    // Add appropriate class based on length
    if (charLength < this.MIN_CHARS) {
      this.charCount.classList.add('below-minimum');
    } else if (charLength < this.RECOMMENDED_CHARS) {
      this.charCount.classList.add('minimum-met');
    } else {
      this.charCount.classList.add('optimal');
    }
  }

  updateRequirements(charLength, wordCount) {
    if (!this.requirementMessage || !this.generateBtn) return;

    // Clear previous message
    this.requirementMessage.style.display = 'none';
    this.requirementMessage.innerHTML = '';

    if (charLength < this.MIN_CHARS) {
      // Below minimum - show warning and disable button
      this.showWarning(charLength);
      this.disableButton();
    } else if (charLength < this.RECOMMENDED_CHARS) {
      // Minimum met but could be better - show tip
      this.showTip(charLength);
      this.enableButton();
    } else {
      // Optimal length - show success message
      this.showSuccess(charLength, wordCount);
      this.enableButton();
    }
  }

  showWarning(charLength) {
    const remaining = this.MIN_CHARS - charLength;
    const encouragement = charLength === 0 ? 
      'Start typing to see your progress!' : 
      `You're ${Math.round((charLength / this.MIN_CHARS) * 100)}% there!`;
    
    this.requirementMessage.className = 'text-requirement-warning';
    this.requirementMessage.innerHTML = `
      <i class="fas fa-exclamation-triangle"></i>
      <span>Please add ${remaining} more characters to generate quality flashcards. ${encouragement}</span>
    `;
    this.requirementMessage.style.display = 'flex';
  }

  showTip(charLength) {
    const toOptimal = this.RECOMMENDED_CHARS - charLength;
    this.requirementMessage.className = 'text-requirement-tip';
    this.requirementMessage.innerHTML = `
      <i class="fas fa-info-circle"></i>
      <span>Good! Add ${toOptimal} more characters for even better flashcards</span>
    `;
    this.requirementMessage.style.display = 'flex';
  }

  showSuccess(charLength, wordCount) {
    this.requirementMessage.className = 'text-requirement-success';
    this.requirementMessage.innerHTML = `
      <i class="fas fa-check-circle"></i>
      <span>Perfect! ${charLength} characters, ${wordCount} words - ready for high-quality flashcards</span>
    `;
    this.requirementMessage.style.display = 'flex';
  }

  disableButton() {
    if (this.generateBtn) {
      this.generateBtn.disabled = true;
      this.generateBtn.title = 'Please add more text to generate flashcards';
    }
  }

  enableButton() {
    if (this.generateBtn) {
      this.generateBtn.disabled = false;
      this.generateBtn.title = 'Generate flashcards from your text';
    }
  }

  // Public method to get current validation status
  isValid() {
    const text = this.textInput ? this.textInput.value.trim() : '';
    return text.length >= this.MIN_CHARS;
  }

  // Public method to get character count
  getCharCount() {
    const text = this.textInput ? this.textInput.value.trim() : '';
    return text.length;
  }

  // Public method to get word count
  getWordCount() {
    const text = this.textInput ? this.textInput.value.trim() : '';
    return text.split(/\s+/).filter(word => word.length > 0).length;
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.textRequirements = new TextRequirements();
});

// Export for module usage if needed
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TextRequirements;
} 