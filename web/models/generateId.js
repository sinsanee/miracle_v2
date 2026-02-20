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

    initializeFromLastID(lastID) {
        const match = lastID.match(/^(\d*)([A-Z1-9])$/);
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
    
            if (this.currentIndex >= (this.useNumbers ? this.numeric.length : this.alpha.length)) {
                this.currentIndex = 0;
                this.useNumbers = !this.useNumbers;
    
                if (this.useNumbers) {
                    this.prefix = (parseInt(this.prefix || '0', 10) + 1).toString();
                }
            }
        }
    }

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
                this.currentIndex = 0;
            }
        }
    
        return id;
    }

    static async create(lastID) {
        return new IDGenerator(lastID);
    }
}

async function generateUniqueId() {
    const mysql = require('mysql2/promise');
    require('dotenv').config();
    
    const pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
    
    try {
        const [rows] = await pool.execute('SELECT id FROM owned_cards ORDER BY id DESC LIMIT 1');
        const lastCard = rows[0] || null;
        
        await pool.end();
        
        if (!lastCard || !lastCard.id) {
            return '1';
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
