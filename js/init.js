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
   console.log("Firebase Initialized");
   
    // Global variables
let transactions = [];
let editingCategory = null;
let categoryToDelete = null;

// Reference to the database
const database = firebase.database();
const transactionsRef = database.ref('transactions');
const categoriesRef = database.ref('categories');

document.addEventListener('DOMContentLoaded', () => {
    firebase.auth().onAuthStateChanged((user) => {
      if (user) {
        console.log('User is logged in:', user);
        // Redirect to dashboard or display logged-in UI
        if (window.location.pathname === '/login.html' || window.location.pathname === '/signup.html') {
          window.location.href = '/dashboard.html'; // Redirect if already logged in
        }
      } else {
        console.log('No user is logged in');
        // Redirect to login if on a restricted page
        if (window.location.pathname === '/dashboard.html') {
          window.location.href = '/login.html'; // Redirect to login if not logged in
        }
      }
    });
  });


// Initial categories setup
const defaultCategories = [
    {
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
    },
    {
        id: 2,
        name: "Housing",
        subcategories: [
            { id: 21, name: "Rent/Mortgage", amount: 0 },
            { id: 22, name: "Utilities", amount: 0 },
            { id: 23, name: "Insurance", amount: 0 }
        ]
    },
    {
        id: 3,
        name: "Transportation",
        subcategories: [
            { id: 31, name: "Car Payment", amount: 0 },
            { id: 32, name: "Gas", amount: 0 },
            { id: 33, name: "Maintenance", amount: 0 }
        ]
    },
    {
        id: 4,
        name: "Food",
        subcategories: [
            { id: 41, name: "Groceries", amount: 0 },
            { id: 42, name: "Restaurants", amount: 0 }
        ]
    }
];

// Check if categories exist in Firebase
categoriesRef.once('value', (snapshot) => {
    console.log('Checking for existing categories');
    if (!snapshot.exists()) {
        console.log('No categories found, setting up defaults');
        saveCategoriesToFirebase(defaultCategories)
            .then(() => {
                console.log('Default categories saved successfully');
            })
            .catch(error => {
                console.error('Error saving default categories:', error);
            });
    } else {
        console.log('Categories already exist:', snapshot.val());
    }
});

// Modified loadCategories function to return a Promise
function loadCategories() {
    return categoriesRef.once('value')
        .then((snapshot) => {
            if (snapshot.exists()) {
                return snapshot.val();
            } else {
                console.log('No categories found in Firebase.');
                return defaultCategories;
            }
        });
}

// New function to load transactions
function loadTransactions() {
    console.log('Loading transactions from Firebase...');
    return transactionsRef.once('value')
        .then((snapshot) => {
            if (snapshot.exists()) {
                transactions = snapshot.val();
                console.log('Transactions loaded', transactions); // Log loaded transactions
                return transactions; // Ensure this returns the transactions
            } else {
                transactions = [];
                console.log('No transactions found.'); // Log if no transactions are found
                return transactions; // Ensure this returns an empty array
            }
        })
        .catch((error) => {
            console.error('Error loading transactions:', error); // Log any errors
            throw error; // Rethrow the error to be caught in the calling function
        });
}

// New function to save transactions
function saveTransactionsToFirebase(transactions) {
    return transactionsRef.set(transactions)
        .then(() => {
            console.log('Transactions saved successfully.');
        })
        .catch((error) => {
            console.error('Error saving transactions:', error);
        });
}



function initMonthDropdown() {
    const monthOptions = document.getElementById('monthOptions');
    if (!monthOptions) {
        console.error('Month options element not found.');
        return;
    }

    const months = new Set();
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                       'July', 'August', 'September', 'October', 'November', 'December'];
    
    months.add('All Months');
    console.log('Initialized month set with default value.');

    // Ensure transactions are available
    if (!Array.isArray(transactions) || transactions.length === 0) {
        console.warn('No transactions available to populate month dropdown.');
        return; // Exit if no transactions
    }

   

    transactions.forEach(transaction => {
        
        const dateParts = transaction.Date.split('/');
        if (dateParts.length === 3) {
            const monthIndex = parseInt(dateParts[0]) - 1;
            const year = '20' + dateParts[2];
            const monthYear = `${monthNames[monthIndex]}, ${year}`;
            months.add(monthYear);
            console.log(`Added month/year: ${monthYear}`);
        } else {
            console.warn('Invalid date format for transaction:', transaction.Date);
        }
    });

    monthOptions.innerHTML = '';
    console.log('Cleared existing month options.');

    Array.from(months).forEach(month => {
        monthOptions.innerHTML += `<div data-value="${month}">${month}</div>`;
        console.log(`Added month option to dropdown: ${month}`);
    });

    const selectedElement = document.getElementById('selectedMonth');
    if (!monthOptions) {
        console.error('Month options element not found.');
        return;
    }
    if (selectedElement) {
        selectedElement.addEventListener('click', function() {
            
            if (!monthOptions.classList.contains('show')) {
                console.log('Contains SHOW');
                monthOptions.classList.remove('show');
            } else {
                console.log('Doesnt contain SHOW');
                
                monthOptions.classList.add('show');
            }
            
        });



        monthOptions.querySelectorAll('div').forEach(option => {
            option.addEventListener('click', function() {
                selectedElement.textContent = this.textContent;
                monthOptions.classList.remove('show');
                filterByMonth();
                console.log(`Selected month: ${this.textContent}`);
            });
        });
    } else {
        console.error('Selected month element not found.');
    }
}



// Modified initializePage function
function initializePage() {
    const currentPage = window.location.pathname;
    console.log('Current Page:', currentPage); // Log the current page

    if (currentPage.includes('transactions.html')) {
        console.log('Initializing transactions page...'); // Log when initializing transactions
        console.log('About to load transactions...'); // Log before loading transactions
        loadTransactions().then(() => {
            console.log('Transactions loaded successfully.'); // Log after transactions are loaded
            // displayTransactions(transactions);
            
            initMonthDropdown(); // Ensure this line is present and correctly placed
            updateLastUpdatedDate();
        }).catch(error => {
            console.error('Error loading transactions:', error); // Log any errors
        });
    } else if (currentPage.includes('budget.html')) {
        console.log('Initializing budget page...'); // Log when initializing budget
        loadCategories().then((categories) => {
            displayCategories(categories);
        });
    }
}

// Function to save categories
function saveCategoriesToFirebase(categories) {
    categoriesRef.set(categories, (error) => {
        if (error) {
            console.error('Error saving categories:', error);
        } else {
            console.log('Categories saved successfully.');
        }
    });
}

// Add this function to generate IDs for existing categories
function ensureCategoryIds() {
    categories.forEach(category => {
        if (!category.id) {
            category.id = Date.now() + Math.random().toString(36).substr(2, 9);
        }
        
        category.subcategories.forEach(sub => {
            if (!sub.id) {
                sub.id = Date.now() + Math.random().toString(36).substr(2, 9);
            }
        });
    });
    
    // Save the updated categories
    saveCategoriesToFirebase(categories);
}

// Initialize when the page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePage);
} else {
    initializePage();
}

function displayTransactions(transactions) {
    // Implementation to display transactions
    console.log('Displaying transactions:', transactions); // Log the transactions being displayed
}




function updateLastUpdatedDate() {
    // Implementation to update last updated date
    console.log('Initializing transactions page 03...'); // Log when initializing transactions
}

function displayCategories(categories) {
    // Implementation to display categories
}

// Add initialization function
function initializeCategories() {
    console.log('Initializing categories...');
    categoriesRef.once('value')
        .then((snapshot) => {
            if (!snapshot.exists()) {
                console.log('No categories found, setting up default categories');
                return saveCategoriesToFirebase(defaultCategories);
            } else {
                console.log('Categories exist, checking for defaults...');
                let existingCategories = snapshot.val();
                
                // Convert to array if it's not already
                if (!Array.isArray(existingCategories)) {
                    existingCategories = Object.values(existingCategories);
                }

                // Get existing category names
                const existingNames = existingCategories.map(cat => cat.name);
                
                // Find default categories that don't exist yet
                const missingDefaults = defaultCategories.filter(defaultCat => 
                    !existingNames.includes(defaultCat.name)
                );

                if (missingDefaults.length > 0) {
                    console.log('Adding missing default categories:', missingDefaults);
                    const updatedCategories = [...existingCategories, ...missingDefaults];
                    return saveCategoriesToFirebase(updatedCategories);
                }
                
                return existingCategories;
            }
        })
        .then((categories) => {
            console.log('Categories after initialization:', categories);
            displayCategories();
        })
        .catch(error => {
            console.error('Error initializing categories:', error);
        });
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded - Init.js');
    initializeCategories();
    
    // Set up realtime listener for updates
    categoriesRef.on('value', (snapshot) => {
        if (snapshot.exists()) {
            categories = snapshot.val();
            displayCategories();
        }
    });
});
  

// Select the logout button
const logoutButton = document.getElementById('logout-button');
  
// Add click event listener to the logout button
logoutButton.addEventListener('click', () => {
  console.log('Logout Clicked');
  firebase.auth().signOut().then(() => {
    console.log('User logged out successfully.');
    // Redirect to the login page or show a message
    window.location.href = 'login.html'; // Adjust the path as needed
  }).catch((error) => {
    console.error('Error during logout:', error);
  });
});

firebase.auth().onAuthStateChanged((user) => {
  if (!user) {
    // If no user is logged in, redirect to login page
    window.location.href = 'login.html'; // Adjust path as necessary
  }
});