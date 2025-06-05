import { auth, db } from "./supabase-config.js";
import { showAuthModal } from "./auth-modal-supabase.js";

class MyDecksManager {
  constructor() {
    this.decks = [];
    this.currentUser = null;
    this.initializeAuth();
  }

  initializeAuth() {
    auth.onAuthStateChange((event, session) => {
      this.currentUser = session?.user;
      if (this.currentUser) {
        this.loadDecks();
        this.updateStats();
      } else {
        window.location.href = "/?auth=required";
      }
    });
  }

  async loadDecks() {
    try {
      const { data: decks, error } = await db
        .from("decks")
        .select("*")
        .eq("user_id", this.currentUser.id)
        .order("updated_at", { ascending: false });

      if (error) throw error;

      this.decks = decks;
      this.displayDecks(decks);
      document.getElementById("decksLoadingPlaceholder").style.display = "none";
    } catch (error) {
      console.error("Error loading decks:", error);
      // Show error state
    }
  }

  async updateStats() {
    try {
      // Get total decks
      const totalDecks = this.decks.length;

      // Get total cards
      const totalCards = this.decks.reduce(
        (sum, deck) => sum + (deck.cards?.length || 0),
        0
      );

      // Get cards learned and due today
      const { data: progress, error } = await db
        .from("study_progress")
        .select("*")
        .eq("user_id", this.currentUser.id);

      if (error) throw error;

      const now = new Date();
      const cardsLearned = progress.filter((p) => p.last_reviewed).length;
      const dueCards = progress.filter((p) => {
        const dueDate = new Date(p.next_review);
        return dueDate <= now;
      }).length;

      // Update UI
      document.getElementById("totalDecks").textContent = totalDecks;
      document.getElementById("totalCards").textContent = totalCards;
      document.getElementById("cardsLearned").textContent = cardsLearned;
      document.getElementById("dueCards").textContent = dueCards;
    } catch (error) {
      console.error("Error updating stats:", error);
    }
  }

  displayDecks(decks = []) {
    const decksList = document.getElementById("decksList");
    const emptyState = document.getElementById("emptyDecksState");

    if (decks.length === 0) {
      decksList.innerHTML = "";
      emptyState.style.display = "block";
      return;
    }

    emptyState.style.display = "none";
    decksList.innerHTML = decks
      .map(
        (deck) => `
        <div class="deck-card">
          <div class="deck-info">
            <h3>${deck.name}</h3>
            <p>${deck.description || "No description"}</p>
            <div class="deck-stats">
              <span><i class="fas fa-clone"></i> ${
                deck.cards?.length || 0
              } cards</span>
              <span><i class="fas fa-clock"></i> Last updated ${new Date(
                deck.updated_at
              ).toLocaleDateString()}</span>
            </div>
          </div>
          <div class="deck-actions">
            <button onclick="studyDeck('${
              deck.id
            }')" class="btn btn-primary btn-sm">
              <i class="fas fa-graduation-cap"></i> Study
            </button>
            <button onclick="editDeck('${
              deck.id
            }')" class="btn btn-secondary btn-sm">
              <i class="fas fa-edit"></i> Edit
            </button>
            <button onclick="deleteDeck('${
              deck.id
            }')" class="btn btn-danger btn-sm">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
      `
      )
      .join("");
  }

  async createDeck(name, description) {
    try {
      const { data: deck, error } = await db
        .from("decks")
        .insert([
          {
            name,
            description,
            user_id: this.currentUser.id,
            cards: [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ])
        .select()
        .single();

      if (error) throw error;

      this.decks.unshift(deck);
      this.displayDecks(this.decks);
      this.updateStats();
      hideModal("createDeckModal");
    } catch (error) {
      console.error("Error creating deck:", error);
      // Show error message
    }
  }

  async deleteDeck(deckId) {
    if (!confirm("Are you sure you want to delete this deck?")) return;

    try {
      const { error } = await db
        .from("decks")
        .delete()
        .eq("id", deckId)
        .eq("user_id", this.currentUser.id);

      if (error) throw error;

      this.decks = this.decks.filter((deck) => deck.id !== deckId);
      this.displayDecks(this.decks);
      this.updateStats();
    } catch (error) {
      console.error("Error deleting deck:", error);
      // Show error message
    }
  }

  studyDeck(deckId) {
    window.location.href = `study.html?deck=${deckId}`;
  }

  editDeck(deckId) {
    window.location.href = `create-deck.html?deck=${deckId}`;
  }

  handleSearch(query) {
    const filteredDecks = this.decks.filter((deck) =>
      deck.name.toLowerCase().includes(query.toLowerCase())
    );
    this.displayDecks(filteredDecks);
  }

  handleSort(sortBy) {
    let sortedDecks = [...this.decks];
    switch (sortBy) {
      case "recent":
        sortedDecks.sort(
          (a, b) => new Date(b.updated_at) - new Date(a.updated_at)
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
          (a, b) => new Date(b.last_studied) - new Date(a.last_studied)
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
