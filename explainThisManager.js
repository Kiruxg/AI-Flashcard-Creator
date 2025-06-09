// Explain This! Feature Manager
// Handles all functionality for the AI-powered explanation feature

export class ExplainThisManager {
  constructor() {
    this.currentUser = null;
    this.userCredits = 0;
    this.currentCard = null;
    this.explanationHistory = [];
    this.cachedExplanations = new Map();
    this.isExplaining = false;
    
    this.init();
  }

  async init() {
    console.log('Initializing Explain This! feature...');
    
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setupUI());
    } else {
      this.setupUI();
    }
  }

  setupUI() {
    this.attachEventListeners();
    this.updateCreditsDisplay();
    this.loadExplanationHistory();
  }

  attachEventListeners() {
    const explainBtn = document.getElementById('explainThisBtn');
    if (explainBtn) {
      explainBtn.addEventListener('click', (e) => this.handleExplainClick(e));
    }

    this.setupModalListeners();
    this.setupRatingListeners();
    this.setupFollowUpListeners();
    this.setupBuyCreditsListeners();
    this.setupVoiceListeners();
  }

  setupModalListeners() {
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('close') || e.target.classList.contains('modal')) {
        this.closeModals();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeModals();
      }
    });
  }

  async handleExplainClick(e) {
    e.preventDefault();
    
    if (this.isExplaining) return;

    if (!this.currentUser) {
      this.showAuthRequired();
      return;
    }

    // Unlimited explanations now - credits disabled!
    // if (this.userCredits <= 0) {
    //   this.showNoCreditModal();
    //   return;
    // }

    this.currentCard = this.getCurrentCard();
    if (!this.currentCard) {
      this.showError('No flashcard selected');
      return;
    }

    const cacheKey = this.generateCacheKey(this.currentCard);
    if (this.cachedExplanations.has(cacheKey)) {
      console.log('Using cached explanation');
      this.showCachedExplanation(this.cachedExplanations.get(cacheKey));
      return;
    }

    this.showExplanationModal();
    this.generateExplanation();
  }

  getCurrentCard() {
    const frontElement = document.getElementById('cardFront');
    const backElement = document.getElementById('cardBack');
    
    if (!frontElement || !backElement) {
      return null;
    }

    return {
      id: Date.now(),
      front: frontElement.textContent.trim(),
      back: backElement.textContent.trim(),
      type: this.detectCardType(frontElement, backElement)
    };
  }

  detectCardType(frontElement, backElement) {
    if (frontElement.querySelector('.cloze-blank')) return 'cloze';
    if (frontElement.querySelector('img') || backElement.querySelector('img')) return 'image-occlusion';
    if (frontElement.textContent.includes('?')) return 'qa';
    return 'term';
  }

  generateCacheKey(card) {
    return `${card.front}_${card.back}`.replace(/\s+/g, '').toLowerCase();
  }

  showExplanationModal() {
    const modal = document.getElementById('explainModal');
    if (!modal) return;

    this.populateCardPreview();
    this.resetModalState();
    
    modal.style.display = 'block';
    modal.classList.add('show');
    
    this.updateModalCreditsDisplay();
  }

  populateCardPreview() {
    const frontPreview = document.getElementById('explainCardFront');
    const backPreview = document.getElementById('explainCardBack');
    
    if (frontPreview && this.currentCard) {
      frontPreview.textContent = this.currentCard.front;
    }
    if (backPreview && this.currentCard) {
      backPreview.textContent = this.currentCard.back;
    }
  }

  resetModalState() {
    const explanationContent = document.getElementById('explanationContent');
    if (explanationContent) {
      explanationContent.style.display = 'none';
    }

    const loading = document.getElementById('explainLoading');
    if (loading) {
      loading.style.display = 'flex';
    }

    document.querySelectorAll('.btn-rating').forEach(btn => {
      btn.classList.remove('selected');
    });

    const followUpTextarea = document.getElementById('followUpQuestion');
    if (followUpTextarea) {
      followUpTextarea.value = '';
    }
    const followUpResponse = document.getElementById('followUpResponse');
    if (followUpResponse) {
      followUpResponse.style.display = 'none';
    }
  }

  async generateExplanation() {
    this.isExplaining = true;
    
    try {
      const prompt = this.buildExplanationPrompt();
      const explanation = await this.callExplanationAPI(prompt);
      
      // Credits disabled - no deduction needed
      // await this.deductCredit();
      
      const cacheKey = this.generateCacheKey(this.currentCard);
      this.cachedExplanations.set(cacheKey, explanation);
      
      this.displayExplanation(explanation);
      this.saveToHistory(explanation);
      // Credits disabled - no need to update display
      // this.updateCreditsDisplay();
      
    } catch (error) {
      console.error('Error generating explanation:', error);
      this.showError('Failed to generate explanation. Please try again.');
    } finally {
      this.isExplaining = false;
    }
  }

  buildExplanationPrompt() {
    const { front, back, type } = this.currentCard;
    const userProfession = this.getUserProfession();
    
    let prompt = `You are an expert AI tutor helping a student understand a flashcard concept. `;
    
    if (userProfession) {
      prompt += `The student is studying ${userProfession}. `;
    }
    
    prompt += `Please provide a detailed, helpful explanation for this flashcard:

Question/Term: ${front}
Answer/Definition: ${back}

Please explain:
1. What this concept means in simple terms
2. Why it's important to understand
3. Real-world applications or examples
4. Any common misconceptions or pitfalls
5. Memory aids or mnemonics if applicable

Make your explanation clear, engaging, and educational.`;

    return prompt;
  }

  async callExplanationAPI(prompt) {
    // Simulate API call for now
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return `This is a simulated explanation for the concept. In a real implementation, this would call the OpenAI API with the following prompt: ${prompt.substring(0, 100)}...

**Understanding the Concept:**
This flashcard covers an important concept that requires deeper understanding beyond simple memorization.

**Real-world Applications:**
This concept is commonly applied in practical scenarios and professional environments.

**Memory Aids:**
Try to remember this concept by associating it with familiar examples from your field of study.`;
  }

  displayExplanation(explanation) {
    const loading = document.getElementById('explainLoading');
    if (loading) {
      loading.style.display = 'none';
    }

    const explanationContent = document.getElementById('explanationContent');
    if (explanationContent) {
      explanationContent.style.display = 'block';
    }

    const explanationText = document.getElementById('explanationText');
    if (explanationText) {
      explanationText.innerHTML = this.formatExplanation(explanation);
    }

    if (this.isPremiumUser()) {
      const followUpSection = document.getElementById('followUpSection');
      if (followUpSection) {
        followUpSection.style.display = 'block';
      }
    }
  }

  formatExplanation(explanation) {
    let formatted = explanation
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');

    if (!formatted.includes('<p>')) {
      formatted = `<p>${formatted}</p>`;
    }

    return formatted;
  }

  showCachedExplanation(explanation) {
    this.showExplanationModal();
    
    const loading = document.getElementById('explainLoading');
    if (loading) {
      loading.style.display = 'none';
    }
    
    this.displayExplanation(explanation);
  }

  setupRatingListeners() {
    document.addEventListener('click', (e) => {
      if (e.target.closest('.btn-rating')) {
        this.handleRating(e);
      }
    });
  }

  async handleRating(e) {
    const rating = e.target.closest('.btn-rating').dataset.rating;
    
    document.querySelectorAll('.btn-rating').forEach(btn => {
      btn.classList.remove('selected');
    });
    e.target.closest('.btn-rating').classList.add('selected');

    try {
      await this.saveExplanationRating(rating);
      this.showNotification(
        rating === 'up' ? 'Thanks for your feedback!' : 'Thanks! We\'ll improve our explanations.'
      );
    } catch (error) {
      console.error('Error saving rating:', error);
    }
  }

  setupFollowUpListeners() {
    const followUpBtn = document.getElementById('askFollowUpBtn');
    if (followUpBtn) {
      followUpBtn.addEventListener('click', (e) => this.handleFollowUpQuestion(e));
    }
  }

  setupBuyCreditsListeners() {
    const buyCreditsBtn = document.getElementById('buyCreditsBtn');
    if (buyCreditsBtn) {
      buyCreditsBtn.addEventListener('click', () => this.showBuyCreditsModal());
    }
  }

  setupVoiceListeners() {
    const speakBtn = document.getElementById('speakExplanationBtn');
    if (speakBtn) {
      speakBtn.addEventListener('click', () => this.speakExplanation());
    }
  }

  speakExplanation() {
    const explanationText = document.getElementById('explanationText');
    if (!explanationText) return;

    const textToSpeak = explanationText.textContent;
    
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.rate = 0.8;
      utterance.pitch = 1;
      utterance.volume = 0.8;
      
      speechSynthesis.speak(utterance);
    } else {
      this.showError('Speech synthesis not supported in this browser');
    }
  }

  showBuyCreditsModal() {
    const modal = document.getElementById('buyCreditsModal');
    if (modal) {
      modal.style.display = 'block';
      modal.classList.add('show');
    }
  }

  async deductCredit() {
    this.userCredits = Math.max(0, this.userCredits - 1);
  }

  updateCreditsDisplay() {
    const creditsElements = [
      document.getElementById('explainCreditsCount'),
      document.getElementById('modalCreditsCount')
    ];

    creditsElements.forEach(element => {
      if (element) {
        if (this.userCredits > 0) {
          element.textContent = `${this.userCredits} credits`;
          element.parentElement?.classList.remove('disabled');
        } else {
          element.textContent = 'No credits';
          element.parentElement?.classList.add('disabled');
        }
      }
    });

    const explainBtn = document.getElementById('explainThisBtn');
    if (explainBtn) {
      explainBtn.disabled = this.userCredits <= 0;
    }
  }

  updateModalCreditsDisplay() {
    const modalCredits = document.getElementById('modalCreditsCount');
    if (modalCredits) {
      modalCredits.textContent = `${this.userCredits} credits remaining`;
    }
  }

  saveToHistory(explanation) {
    const historyItem = {
      id: Date.now(),
      cardFront: this.currentCard.front,
      cardBack: this.currentCard.back,
      explanation: explanation,
      timestamp: new Date().toISOString(),
      rating: null
    };

    this.explanationHistory.unshift(historyItem);
    
    if (this.explanationHistory.length > 50) {
      this.explanationHistory = this.explanationHistory.slice(0, 50);
    }

    this.saveHistoryToStorage();
  }

  saveHistoryToStorage() {
    try {
      localStorage.setItem('explainHistory', JSON.stringify(this.explanationHistory));
    } catch (error) {
      console.error('Error saving explanation history:', error);
    }
  }

  loadExplanationHistory() {
    try {
      const stored = localStorage.getItem('explainHistory');
      if (stored) {
        this.explanationHistory = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Error loading explanation history:', error);
      this.explanationHistory = [];
    }
  }

  async saveExplanationRating(rating) {
    const lastExplanation = this.explanationHistory[0];
    if (lastExplanation) {
      lastExplanation.rating = rating;
      this.saveHistoryToStorage();
    }
  }

  closeModals() {
    const modals = ['explainModal', 'buyCreditsModal', 'explanationHistoryModal'];
    modals.forEach(modalId => {
      const modal = document.getElementById(modalId);
      if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('show');
      }
    });

    if ('speechSynthesis' in window) {
      speechSynthesis.cancel();
    }
  }

  showAuthRequired() {
    this.showNotification('Please sign in to use the Explain This! feature');
  }

  showNoCreditModal() {
    this.showBuyCreditsModal();
    this.showNotification('You need credits to use Explain This! Purchase more credits to continue.');
  }

  showError(message) {
    console.error(message);
    this.showNotification(message, 'error');
  }

  showNotification(message, type = 'success') {
    console.log(`${type.toUpperCase()}: ${message}`);
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 1rem 1.5rem;
      background: ${type === 'error' ? '#ef4444' : '#22c55e'};
      color: white;
      border-radius: 8px;
      z-index: 10000;
      animation: slideInFromRight 0.3s ease-out;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.remove();
    }, 5000);
  }

  setCurrentUser(user) {
    this.currentUser = user;
    if (user) {
      this.loadUserCredits();
    }
  }

  async loadUserCredits() {
    try {
      const userTier = this.getUserTier();
      this.userCredits = this.getDefaultCreditsForTier(userTier);
      this.updateCreditsDisplay();
    } catch (error) {
      console.error('Error loading user credits:', error);
    }
  }

  getUserTier() {
    return 'pro';
  }

  getDefaultCreditsForTier(tier) {
    const defaults = {
      'free': 0,
      'pro': 20,
      'premium': 100
    };
    return defaults[tier] || 0;
  }

  isPremiumUser() {
    return this.getUserTier() === 'premium';
  }

  getUserProfession() {
    return 'electrical';
  }
}

export const explainThisManager = new ExplainThisManager();
window.explainThisManager = explainThisManager; 