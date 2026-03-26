let settingsRef;

function showSettingsMessage(elementId, message, isError) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = message;
    el.className = 'settings-saved-msg ' + (isError ? 'error' : 'success');
    el.style.display = 'inline';
    if (!isError) {
        setTimeout(() => { el.style.display = 'none'; }, 3000);
    }
}

function loadSettingsPage() {
    const user = firebase.auth().currentUser;
    if (!user) return;

    document.getElementById('displayNameInput').value = user.displayName || '';
    document.getElementById('emailDisplay').value = user.email || '';

    settingsRef = db.ref(`users/${user.uid}/settings`);
    settingsRef.once('value').then((snapshot) => {
        const settings = snapshot.val() || {};
        if (settings.currency) {
            document.getElementById('currencySelect').value = settings.currency;
        }
        if (settings.dateFormat) {
            document.getElementById('dateFormatSelect').value = settings.dateFormat;
        }
    });
}

// Save preferences
document.getElementById('savePreferencesBtn').addEventListener('click', () => {
    const user = firebase.auth().currentUser;
    if (!user) return;

    const currency = document.getElementById('currencySelect').value;
    const dateFormat = document.getElementById('dateFormatSelect').value;

    const ref = db.ref(`users/${user.uid}/settings`);
    ref.update({ currency, dateFormat })
        .then(() => showSettingsMessage('preferencesSavedMsg', 'Preferences saved', false))
        .catch((err) => showSettingsMessage('preferencesSavedMsg', err.message, true));
});

// Save profile (display name)
document.getElementById('saveProfileBtn').addEventListener('click', () => {
    const user = firebase.auth().currentUser;
    if (!user) return;

    const displayName = document.getElementById('displayNameInput').value.trim();
    if (!displayName) {
        showSettingsMessage('profileSavedMsg', 'Name cannot be empty', true);
        return;
    }

    user.updateProfile({ displayName })
        .then(() => {
            return db.ref(`users/${user.uid}/settings`).update({ displayName });
        })
        .then(() => showSettingsMessage('profileSavedMsg', 'Profile saved', false))
        .catch((err) => showSettingsMessage('profileSavedMsg', err.message, true));
});

// Change password
document.getElementById('changePasswordBtn').addEventListener('click', () => {
    const user = firebase.auth().currentUser;
    if (!user) return;

    const currentPassword = document.getElementById('currentPasswordInput').value;
    const newPassword = document.getElementById('newPasswordInput').value;
    const confirmPassword = document.getElementById('confirmPasswordInput').value;

    if (!currentPassword || !newPassword || !confirmPassword) {
        showSettingsMessage('passwordMsg', 'All password fields are required', true);
        return;
    }
    if (newPassword !== confirmPassword) {
        showSettingsMessage('passwordMsg', 'New passwords do not match', true);
        return;
    }
    if (newPassword.length < 6) {
        showSettingsMessage('passwordMsg', 'Password must be at least 6 characters', true);
        return;
    }

    const credential = firebase.auth.EmailAuthProvider.credential(user.email, currentPassword);
    user.reauthenticateWithCredential(credential)
        .then(() => user.updatePassword(newPassword))
        .then(() => {
            showSettingsMessage('passwordMsg', 'Password changed successfully', false);
            document.getElementById('currentPasswordInput').value = '';
            document.getElementById('newPasswordInput').value = '';
            document.getElementById('confirmPasswordInput').value = '';
        })
        .catch((err) => {
            if (err.code === 'auth/wrong-password') {
                showSettingsMessage('passwordMsg', 'Current password is incorrect', true);
            } else {
                showSettingsMessage('passwordMsg', err.message, true);
            }
        });
});

// Delete account -- open modal
document.getElementById('deleteAccountBtn').addEventListener('click', () => {
    document.getElementById('deleteAccountModal').style.display = 'block';
    document.getElementById('deleteConfirmPassword').value = '';
    document.getElementById('deleteAccountMsg').style.display = 'none';
});

document.getElementById('cancelDeleteBtn').addEventListener('click', () => {
    document.getElementById('deleteAccountModal').style.display = 'none';
});

document.getElementById('confirmDeleteAccountBtn').addEventListener('click', () => {
    const user = firebase.auth().currentUser;
    if (!user) return;

    const password = document.getElementById('deleteConfirmPassword').value;
    if (!password) {
        showSettingsMessage('deleteAccountMsg', 'Password is required to delete your account', true);
        return;
    }

    const credential = firebase.auth.EmailAuthProvider.credential(user.email, password);
    user.reauthenticateWithCredential(credential)
        .then(() => {
            return db.ref(`users/${user.uid}`).remove();
        })
        .then(() => {
            return user.delete();
        })
        .then(() => {
            window.location.href = '/login.html';
        })
        .catch((err) => {
            if (err.code === 'auth/wrong-password') {
                showSettingsMessage('deleteAccountMsg', 'Incorrect password', true);
            } else {
                showSettingsMessage('deleteAccountMsg', err.message, true);
            }
        });
});

// Close modal on outside click
document.getElementById('deleteAccountModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('deleteAccountModal')) {
        document.getElementById('deleteAccountModal').style.display = 'none';
    }
});

// Load settings once auth is ready
firebase.auth().onAuthStateChanged((user) => {
    if (user && window.location.pathname.includes('settings.html')) {
        loadSettingsPage();
    }
});
