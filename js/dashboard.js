// Define token colors using RGB values
const COLORS = {
    primary: 'var(--fill-strong)',      // --fill-strong
    secondary: 'var(--background-sunken)',    // --fill-weak (using solid color instead of transparent)
    expense: 'var(--fill-strong)',      // --text-critical
    income: 'rgb(0, 168, 107)',         // --text-success
    border: 'rgb(241, 241, 241)',       // --stroke-weak
    text: 'rgb(33, 33, 33)',           // --text-strong
    background: 'rgb(255, 255, 255)',    // --background-base
    overBudget: 'var(--fill-error-strong)'
};

function initializeDashboard() {
    console.log('Initializing dashboard...');
    
    // Load transactions from Firebase
    transactionsRef.once('value')
        .then((snapshot) => {
            const transactions = snapshot.val() || {};
            // Convert to array if it's an object
            const transactionsArray = Object.values(transactions);
            console.log('Loaded transactions:', transactionsArray.length);
            
            // Load categories to use in charts
            return categoriesRef.once('value')
                .then((categorySnapshot) => {
                    const categories = categorySnapshot.val() || defaultCategories;
                    console.log('Loaded categories:', categories.length);
                    
                    // Create all charts once data is loaded
                    createCategoryPieChart(transactionsArray, categories);
                    createTransactionStatusDonutChart(transactionsArray);
                    createBudgetComparisonChart(transactionsArray, categories);
                    createTopSpendingChart(transactionsArray);
                    createMonthlySpendingChart(transactionsArray);
                });
        })
        .catch(error => {
            console.error('Error loading data for dashboard:', error);
        });
}

function createCategoryPieChart(transactions, categories) {
    const ctx = document.getElementById('categoryPieChart').getContext('2d');
    
    // Get main categories and their budgets (excluding system category)
    const categoryBudgets = {};
    categories
        .filter(cat => !cat.isSystem)  // Filter out system category
        .forEach(cat => {
            // Sum up all subcategory budgets for each main category
            categoryBudgets[cat.name] = cat.subcategories.reduce((sum, sub) => sum + (sub.amount || 0), 0);
        });
    
    // Initialize totals for each main category
    const categoryTotals = {};
    Object.keys(categoryBudgets).forEach(cat => {
        categoryTotals[cat] = 0;
    });
    categoryTotals['Uncategorized'] = 0;  // Add uncategorized category
    categoryBudgets['Uncategorized'] = 0;  // No budget for uncategorized

    // Calculate totals (excluding transactions in system category)
    transactions.forEach(transaction => {
        if (!transaction.Category) {
            categoryTotals['Uncategorized'] += Math.abs(transaction.Amount);
            return;
        }

        // Find the parent category for this transaction
        const parentCategory = categories.find(cat => 
            !cat.isSystem && // Exclude system category
            cat.subcategories.some(sub => sub.name === transaction.Category)
        );

        if (parentCategory) {
            categoryTotals[parentCategory.name] = (categoryTotals[parentCategory.name] || 0) + 
                Math.abs(transaction.Amount);
        } else {
            categoryTotals['Uncategorized'] += Math.abs(transaction.Amount);
        }
    });

    // Convert to arrays and sort by amount, placing 'Uncategorized' at the end
    const sortedCategories = Object.entries(categoryTotals)
        .sort(([, a], [, b]) => b - a) // Sort by amount descending
        .sort(([catA], [catB]) => catA === 'Uncategorized' ? 1 : catB === 'Uncategorized' ? -1 : 0); // Move 'Uncategorized' to the bottom

    const data = {
        labels: sortedCategories.map(([category]) => category),
        datasets: [
            {
                // Actual spending bars
                type: 'bar',
                label: 'Actual',
                data: sortedCategories.map(([category]) => categoryTotals[category]),
                backgroundColor: ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEEAD'],
                borderColor: COLORS.border,
                borderWidth: 1,
                order: 2
            },
            {
                // Budget markers
                type: 'line',
                label: 'Budget',
                data: sortedCategories.map(([category]) => categoryBudgets[category] || 0),
                backgroundColor: COLORS.expense,
                borderColor: COLORS.expense,
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

    new Chart(ctx, {
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
                    display: false,  // Hides the entire x axis
                    grid: {
                        display: false  // Hides grid lines
                    }
                },
                y: {
                    grid: {
                        display: false  // Hides grid lines
                    },
                    ticks: {
                        color: COLORS.text,
                        font: {
                            family: 'Figtree',
                            size: 12,
                            weight: 500
                        }
                    },
                    border: {
                        display: false  // Removes the y-axis line
                    }
                }
            }
        }
    });
}

function createTransactionStatusDonutChart(transactions) {
    const ctx = document.getElementById('spendingTrendChart').getContext('2d');
    
    // Initialize counts
    let confirmedCount = 0;
    let unconfirmedCount = 0;
    let uncategorizedCount = 0;

    // Count transactions by status
    transactions.forEach(transaction => {
        if (!transaction.Category) {
            uncategorizedCount++;
        } else if (transaction.Confirmed) {
            confirmedCount++;
        } else {
            unconfirmedCount++;
        }
    });

    const data = {
        labels: ['Confirmed', 'Unconfirmed', 'Uncategorized'],
        datasets: [{
            data: [confirmedCount, unconfirmedCount, uncategorizedCount],
            backgroundColor: [COLORS.primary, COLORS.secondary, COLORS.overBudget],
            borderColor: COLORS.border,
            borderWidth: 1
        }]
    };

    new Chart(ctx, {
        type: 'doughnut',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
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

function createBudgetComparisonChart(transactions, categories) {
    const ctx = document.getElementById('budgetComparisonChart').getContext('2d');
    
    // Calculate actual spending by category
    const actualSpending = {};
    transactions.forEach(transaction => {
        if (transaction.Category) {
            actualSpending[transaction.Category] = (actualSpending[transaction.Category] || 0) + Math.abs(transaction.Amount);
        }
    });

    // Get budgeted amounts from categories
    const budgetedAmounts = {};
    categories.forEach(category => {
        category.subcategories.forEach(sub => {
            budgetedAmounts[sub.name] = sub.amount || 0;
        });
    });

    const data = {
        labels: Object.keys(budgetedAmounts),
        datasets: [
            {
                label: 'Budget',
                data: Object.values(budgetedAmounts),
                backgroundColor: '#36A2EB'
            },
            {
                label: 'Actual',
                data: Object.keys(budgetedAmounts).map(category => actualSpending[category] || 0),
                backgroundColor: '#FF6384'
            }
        ]
    };

    new Chart(ctx, {
        type: 'bar',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: value => '$' + value.toLocaleString()
                    }
                }
            }
        }
    });
}

function createTopSpendingChart(transactions) {
    const ctx = document.getElementById('topSpendingChart').getContext('2d');
    
    // Group transactions by description
    const spendingByDescription = {};
    transactions.forEach(transaction => {
        if (transaction.Amount < 0) { // Only consider expenses
            const amount = Math.abs(transaction.Amount);
            spendingByDescription[transaction.Description] = (spendingByDescription[transaction.Description] || 0) + amount;
        }
    });

    // Sort and get top 5
    const topSpending = Object.entries(spendingByDescription)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5);

    const data = {
        labels: topSpending.map(([desc]) => desc),
        datasets: [{
            label: 'Amount',
            data: topSpending.map(([,amount]) => amount),
            backgroundColor: '#4BC0C0'
        }]
    };

    new Chart(ctx, {
        type: 'bar',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y', // Makes it a horizontal bar chart
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        callback: value => '$' + value.toLocaleString()
                    }
                }
            }
        }
    });
}

function createMonthlySpendingChart(transactions) {
    const ctx = document.getElementById('monthlySpendingChart').getContext('2d');

    // Initialize an array for monthly totals
    const monthlyTotals = Array(12).fill(0); // For each month of the year

    // Calculate totals for each month in 2024
    transactions.forEach(transaction => {
        const transactionDate = new Date(transaction.Date); // Assuming transaction.Date is in a valid date format
        if (transactionDate.getFullYear() === 2024) {
            const month = transactionDate.getMonth(); // Get month (0-11)
            monthlyTotals[month] += Math.abs(transaction.Amount); // Sum the amounts
        }
    });

    const data = {
        labels: [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ],
        datasets: [{
            label: 'Total Monthly Spending for 2024',
            data: monthlyTotals,
            backgroundColor: COLORS.primary,
            borderColor: COLORS.border,
            borderWidth: 1
        }]
    };

    new Chart(ctx, {
        type: 'bar',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: value => '$' + value.toLocaleString() // Format y-axis ticks
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
document.addEventListener('DOMContentLoaded', initializeDashboard); 