# Fixed Web Interface - Changes Made

## Changes Applied:

### 1. ✅ Fixed generateId.js
- Replaced with your IDGenerator pattern
- IDs now follow: 1, 2, 3...9, A, B...Z, 11, 12, etc.
- Works with MySQL async queries

### 2. ✅ Added Bulk Delete Routes
Added 7 new routes to server.js:
- `/admin/cards/bulk-delete`
- `/admin/owned-cards/bulk-delete`
- `/admin/sets/bulk-delete`
- `/admin/items/bulk-delete`
- `/admin/inventory/bulk-delete`
- `/admin/auctions/bulk-delete`
- `/admin/users/bulk-delete`

### 3. ✅ Added Reset Economy Route
- `/admin/reset-economy`
- Deletes all cards and owned_cards
- Resets auto-increment counters

## Still Need to Update EJS Files

You need to manually add bulk operations UI to your EJS dashboard files.

### For Each Dashboard (cards.ejs, owned-cards.ejs, etc.):

#### 1. Add Action Buttons at Top of Page:

```html
<div style="display: flex; gap: 10px; margin-bottom: 20px;">
  <button onclick="location.reload()" style="padding: 10px 20px; background: #6c757d; color: white; border: none; border-radius: 5px; cursor: pointer;">
    🔄 Refresh
  </button>
  
  <button onclick="bulkDelete()" style="padding: 10px 20px; background: #dc3545; color: white; border: none; border-radius: 5px; cursor: pointer;">
    🗑️ Bulk Delete Selected
  </button>
  
  <!-- ONLY FOR cards.ejs: -->
  <!-- <button onclick="resetEconomy()" style="padding: 10px 20px; background: #8b0000; color: white; border: none; border-radius: 5px; cursor: pointer;">
    ⚠️ Reset Economy
  </button> -->
</div>
```

#### 2. Add Checkbox Column to Table:

```html
<table>
  <thead>
    <tr>
      <th><input type="checkbox" id="selectAll" onclick="toggleSelectAll()"></th>
      <th>ID</th>
      <th>Name</th>
      <!-- other columns -->
    </tr>
  </thead>
  <tbody>
    <% items.forEach(item => { %>
    <tr>
      <td><input type="checkbox" class="item-checkbox" value="<%= item.id %>"></td>
      <td><%= item.id %></td>
      <td><%= item.name %></td>
      <!-- other columns -->
    </tr>
    <% }); %>
  </tbody>
</table>
```

#### 3. Add JavaScript at Bottom:

```html
<script>
// CHANGE THESE THREE VALUES FOR EACH PAGE:
const CHECKBOX_CLASS = 'item-checkbox';           // card-checkbox, user-checkbox, etc.
const DELETE_ENDPOINT = '/admin/items/bulk-delete';  // /admin/cards/bulk-delete, etc.
const ITEM_NAME = 'item';                         // card, user, auction, etc.

function toggleSelectAll() {
  const selectAll = document.getElementById('selectAll');
  const checkboxes = document.querySelectorAll('.' + CHECKBOX_CLASS);
  checkboxes.forEach(cb => cb.checked = selectAll.checked);
}

function bulkDelete() {
  const selected = Array.from(document.querySelectorAll('.' + CHECKBOX_CLASS + ':checked'))
    .map(cb => cb.value);
  
  if (selected.length === 0) {
    alert('Please select ' + ITEM_NAME + 's to delete');
    return;
  }
  
  if (!confirm(`Delete ${selected.length} ${ITEM_NAME}(s)?`)) {
    return;
  }
  
  fetch(DELETE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: selected })
  })
  .then(r => r.json())
  .then(data => {
    if (data.success) {
      alert(data.message);
      location.reload();
    } else {
      alert('Error: ' + data.error);
    }
  })
  .catch(err => alert('Error: ' + err));
}

// ONLY FOR cards.ejs - Add this function:
function resetEconomy() {
  if (!confirm('⚠️ WARNING: This will DELETE ALL cards and owned cards!\\n\\nThis action CANNOT be undone!\\n\\nAre you absolutely sure?')) {
    return;
  }
  
  const confirmation = prompt('Type "DELETE EVERYTHING" to confirm:');
  if (confirmation !== 'DELETE EVERYTHING') {
    alert('Reset cancelled');
    return;
  }
  
  fetch('/admin/reset-economy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  })
  .then(r => r.json())
  .then(data => {
    if (data.success) {
      alert(data.message);
      location.reload();
    } else {
      alert('Error: ' + data.error);
    }
  })
  .catch(err => alert('Error: ' + err));
}
</script>
```

### Quick Reference for Each Page:

**cards.ejs:**
```javascript
const CHECKBOX_CLASS = 'card-checkbox';
const DELETE_ENDPOINT = '/admin/cards/bulk-delete';
const ITEM_NAME = 'card';
// + Include resetEconomy() function and button
```

**owned-cards.ejs:**
```javascript
const CHECKBOX_CLASS = 'owned-card-checkbox';
const DELETE_ENDPOINT = '/admin/owned-cards/bulk-delete';
const ITEM_NAME = 'owned card';
```

**admin.ejs (users):**
```javascript
const CHECKBOX_CLASS = 'user-checkbox';
const DELETE_ENDPOINT = '/admin/users/bulk-delete';
const ITEM_NAME = 'user';
```

**items.ejs:**
```javascript
const CHECKBOX_CLASS = 'item-checkbox';
const DELETE_ENDPOINT = '/admin/items/bulk-delete';
const ITEM_NAME = 'item';
```

**inventory.ejs:**
```javascript
const CHECKBOX_CLASS = 'inventory-checkbox';
const DELETE_ENDPOINT = '/admin/inventory/bulk-delete';
const ITEM_NAME = 'inventory item';
```

**auctions.ejs:**
```javascript
const CHECKBOX_CLASS = 'auction-checkbox';
const DELETE_ENDPOINT = '/admin/auctions/bulk-delete';
const ITEM_NAME = 'auction';
```

## Testing:

1. Upload this fixed web folder to DirectAdmin
2. Install dependencies: `npm install`
3. Start server
4. Test bulk delete on any page
5. Test reset economy (careful!)
6. Create cards - should generate IDs in pattern

## Files Modified:

- `models/generateId.js` - New ID generation pattern
- `server.js` - Added 8 new routes

## Files YOU Need to Modify:

- `views/cards.ejs`
- `views/owned-cards.ejs`
- `views/admin.ejs`
- `views/items.ejs`
- `views/inventory.ejs`
- `views/auctions.ejs`

Add the HTML and JavaScript code shown above to each file.
