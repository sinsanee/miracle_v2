function parseCondition(condition) {
    if (condition === 5) {
      return "✨Mint✨";
    } else if (condition === 4) {
      return "⭐Near Mint⭐";
    } else if (condition === 3) {
      return "👍Good👍";
    } else if (condition === 2) {
      return "🎭Played🎭";
    } else if (condition === 1) {
      return "🪨Poor🪨";
    } else {
      return "Unknown";
    }
  }

module.exports = { parseCondition }