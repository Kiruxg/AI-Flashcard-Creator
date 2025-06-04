// Card Type Manager
export class CardTypeManager {
  constructor() {
    this.cardTypes = {
      basic: {
        name: "Basic",
        description: "Simple front and back flashcards",
        tiers: ["free", "premium"],
        maxCards: {
          free: 10,
          premium: 100,
        },
      },
      cloze: {
        name: "Cloze Deletion",
        description: "Fill-in-the-blank style cards",
        tiers: ["free", "premium"],
        maxCards: {
          free: 5,
          premium: 50,
        },
      },
      multipleChoice: {
        name: "Multiple Choice",
        description: "Question with multiple answer choices",
        tiers: ["premium"],
        maxCards: {
          premium: 50,
        },
      },
      imageOcclusion: {
        name: "Image Occlusion",
        description: "Hide parts of an image to test recall",
        tiers: ["premium"],
        maxCards: {
          premium: 30,
        },
      },
      conceptMap: {
        name: "Concept Map",
        description: "Visual representation of relationships between concepts",
        tiers: ["premium"],
        maxCards: {
          premium: 20,
        },
      },
    };
  }

  // Validation methods
  validateTermCard(card) {
    return (
      card &&
      typeof card.front === "string" &&
      typeof card.back === "string" &&
      card.front.length > 0 &&
      card.back.length > 0
    );
  }

  validateQACard(card) {
    return (
      this.validateTermCard(card) &&
      card.front.includes("?") &&
      card.back.length > card.front.length
    );
  }

  validateClozeCard(card) {
    return (
      card &&
      typeof card.front === "string" &&
      typeof card.back === "string" &&
      card.front.includes("_____") &&
      card.back.includes(card.front.replace("_____", ""))
    );
  }

  validateImageOcclusionCard(card) {
    return (
      card &&
      card.image &&
      Array.isArray(card.occlusions) &&
      card.occlusions.length > 0 &&
      card.occlusions.every(
        (occ) =>
          typeof occ.x === "number" &&
          typeof occ.y === "number" &&
          typeof occ.width === "number" &&
          typeof occ.height === "number" &&
          typeof occ.label === "string"
      )
    );
  }

  validateMultipleChoiceCard(card) {
    return (
      card &&
      typeof card.front === "string" &&
      Array.isArray(card.options) &&
      card.options.length >= 2 &&
      typeof card.correctIndex === "number" &&
      card.correctIndex >= 0 &&
      card.correctIndex < card.options.length
    );
  }

  validateContextualCard(card) {
    return (
      card &&
      typeof card.scenario === "string" &&
      typeof card.question === "string" &&
      typeof card.answer === "string" &&
      typeof card.explanation === "string" &&
      card.scenario.length > 0 &&
      card.question.length > 0 &&
      card.answer.length > 0
    );
  }

  // Rendering methods
  renderTermCard(card, container) {
    container.innerHTML = `
      <div class="card-front card-type-term">
        <h3>${card.front}</h3>
      </div>
      <div class="card-back card-type-term">
        <p>${card.back}</p>
      </div>
    `;
  }

  renderQACard(card, container) {
    container.innerHTML = `
      <div class="card-front card-type-qa">
        <h3>${card.front}</h3>
      </div>
      <div class="card-back card-type-qa">
        <p>${card.back}</p>
        ${
          card.explanation
            ? `<div class="explanation">${card.explanation}</div>`
            : ""
        }
      </div>
    `;
  }

  renderClozeCard(card, container) {
    const frontWithBlanks = card.front.replace(
      /_____/g,
      '<span class="cloze-blank"></span>'
    );
    container.innerHTML = `
      <div class="card-front card-type-cloze">
        <p>${frontWithBlanks}</p>
        ${card.hint ? `<div class="cloze-hint">${card.hint}</div>` : ""}
      </div>
      <div class="card-back card-type-cloze">
        <p>${card.back}</p>
      </div>
    `;
  }

  renderImageOcclusionCard(card, container) {
    container.innerHTML = `
      <div class="card-front card-type-image-occlusion">
        <div class="occlusion-image" style="background-image: url('${
          card.image
        }')">
          ${card.occlusions
            .map(
              (occ) => `
            <div class="occlusion-area" 
                 style="left: ${occ.x}%; top: ${occ.y}%; width: ${occ.width}%; height: ${occ.height}%;"
                 data-label="${occ.label}">
            </div>
          `
            )
            .join("")}
        </div>
      </div>
      <div class="card-back card-type-image-occlusion">
        <div class="occlusion-image" style="background-image: url('${
          card.image
        }')">
          ${card.occlusions
            .map(
              (occ) => `
            <div class="occlusion-label" 
                 style="left: ${occ.x}%; top: ${occ.y}%;">
              ${occ.label}
            </div>
          `
            )
            .join("")}
        </div>
      </div>
    `;
  }

  renderMultipleChoiceCard(card, container) {
    container.innerHTML = `
      <div class="card-front card-type-multiple-choice">
        <h3>${card.front}</h3>
        <ul class="options-list">
          ${card.options
            .map(
              (option, index) => `
            <li class="option" data-index="${index}">
              ${option}
            </li>
          `
            )
            .join("")}
        </ul>
      </div>
      <div class="card-back card-type-multiple-choice">
        <p>Correct answer: ${card.options[card.correctIndex]}</p>
        ${
          card.explanation
            ? `<div class="explanation">${card.explanation}</div>`
            : ""
        }
      </div>
    `;
  }

  renderContextualCard(card, container) {
    container.innerHTML = `
      <div class="card-front card-type-contextual">
        <div class="scenario">${card.scenario}</div>
        <div class="question">${card.question}</div>
      </div>
      <div class="card-back card-type-contextual">
        <p>${card.answer}</p>
        <div class="explanation">${card.explanation}</div>
      </div>
    `;
  }

  // Prompt generation methods
  generateTermPrompt(content) {
    return {
      system: `You are an expert educational content creator specializing in creating precise term-definition flashcards. Follow these guidelines:
1. Select key terms that are essential to understanding the subject
2. Provide clear, concise definitions that capture the term's meaning
3. Include context or usage examples where helpful
4. Use domain-appropriate language
5. Ensure definitions are accurate and complete
6. Avoid circular definitions
7. Include pronunciation guides for complex terms

IMPORTANT: You must respond with a valid JSON object containing an array of flashcards. Each card should have "front" and "back" properties.`,
      user: `Create term-definition flashcards from the following content and return them as a JSON object with a "cards" array:\n\n${content}`,
    };
  }

  generateQAPrompt(content) {
    return {
      system: `You are an expert educational content creator specializing in creating high-quality question-and-answer flashcards. Follow these guidelines:
1. Create clear, concise questions that test understanding rather than memorization
2. Provide detailed, accurate answers that explain the concept
3. Use Bloom's taxonomy levels (remember, understand, apply, analyze, evaluate, create)
4. Include examples where appropriate
5. Avoid yes/no questions
6. Ensure questions are specific and focused
7. Make answers self-contained and complete

IMPORTANT: You must respond with a valid JSON object containing an array of flashcards. Each card should have "front" (question) and "back" (answer) properties.`,
      user: `Create question-answer flashcards from the following content and return them as a JSON object with a "cards" array:\n\n${content}`,
    };
  }

  generateClozePrompt(content) {
    return {
      system: `You are an expert educational content creator specializing in creating cloze deletion flashcards. Follow these guidelines:
1. Select key concepts or terms to blank out
2. Ensure the context provides enough clues to guess the answer
3. Create natural-sounding sentences
4. Include hints when necessary
5. Avoid blanking out too many words in one sentence
6. Ensure the answer is unambiguous
7. Maintain the original meaning of the text

IMPORTANT: You must respond with a valid JSON object containing an array of flashcards. Each card should have "front" (text with blanks), "back" (complete text), and optional "hint" properties.`,
      user: `Create cloze deletion flashcards from the following content and return them as a JSON object with a "cards" array:\n\n${content}`,
    };
  }

  generateImageOcclusionPrompt(content) {
    return {
      system: `You are an expert educational content creator specializing in creating image occlusion flashcards. Follow these guidelines:
1. Identify key elements in the image that should be occluded
2. Create clear, descriptive labels for each occlusion
3. Ensure occlusions are appropriately sized
4. Maintain the educational value of the image
5. Consider the difficulty level of the occlusions
6. Provide clear explanations for each label
7. Ensure the image is clear and of good quality

IMPORTANT: You must respond with a valid JSON object containing an array of flashcards. Each card should have "image", "occlusions" array with x, y, width, height, and label properties.`,
      user: `Create image occlusion flashcards from the following content and return them as a JSON object with a "cards" array:\n\n${content}`,
    };
  }

  generateMultipleChoicePrompt(content) {
    return {
      system: `You are an expert educational content creator specializing in creating multiple-choice flashcards. Follow these guidelines:
1. Create clear, unambiguous questions
2. Provide 4 plausible answer options
3. Include one correct answer and three distractors
4. Make distractors similar in length and style to the correct answer
5. Avoid obvious wrong answers
6. Include explanations for the correct answer
7. Ensure questions test understanding, not just recall

IMPORTANT: You must respond with a valid JSON object containing an array of flashcards. Each card should have "front" (question), "options" array, "correctIndex" number, and optional "explanation" properties.`,
      user: `Create multiple-choice flashcards from the following content and return them as a JSON object with a "cards" array:\n\n${content}`,
    };
  }

  generateContextualPrompt(content) {
    return {
      system: `You are an expert educational content creator specializing in creating contextual/scenario-based flashcards. Follow these guidelines:
1. Create realistic scenarios that apply the concepts
2. Write clear, focused questions about the scenario
3. Provide detailed, accurate answers
4. Include explanations that connect the scenario to the concept
5. Use real-world applications
6. Ensure scenarios are relevant and engaging
7. Make the learning context clear

IMPORTANT: You must respond with a valid JSON object containing an array of flashcards. Each card should have "scenario", "question", "answer", and "explanation" properties.`,
      user: `Create contextual flashcards from the following content and return them as a JSON object with a "cards" array:\n\n${content}`,
    };
  }

  // Helper methods
  getCardType(type) {
    return this.cardTypes[type];
  }

  getAllCardTypes() {
    return Object.keys(this.cardTypes);
  }

  getCardTypeName(type) {
    return this.cardTypes[type]?.name || type;
  }

  validateCard(card, type) {
    const cardType = this.getCardType(type);
    if (!cardType) return false;
    return cardType.validate(card);
  }

  renderCard(card, type, container) {
    const cardType = this.getCardType(type);
    if (!cardType) {
      console.error(`Unknown card type: ${type}`);
      return;
    }
    cardType.render(card, container);
  }

  generatePrompt(content, type) {
    const cardType = this.getCardType(type);
    if (!cardType) {
      console.error(`Unknown card type: ${type}`);
      return null;
    }
    return cardType.generatePrompt(content);
  }

  // Add new methods for tier-based restrictions
  getAvailableCardTypes(userTier) {
    return Object.entries(this.cardTypes)
      .filter(([_, type]) => type.tiers.includes(userTier))
      .map(([key, type]) => ({
        id: key,
        ...type,
      }));
  }

  isCardTypeAvailable(cardType, userTier) {
    return this.cardTypes[cardType]?.tiers.includes(userTier) || false;
  }

  getMaxCards(cardType, userTier) {
    return this.cardTypes[cardType]?.maxCards[userTier] || 0;
  }

  updateCardTypeSelectors(userTier) {
    const availableTypes = this.getAvailableCardTypes(userTier);
    const selectors = document.querySelectorAll('select[id$="CardType"]');

    selectors.forEach((select) => {
      // Store current value
      const currentValue = select.value;

      // Clear existing options
      select.innerHTML = '<option value="">Select card type...</option>';

      // Add available options
      availableTypes.forEach((type) => {
        const option = document.createElement("option");
        option.value = type.id;
        option.textContent = type.name;
        option.title = type.description;
        select.appendChild(option);
      });

      // Restore previous value if still available
      if (currentValue && this.isCardTypeAvailable(currentValue, userTier)) {
        select.value = currentValue;
      }

      // Add premium indicators
      if (userTier === "free") {
        select.querySelectorAll("option").forEach((option) => {
          if (option.value && !this.isCardTypeAvailable(option.value, "free")) {
            option.textContent += " (Premium)";
            option.disabled = true;
          }
        });
      }
    });
  }
}
