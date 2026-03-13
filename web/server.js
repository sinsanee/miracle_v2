const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const path = require('path');
require('./models/font'); // ← Make sure this is here!
const multer = require('multer');
const fs = require('fs').promises;
const sharp = require('sharp');
const { cardGen } = require('./models/cardGen');
const { resolveImageBuffer } = require('./models/imageResolver');
const { cropImage } = require('./models/imageCrop');
const { generateUniqueId } = require('./models/generateId');

const app = express();
const PORT = 3000;

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'public/uploads/cards'));
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// MySQL Configuration
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

// Helper functions for MySQL queries
async function query(sql, params = []) {
  if (params === undefined || params === null) {
    params = [];
  }
  if (!Array.isArray(params)) {
    params = [params];
  }
  
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/cards/images', express.static(path.join(__dirname, 'public/uploads/cards')));
app.use('/cards/borders', express.static(path.join(__dirname, 'public/uploads/borders')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
  secret: 'CRAZYARBUZ22!2',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
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
    await query('INSERT INTO webusers (username, password) VALUES (?, ?)', [username, hashedPassword]);
    
    res.json({ success: true, message: 'Registration successful! Please login.' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
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
    const user = await queryOne('SELECT * FROM webusers WHERE username = ?', [username]);
    
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
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/dashboard', isAuthenticated, (req, res) => {
  res.render('dashboard', {
    username: req.session.username,
    isAdmin: req.session.isAdmin
  });
});

app.get('/admin', isAdmin, async (req, res) => {
  try {
    const discordUsers = await query('SELECT userid, banned FROM users ORDER BY userid DESC');
    
    res.render('admin', {
      username: req.session.username,
      users: discordUsers
    });
  } catch (error) {
    console.error('Admin page error:', error);
    res.status(500).send('Error loading admin page');
  }
});

app.post('/admin/ban-user', isAdmin, async (req, res) => {
  const { userId, banned } = req.body;
  
  try {
    await query('UPDATE users SET banned = ? WHERE userid = ?', [banned ? 1 : 0, userId]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

app.post('/admin/delete-user', isAdmin, async (req, res) => {
  const { userId } = req.body;
  
  try {
    await query('DELETE FROM users WHERE userid = ?', [userId]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Card Management Routes
app.get('/admin/cards', isAdmin, async (req, res) => {
  try {
    const cards = await query(`
      SELECT cards.*, sets.name as set_name
      FROM cards
      LEFT JOIN sets ON cards.set_id = sets.id
      ORDER BY cards.id DESC
    `);
    
    const sets = await query('SELECT id, name FROM sets ORDER BY name ASC');
    const countResult = await queryOne('SELECT COUNT(*) as count FROM cards');
    
    res.render('cards', {
      username: req.session.username,
      cards: cards,
      sets: sets,
      cardCount: countResult.count
    });
  } catch (error) {
    console.error('Cards page error:', error);
    res.status(500).send('Error loading cards page');
  }
});

app.get('/admin/cards/count', isAdmin, async (req, res) => {
  try {
    const result = await queryOne('SELECT COUNT(*) as count FROM cards');
    res.json({ count: result.count });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get card count' });
  }
});

app.get('/admin/cards/data', isAdmin, async (req, res) => {
  try {
    const sets = await query('SELECT id, name FROM sets ORDER BY name ASC');
    
    const cards = await query('SELECT name, MAX(edition) as max_edition FROM cards GROUP BY name');
    const editionsData = {};
    cards.forEach(card => {
      editionsData[card.name] = card.max_edition;
    });
    
    res.json({ sets: sets, editions: editionsData });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load data' });
  }
});

app.post('/admin/cards/create', isAdmin, async (req, res) => {
  const { name, edition, set_id, set_name, image, dropping, scheduled_drop } = req.body;
  
  try {
    let finalSetId = set_id;
    
    if (set_name && !set_id) {
      const result = await query('INSERT INTO sets (name) VALUES (?)', [set_name]);
      finalSetId = result.insertId;
    }
    
    await query(`
      INSERT INTO cards (name, edition, set_id, image, dropping, scheduled_drop) 
      VALUES (?, ?, ?, ?, ?, ?)
    `, [name, edition, finalSetId, image || null, dropping, scheduled_drop || null]);
    
    res.json({ success: true, message: 'Card created successfully' });
  } catch (error) {
    console.error('Card creation error:', error);
    res.status(500).json({ error: 'Failed to create card: ' + error.message });
  }
});

app.post('/admin/cards/preview', isAdmin, upload.single('image'), async (req, res) => {
  try {
    const { name, subtitle, footer, cropMode, imageUrl, setId } = req.body;
    let imageBuffer;

    // Get image buffer from upload or URL
    if (req.file) {
      imageBuffer = await fs.readFile(req.file.path);
    } else if (imageUrl) {
      imageBuffer = await resolveImageBuffer(imageUrl);
    } else {
      return res.status(400).json({ error: 'No image provided' });
    }

    // Get border path
    let borderPath;
    if (setId) {
      const setData = await queryOne('SELECT border FROM sets WHERE id = ?', [setId]);
      if (setData && setData.border) {
        // FIXED: Use correct path relative to server.js location
        borderPath = path.join(__dirname, 'public/uploads/borders', setData.border);
      }
    }
    
    // Fallback to default border
    if (!borderPath) {
      // FIXED: Use correct path to default border
      borderPath = path.join(__dirname, 'assets', 'border.png');
    }

    // Check if border file exists
    let border;
    try {
      border = await fs.readFile(borderPath);
    } catch (error) {
      console.error('Border not found at:', borderPath);
      // Try alternative location
      const altBorderPath = path.join(__dirname, 'public', 'border.png');
      try {
        border = await fs.readFile(altBorderPath);
      } catch (altError) {
        console.error('Alternative border not found at:', altBorderPath);
        return res.status(500).json({ error: 'Border image not found. Please upload borders to public/uploads/borders/' });
      }
    }

    // Generate card preview
    const cardBuffer = await cardGen(imageBuffer, {
      name: name || 'Card Name',
      subtitle: '',
      footer: ''
    }, cropMode || 'centre', border);

    // Clean up uploaded file
    if (req.file) {
      await fs.unlink(req.file.path).catch(() => {});
    }

    // Return base64 encoded preview
    res.json({ 
      success: true, 
      preview: `data:image/png;base64,${cardBuffer.toString('base64')}` 
    });
  } catch (error) {
    console.error('Preview error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to generate preview: ' + error.message });
  }
});


app.post('/admin/cards/create-with-image', isAdmin, upload.single('image'), async (req, res) => {
  try {
    const { name, edition, set_id, set_name, imageUrl, cropMode, dropping, scheduled_drop } = req.body;
    let imageBuffer;

    if (req.file) {
      imageBuffer = await fs.readFile(req.file.path);
    } else if (imageUrl) {
      imageBuffer = await resolveImageBuffer(imageUrl);
    } else {
      return res.status(400).json({ error: 'No image provided' });
    }

    let finalSetId = set_id;
    
    if (set_name && !set_id) {
      const result = await query('INSERT INTO sets (name) VALUES (?)', [set_name]);
      finalSetId = result.insertId;
    }

    const setData = await queryOne('SELECT name, border FROM sets WHERE id = ?', [finalSetId]);

    let borderPath;
    if (setData.border) {
      borderPath = path.join(__dirname, 'public/uploads/borders', setData.border);
    } else {
      borderPath = path.join(__dirname, 'assets', 'border.png');
    }
    const border = await fs.readFile(borderPath);

    // Generate the cropped/resized image WITHOUT border (this goes in 'image' column)
    const croppedImageBuffer = await sharp(imageBuffer)
      .resize(550, 600, {
        fit: cropMode === 'stretch' ? 'fill' : 'cover',
        position: cropMode === 'stretch' ? undefined : (cropMode || 'centre')
      })
      .toBuffer();

    // Save the cropped image (without border)
    const croppedFilename = `${name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${edition}_${Date.now()}.png`;
    const croppedPath = path.join(__dirname, 'public/uploads/cards', croppedFilename);
    await fs.writeFile(croppedPath, croppedImageBuffer);

    // Generate the BORDERED version using cardGen (this goes in 'bordered_image' column)
    const borderedCardBuffer = await cardGen(imageBuffer, {
      name: name,
      subtitle: ``,
      footer: ''
    }, cropMode || 'centre', border);

    // Save the bordered card
    const borderedFilename = `bordered_${name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${edition}_${Date.now()}.png`;
    const borderedPath = path.join(__dirname, 'public/uploads/cards', borderedFilename);
    await fs.writeFile(borderedPath, borderedCardBuffer);

    await query(`
      INSERT INTO cards (name, edition, set_id, image, bordered_image, dropping, scheduled_drop) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [name, edition, finalSetId, croppedFilename, borderedFilename, dropping, scheduled_drop || null]);

    if (req.file) {
      await fs.unlink(req.file.path).catch(() => {}); // Clean up temp file after copying
    }

    res.json({ success: true, message: 'Card created successfully with image' });
  } catch (error) {
    console.error('Card creation error:', error);
    res.status(500).json({ error: 'Failed to create card: ' + error.message });
  }
});

app.post('/admin/cards/bulk-create', isAdmin, upload.array('images', 50), async (req, res) => {
  try {
    const { set_id, set_name, dropping, scheduled_drop, cardsData, imageUrls, cropModes } = req.body;
    const cards = JSON.parse(cardsData);
    const urls = imageUrls ? JSON.parse(imageUrls) : [];
    const modes = cropModes ? JSON.parse(cropModes) : [];
    
    let finalSetId = set_id;
    
    if (set_name && !set_id) {
      const result = await query('INSERT INTO sets (name) VALUES (?)', [set_name]);
      finalSetId = result.insertId;
    }

    const setData = await queryOne('SELECT name, border FROM sets WHERE id = ?', [finalSetId]);

    let borderPath;
    if (setData.border) {
      borderPath = path.join(__dirname, 'public/uploads/borders', setData.border);
    } else {
      borderPath = path.join(__dirname, 'assets', 'border.png');
    }
    const border = await fs.readFile(borderPath);

    let created = 0;
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const cropMode = modes[i] || 'centre';
      let imageBuffer;
      let rawImageFilename;

      // Get image from file upload or URL
      if (req.files[i] && req.files[i].size > 0) {
        // File was uploaded
        const file = req.files[i];
        imageBuffer = await fs.readFile(file.path);
        
        // Save raw image
        rawImageFilename = `raw_${Date.now()}_${i}_${file.originalname}`;
        const rawImagePath = path.join(__dirname, 'public/uploads/cards', rawImageFilename);
        await fs.copyFile(file.path, rawImagePath);
        
        await fs.unlink(file.path).catch(() => {}); // Clean up temp file
      } else if (urls[i]) {
        // URL was provided
        imageBuffer = await resolveImageBuffer(urls[i]);
        
        // Save raw image from URL
        rawImageFilename = `raw_${Date.now()}_${i}_url.png`;
        const rawImagePath = path.join(__dirname, 'public/uploads/cards', rawImageFilename);
        await fs.writeFile(rawImagePath, imageBuffer);
      } else {
        continue; // Skip if no image
      }

      const cardBuffer = await cardGen(imageBuffer, {
        name: card.name,
        subtitle: ``,
        footer: ''
      }, cropMode, border);

      const cardFilename = `${card.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${card.edition}_${Date.now()}_${i}.png`;
      const cardPath = path.join(__dirname, 'public/uploads/cards', cardFilename);
      await fs.writeFile(cardPath, cardBuffer);

      await query(`
        INSERT INTO cards (name, edition, set_id, image, bordered_image, dropping, scheduled_drop) 
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [card.name, card.edition, finalSetId, rawImageFilename, cardFilename, dropping, scheduled_drop || null]);

      created++;
    }

    res.json({ success: true, message: `Successfully created ${created} cards` });
  } catch (error) {
    console.error('Bulk creation error:', error);
    res.status(500).json({ error: 'Failed to create cards: ' + error.message });
  }
});

app.get('/admin/cards/:id', isAdmin, async (req, res) => {
  try {
    const card = await queryOne('SELECT * FROM cards WHERE id = ?', [req.params.id]);
    res.json(card);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load card' });
  }
});

app.post('/admin/cards/:id/update', isAdmin, upload.single('image'), async (req, res) => {
  try {
    const { name, edition, set_id, set_name, imageUrl, cropMode, dropping, scheduled_drop } = req.body;
    const cardId = req.params.id;
    
    // Get existing card data
    const existingCard = await queryOne('SELECT * FROM cards WHERE id = ?', [cardId]);
    
    if (!existingCard) {
      return res.status(404).json({ error: 'Card not found' });
    }
    
    let finalSetId = set_id;
    
    if (set_name && !set_id) {
      const result = await query('INSERT INTO sets (name, border, rarity, creator, available, `default`) VALUES (?, ?, ?, ?, ?, ?)', 
        [set_name, '', 100, '', 1, 0]);
      finalSetId = result.insertId;
    }
    
    // Use existing images if no new image provided
    let newImageFilename = existingCard.image;
    let newBorderedFilename = existingCard.bordered_image;
    
    // Check if new image was provided
    if (req.file || imageUrl) {
      let imageBuffer;
      
      if (req.file) {
        imageBuffer = await fs.readFile(req.file.path);
        
        // Save raw image
        const rawImageFilename = `raw_${Date.now()}_${req.file.originalname}`;
        const rawImagePath = path.join(__dirname, 'public/uploads/cards', rawImageFilename);
        await fs.copyFile(req.file.path, rawImagePath);
        newImageFilename = rawImageFilename;
        
      } else if (imageUrl) {
        imageBuffer = await resolveImageBuffer(imageUrl);
        newImageFilename = imageUrl;
      }
      
      // Generate new bordered card
      const setData = await queryOne('SELECT name, border FROM sets WHERE id = ?', [finalSetId]);
      
      let borderPath;
      if (setData && setData.border) {
        borderPath = path.join(__dirname, 'public/uploads/borders', setData.border);
      } else {
        borderPath = path.join(__dirname, 'assets', 'border.png');
      }
      
      const border = await fs.readFile(borderPath);
      
      const cardBuffer = await cardGen(imageBuffer, {
        name: name,
        subtitle: ``,
        footer: ''
      }, cropMode || 'centre', border);
      
      const cardFilename = `${name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${edition}_${Date.now()}.png`;
      const cardPath = path.join(__dirname, 'public/uploads/cards', cardFilename);
      await fs.writeFile(cardPath, cardBuffer);
      
      newBorderedFilename = cardFilename;
      
      // Clean up temp file
      if (req.file) {
        await fs.unlink(req.file.path).catch(() => {});
      }
    }
    
    // Update card
    await query(`
      UPDATE cards 
      SET name = ?, edition = ?, set_id = ?, image = ?, bordered_image = ?, dropping = ?, scheduled_drop = ? 
      WHERE id = ?
    `, [name, edition, finalSetId, newImageFilename, newBorderedFilename, dropping, scheduled_drop || null, cardId]);
    
    res.json({ success: true, message: 'Card updated successfully' });
  } catch (error) {
    console.error('Card update error:', error);
    res.status(500).json({ error: 'Failed to update card: ' + error.message });
  }
});

app.post('/admin/cards/:id/update-info', isAdmin, upload.single('image'), async (req, res) => {
  try {
    const { name, edition, set_id, set_name, dropping, scheduled_drop } = req.body;
    
    let finalSetId = set_id;
    
    if (set_name && !set_id) {
      const result = await query('INSERT INTO sets (name) VALUES (?)', [set_name]);
      finalSetId = result.insertId;
    }
    
    await query(`
      UPDATE cards 
      SET name = ?, edition = ?, set_id = ?, dropping = ?, scheduled_drop = ? 
      WHERE id = ?
    `, [name, edition, finalSetId, dropping, scheduled_drop || null, req.params.id]);
    
    res.json({ success: true, message: 'Card updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update card: ' + error.message });
  }
});

app.post('/admin/cards/:id/update-stats', isAdmin, async (req, res) => {
  const { dropped, grabbed } = req.body;
  
  try {
    await query('UPDATE cards SET dropped = ?, grabbed = ? WHERE id = ?', [dropped, grabbed, req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update stats' });
  }
});

app.post('/admin/cards/:id/delete', isAdmin, async (req, res) => {
  try {
    await query('DELETE FROM cards WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Card deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete card' });
  }
});

app.post('/admin/cards/:id/delete-copies', isAdmin, async (req, res) => {
  try {
    // Delete all owned copies
    const result = await query('DELETE FROM owned_cards WHERE card = ?', [req.params.id]);
    
    // Reset the dropped and grabbed stats for the card
    await query('UPDATE cards SET dropped = 0, grabbed = 0 WHERE id = ?', [req.params.id]);
    
    res.json({ 
      success: true, 
      message: `Deleted ${result.affectedRows} owned copies and reset card stats` 
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete copies' });
  }
});

// Owned Cards Management
app.get('/admin/owned-cards/count', isAdmin, async (req, res) => {
  try {
    const result = await queryOne('SELECT COUNT(*) as count FROM owned_cards');
    res.json({ count: result.count });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get owned card count' });
  }
});

app.get('/admin/owned-cards', isAdmin, async (req, res) => {
  try {
    const ownedCards = await query(`
      SELECT owned_cards.*, cards.name as card_name, cards.edition, sets.name as set_name
      FROM owned_cards
      LEFT JOIN cards ON owned_cards.card = cards.id
      LEFT JOIN sets ON cards.set_id = sets.id
      ORDER BY owned_cards.id DESC
    `);
    
    const cards = await query(`
      SELECT cards.id, cards.name, cards.edition, sets.name as set_name
      FROM cards
      LEFT JOIN sets ON cards.set_id = sets.id
      ORDER BY cards.name ASC
    `);

    const countResult = await queryOne('SELECT COUNT(*) as count FROM owned_cards');
    
    res.render('owned-cards', {
      username: req.session.username,
      ownedCards: ownedCards,
      cards: cards,
      ownedCount: countResult.count
    });
  } catch (error) {
    console.error('Owned cards page error:', error);
    res.status(500).send('Error loading owned cards page');
  }
});

app.post('/admin/owned-cards/generate', isAdmin, async (req, res) => {
  const { card_id, owner, dropper, grabber, condition } = req.body;
  
  try {
    const card = await queryOne('SELECT * FROM cards WHERE id = ?', [card_id]);
    
    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }
    
    const printResult = await queryOne('SELECT COUNT(*) as count FROM owned_cards WHERE card = ?', [card_id]);
    const print = (printResult.count || 0) + 1;
    
    // Generate sequential ID
    const id = await generateUniqueId();
    
    await query(`
      INSERT INTO owned_cards (id, card, print, dropper, grabber, owner, \`condition\`)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [id, card_id, print, dropper || null, grabber || null, owner || null, condition || 100]);
    
    res.json({ success: true, message: 'Owned card generated successfully', id: id, print: print });
  } catch (error) {
    console.error('Owned card generation error:', error);
    res.status(500).json({ error: 'Failed to generate owned card: ' + error.message });
  }
});

app.post('/admin/owned-cards/:id/update', isAdmin, async (req, res) => {
  const { dropper, grabber, owner, condition } = req.body;
  
  try {
    await query(`
      UPDATE owned_cards 
      SET dropper = ?, grabber = ?, owner = ?, \`condition\` = ?
      WHERE id = ?
    `, [dropper || null, grabber || null, owner || null, condition, req.params.id]);
    
    res.json({ success: true, message: 'Owned card updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update owned card' });
  }
});

app.post('/admin/owned-cards/:id/delete', isAdmin, async (req, res) => {
  try {
    await query('DELETE FROM owned_cards WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Owned card deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete owned card' });
  }
});

// Items Management
app.get('/admin/items', isAdmin, async (req, res) => {
  try {
    const items = await query('SELECT * FROM items ORDER BY id DESC');
    
    res.render('items', {
      username: req.session.username,
      items: items
    });
  } catch (error) {
    console.error('Items page error:', error);
    res.status(500).send('Error loading items page');
  }
});

app.post('/admin/items/create', isAdmin, async (req, res) => {
  const { name, description } = req.body;
  
  try {
    await query('INSERT INTO items (name, description) VALUES (?, ?)', [name, description || null]);
    res.json({ success: true, message: 'Item created successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create item' });
  }
});

app.post('/admin/items/:id/update', isAdmin, async (req, res) => {
  const { name, description } = req.body;
  
  try {
    await query('UPDATE items SET name = ?, description = ? WHERE id = ?', [name, description || null, req.params.id]);
    res.json({ success: true, message: 'Item updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update item' });
  }
});

app.post('/admin/items/:id/delete', isAdmin, async (req, res) => {
  try {
    await query('DELETE FROM items WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Item deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

// Inventory Management
app.get('/admin/inventory', isAdmin, async (req, res) => {
  try {
    const inventory = await query(`
      SELECT inventory.*, users.userid, items.name as item_name
      FROM inventory
      LEFT JOIN users ON inventory.userid = users.userid
      LEFT JOIN items ON inventory.itemid = items.id
      ORDER BY inventory.id DESC
    `);
    
    const users = await query('SELECT userid FROM users ORDER BY userid ASC');
    const items = await query('SELECT id, name FROM items ORDER BY name ASC');
    
    res.render('inventory', {
      username: req.session.username,
      inventory: inventory,
      users: users,
      items: items
    });
  } catch (error) {
    console.error('Inventory page error:', error);
    res.status(500).send('Error loading inventory page');
  }
});

app.post('/admin/inventory/update', isAdmin, async (req, res) => {
  const { userid, itemid, amount } = req.body;
  
  try {
    const existing = await queryOne('SELECT * FROM inventory WHERE userid = ? AND itemid = ?', [userid, itemid]);
    
    if (existing) {
      await query('UPDATE inventory SET amount = ? WHERE userid = ? AND itemid = ?', [amount, userid, itemid]);
    } else {
      await query('INSERT INTO inventory (userid, itemid, amount) VALUES (?, ?, ?)', [userid, itemid, amount]);
    }
    
    res.json({ success: true, message: 'Inventory updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update inventory' });
  }
});

// Auctions Management
app.get('/admin/auctions', isAdmin, async (req, res) => {
  try {
    const auctions = await query('SELECT * FROM auctions ORDER BY id DESC');
    
    res.render('auctions', {
      username: req.session.username,
      auctions: auctions
    });
  } catch (error) {
    console.error('Auctions page error:', error);
    res.status(500).send('Error loading auctions page');
  }
});

app.get('/admin/auctions/search-cards', isAdmin, async (req, res) => {
  const { query: searchQuery } = req.query;
  
  if (!searchQuery) {
    return res.json({ success: true, cards: [] });
  }
  
  try {
    const cards = await query(`
      SELECT cards.id, cards.name, cards.edition, sets.name as set_name
      FROM cards
      LEFT JOIN sets ON cards.set_id = sets.id
      WHERE cards.name LIKE ? OR CAST(cards.id AS CHAR) LIKE ?
      ORDER BY cards.name ASC
      LIMIT 20
    `, [`%${searchQuery}%`, `%${searchQuery}%`]);
    
    console.log('Auction search query:', searchQuery, 'Results:', cards.length, cards);
    res.json({ success: true, cards: cards });
  } catch (error) {
    console.error('Auction search error:', error);
    res.status(500).json({ success: false, error: 'Failed to search cards: ' + error.message });
  }
});

app.post('/admin/auctions/create', isAdmin, async (req, res) => {
  const { starttime, endtime, card1, card2, card3, card4 } = req.body;
  
  try {
    const cardIds = [card1, card2, card3, card4].filter(Boolean);
    const ownedCardIds = [];
    
    for (const cardId of cardIds) {
      const card = await queryOne('SELECT * FROM cards WHERE id = ?', [cardId]);
      
      if (!card) {
        return res.status(400).json({ error: `Card ${cardId} not found` });
      }
      
      const printResult = await queryOne('SELECT COUNT(*) as count FROM owned_cards WHERE card = ?', [cardId]);
      const print = (printResult.count || 0) + 1;
      
      // Generate sequential ID
      const ownedCardId = await generateUniqueId();
      
      await query(`
        INSERT INTO owned_cards (id, card, print, owner, \`condition\`)
        VALUES (?, ?, ?, ?, ?)
      `, [ownedCardId, cardId, print, '1', 5]);
      
      ownedCardIds.push(ownedCardId);
    }
    
    await query(`
      INSERT INTO auctions (starttime, endtime, card1, card2, card3, card4)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      starttime,
      endtime,
      ownedCardIds[0] || null,
      ownedCardIds[1] || null,
      ownedCardIds[2] || null,
      ownedCardIds[3] || null
    ]);
    
    res.json({ success: true, message: 'Auction created successfully with 4 new cards' });
  } catch (error) {
    console.error('Auction creation error:', error);
    res.status(500).json({ error: 'Failed to create auction: ' + error.message });
  }
});

app.post('/admin/auctions/:id/delete', isAdmin, async (req, res) => {
  try {
    const auction = await queryOne('SELECT * FROM auctions WHERE id = ?', [req.params.id]);
    
    if (!auction) {
      return res.status(404).json({ error: 'Auction not found' });
    }
    
    const now = new Date().toISOString();
    if (auction.endtime < now) {
      if (auction.card1 && auction.currentbid1 === 0) {
        await query('DELETE FROM owned_cards WHERE id = ?', [auction.card1]);
      }
      if (auction.card2 && auction.currentbid2 === 0) {
        await query('DELETE FROM owned_cards WHERE id = ?', [auction.card2]);
      }
      if (auction.card3 && auction.currentbid3 === 0) {
        await query('DELETE FROM owned_cards WHERE id = ?', [auction.card3]);
      }
      if (auction.card4 && auction.currentbid4 === 0) {
        await query('DELETE FROM owned_cards WHERE id = ?', [auction.card4]);
      }
    }
    
    await query('DELETE FROM auctions WHERE id = ?', [req.params.id]);
    
    res.json({ success: true, message: 'Auction deleted successfully' });
  } catch (error) {
    console.error('Auction deletion error:', error);
    res.status(500).json({ error: 'Failed to delete auction' });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// Bulk Delete Routes
app.post('/admin/cards/bulk-delete', isAdmin, async (req, res) => {
  const { ids } = req.body;
  
  try {
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No cards selected' });
    }
    
    const placeholders = ids.map(() => '?').join(',');
    await query(`DELETE FROM cards WHERE id IN (${placeholders})`, ids);
    
    res.json({ success: true, message: `Deleted ${ids.length} card(s)` });
  } catch (error) {
    console.error('Bulk delete cards error:', error);
    res.status(500).json({ error: 'Failed to delete cards' });
  }
});

app.post('/admin/owned-cards/bulk-delete', isAdmin, async (req, res) => {
  const { ids } = req.body;
  
  try {
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No cards selected' });
    }
    
    const placeholders = ids.map(() => '?').join(',');
    await query(`DELETE FROM owned_cards WHERE id IN (${placeholders})`, ids);
    
    res.json({ success: true, message: `Deleted ${ids.length} owned card(s)` });
  } catch (error) {
    console.error('Bulk delete owned cards error:', error);
    res.status(500).json({ error: 'Failed to delete owned cards' });
  }
});

app.post('/admin/sets/bulk-delete', isAdmin, async (req, res) => {
  const { ids } = req.body;
  
  try {
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No sets selected' });
    }
    
    const placeholders = ids.map(() => '?').join(',');
    await query(`DELETE FROM sets WHERE id IN (${placeholders})`, ids);
    
    res.json({ success: true, message: `Deleted ${ids.length} set(s)` });
  } catch (error) {
    console.error('Bulk delete sets error:', error);
    res.status(500).json({ error: 'Failed to delete sets' });
  }
});

app.post('/admin/items/bulk-delete', isAdmin, async (req, res) => {
  const { ids } = req.body;
  
  try {
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No items selected' });
    }
    
    const placeholders = ids.map(() => '?').join(',');
    await query(`DELETE FROM items WHERE id IN (${placeholders})`, ids);
    
    res.json({ success: true, message: `Deleted ${ids.length} item(s)` });
  } catch (error) {
    console.error('Bulk delete items error:', error);
    res.status(500).json({ error: 'Failed to delete items' });
  }
});

app.post('/admin/inventory/bulk-delete', isAdmin, async (req, res) => {
  const { ids } = req.body;
  
  try {
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No inventory items selected' });
    }
    
    const placeholders = ids.map(() => '?').join(',');
    await query(`DELETE FROM inventory WHERE id IN (${placeholders})`, ids);
    
    res.json({ success: true, message: `Deleted ${ids.length} inventory item(s)` });
  } catch (error) {
    console.error('Bulk delete inventory error:', error);
    res.status(500).json({ error: 'Failed to delete inventory items' });
  }
});

app.post('/admin/auctions/bulk-delete', isAdmin, async (req, res) => {
  const { ids } = req.body;
  
  try {
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No auctions selected' });
    }
    
    const placeholders = ids.map(() => '?').join(',');
    await query(`DELETE FROM auctions WHERE id IN (${placeholders})`, ids);
    
    res.json({ success: true, message: `Deleted ${ids.length} auction(s)` });
  } catch (error) {
    console.error('Bulk delete auctions error:', error);
    res.status(500).json({ error: 'Failed to delete auctions' });
  }
});

app.post('/admin/users/bulk-delete', isAdmin, async (req, res) => {
  const { ids } = req.body;
  
  try {
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No users selected' });
    }
    
    const placeholders = ids.map(() => '?').join(',');
    await query(`DELETE FROM users WHERE userid IN (${placeholders})`, ids);
    
    res.json({ success: true, message: `Deleted ${ids.length} user(s)` });
  } catch (error) {
    console.error('Bulk delete users error:', error);
    res.status(500).json({ error: 'Failed to delete users' });
  }
});

// Reset Bot Route (deletes everything)
app.post('/admin/reset-bot', isAdmin, async (req, res) => {
  try {
    await query('DELETE FROM owned_cards');
    await query('DELETE FROM cards');
    await query('ALTER TABLE owned_cards AUTO_INCREMENT = 1');
    await query('ALTER TABLE cards AUTO_INCREMENT = 1');
    res.json({ 
      success: true, 
      message: 'Bot reset successfully. All cards and owned cards have been deleted.' 
    });
  } catch (error) {
    console.error('Reset bot error:', error);
    res.status(500).json({ error: 'Failed to reset bot: ' + error.message });
  }
});

// Reset Economy Route (only resets stats + clears owned_cards)
app.post('/admin/reset-economy', isAdmin, async (req, res) => {
  try {
    await query('UPDATE cards SET dropped = 0, grabbed = 0');
    await query('DELETE FROM owned_cards');
    res.json({ 
      success: true, 
      message: 'Economy reset successfully. All drop/grab stats cleared and owned cards deleted.' 
    });
  } catch (error) {
    console.error('Reset economy error:', error);
    res.status(500).json({ error: 'Failed to reset economy: ' + error.message });
  }
});

// Sets Management Routes
const borderStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'img/borders'));
  },
  filename: (req, file, cb) => {
    // Keep just the original name without timestamp so we can store <filename>.png
    const ext = path.extname(file.originalname) || '.png';
    const base = path.basename(file.originalname, ext);
    cb(null, base + '.png');
  }
});

const borderUpload = multer({
  storage: borderStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

app.get('/admin/sets', isAdmin, async (req, res) => {
  try {
    const sets = await query('SELECT * FROM sets ORDER BY id DESC');
    res.render('sets', { username: req.session.username, sets });
  } catch (error) {
    console.error('Sets page error:', error);
    res.status(500).send('Error loading sets page');
  }
});

app.get('/admin/sets/data', isAdmin, async (req, res) => {
  try {
    const sets = await query('SELECT * FROM sets ORDER BY id DESC');
    res.json({ sets });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load sets' });
  }
});

app.post('/admin/sets/create', isAdmin, borderUpload.single('border'), async (req, res) => {
  try {
    const { name, rarity, available } = req.body;
    const borderFilename = req.file ? req.file.filename : null;

    await query(
      'INSERT INTO sets (name, border, rarity, available) VALUES (?, ?, ?, ?)',
      [name, borderFilename, rarity || 100, available || 0]
    );
    res.json({ success: true, message: 'Set created successfully' });
  } catch (error) {
    console.error('Set creation error:', error);
    res.status(500).json({ error: 'Failed to create set: ' + error.message });
  }
});

app.post('/admin/sets/:id/update', isAdmin, borderUpload.single('border'), async (req, res) => {
  try {
    const { name, rarity, available } = req.body;
    const existing = await queryOne('SELECT * FROM sets WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Set not found' });

    const borderFilename = req.file ? req.file.filename : existing.border;

    await query(
      'UPDATE sets SET name = ?, border = ?, rarity = ?, available = ? WHERE id = ?',
      [name, borderFilename, rarity || 100, available || 0, req.params.id]
    );
    res.json({ success: true, message: 'Set updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update set: ' + error.message });
  }
});

app.post('/admin/sets/:id/delete', isAdmin, async (req, res) => {
  try {
    await query('DELETE FROM sets WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Set deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete set' });
  }
});

// Serve border images from img/borders
app.use('/img/borders', express.static(path.join(__dirname, 'img/borders')));

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
