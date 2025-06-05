import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// Initialize Supabase client
const supabaseUrl = "https://ajfexlpkibkevlockryp.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqZmV4bHBraWJrZXZsb2NrcnlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkxMzk1MjEsImV4cCI6MjA2NDcxNTUyMX0.UWB5W6VFLXLhcfV2C6mTfMhdnsFvzKJTwykHMl1x7Rw";

export const supabase = window.supabase.createClient(
  supabaseUrl,
  supabaseAnonKey
);

// Export both Firebase auth and Supabase Google auth
export const auth = {
  // Keep existing Firebase auth methods
  signInWithEmailAndPassword: async (email, password) => {
    // This will be handled by Firebase
    const { user } = await firebase
      .auth()
      .signInWithEmailAndPassword(email, password);
    return user;
  },

  createUserWithEmailAndPassword: async (email, password) => {
    // This will be handled by Firebase
    const { user } = await firebase
      .auth()
      .createUserWithEmailAndPassword(email, password);
    return user;
  },

  // Add Supabase Google auth
  signInWithGoogle: async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
    });
    if (error) throw error;

    // Convert Supabase user to Firebase-compatible format
    const { user } = data.session;
    return {
      user: {
        uid: user.id,
        email: user.email,
        displayName: user.user_metadata.full_name,
        photoURL: user.user_metadata.avatar_url,
      },
    };
  },

  // Sign out
  signOut: async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  // Get current session
  getSession: async () => {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();
    if (error) throw error;
    return session;
  },

  // Subscribe to auth changes
  onAuthStateChange: (callback) => {
    return supabase.auth.onAuthStateChange((event, session) => {
      callback(session);
    });
  },
};
