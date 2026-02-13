const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const Database = require('better-sqlite3');
const path = require('path');
const multer = require('multer');
const fs = require('fs').promises;
const { cardGen } = require('./models/cardGen');
const { resolveImageBuffer } = require('./models/imageResolver');
const { cropImage } = require('./models/imageCrop');
const { generateUniqueId } = require('./models/generateId');

const app = express();
const PORT = 3000;

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Save to web server's public directory
    cb(null, path.join(__dirname, 'public/uploads/cards'));
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
// Serve card images
app.use('/cards/images', express.static(path.join(__dirname, 'public/uploads/cards')));
app.use('/cards/borders', express.static(path.join(__dirname, 'public/uploads/borders')));

const upload = multer({
  storage: storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

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

// Helper functions
async function query(sql, params) {
  // Handle undefined, null, or missing params
  if (params === undefined || params === null) {
    params = [];
  }
  // Convert single value to array
  if (!Array.isArray(params)) {
    params = [params];
  }
  
  console.log('Executing query:', sql);
  console.log('With params:', params);
  
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function queryOne(sql, params) {
  // Handle undefined, null, or missing params
  if (params === undefined || params === null) {
    params = [];
  }
  // Convert single value to array
  if (!Array.isArray(params)) {
    params = [params];
  }
  
  console.log('Executing queryOne:', sql);
  console.log('With params:', params);
  
  const [rows] = await pool.execute(sql, params);
  return rows[0] || null;
}

// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/cards', express.static(path.join(__dirname, '../src/img/cards')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
  secret: 'your-secret-key-change-this-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // Set to true if using HTTPS
}));

// Middleware to check if user is logged in
const isAuthenticated = (req, res, next) => {
  if (req.session.userId) {
    next();
  } else {
    res.redirect('/');
  }
};

// Middleware to check if user is admin
const isAdmin = (req, res, next) => {
  if (req.session.userId && req.session.isAdmin) {
    next();
  } else {
    res.status(403).send('Access denied');
  }
};

// Routes
app.get('/', (req, res) => {
  if (req.session.userId) {
    res.redirect('/dashboard');
  } else {
    res.render('index');
  }
});

app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const stmt = query('INSERT INTO webusers (username, password) VALUES (?, ?)');
    const result = stmt.run(username, hashedPassword);
    
    res.json({ success: true, message: 'Registration successful! Please login.' });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      res.status(400).json({ error: 'Username already exists' });
    } else {
      res.status(500).json({ error: 'Registration failed' });
    }
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    console.log(username, password)
    const stmt = query('SELECT * FROM webusers WHERE username = ?');
    const user = stmt.get(username);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    if (user.banned === 1) {
      return res.status(403).json({ error: 'Your account has been banned' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.isAdmin = user.admin === 1;
    
    res.json({ success: true, redirect: '/dashboard' });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/dashboard', isAuthenticated, (req, res) => {
  res.render('dashboard', {
    username: req.session.username,
    isAdmin: req.session.isAdmin
  });
});

app.get('/admin', isAdmin, (req, res) => {
  const stmt = query('SELECT userid, banned FROM users ORDER BY userid DESC');
  const discordUsers = stmt.all();
  
  res.render('admin', {
    username: req.session.username,
    users: discordUsers
  });
});

app.post('/admin/ban-user', isAdmin, (req, res) => {
  const { userId, banned } = req.body;
  
  try {
    const stmt = query('UPDATE users SET banned = ? WHERE userid = ?');
    stmt.run(banned ? 1 : 0, userId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

app.post('/admin/delete-user', isAdmin, (req, res) => {
  const { userId } = req.body;
  
  try {
    const stmt = query('DELETE FROM users WHERE userid = ?');
    stmt.run(userId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Card Management Routes
app.get('/admin/cards', isAdmin, (req, res) => {
  const cardsStmt = query(`
    SELECT cards.*, sets.name as set_name 
    FROM cards 
    LEFT JOIN sets ON cards.set_id = sets.id 
    ORDER BY cards.id DESC
  `);
  const cards = cardsStmt.all();
  
  const setsStmt = query('SELECT * FROM sets ORDER BY name ASC');
  const sets = setsStmt.all();
  
  res.render('cards', {
    username: req.session.username,
    cards: cards,
    sets: sets
  });
});

app.get('/admin/cards/data', isAdmin, (req, res) => {
  try {
    const setsStmt = query('SELECT * FROM sets ORDER BY name ASC');
    const sets = setsStmt.all();
    
    // Get all unique editions for each card name
    const editionsStmt = query(`
      SELECT name, MAX(edition) as max_edition 
      FROM cards 
      GROUP BY name
    `);
    const editions = editionsStmt.all();
    
    res.json({ sets, editions });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

app.post('/admin/cards/preview', isAdmin, upload.single('image'), async (req, res) => {
  try {
    const { name, subtitle, footer, cropMode, imageUrl } = req.body;
    
    let imageBuffer;
    if (req.file) {
      imageBuffer = await fs.readFile(req.file.path);
    } else if (imageUrl) {
      imageBuffer = await resolveImageBuffer(imageUrl);
    } else {
      return res.status(400).json({ error: 'No image provided' });
    }

    // Read the default border
    const borderPath = path.join(__dirname, 'assets', 'border.png');
    const border = await fs.readFile(borderPath);

    // Generate preview
    const previewBuffer = await cardGen(imageBuffer, {
      name: name || 'Card Name',
      subtitle: subtitle || '',
      footer: footer || ''
    }, cropMode || 'centre', border);

    // Convert to base64
    const base64Image = previewBuffer.toString('base64');
    const dataUrl = `data:image/png;base64,${base64Image}`;

    // Clean up temp file if uploaded
    if (req.file) {
      await fs.unlink(req.file.path).catch(() => {});
    }

    res.json({ success: true, preview: dataUrl });
  } catch (error) {
    console.error('Preview error:', error);
    res.status(500).json({ error: 'Failed to generate preview: ' + error.message });
  }
});

app.post('/admin/cards/create', isAdmin, upload.single('image'), async (req, res) => {
  try {
    const { name, edition, set_id, set_name, imageUrl, cropMode, dropping, scheduled_drop } = req.body;
    
    if (!name || !edition) {
      return res.status(400).json({ error: 'Name and edition are required' });
    }

    let imageBuffer;
    if (req.file) {
      imageBuffer = await fs.readFile(req.file.path);
    } else if (imageUrl) {
      imageBuffer = await resolveImageBuffer(imageUrl);
    } else {
      return res.status(400).json({ error: 'No image provided' });
    }

    let finalSetId = set_id;
    
    // If creating a new set
    if (set_name && !set_id) {
      const setStmt = query('INSERT INTO sets (name) VALUES (?)');
      const result = setStmt.run(set_name);
      finalSetId = result.lastInsertRowid;
    }

    // Get set info including border
    const setStmt = query('SELECT name, border FROM sets WHERE id = ?');
    const setData = setStmt.get(finalSetId);

    // Crop the image first and save it
    const croppedBuffer = await cropImage(imageBuffer, cropMode || 'centre');
    const croppedFilename = `${name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${edition}_${Date.now()}_cropped.png`;
    const croppedPath = path.join(__dirname, '../src/img/cards', croppedFilename);
    await fs.writeFile(croppedPath, croppedBuffer);

    // Get border path
    let borderPath;
    if (setData.border) {
      borderPath = setData.border
    } else {
      borderPath = path.join(__dirname, 'assets', 'border.png');
    }
    const border = await fs.readFile(borderPath);

    // Generate card with border using cropped image
    const cardBuffer = await cardGen(croppedBuffer, {
      name: name,
      subtitle: ``,
      footer: ''
    }, cropMode || 'centre', border);

    // Save bordered card
    const cardFilename = `${name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${edition}_${Date.now()}.png`;
    const cardPath = path.join(__dirname, '../src/img/cards', cardFilename);
    await fs.writeFile(cardPath, cardBuffer);

    // Insert into database - save cropped image filename, not URL
    const stmt = query(`
      INSERT INTO cards (name, edition, set_id, image, bordered_image, dropping, scheduled_drop) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      name, 
      edition, 
      finalSetId, 
      croppedFilename,  // Save the cropped image filename instead of URL
      cardFilename,
      dropping, 
      scheduled_drop || null
    );

    // Clean up temp file if uploaded
    if (req.file) {
      await fs.unlink(req.file.path).catch(() => {});
    }

    res.json({ success: true, message: 'Card created successfully with image' });
  } catch (error) {
    console.error('Card creation error:', error);
    res.status(500).json({ error: 'Failed to create card: ' + error.message });
  }
});

// Bulk create cards
app.post('/admin/cards/bulk-create', isAdmin, upload.array('images', 50), async (req, res) => {
  try {
    const { set_id, set_name, dropping, scheduled_drop, cardsData, imageUrls, cropModes } = req.body;
    const cards = JSON.parse(cardsData);
    const urls = imageUrls ? JSON.parse(imageUrls) : [];
    const crops = cropModes ? JSON.parse(cropModes) : [];
    
    let finalSetId = set_id;
    
    // If creating a new set
    if (set_name && !set_id) {
      const setStmt = query('INSERT INTO sets (name) VALUES (?)');
      const result = setStmt.run(set_name);
      finalSetId = result.lastInsertRowid;
    }

    // Get set info including border
    const setStmt = query('SELECT name, border FROM sets WHERE id = ?');
    const setData = setStmt.get(finalSetId);

    // Get border path
    let borderPath;
    if (setData.border) {
      borderPath = setData.border;
    } else {
      borderPath = path.join(__dirname, 'assets', 'border.png');
    }
    const border = await fs.readFile(borderPath);

    const stmt = query(`
      INSERT INTO cards (name, edition, set_id, image, bordered_image, dropping, scheduled_drop) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    let created = 0;
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      let imageBuffer;

      // Check if this card uses a URL or file upload
      if (urls[i] && urls[i].trim()) {
        // Download from URL
        imageBuffer = await resolveImageBuffer(urls[i]);
      } else if (req.files[i]) {
        // Read from uploaded file
        imageBuffer = await fs.readFile(req.files[i].path);
      } else {
        console.warn(`Skipping card ${i}: no image provided`);
        continue;
      }

      // Use per-card crop mode if available, otherwise use default
      const cardCropMode = crops[i] || 'centre';

      // Crop the image first and save it
      const croppedBuffer = await cropImage(imageBuffer, cardCropMode);
      const croppedFilename = `${card.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${card.edition}_${Date.now()}_${i}_cropped.png`;
      const croppedPath = path.join(__dirname, '../src/img/cards', croppedFilename);
      await fs.writeFile(croppedPath, croppedBuffer);

      // Generate bordered card using cropped image
      const cardBuffer = await cardGen(croppedBuffer, {
        name: card.name,
        subtitle: ``,
        footer: ''
      }, cardCropMode, border);

      // Save bordered card
      const cardFilename = `${card.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${card.edition}_${Date.now()}_${i}.png`;
      const cardPath = path.join(__dirname, '../src/img/cards', cardFilename);
      await fs.writeFile(cardPath, cardBuffer);

      stmt.run(
        card.name,
        card.edition,
        finalSetId,
        croppedFilename,  // Save the cropped image filename
        cardFilename,
        dropping,
        scheduled_drop || null
      );

      // Clean up temp file if it was uploaded
      if (req.files[i]) {
        await fs.unlink(req.files[i].path).catch(() => {});
      }
      created++;
    }

    res.json({ success: true, message: `Successfully created ${created} cards` });
  } catch (error) {
    console.error('Bulk creation error:', error);
    res.status(500).json({ error: 'Failed to create cards: ' + error.message });
  }
});

app.get('/admin/cards/:id', isAdmin, (req, res) => {
  try {
    const stmt = query(`
      SELECT cards.*, sets.name as set_name 
      FROM cards 
      LEFT JOIN sets ON cards.set_id = sets.id 
      WHERE cards.id = ?
    `);
    const card = stmt.get(req.params.id);
    
    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }
    
    res.json(card);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch card' });
  }
});

app.post('/admin/cards/:id/update', isAdmin, (req, res) => {
  const { name, edition, set_id, set_name, image, dropping, scheduled_drop } = req.body;
  
  try {
    let finalSetId = set_id;
    
    // If creating a new set
    if (set_name && !set_id) {
      const setStmt = query('INSERT INTO sets (name) VALUES (?)');
      const result = setStmt.run(set_name);
      finalSetId = result.lastInsertRowid;
    }
    
    const stmt = query(`
      UPDATE cards 
      SET name = ?, edition = ?, set_id = ?, image = ?, dropping = ?, scheduled_drop = ? 
      WHERE id = ?
    `);
    
    stmt.run(
      name, 
      edition, 
      finalSetId, 
      image || null, 
      dropping, 
      scheduled_drop || null,
      req.params.id
    );
    
    res.json({ success: true, message: 'Card updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update card: ' + error.message });
  }
});

// Update card info without regenerating image
app.post('/admin/cards/:id/update-info', isAdmin, upload.single('image'), async (req, res) => {
  try {
    const { name, edition, set_id, set_name, dropping, scheduled_drop } = req.body;
    
    let finalSetId = set_id;
    
    // If creating a new set
    if (set_name && !set_id) {
      const setStmt = query('INSERT INTO sets (name) VALUES (?)');
      const result = setStmt.run(set_name);
      finalSetId = result.lastInsertRowid;
    }
    
    const stmt = query(`
      UPDATE cards 
      SET name = ?, edition = ?, set_id = ?, dropping = ?, scheduled_drop = ? 
      WHERE id = ?
    `);
    
    stmt.run(
      name, 
      edition, 
      finalSetId, 
      dropping, 
      scheduled_drop || null,
      req.params.id
    );
    
    res.json({ success: true, message: 'Card updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update card: ' + error.message });
  }
});

app.post('/admin/cards/:id/update-stats', isAdmin, (req, res) => {
  const { dropped, grabbed } = req.body;
  
  try {
    const stmt = query('UPDATE cards SET dropped = ?, grabbed = ? WHERE id = ?');
    stmt.run(dropped, grabbed, req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update stats' });
  }
});

app.post('/admin/cards/:id/delete', isAdmin, (req, res) => {
  try {
    const stmt = query('DELETE FROM cards WHERE id = ?');
    stmt.run(req.params.id);
    res.json({ success: true, message: 'Card deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete card' });
  }
});

app.post('/admin/cards/:id/delete-copies', isAdmin, (req, res) => {
  try {
    // Get card info first
    const cardStmt = query('SELECT edition, set_id FROM cards WHERE id = ?');
    const card = cardStmt.get(req.params.id);
    
    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }
    
    // Delete all owned copies matching this card
    const stmt = query('DELETE FROM owned_cards WHERE card = ?');
    const result = stmt.run(req.params.id);
    
    res.json({ 
      success: true, 
      message: `Deleted ${result.changes} owned copies` 
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete copies' });
  }
});

// Owned Cards Management
app.get('/admin/owned-cards', isAdmin, (req, res) => {
  const stmt = query(`
    SELECT owned_cards.*, cards.name as card_name, cards.edition, sets.name as set_name
    FROM owned_cards
    LEFT JOIN cards ON owned_cards.card = cards.id
    LEFT JOIN sets ON cards.set_id = sets.id
    ORDER BY owned_cards.id DESC
  `);
  const ownedCards = stmt.all();
  
  const cardsStmt = query(`
    SELECT cards.id, cards.name, cards.edition, sets.name as set_name
    FROM cards
    LEFT JOIN sets ON cards.set_id = sets.id
    ORDER BY cards.name ASC
  `);
  const cards = cardsStmt.all();
  
  res.render('owned-cards', {
    username: req.session.username,
    ownedCards: ownedCards,
    cards: cards
  });
});

app.post('/admin/owned-cards/generate', isAdmin, (req, res) => {
  const { card_id, owner, dropper, grabber, condition } = req.body;
  
  try {
    // Get the card details
    const cardStmt = query('SELECT * FROM cards WHERE id = ?');
    const card = cardStmt.get(card_id);
    
    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }
    
    // Get the current print number for this card
    const printStmt = query('SELECT COUNT(*) as count FROM owned_cards WHERE card = ?');
    const printResult = printStmt.get(card_id);
    const print = (printResult.count || 0) + 1;
    
    // Generate unique ID using the generateId model
    const id = generateUniqueId(db);
    
    const stmt = query(`
      INSERT INTO owned_cards (id, card, print, dropper, grabber, owner, condition)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(id, card_id, print, dropper || null, grabber || null, owner || null, condition || 100);
    
    res.json({ success: true, message: 'Owned card generated successfully', id: id, print: print });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate owned card: ' + error.message });
  }
});

app.post('/admin/owned-cards/:id/update', isAdmin, (req, res) => {
  const { dropper, grabber, owner, condition } = req.body;
  
  try {
    const stmt = query(`
      UPDATE owned_cards 
      SET dropper = ?, grabber = ?, owner = ?, condition = ?
      WHERE id = ?
    `);
    
    stmt.run(dropper || null, grabber || null, owner || null, condition, req.params.id);
    res.json({ success: true, message: 'Owned card updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update owned card: ' + error.message });
  }
});

app.post('/admin/owned-cards/:id/delete', isAdmin, (req, res) => {
  try {
    const stmt = query('DELETE FROM owned_cards WHERE id = ?');
    stmt.run(req.params.id);
    res.json({ success: true, message: 'Owned card deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete owned card' });
  }
});

// Items Management
app.get('/admin/items', isAdmin, (req, res) => {
  const stmt = query('SELECT * FROM items ORDER BY id DESC');
  const items = stmt.all();
  
  res.render('items', {
    username: req.session.username,
    items: items
  });
});

app.post('/admin/items/create', isAdmin, (req, res) => {
  const { name, description } = req.body;
  
  try {
    const stmt = query('INSERT INTO items (name, description) VALUES (?, ?)');
    stmt.run(name, description || '');
    res.json({ success: true, message: 'Item created successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create item: ' + error.message });
  }
});

app.post('/admin/items/:id/update', isAdmin, (req, res) => {
  const { name, description } = req.body;
  
  try {
    const stmt = query('UPDATE items SET name = ?, description = ? WHERE id = ?');
    stmt.run(name, description || '', req.params.id);
    res.json({ success: true, message: 'Item updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update item: ' + error.message });
  }
});

app.post('/admin/items/:id/delete', isAdmin, (req, res) => {
  try {
    const stmt = query('DELETE FROM items WHERE id = ?');
    stmt.run(req.params.id);
    res.json({ success: true, message: 'Item deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

// Inventory Management
app.get('/admin/inventory', isAdmin, (req, res) => {
  const stmt = query(`
    SELECT inventory.*, items.name as item_name
    FROM inventory
    LEFT JOIN items ON inventory.itemid = items.id
    ORDER BY inventory.id DESC
  `);
  const inventory = stmt.all();
  
  const itemsStmt = query('SELECT * FROM items ORDER BY name ASC');
  const items = itemsStmt.all();
  
  res.render('inventory', {
    username: req.session.username,
    inventory: inventory,
    items: items
  });
});

app.post('/admin/inventory/create', isAdmin, (req, res) => {
  const { userid, itemid, amount } = req.body;
  
  try {
    const stmt = query('INSERT INTO inventory (userid, itemid, amount) VALUES (?, ?, ?)');
    stmt.run(userid, itemid, amount || 0);
    res.json({ success: true, message: 'Inventory item created successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create inventory item: ' + error.message });
  }
});

app.post('/admin/inventory/:id/update', isAdmin, (req, res) => {
  const { amount } = req.body;
  
  try {
    if (parseInt(amount) <= 0) {
      // Delete if amount is 0 or less
      const stmt = query('DELETE FROM inventory WHERE id = ?');
      stmt.run(req.params.id);
      res.json({ success: true, message: 'Inventory item deleted (amount = 0)' });
    } else {
      const stmt = query('UPDATE inventory SET amount = ? WHERE id = ?');
      stmt.run(amount, req.params.id);
      res.json({ success: true, message: 'Inventory updated successfully' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to update inventory: ' + error.message });
  }
});

app.post('/admin/inventory/:id/delete', isAdmin, (req, res) => {
  try {
    const stmt = query('DELETE FROM inventory WHERE id = ?');
    stmt.run(req.params.id);
    res.json({ success: true, message: 'Inventory item deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete inventory item' });
  }
});

// Auctions Management
app.get('/admin/auctions', isAdmin, (req, res) => {
  const stmt = query(`
    SELECT auctions.*,
      oc1.id as card1_id, c1.name as card1_name, oc1.print as card1_print,
      oc2.id as card2_id, c2.name as card2_name, oc2.print as card2_print,
      oc3.id as card3_id, c3.name as card3_name, oc3.print as card3_print,
      oc4.id as card4_id, c4.name as card4_name, oc4.print as card4_print
    FROM auctions
    LEFT JOIN owned_cards oc1 ON auctions.card1 = oc1.id
    LEFT JOIN cards c1 ON oc1.card = c1.id
    LEFT JOIN owned_cards oc2 ON auctions.card2 = oc2.id
    LEFT JOIN cards c2 ON oc2.card = c2.id
    LEFT JOIN owned_cards oc3 ON auctions.card3 = oc3.id
    LEFT JOIN cards c3 ON oc3.card = c3.id
    LEFT JOIN owned_cards oc4 ON auctions.card4 = oc4.id
    LEFT JOIN cards c4 ON oc4.card = c4.id
    ORDER BY auctions.id DESC
  `);
  const auctions = stmt.all();
  
  res.render('auctions', {
    username: req.session.username,
    auctions: auctions
  });
});

app.get('/admin/auctions/search-cards', isAdmin, (req, res) => {
  const { query } = req.query;
  
  if (!query) {
    return res.json({ success: true, cards: [] });
  }
  
  try {
    // Search in the cards table, not owned_cards
    const stmt = query(`
      SELECT cards.id, cards.name, cards.edition, sets.name as set_name
      FROM cards
      LEFT JOIN sets ON cards.set_id = sets.id
      WHERE cards.name LIKE ? OR CAST(cards.id AS TEXT) LIKE ?
      ORDER BY cards.name ASC
      LIMIT 20
    `);
    const cards = stmt.all(`%${query}%`, `%${query}%`);
    console.log('Auction search query:', query, 'Results:', cards.length, cards);
    res.json({ success: true, cards: cards });
  } catch (error) {
    console.error('Auction search error:', error);
    res.status(500).json({ success: false, error: 'Failed to search cards: ' + error.message });
  }
});

app.post('/admin/auctions/create', isAdmin, (req, res) => {
  const { starttime, endtime, card1, card2, card3, card4 } = req.body;
  
  try {
    // For each card ID, generate an owned_card instance
    const cardIds = [card1, card2, card3, card4].filter(Boolean);
    const ownedCardIds = [];
    
    for (const cardId of cardIds) {
      // Get card details
      const cardStmt = query('SELECT * FROM cards WHERE id = ?');
      const card = cardStmt.get(cardId);
      
      if (!card) {
        return res.status(400).json({ error: `Card ${cardId} not found` });
      }
      
      // Get print number for this card
      const printStmt = query('SELECT COUNT(*) as count FROM owned_cards WHERE card = ?');
      const printResult = printStmt.get(cardId);
      const print = (printResult.count || 0) + 1;
      
      // Generate unique ID
      const ownedCardId = generateUniqueId(db);
      
      // Create owned_card with owner '1' (auction holder)
      const insertStmt = query(`
        INSERT INTO owned_cards (id, card, print, owner, condition)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      insertStmt.run(ownedCardId, cardId, print, '1', 5); // Mint condition
      ownedCardIds.push(ownedCardId);
    }
    
    // Create auction with the generated owned_card IDs
    const stmt = query(`
      INSERT INTO auctions (starttime, endtime, card1, card2, card3, card4)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      starttime,
      endtime,
      ownedCardIds[0] || null,
      ownedCardIds[1] || null,
      ownedCardIds[2] || null,
      ownedCardIds[3] || null
    );
    
    res.json({ success: true, message: 'Auction created successfully with 4 new cards' });
  } catch (error) {
    console.error('Auction creation error:', error);
    res.status(500).json({ error: 'Failed to create auction: ' + error.message });
  }
});

app.post('/admin/auctions/:id/delete', isAdmin, (req, res) => {
  try {
    // Get auction details first
    const auctionStmt = query('SELECT * FROM auctions WHERE id = ?');
    const auction = auctionStmt.get(req.params.id);
    
    if (!auction) {
      return res.status(404).json({ error: 'Auction not found' });
    }
    
    // Check if auction has ended
    const now = new Date().toISOString();
    if (auction.endtime < now) {
      // Delete unsold cards (where currentbid is 0)
      const deleteStmt = query('DELETE FROM owned_cards WHERE id = ?');
      
      if (auction.card1 && auction.currentbid1 === 0) deleteStmt.run(auction.card1);
      if (auction.card2 && auction.currentbid2 === 0) deleteStmt.run(auction.card2);
      if (auction.card3 && auction.currentbid3 === 0) deleteStmt.run(auction.card3);
      if (auction.card4 && auction.currentbid4 === 0) deleteStmt.run(auction.card4);
    }
    
    // Delete the auction
    const stmt = query('DELETE FROM auctions WHERE id = ?');
    stmt.run(req.params.id);
    
    res.json({ success: true, message: 'Auction deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete auction' });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
