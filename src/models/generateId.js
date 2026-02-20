// web/models/generateId.js
// ID Generation Pattern: 1, 2, 3, 4, 5, 6, 7, 8, 9, A, B, C...Z, 11, 12, 13...19, 1A, 1B...1Z, 21, 22...

class IDGenerator {
    constructor(lastID) {
        this.numeric = '123456789';
        this.alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        this.currentIndex = 0;
        this.prefix = '';
        this.useNumbers = true;

        if (lastID) {
            this.initializeFromLastID(lastID);
        }
    }

    // Initialize generator state from the last ID
    initializeFromLastID(lastID) {
        const match = lastID.match(/^(\d*)([A-Z1-9])$/); // Allow digits + [A-Z1-9]
        if (match) {
            const [, prefix, lastChar] = match;
            this.prefix = prefix || '';
    
            if (this.numeric.includes(lastChar)) {
                this.useNumbers = true;
                this.currentIndex = this.numeric.indexOf(lastChar) + 1;
            } else if (this.alpha.includes(lastChar)) {
                this.useNumbers = false;
                this.currentIndex = this.alpha.indexOf(lastChar) + 1;
            }
    
            // Fix transition from Z
            if (this.currentIndex >= (this.useNumbers ? this.numeric.length : this.alpha.length)) {
                this.currentIndex = 0;
                this.useNumbers = !this.useNumbers;
    
                if (this.useNumbers) {
                    this.prefix = (parseInt(this.prefix || '0', 10) + 1).toString();
                }
            }
        }
    }

    // Generate the next ID based on the pattern
    generateNext() {
        let characters = this.useNumbers ? this.numeric : this.alpha;
        let currentChar = characters[this.currentIndex];
        let id = this.prefix + currentChar;
    
        this.currentIndex++;
    
        if (this.currentIndex >= characters.length) {
            this.currentIndex = 0;
            this.useNumbers = !this.useNumbers;
    
            if (this.useNumbers) {
                this.prefix = (parseInt(this.prefix || '0', 10) + 1).toString();
            } else {
                // Ensure transition to A instead of a number
                this.currentIndex = 0;
            }
        }
    
        return id;
    }

    // Static async initializer for consistency
    static async create(lastID) {
        return new IDGenerator(lastID);
    }
}

// Helper function for MySQL queries
async function generateUniqueId() {
    const { get } = require('./query');
    
    try {
        const lastCard = await get('SELECT id FROM owned_cards ORDER BY id DESC LIMIT 1');
        
        if (!lastCard || !lastCard.id) {
            return '1';  // Start with 1
        }
        
        const generator = await IDGenerator.create(lastCard.id);
        return generator.generateNext();
    } catch (error) {
        console.error('Error generating unique ID:', error);
        throw error;
    }
}

module.exports = {
    IDGenerator,
    generateUniqueId
};
