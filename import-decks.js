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
  // Electrical decks
  { path: "electrical/nec_2026_changes.json" },
  { path: "electrical/article_100_definitions.json" },
  { path: "electrical/article_210_branch_circuits.json" },
  { path: "electrical/article_250_grounding.json" },
  { path: "electrical/article_300_wiring.json" },
  { path: "electrical/article_240_overcurrent.json" },
  { path: "electrical/journeyman_exam_practice.json" },
  { path: "electrical/load_calculations.json" },
  { path: "electrical/apprentice_fundamentals.json" },
  { path: "electrical/nec_violations.json" },
  { path: "electrical/osha_top_10.json" },
  { path: "electrical/jobsite_scenarios.json" },

  // Carpenter decks
  { path: "carpenter/framing_fundamentals.json" },

  // Heavy Equipment decks
  { path: "heavy-equipment/operator_fundamentals.json" },
  { path: "heavy-equipment/excavator_operations.json" },

  // Sprinkler Fitter decks
  { path: "sprinkler/fire_protection_basics.json" },

  // Sheet Metal decks
  { path: "sheet-metal/ductwork_fundamentals.json" },

  // Safety & OSHA decks
  { path: "safety/workplace_safety_fundamentals.json" },
];

async function importDecks() {
  try {
    for (const deckFile of deckFiles) {
      // Read the deck file
      const filePath = join(__dirname, "data", "decks", deckFile.path);
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
