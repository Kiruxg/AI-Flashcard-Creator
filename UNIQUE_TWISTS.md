## High-impact unique twists for the Flashcard Generator

- **Feynman Mode (Explain-to-me grading)**

  - After answering, the learner writes a 1–2 sentence explanation.
  - AI scores clarity and highlights gaps; store notes alongside the card.


**Multi-Format Input**

Handwriting Recognition: Snap a photo of handwritten notes and instantly turn it into flashcards.

Voice Notes → Flashcards: Speak into the app, let AI transcribe and create flashcards.


**Tiered AI Levels**

Free users get text flashcards, paid users unlock diagrams, voice input, and exam simulations beyond 5 questions.


- **Confidence-based scheduling**

  - Add a 1–5 confidence slider after each review.
  - Adapt spaced-repetition intervals using the confidence value to calibrate future due times.

- **Smart distractors for multiple choice**

  - Auto-generate plausible wrong answers from other cards in the deck or with AI.
  - Toggle MC mode per session; keep answer rationales for learning.

- **Interleaving trainer**

  - Combine related decks (e.g., cardio + pharm) and interleave items to improve transfer and retention.

- **Error Log Remix (Weak Spots micro-deck)**

  - Automatically create a weekly mini-deck from items missed ≥2 times.
  - Surfaces targeted practice without manual curation.

- **Active Recall Coach (Socratic prompts)**

  - If the learner hesitates or performs poorly, ask 1–2 tailored follow-up questions before revealing the answer.

- **Audio-first cards**

  - Text-to-Speech reads questions; Speech-to-Text captures spoken answers.
  - Ideal for language learning and hands-free study.

- **Memory hooks (mnemonic + simple image generator)**

  - One-click to generate a mnemonic and a simple supporting image per term.
  - Store and display these as optional cues on review.

- **Share-to-unlock growth loop**

  - Gate select premium decks with a share/invite unlock.
  - Encourages organic distribution while preserving paid tiers.

- **Exam blueprint alignment**

  - Tag cards to official objectives (e.g., NCLEX, USMLE, CompTIA).
  - Show progress by blueprint domain and filter sessions by objective.

- **Adaptive session length**

  - Offer 3, 10, or 25 minute Focus Sets chosen based on prior fatigue/accuracy.
  - Keep quick wins for busy users; lengthen sets when performance is strong.

- **Rapid cloze maker**

  - Paste notes and auto-detect cloze deletions with a live preview editor.
  - Speeds up deck creation from lecture notes.

- **AI-generated retrieval cues**
  - Before reveal, optionally show a subtle cue (first letter, analogy, or category hint).
  - Improves recall without giving away the answer.

### Suggested first implementation (lean MVP)

- Ship Feynman Mode + confidence-based scheduling together:
  - Add `explanation` text capture and `confidence` rating after each card.
  - Use `confidence` to weight next-review intervals in SRS.
  - Store AI feedback and surface a "Weak concepts" list on the progress page.
