require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const express = require("express");
const router = express.Router();

// Create a Checkout Session
router.post("/create-checkout-session", async (req, res) => {
  const { priceId, userId, email } = req.body;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      customer_email: email,
      client_reference_id: userId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${process.env.DOMAIN}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.DOMAIN}/canceled`,
    });

    res.json({ id: session.id });
  } catch (error) {
    console.error("Error creating checkout session:", error);
    res.status(500).json({ error: error.message });
  }
});

// Handle subscription cancellation
router.post("/cancel-subscription", async (req, res) => {
  const { userId } = req.body;

  try {
    // Get customer's subscription
    const subscriptions = await stripe.subscriptions.list({
      customer: userId,
      limit: 1,
      status: "active",
    });

    if (subscriptions.data.length === 0) {
      throw new Error("No active subscription found");
    }

    const subscription = await stripe.subscriptions.update(
      subscriptions.data[0].id,
      {
        cancel_at_period_end: true,
      }
    );

    res.json({ subscription });
  } catch (error) {
    console.error("Error canceling subscription:", error);
    res.status(500).json({ error: error.message });
  }
});

// Webhook handler for subscription events
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        const subscription = event.data.object;
        // Update user's subscription status in your database
        await updateUserSubscription(subscription);
        break;
      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    res.json({ received: true });
  }
);

async function updateUserSubscription(subscription) {
  // Update user's subscription status in your database
  // This function should be implemented based on your database structure
}

module.exports = router;
