import { auth, db, initStripe, PRICES } from "./config.js";
import {
  doc,
  updateDoc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

export class SubscriptionManager {
  constructor() {
    this.currentUser = null;
    this.subscriptionStatus = null;
    this.stripe = null;
  }

  async initialize() {
    // Initialize Stripe
    this.stripe = await initStripe();

    auth.onAuthStateChanged(async (user) => {
      if (user) {
        this.currentUser = user;
        await this.loadSubscriptionStatus();
      } else {
        this.currentUser = null;
        this.subscriptionStatus = null;
      }
    });
  }

  async loadSubscriptionStatus() {
    if (!this.currentUser) return;

    try {
      const userRef = doc(db, "users", this.currentUser.uid);
      const userDoc = await getDoc(userRef);

      if (userDoc.exists()) {
        this.subscriptionStatus = userDoc.data().subscriptionStatus || "free";
        return this.subscriptionStatus;
      }
    } catch (error) {
      console.error("Error loading subscription status:", error);
      return "free";
    }
  }

  async createCheckoutSession(priceId) {
    if (!this.currentUser) {
      throw new Error("User must be logged in to subscribe");
    }

    try {
      const response = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          priceId,
          userId: this.currentUser.uid,
          email: this.currentUser.email,
        }),
      });

      const session = await response.json();

      // Redirect to Stripe Checkout using initialized stripe instance
      const result = await this.stripe.redirectToCheckout({
        sessionId: session.id,
      });

      if (result.error) {
        throw new Error(result.error.message);
      }
    } catch (error) {
      console.error("Error creating checkout session:", error);
      throw error;
    }
  }

  async handleSubscriptionChange(subscription) {
    if (!this.currentUser) return;

    try {
      const userRef = doc(db, "users", this.currentUser.uid);
      await updateDoc(userRef, {
        subscriptionStatus: subscription.status,
        subscriptionId: subscription.id,
        subscriptionEndDate: subscription.current_period_end,
        isPremium: subscription.status === "active",
      });

      this.subscriptionStatus = subscription.status;
    } catch (error) {
      console.error("Error updating subscription status:", error);
      throw error;
    }
  }

  async cancelSubscription() {
    if (!this.currentUser) {
      throw new Error("User must be logged in to cancel subscription");
    }

    try {
      const response = await fetch("/api/cancel-subscription", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: this.currentUser.uid,
        }),
      });

      const result = await response.json();

      if (result.error) {
        throw new Error(result.error.message);
      }

      await this.handleSubscriptionChange(result.subscription);
    } catch (error) {
      console.error("Error canceling subscription:", error);
      throw error;
    }
  }

  isPremium() {
    return this.subscriptionStatus === "active";
  }

  getSubscriptionDetails() {
    return {
      status: this.subscriptionStatus,
      isPremium: this.isPremium(),
    };
  }
}
