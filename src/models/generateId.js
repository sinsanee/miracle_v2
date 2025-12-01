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

module.exports = {
    IDGenerator
};