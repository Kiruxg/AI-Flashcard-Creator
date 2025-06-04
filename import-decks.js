import admin from "firebase-admin";
import { promises as fs } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Firebase Admin with service account
const serviceAccount = JSON.parse(
  await fs.readFile(new URL("./serviceAccountKey.json", import.meta.url))
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://ai-flashcard-creator.firebaseio.com",
});

const db = admin.firestore();

// List of deck files to import
const deckFiles = [
  "nec_2026_changes.json",
  "article_100_definitions.json",
  "article_210_branch_circuits.json",
  "article_250_grounding.json",
  "article_300_wiring.json",
  "article_240_overcurrent.json",
  "journeyman_exam_practice.json",
  "load_calculations.json",
  "apprentice_fundamentals.json",
  "nec_violations.json",
  "osha_top_10.json",
  "jobsite_scenarios.json",
];

async function importDecks() {
  try {
    for (const fileName of deckFiles) {
      // Read the deck file
      const filePath = join(__dirname, "data", "decks", "electrical", fileName);
      const fileContent = await fs.readFile(filePath, "utf8");
      const deck = JSON.parse(fileContent);

      // Add additional metadata for shared decks
      const sharedDeck = {
        ...deck,
        sharedBy: "system@note2flash.com",
        shareId: deck.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        stats: {
          views: 0,
          favorites: 0,
          downloads: 0,
        },
      };

      // Add to sharedDecks collection
      const deckRef = db.collection("sharedDecks").doc(deck.id);
      await deckRef.set(sharedDeck);
      console.log(`Imported deck: ${deck.name}`);
    }
    console.log("All decks imported successfully!");
  } catch (error) {
    console.error("Error importing decks:", error);
  }
}

// Run the import
importDecks();
