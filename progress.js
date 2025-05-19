import { auth, db } from "./config.js";
import { StudyProgress } from "./studyProgress.js";

class ProgressDashboard {
  constructor() {
    this.studyProgress = new StudyProgress();
    this.charts = {};
    this.initializeAuth();
    this.initializeCharts();
  }

  async initializeAuth() {
    auth.onAuthStateChanged(async (user) => {
      if (user) {
        document.getElementById("userMenu").style.display = "flex";
        document.getElementById("showLoginBtn").style.display = "none";
        document.getElementById("userEmail").textContent = user.email;
        await this.loadProgressData();
      } else {
        document.getElementById("userMenu").style.display = "none";
        document.getElementById("showLoginBtn").style.display = "block";
        this.clearDashboard();
      }
    });

    // Auth event listeners
    document.getElementById("showLoginBtn").addEventListener("click", () => {
      document.getElementById("authModal").style.display = "block";
    });

    document.getElementById("logoutBtn").addEventListener("click", () => {
      auth.signOut();
    });
  }

  initializeCharts() {
    // Study Activity Chart
    const activityCtx = document
      .getElementById("studyActivityChart")
      .getContext("2d");
    this.charts.activity = new Chart(activityCtx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "Cards Studied",
            data: [],
            borderColor: "#4CAF50",
            tension: 0.1,
          },
        ],
      },
      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: true,
          },
        },
      },
    });

    // Mastery Chart
    const masteryCtx = document.getElementById("masteryChart").getContext("2d");
    this.charts.mastery = new Chart(masteryCtx, {
      type: "doughnut",
      data: {
        labels: ["Mastered", "Learning", "Not Started"],
        datasets: [
          {
            data: [0, 0, 0],
            backgroundColor: ["#4CAF50", "#FFC107", "#9E9E9E"],
          },
        ],
      },
      options: {
        responsive: true,
      },
    });
  }

  async loadProgressData() {
    try {
      const stats = await this.studyProgress.getUserStats();
      const history = await this.studyProgress.getStudyHistory();
      const recommendations = await this.studyProgress.getRecommendations();

      this.updateStats(stats);
      this.updateCharts(stats, history);
      this.updateHistory(history);
      this.updateRecommendations(recommendations);
    } catch (error) {
      console.error("Error loading progress data:", error);
    }
  }

  updateStats(stats) {
    document.getElementById("studyStreak").textContent = stats.streak || 0;
    document.getElementById("totalCards").textContent = stats.totalCards || 0;
    document.getElementById("masteryRate").textContent = `${
      Math.round((stats.masteredCards / stats.totalCards) * 100) || 0
    }%`;
    document.getElementById("accuracy").textContent = `${
      Math.round(stats.averageAccuracy) || 0
    }%`;
  }

  updateCharts(stats, history) {
    // Update Study Activity Chart
    const last7Days = this.getLast7Days();
    const activityData = this.processActivityData(history, last7Days);

    this.charts.activity.data.labels = last7Days.map((date) =>
      date.toLocaleDateString("en-US", { weekday: "short" })
    );
    this.charts.activity.data.datasets[0].data = activityData;
    this.charts.activity.update();

    // Update Mastery Chart
    this.charts.mastery.data.datasets[0].data = [
      stats.masteredCards || 0,
      stats.learningCards || 0,
      stats.notStartedCards || 0,
    ];
    this.charts.mastery.update();
  }

  updateHistory(history) {
    const historyContainer = document.getElementById("studyHistory");
    historyContainer.innerHTML = "";

    history.slice(0, 5).forEach((session) => {
      const sessionElement = document.createElement("div");
      sessionElement.className = "history-item";
      sessionElement.innerHTML = `
        <div class="history-date">${new Date(
          session.timestamp
        ).toLocaleDateString()}</div>
        <div class="history-details">
          <span>${session.cardsStudied} cards</span>
          <span>${Math.round(session.accuracy)}% accuracy</span>
        </div>
      `;
      historyContainer.appendChild(sessionElement);
    });
  }

  updateRecommendations(recommendations) {
    const recommendationsContainer = document.getElementById("recommendations");
    recommendationsContainer.innerHTML = "";

    recommendations.forEach((rec) => {
      const recElement = document.createElement("div");
      recElement.className = "recommendation-item";
      recElement.innerHTML = `
        <h4>${rec.title}</h4>
        <p>${rec.description}</p>
      `;
      recommendationsContainer.appendChild(recElement);
    });
  }

  getLast7Days() {
    const dates = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      dates.push(date);
    }
    return dates;
  }

  processActivityData(history, dates) {
    return dates.map((date) => {
      const dayHistory = history.filter((session) => {
        const sessionDate = new Date(session.timestamp);
        return sessionDate.toDateString() === date.toDateString();
      });
      return dayHistory.reduce(
        (total, session) => total + session.cardsStudied,
        0
      );
    });
  }

  clearDashboard() {
    // Reset all stats
    document.getElementById("studyStreak").textContent = "0";
    document.getElementById("totalCards").textContent = "0";
    document.getElementById("masteryRate").textContent = "0%";
    document.getElementById("accuracy").textContent = "0%";

    // Clear charts
    this.charts.activity.data.labels = [];
    this.charts.activity.data.datasets[0].data = [];
    this.charts.activity.update();

    this.charts.mastery.data.datasets[0].data = [0, 0, 0];
    this.charts.mastery.update();

    // Clear history and recommendations
    document.getElementById("studyHistory").innerHTML = "";
    document.getElementById("recommendations").innerHTML = "";
  }
}

// Initialize the dashboard
const dashboard = new ProgressDashboard();
