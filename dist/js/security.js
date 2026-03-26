// Map Firebase Auth error codes to user-friendly messages (including mobile/network)
const AUTH_ERROR_MESSAGES = {
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/user-disabled': 'This account has been disabled. Contact support if you need help.',
  'auth/user-not-found': 'No account found with this email. Check the address or sign up.',
  'auth/wrong-password': 'Incorrect password. Try again or use "Forgot password" if available.',
  'auth/invalid-credential': 'Invalid email or password. Please try again.',
  'auth/email-already-in-use': 'This email is already registered. Try logging in instead.',
  'auth/weak-password': 'Please choose a stronger password (at least 6 characters).',
  'auth/operation-not-allowed': 'This sign-in method is not enabled. Try email/password.',
  'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
  'auth/network-request-failed': 'Connection failed. Check your network and try again.',
  'auth/popup-closed-by-user': 'Sign-in was cancelled.',
  'auth/cancelled-popup-request': 'Sign-in was cancelled.',
  'auth/popup-blocked': 'Popup was blocked. Allow popups for this site or use email/password.',
  'auth/requires-recent-login': 'Please log in again to continue.'
};

function getAuthErrorMessage(error) {
  const code = error && error.code;
  return AUTH_ERROR_MESSAGES[code] || (error && error.message) || 'Something went wrong. Please try again.';
}

function showAuthError(containerId, message) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.textContent = message;
  el.setAttribute('role', 'alert');
  el.classList.add('auth-error-visible');
  el.hidden = false;
}

function clearAuthError(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.textContent = '';
  el.classList.remove('auth-error-visible');
  el.hidden = true;
}

function setAuthLoading(buttonEl, loading) {
  if (!buttonEl) return;
  buttonEl.disabled = loading;
  buttonEl.setAttribute('aria-busy', loading ? 'true' : 'false');
  const label = buttonEl.querySelector('.auth-btn-label');
  const spinner = buttonEl.querySelector('.auth-btn-spinner');
  if (label) label.textContent = loading ? (buttonEl.dataset.loadingText || 'Please wait...') : (buttonEl.dataset.defaultText || 'Submit');
  if (spinner) spinner.classList.toggle('auth-btn-spinner-visible', loading);
}

// Monitor Authentication State
firebase.auth().onAuthStateChanged((user) => {
  const authContainer = document.getElementById('auth-container');
  const signupForm = document.getElementById('signup-form');
  const loginForm = document.getElementById('login-form');
  const logoutButton = document.getElementById('logout-button');

  if (user) {
    authContainer.style.display = 'block';
    signupForm.style.display = 'none';
    loginForm.style.display = 'none';
    logoutButton.style.display = 'inline-block';
  } else {
    authContainer.style.display = 'block';
    signupForm.style.display = 'none';
    loginForm.style.display = 'block';
    logoutButton.style.display = 'none';
  }
});

// Handle Sign-Up
document.getElementById('signup-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.target;
  const submitBtn = form.querySelector('button[type="submit"]');
  const emailEl = document.getElementById('signup-username');
  const passwordEl = document.getElementById('signup-password');
  const email = (emailEl && emailEl.value) || '';
  const password = (passwordEl && passwordEl.value) || '';

  clearAuthError('signup-error');
  setAuthLoading(submitBtn, true);

  firebase.auth().createUserWithEmailAndPassword(email, password)
    .then(() => { /* onAuthStateChanged will redirect */ })
    .catch((error) => {
      showAuthError('signup-error', getAuthErrorMessage(error));
      setAuthLoading(submitBtn, false);
    });
});

// Handle Log-In
document.getElementById('login-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.target;
  const submitBtn = form.querySelector('button[type="submit"]');
  const email = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;

  clearAuthError('login-error');
  setAuthLoading(submitBtn, true);

  firebase.auth().signInWithEmailAndPassword(email, password)
    .then(() => { /* onAuthStateChanged will redirect */ })
    .catch((error) => {
      showAuthError('login-error', getAuthErrorMessage(error));
      setAuthLoading(submitBtn, false);
    });
});

// Handle Log-Out
document.getElementById('logout-button').addEventListener('click', () => {
  firebase.auth().signOut()
    .then(() => { window.location.href = '/login.html'; })
    .catch((error) => {
      showAuthError('login-error', getAuthErrorMessage(error));
    });
});

firebase.auth().onAuthStateChanged((user) => {
  if (user) {
    window.location.href = 'dashboard.html';
  }
});

// Toggle login/signup and clear errors when switching
document.addEventListener('DOMContentLoaded', function () {
  const showSignup = document.getElementById('showSignup');
  const showLogin = document.getElementById('showLogin');
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const googleLogin = document.getElementById('googleLogin');
  const googleSignup = document.getElementById('googleSignup');

  function switchToSignup(e) {
    e.preventDefault();
    clearAuthError('login-error');
    loginForm.style.display = 'none';
    signupForm.style.display = 'block';
  }

  function switchToLogin(e) {
    e.preventDefault();
    clearAuthError('signup-error');
    signupForm.style.display = 'none';
    loginForm.style.display = 'block';
  }

  if (showSignup) showSignup.addEventListener('click', switchToSignup);
  if (showLogin) showLogin.addEventListener('click', switchToLogin);

  // Clear error when user starts typing
  const loginEmail = document.getElementById('login-username');
  const loginPassword = document.getElementById('login-password');
  const signupEmail = document.getElementById('signup-username');
  const signupPassword = document.getElementById('signup-password');
  if (loginEmail) loginEmail.addEventListener('input', () => clearAuthError('login-error'));
  if (loginPassword) loginPassword.addEventListener('input', () => clearAuthError('login-error'));
  if (signupEmail) signupEmail.addEventListener('input', () => clearAuthError('signup-error'));
  if (signupPassword) signupPassword.addEventListener('input', () => clearAuthError('signup-error'));

  if (googleLogin) {
    googleLogin.addEventListener('click', function () {
      clearAuthError('login-error');
      showAuthError('login-error', 'Google sign-in is not set up yet. Please use email and password.');
    });
  }
  if (googleSignup) {
    googleSignup.addEventListener('click', function () {
      clearAuthError('signup-error');
      showAuthError('signup-error', 'Google sign-up is not set up yet. Please use email and password.');
    });
  }
});
