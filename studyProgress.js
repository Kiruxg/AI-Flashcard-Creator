import { db } from "./config.js";
import {
  collection,
  doc,
  setDoc,
  getDoc,
  query,
  where,
  orderBy,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

export class StudyProgress {
  constructor(userId) {
    this.userId = userId;
    this.stats = {
      totalCards: 0,
      masteredCards: 0,
      learningCards: 0,
      reviewCards: 0,
      averageAccuracy: 0,
      studyStreak: 0,
      lastStudyDate: null,
    };
  }

  // Record a study session
  async recordStudySession(sessionData) {
    const sessionRef = doc(
      collection(db, "users", this.userId, "studySessions")
    );
    const session = {
      ...sessionData,
      timestamp: new Date(),
      userId: this.userId,
    };

    try {
      await setDoc(sessionRef, session);
      await this.updateStats(session);
      return true;
    } catch (error) {
      console.error("Error recording study session:", error);
      return false;
    }
  }

  // Update user statistics
  async updateStats(session) {
    const userRef = doc(db, "users", this.userId);
    const userDoc = await getDoc(userRef);
    const userData = userDoc.data();

    // Calculate new stats
    const newStats = {
      totalCards: (userData.totalCards || 0) + session.cardsStudied,
      masteredCards: (userData.masteredCards || 0) + session.masteredCards,
      learningCards: (userData.learningCards || 0) + session.learningCards,
      reviewCards: (userData.reviewCards || 0) + session.reviewCards,
      averageAccuracy: this.calculateAverageAccuracy(userData, session),
      studyStreak: this.calculateStudyStreak(userData, session.timestamp),
      lastStudyDate: session.timestamp,
    };

    // Update user document
    await setDoc(userRef, { stats: newStats }, { merge: true });
    this.stats = newStats;
  }

  // Calculate average accuracy
  calculateAverageAccuracy(userData, session) {
    const oldTotal =
      (userData.stats?.totalCards || 0) *
      (userData.stats?.averageAccuracy || 0);
    const newTotal = session.cardsStudied * session.accuracy;
    const totalCards = (userData.stats?.totalCards || 0) + session.cardsStudied;

    return totalCards > 0 ? (oldTotal + newTotal) / totalCards : 0;
  }

  // Calculate study streak
  calculateStudyStreak(userData, currentDate) {
    const lastStudyDate = userData.stats?.lastStudyDate?.toDate();
    const currentDateObj = new Date(currentDate);

    if (!lastStudyDate) return 1;

    const dayDifference = Math.floor(
      (currentDateObj - lastStudyDate) / (1000 * 60 * 60 * 24)
    );

    if (dayDifference === 1) {
      return (userData.stats?.studyStreak || 0) + 1;
    } else if (dayDifference === 0) {
      return userData.stats?.studyStreak || 0;
    } else {
      return 1;
    }
  }

  // Get study history
  async getStudyHistory(limit = 10) {
    try {
      const sessionsRef = collection(db, "users", this.userId, "studySessions");
      const q = query(sessionsRef, orderBy("timestamp", "desc"), limit(limit));

      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch (error) {
      console.error("Error getting study history:", error);
      return [];
    }
  }

  // Get progress report
  async getProgressReport() {
    try {
      const userRef = doc(db, "users", this.userId);
      const userDoc = await getDoc(userRef);
      const userData = userDoc.data();

      return {
        stats: userData.stats || this.stats,
        recentSessions: await this.getStudyHistory(5),
        recommendations: this.generateRecommendations(userData.stats),
      };
    } catch (error) {
      console.error("Error getting progress report:", error);
      return null;
    }
  }

  // Generate study recommendations
  generateRecommendations(stats) {
    const recommendations = [];

    if (stats?.averageAccuracy < 0.7) {
      recommendations.push("Focus on reviewing cards you find challenging");
    }

    if (stats?.studyStreak < 3) {
      recommendations.push("Try to study daily to build your streak");
    }

    if (stats?.learningCards > stats?.masteredCards) {
      recommendations.push("Spend more time on cards you're still learning");
    }

    return recommendations;
  }
}
