// Spaced Repetition Algorithm Implementation
export class SpacedRepetition {
  constructor() {
    this.reviewData = new Map();
    this.studyStats = {
      totalReviews: 0,
      correctAnswers: 0,
      incorrectAnswers: 0,
      averageResponseTime: 0,
      lastStudySession: null,
      studyStreak: 0,
    };
  }

  // Calculate next review time using SuperMemo 2 algorithm
  calculateNextReview(cardId, performance) {
    const now = Date.now();
    const cardData = this.reviewData.get(cardId) || {
      repetitions: 0,
      easeFactor: 2.5,
      interval: 0,
      nextReview: now,
    };

    // Update ease factor based on performance (0-5 scale)
    const newEaseFactor = Math.max(
      1.3,
      cardData.easeFactor +
        (0.1 - (5 - performance) * (0.08 + (5 - performance) * 0.02))
    );

    // Calculate new interval
    let newInterval;
    if (cardData.repetitions === 0) {
      newInterval = 1; // First review: 1 day
    } else if (cardData.repetitions === 1) {
      newInterval = 6; // Second review: 6 days
    } else {
      newInterval = Math.round(cardData.interval * cardData.easeFactor);
    }

    // Update card data
    const updatedData = {
      ...cardData,
      repetitions: cardData.repetitions + 1,
      easeFactor: newEaseFactor,
      interval: newInterval,
      nextReview: now + newInterval * 24 * 60 * 60 * 1000,
      lastReview: now,
      performance,
    };

    this.reviewData.set(cardId, updatedData);
    this.updateStudyStats(performance);
    return updatedData;
  }

  // Update study statistics
  updateStudyStats(performance) {
    const now = Date.now();
    this.studyStats.totalReviews++;

    if (performance >= 3) {
      this.studyStats.correctAnswers++;
    } else {
      this.studyStats.incorrectAnswers++;
    }

    // Update study streak
    if (this.studyStats.lastStudySession) {
      const daysSinceLastStudy = Math.floor(
        (now - this.studyStats.lastStudySession) / (24 * 60 * 60 * 1000)
      );
      if (daysSinceLastStudy <= 1) {
        this.studyStats.studyStreak++;
      } else {
        this.studyStats.studyStreak = 1;
      }
    } else {
      this.studyStats.studyStreak = 1;
    }

    this.studyStats.lastStudySession = now;
  }

  // Get cards due for review
  getDueCards(cards) {
    const now = Date.now();
    return cards.filter((card) => {
      const cardData = this.reviewData.get(card.id);
      return !cardData || cardData.nextReview <= now;
    });
  }

  // Get study statistics
  getStudyStats() {
    const accuracy =
      this.studyStats.totalReviews > 0
        ? (this.studyStats.correctAnswers / this.studyStats.totalReviews) * 100
        : 0;

    return {
      ...this.studyStats,
      accuracy: Math.round(accuracy * 100) / 100,
      cardsDue: this.getDueCardsCount(),
      nextReviewDate: this.getNextReviewDate(),
    };
  }

  // Get number of cards due for review
  getDueCardsCount() {
    const now = Date.now();
    return Array.from(this.reviewData.values()).filter(
      (data) => data.nextReview <= now
    ).length;
  }

  // Get next review date
  getNextReviewDate() {
    const now = Date.now();
    const nextReviews = Array.from(this.reviewData.values())
      .map((data) => data.nextReview)
      .filter((date) => date > now);

    return nextReviews.length > 0 ? new Date(Math.min(...nextReviews)) : null;
  }

  // Get card difficulty distribution
  getDifficultyDistribution() {
    const distribution = {
      easy: 0,
      medium: 0,
      hard: 0,
    };

    this.reviewData.forEach((data) => {
      if (data.easeFactor >= 2.5) {
        distribution.easy++;
      } else if (data.easeFactor >= 1.5) {
        distribution.medium++;
      } else {
        distribution.hard++;
      }
    });

    return distribution;
  }

  // Get study history
  getStudyHistory(days = 7) {
    const history = [];
    const now = Date.now();
    const dayInMs = 24 * 60 * 60 * 1000;

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now - i * dayInMs);
      const dayStart = date.setHours(0, 0, 0, 0);
      const dayEnd = dayStart + dayInMs;

      const dayStats = {
        date: new Date(dayStart),
        reviews: 0,
        correct: 0,
        incorrect: 0,
      };

      this.reviewData.forEach((data) => {
        if (data.lastReview >= dayStart && data.lastReview < dayEnd) {
          dayStats.reviews++;
          if (data.performance >= 3) {
            dayStats.correct++;
          } else {
            dayStats.incorrect++;
          }
        }
      });

      history.push(dayStats);
    }

    return history;
  }

  // Reset study data for a card
  resetCard(cardId) {
    this.reviewData.delete(cardId);
  }

  // Reset all study data
  resetAll() {
    this.reviewData.clear();
    this.studyStats = {
      totalReviews: 0,
      correctAnswers: 0,
      incorrectAnswers: 0,
      averageResponseTime: 0,
      lastStudySession: null,
      studyStreak: 0,
    };
  }
}
