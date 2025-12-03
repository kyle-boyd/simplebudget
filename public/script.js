function displayTransactions(transactions) {
    const container = document.getElementById('transactionsContainer');
    if (!container) return;
    
    container.innerHTML = '';
    
    transactions.forEach(transaction => {
        const dateParts = transaction.Date.split('/');
        const date = new Date(2000 + parseInt(dateParts[2]), parseInt(dateParts[0]) - 1, parseInt(dateParts[1]));
        const formattedDate = date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });

        // Format the amount (changed this part only)
        const amount = parseFloat(transaction.Amount);
        const formattedAmount = amount.toLocaleString('en-US', {
            style: 'currency',
            currency: 'USD'
        });
        const amountClass = amount >= 0 ? 'positive' : '';

        const card = document.createElement('div');
        card.className = 'transaction-card';
        
        card.innerHTML = `
            <div class="transaction-content">
                <div class="transaction-date">${formattedDate}</div>
                <div class="transaction-name">${transaction.Description}</div>
                <div class="transaction-amount ${amountClass}">${formattedAmount}</div>
                <div class="category-select">
                    <div class="category-tag ${transaction.hasRule ? 'has-rule' : ''}" 
                         data-id="${transaction.id}">${transaction.Category || 'Select Category'}</div>
                </div>
                <button class="confirm-button" onclick="toggleConfirm(event, ${transaction.id}, this)">
                    ${confirmedTransactions[transaction.id] || false ? 'Unconfirm' : 'Confirm'}
                </button>
            </div>
        `;

        card.addEventListener('click', function() {
            toggleEditPanel(transaction);
        });

        container.appendChild(card);
    });
}

