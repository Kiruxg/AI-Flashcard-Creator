require("dotenv").config();

console.log("Testing environment variables:");
console.log(
  "STRIPE_PUBLISHABLE_KEY:",
  process.env.STRIPE_PUBLISHABLE_KEY ? "✓ Loaded" : "✗ Missing"
);
console.log(
  "STRIPE_SECRET_KEY:",
  process.env.STRIPE_SECRET_KEY ? "✓ Loaded" : "✗ Missing"
);
console.log(
  "STRIPE_WEBHOOK_SECRET:",
  process.env.STRIPE_WEBHOOK_SECRET ? "✓ Loaded" : "✗ Missing"
);
console.log("DOMAIN:", process.env.DOMAIN ? "✓ Loaded" : "✗ Missing");
