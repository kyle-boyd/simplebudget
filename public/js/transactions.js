function handleFileUpload(event) {
    console.log('File upload started');
    const file = event.target.files[0];
    if (!file) {
        console.log('No file selected');
        return;
    }
    console.log('File selected:', file.name);
    const csvColumns = ['Date', 'Amount', 'Description']; // Example CSV columns
    const platformColumns = ['Transaction Date', 'Transaction Amount', 'Transaction Description']; // Example platform columns
    openColumnMappingModal(csvColumns, platformColumns, file); // Pass the file to the modal
    
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

function openColumnMappingModal(csvColumns, platformColumns, file) {
    const mappingContainer = document.getElementById('mappingContainer');
    mappingContainer.innerHTML = ''; // Clear previous mappings

    // Parse the file to get the headers
    Papa.parse(file, {
        header: true,
        complete: function(results) {
            const availableFields = Object.keys(results.data[0]); // Get all available fields from the CSV

            // Create mapping for required categories
            const requiredCategories = ['Date', 'Amount', 'Description', 'Category']; // Added 'Category'

            requiredCategories.forEach(category => {
                const mappingRow = document.createElement('div');
                mappingRow.className = 'mapping-row';

                const categoryLabel = document.createElement('label');
                categoryLabel.textContent = `${category}:`;
                mappingRow.appendChild(categoryLabel);

                const select = document.createElement('select');
                availableFields.forEach(field => {
                    const option = document.createElement('option');
                    option.value = field;
                    option.textContent = field;
                    select.appendChild(option);
                });

                mappingRow.appendChild(select);
                mappingContainer.appendChild(mappingRow);
            });

            document.getElementById('columnMappingModal').style.display = 'block';

            // Add a save button to validate mappings
            const saveButton = document.getElementById('saveMappingButton');
            saveButton.onclick = () => {
                const mappings = {};
                const mappingRows = document.querySelectorAll('.mapping-row');

                mappingRows.forEach(row => {
                    const category = row.querySelector('label').textContent.replace(':', '');
                    const selectedField = row.querySelector('select').value;
                    mappings[category] = selectedField; // Store mapping as category: selectedField
                });

                // Validate required fields
                const requiredFields = ['Date', 'Amount', 'Category']; // Ensure Category is included
                const hasRequiredFields = requiredFields.every(field => mappings[field]);

                if (!hasRequiredFields) {
                    alert('Please ensure that Date, Amount, and Category fields are mapped.');
                    return;
                }

                console.log('Column Mappings:', mappings);
                // Proceed with parsing the file and processing transactions
                parseCSVFile(file, mappings);
                closeColumnMappingModal();
            };
        },
        error: function(error) {
            console.error('Error parsing file:', error);
        }
    });
}

function parseCSVFile(file, mappings) {
    Papa.parse(file, {
        header: true,
        complete: function(results) {
            // Map the results to rename fields based on mappings
            const mappedResults = results.data.map(transaction => {
                const newTransaction = {};
                for (const category in mappings) {
                    const csvField = mappings[category]; // Get the selected CSV field for the category
                    newTransaction[category] = transaction[csvField]; // Map the CSV field to the category
                }
                return newTransaction;
            });

            // Filter out transactions missing required fields
            const newTransactions = mappedResults
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
}

function closeColumnMappingModal() {
    document.getElementById('columnMappingModal').style.display = 'none';
}

document.getElementById('saveMappingButton').addEventListener('click', () => {
    const mappings = [];
    const mappingRows = document.querySelectorAll('.mapping-row');

    mappingRows.forEach(row => {
        const csvColumn = row.querySelector('label').textContent.replace('CSV Column: ', '');
        const platformColumn = row.querySelector('select').value;
        mappings.push({ csvColumn, platformColumn });
    });

    console.log('Column Mappings:', mappings);
    closeColumnMappingModal();
});




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



function updateLastUpdatedDate() {
    const lastUpdatedElement = document.getElementById('lastUpdatedDate');
    if (lastUpdatedElement) {
        firebase.database().ref('lastUpdated').once('value')
            .then((snapshot) => {
                lastUpdatedElement.textContent = snapshot.val() || 'Never';
            });
    }
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

            // Sort categories alphabetically by name
            categories.sort((a, b) => a.name.localeCompare(b.name));

            categories.forEach(category => {
                // Add parent category header (not selectable)
                const parentDiv = document.createElement('div');
                parentDiv.className = 'category-parent';
                parentDiv.style.padding = '8px 16px 4px 16px';
                parentDiv.style.fontWeight = 'bold';
                parentDiv.style.fontSize = '12px';
                parentDiv.style.color = 'var(--text-weak)';
                parentDiv.style.textTransform = 'uppercase';
                parentDiv.style.letterSpacing = '0.5px';
                parentDiv.style.borderBottom = '1px solid var(--stroke-weak)';
                parentDiv.style.marginBottom = '4px';
                parentDiv.style.pointerEvents = 'none'; // Make it not clickable
                parentDiv.textContent = category.name;

                dropdown.appendChild(parentDiv);

                // Sort subcategories alphabetically
                const sortedSubcategories = [...category.subcategories].sort((a, b) => a.name.localeCompare(b.name));

                // Add subcategories
                sortedSubcategories.forEach(sub => {
                    const subDiv = document.createElement('div');
                    subDiv.className = 'category-option';
                    subDiv.style.padding = '6px 16px 6px 24px'; // Indent subcategories
                    subDiv.style.cursor = 'pointer';
                    subDiv.style.fontSize = 'var(--font-size-small)';
                    subDiv.textContent = sub.name;

                    subDiv.addEventListener('click', (e) => {
                        e.stopPropagation();
                        selectCategory(transactionId, sub.name, tagElement);
                        dropdown.remove();
                    });

                    subDiv.addEventListener('mouseover', () => {
                        subDiv.style.backgroundColor = 'var(--fill-hover)';
                    });

                    subDiv.addEventListener('mouseout', () => {
                        subDiv.style.backgroundColor = 'transparent';
                    });

                    dropdown.appendChild(subDiv);
                });
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

function showEditPanel(transactions) {
    const editPanel = document.querySelector('.edit-panel');
    const editPanelContent = document.querySelector('.edit-panel-content');

    editPanelContent.innerHTML = ''; // Clear previous content

    console.log('Showing Edit Panel for Transactions:', transactions); // Log transactions being shown

    if (transactions.length > 1) {
        // If multiple transactions are selected
        editPanelContent.innerHTML = `
            <h2 id="editDescription">Multiple Transactions</h2>
            <p>Please edit the selected transactions as needed.</p>
        `;
    } else {
        // If only one transaction is selected
        const transaction = transactions[0];
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
            <h2 id="editDescription">${transaction.Description}</h2>
            <span id="editDate">${formattedDate}</span>
            <span id="editAmount" class="${amount >= 0 ? 'positive' : ''}">${formattedAmount}</span>
        `;
    }

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
    console.log('Initializing real-time updates...');

    // Ensure transactionsRef is defined before using it
    if (!transactionsRef) {
        console.error('transactionsRef is not defined. Cannot initialize real-time updates.');
        return; // Exit if transactionsRef is not defined
    }

    transactionsRef.on('value', (snapshot) => {
        if (snapshot.exists()) {
            transactions = snapshot.val();
            console.log('Transactions updated:', transactions);
            // Call any function to update the UI or process transactions
            displayTransactions(transactions); // Example function to display transactions
        } else {
            console.log('No transactions found.');
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

    // Add event listeners to individual transaction checkboxes
    const transactionCheckboxes = document.querySelectorAll('.transaction-checkbox');
    console.log('Transaction Checkboxes Found:', transactionCheckboxes.length); // Log the number of checkboxes found
    transactionCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', updateEditPanel);
        console.log('Added change event listener to checkbox with ID:', checkbox.dataset.transactionId); // Log each checkbox ID
    });

    // Add an event listener to the select all checkbox
    document.getElementById('selectAllCheckbox').addEventListener('change', function() {
        const checkboxes = document.querySelectorAll('.transaction-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = this.checked;
            // Trigger change event to update the edit panel
            checkbox.dispatchEvent(new Event('change'));
        });
    });
});

// Function to update the edit panel based on selected transactions
function updateEditPanel() {
    const selectedTransactions = Array.from(transactionCheckboxes)
        .filter(checkbox => checkbox.checked)
        .map(checkbox => {
            const transactionId = checkbox.dataset.transactionId; // Assuming each checkbox has a data attribute for transaction ID
            const transaction = transactions.find(t => t.id === transactionId);
            console.log(`Checkbox for transaction ID ${transactionId} is checked:`, transaction); // Log each checked transaction
            return transaction;
        });

    console.log('Selected Transactions:', selectedTransactions); // Log selected transactions

    if (selectedTransactions.length > 0) {
        showEditPanel(selectedTransactions); // Pass the array of selected transactions
    } else {
        closeEditPanel(); // Close the panel if no transactions are selected
    }
}

