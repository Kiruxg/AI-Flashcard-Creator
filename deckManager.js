import { db } from "./config.js";
import {
  doc,
  collection,
  getDocs,
  setDoc,
  deleteDoc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

export class DeckManager {
  constructor(userId) {
    this.userId = userId;
    this.decksCollection = collection(db, "users", userId, "decks");
  }

  async loadDecks() {
    try {
      const snapshot = await getDocs(this.decksCollection);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch (error) {
      console.error("Error loading decks:", error);
      throw new Error("Failed to load decks");
    }
  }

  async getDeck(deckId) {
    try {
      const deckRef = doc(this.decksCollection, deckId);
      const deckDoc = await getDoc(deckRef);

      if (!deckDoc.exists()) {
        throw new Error("Deck not found");
      }

      return {
        id: deckDoc.id,
        ...deckDoc.data(),
      };
    } catch (error) {
      console.error("Error getting deck:", error);
      throw new Error("Failed to get deck");
    }
  }

  async saveDeck(deckName, cards) {
    try {
      const deckData = {
        name: deckName,
        cards: cards,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        cardCount: cards.length,
      };

      const deckRef = doc(this.decksCollection);
      await setDoc(deckRef, deckData);

      return {
        id: deckRef.id,
        ...deckData,
      };
    } catch (error) {
      console.error("Error saving deck:", error);
      throw new Error("Failed to save deck");
    }
  }

  async updateDeck(deckId, updates) {
    try {
      const deckRef = doc(this.decksCollection, deckId);
      const deckDoc = await getDoc(deckRef);

      if (!deckDoc.exists()) {
        throw new Error("Deck not found");
      }

      const updatedData = {
        ...deckDoc.data(),
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      await setDoc(deckRef, updatedData);

      return {
        id: deckId,
        ...updatedData,
      };
    } catch (error) {
      console.error("Error updating deck:", error);
      throw new Error("Failed to update deck");
    }
  }

  async deleteDeck(deckId) {
    try {
      const deckRef = doc(this.decksCollection, deckId);
      const deckDoc = await getDoc(deckRef);

      if (!deckDoc.exists()) {
        throw new Error("Deck not found");
      }

      await deleteDoc(deckRef);
    } catch (error) {
      console.error("Error deleting deck:", error);
      throw new Error("Failed to delete deck");
    }
  }
}
