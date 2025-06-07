# Firebase Google OAuth Setup Guide

## Current Configuration Status

✅ **Firebase Project**: `ai-flashcard-creator`
✅ **Firebase Config**: Properly configured in `config.js`
✅ **Google Auth Provider**: Implemented in `auth-modal.js`
✅ **Error Handling**: Enhanced with debugging and fallbacks

## Required Firebase Console Setup

### 1. Enable Google Authentication

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project: `ai-flashcard-creator`
3. Navigate to **Authentication** → **Sign-in method**
4. Click on **Google** provider
5. Enable the provider
6. Add your domain to **Authorized domains**

### 2. Authorized Domains Configuration

Add these domains to Firebase Authentication settings:

**For Development:**
- `localhost`
- `127.0.0.1`
- `localhost:8080`
- `localhost:8081`

**For Production:**
- Your actual domain (e.g., `note2flash.com`)
- Any staging domains

### 3. Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select project: `ai-flashcard-creator`
3. Navigate to **APIs & Services** → **Credentials**
4. Find your OAuth 2.0 Client ID
5. Add authorized JavaScript origins:
   - `http://localhost:8080`
   - `http://localhost:8081`
   - `https://yourdomain.com` (production)

## Testing the Implementation

### Quick Test
Visit: `http://localhost:8081/test-google-auth.html`

This test page will:
- Initialize Firebase with your config
- Test Google Auth popup/redirect
- Show detailed debug information
- Display user information on success

### Common Issues and Solutions

#### 1. "This domain is not authorized"
**Solution**: Add domain to Firebase Auth authorized domains

#### 2. "Popup blocked" 
**Solution**: Code automatically falls back to redirect method

#### 3. "Operation not allowed"
**Solution**: Enable Google provider in Firebase console

#### 4. Network/CORS issues
**Solution**: Check browser console for specific CORS errors

## Code Implementation Details

### Enhanced Features Added:

1. **Provider Scopes**: Added email and profile scopes
```javascript
googleProvider.addScope('email');
googleProvider.addScope('profile');
```

2. **Improved Error Handling**: Specific error messages for common issues

3. **Popup/Redirect Fallback**: Automatically tries redirect if popup fails

4. **Debug Logging**: Comprehensive logging for troubleshooting

5. **Button State Management**: Prevents multiple clicks during auth

## Current File Structure

```
├── config.js                 # Firebase configuration
├── auth-modal.js             # Enhanced auth modal (Google OAuth)
├── test-google-auth.html     # Test page for Google OAuth
├── app.js                    # Main application logic
└── index.html               # Main application page
```

## Verification Steps

1. **Test popup auth**: Click "Continue with Google" - should open popup
2. **Test redirect fallback**: If popup blocked, should redirect
3. **Check user creation**: New users should be created in Firestore
4. **Verify auth state**: User should stay logged in on page refresh

## Next Steps

1. Run the test page: `http://localhost:8081/test-google-auth.html`
2. Check Firebase console for any authentication attempts
3. Verify authorized domains are configured
4. Test both popup and redirect flows
5. Check browser console for any remaining errors

## Debugging Commands

```javascript
// In browser console, check current auth state:
firebase.auth().onAuthStateChanged(user => console.log('User:', user));

// Check current config:
console.log('Firebase config:', firebase.app().options);
```

---

**Status**: ✅ Google OAuth is implemented and should work with proper Firebase configuration 