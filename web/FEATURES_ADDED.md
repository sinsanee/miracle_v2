# Features Added - Summary

## ✅ Completed:

### 1. Cards Dashboard (cards.ejs)
- ✅ Refresh button added
- ✅ Bulk delete button added
- ✅ Reset economy button added
- ✅ Checkboxes on each card
- ✅ bulkDeleteCards() function
- ✅ resetEconomy() function
- ✅ Fixed /admin/cards/:id/update route to handle file uploads

### 2. Owned Cards Dashboard (owned-cards.ejs)
- ✅ Refresh button added
- ✅ Bulk delete button added
- ✅ Checkboxes in table
- ✅ Toggle all checkbox in header
- ✅ bulkDeleteOwnedCards() function
- ✅ toggleAllCheckboxes() function

### 3. Server.js
- ✅ Fixed /admin/cards/:id/update route (added upload.single('image') middleware, proper image handling)

## 🔧 To add to remaining pages:

Apply similar patterns to:
- items.ejs
- inventory.ejs
- auctions.ejs
- admin.ejs

### Pattern for each page:

1. **Add buttons to header:**
```html
<div style="display: flex; gap: 10px;">
    <button class="btn" onclick="location.reload()">🔄 Refresh</button>
    <button class="btn btn-danger" onclick="bulkDelete[ENTITY]()">🗑️ Delete Selected</button>
    <!-- existing buttons -->
</div>
```

2. **Add checkbox column to table:**
```html
<thead>
    <tr>
        <th><input type="checkbox" onclick="toggleAllCheckboxes(this, '.[entity]-checkbox')"></th>
        <!-- existing headers -->
    </tr>
</thead>
<tbody>
    <tr>
        <td><input type="checkbox" class="[entity]-checkbox" value="<%= item.id %>"></td>
        <!-- existing cells -->
    </tr>
</tbody>
```

3. **Add bulk delete function:**
```javascript
function bulkDelete[ENTITY]() {
    const checkboxes = document.querySelectorAll('.[entity]-checkbox:checked');
    const ids = Array.from(checkboxes).map(cb => cb.value);
    
    if (ids.length === 0) {
        alert('Please select items to delete');
        return;
    }
    
    if (!confirm(`Delete ${ids.length} item(s)? This cannot be undone!`)) {
        return;
    }
    
    fetch('/admin/[route]/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alert(data.message);
            location.reload();
        } else {
            alert('Error: ' + data.error);
        }
    })
    .catch(err => alert('Failed to delete'));
}

function toggleAllCheckboxes(source, selector) {
    document.querySelectorAll(selector).forEach(cb => cb.checked = source.checked);
}
```

## Routes Available (already in server.js):

- /admin/cards/bulk-delete ✅
- /admin/owned-cards/bulk-delete ✅
- /admin/sets/bulk-delete
- /admin/items/bulk-delete
- /admin/inventory/bulk-delete
- /admin/auctions/bulk-delete
- /admin/users/bulk-delete
- /admin/reset-economy ✅

All routes accept: `{ ids: [1, 2, 3] }`
