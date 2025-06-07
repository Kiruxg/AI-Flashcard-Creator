// Import Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-analytics.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Import Stripe from CDN
import { loadStripe } from "https://cdn.jsdelivr.net/npm/@stripe/stripe-js@2.2.0/+esm";

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
export const AUTH_ERROR_MESSAGES = {
  "auth/invalid-email": "Invalid email address.",
  "auth/user-disabled": "This account has been disabled.",
  "auth/user-not-found": "No account found with this email.",
  "auth/wrong-password": "Incorrect password. Please try again.",
  "auth/too-many-requests": "Too many failed attempts. Please try again later.",
  "auth/network-request-failed": "Network error. Please check your connection.",
  "auth/email-already-in-use": "An account already exists with this email.",
  "auth/weak-password": "Password should be at least 6 characters long.",
  "auth/operation-not-allowed": "This operation is not allowed.",
  "auth/account-exists-with-different-credential":
    "An account already exists with the same email address but different sign-in credentials.",
};

// Initialize Stripe
let stripe = null;
const initStripe = async () => {
  if (!stripe) {
    stripe = await loadStripe(
      "pk_live_51HQ5UXAOBzJpPKFIMThn5WLNohIfd1SeE6xDgrk5OFLe0u60VuHqewLOIBKJp7G1HGmmG4gOyo4BYKOZrQxzjm0200KBL0mUgb"
    );
  }
  return stripe;
};

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
  DECK_GENERATIONS_PER_MONTH: 3,
  AI_IMAGE_OCCLUSIONS: 5,
  PAGES_PER_DOCUMENT: 5,
  CHARACTERS_PER_DOCUMENT: 10000,
  CARD_TYPES: ["term"],
  EXPORTS_PER_MONTH: 1,
  YOUTUBE_VIDEO_LIMITS: {
    MAX_VIDEO_LENGTH: 300, // 5 minutes in seconds
    MAX_CARDS_PER_VIDEO: 10,
  },
  MAX_CARDS_PER_DECK: 10,
  MAX_SAVED_DECKS: 2,
  EXPLAINER_CREDITS: 0, // No explainer for free tier
  FILE_UPLOAD_ENABLED: true,
  WEB_CONTENT_ENABLED: true,
};

// Basic tier limits ($7.99)
export const BASIC_TIER_LIMITS = {
  DECK_GENERATIONS_PER_MONTH: 25,
  AI_IMAGE_OCCLUSIONS: 25,
  PAGES_PER_DOCUMENT: 20,
  CHARACTERS_PER_DOCUMENT: 50000,
  CARD_TYPES: ["term", "qa", "cloze", "image-occlusion"],
  EXPORTS_PER_MONTH: 10,
  YOUTUBE_VIDEO_LIMITS: {
    MAX_VIDEO_LENGTH: 1200, // 20 minutes in seconds
    MAX_CARDS_PER_VIDEO: 50,
  },
  MAX_CARDS_PER_DECK: 25,
  MAX_SAVED_DECKS: 25,
  EXPLAINER_CREDITS: 20, // 20 credits refilled monthly
  FILE_UPLOAD_ENABLED: true,
  WEB_CONTENT_ENABLED: true,
};

// Premium tier features (previously Ultimate)
export const PREMIUM_TIER_FEATURES = {
  DECK_GENERATIONS_PER_MONTH: 100,
  AI_IMAGE_OCCLUSIONS: 500,
  PAGES_PER_DOCUMENT: 50,
  CHARACTERS_PER_DOCUMENT: 100000,
  CARD_TYPES: ["term", "qa", "cloze", "image-occlusion", "contextual"],
  EXPORTS_PER_MONTH: "unlimited",
  YOUTUBE_VIDEO_LIMITS: {
    MAX_VIDEO_LENGTH: 3600, // 60 minutes in seconds
    MAX_CARDS_PER_VIDEO: 100,
  },
  MAX_CARDS_PER_DECK: 100,
  MAX_SAVED_DECKS: 100,
  FILE_UPLOAD_ENABLED: true,
  WEB_CONTENT_ENABLED: true,
  ADDITIONAL_FEATURES: [
    "100 flashcard generations per month",
    "All card types available",
    "50 AI image occlusions per month",
    "Up to 50 pages per document",
    "Up to 100,000 characters per document",
    "1000 web content extractions per month",
    "File uploads (PDF, images, documents)",
    "Advanced study analytics",
    "Priority support",
    "Early access to new features",
    "YouTube video to flashcards",
    "Advanced video processing",
    "Up to 100 saved decks",
    "Up to 100 cards per deck",
    "All export formats",
  ],
  EXPLAINER_CREDITS: 100, // 100 credits refilled monthly
};

// Feature descriptions for UI
const FEATURE_DESCRIPTIONS = {
  PREMIUM_CARDS: "Generate up to 100 cards per deck",
  PREMIUM_DECKS: "Save up to 100 decks",
  EXPORTS: "Export to various formats",
  ALL_CARD_TYPES: "Access to all card types",
  STUDY_STATISTICS: "Detailed study analytics",
  PRIORITY_SUPPORT: "Priority customer support",
  EARLY_ACCESS: "Early access to new features",
};

// Credit pricing for additional purchases
export const CREDIT_PRICING = {
  explainer_credits_10: {
    credits: 10,
    price: 1.00, // $1.00 for 10 credits ($0.10 per credit)
    stripe_price_id: "price_explainer_credits_10"
  },
  explainer_credits_50: {
    credits: 50,
    price: 4.50, // $4.50 for 50 credits ($0.09 per credit - bulk discount)
    stripe_price_id: "price_explainer_credits_50"
  },
  explainer_credits_100: {
    credits: 100,
    price: 8.00, // $8.00 for 100 credits ($0.08 per credit - better bulk discount)
    stripe_price_id: "price_explainer_credits_100"
  }
};

// Make firebaseConfig available globally for shared-decks page
window.firebaseConfig = firebaseConfig;

// Export Firebase instances and other configurations
export {
  app,
  analytics,
  auth,
  db,
  initStripe,
  FEATURE_DESCRIPTIONS,
  firebaseConfig,
};
