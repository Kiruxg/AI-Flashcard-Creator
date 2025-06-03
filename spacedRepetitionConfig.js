// Advanced Spaced Repetition Configuration System
export class SpacedRepetitionConfig {
  constructor() {
    this.presets = {
      // Conservative - for difficult material
      conservative: {
        name: "Conservative",
        description: "For difficult material that requires more repetition",
        learningSteps: [1, 10, 1440], // 1min, 10min, 1day
        graduatingInterval: 1,
        easyInterval: 4,
        startingEase: 2500,
        easyBonus: 1.3,
        hardInterval: 1.2,
        newInterval: 0.0,
        maximumInterval: 36500,
        intervalModifier: 0.8, // Shorter intervals
        requestRetention: 0.95, // Higher retention target
        newCardsPerDay: 15,
        reviewsPerDay: 150,
      },

      // Standard - Anki default settings
      standard: {
        name: "Standard",
        description: "Balanced settings suitable for most content",
        learningSteps: [1, 10],
        graduatingInterval: 1,
        easyInterval: 4,
        startingEase: 2500,
        easyBonus: 1.3,
        hardInterval: 1.2,
        newInterval: 0.0,
        maximumInterval: 36500,
        intervalModifier: 1.0,
        requestRetention: 0.9,
        newCardsPerDay: 20,
        reviewsPerDay: 200,
      },

      // Aggressive - for easy material
      aggressive: {
        name: "Aggressive",
        description: "For easy material with faster progression",
        learningSteps: [10],
        graduatingInterval: 2,
        easyInterval: 6,
        startingEase: 2500,
        easyBonus: 1.5,
        hardInterval: 1.0,
        newInterval: 0.2,
        maximumInterval: 36500,
        intervalModifier: 1.3, // Longer intervals
        requestRetention: 0.85, // Lower retention target
        newCardsPerDay: 30,
        reviewsPerDay: 300,
      },

      // Speed - for rapid learning
      speed: {
        name: "Speed Learning",
        description: "Rapid progression for quick learning sessions",
        learningSteps: [1],
        graduatingInterval: 1,
        easyInterval: 3,
        startingEase: 2500,
        easyBonus: 2.0,
        hardInterval: 1.0,
        newInterval: 0.5,
        maximumInterval: 18250, // ~50 years
        intervalModifier: 1.5,
        requestRetention: 0.8,
        newCardsPerDay: 50,
        reviewsPerDay: 500,
      },

      // Medical - for medical studies
      medical: {
        name: "Medical Studies",
        description: "Optimized for medical terminology and concepts",
        learningSteps: [1, 10, 60, 1440], // Multiple learning steps
        graduatingInterval: 2,
        easyInterval: 5,
        startingEase: 2300, // Lower starting ease
        easyBonus: 1.2,
        hardInterval: 1.1,
        newInterval: 0.1,
        maximumInterval: 18250,
        intervalModifier: 0.9,
        requestRetention: 0.92,
        newCardsPerDay: 25,
        reviewsPerDay: 250,
      },

      // Language - for language learning
      language: {
        name: "Language Learning",
        description: "Optimized for vocabulary and language patterns",
        learningSteps: [1, 10, 1440, 4320], // Extended learning
        graduatingInterval: 3,
        easyInterval: 7,
        startingEase: 2400,
        easyBonus: 1.4,
        hardInterval: 1.15,
        newInterval: 0.15,
        maximumInterval: 36500,
        intervalModifier: 1.1,
        requestRetention: 0.88,
        newCardsPerDay: 35,
        reviewsPerDay: 400,
      },

      // Exam - for exam preparation
      exam: {
        name: "Exam Preparation",
        description: "Intensive schedule for upcoming exams",
        learningSteps: [1, 5, 15, 60, 180], // Frequent repetition
        graduatingInterval: 1,
        easyInterval: 2,
        startingEase: 2200,
        easyBonus: 1.1,
        hardInterval: 1.05,
        newInterval: 0.05,
        maximumInterval: 90, // Short maximum interval
        intervalModifier: 0.7,
        requestRetention: 0.97,
        newCardsPerDay: 40,
        reviewsPerDay: 600,
      },
    };

    this.adaptiveSettings = {
      // Adjust based on performance
      performanceAdjustment: true,

      // Increase ease for consistently easy cards
      easeAdjustmentThreshold: 0.9, // 90% success rate
      easeIncreaseAmount: 50,

      // Decrease ease for consistently hard cards
      difficultyAdjustmentThreshold: 0.6, // 60% success rate
      easeDecreaseAmount: 100,

      // Workload balancing
      workloadBalancing: true,
      maxDailyWorkload: 200,
      workloadDistributionDays: 7,

      // Response time consideration
      responseTimeWeight: 0.1,
      fastResponseBonus: 0.05,
      slowResponsePenalty: 0.1,

      // Retention targeting
      retentionTargeting: true,
      retentionAdjustmentRate: 0.02,

      // Forgetting curve optimization
      forgettingCurveOptimization: true,
      minimumDataPoints: 10,
    };

    this.currentConfig = { ...this.presets.standard };
    this.userCustomizations = {};
  }

  // Apply a preset configuration
  applyPreset(presetName) {
    if (this.presets[presetName]) {
      this.currentConfig = { ...this.presets[presetName] };
      this.saveConfig();
      return true;
    }
    return false;
  }

  // Get current configuration
  getConfig() {
    return { ...this.currentConfig, ...this.userCustomizations };
  }

  // Update specific setting
  updateSetting(key, value) {
    this.userCustomizations[key] = value;
    this.saveConfig();
  }

  // Bulk update settings
  updateSettings(settings) {
    Object.assign(this.userCustomizations, settings);
    this.saveConfig();
  }

  // Reset to preset defaults
  resetToPreset(presetName = "standard") {
    this.userCustomizations = {};
    this.applyPreset(presetName);
  }

  // Adaptive configuration based on user performance
  adaptConfigurationBasedOnPerformance(performanceStats) {
    if (!this.adaptiveSettings.performanceAdjustment) return;

    const config = this.getConfig();
    const adaptations = {};

    // Adjust based on retention rate
    if (this.adaptiveSettings.retentionTargeting) {
      const retentionDiff =
        performanceStats.retentionRate - config.requestRetention;

      if (Math.abs(retentionDiff) > 0.05) {
        // 5% threshold
        const adjustment =
          retentionDiff * this.adaptiveSettings.retentionAdjustmentRate;
        adaptations.intervalModifier = Math.max(
          0.5,
          Math.min(2.0, (config.intervalModifier || 1.0) + adjustment)
        );
      }
    }

    // Adjust ease based on success rates
    if (
      performanceStats.averageSuccessRate >
      this.adaptiveSettings.easeAdjustmentThreshold
    ) {
      adaptations.startingEase = Math.min(
        3000,
        (config.startingEase || 2500) + this.adaptiveSettings.easeIncreaseAmount
      );
    } else if (
      performanceStats.averageSuccessRate <
      this.adaptiveSettings.difficultyAdjustmentThreshold
    ) {
      adaptations.startingEase = Math.max(
        1300,
        (config.startingEase || 2500) - this.adaptiveSettings.easeDecreaseAmount
      );
    }

    // Workload balancing
    if (
      this.adaptiveSettings.workloadBalancing &&
      performanceStats.averageDailyReviews >
        this.adaptiveSettings.maxDailyWorkload
    ) {
      adaptations.intervalModifier = Math.min(
        2.0,
        (config.intervalModifier || 1.0) * 1.1
      );
    }

    // Apply adaptations
    if (Object.keys(adaptations).length > 0) {
      this.updateSettings(adaptations);
      return adaptations;
    }

    return null;
  }

  // Get recommended preset based on user goals
  getRecommendedPreset(userGoals) {
    const recommendations = {
      "quick-review": "speed",
      "exam-prep": "exam",
      "language-learning": "language",
      "medical-studies": "medical",
      "difficult-material": "conservative",
      "general-study": "standard",
      "easy-material": "aggressive",
    };

    return recommendations[userGoals] || "standard";
  }

  // Generate custom configuration wizard
  generateCustomConfig(userPreferences) {
    const baseConfig = { ...this.presets.standard };

    // Adjust based on user preferences
    if (userPreferences.studyTime === "limited") {
      baseConfig.newCardsPerDay = Math.floor(baseConfig.newCardsPerDay * 0.7);
      baseConfig.reviewsPerDay = Math.floor(baseConfig.reviewsPerDay * 0.8);
    } else if (userPreferences.studyTime === "extensive") {
      baseConfig.newCardsPerDay = Math.floor(baseConfig.newCardsPerDay * 1.5);
      baseConfig.reviewsPerDay = Math.floor(baseConfig.reviewsPerDay * 1.3);
    }

    if (userPreferences.difficulty === "high") {
      baseConfig.learningSteps = [1, 10, 60, 1440];
      baseConfig.startingEase = 2300;
      baseConfig.intervalModifier = 0.8;
    } else if (userPreferences.difficulty === "low") {
      baseConfig.learningSteps = [10];
      baseConfig.startingEase = 2700;
      baseConfig.intervalModifier = 1.2;
    }

    if (userPreferences.retention === "high") {
      baseConfig.requestRetention = 0.95;
      baseConfig.intervalModifier = Math.max(
        0.7,
        baseConfig.intervalModifier * 0.9
      );
    } else if (userPreferences.retention === "low") {
      baseConfig.requestRetention = 0.8;
      baseConfig.intervalModifier = Math.min(
        1.5,
        baseConfig.intervalModifier * 1.2
      );
    }

    return baseConfig;
  }

  // Export configuration
  exportConfig() {
    return JSON.stringify(
      {
        preset: this.findCurrentPreset(),
        customizations: this.userCustomizations,
        adaptiveSettings: this.adaptiveSettings,
        timestamp: new Date().toISOString(),
      },
      null,
      2
    );
  }

  // Import configuration
  importConfig(configJson) {
    try {
      const config = JSON.parse(configJson);

      if (config.preset && this.presets[config.preset]) {
        this.applyPreset(config.preset);
      }

      if (config.customizations) {
        this.userCustomizations = config.customizations;
      }

      if (config.adaptiveSettings) {
        this.adaptiveSettings = {
          ...this.adaptiveSettings,
          ...config.adaptiveSettings,
        };
      }

      this.saveConfig();
      return true;
    } catch (error) {
      console.error("Failed to import configuration:", error);
      return false;
    }
  }

  // Find which preset the current config matches
  findCurrentPreset() {
    const current = this.getConfig();

    for (const [name, preset] of Object.entries(this.presets)) {
      let matches = true;
      for (const key of Object.keys(preset)) {
        if (key === "name" || key === "description") continue;
        if (current[key] !== preset[key]) {
          matches = false;
          break;
        }
      }
      if (matches) return name;
    }

    return "custom";
  }

  // Validate configuration values
  validateConfig(config) {
    const errors = [];

    if (config.startingEase < 1300 || config.startingEase > 3000) {
      errors.push("Starting ease must be between 1300 and 3000");
    }

    if (config.intervalModifier < 0.1 || config.intervalModifier > 5.0) {
      errors.push("Interval modifier must be between 0.1 and 5.0");
    }

    if (config.requestRetention < 0.5 || config.requestRetention > 1.0) {
      errors.push("Request retention must be between 0.5 and 1.0");
    }

    if (
      !Array.isArray(config.learningSteps) ||
      config.learningSteps.length === 0
    ) {
      errors.push("Learning steps must be a non-empty array");
    }

    return errors;
  }

  // Save configuration to localStorage
  saveConfig() {
    try {
      localStorage.setItem(
        "spacedRepetitionConfig",
        JSON.stringify({
          currentPreset: this.findCurrentPreset(),
          customizations: this.userCustomizations,
          adaptiveSettings: this.adaptiveSettings,
        })
      );
    } catch (error) {
      console.error("Failed to save configuration:", error);
    }
  }

  // Load configuration from localStorage
  loadConfig() {
    try {
      const saved = localStorage.getItem("spacedRepetitionConfig");
      if (saved) {
        const config = JSON.parse(saved);

        if (config.currentPreset && this.presets[config.currentPreset]) {
          this.currentConfig = { ...this.presets[config.currentPreset] };
        }

        if (config.customizations) {
          this.userCustomizations = config.customizations;
        }

        if (config.adaptiveSettings) {
          this.adaptiveSettings = {
            ...this.adaptiveSettings,
            ...config.adaptiveSettings,
          };
        }
      }
    } catch (error) {
      console.error("Failed to load configuration:", error);
    }
  }

  // Get configuration UI schema for dynamic form generation
  getConfigSchema() {
    return {
      basic: {
        title: "Basic Settings",
        fields: {
          learningSteps: {
            type: "array",
            label: "Learning Steps (minutes)",
            description: "Time intervals for learning phase",
            default: [1, 10],
          },
          graduatingInterval: {
            type: "number",
            label: "Graduating Interval (days)",
            description: "Initial interval when card graduates from learning",
            min: 1,
            max: 30,
            default: 1,
          },
          easyInterval: {
            type: "number",
            label: "Easy Interval (days)",
            description: "Interval when Easy button is pressed on new card",
            min: 1,
            max: 30,
            default: 4,
          },
        },
      },

      advanced: {
        title: "Advanced Settings",
        fields: {
          startingEase: {
            type: "number",
            label: "Starting Ease (%)",
            description: "Initial ease factor for new cards",
            min: 130,
            max: 300,
            default: 250,
            step: 5,
          },
          intervalModifier: {
            type: "number",
            label: "Interval Modifier",
            description: "Global multiplier for all intervals",
            min: 0.1,
            max: 5.0,
            default: 1.0,
            step: 0.1,
          },
          maximumInterval: {
            type: "number",
            label: "Maximum Interval (days)",
            description: "Maximum time between reviews",
            min: 30,
            max: 36500,
            default: 36500,
          },
        },
      },

      limits: {
        title: "Daily Limits",
        fields: {
          newCardsPerDay: {
            type: "number",
            label: "New Cards Per Day",
            description: "Maximum new cards to introduce daily",
            min: 1,
            max: 100,
            default: 20,
          },
          reviewsPerDay: {
            type: "number",
            label: "Reviews Per Day",
            description: "Maximum reviews per day",
            min: 10,
            max: 1000,
            default: 200,
          },
        },
      },
    };
  }

  // Initialize configuration system
  initialize() {
    this.loadConfig();
  }
}

// Export singleton instance
export const spacedRepetitionConfig = new SpacedRepetitionConfig();
