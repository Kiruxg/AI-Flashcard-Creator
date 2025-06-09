// Quiz Mode Manager
class QuizModeManager {
  constructor() {
    this.isQuizMode = false;
    this.quizCards = [];
    this.currentQuizIndex = 0;
    this.score = 0;
    this.initializeEventListeners();
  }

  initializeEventListeners() {
    // Listen for quiz mode toggle changes
    ["text", "upload", "url"].forEach((type) => {
      const toggle = document.getElementById(`${type}QuizModeToggle`);
      if (toggle) {
        toggle.addEventListener("change", (e) => {
          this.handleQuizModeToggle(e.target.checked, type);
        });
      }
    });
  }

  handleQuizModeToggle(enabled, type) {
    this.isQuizMode = enabled;
    // Update UI to reflect quiz mode status
    document.body.classList.toggle("quiz-mode-active", enabled);

    // Show/hide quiz mode actions
    this.updateQuizModeUI(enabled);

    // Update card generation options
    this.updateCardGenerationOptions(enabled, type);
  }

  updateQuizModeUI(enabled) {
    const quizModeActions = document.getElementById("quizModeActions");
    if (quizModeActions) {
      quizModeActions.style.display = enabled ? "flex" : "none";
    }

    // Initialize Take Quiz button if enabled
    if (enabled) {
      this.initializeTakeQuizButton();
    }
  }

  initializeTakeQuizButton() {
    const takeQuizBtn = document.getElementById("takeQuizBtn");
    if (takeQuizBtn) {
      // Remove any existing event listeners
      takeQuizBtn.removeEventListener("click", this.handleTakeQuizClick);

      // Add new event listener
      this.handleTakeQuizClick = () => {
        this.startQuizMode();
      };

      takeQuizBtn.addEventListener("click", this.handleTakeQuizClick);
    }

    // Also listen for flashcard generation events to show/hide the button
    this.listenForFlashcardEvents();
  }

  listenForFlashcardEvents() {
    // Listen for when flashcards are generated
    document.addEventListener("flashcardsGenerated", () => {
      if (this.isQuizMode) {
        this.showQuizModeActions(true);
      }
    });

    // Listen for when flashcards are cleared
    document.addEventListener("flashcardsCleared", () => {
      this.showQuizModeActions(false);
    });
  }

  showQuizModeActions(show) {
    const quizModeActions = document.getElementById("quizModeActions");
    if (quizModeActions) {
      if (show && this.isQuizMode) {
        quizModeActions.style.display = "flex";
        quizModeActions.classList.add("show");
      } else {
        quizModeActions.style.display = "none";
        quizModeActions.classList.remove("show");
      }
    }
  }

  startQuizMode() {
    // Get current flashcards from the global flashcards variable
    if (!window.flashcards || window.flashcards.length === 0) {
      console.error("No flashcards available for quiz mode");
      alert("Please generate flashcards first before taking a quiz.");
      return;
    }

    console.log("Starting quiz with", window.flashcards.length, "cards");

    // Create a quiz deck from current flashcards
    const quizDeck = {
      name: window.APP_CONFIG?.QUIZ_NAME || "Generated Flashcard Quiz",
      description: window.APP_CONFIG?.QUIZ_DESCRIPTION || "Quiz generated from your flashcards",
      cards: window.flashcards,
      id: `quiz_${Date.now()}`,
      createdAt: new Date().toISOString(),
    };

    // Store the deck in sessionStorage and redirect to quiz.html
    sessionStorage.setItem("quizDeck", JSON.stringify(quizDeck));
    window.location.href = "/quiz.html";
  }

  updateCardGenerationOptions(enabled, type) {
    const cardTypeManager = window.cardTypeManager;
    if (cardTypeManager) {
      cardTypeManager.setQuizMode(enabled);
    }
  }

  // Convert flashcards to quiz format
  convertToQuizCards(flashcards) {
    return flashcards.map((card) => {
      // Generate 3 random incorrect options
      const incorrectOptions = this.generateIncorrectOptions(
        card.back,
        flashcards
      );

      return {
        question: card.front,
        options: this.shuffleArray([card.back, ...incorrectOptions]),
        correctAnswer: card.back,
        explanation: card.explanation || null,
        type: card.type || "qa",
      };
    });
  }

  generateIncorrectOptions(correctAnswer, allCards) {
    // Filter out the correct answer and get unique incorrect options
    const otherAnswers = allCards
      .map((card) => card.back)
      .filter((answer) => answer !== correctAnswer)
      .filter((answer, index, arr) => arr.indexOf(answer) === index); // Remove duplicates

    // Filter out obviously bad distractors (numbers only, too short, etc.)
    const goodDistractors = otherAnswers.filter((answer) => {
      // Remove pure numbers or very short answers
      if (/^\d+$/.test(answer.trim()) || answer.trim().length < 5) {
        return false;
      }
      
      // Remove answers that are too similar to correct answer
      if (answer.toLowerCase().includes(correctAnswer.toLowerCase()) || 
          correctAnswer.toLowerCase().includes(answer.toLowerCase())) {
        return false;
      }
      
      // Prefer answers with similar characteristics (length, structure)
      const correctLength = correctAnswer.length;
      const answerLength = answer.length;
      const lengthRatio = Math.min(correctLength, answerLength) / Math.max(correctLength, answerLength);
      
      return lengthRatio > 0.3; // At least 30% similar length
    });

    // Sort distractors by quality
    const sortedDistractors = goodDistractors.sort((a, b) => {
      // Prefer answers with similar word count
      const correctWordCount = correctAnswer.split(' ').length;
      const aWordCount = a.split(' ').length;
      const bWordCount = b.split(' ').length;
      
      const aWordDiff = Math.abs(correctWordCount - aWordCount);
      const bWordDiff = Math.abs(correctWordCount - bWordCount);
      
      return aWordDiff - bWordDiff;
    });

    const options = [];
    
    // Add the best distractors first
    for (const distractor of sortedDistractors) {
      if (options.length >= 3) break;
      options.push(distractor);
    }

    // If we need more options, add from remaining answers (excluding pure numbers)
    if (options.length < 3) {
      for (const answer of otherAnswers) {
        if (options.length >= 3) break;
        if (!goodDistractors.includes(answer) && !options.includes(answer)) {
          // Only add if it's not a pure number
          if (!/^\d+$/.test(answer.trim())) {
            options.push(answer);
          }
        }
      }
    }

    // Fill remaining slots with contextually appropriate wrong answers if needed
    const genericWrongAnswers = [
      "A process used in manufacturing",
      "A safety procedure or protocol",
      "A measurement or calculation method",
    ];

    while (options.length < 3) {
      const generic = genericWrongAnswers[options.length];
      if (generic && !options.includes(generic)) {
        options.push(generic);
      } else {
        options.push(`Alternative definition ${options.length + 1}`);
      }
    }

    return options.slice(0, 3);
  }

  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  // Initialize quiz interface
  initializeQuizInterface(quizCards) {
    this.quizCards = quizCards;
    this.currentQuizIndex = 0;
    this.score = 0;
    this.showQuizCard();
  }

  showQuizCard() {
    if (this.currentQuizIndex >= this.quizCards.length) {
      this.showQuizResults();
      return;
    }

    const card = this.quizCards[this.currentQuizIndex];
    const quizContainer = document.createElement("div");
    quizContainer.className = "quiz-container";
    quizContainer.innerHTML = `
      <div class="quiz-progress">
        <span>Question ${this.currentQuizIndex + 1}/${
      this.quizCards.length
    }</span>
        <span class="quiz-score">Score: ${this.score}/${
      this.currentQuizIndex
    }</span>
      </div>
      <div class="quiz-question">${card.question}</div>
      <div class="quiz-options">
        ${card.options
          .map(
            (option, index) => `
          <button class="quiz-option" data-index="${index}">${option}</button>
        `
          )
          .join("")}
      </div>
    `;

    // Replace flashcard viewer with quiz container
    const flashcardContainer = document.querySelector(".flashcard-container");
    const existingQuiz = flashcardContainer.querySelector(".quiz-container");
    if (existingQuiz) {
      existingQuiz.remove();
    }
    flashcardContainer.appendChild(quizContainer);

    // Add event listeners to options
    quizContainer.querySelectorAll(".quiz-option").forEach((option) => {
      option.addEventListener("click", () => this.handleAnswer(option, card));
    });
  }

  handleAnswer(selectedOption, card) {
    const isCorrect = selectedOption.textContent === card.correctAnswer;

    // Update score
    if (isCorrect) {
      this.score++;
    }

    // Show feedback
    selectedOption.classList.add(isCorrect ? "correct" : "incorrect");

    // Show explanation if available
    if (card.explanation) {
      const feedback = document.createElement("div");
      feedback.className = `quiz-feedback ${
        isCorrect ? "correct" : "incorrect"
      }`;
      feedback.innerHTML = `
        <strong>${isCorrect ? "Correct!" : "Incorrect"}</strong>
        <p>${card.explanation}</p>
      `;
      selectedOption.parentNode.appendChild(feedback);
    }

    // Move to next question after a delay
    setTimeout(() => {
      this.currentQuizIndex++;
      this.showQuizCard();
    }, 2000);
  }

  showQuizResults() {
    const percentage = Math.round((this.score / this.quizCards.length) * 100);
    const resultsContainer = document.createElement("div");
    resultsContainer.className = "quiz-results";
    resultsContainer.innerHTML = `
      <h2>Quiz Complete!</h2>
      <div class="quiz-score">
        <div class="score-circle">
          <span class="score-number">${percentage}%</span>
        </div>
        <p>You got ${this.score} out of ${this.quizCards.length} questions correct</p>
      </div>
      <div class="quiz-actions">
        <button class="btn btn-primary" id="retryQuizBtn">
          <i class="fas fa-redo"></i> Try Again
        </button>
        <button class="btn btn-secondary" id="returnToPracticeBtn">
          <i class="fas fa-cards"></i> Return to Practice
        </button>
      </div>
    `;

    const flashcardContainer = document.querySelector(".flashcard-container");
    const existingQuiz = flashcardContainer.querySelector(".quiz-container");
    if (existingQuiz) {
      existingQuiz.remove();
    }
    flashcardContainer.appendChild(resultsContainer);

    // Add event listeners for retry and return buttons
    document.getElementById("retryQuizBtn").addEventListener("click", () => {
      this.initializeQuizInterface(this.quizCards);
    });

    document
      .getElementById("returnToPracticeBtn")
      .addEventListener("click", () => {
        resultsContainer.remove();
        // Show normal flashcard view
        document.querySelector("#flashcard").style.display = "block";
        document.querySelector(".card-controls").style.display = "flex";
      });
  }
}

// Export the QuizModeManager
export const quizModeManager = new QuizModeManager();
