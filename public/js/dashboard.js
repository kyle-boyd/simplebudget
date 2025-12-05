// Define token colors using RGB values
const COLORS = {
    primary: 'var(--fill-strong)',      // --fill-strong
    secondary: 'var(--background-sunken)',    // --fill-weak (using solid color instead of transparent)
    expense: 'var(--fill-strong)',      // --text-critical
    income: 'rgb(0, 168, 107)',         // --text-success
    border: 'rgb(241, 241, 241)',       // --stroke-weak
    text: 'rgb(33, 33, 33)',           // --text-strong
    background: 'rgb(255, 255, 255)',    // --background-base
    overBudget: 'var(--fill-error-strong)',

  
};

// Create a new COLORS_RGBA object
const COLORS_RGBA = {
    primary: getRgbaColor(COLORS.primary),
    secondary: getRgbaColor(COLORS.secondary),
    expense: getRgbaColor(COLORS.expense),
    income: 'rgba(0, 168, 107, 1)', // Already in RGB format
    border: 'rgba(241, 241, 241, 1)', // Already in RGB format
    text: 'rgba(33, 33, 33, 1)', // Already in RGB format
    background: 'rgba(255, 255, 255, 1)', // Already in RGB format
    overBudget: getRgbaColor(COLORS.overBudget)
};



// dashboard.js

// Define global variables
// transactions = snapshot.val(); // Use the global `transactions` variable
// let categories = [];
// let transactionsRef; // Firebase reference for transactions
// let categoriesRef; // Firebase reference for categories

// Chart variables
let mainSpendingChart;
let TransactionStatusDonutChart;
let yearlyBudgetChart;
let overBudgetChart;

let isDashboardInitialized = false; // Flag to track initialization

// Function to initialize the dashboard
function initializeDashboard() {
    console.log('initializeDashboard called');
    if (isDashboardInitialized) {
        console.log('Dashboard is already initialized.');
        return; // Exit if already initialized
    }

    // Ensure Firebase references are defined
    if (!transactionsRef || !categoriesRef) {
        console.error('Required Firebase references are missing.');
        return; // Exit if references are missing
    }

    console.log('Loading transactions from Firebase...');
    transactionsRef.once('value')
        .then((snapshot) => {
            console.log('Transactions snapshot received, exists:', snapshot.exists());
            if (snapshot.exists()) {
                transactions = snapshot.val(); // Ensure transactions are assigned here
                console.log('Transactions loaded:', transactions.length, 'transactions');

                // Proceed with processing transactions
                displayTransactions(transactions);
                console.log('Calling updateCharts after transaction load...');
                updateCharts(); // Call to update charts after loading transactions
            } else {
                console.log('No transactions found.');
            }
        })
        .catch((error) => {
            console.error('Error loading transactions:', error);
        });

    isDashboardInitialized = true; // Set the flag to true after initialization
}

// Function to initialize real-time updates
function initializeRealtimeUpdates() {
    transactionsRef.on('value', (snapshot) => {
        if (snapshot.exists()) {
            transactions = snapshot.val();
            initializeMonthDropdown();
        } else {
            console.log('No transactions available.');
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

// Function to update charts based on the selected month and year
function updateCharts() {
    console.log('updateCharts called');
    console.log('Current transactions count:', transactions ? transactions.length : 'undefined');
    console.log('Categories ref exists:', !!categoriesRef);

    categoriesRef.once('value')
        .then((snapshot) => {
            console.log('Categories snapshot received, exists:', snapshot.exists());
            if (!snapshot.exists()) {
                console.log('No categories found, setting up default categories');
                return saveCategoriesToFirebase(defaultCategories);
            } else {
                categories = snapshot.val(); // Ensure categories are set from Firebase
                console.log('Categories loaded:', categories.length, 'categories');

                if (!Array.isArray(transactions) || transactions.length === 0) {
        console.error('No transactions available to update charts.');
        return;
    }

    const selectedMonthElement = document.getElementById('selectedMonth');
    if (!selectedMonthElement) {
        console.error('Selected month element not found.');
        return;
    }

    const selectedMonthYear = selectedMonthElement.textContent || selectedMonthElement.value;
    console.log('Selected month/year from DOM:', selectedMonthYear);
    if (!selectedMonthYear) {
        console.error('No value in selected month element.');
        return;
    }

    

    const [monthName, year] = selectedMonthYear.split(', ');
    const monthIndex = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December']
                        .indexOf(monthName) + 1;

    console.log('Filtering for month:', monthName, 'index:', monthIndex, 'year:', year);

    const filteredTransactions = transactions.filter((transaction) => {
        // Check if "All Months" is selected
        if (selectedMonthYear === "All Months") {
            return true; // Include all transactions if "All Months" is selected
        }

        // Use the same date filtering logic as filterByMonth() in init.js
        const [month, day, transactionYear] = transaction.Date.split('/');
        // Ensure the year is in the correct format (two digits to four digits)
        const formattedYear = year.slice(-2); // Get the last two digits of the year

        const matches = parseInt(month) === monthIndex && transactionYear === formattedYear;
        if (matches) {
            console.log('Transaction matches:', transaction.Date, transaction.Category, transaction.Amount);
        }
        return matches;
    });

    console.log('Filtered transactions count:', filteredTransactions.length);

    

    // Ensure categories is defined before using it
    if (typeof categories === 'undefined') {
        console.error('Categories is not defined.');
        return;
    }

    

                console.log('Calling chart creation functions...');
                createmainSpending(filteredTransactions, categories);
                createTransactionStatusDonutChart(filteredTransactions, categories);
                createyearlyBudgetChart(transactions, categories);
                createoverBudgetChart(filteredTransactions, categories);
                console.log('Chart update completed');
            }
        })
        .catch((error) => {
            console.error('Error loading categories in updateCharts:', error);
        });
}

// Function to create the main spending chart
function createmainSpending(transactions, categories) {
    const ctx = document.getElementById('mainSpending').getContext('2d');

    if (mainSpendingChart) {
        mainSpendingChart.destroy();
    }

    // Get main categories and their budgets, excluding "Hide from Budget"
    const categoryBudgets = {};
    categories.forEach(cat => {
        if (cat.name !== "Hide from Budget") { // Exclude "Hide from Budget"
            categoryBudgets[cat.name] = cat.subcategories.reduce((sum, sub) => sum + (sub.amount || 0), 0);
        }
    });

    // Calculate totals
    const categoryTotals = {};
    Object.keys(categoryBudgets).forEach(cat => {
        categoryTotals[cat] = 0;
    });
    categoryTotals['Uncategorized'] = 0;

    // Log available categories for debugging
    

    transactions.forEach(transaction => {
        const transactionCategory = transaction.Category ? transaction.Category.trim() : null;

        // Skip transactions that belong to "Hide from Budget"
        if (transactionCategory === "Hide from Budget") {
            return; // Skip this transaction entirely
        }

        // If the transaction category is null or empty, it will be counted as uncategorized
        if (!transactionCategory) {
            categoryTotals['Uncategorized'] += Math.abs(transaction.Amount);
            return;
        }

        // Log the transaction category being checked
        

        // Check if the transaction category matches a main category (including system categories)
        const mainCategory = categories.find(cat => {
            const isMatch = cat.name.trim() === transactionCategory;
            // Log the comparison result
            
            return isMatch;
        });

        if (mainCategory) {
            categoryTotals[mainCategory.name] += Math.abs(transaction.Amount);
            
        } else {
            // If not found in main categories, check subcategories
            const parentCategory = categories.find(cat => 
                cat.subcategories.some(sub => {
                    const isSubMatch = sub.name.trim() === transactionCategory;
                    // Log the comparison result for subcategories
                    
                    return isSubMatch;
                })
            );

            if (parentCategory) {
                categoryTotals[parentCategory.name] += Math.abs(transaction.Amount);
                
            } else {
                // Only count as uncategorized if not "Hide from Budget"
                
                categoryTotals['Uncategorized'] += Math.abs(transaction.Amount);
            }
        }
    });

    // Debugging logs to check category totals


    // Prepare data for the chart, excluding "Hide from Budget"
    const sortedCategories = Object.entries(categoryTotals)
        .filter(([cat]) => cat !== "Hide from Budget") // Ensure "Hide from Budget" is excluded
        .sort(([, a], [, b]) => b - a)
        .sort(([catA], [catB]) => catA === 'Uncategorized' ? 1 : catB === 'Uncategorized' ? -1 : 0);

    // Define a cohesive color palette primarily using charcoal and clay variations
    const COLOR_PALETTE = [
        'hsl(220, 6%, 16%)',  // charcoal-dark (was navy-blue-dark)
        'hsl(8, 73%, 57%)',   // clay-dark
        'hsl(220, 5%, 25%)',  // charcoal-medium (was navy-blue-medium)
        'hsl(8, 60%, 65%)',   // clay-medium
        'hsl(220, 4%, 35%)',  // charcoal-light (was navy-blue-light)
        'hsl(8, 50%, 75%)',   // clay-light
        'hsl(165, 51%, 42%)', // spruce-dark (accent)
        'hsl(42, 92%, 57%)',  // gold-dark (accent)
        'hsl(220, 3%, 45%)',  // charcoal-light-medium (neutral)
        'hsl(165, 40%, 50%)', // spruce-medium
        'hsl(8, 65%, 70%)',   // clay-light-medium
        'hsl(220, 4%, 20%)',  // charcoal-dark-medium (was navy-blue-dark-medium)
        'hsl(42, 85%, 65%)',  // gold-medium
        'hsl(165, 30%, 60%)', // spruce-light
        'hsl(220, 3%, 30%)'   // charcoal-medium-dark
    ];

    const data = {
        labels: sortedCategories.map(([category]) => category),
        datasets: [
            {
                type: 'bar',
                label: 'Actual',
                data: sortedCategories.map(([category]) => categoryTotals[category]),
                backgroundColor: sortedCategories.map((_, index) => {
                    // Cycle through palette colors
                    return COLOR_PALETTE[index % COLOR_PALETTE.length];
                }),
                hoverBackgroundColor: sortedCategories.map((_, index) => {
                    // Use 40% brightness for hover
                    const baseColor = COLOR_PALETTE[index % COLOR_PALETTE.length];
                    // Reduce saturation slightly and set brightness to 40%
                    return baseColor.replace(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/, (match, h, s, l) => {
                        const newSaturation = Math.max(25, parseInt(s) - 15); // Reduce saturation by 15%, minimum 25%
                        return `hsl(${h}, ${newSaturation}%, 40%)`; // Fixed 40% brightness
                    });
                }),
                borderRadius: {
                    topLeft: 20,
                    topRight: 20,
                    bottomLeft: 20,
                    bottomRight: 20
                },
                order: 2,
            },
            {
                type: 'line',
                label: 'Budget',
                data: sortedCategories.map(([category]) => categoryBudgets[category] || 0),
                backgroundColor: 'hsl(220, 6%, 16%)', // charcoal-dark for budget line
                borderColor: 'hsl(220, 6%, 16%)', // charcoal-dark for budget line
                borderWidth: 4,
                pointStyle: 'line',
                pointBorderWidth: 4,
                pointRadius: 20,
                pointRotation: 90,
                showLine: false,
                order: 1
            }
        ]
    };

    mainSpendingChart = new Chart(ctx, {
        type: 'bar',
        data: data,
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.dataset.label || '';
                            const value = context.parsed.x;
                            return `${label}: $${value.toLocaleString()}`;
                        }
                    },
                    titleFont: {
                        family: 'Figtree'
                    },
                    bodyFont: {
                        family: 'Figtree'
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    display: false,
                    grid: {
                        display: false
                    },
                    categoryPercentage: 1,
                    barPercentage: 1,
                    barThickness: 'flex'
                },
                y: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: 'var(--text-strong)', // Use token for color
                        font: {
                            family: 'Figtree',
                            size: 12,
                            weight: 500
                        }
                    },
                    border: {
                        display: false
                    }
                }
            }
        }
    });
}
function createTransactionStatusDonutChart(transactions, budgetCategories) {
    const ctx = document.getElementById('categoryChart').getContext('2d');
    
    // Initialize counts
    let confirmedCount = 0;
    let unconfirmedCount = 0;
    let uncategorizedCount = 0;

    // Create a set of budget category names and subcategory names for easy lookup
    const budgetCategoryNames = new Set();

    budgetCategories.forEach(cat => {
        budgetCategoryNames.add(cat.name); // Add parent category
        cat.subcategories.forEach(sub => {
            budgetCategoryNames.add(sub.name); // Add subcategory
        });
    });

    
    

    // Count transactions by status
    transactions.forEach(transaction => {
        if (!transaction.Category || !budgetCategoryNames.has(transaction.Category)) {
            uncategorizedCount++;
        } else if (transaction.confirmed) {
            confirmedCount++;
        } else {
            unconfirmedCount++;
        }
    });

    const data = {
        labels: ['Confirmed', 'Unconfirmed', 'Uncategorized'],
        datasets: [{
            data: [confirmedCount, unconfirmedCount, uncategorizedCount],
            // Use clay color scheme
            backgroundColor: [
                'hsl(8, 73%, 57%)',   // Confirmed - clay-dark
                'hsl(220, 2%, 75%)',  // Unconfirmed - very light charcoal
                'hsl(8, 50%, 75%)'    // Uncategorized - clay-light
            ],
            hoverBackgroundColor: [
                'hsl(8, 58%, 40%)',   // Confirmed hover - 40% brightness
                'hsl(220, 2%, 40%)',  // Unconfirmed hover - 40% brightness
                'hsl(8, 35%, 40%)'    // Uncategorized hover - 40% brightness
            ],
            borderColor: 'white',
            borderWidth: 5,
            borderRadius: 20
        }]
    };

    // Destroy existing chart if it exists
    if (window.transactionStatusChart) {
        window.transactionStatusChart.destroy();
    }

    // Create a new chart instance
    window.transactionStatusChart = new Chart(ctx, {
        type: 'doughnut',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: {
                    position: 'top'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.raw;
                            return `${label}: ${value}`;
                        }
                    }
                }
            }
        }
    });
}

function createyearlyBudgetChart(transactions, categories) {
    const ctx = document.getElementById('yearlyBudgetChart').getContext('2d');

    if (yearlyBudgetChart) {
        yearlyBudgetChart.destroy();
    }

    // Create a Set of all valid subcategory names
    const validSubcategories = new Set();
    categories.forEach(category => {
        // Skip system categories
        if (!category.isSystem) {
            category.subcategories.forEach(sub => {
                validSubcategories.add(sub.name.trim().toLowerCase());
            });
        }
    });

    console.log('Valid subcategories:', validSubcategories);

    // Initialize monthly spending
    const monthlySpending = Array(12).fill(0);

    // Filter and process transactions
    transactions.forEach((transaction, index) => {
        // Skip transactions without category or date
        if (!transaction.Category || !transaction.Date) {
            console.log(`Skipping transaction ${index + 1}: Missing category/date`);
            return;
        }

        const transactionCategory = transaction.Category.trim().toLowerCase();
        
        // Check if category matches any valid subcategory
        if (!validSubcategories.has(transactionCategory)) {
            console.log(`Skipping transaction ${index + 1}: "${transaction.Category}" not in subcategories`);
            return;
        }

        // Date validation
        const transactionDate = new Date(transaction.Date);
        if (isNaN(transactionDate)) {
            console.error(`Invalid date at index ${index}:`, transaction.Date);
            return;
        }

        // Add to monthly spending
        const month = transactionDate.getMonth();
        monthlySpending[month] += Math.abs(transaction.Amount);
        
        console.log(`Included transaction ${index + 1}:`, {
            Date: transaction.Date,
            ParsedDate: transactionDate.toISOString(),
            Month: month,
            Amount: transaction.Amount,
            Category: transaction.Category,
            Match: true
        });
    });

    // Calculate budgeted amounts
    let totalBudget = 0;
    categories.forEach((category, catIndex) => {
        if (!category.isSystem) {
            category.subcategories.forEach((sub, subIndex) => {
                const amount = sub.amount || 0;
                totalBudget += amount;
                
                console.log(`Category ${catIndex + 1}-${subIndex + 1}:`, {
                    Category: category.name,
                    Subcategory: sub.name,
                    Budget: amount
                });
            });
        }
    });

    console.log('Total calculated budget:', totalBudget);
    console.log('Monthly budget array:', Array(12).fill(totalBudget));

    const data = {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
        datasets: [
            {
                label: 'Actual',
                data: monthlySpending,
                backgroundColor: 'hsl(8, 73%, 57%)', // clay-dark
                hoverBackgroundColor: 'hsl(8, 58%, 40%)', // 40% brightness clay
                borderWidth: 0,
                borderRadius: {
                    topLeft: 20,
                    topRight: 20,
                    bottomLeft: 20,
                    bottomRight: 20
                },
                type: 'bar',
                order: 1,
            },
            {
                label: 'Budget',
                data: Array(12).fill(totalBudget),
                backgroundColor: 'hsl(8, 60%, 65%)', // clay-medium
                borderColor: 'hsl(8, 60%, 65%)', // clay-medium
                borderWidth: 2,
                type: 'line',
                fill: false,
                borderDash: [5, 5],
                pointRadius: 0,
                order: 2
            }
        ]
    };

    console.log('Final chart data:', JSON.parse(JSON.stringify(data)));

    yearlyBudgetChart = new Chart(ctx, {
        type: 'bar',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false // Hide the legend
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    display: false,
                    grid: {
                        display: false
                    },
                    ticks: {
                        callback: value => '$' + value.toLocaleString()
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    categoryPercentage: 1,
                    barPercentage: 1,
                    barThickness: 'flex'
                }
            }
        }
    });
}

function createoverBudgetChart(transactions, categories) {
    console.log('createoverBudgetChart called with', transactions.length, 'transactions');
    const ctx = document.getElementById('overBudgetChart').getContext('2d');

    if (overBudgetChart) {
        overBudgetChart.destroy();
    }

    // Get the selected month/year to calculate period-adjusted budgets
    const selectedMonthElement = document.getElementById('selectedMonth');
    const selectedMonthYear = selectedMonthElement.textContent || selectedMonthElement.value;
    const isAllMonths = selectedMonthYear === "All Months";

    // Calculate period multiplier (12 for annual, 1 for monthly)
    const periodMultiplier = isAllMonths ? 12 : 1;

    // 1. Get all subcategories with their period-adjusted budgets
    const subcategoryBudgets = {};
    categories.forEach(category => {
        if (!category.isSystem) {
            category.subcategories.forEach(sub => {
                subcategoryBudgets[sub.name.trim().toLowerCase()] = (sub.amount || 0) * periodMultiplier;
            });
        }
    });

    // 2. Calculate actual spending per subcategory
    const subcategorySpending = {};
    transactions.forEach(transaction => {
        const subcategory = transaction.Category?.trim().toLowerCase();
        if (subcategory && subcategoryBudgets.hasOwnProperty(subcategory)) {
            const amount = Math.abs(transaction.Amount);
            subcategorySpending[subcategory] = (subcategorySpending[subcategory] || 0) + amount;
        }
    });

    // 3. Calculate over-budget amounts and get top 10
    const overBudgetData = [];
    Object.entries(subcategorySpending).forEach(([subcategory, actual]) => {
        const budget = subcategoryBudgets[subcategory];
        if (actual > budget) {
            overBudgetData.push({
                subcategory: subcategory,
                overAmount: actual - budget,
                actual: actual,
                budget: budget,
                monthlyBudget: budget / periodMultiplier // Store original monthly budget for display
            });
        }
    });

    // 4. Sort and get top 10 over-budget subcategories
    const topOverBudget = overBudgetData
        .sort((a, b) => b.overAmount - a.overAmount)
        .slice(0, 10);

    // Create category-to-color mapping based on main spending chart logic
    // Get main categories and their budget totals (same logic as main spending chart)
    const mainCategoryBudgets = {};
    categories.forEach(cat => {
        if (cat.name !== "Hide from Budget") {
            mainCategoryBudgets[cat.name] = cat.subcategories.reduce((sum, sub) => sum + (sub.amount || 0), 0) * periodMultiplier;
        }
    });
    mainCategoryBudgets['Uncategorized'] = 0;

    // Sort categories the same way as main spending chart (by budget amount)
    const sortedMainCategories = Object.entries(mainCategoryBudgets)
        .filter(([cat]) => cat !== "Hide from Budget")
        .sort(([, a], [, b]) => b - a)
        .sort(([catA], [catB]) => catA === 'Uncategorized' ? 1 : catB === 'Uncategorized' ? -1 : 0);

    // Create color mapping for main categories primarily using charcoal and clay
    const COLOR_PALETTE = [
        'hsl(220, 6%, 16%)',  // charcoal-dark (was navy-blue-dark) (primary)
        'hsl(8, 73%, 57%)',   // clay-dark (primary)
        'hsl(220, 5%, 25%)',  // charcoal-medium (was navy-blue-medium)
        'hsl(8, 60%, 65%)',   // clay-medium
        'hsl(220, 4%, 35%)',  // charcoal-light (was navy-blue-light)
        'hsl(8, 50%, 75%)',   // clay-light
        'hsl(165, 51%, 42%)', // spruce-dark (accent)
        'hsl(42, 92%, 57%)',  // gold-dark (accent)
        'hsl(220, 6%, 16%)',  // charcoal-dark (neutral)
        'hsl(165, 40%, 50%)', // spruce-medium
        'hsl(42, 85%, 65%)',  // gold-medium
        'hsl(220, 5%, 25%)',  // charcoal-medium
        'hsl(165, 30%, 60%)', // spruce-light
        'hsl(42, 78%, 75%)',  // gold-light
        'hsl(220, 4%, 35%)'   // charcoal-light
    ];

    const categoryColorMap = {};
    sortedMainCategories.forEach(([category], index) => {
        categoryColorMap[category] = COLOR_PALETTE[index % COLOR_PALETTE.length];
    });

    // Find parent category for each subcategory and assign color
    const subcategoryColors = topOverBudget.map(item => {
        // Find the parent category for this subcategory
        const parentCategory = categories.find(cat =>
            cat.subcategories.some(sub => sub.name.trim().toLowerCase() === item.subcategory.toLowerCase())
        );

        if (parentCategory) {
            return categoryColorMap[parentCategory.name] || COLOR_PALETTE[0];
        } else {
            // If no parent found, use the first color
            return COLOR_PALETTE[0];
        }
    });

    const data = {
        labels: topOverBudget.map(item =>
            `${item.subcategory.charAt(0).toUpperCase() + item.subcategory.slice(1)}\n($${item.actual.toLocaleString()} vs $${item.monthlyBudget.toLocaleString()}/mo)`
        ),
        datasets: [{
            label: 'Over Budget Amount',
            data: topOverBudget.map(item => item.overAmount),
            backgroundColor: subcategoryColors,
            hoverBackgroundColor: subcategoryColors.map(color => {
                // Use 40% brightness for hover
                return color.replace(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/, (match, h, s, l) => {
                    const newSaturation = Math.max(25, parseInt(s) - 15); // Reduce saturation by 15%, minimum 25%
                    return `hsl(${h}, ${newSaturation}%, 40%)`; // Fixed 40% brightness
                });
            }),
            borderWidth: 0,
            borderRadius: {
                topLeft: 20,
                topRight: 20,
                bottomLeft: 20,
                bottomRight: 20
            }
        }]
    };

    overBudgetChart = new Chart(ctx, {
        type: 'bar',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: (context) => context[0].label.split('\n')[0],
                        label: (context) => [
                            `Actual: $${topOverBudget[context.dataIndex].actual.toLocaleString()}`,
                            `Monthly Budget: $${topOverBudget[context.dataIndex].monthlyBudget.toLocaleString()}`,
                            `Over: $${context.parsed.x.toLocaleString()}`
                        ]
                    },
                    titleFont: {
                        family: 'Figtree'
                    },
                    bodyFont: {
                        family: 'Figtree'
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    display: false,
                    grid: {
                        display: false
                    },
                    categoryPercentage: 1,
                    barPercentage: 1,
                    barThickness: 'flex'
                },
                y: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: 'var(--text-strong)',
                        font: {
                            family: 'Figtree',
                            size: 12,
                            weight: 500
                        }
                    },
                    border: {
                        display: false
                    }
                }
            }
        }
    });
}



// Helper function to convert date format
function convertDate(dateString) {
    const [month, day, year] = dateString.split('/');
    return `20${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

// Initialize dashboard when DOM is loaded
// document.addEventListener('DOMContentLoaded', initializeDashboard); 



///////



// Function to log the computed value of a CSS variable
function logCSSVariable(variableName) {
    // Create a temporary element to access the CSS variable
    const tempElement = document.createElement('div');
    document.body.appendChild(tempElement); // Append to body to access styles

    // Get the computed style of the temporary element
    const computedStyle = getComputedStyle(tempElement);
    
    // Get the value of the CSS variable
    const value = computedStyle.getPropertyValue(variableName).trim();

    // Log the value
   

    // Remove the temporary element
    document.body.removeChild(tempElement);
}

// Log the values of your CSS variables
logCSSVariable('--fill-strong');
logCSSVariable('--background-sunken');
logCSSVariable('--fill-error-strong');


function hslToRgb(h, s, l) {
    let r, g, b;

    if (s === 0) {
        r = g = b = l; // achromatic
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }

    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// Function to convert HSLA to RGBA
function hslaToRgba(h, s, l, a) {
    let r, g, b;

    if (s === 0) {
        r = g = b = l; // achromatic
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }

    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255), a];
}

// Function to get RGBA color from a CSS variable
function getRgbaColor(variable) {
    const color = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
    

    // Check if the color is in HSLA format
    if (color.startsWith('hsl')) {
        // Extract HSL values and convert to RGBA
        const [h, s, l, a] = color.match(/[\d.]+/g).map(Number);
        
        return `rgba(${hslaToRgba(h, s / 100, l / 100, a || 1).join(',')})`; // Assuming full opacity if 'a' is not present
    } 
    // Check if the color is in RGB format
    else if (color.startsWith('rgb')) {
        
        return color.replace('rgb', 'rgba').replace(')', ', 1)'); // Convert to RGBA with full opacity
    }
    
    // If the color is not recognized, return a default color
    
    return 'rgba(0, 0, 0, 0)'; // Default to transparent if not recognized
}



