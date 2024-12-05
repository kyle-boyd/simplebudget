const multer = require('multer');
const fs = require('fs');
const path = require('path');
const csv = require('fast-csv');

// Setup multer for file upload
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const express = require('express');
const router = express.Router();

// Temporary in-memory budget data
let budgets = [];

const analyzeTransactions = (transactions) => {
    let budgetData = {};

    transactions.forEach(transaction => {
        const { category, amount } = transaction;
        if (!budgetData[category]) {
            budgetData[category] = { amount: 0, transactions: [] };
        }
        budgetData[category].amount += parseFloat(amount);
        budgetData[category].transactions.push(transaction);
    });

    return Object.entries(budgetData).map(([category, data]) => ({
        category,
        amount: data.amount,
        transactions: data.transactions,
    }));
};

// Handle CSV file upload
router.post('/upload', upload.single('csvFile'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }

    const transactions = [];
    fs.createReadStream(req.file.buffer)
        .pipe(csv.parse({ headers: true, skipEmptyLines: true }))
        .on('data', (row) => {
            transactions.push(row); // Assuming row has category and amount fields
        })
        .on('end', () => {
            // Once parsing is done, analyze the transactions and create a budget
            budgets = analyzeTransactions(transactions);
            
            // Save the budget as a CSV
            saveBudgetToCSV(budgets);
            
            res.status(200).json({ message: 'CSV file uploaded and budget created' });
        })
        .on('error', (err) => {
            res.status(500).json({ message: 'Error parsing CSV', error: err });
        });
});

// Function to save the budget to a CSV file on the local machine
const saveBudgetToCSV = (budget) => {
    const filePath = path.join(__dirname, 'budget.csv');
    
    const writeStream = fs.createWriteStream(filePath);
    const csvStream = csv.format({ headers: true });

    csvStream.pipe(writeStream);
    
    // Writing the budget data to CSV
    budget.forEach((category) => {
        category.transactions.forEach((transaction) => {
            csvStream.write({
                category: category.category,
                amount: category.amount,
                ...transaction, // Include transaction details if needed
            });
        });
    });
    
    csvStream.end();
};

// Route to download the saved budget CSV
router.get('/download', (req, res) => {
    const filePath = path.join(__dirname, 'budget.csv');
    
    res.download(filePath, 'budget.csv', (err) => {
        if (err) {
            res.status(500).send('Error downloading the file');
        }
    });
});

module.exports = router;
