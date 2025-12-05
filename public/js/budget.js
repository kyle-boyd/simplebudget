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



function showAddCategoryModal(type, parentId = null) {
    const modal = document.getElementById('categoryModal');
    const modalTitle = document.getElementById('modalTitle');
    const deleteButton = document.getElementById('deleteButton');
    const amountGroup = document.getElementById('amountGroup');
    const errorMessage = document.getElementById('categoryNameError');
    
    modal.style.display = 'block';
    modalTitle.textContent = type === 'parent' ? 'Add Category' : 'Add Sub-Category';
    
    // Clear previous values
    document.getElementById('categoryName').value = '';
    document.getElementById('categoryAmount').value = '';
    
    // Clear any error messages
    if (errorMessage) {
        errorMessage.style.display = 'none';
        errorMessage.textContent = '';
    }
    
    // Hide delete button for new categories
    deleteButton.style.display = 'none';
    // Reset delete confirmation state
    const deleteConfirmation = document.getElementById('deleteConfirmation');
    if (deleteConfirmation) {
        deleteConfirmation.classList.remove('show');
    }
    
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
    const errorMessage = document.getElementById('categoryNameError');
    
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
    
    // Reset delete confirmation state
    const deleteConfirmation = document.getElementById('deleteConfirmation');
    deleteConfirmation.classList.remove('show');
    
    // Clear any error messages
    if (errorMessage) {
        errorMessage.style.display = 'none';
        errorMessage.textContent = '';
    }
    
    // Show amount field only for subcategories
    amountGroup.style.display = isSubcategory ? 'block' : 'none';
    
    // Set the input values
    document.getElementById('categoryName').value = category.name;
    if (isSubcategory) {
        document.getElementById('categoryAmount').value = category.amount || '';
    }
    
    // Store category info for delete operation
    deleteButton.onclick = () => showDeleteConfirmation(categoryId, isSubcategory);
    
    // Set up confirmation buttons
    const deleteCancelBtn = document.getElementById('deleteCancelBtn');
    const deleteYesBtn = document.getElementById('deleteYesBtn');
    
    deleteCancelBtn.onclick = () => {
        deleteConfirmation.classList.remove('show');
        deleteButton.style.display = 'block';
    };
    
    deleteYesBtn.onclick = () => confirmDeleteInline(categoryId, isSubcategory);
}

function showDeleteConfirmation(categoryId, isSubcategory) {
    const category = isSubcategory ? 
        categories.find(cat => cat.subcategories.some(sub => sub.id === categoryId)) :
        categories.find(cat => cat.id === categoryId);

    // Prevent deletion of system categories
    if (category && category.isSystem) {
        console.log('Cannot delete system category');
        return;
    }

    const deleteButton = document.getElementById('deleteButton');
    const deleteConfirmation = document.getElementById('deleteConfirmation');
    
    // Hide delete button and show confirmation
    deleteButton.style.display = 'none';
    deleteConfirmation.classList.add('show');
}

function confirmDeleteInline(categoryId, isSubcategory) {
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
            // Close modal
            closeModal();
            // Refresh the display
            displayCategories();
        })
        .catch(error => {
            console.error('Error deleting category:', error);
        });
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
    const errorMessage = document.getElementById('categoryNameError');
    
    modal.style.display = 'none';
    editingCategory = null;
    
    // Clear any error messages
    if (errorMessage) {
        errorMessage.style.display = 'none';
        errorMessage.textContent = '';
    }
    
    // Reset delete confirmation state (hide confirmation, but don't change delete button visibility)
    const deleteConfirmation = document.getElementById('deleteConfirmation');
    if (deleteConfirmation) {
        deleteConfirmation.classList.remove('show');
    }
}

function saveCategory() {
    const modal = document.getElementById('categoryModal');
    const nameInput = document.getElementById('categoryName');
    const amountInput = document.getElementById('categoryAmount');
    const errorMessage = document.getElementById('categoryNameError');
    const type = modal.dataset.type;
    
    const name = nameInput.value.trim();
    const amount = amountInput.value ? parseFloat(amountInput.value) : 0;
    
    // Hide any previous error messages
    if (errorMessage) {
        errorMessage.style.display = 'none';
        errorMessage.textContent = '';
    }
    
    if (!name) {
        if (errorMessage) {
            errorMessage.textContent = 'Category name cannot be empty';
            errorMessage.style.display = 'block';
        }
        console.log('Category name cannot be empty');
        return;
    }

    // Check for duplicate names
    let isDuplicate = false;
    let duplicateMessage = '';

    if (editingCategory) {
        // Editing existing category
        if (type === 'parent') {
            // Check if another parent category (excluding the one being edited) has the same name
            const duplicate = categories.find(c => 
                c.id !== editingCategory.id && 
                c.name.toLowerCase() === name.toLowerCase()
            );
            if (duplicate) {
                isDuplicate = true;
                duplicateMessage = 'A category with this name already exists';
            }
        } else {
            // Check if another subcategory in ANY parent (excluding the one being edited) has the same name
            for (const parent of categories) {
                const duplicate = parent.subcategories.find(s => 
                    s.id !== editingCategory.id && 
                    s.name.toLowerCase() === name.toLowerCase()
                );
                if (duplicate) {
                    isDuplicate = true;
                    duplicateMessage = 'A subcategory with this name already exists';
                    break;
                }
            }
        }
    } else {
        // Creating new category
        if (type === 'parent') {
            // Check if a parent category with the same name already exists
            const duplicate = categories.find(c => 
                c.name.toLowerCase() === name.toLowerCase()
            );
            if (duplicate) {
                isDuplicate = true;
                duplicateMessage = 'A category with this name already exists';
            }
        } else {
            // Check if a subcategory with the same name already exists in ANY parent
            for (const parent of categories) {
                const duplicate = parent.subcategories.find(s => 
                    s.name.toLowerCase() === name.toLowerCase()
                );
                if (duplicate) {
                    isDuplicate = true;
                    duplicateMessage = 'A subcategory with this name already exists';
                    break;
                }
            }
        }
    }

    // If duplicate found, show error and prevent saving
    if (isDuplicate) {
        if (errorMessage) {
            errorMessage.textContent = duplicateMessage;
            errorMessage.style.display = 'block';
        }
        console.log(duplicateMessage);
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


