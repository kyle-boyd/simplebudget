function handleFileUpload(event) {
    console.log('File upload started');
    const file = event.target.files[0];
    if (!file) {
        console.log('No file selected');
        return;
    }
    console.log('File selected:', file.name);

    Papa.parse(file, {
        header: true,
        complete: function(results) {
            console.log('Papa Parse complete. Raw results:', results);
            
            const newTransactions = results.data
                .filter(transaction => {
                    const hasRequiredFields = transaction.Date && transaction.Amount;
                    if (!hasRequiredFields) {
                        console.log('Filtered out transaction missing required fields:', transaction);
                    }
                    return hasRequiredFields;
                })
                .map(transaction => {
                    console.log('Processing transaction:', transaction);
                    const transactionId = createTransactionId(transaction);
                    let amount = parseFloat(transaction.Amount.replace(/[^0-9.-]/g, ''));
                    
                    if (transaction.Type && transaction.Type.toLowerCase() === 'debit') {
                        amount = -Math.abs(amount);
                    }

                    const processedTransaction = {
                        ...transaction,
                        Amount: amount,
                        id: transactionId,
                        confirmed: false
                    };
                    console.log('Processed transaction:', processedTransaction);
                    return processedTransaction;
                })
                .filter(newTrans => {
                    const isDuplicate = transactions.some(existingTrans => 
                        existingTrans.id === newTrans.id
                    );
                    if (isDuplicate) {
                        console.log('Filtered out duplicate transaction:', newTrans);
                    }
                    return !isDuplicate;
                });

            console.log('New transactions to add:', newTransactions.length);
            console.log('New transactions:', newTransactions);

            if (newTransactions.length > 0) {
                const updatedTransactions = [...newTransactions, ...transactions];
                console.log('Saving updated transactions to Firebase...');
                saveTransactionsToFirebase(updatedTransactions)
                    .then(() => {
                        console.log('Successfully saved to Firebase');
                        transactions = updatedTransactions;
                        displayTransactions(transactions);
                        initializeMonthDropdown();
                        updateLastUpdatedDate();
                    })
                    .catch(error => {
                        console.error('Error saving to Firebase:', error);
                    });
            } else {
                console.log('No new transactions to add');
            }
        },
        error: function(error) {
            console.error('Error parsing file:', error);
        }
    });

    event.target.value = '';
}

function createTransactionId(transaction) {
    const idString = `${transaction.Date}-${transaction.Description}-${transaction.Amount}`;
    
    let hash = 0;
    for (let i = 0; i < idString.length; i++) {
        const char = idString.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    
    return Math.abs(hash).toString();
}

function displayTransactions(transactions) {
    const container = document.getElementById('transactionsContainer');
    if (!container) return;
    
    container.innerHTML = '';
    
    const sortedTransactions = [...transactions].sort((a, b) => {
        const dateA = new Date(convertDate(a.Date));
        const dateB = new Date(convertDate(b.Date));
        return dateB - dateA;
    });
    
    sortedTransactions.forEach(transaction => {
        const dateParts = transaction.Date.split('/');
        const date = new Date(2000 + parseInt(dateParts[2]), parseInt(dateParts[0]) - 1, parseInt(dateParts[1]));
        const formattedDate = date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });

        const amount = parseFloat(transaction.Amount);
        const formattedAmount = amount.toLocaleString('en-US', {
            style: 'currency',
            currency: 'USD'
        });
        const amountClass = amount >= 0 ? 'positive' : '';

        const card = document.createElement('div');
        card.className = `transaction-card ${transaction.confirmed ? 'confirmed' : ''}`;
        card.setAttribute('data-id', transaction.id);
        
        card.addEventListener('click', (e) => {
            console.log('Card clicked, target:', e.target);
            if (!e.target.closest('.category-tag') && !e.target.closest('.confirm-button')) {
                const editPanel = document.querySelector('.edit-panel');
                const isSelected = card.classList.contains('selected');
                
                if (isSelected && editPanel.classList.contains('open')) {
                    closeEditPanel();
                } else {
                    showEditPanel(transaction);
                }
            }
        });
        
        const editPanel = document.querySelector('.edit-panel');
        if (editPanel.classList.contains('open')) {
            const editingTransactionId = editPanel.getAttribute('data-editing-id');
            if (editingTransactionId === transaction.id) {
                card.classList.add('selected');
            }
        }
        
        card.innerHTML = `
            <div class="transaction-content">
                <div class="transaction-date">${formattedDate}</div>
                <div class="transaction-name">${transaction.Description}</div>
                <div class="transaction-amount ${amountClass}">${formattedAmount}</div>
                <div class="category-select">
                    <div class="category-tag ${transaction.hasRule ? 'has-rule' : ''} ${transaction.confirmed ? 'confirmed' : ''}" 
                         data-id="${transaction.id}">${transaction.Category || 'Select Category'}</div>
                </div>
                <button class="confirm-button ${transaction.confirmed ? 'confirmed' : ''}" 
                        onclick="toggleConfirm(event, '${transaction.id}', this)">
                    ${transaction.confirmed ? 'Unconfirm' : 'Confirm'}
                </button>
            </div>
        `;

        const categoryTag = card.querySelector('.category-tag');
        if (categoryTag && !transaction.confirmed) {
            categoryTag.addEventListener('click', function(e) {
                console.log('Category tag clicked');
                e.stopPropagation();
                showCategoryDropdown(this, transaction.id);
            });
        }

        container.appendChild(card);
    });
}

function updateLastUpdatedDate() {
    const lastUpdatedElement = document.getElementById('lastUpdatedDate');
    if (lastUpdatedElement) {
        firebase.database().ref('lastUpdated').once('value')
            .then((snapshot) => {
                lastUpdatedElement.textContent = snapshot.val() || 'Never';
            });
    }
}

function initializeMonthDropdown() {
    const monthOptions = document.getElementById('monthOptions');
    if (!monthOptions) return;

    const months = new Set();
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                       'July', 'August', 'September', 'October', 'November', 'December'];
    
    months.add('All Months');

    transactions.forEach(transaction => {
        const dateParts = transaction.Date.split('/');
        if (dateParts.length === 3) {
            const monthIndex = parseInt(dateParts[0]) - 1;
            const year = '20' + dateParts[2];
            const monthYear = `${monthNames[monthIndex]}, ${year}`;
            months.add(monthYear);
        }
    });

    monthOptions.innerHTML = '';
    Array.from(months).forEach(month => {
        monthOptions.innerHTML += `<div data-value="${month}">${month}</div>`;
    });

    const selectedElement = document.getElementById('selectedMonth');
    if (selectedElement) {
        selectedElement.addEventListener('click', function() {
            monthOptions.classList.toggle('show');
        });

        document.addEventListener('click', function(e) {
            if (!e.target.closest('.custom-select')) {
                monthOptions.classList.remove('show');
            }
        });

        monthOptions.querySelectorAll('div').forEach(option => {
            option.addEventListener('click', function() {
                selectedElement.textContent = this.textContent;
                monthOptions.classList.remove('show');
                filterByMonth();
            });
        });
    }
}

function filterByMonth() {
    const selectedMonth = document.getElementById('selectedMonth').textContent;
    
    if (selectedMonth === 'All Months') {
        displayTransactions(transactions);
        return;
    }

    const [monthName, year] = selectedMonth.split(', ');
    const monthIndex = ['January', 'February', 'March', 'April', 'May', 'June', 
                       'July', 'August', 'September', 'October', 'November', 'December']
                       .indexOf(monthName) + 1;
    
    const filteredTransactions = transactions.filter(transaction => {
        const [month, , transactionYear] = transaction.Date.split('/');
        return parseInt(month) === monthIndex && '20' + transactionYear === year;
    });

    displayTransactions(filteredTransactions);
}

function toggleConfirm(event, transactionId, button) {
    event.stopPropagation();
    
    const transaction = transactions.find(t => t.id === transactionId);
    if (transaction) {
        transaction.confirmed = !transaction.confirmed;
        
        const card = button.closest('.transaction-card');
        const categoryTag = card.querySelector('.category-tag');
        
        button.textContent = transaction.confirmed ? 'Unconfirm' : 'Confirm';
        button.classList.toggle('confirmed', transaction.confirmed);
        card.classList.toggle('confirmed', transaction.confirmed);
        categoryTag.classList.toggle('confirmed', transaction.confirmed);
        
        if (!transaction.confirmed) {
            categoryTag.addEventListener('click', function(e) {
                e.stopPropagation();
                showCategoryDropdown(this, transaction.id);
            });
        }
        
        saveTransactionsToFirebase(transactions);
    }
}

function showCategoryDropdown(tagElement, transactionId) {
    console.log('showCategoryDropdown called');
    
    const existingDropdown = document.querySelector('.category-dropdown');
    if (existingDropdown && existingDropdown.dataset.forTag === tagElement.dataset.id) {
        existingDropdown.remove();
        return;
    }
    
    document.querySelectorAll('.category-dropdown').forEach(d => d.remove());

    const dropdown = document.createElement('div');
    dropdown.className = 'category-dropdown show';
    dropdown.dataset.forTag = tagElement.dataset.id;
    dropdown.style.position = 'absolute';
    dropdown.style.backgroundColor = 'white';
    dropdown.style.border = '1px solid #ddd';
    dropdown.style.borderRadius = '6px';
    dropdown.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
    dropdown.style.zIndex = '1000';
    dropdown.style.minWidth = '200px';
    
    categoriesRef.once('value')
        .then((snapshot) => {
            console.log('Loading categories for dropdown');
            const categories = snapshot.val() || defaultCategories;
            
            // Flatten all subcategories into a single array
            const allSubcategories = categories.reduce((acc, category) => {
                return acc.concat(category.subcategories.map(sub => ({
                    ...sub,
                    parentCategory: category.name
                })));
            }, []);
            
            // Sort subcategories alphabetically
            allSubcategories.sort((a, b) => a.name.localeCompare(b.name));
            
            allSubcategories.forEach(sub => {
                const subDiv = document.createElement('div');
                subDiv.className = 'category-option';
                subDiv.style.padding = '8px 16px';
                subDiv.style.cursor = 'pointer';
                subDiv.textContent = sub.name;
                
                subDiv.addEventListener('click', (e) => {
                    e.stopPropagation();
                    selectCategory(transactionId, sub.name, tagElement);
                    dropdown.remove();
                });
                
                subDiv.addEventListener('mouseover', () => {
                    subDiv.style.backgroundColor = '#f5f5f5';
                });
                
                subDiv.addEventListener('mouseout', () => {
                    subDiv.style.backgroundColor = 'transparent';
                });
                
                dropdown.appendChild(subDiv);
            });

            const rect = tagElement.getBoundingClientRect();
            dropdown.style.top = rect.bottom + window.scrollY + 4 + 'px';
            dropdown.style.left = rect.left + window.scrollX + 'px';
            
            document.body.appendChild(dropdown);
        })
        .catch(error => {
            console.error('Error loading categories for dropdown:', error);
        });

    document.addEventListener('click', function closeDropdown(e) {
        if (!e.target.closest('.category-dropdown') && !e.target.closest('.category-tag')) {
            dropdown.remove();
            document.removeEventListener('click', closeDropdown);
        }
    });
}

function selectCategory(transactionId, categoryName, tagElement) {
    const transaction = transactions.find(t => t.id === transactionId);
    if (transaction) {
        transaction.Category = categoryName;
        saveTransactionsToFirebase(transactions);
        tagElement.textContent = categoryName;
    }
    
    const dropdown = document.querySelector('.category-dropdown');
    if (dropdown) {
        dropdown.remove();
    }
}

function convertDate(dateString) {
    const [month, day, year] = dateString.split('/');
    return `20${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function generateCategoryOptions() {
    let options = '';
    categories.forEach(category => {
        options += `<div class="category-option parent">${category.name}</div>`;
        
        category.subcategories.forEach(sub => {
            options += `<div class="category-option sub">${sub.name}</div>`;
        });
    });
    return options;
}

function showEditPanel(transaction) {
    const editPanel = document.querySelector('.edit-panel');
    const editPanelContent = document.querySelector('.edit-panel-content');
    
    editPanelContent.innerHTML = '';
    
    const dateParts = transaction.Date.split('/');
    const date = new Date(2000 + parseInt(dateParts[2]), parseInt(dateParts[0]) - 1, parseInt(dateParts[1]));
    const formattedDate = date.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    });

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
                <div class="select-selected">${transaction.Category || 'Select Category'}</div>
                <div class="select-items">
                    ${generateCategoryOptions()}
                </div>
            </div>

            <div id="btmButtons">
                <button id="closePanelButton">Close</button>
                <button id="saveChangesButton">Save Changes</button>
            </div>
        </div>
    `;

    const closeButton = document.getElementById('closePanelButton');
    const saveButton = document.getElementById('saveChangesButton');
    const newCloseButton = closeButton.cloneNode(true);
    const newSaveButton = saveButton.cloneNode(true);
    closeButton.parentNode.replaceChild(newCloseButton, closeButton);
    saveButton.parentNode.replaceChild(newSaveButton, saveButton);

    newCloseButton.addEventListener('click', closeEditPanel);
    newSaveButton.addEventListener('click', () => saveChanges(transaction.id));

    initializeEditPanelCategorySelector(transaction.id);

    editPanel.classList.add('open');
}

function initializeEditPanelCategorySelector(transactionId) {
    const selectSelected = document.querySelector('.select-selected');
    const selectItems = document.querySelector('.select-items');

    selectSelected.addEventListener('click', function(e) {
        e.stopPropagation();
        selectItems.classList.toggle('show');
    });

    document.addEventListener('click', function(e) {
        if (!e.target.closest('.select-selected')) {
            selectItems.classList.remove('show');
        }
    });
}

function closeEditPanel() {
    const editPanel = document.querySelector('.edit-panel');
    const editPanelContent = document.querySelector('.edit-panel-content');
    
    editPanel.classList.remove('open');
    
    setTimeout(() => {
        editPanelContent.innerHTML = '';
    }, 300);
}

function saveTransaction(transactionId) {
    const transaction = transactions.find(t => t.id === transactionId);
    if (!transaction) return;

    transaction.Description = document.getElementById('editDescription').value;
    
    saveTransactionsToFirebase(transactions)
        .then(() => {
            displayTransactions(transactions);
            closeEditPanel();
        });
}

function saveTransactionsToFirebase(transactions) {
    console.log('Starting Firebase save operation');
    return transactionsRef.set(transactions)
        .then(() => {
            console.log('Transactions saved successfully');
            const now = new Date().toLocaleDateString();
            console.log('Updating last updated date:', now);
            return transactionsRef.parent.child('lastUpdated').set(now);
        })
        .catch((error) => {
            console.error('Error saving transactions:', error);
            throw error; // Re-throw to handle in calling function
        });
}

function initializeRealtimeUpdates() {
    transactionsRef.on('value', (snapshot) => {
        if (snapshot.exists()) {
            transactions = snapshot.val();
            displayTransactions(transactions);
            initializeMonthDropdown();
        }
    });

    firebase.database().ref('lastUpdated').on('value', (snapshot) => {
        if (snapshot.exists()) {
            const lastUpdatedElement = document.getElementById('lastUpdatedDate');
            if (lastUpdatedElement) {
                lastUpdatedElement.textContent = snapshot.val();
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded');
    
    // Get the file input element
    const fileInput = document.getElementById('csvFileInput');
    if (fileInput) {
        console.log('Found file input element');
        fileInput.addEventListener('change', handleFileUpload);
    } else {
        console.error('Could not find file input element with id "csvFileInput"');
    }
    
    initializeRealtimeUpdates();
});