// UPDATED BULK UPLOAD FUNCTIONS WITH PREVIEW AND PER-CARD CROP

var bulkCardCount = 0;
var bulkPreviewData = null;

function openBulkModal() {
    bulkCardCount = 0;
    document.getElementById('bulk-cards-container').innerHTML = '';
    addBulkCardRow();
    addBulkCardRow();
    addBulkCardRow();
    document.getElementById('bulk-modal').classList.add('show');
}

function addBulkCardRow() {
    bulkCardCount++;
    var container = document.getElementById('bulk-cards-container');
    var row = document.createElement('div');
    row.className = 'bulk-card-item';
    row.id = 'bulk-card-' + bulkCardCount;
    row.innerHTML = `
        <div class="bulk-card-header">
            <strong>Card ${bulkCardCount}</strong>
            <button type="button" class="btn btn-small btn-danger" onclick="removeBulkCard(${bulkCardCount})">Remove</button>
        </div>
        <input type="text" placeholder="Card Name" name="bulk-name-${bulkCardCount}" required style="width: 100%; margin-bottom: 10px;">
        <input type="number" placeholder="Edition" name="bulk-edition-${bulkCardCount}" value="1" min="1" required style="width: 100%; margin-bottom: 10px;">
        <div style="margin-bottom: 10px;">
            <label style="display: block; margin-bottom: 5px; font-size: 0.9rem;">Crop Mode</label>
            <select name="bulk-crop-${bulkCardCount}" style="width: 100%;">
                <option value="centre">Center (Default)</option>
                <option value="top">Top</option>
                <option value="bottom">Bottom</option>
                <option value="left">Left</option>
                <option value="right">Right</option>
                <option value="stretch">Stretch</option>
            </select>
        </div>
        <input type="file" accept="image/*" name="bulk-image-${bulkCardCount}" style="width: 100%; margin-bottom: 10px;">
        <input type="text" placeholder="Or paste image URL" name="bulk-url-${bulkCardCount}" style="width: 100%;">
    `;
    container.appendChild(row);
}

function removeBulkCard(id) {
    var element = document.getElementById('bulk-card-' + id);
    if (element) {
        element.remove();
    }
}

function toggleBulkSet() {
    const isNew = document.getElementById('bulk-set-new').checked;
    document.getElementById('bulk-set-select').style.display = isNew ? 'none' : 'block';
    document.getElementById('bulk-set-name-input').style.display = isNew ? 'block' : 'none';
}

async function generateBulkPreviews() {
    // Collect card data
    var cardElements = document.querySelectorAll('.bulk-card-item');
    var cards = [];
    var previewPromises = [];
    
    // Get set name for preview
    var setName = '';
    if (document.getElementById('bulk-set-existing').checked) {
        var setSelect = document.getElementById('bulk-set-select');
        setName = setSelect.options[setSelect.selectedIndex]?.text || 'Set Name';
    } else {
        setName = document.getElementById('bulk-set-name-input').value || 'New Set';
    }
    
    for (var i = 0; i < cardElements.length; i++) {
        var element = cardElements[i];
        var nameInput = element.querySelector('[name^="bulk-name-"]');
        var editionInput = element.querySelector('[name^="bulk-edition-"]');
        var cropInput = element.querySelector('[name^="bulk-crop-"]');
        var imageInput = element.querySelector('[name^="bulk-image-"]');
        var urlInput = element.querySelector('[name^="bulk-url-"]');
        
        if (!nameInput || !editionInput) continue;
        
        var hasImage = imageInput && imageInput.files[0];
        var hasUrl = urlInput && urlInput.value.trim();
        
        if (hasImage || hasUrl) {
            var cardData = {
                name: nameInput.value,
                edition: parseInt(editionInput.value),
                cropMode: cropInput.value,
                index: i
            };
            
            // Create preview request
            var formData = new FormData();
            if (hasImage) {
                formData.append('image', imageInput.files[0]);
            } else {
                formData.append('imageUrl', urlInput.value.trim());
            }
            formData.append('name', cardData.name);
            formData.append('subtitle', 'Edition ' + cardData.edition);
            formData.append('footer', setName);
            formData.append('cropMode', cardData.cropMode);
            
            cards.push(cardData);
            previewPromises.push(
                fetch('/admin/cards/preview', {
                    method: 'POST',
                    body: formData
                })
                .then(function(response) { return response.json(); })
                .then(function(data) {
                    return { success: data.success, preview: data.preview, error: data.error };
                })
                .catch(function(error) {
                    return { success: false, error: error.message };
                })
            );
        }
    }
    
    if (cards.length === 0) {
        showMessage('Please add at least one card with an image or URL', true);
        return;
    }
    
    // Show loading message
    showMessage('Generating ' + cards.length + ' previews...');
    
    // Wait for all previews
    Promise.all(previewPromises).then(function(results) {
        displayBulkPreviews(cards, results);
    });
}

function displayBulkPreviews(cards, previews) {
    var container = document.getElementById('bulk-preview-container');
    container.innerHTML = '';
    
    for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        var preview = previews[i];
        
        var previewCard = document.createElement('div');
        previewCard.style.cssText = 'background: rgba(0,0,0,0.3); padding: 15px; border-radius: 10px; text-align: center;';
        
        if (preview.success) {
            previewCard.innerHTML = `
                <img src="${preview.preview}" style="width: 100%; border-radius: 8px; margin-bottom: 10px;">
                <strong style="display: block; color: var(--accent);">${card.name}</strong>
                <small style="color: rgba(255,255,255,0.7);">Edition ${card.edition} - ${card.cropMode}</small>
            `;
        } else {
            previewCard.innerHTML = `
                <div style="padding: 40px; color: var(--primary);">
                    <strong>${card.name}</strong><br>
                    <small>Preview failed: ${preview.error || 'Unknown error'}</small>
                </div>
            `;
        }
        
        container.appendChild(previewCard);
    }
    
    document.getElementById('bulk-preview-modal').classList.add('show');
}

function confirmBulkFromPreview() {
    closeModal('bulk-preview-modal');
    // Trigger the normal bulk submit
    document.getElementById('bulk-form').dispatchEvent(new Event('submit', { cancelable: true }));
}

function handleBulkSubmit(event) {
    event.preventDefault();
    
    var formData = new FormData();
    var cards = [];
    
    // Get set info
    var setId = document.getElementById('bulk-set-existing').checked ? 
        document.getElementById('bulk-set-select').value : null;
    var setName = document.getElementById('bulk-set-new').checked ? 
        document.getElementById('bulk-set-name-input').value : null;
    var dropping = document.querySelector('input[name="bulk-dropping"]:checked').value;
    
    formData.append('set_id', setId || '');
    formData.append('set_name', setName || '');
    formData.append('dropping', dropping);
    
    // Collect all cards with their individual crop modes
    var cardElements = document.querySelectorAll('.bulk-card-item');
    var imageUrls = [];
    var cropModes = [];
    
    cardElements.forEach(function(element, index) {
        var nameInput = element.querySelector('[name^="bulk-name-"]');
        var editionInput = element.querySelector('[name^="bulk-edition-"]');
        var cropInput = element.querySelector('[name^="bulk-crop-"]');
        var imageInput = element.querySelector('[name^="bulk-image-"]');
        var urlInput = element.querySelector('[name^="bulk-url-"]');
        
        if (nameInput && editionInput) {
            var hasImage = imageInput && imageInput.files[0];
            var hasUrl = urlInput && urlInput.value.trim();
            
            if (hasImage || hasUrl) {
                cards.push({
                    name: nameInput.value,
                    edition: parseInt(editionInput.value)
                });
                
                // Store crop mode for this card
                cropModes.push(cropInput.value);
                
                if (hasImage) {
                    formData.append('images', imageInput.files[0]);
                    imageUrls.push('');
                } else {
                    formData.append('images', new File([], ''));
                    imageUrls.push(urlInput.value.trim());
                }
            }
        }
    });
    
    if (cards.length === 0) {
        showMessage('Please add at least one card with an image or URL', true);
        return;
    }
    
    formData.append('cardsData', JSON.stringify(cards));
    formData.append('imageUrls', JSON.stringify(imageUrls));
    formData.append('cropModes', JSON.stringify(cropModes));
    
    // Show confirmation modal
    showBulkConfirmation(cards.length, formData);
}

// Confirmation modal functions
var pendingCardData = null;
var pendingBulkData = null;

function showBulkConfirmation(count, formData) {
    pendingBulkData = formData;
    document.getElementById('bulk-confirm-count').textContent = count;
    document.getElementById('bulk-confirm-modal').classList.add('show');
}

function editFromBulkConfirmation() {
    closeModal('bulk-confirm-modal');
    // Bulk modal is still open, user can edit
}

function confirmBulkAdd() {
    if (!pendingBulkData) return;
    
    showMessage('Creating cards...');
    closeModal('bulk-confirm-modal');
    
    fetch('/admin/cards/bulk-create', {
        method: 'POST',
        body: pendingBulkData
    })
    .then(function(response) { return response.json(); })
    .then(function(result) {
        if (result.success) {
            showMessage(result.message);
            closeModal('bulk-modal');
            setTimeout(function() { location.reload(); }, 1500);
        } else {
            showMessage(result.error || 'Bulk creation failed', true);
        }
    })
    .catch(function(error) {
        showMessage('An error occurred during bulk creation', true);
    });
}
