// Initialize Firebase and export common references
const database = firebase.database();
const categoriesRef = database.ref('categories');
const transactionsRef = database.ref('transactions'); 