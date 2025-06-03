// Import Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-analytics.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDppFcsquQOx2NL2OoDNUqYyscERAH3Buw",
  authDomain: "ai-flashcard-creator.firebaseapp.com",
  projectId: "ai-flashcard-creator",
  storageBucket: "ai-flashcard-creator.firebasestorage.app",
  messagingSenderId: "4926247150",
  appId: "1:4926247150:web:46d1672310259aa125e3ff",
  measurementId: "G-PC3STEJGW2",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);

// Auth error messages
const AUTH_ERROR_MESSAGES = {
  "auth/user-not-found":
    "No account found with this email. Please sign up first.",
  "auth/wrong-password": "Incorrect password. Please try again.",
  "auth/email-already-in-use": "An account already exists with this email.",
  "auth/weak-password": "Password should be at least 6 characters long.",
  "auth/invalid-email": "Please enter a valid email address.",
  "auth/network-request-failed": "Network error. Please check your connection.",
  "auth/too-many-requests": "Too many failed attempts. Please try again later.",
  "auth/operation-not-allowed": "This operation is not allowed.",
  "auth/account-exists-with-different-credential":
    "An account already exists with the same email address but different sign-in credentials.",
};

// Initialize Stripe
const stripe = Stripe(
  "pk_live_51HQ5UXAOBzJpPKFIMThn5WLNohIfd1SeE6xDgrk5OFLe0u60VuHqewLOIBKJp7G1HGmmG4gOyo4BYKOZrQxzjm0200KBL0mUgb"
);

// Pricing configuration
export const PRICES = {
  basic: {
    id: "price_basic_monthly",
    amount: 0, // Free
    interval: "month",
  },
  premium: {
    id: "price_premium_monthly",
    amount: 1499, // $14.99
    interval: "month",
  },
  premium_yearly: {
    id: "price_premium_yearly",
    amount: 14400, // $144.00 (save $35.88 annually)
    interval: "year",
  },
};

// Free tier limits
export const FREE_TIER_LIMITS = {
  DECK_GENERATIONS_PER_MONTH: 5,
  AI_IMAGE_OCCLUSIONS: 5,
  PAGES_PER_DOCUMENT: 5,
  CHARACTERS_PER_DOCUMENT: 10000,
  CARD_TYPES: ["term"],
  EXPORTS_PER_MONTH: 1,
  YOUTUBE_VIDEO_LIMITS: {
    MAX_VIDEO_LENGTH: 300, // 5 minutes in seconds
    MAX_CARDS_PER_VIDEO: 10,
  },
};

// Premium tier features (previously Ultimate)
export const PREMIUM_TIER_FEATURES = {
  DECK_GENERATIONS_PER_MONTH: 100,
  AI_IMAGE_OCCLUSIONS: 1000,
  PAGES_PER_DOCUMENT: 100,
  CHARACTERS_PER_DOCUMENT: 100000,
  CARD_TYPES: [
    "term",
    "qa",
    "cloze",
    "image-occlusion",
    "multiple-choice",
    "contextual",
  ],
  EXPORTS_PER_MONTH: "unlimited",
  YOUTUBE_VIDEO_LIMITS: {
    MAX_VIDEO_LENGTH: 2400, // 40 minutes in seconds
    MAX_CARDS_PER_VIDEO: 100,
  },
  ADDITIONAL_FEATURES: [
    "100 flashcard generations per month",
    "All card types available",
    "1000 AI image occlusions per month",
    "Up to 100 pages per document",
    "Up to 100,000 characters per document",
    "Unlimited web content extraction",
    "File uploads (PDF, images, documents)",
    "Advanced study analytics",
    "Priority support",
    "Early access to new features",
    "YouTube video to flashcards",
    "Advanced video processing",
    "Unlimited deck management",
    "All export formats",
  ],
};

// Feature descriptions for UI
const FEATURE_DESCRIPTIONS = {
  UNLIMITED_CARDS: "Generate unlimited flashcards",
  UNLIMITED_DECKS: "Save unlimited decks",
  EXPORTS: "Export to various formats",
  ALL_CARD_TYPES: "Access to all card types",
  STUDY_STATISTICS: "Detailed study analytics",
  PRIORITY_SUPPORT: "Priority customer support",
  EARLY_ACCESS: "Early access to new features",
};

// Export Firebase instances and other configurations
export {
  app,
  analytics,
  auth,
  db,
  stripe,
  AUTH_ERROR_MESSAGES,
  FEATURE_DESCRIPTIONS,
};
