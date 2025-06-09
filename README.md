# AI-Powered Flashcard Generator

Transform your study materials into interactive flashcards using AI. Perfect for students, trades professionals, and lifelong learners.

## Features

- 📚 Upload PDFs or paste text to generate flashcards
- 🤖 AI-powered content extraction and flashcard generation
- 🎯 Interactive flashcard viewer with flip animation
- 🔒 User authentication and secure storage
- 💳 Subscription-based model with Stripe integration
- 📱 Responsive design for all devices

## Tech Stack

- Next.js 14 with TypeScript
- Firebase for authentication and database
- OpenAI API for content processing
- Stripe for payments
- TailwindCSS for styling

## Getting Started

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up environment variables:
   Create a `.env.local` file with:
   ```
   FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_API_KEY=your_firebase_api_key
   OPENAI_API_KEY=your_openai_api_key
   STRIPE_SECRET_KEY=your_stripe_secret_key
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
   ```
4. Run the development server:
   ```bash
   npm run dev
   ```

## Development Roadmap

### Phase 1: Core Features

- [x] Project setup
- [ ] PDF upload and text extraction
- [ ] AI flashcard generation
- [ ] Basic flashcard viewer
- [ ] User authentication
- [ ] Database integration

### Phase 2: Enhanced Features

- [ ] Premium features and Stripe integration
- [ ] Study progress tracking
- [ ] Export to Anki/Quizlet
- [ ] Social sharing
- [ ] Study groups

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
