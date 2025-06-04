import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Stripe from "stripe";
import admin from "firebase-admin";
import { OpenAI } from "openai";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import xss from "xss-clean";
import sanitizeHtml from "sanitize-html";
import * as pdfjsLib from "pdfjs-dist";
import multer from "multer";
import * as cheerio from "cheerio";
import axios from "axios";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { promises as fs } from "fs";
import {
  extractTextFromPDF,
  performOCR,
  detectContentType,
  technicalTerminologyProcessor,
  technicalDiagramProcessor,
} from "./utils/contentProcessing.js";
import { CardTypeManager } from "./cardTypeManager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables and initialize Firebase
dotenv.config();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Read service account file
const serviceAccount = JSON.parse(
  await fs.readFile(new URL("./serviceAccountKey.json", import.meta.url))
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app = express();

// Create uploads directory if it doesn't exist
const uploadsDir = join(__dirname, "uploads");
if (!fs.access(uploadsDir)) {
  fs.mkdir(uploadsDir);
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)
    );
  },
});

// Configure file filter
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Invalid file type. Only PDF, DOC, DOCX, TXT, and image files are allowed."
      ),
      false
    );
  }
};

// Initialize multer upload middleware
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          "https://js.stripe.com",
          "https://www.gstatic.com",
          "https://cdnjs.cloudflare.com",
          "https://cdn.jsdelivr.net",
          "https://code.jquery.com",
          "https://*.firebaseio.com",
          "https://www.googletagmanager.com",
          "https://www.google-analytics.com",
          "https://region1.google-analytics.com",
          "https://apis.google.com",
          "https://*.googleapis.com",
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com",
          "https://*.googleapis.com",
          "https://cdnjs.cloudflare.com",
        ],
        styleSrcElem: [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com",
          "https://*.googleapis.com",
          "https://cdnjs.cloudflare.com",
        ],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: [
          "'self'",
          "https://api.openai.com",
          "https://*.googleapis.com",
          "https://*.firebaseio.com",
          "https://*.google-analytics.com",
          "https://api.stripe.com",
        ],
        frameSrc: [
          "'self'",
          "https://js.stripe.com",
          "https://*.google.com",
          "https://hooks.stripe.com",
          "https://*.firebaseapp.com",
          "https://*.firebaseusercontent.com",
        ],
        objectSrc: ["'none'"],
        fontSrc: [
          "'self'",
          "data:",
          "blob:",
          "https:",
          "https://fonts.gstatic.com",
          "https://fonts.googleapis.com",
          "https://*.googleapis.com",
          "https://*.gstatic.com",
          "https://*.google.com",
          "https://*.googleusercontent.com",
          "https://cdnjs.cloudflare.com",
        ],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    dnsPrefetchControl: true,
    frameguard: { action: "deny" },
    hidePoweredBy: true,
    hsts: true,
    ieNoOpen: true,
    noSniff: true,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    xssFilter: true,
  })
);

// Basic middleware
app.use(xss());
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
app.use(express.static("."));

// Rate limiting
app.use(
  "/api/",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: "Too many requests from this IP, please try again later.",
  })
);

// Initialize OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Constants
const MAX_TOKENS_PER_REQUEST = 4000;
const MAX_TEXT_LENGTH = 50000;
const FREE_TIER_MONTHLY_LIMIT = 100000;
const PREMIUM_TIER_MONTHLY_LIMIT = 1000000;

// Sanitization configuration
const sanitizeOptions = {
  allowedTags: ["b", "i", "em", "strong", "a", "p", "br"],
  allowedAttributes: { a: ["href", "target"] },
  allowedIframeHostnames: [],
};

// Utility functions
const sanitizeInput = (req, res, next) => {
  if (req.body) {
    Object.keys(req.body).forEach((key) => {
      if (typeof req.body[key] === "string") {
        req.body[key] = sanitizeHtml(req.body[key], sanitizeOptions);
      } else if (Array.isArray(req.body[key])) {
        req.body[key] = req.body[key].map((item) =>
          typeof item === "string" ? sanitizeHtml(item, sanitizeOptions) : item
        );
      }
    });
  }
  next();
};

const estimateTokens = (text) => Math.ceil(text.length / 4);

const authenticateUser = async (req, res, next) => {
  try {
    const idToken = req.headers.authorization?.split("Bearer ")[1];
    if (!idToken) throw new Error("No token provided");
    req.user = await admin.auth().verifyIdToken(idToken);
    next();
  } catch (error) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
};

// Error handler middleware
const errorHandler = (err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({
    error: {
      code: err.code || "server_error",
      message: err.message || "Internal server error",
    },
  });
};

// Routes
app.use("/api/generate-flashcards", sanitizeInput);
app.use("/api/save-deck", sanitizeInput);
app.use("/api/update-deck", sanitizeInput);

// File upload route
app.post(
  "/api/process-content",
  upload.single("file"),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const filePath = req.file.path;
      const fileType = req.file.mimetype;
      let content;

      if (fileType.startsWith("image/")) {
        content = await processImage(filePath);
      } else if (fileType === "application/pdf") {
        content = await extractTextFromPDF(filePath);
      } else if (fileType.includes("word") || fileType === "text/plain") {
        content = await processDocument(filePath);
      } else {
        return res.status(400).json({ error: "Unsupported file type" });
      }

      // Clean up the uploaded file
      fs.unlink(filePath, (err) => {
        if (err) console.error("Error deleting file:", err);
      });

      res.json({ content });
    } catch (error) {
      next(error);
    }
  }
);

// Update domain processors object for trades
const domainProcessors = {
  technical: {
    terminology: technicalTerminologyProcessor,
    visualLearning: technicalDiagramProcessor,
  },
};

// Enhanced file processing for trades content
async function processContent(input) {
  const processors = {
    pdf: async (file) => {
      const pdf = await pdfjsLib.getDocument(file).promise;
      return extractTextFromPDF(pdf);
    },
    image: async (file) => {
      return performOCR(file);
    },
  };

  const type = detectContentType(input);
  return processors[type](input);
}

// Enhanced flashcard generation with multimedia
async function generateMultimediaFlashcards(content) {
  const enhancedContent = await processContent(content);
  return generateFlashcards(enhancedContent, {
    includeImages: true,
    includeAudio: true,
    includeVideo: true,
  });
}

// Enhanced flashcard generation for professionals
async function generateProfessionalFlashcards(content, domain) {
  const processor = domainProcessors[domain];
  const processedContent = await processor.terminology(content);
  const complianceChecked = await processor.compliance(processedContent);
  return generateDomainSpecificCards(complianceChecked, domain);
}

// Initialize card type manager
const cardTypeManager = new CardTypeManager();

// Update the flashcard generation endpoint
app.post("/api/generate-flashcards", async (req, res) => {
  try {
    const { text, cardType, cardCount, options } = req.body;

    if (!text || !cardType || !cardCount) {
      return res.status(400).json({
        error: "Missing required parameters",
        details: "Text, card type, and card count are required",
      });
    }

    // Validate card type
    if (!cardTypeManager.getCardType(cardType)) {
      return res.status(400).json({
        error: "Invalid card type",
        details: `Supported card types: ${cardTypeManager
          .getAllCardTypes()
          .join(", ")}`,
      });
    }

    // Get the appropriate prompt for the card type
    const prompt = cardTypeManager.generatePrompt(text, cardType);

    // Call the AI service with GPT-3.5-turbo
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      temperature: 0.7,
      max_tokens: 1000, // Reduced for GPT-3.5
      n: Math.min(cardCount, 5), // Limit to 5 cards per request for GPT-3.5
      response_format: { type: "json_object" }, // Ensure JSON response
    });

    // Process and validate the generated cards
    const cards = response.choices
      .map((choice) => {
        try {
          const responseData = JSON.parse(choice.message.content);

          // Handle new structure where cards are in a "cards" array
          const cardsArray = responseData.cards || [responseData];

          return cardsArray.map((card) => {
            // Add card type and metadata
            card.type = cardType;
            card.metadata = {
              generatedAt: new Date().toISOString(),
              userId: options?.userId,
              isPremium: options?.isPremium,
            };

            // Validate the card
            if (!cardTypeManager.validateCard(card, cardType)) {
              throw new Error(`Invalid card format for type: ${cardType}`);
            }

            return card;
          });
        } catch (error) {
          console.error("Error processing card:", error);
          return [];
        }
      })
      .flat()
      .filter((card) => card !== null);

    // If we need more cards than generated, make additional requests
    let allCards = [...cards];
    while (allCards.length < cardCount) {
      const remainingCount = cardCount - allCards.length;
      const batchSize = Math.min(remainingCount, 5);

      const additionalResponse = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
        temperature: 0.7,
        max_tokens: 1000,
        n: batchSize,
        response_format: { type: "json_object" },
      });

      const additionalCards = additionalResponse.choices
        .map((choice) => {
          try {
            const responseData = JSON.parse(choice.message.content);

            // Handle new structure where cards are in a "cards" array
            const cardsArray = responseData.cards || [responseData];

            return cardsArray.map((card) => {
              card.type = cardType;
              card.metadata = {
                generatedAt: new Date().toISOString(),
                userId: options?.userId,
                isPremium: options?.isPremium,
              };
              if (!cardTypeManager.validateCard(card, cardType)) {
                throw new Error(`Invalid card format for type: ${cardType}`);
              }
              return card;
            });
          } catch (error) {
            console.error("Error processing additional card:", error);
            return [];
          }
        })
        .flat()
        .filter((card) => card !== null);

      allCards = [...allCards, ...additionalCards];
    }

    // Check if we got enough valid cards
    if (allCards.length < cardCount) {
      return res.status(500).json({
        error: "Insufficient valid cards generated",
        details: `Generated ${allCards.length} valid cards out of ${cardCount} requested`,
      });
    }

    res.json({ flashcards: allCards });
  } catch (error) {
    console.error("Error generating flashcards:", error);
    res.status(500).json({
      error: "Failed to generate flashcards",
      details: error.message,
    });
  }
});

// Add a new endpoint for image occlusion processing
app.post(
  "/api/process-image-occlusion",
  upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No image uploaded" });
      }

      const image = req.file;
      const { occlusions } = req.body;

      // Validate occlusions
      if (!Array.isArray(occlusions)) {
        return res.status(400).json({ error: "Invalid occlusions format" });
      }

      // Process the image and occlusions
      const processedImage = await processImageForOcclusion(image, occlusions);

      res.json({
        image: processedImage.url,
        occlusions: processedImage.occlusions,
      });
    } catch (error) {
      console.error("Error processing image occlusion:", error);
      res.status(500).json({
        error: "Failed to process image occlusion",
        details: error.message,
      });
    }
  }
);

// Helper function to process images for occlusion
async function processImageForOcclusion(image, occlusions) {
  // Implement image processing logic here
  // This could include:
  // 1. Image optimization
  // 2. Storage in cloud storage
  // 3. Generation of occlusion areas
  // 4. Validation of occlusion coordinates

  // For now, return a mock response
  return {
    url: `/uploads/${image.filename}`,
    occlusions: occlusions.map((occ) => ({
      ...occ,
      validated: true,
    })),
  };
}

// Subscription management endpoints
app.post("/create-checkout-session", async (req, res) => {
  try {
    const { priceId, userId, isUpgrade } = req.body;
    const userDoc = await admin
      .firestore()
      .collection("users")
      .doc(userId)
      .get();

    if (!userDoc.exists) throw { status: 404, message: "User not found" };

    const userData = userDoc.data();
    const sessionConfig = {
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.APP_DOMAIN}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_DOMAIN}/pricing`,
      client_reference_id: userId,
      customer_email: userData.email,
    };

    if (isUpgrade && userData.stripeCustomerId) {
      const subscription = (
        await stripe.subscriptions.list({
          customer: userData.stripeCustomerId,
          status: "active",
        })
      ).data[0];

      if (subscription) {
        const prorationItems =
          await stripe.subscriptionItems.listProrationItems({
            subscription: subscription.id,
            subscription_item: subscription.items.data[0].id,
            proration_date: Math.floor(Date.now() / 1000),
          });

        sessionConfig.line_items = [
          ...prorationItems.data.map((item) => ({
            price: item.price.id,
            quantity: item.quantity,
            description: item.description,
          })),
          { price: priceId, quantity: 1 },
        ];

        sessionConfig.subscription_data = {
          trial_end: null,
          proration_behavior: "always_invoice",
        };
      }
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);
    res.json({ sessionId: session.id });
  } catch (error) {
    next(error);
  }
});

// Webhook handler
app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      const event = stripe.webhooks.constructEvent(
        req.body,
        req.headers["stripe-signature"],
        process.env.STRIPE_WEBHOOK_SECRET
      );

      const handlers = {
        "customer.subscription.created": handleSubscriptionChange,
        "customer.subscription.updated": handleSubscriptionChange,
        "customer.subscription.deleted": handleSubscriptionCancellation,
        "charge.refunded": handleRefundProcessed,
      };

      const handler = handlers[event.type];
      if (handler) await handler(event.data.object);

      res.json({ received: true });
    } catch (error) {
      next(error);
    }
  }
);

// Subscription handlers
async function handleSubscriptionChange(subscription) {
  const userId = subscription.metadata.userId;
  await admin
    .firestore()
    .collection("users")
    .doc(userId)
    .update({
      subscriptionStatus: subscription.status,
      subscriptionId: subscription.id,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      priceId: subscription.items.data[0].price.id,
    });
}

async function handleSubscriptionCancellation(subscription) {
  const userId = subscription.metadata.userId;
  await admin
    .firestore()
    .collection("users")
    .doc(userId)
    .update({
      subscriptionStatus: "canceled",
      subscriptionId: null,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: true,
      priceId: null,
    });
}

async function handleRefundProcessed(charge) {
  const refund = charge.refunds.data[0];
  if (!refund?.metadata?.userId) return;

  await admin
    .firestore()
    .collection("users")
    .doc(refund.metadata.userId)
    .update({
      refundStatus: refund.status,
      refundProcessedAt: new Date().toISOString(),
      subscriptionStatus: "refunded",
    });
}

// Privacy and security enhancements
const privacyMiddleware = {
  dataEncryption: async (req, res, next) => {
    // Encrypt sensitive data
    req.body = await encryptSensitiveData(req.body);
    next();
  },
  auditLogging: async (req, res, next) => {
    // Log data access
    await logDataAccess(req.user, req.path);
    next();
  },
};

// Enhanced user interface components
const enhancedUI = {
  accessibility: {
    screenReader: true,
    highContrast: true,
    keyboardNavigation: true,
  },
  progressTracking: {
    detailedStats: true,
    visualizations: true,
    recommendations: true,
  },
};

// Enhanced AI capabilities
const multimodalAI = {
  textToSpeech: async (text) => {
    // Convert text to speech
  },
  imageGeneration: async (prompt) => {
    // Generate educational images
  },
  videoProcessing: async (video) => {
    // Process and enhance educational videos
  },
  interactiveLearning: async (content) => {
    // Create interactive learning experiences
  },
};

// AI-Assisted Content Analysis
app.post("/api/analyze-content", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: "No text provided" });
    }

    const suggestions = await analyzeContent(text);
    res.json({ suggestions });
  } catch (error) {
    console.error("Error analyzing content:", error);
    res.status(500).json({ error: "Failed to analyze content" });
  }
});

async function analyzeContent(text) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `You are an AI assistant that helps users create high-quality flashcards. 
          Analyze the provided content and suggest potential flashcard topics, key concepts, 
          and important terms that would make good flashcards. Focus on identifying:
          1. Key concepts that need to be understood
          2. Important terminology and definitions
          3. Relationships between concepts
          4. Potential question-answer pairs
          
          Return your suggestions as a JSON array of objects with the following structure:
          {
            "id": "unique-id",
            "type": "concept|term|relationship|question",
            "content": "suggestion text",
            "explanation": "brief explanation of why this would make a good flashcard"
          }`,
        },
        {
          role: "user",
          content: text,
        },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const suggestions = JSON.parse(response.choices[0].message.content);
    return suggestions;
  } catch (error) {
    console.error("Error in analyzeContent:", error);
    throw error;
  }
}

// Content Processing
app.post("/api/process-content", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const file = req.file;
    const fileType = file.mimetype;
    let content;

    // Process different file types
    if (fileType.startsWith("image/")) {
      content = await processImage(file);
    } else if (fileType === "application/pdf") {
      content = await extractTextFromPDF(file.path);
    } else if (fileType.includes("document") || fileType === "text/plain") {
      content = await processDocument(file);
    } else {
      return res.status(400).json({ error: "Unsupported file type" });
    }

    // Generate flashcards from the processed content
    const flashcards = await generateFlashcards(content);
    res.json({ content, flashcards });
  } catch (error) {
    console.error("Error processing content:", error);
    res.status(500).json({ error: "Failed to process content" });
  }
});

async function processImage(file) {
  try {
    // For now, we'll use OCR to extract text from images
    // In a production environment, you might want to use a more sophisticated
    // image processing service that can handle diagrams, charts, etc.
    const text = await performOCR(file.path);
    return text;
  } catch (error) {
    console.error("Error processing image:", error);
    throw error;
  }
}

async function processDocument(file) {
  try {
    // For now, we'll just read text files directly
    // In a production environment, you might want to use a library like mammoth
    // for DOCX files or other document processing libraries
    const text = await fs.readFile(file.path, "utf-8");
    return text;
  } catch (error) {
    console.error("Error processing document:", error);
    throw error;
  }
}

// Web Content Fetching
app.post("/api/fetch-web-content", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: "No URL provided" });
    }

    const content = await fetchWebContent(url);
    res.json(content);
  } catch (error) {
    console.error("Error fetching web content:", error);
    res.status(500).json({ error: "Failed to fetch web content" });
  }
});

async function fetchWebContent(url) {
  try {
    const response = await axios.get(url);
    const html = response.data;

    // Use cheerio to parse the HTML and extract relevant content
    const $ = cheerio.load(html);

    // Remove unwanted elements
    $("script, style, nav, footer, header, aside").remove();

    // Extract title
    const title = $("title").text() || $("h1").first().text();

    // Extract main content
    // This is a simple implementation - you might want to use a more sophisticated
    // content extraction library in production
    const content = $("article, main, .content, #content")
      .first()
      .text()
      .trim()
      .replace(/\s+/g, " ");

    return {
      title,
      content,
      url,
    };
  } catch (error) {
    console.error("Error in fetchWebContent:", error);
    throw error;
  }
}

// Apply error handler
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 12345;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
