function showEditPanel(transaction) {
    const editPanel = document.querySelector('.edit-panel');
    const editPanelContent = document.querySelector('.edit-panel-content');
    
    // Format the date
    const dateParts = transaction.Date.split('/');
    const date = new Date(2000 + parseInt(dateParts[2]), parseInt(dateParts[0]) - 1, parseInt(dateParts[1]));
    const formattedDate = date.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    });

    // Format the amount
    const amount = parseFloat(transaction.Amount);
    const formattedAmount = amount.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD'
    });

    editPanelContent.innerHTML = `
        <div id="editPanelContent">
            <h2 id="editDescription">${transaction.Description}</h2>
            <span id="editDate">${formattedDate}</span>
            <span id="editAmount" class="${amount >= 0 ? 'positive' : ''}">${formattedAmount}</span>
            
            <div class="category-select">
                <div class="category-tag" data-id="${transaction.id}">
                    ${transaction.Category || 'Select Category'}
                </div>
            </div>

            <div class="rule-section">
                <label class="checkbox-label">
                    <input type="checkbox" id="categorizeCheckbox" ${transaction.hasRule ? 'checked' : ''}>
                    <span>Always categorize as: <strong><span id="editCategoryTagLabel">${transaction.Category || 'Select Category'}</span></strong></span>
                </label>
            </div>

            <div id="btmButtons">
                <button id="closePanelButton">Cancel</button>
                <button id="saveChangesButton">Save</button>
            </div>
        </div>
    `;

    // Add event listeners
    const closeButton = document.getElementById('closePanelButton');
    const saveButton = document.getElementById('saveChangesButton');
    const editPanelCategoryTag = editPanelContent.querySelector('.category-tag');

    closeButton.addEventListener('click', closeEditPanel);
    saveButton.addEventListener('click', () => saveChanges(transaction.id));

    if (editPanelCategoryTag) {
        editPanelCategoryTag.addEventListener('click', function(e) {
            console.log('Edit panel category tag clicked');
            e.stopPropagation();
            showCategoryDropdown(this, transaction.id);
        });
    }

    // Update the category label when category changes
    document.addEventListener('categorySelected', function(e) {
        if (e.detail.transactionId === transaction.id) {
            document.getElementById('editCategoryTagLabel').textContent = e.detail.category;
        }
    });

    // Remove selected state from all transaction cards
    document.querySelectorAll('.transaction-card.selected').forEach(card => {
        card.classList.remove('selected');
    });

    // Add selected state to the clicked transaction card
    const transactionCard = document.querySelector(`.transaction-card[data-id="${transaction.id}"]`);
    if (transactionCard) {
        transactionCard.classList.add('selected');
    }

    // Open the panel
    editPanel.classList.add('open');
}

function closeEditPanel() {
    const editPanel = document.querySelector('.edit-panel');
    const editPanelContent = document.querySelector('.edit-panel-content');
    
    // Remove any open dropdowns
    document.querySelectorAll('.category-dropdown').forEach(dropdown => {
        dropdown.remove();
    });

    // Remove selected state from transaction card
    document.querySelectorAll('.transaction-card.selected').forEach(card => {
        card.classList.remove('selected');
    });
    
    // Remove the open class
    editPanel.classList.remove('open');
    
    // Clear content after animation
    setTimeout(() => {
        editPanelContent.innerHTML = '';
    }, 300); // Match this with your CSS transition time
}

function saveChanges(transactionId) {
    const transaction = transactions.find(t => t.id === transactionId);
    if (!transaction) return;

    // Get the category and rule checkbox state
    const categoryTag = document.querySelector('.edit-panel .category-tag');
    const createRule = document.getElementById('categorizeCheckbox').checked;
    const newCategory = categoryTag.textContent.trim();

    // Update the transaction
    if (newCategory !== 'Select Category') {
        transaction.Category = newCategory;
        transaction.hasRule = createRule;

        // If creating a rule, save it
        if (createRule) {
            const rules = JSON.parse(localStorage.getItem('categoryRules') || '[]');
            const existingRuleIndex = rules.findIndex(rule => 
                rule.description === transaction.Description
            );

            if (existingRuleIndex >= 0) {
                rules[existingRuleIndex].category = newCategory;
            } else {
                rules.push({
                    description: transaction.Description,
                    category: newCategory
                });
            }

            localStorage.setItem('categoryRules', JSON.stringify(rules));

            // Apply rule to all matching transactions
            transactions.forEach(t => {
                if (t.Description === transaction.Description) {
                    t.Category = newCategory;
                    t.hasRule = true;
                }
            });
        }
    }

    // Save transactions
    localStorage.setItem('transactions', JSON.stringify(transactions));
    
    // Refresh display
    displayTransactions(transactions);
    closeEditPanel();
} 