import { auth, db } from "./config.js";
import { DeckManager } from "./deckManager.js";
import { StudyProgress } from "./studyProgress.js";
import { showNotification } from "./utils.js";

class MyDecksManager {
  constructor() {
    this.deckManager = null;
    this.studyProgress = null;
    this.decks = [];
    this.initializeAuth();
  }

  initializeAuth() {
    auth.onAuthStateChanged(async (user) => {
      if (user && user.emailVerified) {
        this.deckManager = new DeckManager(user.uid);
        this.studyProgress = new StudyProgress(user.uid);
        await this.loadDecks();
        await this.updateStats();
      } else {
        // If user is not verified or not logged in, redirect to home
        window.location.href = "/?auth=required";
      }
    });
  }

  async loadDecks() {
    try {
      // Show loading state
      document.getElementById("decksLoadingPlaceholder").style.display =
        "block";
      document.getElementById("emptyDecksState").style.display = "none";
      document.getElementById("decksList").innerHTML = "";

      // Load decks
      this.decks = await this.deckManager.loadDecks();

      // Update display
      if (this.decks.length === 0) {
        document.getElementById("decksLoadingPlaceholder").style.display =
          "none";
        document.getElementById("emptyDecksState").style.display = "block";
      } else {
        this.displayDecks(this.decks);
      }
    } catch (error) {
      console.error("Error loading decks:", error);
      showNotification("Failed to load decks. Please try again.", "error");
    } finally {
      document.getElementById("decksLoadingPlaceholder").style.display = "none";
    }
  }

  async updateStats() {
    try {
      const stats = await this.studyProgress.getUserStats();
      const dueCards = await this.studyProgress.getDueCards();

      document.getElementById("totalDecks").textContent = this.decks.length;
      document.getElementById("totalCards").textContent = this.decks.reduce(
        (total, deck) => total + (deck.cards?.length || 0),
        0
      );
      document.getElementById("cardsLearned").textContent =
        stats.masteredCards || 0;
      document.getElementById("dueCards").textContent = dueCards.length;
    } catch (error) {
      console.error("Error updating stats:", error);
    }
  }

  displayDecks(decks) {
    const decksList = document.getElementById("decksList");
    decksList.innerHTML = "";

    decks.forEach((deck) => {
      const deckElement = document.createElement("div");
      deckElement.className = "deck-card";
      deckElement.innerHTML = `
        <div class="deck-card-header">
          <h3 class="deck-card-title">${deck.name}</h3>
          <span class="deck-card-date">${new Date(
            deck.updatedAt
          ).toLocaleDateString()}</span>
        </div>
        <div class="deck-card-stats">
          <span class="deck-card-stat">
            <i class="fas fa-clone"></i>
            ${deck.cards?.length || 0} cards
          </span>
          <span class="deck-card-stat">
            <i class="fas fa-graduation-cap"></i>
            ${deck.stats?.mastered || 0} mastered
          </span>
          <span class="deck-card-stat">
            <i class="fas fa-clock"></i>
            ${deck.stats?.due || 0} due
          </span>
        </div>
        <div class="deck-card-progress">
          <div class="progress-bar" style="width: ${
            ((deck.stats?.mastered || 0) / (deck.cards?.length || 1)) * 100
          }%"></div>
        </div>
        <div class="deck-card-actions">
          <button class="btn btn-primary" onclick="studyDeck('${deck.id}')">
            <i class="fas fa-play"></i> Study
          </button>
          <button class="btn btn-secondary" onclick="editDeck('${deck.id}')">
            <i class="fas fa-edit"></i> Edit
          </button>
          <button class="btn btn-danger" onclick="deleteDeck('${deck.id}')">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      `;
      decksList.appendChild(deckElement);
    });
  }

  async createDeck(name, description) {
    try {
      const deck = await this.deckManager.saveDeck(name, [], {
        description,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        stats: {
          mastered: 0,
          due: 0,
        },
      });
      await this.loadDecks();
      showNotification("Deck created successfully!", "success");
      hideModal("createDeckModal");
    } catch (error) {
      console.error("Error creating deck:", error);
      showNotification("Failed to create deck. Please try again.", "error");
    }
  }

  async deleteDeck(deckId) {
    if (!confirm("Are you sure you want to delete this deck?")) return;

    try {
      await this.deckManager.deleteDeck(deckId);
      await this.loadDecks();
      showNotification("Deck deleted successfully!", "success");
    } catch (error) {
      console.error("Error deleting deck:", error);
      showNotification("Failed to delete deck. Please try again.", "error");
    }
  }

  studyDeck(deckId) {
    window.location.href = `/study.html?deck=${deckId}`;
  }

  editDeck(deckId) {
    window.location.href = `/create-deck.html?deck=${deckId}`;
  }

  // Search and sort functionality
  handleSearch(query) {
    const filteredDecks = this.decks.filter((deck) =>
      deck.name.toLowerCase().includes(query.toLowerCase())
    );
    this.displayDecks(filteredDecks);
  }

  handleSort(sortBy) {
    const sortedDecks = [...this.decks];
    switch (sortBy) {
      case "recent":
        sortedDecks.sort(
          (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
        );
        break;
      case "name":
        sortedDecks.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "cards":
        sortedDecks.sort(
          (a, b) => (b.cards?.length || 0) - (a.cards?.length || 0)
        );
        break;
      case "studied":
        sortedDecks.sort(
          (a, b) =>
            new Date(b.stats?.lastStudied || 0) -
            new Date(a.stats?.lastStudied || 0)
        );
        break;
    }
    this.displayDecks(sortedDecks);
  }
}

// Initialize page
document.addEventListener("DOMContentLoaded", () => {
  const myDecks = new MyDecksManager();

  // Initialize search
  const searchInput = document.getElementById("deckSearch");
  let searchTimeout;
  searchInput.addEventListener("input", (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      myDecks.handleSearch(e.target.value);
    }, 300);
  });

  // Initialize sort
  const sortSelect = document.getElementById("sortDecks");
  sortSelect.addEventListener("change", (e) => {
    myDecks.handleSort(e.target.value);
  });

  // Initialize create deck form
  const createDeckForm = document.getElementById("createDeckForm");
  createDeckForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("deckName").value;
    const description = document.getElementById("deckDescription").value;
    await myDecks.createDeck(name, description);
  });

  // Make functions available globally
  window.studyDeck = (deckId) => myDecks.studyDeck(deckId);
  window.editDeck = (deckId) => myDecks.editDeck(deckId);
  window.deleteDeck = (deckId) => myDecks.deleteDeck(deckId);
  window.showCreateDeckModal = () =>
    (document.getElementById("createDeckModal").style.display = "block");
  window.hideModal = (modalId) =>
    (document.getElementById(modalId).style.display = "none");
});
