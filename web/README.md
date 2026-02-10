# Discord Cards Web Interface

A sleek web interface for the Discord card collecting bot with user authentication, admin panel, and card management.

## Features

- 🔐 User authentication (login/register) with bcrypt password hashing
- 👤 User dashboard
- 🛡️ Admin panel for Discord user management
- 🎴 **Card Management System**
  - Add new cards with editions and sets
  - Edit existing card information
  - Edit card statistics (dropped/grabbed counts)
  - Delete cards and their owned copies
  - Schedule card drops
- 📊 User statistics and management
- 🚫 Ban/unban Discord users
- 🗑️ Delete Discord users
- 🎨 Retro-futuristic holographic card aesthetic

## Setup Instructions

### 1. Install Dependencies

Navigate to the `web` folder and install the required packages:

```bash
cd web
npm install
```

### 2. Database Setup

The application will automatically create all necessary tables in the SQLite database at `../src/database/cards.sqlite3` when you first run the server.

The database schema includes:
- `webusers` - Web authentication users
- `users` - Discord bot users (for banning)
- `sets` - Card sets
- `cards` - Card definitions
- `owned_cards` - User card collections

### 3. Run the Server

```bash
npm start
```

Or for development with auto-reload:

```bash
npm run dev
```

The server will start on `http://localhost:3000`

### 4. Create an Admin Account

To make a user an admin, you'll need to manually update the database:

**Option 1: Using the helper script**
```bash
node create-admin.js
```

**Option 2: Using SQLite command line**
```bash
sqlite3 ../src/database/cards.sqlite3
UPDATE webusers SET admin = 1 WHERE username = 'your-username';
.exit
```

## Usage

### Login/Register
- Navigate to `http://localhost:3000`
- Create a new account using the Register tab
- Login with your credentials

### Dashboard
- After logging in, you'll see the dashboard
- Future features will be added here

### Admin Panel - User Management
- Access via the "Admin Panel" button
- View all Discord users from the `users` table
- Ban/unban Discord users (prevents them from using bot commands)
- Delete Discord users
- View user statistics

### Admin Panel - Card Management
- Access via the "Manage Cards" link in the admin panel
- **Add New Cards:**
  - Enter card name
  - Choose edition (existing or create new - automatically increments)
  - Select set (existing or create new)
  - Add image URL (or use upload button - coming soon)
  - Set dropping status (yes/no)
  - Optionally schedule drop with timestamp
- **Edit Cards:**
  - Edit Info: Modify all card properties
  - Edit Stats: Update dropped and grabbed counts
  - Delete Card: Remove the card entirely
  - Delete Copies: Remove all owned copies from users

## Card Edition Logic

- **Existing Edition:** Choose from existing editions for that card name
- **New Edition:** Automatically creates the highest edition + 1 for that card
- Each card can have multiple editions within different sets
- Edition 1 is the default for new cards

## Security Features

- Passwords are hashed using bcrypt (10 rounds)
- Session-based authentication
- Admin-only routes protected by middleware
- Banned Discord users cannot use bot commands
- Safe deletion with confirmation dialogs

## Project Structure

```
web/
├── server.js          # Main Express server with all routes
├── package.json       # Dependencies
├── views/            
│   ├── index.ejs      # Login/Register page
│   ├── dashboard.ejs  # User dashboard
│   ├── admin.ejs      # Discord user management
│   └── cards.ejs      # Card management (NEW!)
└── public/            # Static files
```

## API Endpoints

### Card Management
- `GET /admin/cards` - Card management page
- `GET /admin/cards/data` - Get sets and editions data
- `POST /admin/cards/create` - Create new card
- `GET /admin/cards/:id` - Get card details
- `POST /admin/cards/:id/update` - Update card info
- `POST /admin/cards/:id/update-stats` - Update card stats
- `POST /admin/cards/:id/delete` - Delete card
- `POST /admin/cards/:id/delete-copies` - Delete all owned copies

### User Management
- `GET /admin` - Discord user management
- `POST /admin/ban-user` - Ban/unban Discord user
- `POST /admin/delete-user` - Delete Discord user

## Database Tables

### webusers
Web authentication - separate from Discord users
- Admin accounts for web interface management

### users
Discord bot users
- Stores Discord ID and username
- `banned` field controls bot access

### sets
Card sets/collections
- Auto-created when adding cards

### cards
Card definitions
- Name, edition, set reference
- Dropping status and schedule
- Drop/grab statistics

### owned_cards
User card ownership
- Links users to their collected cards
- Tracks edition and set

## Future Enhancements

Planned features:
- Image upload functionality
- Card preview in management
- Bulk operations
- Advanced filtering and search
- User collection viewing
- Trading system

## Technologies Used

- Node.js
- Express.js
- EJS (templating)
- Better-SQLite3
- Bcrypt (password hashing)
- Express-Session

## Notes

- This is designed to run locally for now
- The session secret should be changed in production
- Consider adding HTTPS in production (set `cookie: { secure: true }`)
- The database path is relative: `../src/database/cards.sqlite3`
- Image upload button is a placeholder for future implementation
