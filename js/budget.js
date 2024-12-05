let categories = [];

function saveCategoriesToFirebase(categories) {
    return categoriesRef.set(categories)
        .then(() => {
            console.log('Categories saved successfully');
        })
        .catch((error) => {
            console.error('Error saving categories:', error);
        });
}

function displayCategories() {
    console.log('displayCategories called');
    const container = document.getElementById('categoriesList');
    if (!container) return;
    
    container.innerHTML = '';
    
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

    // Add new category button at the bottom
    const newCategoryBtn = document.createElement('button');
    newCategoryBtn.className = 'new-category-btn';
    newCategoryBtn.innerHTML = '<span class="plus-icon">+</span>New Category';
    newCategoryBtn.onclick = () => showAddCategoryModal('parent');
    container.appendChild(newCategoryBtn);
}

function showAddCategoryModal(type, parentId = null) {
    const modal = document.getElementById('categoryModal');
    const modalTitle = document.getElementById('modalTitle');
    const deleteButton = document.getElementById('deleteButton');
    const amountGroup = document.getElementById('amountGroup');
    
    modal.style.display = 'block';
    modalTitle.textContent = type === 'parent' ? 'Add Category' : 'Add Sub-Category';
    
    // Clear previous values
    document.getElementById('categoryName').value = '';
    document.getElementById('categoryAmount').value = '';
    
    // Hide delete button for new categories
    deleteButton.style.display = 'none';
    
    // Show amount field only for subcategories
    amountGroup.style.display = type === 'parent' ? 'none' : 'block';
    
    // Store the type and parentId for use in saveCategory
    modal.dataset.type = type;
    if (parentId) modal.dataset.parentId = parentId;
    
    editingCategory = null;
}

function showEditModal(categoryId, isSubcategory = false) {
    if (!categoryId) {
        console.error('No category ID provided');
        return;
    }

    const modal = document.getElementById('categoryModal');
    const modalTitle = document.getElementById('modalTitle');
    const deleteButton = document.getElementById('deleteButton');
    const amountGroup = document.getElementById('amountGroup');
    
    let category;
    if (isSubcategory) {
        // Find the parent category that contains this subcategory
        for (let parent of categories) {
            const sub = parent.subcategories.find(s => s.id === categoryId);
            if (sub) {
                category = sub;
                modal.dataset.type = 'sub';
                modal.dataset.parentId = parent.id;
                break;
            }
        }
    } else {
        category = categories.find(c => c.id === categoryId);
        modal.dataset.type = 'parent';
    }
    
    if (!category) {
        console.error('Category not found:', categoryId);
        return;
    }

    // Prevent editing of system categories
    if (category.isSystem) {
        console.log('Cannot edit system category');
        return;
    }
    
    editingCategory = category;
    modal.dataset.editingId = categoryId;
    
    modal.style.display = 'block';
    modalTitle.textContent = isSubcategory ? 'Edit Sub-Category' : 'Edit Category';
    deleteButton.style.display = 'block';
    
    // Show amount field only for subcategories
    amountGroup.style.display = isSubcategory ? 'block' : 'none';
    
    // Set the input values
    document.getElementById('categoryName').value = category.name;
    if (isSubcategory) {
        document.getElementById('categoryAmount').value = category.amount || '';
    }
    
    // Store category info for delete operation
    deleteButton.onclick = () => showDeleteModal(categoryId, isSubcategory);
}

function showDeleteModal(categoryId, isSubcategory) {
    const category = isSubcategory ? 
        categories.find(cat => cat.subcategories.some(sub => sub.id === categoryId)) :
        categories.find(cat => cat.id === categoryId);

    // Prevent deletion of system categories
    if (category && category.isSystem) {
        console.log('Cannot delete system category');
        return;
    }

    const deleteModal = document.getElementById('deleteModal');
    const warningText = document.getElementById('deleteWarningText');
    
    // Store the category info in the modal's dataset for the confirm action
    deleteModal.dataset.categoryId = categoryId;
    deleteModal.dataset.isSubcategory = isSubcategory;
    
    // Update warning text based on what's being deleted
    if (isSubcategory) {
        const subcategory = categories.find(cat => 
            cat.subcategories.some(sub => sub.id === categoryId)
        )?.subcategories.find(sub => sub.id === categoryId);
        
        warningText.textContent = `Are you sure you want to delete the subcategory "${subcategory?.name}"? This action cannot be undone.`;
    } else {
        const category = categories.find(cat => cat.id === categoryId);
        warningText.textContent = `Are you sure you want to delete the category "${category?.name}" and all its subcategories? This action cannot be undone.`;
    }
    
    // Show the delete modal
    deleteModal.style.display = 'block';
}

function confirmDelete() {
    const deleteModal = document.getElementById('deleteModal');
    const categoryId = parseInt(deleteModal.dataset.categoryId);
    const isSubcategory = deleteModal.dataset.isSubcategory === 'true';
    
    if (isSubcategory) {
        // Delete subcategory
        categories = categories.map(category => ({
            ...category,
            subcategories: category.subcategories.filter(sub => sub.id !== categoryId)
        }));
    } else {
        // Delete entire category
        categories = categories.filter(category => category.id !== categoryId);
    }
    
    // Save to Firebase instead of localStorage
    saveCategoriesToFirebase(categories)
        .then(() => {
            // Close both modals
            closeDeleteModal();
            closeModal();
            // Refresh the display
            displayCategories();
        })
        .catch(error => {
            console.error('Error deleting category:', error);
        });
}

function closeModal() {
    const modal = document.getElementById('categoryModal');
    modal.style.display = 'none';
    editingCategory = null;
}

function saveCategory() {
    const modal = document.getElementById('categoryModal');
    const nameInput = document.getElementById('categoryName');
    const amountInput = document.getElementById('categoryAmount');
    const type = modal.dataset.type;
    
    const name = nameInput.value.trim();
    const amount = amountInput.value ? parseFloat(amountInput.value) : 0;
    
    if (!name) {
        console.log('Category name cannot be empty');
        return;
    }

    if (editingCategory) {
        // Editing existing category
        if (type === 'parent') {
            // Update parent category
            const category = categories.find(c => c.id === editingCategory.id);
            if (category) {
                category.name = name;
            }
        } else {
            // Update subcategory
            const parentId = parseInt(modal.dataset.parentId);
            const parentCategory = categories.find(c => c.id === parentId);
            if (parentCategory) {
                const subcategory = parentCategory.subcategories.find(s => s.id === editingCategory.id);
                if (subcategory) {
                    subcategory.name = name;
                    subcategory.amount = amount;
                }
            }
        }
    } else {
        // Creating new category
        if (type === 'parent') {
            // Add new parent category
            const newCategory = {
                id: Date.now(),
                name: name,
                subcategories: []
            };
            categories.push(newCategory);
        } else {
            // Add new subcategory
            const parentId = parseInt(modal.dataset.parentId);
            const parentCategory = categories.find(c => c.id === parentId);
            if (parentCategory) {
                const newSubcategory = {
                    id: Date.now(),
                    name: name,
                    amount: amount
                };
                parentCategory.subcategories.push(newSubcategory);
            }
        }
    }

    // Save to Firebase instead of localStorage
    saveCategoriesToFirebase(categories)
        .then(() => {
            // Update display
            displayCategories();
            // Close modal
            closeModal();
        })
        .catch(error => {
            console.error('Error saving category:', error);
        });
}

function closeDeleteModal() {
    const deleteModal = document.getElementById('deleteModal');
    deleteModal.style.display = 'none';
}

function initializeRealtimeUpdates() {
    categoriesRef.on('value', (snapshot) => {
        if (snapshot.exists()) {
            categories = snapshot.val();
            displayCategories();
        }
    });
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
                console.log('Categories already exist in Firebase');
            }
        })
        .then(() => {
            displayCategories();
        })
        .catch(error => {
            console.error('Error initializing categories:', error);
        });
}

// Update your DOMContentLoaded listener
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded - Budget.js');
    initializeCategories();
}); 