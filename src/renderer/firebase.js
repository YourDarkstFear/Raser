// Raser Firebase Cloud Sync & Social Bridge
(function(window) {
  'use strict';

  const STORAGE_KEY_FB_CONFIG = 'raser_firebase_config_v1';
  let isInitialized = false;
  let activeUser = null;
  let presenceListenerUnsub = null;

  const BUILTIN_FIREBASE_CONFIG = {
    apiKey: "AIzaSyB_PeXk9AV8ABPjNT7WgZ7bQNjXsQwMIIw",
    authDomain: "raser-3f545.firebaseapp.com",
    projectId: "raser-3f545",
    storageBucket: "raser-3f545.firebasestorage.app",
    messagingSenderId: "565117653784",
    appId: "1:565117653784:web:c86be8afbc24a0ae6b046d"
  };

  function getStoredConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_FB_CONFIG);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return BUILTIN_FIREBASE_CONFIG;
  }

  function saveConfig(cfg) {
    try {
      localStorage.setItem(STORAGE_KEY_FB_CONFIG, JSON.stringify(cfg));
      return initFirebase();
    } catch (_) {
      return false;
    }
  }

  function isConfigured() {
    const cfg = getStoredConfig();
    return !!(cfg && cfg.apiKey && cfg.projectId);
  }

  function initFirebase() {
    const cfg = getStoredConfig();
    if (!cfg || !cfg.apiKey || !cfg.projectId) return false;
    if (typeof firebase === 'undefined') return false;

    try {
      if (!firebase.apps || !firebase.apps.length) {
        firebase.initializeApp(cfg);
      }
      isInitialized = true;

      // Listen for auth changes
      firebase.auth().onAuthStateChanged((user) => {
        activeUser = user;
        window.dispatchEvent(new CustomEvent('raser:firebase-auth-changed', { detail: user }));
        if (user) {
          syncFromCloud(user.uid);
          startListeningToPresence();
        } else {
          if (presenceListenerUnsub) {
            presenceListenerUnsub();
            presenceListenerUnsub = null;
          }
        }
      });
      return true;
    } catch (e) {
      console.warn('Firebase init error:', e);
      return false;
    }
  }

  // Auth Functions
  async function registerWithEmail(email, password, displayName = '', username = '', genres = null, avatar = null) {
    if (!isInitialized && !initFirebase()) {
      return { success: false, message: 'Could not connect to authentication services.' };
    }
    try {
      const cred = await firebase.auth().createUserWithEmailAndPassword(email, password);
      const user = cred.user;
      if (displayName) {
        await user.updateProfile({ displayName: displayName });
      }

      // Create user document in Firestore
      const db = firebase.firestore();
      const code = (window.RaserAccount && window.RaserAccount.getActiveProfile()) ? window.RaserAccount.getActiveProfile().code : 'RS-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      const profileData = {
        uid: user.uid,
        email: email,
        displayName: displayName || email.split('@')[0],
        username: (username || email.split('@')[0]).toLowerCase().replace(/[^a-z0-9_]/g, ''),
        code: code,
        avatar: avatar || '',
        bio: 'Listening to music on Raser 🎵',
        genres: Array.isArray(genres) && genres.length > 0 ? genres : ['Hip-Hop', 'Rap', 'Turkish Trap'],
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        stats: { totalPlays: 0, totalDurationMinutes: 0, topArtists: {}, topTracks: [] }
      };

      await db.collection('users').doc(user.uid).set(profileData, { merge: true });

      // Sync with local Raser account
      if (window.RaserAccount) {
        window.RaserAccount.updateActiveProfile({
          displayName: profileData.displayName,
          username: profileData.username,
          code: profileData.code,
          avatar: profileData.avatar || (window.RaserAccount.getActiveProfile() ? window.RaserAccount.getActiveProfile().avatar : ''),
          genres: profileData.genres,
          firebaseUid: user.uid
        });
      }

      return { success: true, user: user };
    } catch (err) {
      return { success: false, message: err.message || String(err) };
    }
  }

  async function loginWithEmail(email, password) {
    if (!isInitialized && !initFirebase()) {
      return { success: false, message: 'Firebase is not configured yet. Please configure it in settings.' };
    }
    try {
      const cred = await firebase.auth().signInWithEmailAndPassword(email, password);
      return { success: true, user: cred.user };
    } catch (err) {
      return { success: false, message: err.message || String(err) };
    }
  }

  async function logout() {
    if (!isInitialized) return;
    try {
      await firebase.auth().signOut();
      activeUser = null;
    } catch (_) {}
  }

  // Cloud Sync
  async function syncProfileToCloud(profile) {
    if (!isInitialized || !activeUser) return;
    try {
      const db = firebase.firestore();
      await db.collection('users').doc(activeUser.uid).set({
        displayName: profile.displayName,
        username: profile.username,
        bio: profile.bio || '',
        genres: profile.genres || [],
        avatar: profile.avatar || '',
        stats: profile.stats || {},
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (e) {
      console.warn('Firestore profile sync error:', e);
    }
  }

  async function syncFromCloud(uid) {
    if (!isInitialized) return;
    try {
      const db = firebase.firestore();
      const doc = await db.collection('users').doc(uid).get();
      if (doc.exists) {
        const data = doc.data();
        if (window.RaserAccount) {
          window.RaserAccount.updateActiveProfile({
            displayName: data.displayName || 'User',
            username: data.username || 'user',
            bio: data.bio || '',
            genres: data.genres || [],
            avatar: data.avatar || '',
            stats: data.stats || {},
            code: data.code || ''
          });
        }
      }
    } catch (e) {
      console.warn('Firestore syncFromCloud error:', e);
    }
  }

  // Real-time Presence / Friend Activity
  async function broadcastListeningTrack(track, isPlaying = true) {
    if (!isInitialized || !activeUser || !track) return;
    try {
      const db = firebase.firestore();
      await db.collection('presence').doc(activeUser.uid).set({
        uid: activeUser.uid,
        displayName: activeUser.displayName || 'User',
        title: track.title || 'Unknown Track',
        artist: track.artist || 'Unknown Artist',
        cover: track.thumbnail || '',
        playing: !!isPlaying,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (_) {}
  }

  function startListeningToPresence() {
    if (!isInitialized || !activeUser) return;
    try {
      const db = firebase.firestore();
      if (presenceListenerUnsub) presenceListenerUnsub();

      // Listen to active presence updates across all users
      presenceListenerUnsub = db.collection('presence').limit(20).onSnapshot((snapshot) => {
        const liveActivity = [];
        snapshot.forEach(doc => {
          const d = doc.data();
          if (d.uid !== activeUser.uid) {
            liveActivity.push({
              id: d.uid,
              displayName: d.displayName || 'Raser Friend',
              lastTrack: {
                title: d.title,
                artist: d.artist,
                cover: d.cover,
                playing: d.playing,
                time: 'Live on Cloud'
              }
            });
          }
        });

        // Update local friend activity feed
        if (liveActivity.length > 0 && window.RaserAccount) {
          const currentProfile = window.RaserAccount.getActiveProfile();
          if (currentProfile) {
            const merged = [...liveActivity];
            (currentProfile.following || []).forEach(f => {
              if (!merged.some(m => m.id === f.id)) merged.push(f);
            });
            window.RaserAccount.updateActiveProfile({ following: merged });
          }
        }
      });
    } catch (e) {
      console.warn('Presence listener error:', e);
    }
  }

  // Search user by Raser Code in Firestore
  async function findUserByRaserCode(code) {
    if (!isInitialized) return null;
    try {
      const db = firebase.firestore();
      const snap = await db.collection('users').where('code', '==', code.trim().toUpperCase()).limit(1).get();
      if (!snap.empty) {
        return snap.docs[0].data();
      }
    } catch (e) {
      console.warn('Find user error:', e);
    }
    return null;
  }

  window.RaserFirebase = {
    getStoredConfig,
    saveConfig,
    isConfigured,
    initFirebase,
    registerWithEmail,
    loginWithEmail,
    logout,
    syncProfileToCloud,
    broadcastListeningTrack,
    findUserByRaserCode,
    getCurrentUser: () => activeUser
  };

  // Auto initialize on load if config exists
  window.addEventListener('DOMContentLoaded', () => {
    initFirebase();
  });

})(window);
