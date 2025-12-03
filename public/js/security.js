// Monitor Authentication State
firebase.auth().onAuthStateChanged((user) => {
    const authContainer = document.getElementById('auth-container');
    const signupForm = document.getElementById('signup-form');
    const loginForm = document.getElementById('login-form');
    const logoutButton = document.getElementById('logout-button');
  
    if (user) {
      // User is logged in
      console.log(`Logged in as: ${user.email}`);
      authContainer.style.display = 'block';
      signupForm.style.display = 'none';
      loginForm.style.display = 'none';
      logoutButton.style.display = 'inline-block';
    } else {
      // User is logged out
      console.log('No user is logged in.');
      authContainer.style.display = 'block';
      signupForm.style.display = 'none';
      loginForm.style.display = 'block';
      logoutButton.style.display = 'none';
    }
  });
  
  // Handle Sign-Up
  document.getElementById('signup-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const email = document.getElementById('signup-username').value;
    const password = document.getElementById('signup-password').value;
  
    firebase.auth().createUserWithEmailAndPassword(email, password)
      .then((userCredential) => {
        console.log('User signed up:', userCredential.user);
      })
      .catch((error) => {
        console.error('Error signing up:', error.message);
      });
  });
  
  // Handle Log-In
  document.getElementById('login-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const email = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    console.log(document.getElementById('login-username')); // Should not be null
        console.log(document.getElementById('login-password')); // Should not be null
        

        console.log('Login Username:', email);
        console.log('Login Password:', password);
  
    firebase.auth().signInWithEmailAndPassword(email, password)
      .then((userCredential) => {
        console.log('User logged in:', userCredential.user);
      })
      .catch((error) => {
        console.error('Error logging in:', error.message);
      });
  });
  
  // Handle Log-Out
  document.getElementById('logout-button').addEventListener('click', () => {
    firebase.auth().signOut()
      .then(() => {
        console.log('User logged out.');
      })
      .catch((error) => {
        console.error('Error logging out:', error.message);
      });
  });

  firebase.auth().onAuthStateChanged((user) => {
    if (user) {
      window.location.href = 'dashboard.html'; // Redirect to dashboard
    }
  });   
  
// script.js
document.addEventListener('DOMContentLoaded', function() {
    const showSignup = document.getElementById('showSignup');
    const showLogin = document.getElementById('showLogin');
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const googleLogin = document.getElementById('googleLogin');
    const googleSignup = document.getElementById('googleSignup');

   

    // Show Sign Up Form
    showSignup.addEventListener('click', function(event) {
        event.preventDefault(); // Prevent the default anchor behavior
        loginForm.style.display = 'none'; // Hide the login form
        signupForm.style.display = 'block'; // Show the sign-up form
    });

    // Show Login Form
    showLogin.addEventListener('click', function(event) {
        event.preventDefault(); // Prevent the default anchor behavior
        signupForm.style.display = 'none'; // Hide the sign-up form
        loginForm.style.display = 'block'; // Show the login form
    });

    // Placeholder for Google authentication
    googleLogin.addEventListener('click', function() {
        alert('Google Login functionality to be implemented.');
    });

    googleSignup.addEventListener('click', function() {
        alert('Google Sign Up functionality to be implemented.');
    });
});