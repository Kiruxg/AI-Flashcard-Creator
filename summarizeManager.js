// Summarize Manager - Handles AI-powered content summarization
export class SummarizeManager {
  constructor() {
    this.currentUser = null;
    this.userTier = 'free';
    this.summarizeGenerationsUsed = 0;
    this.exportUsageCount = 0; // Track FlashNotes exports
    this.summaryHistory = [];
    this.cachedSummaries = new Map();
    this.isSummarizing = false;
    
    this.init();
  }

  async init() {
    await this.loadUserTier();
    await this.loadUsageData();
    this.updateQuotaDisplay();
  }

  async loadUserTier() {
    try {
      // This would integrate with your existing user system
      // For now, defaulting to free
      this.userTier = 'free';
    } catch (error) {
      console.error('Error loading user tier:', error);
    }
  }

  async loadUsageData() {
    try {
      // Load from localStorage for now, would integrate with Firebase later
      const storedUsage = localStorage.getItem('summarizeUsage');
      if (storedUsage) {
        const usage = JSON.parse(storedUsage);
        const now = new Date();
        const lastReset = new Date(usage.lastReset || 0);
        
        // Reset monthly usage if it's a new month
        if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
          this.summarizeGenerationsUsed = 0;
          this.exportUsageCount = 0;
          this.saveUsageData();
        } else {
          this.summarizeGenerationsUsed = usage.used || 0;
          this.exportUsageCount = usage.exports || 0;
        }
      }
    } catch (error) {
      console.error('Error loading usage data:', error);
    }
  }

  saveUsageData() {
    try {
      const usage = {
        used: this.summarizeGenerationsUsed,
        exports: this.exportUsageCount,
        lastReset: new Date().toISOString()
      };
      localStorage.setItem('summarizeUsage', JSON.stringify(usage));
    } catch (error) {
      console.error('Error saving usage data:', error);
    }
  }

  getTierLimits() {
    const limits = {
      'free': { 
        generations: 3, 
        characterLimit: 5000,
        allowedTypes: ['quick'], // Bullet Point only
        exportsPerMonth: 1 // 1 FlashNotes export per month
      },
      'pro': { 
        generations: 25, 
        characterLimit: 25000,
        allowedTypes: ['quick', 'detailed'], // Bullet Point + Paragraph
        exportsPerMonth: 10 // 10 FlashNotes exports per month
      },
      'premium': { 
        generations: 50, 
        characterLimit: 50000,
        allowedTypes: ['quick', 'detailed', 'study'], // All types
        exportsPerMonth: 'unlimited' // Unlimited FlashNotes exports
      }
    };
    return limits[this.userTier] || limits['free'];
  }

  updateQuotaDisplay() {
    const limits = this.getTierLimits();
    const remaining = Math.max(0, limits.generations - this.summarizeGenerationsUsed);
    
    const quotaElement = document.getElementById('summarizeQuotaText');
    if (quotaElement) {
      let displayText = `FlashNotes: ${remaining}/${limits.generations}`;
      
      // Add export info
      if (limits.exportsPerMonth === 'unlimited') {
        displayText += ` | Exports: ∞`;
      } else {
        const exportsRemaining = Math.max(0, limits.exportsPerMonth - this.exportUsageCount);
        displayText += ` | Exports: ${exportsRemaining}/${limits.exportsPerMonth}`;
      }
      
      quotaElement.textContent = displayText;
      quotaElement.className = remaining === 0 ? 'quota-depleted' : remaining <= 1 ? 'quota-warning' : '';
    }
  }

  canGenerateSummary(contentLength, summaryType = 'detailed') {
    const limits = this.getTierLimits();
    
    if (this.summarizeGenerationsUsed >= limits.generations) {
      return { allowed: false, reason: 'Monthly limit reached' };
    }
    
    // Remove the character limit check - we'll handle chunking instead
    // if (contentLength > limits.characterLimit) {
    //   return { allowed: false, reason: `Content too long. Max ${limits.characterLimit} characters for ${this.userTier} tier.` };
    // }
    
    if (!limits.allowedTypes.includes(summaryType)) {
      const typeNames = {
        'quick': 'Bullet Point FlashNotes',
        'detailed': 'Paragraph FlashNotes', 
        'study': 'Study Guide FlashNotes'
      };
      return { 
        allowed: false, 
        reason: `${typeNames[summaryType]} not available in ${this.userTier} tier. Upgrade to access this format.` 
      };
    }
    
    return { allowed: true };
  }

  getAvailableFlashNotesTypes() {
    const limits = this.getTierLimits();
    return limits.allowedTypes;
  }

  isFlashNotesTypeAvailable(type) {
    const limits = this.getTierLimits();
    return limits.allowedTypes.includes(type);
  }

  canExportFlashNotes() {
    const limits = this.getTierLimits();
    
    if (limits.exportsPerMonth === 'unlimited') {
      return { allowed: true };
    }
    
    if (this.exportUsageCount >= limits.exportsPerMonth) {
      return { 
        allowed: false, 
        reason: `Monthly export limit reached (${limits.exportsPerMonth}/month)` 
      };
    }
    
    return { allowed: true };
  }

  async exportFlashNotes(content, filename = 'flashnotes.txt') {
    const permission = this.canExportFlashNotes();
    if (!permission.allowed) {
      this.showUpgradePrompt(permission.reason);
      return false;
    }

    try {
      // Create and download the file
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Track export usage
      this.exportUsageCount++;
      this.saveUsageData();
      this.updateQuotaDisplay();

      this.showNotification('FlashNotes exported successfully!', 'success');
      return true;
    } catch (error) {
      console.error('Error exporting FlashNotes:', error);
      this.showError('Failed to export FlashNotes. Please try again.');
      return false;
    }
  }

  async generateSummary(content, options = {}) {
    if (this.isSummarizing) {
      this.showError('Already generating a summary. Please wait...');
      return null;
    }

    const summaryType = options.type || 'detailed';
    const permission = this.canGenerateSummary(content.length, summaryType);
    if (!permission.allowed) {
      this.showUpgradePrompt(permission.reason);
      return null;
    }

    this.isSummarizing = true;
    
    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(content, options);
      if (this.cachedSummaries.has(cacheKey)) {
        return this.cachedSummaries.get(cacheKey);
      }

      // Show loading state
      this.showLoadingState();

      // Handle chunking for large content
      const limits = this.getTierLimits();
      let summary;
      
      if (content.length <= limits.characterLimit) {
        // Content fits within limit, process normally
        summary = await this.callSummarizeAPI(content, options);
      } else {
        // Content is too large, chunk it
        summary = await this.generateChunkedSummary(content, options);
      }
      
      if (summary) {
        // Cache the result
        this.cachedSummaries.set(cacheKey, summary);
        
        // Update usage
        this.summarizeGenerationsUsed++;
        this.saveUsageData();
        this.updateQuotaDisplay();
        
        // Save to history
        this.saveToHistory(summary, content);
        
        return summary;
      }
    } catch (error) {
      console.error('Error generating summary:', error);
      this.showError('Failed to generate summary. Please try again.');
    } finally {
      this.isSummarizing = false;
      this.hideLoadingState();
    }
    
    return null;
  }

  async generateChunkedSummary(content, options) {
    const limits = this.getTierLimits();
    const chunkSize = Math.floor(limits.characterLimit * 0.8); // Use 80% of limit to be safe
    const chunks = this.splitContentIntoChunks(content, chunkSize);
    
    console.log(`Processing large content (${content.length} chars) in ${chunks.length} chunks of ~${chunkSize} chars each`);
    
    // Show progress notification
    this.showNotification(`Processing large content in ${chunks.length} parts...`, 'info');
    
    let combinedSummaries = [];
    
    // Process each chunk
    for (let i = 0; i < chunks.length; i++) {
      try {
        console.log(`Processing chunk ${i + 1}/${chunks.length}...`);
        const chunkSummary = await this.callSummarizeAPI(chunks[i], options);
        
        if (chunkSummary) {
          combinedSummaries.push(chunkSummary);
        }
        
        // Update loading message
        if (chunks.length > 1) {
          this.updateLoadingMessage(`Processing part ${i + 1} of ${chunks.length}...`);
        }
      } catch (error) {
        console.error(`Error processing chunk ${i + 1}:`, error);
        // Continue with other chunks even if one fails
      }
    }
    
    if (combinedSummaries.length === 0) {
      throw new Error('Failed to process any content chunks');
    }
    
    // Combine all chunk summaries into a final cohesive summary
    if (combinedSummaries.length === 1) {
      return combinedSummaries[0];
    } else {
      return await this.combineChunkSummaries(combinedSummaries, options);
    }
  }

  splitContentIntoChunks(content, chunkSize) {
    const chunks = [];
    let currentPosition = 0;
    
    while (currentPosition < content.length) {
      let endPosition = currentPosition + chunkSize;
      
      // If we're not at the end, try to break at a sentence boundary
      if (endPosition < content.length) {
        const chunk = content.substring(currentPosition, endPosition);
        const lastPeriod = chunk.lastIndexOf('.');
        const lastExclamation = chunk.lastIndexOf('!');
        const lastQuestion = chunk.lastIndexOf('?');
        const lastNewline = chunk.lastIndexOf('\n');
        
        const lastSentenceEnd = Math.max(lastPeriod, lastExclamation, lastQuestion, lastNewline);
        
        // If we find a good breaking point in the last 20% of the chunk
        if (lastSentenceEnd > chunkSize * 0.8) {
          endPosition = currentPosition + lastSentenceEnd + 1;
        }
      }
      
      const chunk = content.substring(currentPosition, endPosition).trim();
      if (chunk.length > 0) {
        chunks.push(chunk);
      }
      
      currentPosition = endPosition;
    }
    
    return chunks;
  }

  async combineChunkSummaries(summaries, options) {
    const summaryType = options.type || 'detailed';
    
    // Create a prompt to combine all the chunk summaries into one cohesive summary
    const combinedContent = summaries.join('\n\n---\n\n');
    const combineOptions = {
      ...options,
      type: summaryType,
      includeKeyPoints: true
    };
    
    // Use a special prompt for combining summaries
    const combinePrompt = this.buildCombineSummariesPrompt(combinedContent, summaryType);
    
    try {
      const response = await fetch('/api/generate-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          prompt: combinePrompt, 
          content: combinedContent, 
          options: { ...combineOptions, isCombining: true } 
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const result = await response.json();
      return result.summary;
    } catch (error) {
      console.error('Failed to combine summaries, returning concatenated version:', error);
      // Fallback: return a simple concatenation with headers
      return this.createFallbackCombinedSummary(summaries, summaryType);
    }
  }

  buildCombineSummariesPrompt(combinedContent, type) {
    let systemPrompt = `You are an expert at creating cohesive study materials. You have been given multiple FlashNotes sections that were created from different parts of a larger document. Your task is to combine these sections into one unified, well-organized FlashNotes document.`;
    
    switch (type) {
      case 'quick':
        systemPrompt += ` Create a unified Quick/Bullet Point FlashNotes document. Organize the bullet points logically, remove duplicates, and ensure smooth flow between sections.`;
        break;
      case 'detailed':
        systemPrompt += ` Create a unified Detailed FlashNotes document. Organize content into logical paragraphs, ensure smooth transitions, and maintain comprehensive coverage.`;
        break;
      case 'study':
        systemPrompt += ` Create a unified Study Guide. Organize with clear headings, combine related concepts, and structure for optimal studying.`;
        break;
    }
    
    systemPrompt += ` Remove redundancy while preserving all important information. Ensure the final result reads as one cohesive document, not separate sections.`;
    
    return {
      system: systemPrompt,
      user: `Please combine these FlashNotes sections into one unified document:\n\n${combinedContent}`
    };
  }

  createFallbackCombinedSummary(summaries, type) {
    if (type === 'quick') {
      return summaries.join('\n\n');
    } else {
      return summaries.map((summary, index) => 
        `**Section ${index + 1}:**\n${summary}`
      ).join('\n\n');
    }
  }

  updateLoadingMessage(message) {
    const loadingElement = document.getElementById('summarizeLoading');
    const messageElement = loadingElement?.querySelector('p');
    if (messageElement) {
      messageElement.textContent = message;
    }
  }

  async callSummarizeAPI(content, options) {
    const summaryType = options.type || 'detailed';
    const includeKeyPoints = options.includeKeyPoints || true;
    
    const prompt = this.buildSummaryPrompt(content, summaryType, includeKeyPoints);
    
    try {
      const response = await fetch('/api/generate-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt, content, options })
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const result = await response.json();
      return result.summary;
    } catch (error) {
      console.error('API call failed:', error);
      throw error;
    }
  }

  buildSummaryPrompt(content, type, includeKeyPoints) {
    let systemPrompt = `You are an expert FlashNotes creator. Create optimized study materials from the provided content.`;
    
    switch (type) {
      case 'quick':
        systemPrompt += ` Create Quick/Bullet Point FlashNotes: Use bullet points and brief phrases to highlight the main concepts. Format for quick scanning and review. Keep it concise but comprehensive.`;
        break;
      case 'detailed':
        systemPrompt += ` Create Detailed/Paragraph FlashNotes: Write clear, well-structured paragraphs that explain concepts thoroughly. Include context, examples, and connections between ideas. Format for deep understanding.`;
        break;
      case 'study':
        systemPrompt += ` Create a comprehensive Study Guide: Organize content with clear headings, highlight key terms in **bold**, include examples in *italics*, and structure for optimal exam preparation and active recall.`;
        break;
    }
    
    if (includeKeyPoints) {
      systemPrompt += ` Always include the most important terms and concepts that would be valuable for study purposes and flashcard creation.`;
    }
    
    return {
      system: systemPrompt,
      user: `Please create FlashNotes from the following content:\n\n${content}`
    };
  }

  generateCacheKey(content, options) {
    const key = content.substring(0, 100) + JSON.stringify(options);
    return btoa(key).replace(/[^a-zA-Z0-9]/g, '').substring(0, 50);
  }

  saveToHistory(summary, originalContent) {
    const historyItem = {
      id: Date.now(),
      summary,
      originalContent: originalContent.substring(0, 500) + '...',
      timestamp: new Date().toISOString(),
      wordCount: summary.split(' ').length
    };

    this.summaryHistory.unshift(historyItem);
    
    // Keep only last 20 summaries
    if (this.summaryHistory.length > 20) {
      this.summaryHistory = this.summaryHistory.slice(0, 20);
    }

    this.saveSummaryHistory();
  }

  saveSummaryHistory() {
    try {
      localStorage.setItem('summaryHistory', JSON.stringify(this.summaryHistory));
    } catch (error) {
      console.error('Error saving summary history:', error);
    }
  }

  showLoadingState() {
    const loadingElement = document.getElementById('summarizeLoading');
    if (loadingElement) {
      loadingElement.style.display = 'block';
    }
  }

  hideLoadingState() {
    const loadingElement = document.getElementById('summarizeLoading');
    if (loadingElement) {
      loadingElement.style.display = 'none';
    }
  }

  showUpgradePrompt(reason) {
    const limits = this.getTierLimits();
    const nextTier = this.userTier === 'free' ? 'pro' : 'premium';
    const nextTierLimits = {
      'pro': { generations: 25, characterLimit: 25000, exportsPerMonth: 10 },
      'premium': { generations: 50, characterLimit: 50000, exportsPerMonth: 'unlimited' }
    }[nextTier];

    let upgradeMessage = `${reason}. Upgrade to ${nextTier} for `;
    
    if (reason.includes('export')) {
      // Export-specific upgrade message
      if (nextTier === 'premium') {
        upgradeMessage += `unlimited exports`;
      } else {
        upgradeMessage += `${nextTierLimits.exportsPerMonth} exports per month`;
      }
    } else {
      // Generation-specific upgrade message
      upgradeMessage += `${nextTierLimits.generations} FlashNotes per month`;
    }
    
    upgradeMessage += '.';

    this.showNotification(upgradeMessage, 'upgrade');
  }

  showError(message) {
    console.error(message);
    this.showNotification(message, 'error');
  }

  showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // Style the notification
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 1rem 1.5rem;
      background: ${type === 'error' ? '#ef4444' : type === 'upgrade' ? '#f59e0b' : '#3b82f6'};
      color: white;
      border-radius: 8px;
      z-index: 10000;
      max-width: 300px;
      animation: slideInFromRight 0.3s ease-out;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    `;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 5000);
  }

  setCurrentUser(user) {
    this.currentUser = user;
    if (user) {
      this.loadUserTier();
      this.loadUsageData();
      this.updateQuotaDisplay();
    }
  }

  setUserTier(tier) {
    this.userTier = tier;
    this.updateQuotaDisplay();
  }
}

// Create and export singleton instance
export const summarizeManager = new SummarizeManager();
window.summarizeManager = summarizeManager; 