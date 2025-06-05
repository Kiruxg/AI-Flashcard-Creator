// Advanced Spaced Repetition System - Anki-level implementation
export class SpacedRepetition {
  constructor() {
    this.reviewData = new Map();
    this.config = {
      // Learning settings
      learningSteps: [1, 10], // minutes: 1min, 10min
      graduatingInterval: 1, // days
      easyInterval: 4, // days

      // Review settings
      startingEase: 2500, // 250% (Anki uses 2500)
      easyBonus: 1.3,
      hardInterval: 1.2,
      newInterval: 0.0, // When failed, start over

      // Advanced settings
      maximumInterval: 36500, // 100 years max
      intervalModifier: 1.0, // Global modifier
      fuzzRange: 0.05, // 5% fuzz for intervals

      // Daily limits
      newCardsPerDay: 20,
      reviewsPerDay: 200,

      // Retention settings
      requestRetention: 0.9, // 90% retention target

      // Timing settings
      minAnswerTime: 1.2, // seconds
      maxAnswerTime: 60.0, // seconds
    };

    this.cardStates = {
      NEW: "new",
      LEARNING: "learning",
      REVIEW: "review",
      RELEARNING: "relearning",
      SUSPENDED: "suspended",
      BURIED: "buried",
    };

    this.answerTypes = {
      AGAIN: 1, // Red - Failed
      HARD: 2, // Orange - Difficult
      GOOD: 3, // Green - Normal
      EASY: 4, // Blue - Easy
    };
  }

  // Initialize or get card data
  getCardData(cardId) {
    if (!this.reviewData.has(cardId)) {
      this.reviewData.set(cardId, this.createNewCard(cardId));
    }
    return this.reviewData.get(cardId);
  }

  // Create new card with default values
  createNewCard(cardId) {
    return {
      cardId,
      state: this.cardStates.NEW,
      ease: this.config.startingEase,
      interval: 0,
      reps: 0,
      lapses: 0,
      step: 0, // Current learning step
      due: new Date(),
      lastReview: null,
      totalReviews: 0,
      totalTime: 0,
      averageTime: 0,
      retrievalHistory: [], // Track success/failure
      lastInterval: 0,
      scheduledDays: 0,
      actualDays: 0,
      retention: null,
      difficulty: 0, // FSRS difficulty
      stability: 0, // FSRS stability
    };
  }

  // Main review function - enhanced with timing and better logic
  answerCard(cardId, answer, responseTime = null) {
    const card = this.getCardData(cardId);
    const now = new Date();

    // Update timing statistics
    if (responseTime) {
      card.totalTime += responseTime;
      card.totalReviews++;
      card.averageTime = card.totalTime / card.totalReviews;
    }

    // Track answer history for retention analysis
    card.retrievalHistory.push({
      answer,
      responseTime,
      date: now,
      interval: card.interval,
      ease: card.ease,
    });

    // Keep only last 100 reviews for performance
    if (card.retrievalHistory.length > 100) {
      card.retrievalHistory = card.retrievalHistory.slice(-100);
    }

    card.lastReview = now;

    // Handle different card states
    switch (card.state) {
      case this.cardStates.NEW:
        this.handleNewCard(card, answer);
        break;
      case this.cardStates.LEARNING:
        this.handleLearningCard(card, answer);
        break;
      case this.cardStates.REVIEW:
        this.handleReviewCard(card, answer);
        break;
      case this.cardStates.RELEARNING:
        this.handleRelearningCard(card, answer);
        break;
    }

    // Update FSRS parameters
    this.updateFSRSParameters(card, answer, responseTime);

    // Calculate retention rate
    this.updateRetentionRate(card);

    return card;
  }

  // Handle new cards
  handleNewCard(card, answer) {
    card.reps = 1;

    if (answer === this.answerTypes.AGAIN) {
      // Failed - stay in learning
      card.state = this.cardStates.LEARNING;
      card.step = 0;
      card.due = this.addMinutes(new Date(), this.config.learningSteps[0]);
    } else if (answer === this.answerTypes.EASY) {
      // Easy - graduate immediately
      card.state = this.cardStates.REVIEW;
      card.interval = this.config.easyInterval;
      card.due = this.addDays(new Date(), card.interval);
    } else {
      // Hard/Good - enter learning
      card.state = this.cardStates.LEARNING;
      card.step = 0;
      if (answer === this.answerTypes.HARD) {
        card.due = this.addMinutes(new Date(), this.config.learningSteps[0]);
      } else {
        // Good - skip first step if multiple learning steps
        if (this.config.learningSteps.length > 1) {
          card.step = 1;
          card.due = this.addMinutes(new Date(), this.config.learningSteps[1]);
        } else {
          card.due = this.addMinutes(new Date(), this.config.learningSteps[0]);
        }
      }
    }
  }

  // Handle learning cards
  handleLearningCard(card, answer) {
    if (answer === this.answerTypes.AGAIN) {
      // Failed - reset to first step
      card.step = 0;
      card.due = this.addMinutes(new Date(), this.config.learningSteps[0]);
      card.lapses++;
    } else if (answer === this.answerTypes.EASY) {
      // Easy - graduate immediately
      card.state = this.cardStates.REVIEW;
      card.interval = this.config.easyInterval;
      card.due = this.addDays(new Date(), card.interval);
      card.ease = Math.max(1300, card.ease + 150);
    } else {
      // Hard/Good - advance through learning steps
      if (card.step < this.config.learningSteps.length - 1) {
        // More learning steps
        card.step++;
        card.due = this.addMinutes(
          new Date(),
          this.config.learningSteps[card.step]
        );
      } else {
        // Graduate to review
        card.state = this.cardStates.REVIEW;
        card.interval = this.config.graduatingInterval;
        card.due = this.addDays(new Date(), card.interval);

        if (answer === this.answerTypes.HARD) {
          card.ease = Math.max(1300, card.ease - 150);
        }
      }
    }
  }

  // Handle review cards - Enhanced SM-2+ algorithm
  handleReviewCard(card, answer) {
    card.reps++;
    const lastInterval = card.interval;

    if (answer === this.answerTypes.AGAIN) {
      // Failed review - enter relearning
      card.state = this.cardStates.RELEARNING;
      card.step = 0;
      card.lapses++;
      card.ease = Math.max(1300, card.ease - 200);
      card.due = this.addMinutes(new Date(), this.config.learningSteps[0]);

      // New interval calculation based on ease and lapses
      const newIntervalFactor = Math.max(
        this.config.newInterval,
        (card.ease / 10000) * Math.pow(0.8, card.lapses)
      );
      card.interval = Math.max(
        1,
        Math.floor(card.interval * newIntervalFactor)
      );
    } else {
      // Successful review
      let intervalMultiplier;

      switch (answer) {
        case this.answerTypes.HARD:
          card.ease = Math.max(1300, card.ease - 150);
          intervalMultiplier = this.config.hardInterval;
          break;

        case this.answerTypes.GOOD:
          intervalMultiplier = card.ease / 10000;
          break;

        case this.answerTypes.EASY:
          card.ease = Math.max(1300, card.ease + 150);
          intervalMultiplier = (card.ease / 10000) * this.config.easyBonus;
          break;
      }

      // Apply interval modifier and calculate new interval
      card.interval = Math.max(
        1,
        Math.floor(
          card.interval * intervalMultiplier * this.config.intervalModifier
        )
      );

      // Apply maximum interval limit
      card.interval = Math.min(card.interval, this.config.maximumInterval);

      // Add fuzz to prevent clustering
      card.interval = this.addFuzz(card.interval);

      // Set due date
      card.due = this.addDays(new Date(), card.interval);
    }

    // Track interval performance
    card.lastInterval = lastInterval;
  }

  // Handle relearning cards
  handleRelearningCard(card, answer) {
    if (answer === this.answerTypes.AGAIN) {
      // Still failing - reset
      card.step = 0;
      card.due = this.addMinutes(new Date(), this.config.learningSteps[0]);
    } else if (answer === this.answerTypes.EASY) {
      // Easy - back to review with reduced interval
      card.state = this.cardStates.REVIEW;
      card.interval = Math.max(1, Math.floor(card.lastInterval * 0.5));
      card.due = this.addDays(new Date(), card.interval);
    } else {
      // Hard/Good - continue relearning or graduate
      if (card.step < this.config.learningSteps.length - 1) {
        card.step++;
        card.due = this.addMinutes(
          new Date(),
          this.config.learningSteps[card.step]
        );
      } else {
        // Graduate back to review
        card.state = this.cardStates.REVIEW;
        card.interval = Math.max(1, Math.floor(card.lastInterval * 0.7));
        card.due = this.addDays(new Date(), card.interval);
      }
    }
  }

  // FSRS Algorithm implementation for better predictions
  updateFSRSParameters(card, answer, responseTime) {
    // Simplified FSRS implementation
    const success = answer >= this.answerTypes.GOOD;
    const difficulty = this.calculateDifficulty(card, success, responseTime);
    const stability = this.calculateStability(card, success, difficulty);

    card.difficulty = Math.max(1, Math.min(10, difficulty));
    card.stability = Math.max(0.1, stability);
  }

  calculateDifficulty(card, success, responseTime) {
    // FSRS difficulty calculation
    let difficulty = card.difficulty || 5;

    if (success) {
      difficulty -= 0.2;
    } else {
      difficulty += 1.0;
    }

    // Adjust based on response time
    if (responseTime) {
      const timeWeight = Math.max(
        0.5,
        Math.min(2.0, responseTime / card.averageTime)
      );
      difficulty += (timeWeight - 1.0) * 0.5;
    }

    return Math.max(1, Math.min(10, difficulty));
  }

  calculateStability(card, success, difficulty) {
    let stability = card.stability || 1;

    if (success) {
      // Increase stability
      const stabilityIncrease = Math.exp(0.1 * (11 - difficulty));
      stability *= stabilityIncrease;
    } else {
      // Decrease stability
      stability *= 0.3;
    }

    return Math.max(0.1, stability);
  }

  // Update retention rate based on review history
  updateRetentionRate(card) {
    if (card.retrievalHistory.length < 5) return;

    const recentReviews = card.retrievalHistory.slice(-20);
    const successes = recentReviews.filter(
      (r) => r.answer >= this.answerTypes.GOOD
    ).length;
    card.retention = successes / recentReviews.length;
  }

  // Get cards due for review with advanced filtering
  getDueCards(
    cards,
    includeNew = true,
    includeReview = true,
    includeLearning = true
  ) {
    const now = new Date();

    return cards.filter((card) => {
      const cardData = this.getCardData(card.id);

      // Check if card is suspended or buried
      if (
        cardData.state === this.cardStates.SUSPENDED ||
        cardData.state === this.cardStates.BURIED
      ) {
        return false;
      }

      // Check if card is due
      const isDue = cardData.due <= now;

      // Filter by type
      if (cardData.state === this.cardStates.NEW && !includeNew) return false;
      if (cardData.state === this.cardStates.REVIEW && !includeReview)
        return false;
      if (
        (cardData.state === this.cardStates.LEARNING ||
          cardData.state === this.cardStates.RELEARNING) &&
        !includeLearning
      )
        return false;

      return isDue;
    });
  }

  // Enhanced statistics
  getAdvancedStats(cards) {
    const stats = {
      // Basic counts
      total: cards.length,
      new: 0,
      learning: 0,
      review: 0,
      relearning: 0,
      suspended: 0,
      buried: 0,

      // Due counts
      dueNew: 0,
      dueLearning: 0,
      dueReview: 0,
      overdue: 0,

      // Performance metrics
      averageEase: 0,
      averageInterval: 0,
      averageRetention: 0,
      totalLapses: 0,
      totalReviews: 0,

      // Time metrics
      averageAnswerTime: 0,
      totalStudyTime: 0,

      // Predictions
      estimatedDailyReviews: 0,
      retentionRate: 0,

      // Difficulty distribution
      difficultyDistribution: { easy: 0, medium: 0, hard: 0 },

      // Workload prediction
      workload: this.calculateWorkload(cards),
    };

    const now = new Date();
    let totalEase = 0;
    let totalInterval = 0;
    let totalRetention = 0;
    let totalTime = 0;
    let retentionCount = 0;
    let easeCount = 0;
    let intervalCount = 0;

    cards.forEach((card) => {
      const cardData = this.getCardData(card.id);

      // Count by state
      stats[cardData.state]++;

      // Count due cards
      const isDue = cardData.due <= now;
      if (isDue) {
        if (cardData.state === this.cardStates.NEW) stats.dueNew++;
        else if (cardData.state === this.cardStates.LEARNING)
          stats.dueLearning++;
        else if (cardData.state === this.cardStates.REVIEW) stats.dueReview++;

        // Check if overdue
        const daysDue = Math.floor(
          (now - cardData.due) / (1000 * 60 * 60 * 24)
        );
        if (daysDue > 0) stats.overdue++;
      }

      // Accumulate metrics
      if (cardData.state === this.cardStates.REVIEW) {
        totalEase += cardData.ease;
        totalInterval += cardData.interval;
        easeCount++;
        intervalCount++;
      }

      if (cardData.retention !== null) {
        totalRetention += cardData.retention;
        retentionCount++;
      }

      stats.totalLapses += cardData.lapses;
      stats.totalReviews += cardData.totalReviews;
      totalTime += cardData.totalTime;

      // Difficulty distribution
      if (cardData.difficulty <= 3) stats.difficultyDistribution.easy++;
      else if (cardData.difficulty <= 7) stats.difficultyDistribution.medium++;
      else stats.difficultyDistribution.hard++;
    });

    // Calculate averages
    if (easeCount > 0) stats.averageEase = totalEase / easeCount;
    if (intervalCount > 0)
      stats.averageInterval = totalInterval / intervalCount;
    if (retentionCount > 0)
      stats.averageRetention = totalRetention / retentionCount;
    if (stats.totalReviews > 0)
      stats.averageAnswerTime = totalTime / stats.totalReviews;
    stats.totalStudyTime = totalTime;

    // Calculate retention rate
    stats.retentionRate = stats.averageRetention;

    return stats;
  }

  // Calculate workload prediction for next 30 days
  calculateWorkload(cards) {
    const workload = Array.from({ length: 30 }, () => ({
      date: new Date(),
      count: 0,
    }));
    const now = new Date();

    cards.forEach((card) => {
      const cardData = this.getCardData(card.id);
      if (cardData.state === this.cardStates.REVIEW && cardData.due > now) {
        const daysFromNow = Math.floor(
          (cardData.due - now) / (1000 * 60 * 60 * 24)
        );
        if (daysFromNow < 30) {
          workload[daysFromNow].count++;
          workload[daysFromNow].date = new Date(
            now.getTime() + daysFromNow * 24 * 60 * 60 * 1000
          );
        }
      }
    });

    return workload;
  }

  // Suspend/unsuspend cards
  suspendCard(cardId) {
    const card = this.getCardData(cardId);
    card.state = this.cardStates.SUSPENDED;
  }

  unsuspendCard(cardId) {
    const card = this.getCardData(cardId);
    if (card.state === this.cardStates.SUSPENDED) {
      card.state =
        card.reps === 0 ? this.cardStates.NEW : this.cardStates.REVIEW;
    }
  }

  // Bury/unbury cards
  buryCard(cardId) {
    const card = this.getCardData(cardId);
    card.state = this.cardStates.BURIED;
  }

  unburyCard(cardId) {
    const card = this.getCardData(cardId);
    if (card.state === this.cardStates.BURIED) {
      card.state =
        card.reps === 0 ? this.cardStates.NEW : this.cardStates.REVIEW;
    }
  }

  // Utility functions
  addMinutes(date, minutes) {
    return new Date(date.getTime() + minutes * 60 * 1000);
  }

  addDays(date, days) {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  }

  addFuzz(interval) {
    if (interval < 7) return interval; // No fuzz for short intervals

    const fuzz = interval * this.config.fuzzRange;
    const randomFuzz = (Math.random() - 0.5) * 2 * fuzz;
    return Math.max(1, Math.round(interval + randomFuzz));
  }

  // Reset card (for testing or manual reset)
  resetCard(cardId) {
    this.reviewData.delete(cardId);
  }

  // Export/import card data
  exportData() {
    const data = {};
    this.reviewData.forEach((value, key) => {
      data[key] = value;
    });
    return JSON.stringify(data);
  }

  importData(jsonData) {
    const data = JSON.parse(jsonData);
    this.reviewData.clear();
    Object.entries(data).forEach(([key, value]) => {
      // Convert date strings back to Date objects
      if (value.due) value.due = new Date(value.due);
      if (value.lastReview) value.lastReview = new Date(value.lastReview);
      if (value.retrievalHistory) {
        value.retrievalHistory.forEach((entry) => {
          if (entry.date) entry.date = new Date(entry.date);
        });
      }
      this.reviewData.set(key, value);
    });
  }

  // Add predictNextInterval method
  predictNextInterval(cardId, performance) {
    const card = this.getCardData(cardId);
    if (!card) return 1;

    // Clone the card to simulate the next interval without modifying the actual card
    const simulatedCard = { ...card };

    switch (simulatedCard.state) {
      case this.cardStates.NEW:
      case this.cardStates.LEARNING:
      case this.cardStates.RELEARNING:
        // For new/learning cards, return 1 day for good/easy, same day for again/hard
        return performance >= 3 ? 1 : 0;

      case this.cardStates.REVIEW:
        // Calculate next interval based on performance
        let intervalMultiplier;
        switch (performance) {
          case 1: // Again
            return Math.max(1, Math.floor(simulatedCard.interval * 0.2));
          case 2: // Hard
            intervalMultiplier = 1.2;
            break;
          case 3: // Good
            intervalMultiplier = simulatedCard.ease / 1000;
            break;
          case 4: // Easy
            intervalMultiplier = (simulatedCard.ease / 1000) * 1.3;
            break;
          default:
            return simulatedCard.interval;
        }

        // Apply interval modifier and calculate new interval
        const newInterval = Math.max(
          1,
          Math.floor(
            simulatedCard.interval *
              intervalMultiplier *
              this.config.intervalModifier
          )
        );

        // Apply maximum interval limit
        return Math.min(newInterval, this.config.maximumInterval);
    }

    return 1; // Default to 1 day if no other condition matches
  }
}
