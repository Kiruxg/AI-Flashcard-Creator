const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const admin = require("firebase-admin");
const OpenAI = require("openai");
const rateLimit = require("express-rate-limit");
const WebSocket = require("ws");
// const helmet = require("helmet");  // Temporarily comment out Helmet
const xss = require("xss-clean");
const sanitizeHtml = require("sanitize-html");

// Load environment variables
dotenv.config();

// Initialize Firebase Admin
const serviceAccount = require("./serviceAccountKey.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app = express();

// Comment out Helmet middleware temporarily
// app.use(helmet());

// Add basic security headers manually
app.use((req, res, next) => {
  // Add other security headers that Helmet would normally provide
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Update COOP and COEP headers for OAuth
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

  next();
});

// Add CORS headers for specific resources
app.use((req, res, next) => {
  if (
    req.path.startsWith("/js.stripe.com/") ||
    req.path.startsWith("/www.googletagmanager.com/") ||
    req.path.startsWith("/accounts.google.com/") ||
    req.path.startsWith("/apis.google.com/")
  ) {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
  }
  next();
});

// XSS protection middleware
app.use(xss());

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
});

// Apply rate limiting to all API routes
app.use("/api/", apiLimiter);

// Middleware
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://127.0.0.1:5500",
      "http://localhost:5500",
    ],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

// Remove all existing CSP middleware and consolidate into one
app.use((req, res, next) => {
  // Debug logging
  console.log("Setting CSP headers for request:", req.path);

  // Remove ALL possible CSP headers
  const cspHeaders = [
    "Content-Security-Policy",
    "content-security-policy",
    "X-Content-Security-Policy",
    "x-content-security-policy",
    "X-WebKit-CSP",
    "x-webkit-csp",
  ];

  cspHeaders.forEach((header) => {
    res.removeHeader(header);
    // Also try to remove from raw headers
    const rawHeaders = res.getHeaders();
    if (rawHeaders[header]) {
      delete rawHeaders[header];
    }
  });

  // Prevent caching
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0"
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");

  // Set CSP header with explicit domains
  const cspHeader =
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' " +
    "https://*.google.com " +
    "https://*.googleapis.com " +
    "https://*.gstatic.com " +
    "https://apis.google.com " +
    "https://accounts.google.com " +
    "https://www.google.com " +
    "https://www.gstatic.com " +
    "https://js.stripe.com " +
    "https://cdnjs.cloudflare.com " +
    "https://cdn.jsdelivr.net " +
    "https://code.jquery.com " +
    "https://*.firebaseio.com " +
    "https://www.googletagmanager.com " +
    "https://www.google-analytics.com " +
    "https://region1.google-analytics.com; " +
    "script-src-elem 'self' 'unsafe-inline' 'unsafe-eval' " +
    "https://*.google.com " +
    "https://*.googleapis.com " +
    "https://*.gstatic.com " +
    "https://apis.google.com " +
    "https://accounts.google.com " +
    "https://www.google.com " +
    "https://www.gstatic.com " +
    "https://js.stripe.com " +
    "https://cdnjs.cloudflare.com " +
    "https://cdn.jsdelivr.net " +
    "https://code.jquery.com " +
    "https://*.firebaseio.com " +
    "https://www.googletagmanager.com " +
    "https://www.google-analytics.com " +
    "https://region1.google-analytics.com; " +
    "style-src 'self' 'unsafe-inline' " +
    "https://fonts.googleapis.com " +
    "https://cdnjs.cloudflare.com " +
    "https://*.googleapis.com; " +
    "img-src 'self' data: blob: https://*.googleapis.com https://*.gstatic.com https://*.googleusercontent.com; " +
    "connect-src 'self' " +
    "https://api.openai.com " +
    "https://firestore.googleapis.com " +
    "https://*.firebaseio.com " +
    "https://*.googleapis.com " +
    "https://identitytoolkit.googleapis.com " +
    "https://securetoken.googleapis.com " +
    "https://js.stripe.com " +
    "https://www.google-analytics.com " +
    "https://region1.google-analytics.com " +
    "https://accounts.google.com " +
    "https://apis.google.com " +
    "wss://localhost:12345; " +
    "frame-src 'self' " +
    "https://js.stripe.com " +
    "https://accounts.google.com " +
    "https://*.firebaseapp.com " +
    "https://*.google.com; " +
    "object-src 'none'; " +
    "upgrade-insecure-requests; " +
    "base-uri 'self'; " +
    "font-src 'self' data: " +
    "https://fonts.gstatic.com " +
    "https://fonts.googleapis.com " +
    "https://*.googleapis.com " +
    "https://*.gstatic.com " +
    "https://cdnjs.cloudflare.com " +
    "https://cdn.jsdelivr.net " +
    "https://*.cloudflare.com " +
    "https://*.jsdelivr.net " +
    "https://*.googleusercontent.com; " +
    "form-action 'self' https://accounts.google.com; " +
    "script-src-attr 'none'; " +
    "media-src 'self' blob:; " +
    "worker-src 'self' blob:; " +
    "child-src 'self' blob:;";

  // Set the new CSP header
  res.setHeader("Content-Security-Policy", cspHeader);

  // Debug logging
  console.log("CSP header set:", res.getHeader("Content-Security-Policy"));

  next();
});

// Serve static files without CSP headers (they'll be set by the middleware above)
app.use(express.static("."));

// Serve favicon
app.get("/favicon.ico", (req, res) => {
  res.status(204).end(); // No content response for favicon
});

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Constants for cost control
const MAX_TOKENS_PER_REQUEST = 4000; // Reduced to stay within GPT-3.5-turbo's 4096 limit
const MAX_TEXT_LENGTH = 50000; // characters
const FREE_TIER_MONTHLY_LIMIT = 100000; // tokens per month
const PREMIUM_TIER_MONTHLY_LIMIT = 1000000; // tokens per month

// Token usage tracking
const tokenUsage = new Map();

// Input sanitization configuration
const sanitizeOptions = {
  allowedTags: ["b", "i", "em", "strong", "a", "p", "br"],
  allowedAttributes: {
    a: ["href", "target"],
  },
  allowedIframeHostnames: [],
};

// Sanitization middleware
const sanitizeInput = (req, res, next) => {
  if (req.body) {
    // Sanitize text input
    if (req.body.text) {
      req.body.text = sanitizeHtml(req.body.text, sanitizeOptions);
    }
    // Sanitize card content
    if (req.body.flashcards) {
      req.body.flashcards = req.body.flashcards.map((card) => ({
        ...card,
        front: sanitizeHtml(card.front, sanitizeOptions),
        back: sanitizeHtml(card.back, sanitizeOptions),
      }));
    }
    // Sanitize deck name
    if (req.body.deckName) {
      req.body.deckName = sanitizeHtml(req.body.deckName, sanitizeOptions);
    }
  }
  next();
};

// Apply sanitization to relevant routes
app.use("/api/generate-flashcards", sanitizeInput);
app.use("/api/save-deck", sanitizeInput);
app.use("/api/update-deck", sanitizeInput);

// Helper function to sanitize user input
function sanitizeUserInput(input) {
  if (typeof input === "string") {
    return sanitizeHtml(input, sanitizeOptions);
  } else if (Array.isArray(input)) {
    return input.map((item) => sanitizeUserInput(item));
  } else if (typeof input === "object" && input !== null) {
    const sanitized = {};
    for (const [key, value] of Object.entries(input)) {
      sanitized[key] = sanitizeUserInput(value);
    }
    return sanitized;
  }
  return input;
}

// Helper function to count tokens (rough estimate)
function estimateTokens(text) {
  return Math.ceil(text.length / 4); // Rough estimate: 1 token ≈ 4 characters
}

// Helper function to check user's token usage
async function checkUserTokenUsage(userId) {
  // Bypass token usage checks for testing
  return {
    monthlyTokens: 0,
    isPremium: true, // Always return premium status
  };
}

// Helper function to update token usage
async function updateTokenUsage(userId, tokens) {
  const db = admin.firestore();
  const userRef = db.collection("users").doc(userId);
  const currentMonth = new Date().toISOString().slice(0, 7);

  await userRef.update({
    [`tokenUsage.${currentMonth}`]:
      admin.firestore.FieldValue.increment(tokens),
  });
}

// Webhook endpoint
app.post(
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
      console.error("Webhook Error:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionChange(event.data.object);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionCancellation(event.data.object);
        break;
      case "charge.refunded":
        await handleRefundProcessed(event.data.object);
        break;
      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    res.json({ received: true });
  }
);

// Create checkout session
app.post("/create-checkout-session", async (req, res) => {
  const { priceId, userId, isUpgrade, currentPlan } = req.body;

  try {
    const userDoc = await admin
      .firestore()
      .collection("users")
      .doc(userId)
      .get();
    if (!userDoc.exists) {
      throw new Error("User not found");
    }

    const userData = userDoc.data();
    let sessionConfig = {
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.APP_DOMAIN}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_DOMAIN}/pricing`,
      client_reference_id: userId,
      customer_email: userData.email,
    };

    // Handle subscription changes
    if (isUpgrade && userData.stripeCustomerId) {
      const customer = await stripe.customers.retrieve(
        userData.stripeCustomerId
      );
      const subscriptions = await stripe.subscriptions.list({
        customer: userData.stripeCustomerId,
        status: "active",
      });

      if (subscriptions.data.length > 0) {
        const currentSubscription = subscriptions.data[0];

        // Calculate proration
        const prorationDate = Math.floor(Date.now() / 1000);
        const prorationItems =
          await stripe.subscriptionItems.listProrationItems({
            subscription: currentSubscription.id,
            subscription_item: currentSubscription.items.data[0].id,
            proration_date: prorationDate,
          });

        // Add proration items to the checkout session
        sessionConfig.line_items = prorationItems.data.map((item) => ({
          price: item.price.id,
          quantity: item.quantity,
          description: item.description,
        }));

        // Add the new subscription item
        sessionConfig.line_items.push({
          price: priceId,
          quantity: 1,
        });

        // Set subscription update mode
        sessionConfig.mode = "subscription";
        sessionConfig.subscription_data = {
          trial_end: null,
          proration_behavior: "always_invoice",
        };
      }
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);
    res.json({ sessionId: session.id });
  } catch (error) {
    console.error("Error creating checkout session:", error);
    res.status(400).json({
      error: {
        code: error.code || "processing_error",
        message: error.message || "Failed to create checkout session",
      },
    });
  }
});

// Handle subscription changes
async function handleSubscriptionChange(subscription) {
  const userId = subscription.metadata.userId;
  const db = admin.firestore();
  const userRef = db.collection("users").doc(userId);

  try {
    await userRef.update({
      subscriptionStatus: subscription.status,
      subscriptionId: subscription.id,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      priceId: subscription.items.data[0].price.id,
    });
  } catch (error) {
    console.error("Error updating subscription:", error);
  }
}

// Handle subscription cancellation
async function handleSubscriptionCancellation(subscription) {
  const userId = subscription.metadata.userId;
  const db = admin.firestore();
  const userRef = db.collection("users").doc(userId);

  try {
    await userRef.update({
      subscriptionStatus: "canceled",
      subscriptionId: null,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: true,
      priceId: null,
    });
  } catch (error) {
    console.error("Error handling subscription cancellation:", error);
  }
}

// Generate flashcards endpoint
app.post("/api/generate-flashcards", async (req, res) => {
  console.log("Received flashcard generation request");

  try {
    const { text, cardType, cardCount, options } = req.body;

    // Input validation
    if (!text || !cardType || !cardCount) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    if (text.length > MAX_TEXT_LENGTH) {
      return res.status(400).json({
        error: "Text too long",
        details: `Maximum text length is ${MAX_TEXT_LENGTH} characters`,
      });
    }

    // Estimate tokens for this request
    const estimatedTokens = estimateTokens(text) + cardCount * 50; // 50 tokens per card estimate

    if (estimatedTokens > MAX_TOKENS_PER_REQUEST) {
      return res.status(400).json({
        error: "Request too large",
        details: "Please reduce text length or card count",
      });
    }

    // For testing, we'll always treat the user as premium
    const userStatus = {
      monthlyTokens: 0,
      isPremium: true,
    };

    // Construct the prompt based on card type
    let systemPrompt =
      "You are a helpful assistant that creates educational flashcards. Create clear, concise, and accurate flashcards. Always return your response as a JSON object with a 'flashcards' array containing the generated cards.";
    let userPrompt = `Create ${cardCount} flashcards from the following text. Return a JSON object with a 'flashcards' array containing ${cardCount} objects, each with 'front' and 'back' properties.\n\nText: ${text}\n\n`;

    switch (cardType) {
      case "qa":
        systemPrompt +=
          " Focus on creating question-answer pairs that test understanding.";
        userPrompt +=
          "Create question-answer pairs that test comprehension. Questions should be clear and specific. Each flashcard should have a question as the front and its answer as the back.";
        break;
      case "term":
        systemPrompt += " Focus on creating term-definition pairs.";
        userPrompt +=
          "Create term-definition pairs. Terms should be key concepts, and definitions should be clear and concise. Each flashcard should have a term as the front and its definition as the back.";
        break;
      case "concept":
        systemPrompt +=
          " Focus on creating concept-explanation pairs that help understand complex ideas.";
        userPrompt +=
          "Create concept-explanation pairs that break down complex ideas into understandable parts. Each flashcard should have a concept as the front and its explanation as the back.";
        break;
    }

    // Call OpenAI API with retry logic
    let retries = 3;
    let completion;

    console.log("Sending prompt to OpenAI:", {
      systemPrompt,
      userPrompt,
      cardCount,
      cardType,
    });

    while (retries > 0) {
      try {
        completion = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.7,
          max_tokens: 4000, // Explicitly set to stay within model limits
          response_format: { type: "json_object" },
        });
        break;
      } catch (error) {
        if (error.status === 429 && retries > 1) {
          // Rate limit error
          await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second
          retries--;
          continue;
        }
        throw error;
      }
    }

    if (!completion) {
      throw new Error("Failed to generate flashcards after retries");
    }

    // Parse the response
    console.log("Raw API response:", completion.choices[0].message.content);
    const response = JSON.parse(completion.choices[0].message.content);
    console.log("Parsed response:", response);
    let flashcards = Array.isArray(response.flashcards)
      ? response.flashcards
      : [response];
    console.log("Initial flashcards array:", flashcards);

    // Ensure we have the requested number of cards
    if (flashcards.length < cardCount) {
      console.log(
        `Received ${flashcards.length} cards, requested ${cardCount}. Retrying...`
      );
      // Retry with a modified prompt to get the remaining cards
      const remainingCount = cardCount - flashcards.length;
      const retryPrompt = `Create ${remainingCount} additional flashcards from the same text. Return a JSON object with a 'flashcards' array containing ${remainingCount} objects, each with 'front' and 'back' properties. Make sure the new cards are different from the previous ones.\n\nText: ${text}\n\n`;

      try {
        const retryCompletion = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: retryPrompt },
          ],
          temperature: 0.7,
          max_tokens: 4000,
          response_format: { type: "json_object" },
        });

        const retryResponse = JSON.parse(
          retryCompletion.choices[0].message.content
        );
        const additionalCards = Array.isArray(retryResponse.flashcards)
          ? retryResponse.flashcards
          : [retryResponse];

        flashcards = [...flashcards, ...additionalCards];
        console.log("Final flashcards array after retry:", flashcards);
      } catch (retryError) {
        console.error("Error getting additional cards:", retryError);
        // Continue with the cards we have if retry fails
      }
    }

    // Update token usage if userId is provided
    const userId = options?.userId;
    if (userId) {
      const tokensUsed = completion.usage.total_tokens;
      await updateTokenUsage(userId, tokensUsed);
    }

    res.json({
      flashcards,
      usage: {
        promptTokens: completion.usage.prompt_tokens,
        completionTokens: completion.usage.completion_tokens,
        totalTokens: completion.usage.total_tokens,
      },
    });
  } catch (error) {
    console.error("Error generating flashcards:", error);
    res.status(500).json({
      error: "Failed to generate flashcards",
      details: error.message,
    });
  }
});

// Handle subscription creation/upgrade/downgrade
app.post("/create-checkout-session", async (req, res) => {
  const { priceId, userId, isUpgrade, currentPlan } = req.body;

  try {
    const userDoc = await admin
      .firestore()
      .collection("users")
      .doc(userId)
      .get();
    if (!userDoc.exists) {
      throw new Error("User not found");
    }

    const userData = userDoc.data();
    let sessionConfig = {
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.APP_DOMAIN}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_DOMAIN}/pricing`,
      client_reference_id: userId,
      customer_email: userData.email,
    };

    // Handle subscription changes
    if (isUpgrade && userData.stripeCustomerId) {
      const customer = await stripe.customers.retrieve(
        userData.stripeCustomerId
      );
      const subscriptions = await stripe.subscriptions.list({
        customer: userData.stripeCustomerId,
        status: "active",
      });

      if (subscriptions.data.length > 0) {
        const currentSubscription = subscriptions.data[0];

        // Calculate proration
        const prorationDate = Math.floor(Date.now() / 1000);
        const prorationItems =
          await stripe.subscriptionItems.listProrationItems({
            subscription: currentSubscription.id,
            subscription_item: currentSubscription.items.data[0].id,
            proration_date: prorationDate,
          });

        // Add proration items to the checkout session
        sessionConfig.line_items = prorationItems.data.map((item) => ({
          price: item.price.id,
          quantity: item.quantity,
          description: item.description,
        }));

        // Add the new subscription item
        sessionConfig.line_items.push({
          price: priceId,
          quantity: 1,
        });

        // Set subscription update mode
        sessionConfig.mode = "subscription";
        sessionConfig.subscription_data = {
          trial_end: null,
          proration_behavior: "always_invoice",
        };
      }
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);
    res.json({ sessionId: session.id });
  } catch (error) {
    console.error("Error creating checkout session:", error);
    res.status(400).json({
      error: {
        code: error.code || "processing_error",
        message: error.message || "Failed to create checkout session",
      },
    });
  }
});

// Handle subscription cancellation
app.post("/cancel-subscription", async (req, res) => {
  const { userId, cancelAtPeriodEnd, requestRefund, reason } = req.body;

  try {
    const userDoc = await admin
      .firestore()
      .collection("users")
      .doc(userId)
      .get();
    if (!userDoc.exists) {
      throw new Error("User not found");
    }

    const userData = userDoc.data();
    if (!userData.stripeCustomerId) {
      throw new Error("No active subscription found");
    }

    const subscriptions = await stripe.subscriptions.list({
      customer: userData.stripeCustomerId,
      status: "active",
    });

    if (subscriptions.data.length === 0) {
      throw new Error("No active subscription found");
    }

    const subscription = subscriptions.data[0];

    // Check if refund is requested and eligible
    if (requestRefund) {
      const subscriptionStart = new Date(subscription.start_date * 1000);
      const now = new Date();
      const daysSinceStart = (now - subscriptionStart) / (1000 * 60 * 60 * 24);

      if (daysSinceStart <= 7) {
        // Process refund
        const refundResponse = await fetch(
          `${req.protocol}://${req.get("host")}/request-refund`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              userId,
              subscriptionId: subscription.id,
              reason,
            }),
          }
        );

        if (!refundResponse.ok) {
          const refundError = await refundResponse.json();
          throw new Error(refundError.error.message);
        }

        const refundResult = await refundResponse.json();
        res.json({
          success: true,
          refund: refundResult.refund,
          message: "Subscription canceled and refund processed successfully",
        });
        return;
      } else {
        throw new Error("Refund request is outside the 7-day window");
      }
    }

    // Regular cancellation
    if (cancelAtPeriodEnd) {
      await stripe.subscriptions.update(subscription.id, {
        cancel_at_period_end: true,
      });
    } else {
      await stripe.subscriptions.del(subscription.id);
    }

    // Update user document
    await admin
      .firestore()
      .collection("users")
      .doc(userId)
      .update({
        subscriptionStatus: cancelAtPeriodEnd ? "canceled" : "inactive",
        subscriptionCanceledAt: new Date().toISOString(),
      });

    res.json({
      success: true,
      message: cancelAtPeriodEnd
        ? "Subscription will be canceled at the end of the billing period"
        : "Subscription canceled successfully",
    });
  } catch (error) {
    console.error("Error canceling subscription:", error);
    res.status(400).json({
      error: {
        code: error.code || "processing_error",
        message: error.message || "Failed to cancel subscription",
      },
    });
  }
});

// Handle subscription reactivation
app.post("/reactivate-subscription", async (req, res) => {
  const { userId } = req.body;

  try {
    const userDoc = await admin
      .firestore()
      .collection("users")
      .doc(userId)
      .get();
    if (!userDoc.exists) {
      throw new Error("User not found");
    }

    const userData = userDoc.data();
    if (!userData.stripeCustomerId) {
      throw new Error("No subscription found");
    }

    const subscriptions = await stripe.subscriptions.list({
      customer: userData.stripeCustomerId,
      status: "canceled",
    });

    if (subscriptions.data.length === 0) {
      throw new Error("No canceled subscription found");
    }

    const subscription = subscriptions.data[0];

    // Reactivate the subscription
    await stripe.subscriptions.update(subscription.id, {
      cancel_at_period_end: false,
      proration_behavior: "none",
    });

    // Update user document
    await admin.firestore().collection("users").doc(userId).update({
      subscriptionStatus: "active",
      subscriptionCanceledAt: null,
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error reactivating subscription:", error);
    res.status(400).json({
      error: {
        code: error.code || "processing_error",
        message: error.message || "Failed to reactivate subscription",
      },
    });
  }
});

// Handle refund request
app.post("/request-refund", async (req, res) => {
  const { userId, subscriptionId, reason } = req.body;

  try {
    const userDoc = await admin
      .firestore()
      .collection("users")
      .doc(userId)
      .get();
    if (!userDoc.exists) {
      throw new Error("User not found");
    }

    const userData = userDoc.data();
    if (!userData.stripeCustomerId) {
      throw new Error("No subscription found");
    }

    // Get the subscription
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    // Check if subscription is within refund window (7 days)
    const subscriptionStart = new Date(subscription.start_date * 1000);
    const now = new Date();
    const daysSinceStart = (now - subscriptionStart) / (1000 * 60 * 60 * 24);

    if (daysSinceStart > 7) {
      throw new Error("Refund request is outside the 7-day window");
    }

    // Get the latest invoice
    const invoices = await stripe.invoices.list({
      subscription: subscriptionId,
      limit: 1,
    });

    if (invoices.data.length === 0) {
      throw new Error("No invoice found for subscription");
    }

    const latestInvoice = invoices.data[0];

    // Create refund
    const refund = await stripe.refunds.create({
      payment_intent: latestInvoice.payment_intent,
      reason: "requested_by_customer",
      metadata: {
        userId: userId,
        subscriptionId: subscriptionId,
        reason: reason,
      },
    });

    // Cancel the subscription
    await stripe.subscriptions.del(subscriptionId);

    // Update user document
    await admin
      .firestore()
      .collection("users")
      .doc(userId)
      .update({
        subscriptionStatus: "refunded",
        subscriptionCanceledAt: new Date().toISOString(),
        refundDetails: {
          refundId: refund.id,
          amount: refund.amount,
          reason: reason,
          date: new Date().toISOString(),
        },
      });

    res.json({
      success: true,
      refund: {
        id: refund.id,
        amount: refund.amount,
        status: refund.status,
      },
    });
  } catch (error) {
    console.error("Error processing refund:", error);
    res.status(400).json({
      error: {
        code: error.code || "processing_error",
        message: error.message || "Failed to process refund",
      },
    });
  }
});

// Webhook handlers
async function handleCheckoutSessionCompleted(session) {
  const userId = session.client_reference_id;
  const customerId = session.customer;
  const subscriptionId = session.subscription;

  await admin.firestore().collection("users").doc(userId).update({
    stripeCustomerId: customerId,
    subscriptionId: subscriptionId,
    subscriptionStatus: "active",
    subscriptionStartDate: new Date().toISOString(),
    subscriptionCanceledAt: null,
  });
}

async function handleSubscriptionUpdated(subscription) {
  const customerId = subscription.customer;
  const userQuery = await admin
    .firestore()
    .collection("users")
    .where("stripeCustomerId", "==", customerId)
    .get();

  if (userQuery.empty) return;

  const userDoc = userQuery.docs[0];
  const updates = {
    subscriptionStatus: subscription.status,
    subscriptionCanceledAt: subscription.cancel_at
      ? new Date(subscription.cancel_at * 1000).toISOString()
      : null,
  };

  await userDoc.ref.update(updates);
}

async function handleSubscriptionDeleted(subscription) {
  const customerId = subscription.customer;
  const userQuery = await admin
    .firestore()
    .collection("users")
    .where("stripeCustomerId", "==", customerId)
    .get();

  if (userQuery.empty) return;

  const userDoc = userQuery.docs[0];
  await userDoc.ref.update({
    subscriptionStatus: "inactive",
    subscriptionCanceledAt: new Date().toISOString(),
  });
}

async function handlePaymentFailed(invoice) {
  const customerId = invoice.customer;
  const userQuery = await admin
    .firestore()
    .collection("users")
    .where("stripeCustomerId", "==", customerId)
    .get();

  if (userQuery.empty) return;

  const userDoc = userQuery.docs[0];
  await userDoc.ref.update({
    subscriptionStatus: "past_due",
    lastPaymentError: {
      code: invoice.last_payment_error?.code,
      message: invoice.last_payment_error?.message,
      date: new Date().toISOString(),
    },
  });
}

async function handlePaymentSucceeded(invoice) {
  const customerId = invoice.customer;
  const userQuery = await admin
    .firestore()
    .collection("users")
    .where("stripeCustomerId", "==", customerId)
    .get();

  if (userQuery.empty) return;

  const userDoc = userQuery.docs[0];
  await userDoc.ref.update({
    subscriptionStatus: "active",
    lastPaymentError: null,
    lastPaymentDate: new Date().toISOString(),
  });
}

// Add refund webhook handler
async function handleRefundProcessed(charge) {
  const refund = charge.refunds.data[0];
  if (!refund) return;

  const userId = refund.metadata.userId;
  if (!userId) return;

  const userRef = admin.firestore().collection("users").doc(userId);

  try {
    await userRef.update({
      refundStatus: refund.status,
      refundProcessedAt: new Date().toISOString(),
      subscriptionStatus: "refunded",
    });
  } catch (error) {
    console.error("Error updating user after refund:", error);
  }
}

// Authentication middleware
const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    const idToken = authHeader.split("Bearer ")[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(401).json({ error: "Invalid or expired token" });
  }
};

// Update individual flashcard
app.post(
  "/api/update-card",
  authenticateUser,
  sanitizeInput,
  async (req, res) => {
    try {
      const { deckId, cardId, front, back } = req.body;
      const userId = req.user.uid;

      // Validate input
      if (!deckId || !cardId || !front || !back) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Get user's subscription status
      const userDoc = await admin
        .firestore()
        .collection("users")
        .doc(userId)
        .get();
      const userData = userDoc.data();

      // Check if user has access to the deck
      const deckRef = admin.firestore().collection("decks").doc(deckId);
      const deckDoc = await deckRef.get();

      if (!deckDoc.exists) {
        return res.status(404).json({ error: "Deck not found" });
      }

      const deckData = deckDoc.data();
      if (deckData.userId !== userId) {
        return res.status(403).json({ error: "Unauthorized access to deck" });
      }

      // Update the card
      const cards = deckData.flashcards || [];
      const cardIndex = cards.findIndex((card) => card.id === cardId);

      if (cardIndex === -1) {
        return res.status(404).json({ error: "Card not found" });
      }

      // Update card content
      cards[cardIndex] = {
        ...cards[cardIndex],
        front,
        back,
        lastModified: admin.firestore.FieldValue.serverTimestamp(),
      };

      // Update deck in database
      await deckRef.update({
        flashcards: cards,
        lastModified: admin.firestore.FieldValue.serverTimestamp(),
      });

      res.json({ success: true, card: cards[cardIndex] });
    } catch (error) {
      console.error("Error updating card:", error);
      res.status(500).json({ error: "Failed to update card" });
    }
  }
);

// Add this with your other API routes
app.get("/api/get-price-ids", (req, res) => {
  res.json({
    monthly: process.env.STRIPE_PRICE_MONTHLY,
    yearly: process.env.STRIPE_PRICE_YEARLY,
  });
});

// Add debug endpoint to check headers
app.get("/debug-headers", (req, res) => {
  const headers = res.getHeaders();
  res.json({
    headers: headers,
    csp: headers["content-security-policy"],
    rawHeaders: res.rawHeaders,
  });
});

// Add a debug endpoint that shows all headers
app.get("/debug-headers-full", (req, res) => {
  const headers = res.getHeaders();
  const rawHeaders = res.rawHeaders;
  res.json({
    headers,
    rawHeaders,
    csp: headers["content-security-policy"],
    allCspHeaders: Object.entries(headers).filter(([key]) =>
      key.toLowerCase().includes("security-policy")
    ),
  });
});

// Start server
const PORT = process.env.PORT || 12345;
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(
    "Debug endpoint available at: http://localhost:" + PORT + "/debug-headers"
  );
});

// WebSocket server for live reload
const wss = new WebSocket.Server({ server });

// Watch for file changes and notify clients
const chokidar = require("chokidar");
const watcher = chokidar.watch(["./*.js", "./*.html", "./*.css"], {
  ignored: /(^|[\/\\])\../, // ignore dotfiles
  persistent: true,
});

watcher.on("change", (path) => {
  console.log(`File ${path} has been changed`);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send("reload");
    }
  });
});
