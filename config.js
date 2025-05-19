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
  monthly: {
    id: "price_1OQ5UXAOBzJpPKFIMThn5WLN",
    amount: 1499, // $14.99
    interval: "month",
  },
  yearly: {
    id: "price_1OQ5UXAOBzJpPKFIMThn5WLN",
    amount: 14999, // $149.99
    interval: "year",
  },
};

// Free tier limits
const FREE_TIER_LIMITS = {
  CARDS_PER_MONTH: 20,
  SAVED_DECKS: 3,
  EXPORTS_PER_MONTH: 1,
  CARD_TYPES: ["basic"],
};

// Premium features
const PREMIUM_FEATURES = {
  UNLIMITED_CARDS: true,
  UNLIMITED_DECKS: true,
  EXPORTS_PER_MONTH: {
    MONTHLY: 10,
    YEARLY: 20,
  },
  CARD_TYPES: ["basic", "advanced", "custom"],
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
  FREE_TIER_LIMITS,
  PREMIUM_FEATURES,
  AUTH_ERROR_MESSAGES,
  FEATURE_DESCRIPTIONS,
};
