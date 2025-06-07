// Firebase Google OAuth Diagnostic Script
// Run this in the browser console to diagnose auth issues

console.log("🔥 Firebase Auth Diagnostic Starting...\n");

async function diagnoseFirebaseAuth() {
  try {
    // Check if Firebase is loaded
    if (typeof firebase === 'undefined' && typeof window.firebase === 'undefined') {
      console.error("❌ Firebase SDK not loaded");
      return;
    }
    console.log("✅ Firebase SDK loaded");

    // Check Firebase config
    const { firebaseConfig } = await import('./config.js');
    console.log("✅ Firebase config imported:", firebaseConfig);

    // Import Firebase modules
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js");
    const { getAuth, GoogleAuthProvider } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js");
    
    // Initialize Firebase
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    console.log("✅ Firebase app and auth initialized");

    // Check current auth state
    const currentUser = auth.currentUser;
    if (currentUser) {
      console.log("✅ User is signed in:", {
        email: currentUser.email,
        uid: currentUser.uid,
        emailVerified: currentUser.emailVerified,
        providers: currentUser.providerData.map(p => p.providerId)
      });
    } else {
      console.log("ℹ️ No user currently signed in");
    }

    // Test Google provider setup
    const googleProvider = new GoogleAuthProvider();
    googleProvider.addScope('email');
    googleProvider.addScope('profile');
    console.log("✅ Google provider configured");

    // Check for auth modal
    const authModal = document.getElementById('authModal');
    const googleLoginBtn = document.getElementById('googleLoginBtn');
    
    if (authModal) {
      console.log("✅ Auth modal found");
    } else {
      console.log("⚠️ Auth modal not found - may need to be initialized");
    }

    if (googleLoginBtn) {
      console.log("✅ Google login button found");
    } else {
      console.log("⚠️ Google login button not found");
    }

    // Check network connectivity to Firebase
    try {
      const response = await fetch('https://identitytoolkit.googleapis.com/v1/projects', {
        method: 'GET',
        mode: 'cors'
      });
      console.log("✅ Firebase Auth API accessible");
    } catch (networkError) {
      console.log("⚠️ Network issue accessing Firebase:", networkError.message);
    }

    // Check if domain is configured
    const currentDomain = window.location.hostname;
    console.log(`ℹ️ Current domain: ${currentDomain}:${window.location.port}`);
    console.log("ℹ️ Make sure this domain is added to Firebase Auth authorized domains");

    // Test auth modal functionality
    window.testGoogleAuth = async function() {
      try {
        console.log("🧪 Testing Google Auth...");
        
        const { signInWithPopup } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js");
        
        const result = await signInWithPopup(auth, googleProvider);
        console.log("✅ Google Auth successful:", result.user.email);
        return result;
      } catch (error) {
        console.error("❌ Google Auth failed:", error.code, error.message);
        
        // Provide specific guidance
        switch (error.code) {
          case 'auth/unauthorized-domain':
            console.log("💡 Solution: Add current domain to Firebase Auth authorized domains");
            break;
          case 'auth/operation-not-allowed':
            console.log("💡 Solution: Enable Google provider in Firebase console");
            break;
          case 'auth/popup-blocked':
            console.log("💡 Solution: Allow popups or use redirect method");
            break;
          default:
            console.log("💡 Check Firebase console and browser network tab for more details");
        }
        
        return error;
      }
    };

    console.log("\n🎯 Diagnostic Complete!");
    console.log("📋 Summary:");
    console.log("   - Firebase config: ✅");
    console.log("   - Auth initialized: ✅");  
    console.log("   - Google provider: ✅");
    console.log(`   - Current user: ${currentUser ? '✅ Signed in' : 'ℹ️ Not signed in'}`);
    console.log(`   - Auth modal: ${authModal ? '✅' : '⚠️'}`);
    console.log(`   - Google button: ${googleLoginBtn ? '✅' : '⚠️'}`);
    
    console.log("\n🧪 Test commands available:");
    console.log("   testGoogleAuth() - Test Google sign-in");
    
    if (!currentUser) {
      console.log("\n💡 To test Google Auth, run: testGoogleAuth()");
    }

  } catch (error) {
    console.error("❌ Diagnostic failed:", error);
    console.log("💡 Make sure you're running this on the correct domain with Firebase configured");
  }
}

// Auto-run diagnostic
diagnoseFirebaseAuth(); 