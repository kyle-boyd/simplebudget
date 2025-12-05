const firebaseConfig = {
    apiKey: "AIzaSyDT5QAzYQat7X_GFLbqh2d18dfYGzkwb98",
    authDomain: "simple-budgeting-5f9cb.firebaseapp.com",
    projectId: "simple-budgeting-5f9cb",
    storageBucket: "simple-budgeting-5f9cb.firebasestorage.app",
    messagingSenderId: "4204953002",
    appId: "1:4204953002:web:b57ab7d41c7abd23587fd3",
    measurementId: "G-K969YZNXGC"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.database();


// Global variables
let transactionsRef;
let categoriesRef;
let transactions = [];
let editingCategory = null;
let categoryToDelete = null;

// Default categories
const defaultCategories = [
    { id: 1, name: "Hide from Budget", isSystem: true, subcategories: [{ id: 11, name: "Hide from Budget", isSystem: true, amount: 0 }] },
    { id: 2, name: "Housing", subcategories: [{ id: 21, name: "Rent/Mortgage", amount: 0 }, { id: 22, name: "Utilities", amount: 0 }, { id: 23, name: "Insurance", amount: 0 }] },
    { id: 3, name: "Transportation", subcategories: [{ id: 31, name: "Car Payment", amount: 0 }, { id: 32, name: "Gas", amount: 0 }, { id: 33, name: "Maintenance", amount: 0 }] },
    { id: 4, name: "Food", subcategories: [{ id: 41, name: "Groceries", amount: 0 }, { id: 42, name: "Restaurants", amount: 0 }] }
];

// Firebase Authentication state change
firebase.auth().onAuthStateChanged((user) => {
    
    if (user) {
        const userUID = user.uid;
        
        
        // Define references after confirming user is logged in
        transactionsRef = db.ref(`users/${userUID}/transactions`);
        categoriesRef = db.ref(`users/${userUID}/categories`);

        

        
        


    } else {
        console.log("No user is logged in.");
        redirectToLoginIfNeeded();
    }
});

// Event listener for DOM content load
document.addEventListener('DOMContentLoaded', () => {
    // Set sticky positioning immediately
    updateStickyPositioning();
    
    // Update on window resize
    window.addEventListener('resize', updateStickyPositioning);
    
    // Other initialization logic can go here

    // Initialize Firebase Authentication state
    firebase.auth().onAuthStateChanged((user) => {
        if (user) {
            
            // User is logged in, initialize dashboard
            initializePage();
            checkCategoriesExistence();
            
            initializeCategories();
            
            // Set sticky positioning again after content loads
            setTimeout(updateStickyPositioning, 200);

            const dashPage = ['/dashboard.html'];
                if (dashPage.includes(window.location.pathname)) {
                    initializeCategories();
                    
                    initializeDashboard();
                }
            
            
        } else {
            // User is not logged in, handle accordingly
            
            redirectToLoginIfNeeded();
            
        }
    });
});

// Function to update sticky positioning based on top-controls height
function updateStickyPositioning() {
    // Only run on transactions page
    if (!document.querySelector('.top-controls')) {
        return;
    }
    
    requestAnimationFrame(() => {
        const topControls = document.querySelector('.top-controls');
        
        if (topControls) {
            const topControlsHeight = topControls.offsetHeight;
            // Set CSS variable on document root for use in CSS
            document.documentElement.style.setProperty('--top-controls-height', `${topControlsHeight}px`);
            
            console.log('Sticky positioning updated:', topControlsHeight);
        }
    });
}


// Redirect to login if needed
function redirectToLoginIfNeeded() {
    const restrictedPages = ['/dashboard.html'];
    if (restrictedPages.includes(window.location.pathname)) {
        window.location.href = '/login.html';
    }
}

// Save data to Firebase
function saveTransactionsToFirebase(transactions) {
    return transactionsRef.set(transactions)
        .then(() => console.log('Transactions saved successfully.'))
        .catch((error) => console.error('Error saving transactions:', error));
}

function saveCategoriesToFirebase(categories) {
    console.log('[saveCategoriestoFirebase');
    return categoriesRef.set(categories)
        .then(() => console.log('Categories saved successfully.'))
        .catch((error) => console.error('Error saving categories:', error));
}

// Load data from Firebase
function loadTransactions() {
    return transactionsRef.once('value')
        .then((snapshot) => snapshot.exists() ? snapshot.val() : [])
        
        .catch((error) => console.error('Error loading transactions:', error));
}

function loadCategories() {
    
    return categoriesRef.once('value')
        .then((snapshot) => snapshot.exists() ? snapshot.val() : [])
        .catch((error) => console.error('Error loading categories:', error));
}

// Initialize categories
function initializeCategories() {
    
    // console.log('All categories:', categories);

    categoriesRef.once('value')
        .then((snapshot) => {
            if (!snapshot.exists()) {
                console.log('No categories found, setting up default categories');
                return saveCategoriesToFirebase(defaultCategories);
            } else {
                
                categories = snapshot.val(); // Ensure categories are set from Firebase
                
                displayCategories();
            }
        })
       
        .catch(error => {
            console.error('Error initializing categories:', error);
        });
}

function displayCategories() {
    
    const container = document.getElementById('categoriesList');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Add new category button at the top
    const newCategoryBtn = document.createElement('button');
    newCategoryBtn.className = 'new-category-btn';
    newCategoryBtn.innerHTML = '<span class="plus-icon">+</span>New Category';
    newCategoryBtn.onclick = () => showAddCategoryModal('parent');
    container.appendChild(newCategoryBtn);
    
    // Ensure categories is an array
    if (!Array.isArray(categories)) {
        categories = Object.values(categories);
    }
    
    console.log('All categories:', categories);
    
    // Separate system category from regular categories
    const regularCategories = categories.filter(cat => !cat.isSystem);
    const systemCategory = categories.find(cat => cat.isSystem);
    
    console.log('Regular categories:', regularCategories);
    console.log('System category:', systemCategory);

    // Display regular categories first
    regularCategories.forEach(category => {
        const totalAmount = (category.subcategories || [])
            .reduce((sum, sub) => sum + (sub.amount || 0), 0);
        const formattedAmount = formatCurrency(totalAmount);
        
        const categoryCard = document.createElement('div');
        categoryCard.className = 'category-card expanded';
        
        categoryCard.innerHTML = `
            <div class="category-header">
                <button class="accordion-button expanded">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M6 12L10 8L6 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
                <div class="category-name">${category.name}</div>
                <div class="category-amount">${formattedAmount}</div>
                ${category.isSystem ? '' : `<button class="edit-button" onclick="showEditModal(${category.id}, false)">Edit</button>`}
            </div>
            <div class="subcategories-list">
                ${(category.subcategories || []).map(sub => `
                    <div class="subcategory-item">
                        <div class="subcategory-name">${sub.name}</div>
                        <div class="category-amount">${formatCurrency(sub.amount || 0)}</div>
                        ${sub.isSystem ? '' : `<button class="edit-button" onclick="showEditModal(${sub.id}, true)">Edit</button>`}
                    </div>
                `).join('')}
                <button class="new-subcategory-btn" onclick="showAddCategoryModal('sub', ${category.id})">
                    <span class="plus-icon">+</span>
                    New Sub-Category
                </button>
            </div>
        `;
        
        // Add accordion functionality
        const accordionBtn = categoryCard.querySelector('.accordion-button');
        accordionBtn.addEventListener('click', () => {
            categoryCard.classList.toggle('expanded');
            accordionBtn.classList.toggle('expanded');
        });
        
        container.appendChild(categoryCard);
    });

    // Display system category last
    if (systemCategory) {
        const categoryCard = document.createElement('div');
        categoryCard.className = 'category-card expanded';
        
        categoryCard.innerHTML = `
            <div class="category-header">
                <button class="accordion-button expanded">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M6 12L10 8L6 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
                <div class="category-name">${systemCategory.name}</div>
                <div class="category-amount"></div>
            </div>
            <div class="subcategories-list">
                ${(systemCategory.subcategories || []).map(sub => `
                    <div class="subcategory-item">
                        <div class="subcategory-name">${sub.name}</div>
                        <div class="category-amount"></div>
                        ${sub.isSystem ? '' : `<button class="edit-button" onclick="showEditModal(${sub.id}, true)">Edit</button>`}
                    </div>
                `).join('')}
                <button class="new-subcategory-btn" onclick="showAddCategoryModal('sub', ${systemCategory.id})">
                    <span class="plus-icon">+</span>
                    New Sub-Category
                </button>
            </div>
        `;
        
        // Add accordion functionality
        const accordionBtn = categoryCard.querySelector('.accordion-button');
        accordionBtn.addEventListener('click', () => {
            categoryCard.classList.toggle('expanded');
            accordionBtn.classList.toggle('expanded');
        });
        
        container.appendChild(categoryCard);
    } else {
        console.log('System category not found, adding it...');
        // Add the system category if it's missing
        const newSystemCategory = {
            id: 1,
            name: "Hide from Budget",
            isSystem: true,
            subcategories: [
                { 
                    id: 11, 
                    name: "Hide from Budget",
                    isSystem: true,
                    amount: 0 
                }
            ]
        };
        
        categories.push(newSystemCategory);
        saveCategoriesToFirebase(categories)
            .then(() => {
                console.log('System category added successfully');
                displayCategories();  // Refresh the display
            })
            .catch(error => {
                console.error('Error adding system category:', error);
            });
    }
    
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

       

        // Check against subcategories instead of categories
        const isValidCategory = categories.some(category => 
            category.subcategories && category.subcategories.some(sub => sub.name === transaction.Category)
        );
        const invalidClass = isValidCategory ? '' : 'invalid'; // Add 'invalid' class if category is not valid
        
        const card = document.createElement('div');
        card.className = `transaction-card ${transaction.confirmed ? 'confirmed' : ''}`;
        card.setAttribute('data-id', transaction.id);
        
        card.addEventListener('click', (e) => {
            
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
        
        // Create a checkbox for each transaction
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'transactionCheckbox'; // Add a class for easy selection
        checkbox.id = `transactionCheckbox-${transaction.id}`; // Unique ID for each checkbox
        checkbox.dataset.transactionId = transaction.id; // Store the transaction ID
        
        // Append checkbox to label
        label.appendChild(checkbox);
        label.className = 'custom-checkbox'; // Add a class for styling

        // Add content to the card
        
        card.innerHTML = `
            <div class="transaction-content">
                ${label.outerHTML} <!-- Include the checkbox label -->
                <div class="transaction-date">${formattedDate}</div>
                <div class="transaction-name">${transaction.Description}</div>
                <div class="transaction-amount ${amountClass}">${formattedAmount}</div>
                <div class="category-select ${invalidClass}">
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
                
                e.stopPropagation();
                showCategoryDropdown(this, transaction.id);
            });
        }

        container.appendChild(card);
    });

        // Add event listener for the "Select All" checkbox
        const selectAllCheckbox = document.getElementById('selectAllCheckbox');
        selectAllCheckbox.addEventListener('change', function() {
            console.log('Select All checkbox changed:', this.checked); // Log the state of the Select All checkbox
            const checkboxes = document.querySelectorAll('.transactionCheckbox');
            checkboxes.forEach(checkbox => {
                checkbox.checked = this.checked; // Set each checkbox to the state of the "Select All" checkbox
                console.log(`Checkbox for transaction ID ${checkbox.dataset.transactionId} set to: ${checkbox.checked}`); // Log each checkbox state
            });
        });
    
}



// Page initialization
function initializePage() {
    
    
    const currentPage = window.location.pathname;
    

    

    loadCategories() // Ensure categories are loaded before transactions
        .then(() => {
            return loadTransactions(); // Load transactions after categories
        })
        .then((loadedTransactions) => {
            transactions = loadedTransactions;
            displayTransactions(transactions);
            // Call the function to initialize the dropdown
            initMonthDropdown();
            // Update sticky positioning after content is loaded
            setTimeout(updateStickyPositioning, 100);
        })
        .catch(error => {
            console.error('Error initializing page:', error);
        });
}

// Month dropdown initialization
function initMonthDropdown() {
    console.log('initMonthDropdown called');

    // Verify if the elements are being selected correctly
    const monthOptions = document.getElementById('monthOptions');
    const selectedElement = document.getElementById('selectedMonth');

    console.log('Month dropdown elements found:', !!monthOptions, !!selectedElement);

    if (!monthOptions) {
        console.error('monthOptions element not found');
    } else {
        console.log('monthOptions found');
    }

    

    // If either element is not found, exit the function
    if (!monthOptions || !selectedElement) {
        return;
    }

    const months = new Set(['All Months']);
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

   

    transactions.forEach(({ Date }) => {
        const [month, , year] = Date.split('/');
        if (month && year) { // Ensure month and year are valid
            months.add(`${monthNames[parseInt(month) - 1]}, 20${year}`);
        } else {
            console.warn("Invalid date format:", Date);
        }
    });

    

    monthOptions.innerHTML = Array.from(months).map((month) => `<div data-value="${month}">${month}</div>`).join('');
    
    

    // Ensure the dropdown is shown/hidden correctly
    selectedElement.addEventListener('click', () => {
        
        monthOptions.classList.toggle('show'); // Toggle dropdown visibility
    });

    monthOptions.querySelectorAll('div').forEach((option) => {

        option.addEventListener('click', () => {

            selectedElement.textContent = option.textContent; // Update selected month
            monthOptions.classList.remove('show'); // Hide dropdown after selection
            console.log('Month selected:', option.textContent);
            console.log('Selected element text:', selectedElement.textContent);

            // Call updateCharts directly instead of filterByMonth for dashboard
            const currentPage = window.location.pathname;
            console.log('Page path:', currentPage);
            if (currentPage.includes('dashboard.html')) {
                console.log('On dashboard page, calling updateCharts()');
                updateCharts();
            } else {
                console.log('Not on dashboard page, calling filterByMonth()');
                filterByMonth();
            }
        });
    });

    
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

    // Ensure the year is in the correct format (two digits to four digits)
    const formattedYear = year.slice(-2); // Get the last two digits of the year

    const filteredTransactions = transactions.filter(transaction => {
        const [month, day, transactionYear] = transaction.Date.split('/');
        // Ensure month and year are parsed correctly
        return parseInt(month) === monthIndex && transactionYear === formattedYear; // Compare directly
    });

    displayTransactions(filteredTransactions);
}



// Logout functionality
const logoutButton = document.getElementById('logout-button');
if (logoutButton) {
    logoutButton.addEventListener('click', () => {
        firebase.auth().signOut().then(() => {
            
            window.location.href = '/login.html';
        }).catch((error) => console.error('Error logging out:', error));
    });
}

function checkCategoriesExistence() {
    
    
    if (categoriesRef) {
        
        categoriesRef.once('value', (snapshot) => {
            
            if (!snapshot.exists()) {
                
                saveCategoriesToFirebase(defaultCategories)
                    .then(() => {
                        
                    })
                    .catch(error => {
                        console.error('Error saving default categories:', error);
                    });
            } else {
                
            }
        });
    } else {
        console.log('No categoriess');
    }
}

// Run immediately when script loads (for cases where DOMContentLoaded already fired)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateStickyPositioning);
} else {
    // DOM is already loaded, run immediately
    updateStickyPositioning();
}

// Also run after a short delay to catch any dynamic content
setTimeout(updateStickyPositioning, 100);
setTimeout(updateStickyPositioning, 500);

