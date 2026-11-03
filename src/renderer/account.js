// Raser Spotify-Quality Account, Profile & Social System
(function(window) {
  'use strict';

  const STORAGE_KEY_PROFILES = 'raser_accounts_v2';
  const STORAGE_KEY_ACTIVE = 'raser_active_account_id_v2';
  const STORAGE_KEY_ACTIVITY = 'raser_friend_activity_v2';
  const STORAGE_KEY_NOTES = 'raser_track_notes_v2';

  // Default avatars available
  const DEFAULT_AVATARS = [
    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="%231DB954"/><stop offset="100%" stop-color="%23191414"/></linearGradient></defs><circle cx="50" cy="50" r="50" fill="url(%23g)"/><path d="M50 48a16 16 0 1 0 0-32 16 16 0 0 0 0 32zm0 8c-18 0-32 12-32 26v4h64v-4c0-14-14-26-32-26z" fill="%23fff"/></svg>',
    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g2" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="%236750A4"/><stop offset="100%" stop-color="%239A82DB"/></linearGradient></defs><circle cx="50" cy="50" r="50" fill="url(%23g2)"/><path d="M50 48a16 16 0 1 0 0-32 16 16 0 0 0 0 32zm0 8c-18 0-32 12-32 26v4h64v-4c0-14-14-26-32-26z" fill="%23fff"/></svg>',
    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g3" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="%23FF5722"/><stop offset="100%" stop-color="%23FF9800"/></linearGradient></defs><circle cx="50" cy="50" r="50" fill="url(%23g3)"/><path d="M50 48a16 16 0 1 0 0-32 16 16 0 0 0 0 32zm0 8c-18 0-32 12-32 26v4h64v-4c0-14-14-26-32-26z" fill="%23fff"/></svg>'
  ];

  function generateUserCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'RS-';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  function createDefaultProfile(username = 'misafir', displayName = 'Misafir') {
    return {
      id: 'guest_' + Date.now().toString(36),
      code: generateUserCode(),
      username: username.toLowerCase().replace(/[^a-z0-9_]/g, '') || 'misafir',
      displayName: displayName || 'Misafir',
      avatar: DEFAULT_AVATARS[0],
      bio: '',
      genres: [],
      createdAt: Date.now(),
      following: [],
      followersCount: 0,
      stats: {
        totalPlays: 0,
        totalDurationMinutes: 0,
        topArtists: {},
        topTracks: []
      }
    };
  }

  // Load accounts list
  function getAllProfiles() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_PROFILES);
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list) && list.length > 0) return list;
      }
    } catch (_) {}
    const def = createDefaultProfile();
    saveProfiles([def]);
    localStorage.setItem(STORAGE_KEY_ACTIVE, def.id);
    return [def];
  }

  function saveProfiles(profiles) {
    try {
      localStorage.setItem(STORAGE_KEY_PROFILES, JSON.stringify(profiles));
    } catch (_) {}
  }

  function getActiveProfile() {
    const list = getAllProfiles();
    const activeId = localStorage.getItem(STORAGE_KEY_ACTIVE);
    const found = list.find(p => p.id === activeId);
    return found || list[0];
  }

  function updateActiveProfile(updates) {
    const list = getAllProfiles();
    const activeId = localStorage.getItem(STORAGE_KEY_ACTIVE);
    const idx = list.findIndex(p => p.id === activeId);
    if (idx !== -1) {
      list[idx] = Object.assign({}, list[idx], updates);
      saveProfiles(list);
      window.dispatchEvent(new CustomEvent('raser:account-updated', { detail: list[idx] }));
      return list[idx];
    }
    return null;
  }

  function switchProfile(profileId) {
    const list = getAllProfiles();
    const found = list.find(p => p.id === profileId);
    if (found) {
      localStorage.setItem(STORAGE_KEY_ACTIVE, found.id);
      window.dispatchEvent(new CustomEvent('raser:account-switched', { detail: found }));
      return found;
    }
    return null;
  }

  function createNewProfile(username, displayName) {
    const p = createDefaultProfile(username, displayName);
    const list = getAllProfiles();
    list.push(p);
    saveProfiles(list);
    switchProfile(p.id);
    return p;
  }

  // Record a track play for Wrapped & Stats
  function recordTrackPlay(track) {
    if (!track) return;
    const profile = getActiveProfile();
    if (!profile) return;
    const stats = profile.stats || { totalPlays: 0, totalDurationMinutes: 0, topArtists: {}, topTracks: [] };
    stats.totalPlays = (stats.totalPlays || 0) + 1;
    stats.totalDurationMinutes = (stats.totalDurationMinutes || 0) + Math.round((track.duration || 180) / 60);

    const artist = track.artist || 'Unknown';
    stats.topArtists = stats.topArtists || {};
    stats.topArtists[artist] = (stats.topArtists[artist] || 0) + 1;

    stats.topTracks = stats.topTracks || [];
    const tIdx = stats.topTracks.findIndex(t => t.title === track.title && t.artist === track.artist);
    if (tIdx !== -1) {
      stats.topTracks[tIdx].plays = (stats.topTracks[tIdx].plays || 0) + 1;
    } else {
      stats.topTracks.push({
        title: track.title,
        artist: track.artist,
        cover: track.thumbnail || '',
        plays: 1
      });
    }
    stats.topTracks.sort((a, b) => b.plays - a.plays);
    if (stats.topTracks.length > 20) stats.topTracks = stats.topTracks.slice(0, 20);

    updateActiveProfile({ stats });

    // Update friend activity live feed for this user
    try {
      window.dispatchEvent(new CustomEvent('raser:user-playing', { detail: track }));
    } catch (_) {}
  }

  // Social / Friends
  function addFriendByCode(codeOrJson) {
    const profile = getActiveProfile();
    if (!profile) return { success: false, message: 'No active profile' };

    const input = String(codeOrJson || '').trim();
    if (!input) return { success: false, message: 'Please enter a code or user data' };

    // Check if JSON profile export
    if (input.startsWith('{')) {
      try {
        const imported = JSON.parse(input);
        if (imported.displayName || imported.username) {
          const newFriend = {
            id: imported.id || 'f_' + Date.now().toString(36),
            code: imported.code || generateUserCode(),
            username: imported.username || 'friend',
            displayName: imported.displayName || 'Music Friend',
            avatar: imported.avatar || DEFAULT_AVATARS[0],
            bio: imported.bio || '',
            lastTrack: {
              title: 'Discovering music',
              artist: 'Raser',
              time: 'Online',
              playing: true
            }
          };
          profile.following = profile.following || [];
          if (!profile.following.some(f => f.code === newFriend.code || f.id === newFriend.id)) {
            profile.following.unshift(newFriend);
            updateActiveProfile({ following: profile.following });
            return { success: true, friend: newFriend };
          }
          return { success: false, message: 'You are already following this friend!' };
        }
      } catch (_) {}
    }

    // Treat as Raser 6-char code
    const cleanCode = input.toUpperCase().replace(/\s/g, '');
    const simulatedFriends = [
      { code: 'RS-MOTIVE', username: 'motive_fan', displayName: 'Motive Stan', bio: 'YIN YANG on repeat 🔥', track: { title: '10MG', artist: 'Motive' } },
      { code: 'RS-SPOTI', username: 'spotify_migrant', displayName: 'Can Berk', bio: 'Imported my 2024 Spotify Wrapped', track: { title: 'CHORBA', artist: 'Motive' } },
      { code: 'RS-SOUND', username: 'sound_lover', displayName: 'Zeynep', bio: 'Audiophile & vinyl collector', track: { title: 'SAVANA', artist: 'Motive' } }
    ];

    const match = simulatedFriends.find(s => s.code === cleanCode) || {
      code: cleanCode.startsWith('RS-') ? cleanCode : 'RS-' + cleanCode,
      username: 'user_' + cleanCode.slice(-4).toLowerCase(),
      displayName: 'Raser User ' + cleanCode.slice(-4),
      bio: 'Music enthusiast on Raser',
      track: { title: 'YIN YANG', artist: 'Motive' }
    };

    const newFriend = {
      id: 'f_' + Math.random().toString(36).substring(2, 8),
      code: match.code,
      username: match.username,
      displayName: match.displayName,
      avatar: DEFAULT_AVATARS[Math.floor(Math.random() * DEFAULT_AVATARS.length)],
      bio: match.bio,
      lastTrack: {
        title: match.track.title,
        artist: match.track.artist,
        time: 'Listening now',
        playing: true,
        cover: 'https://cdn-images.dzcdn.net/images/artist/ebcf22e5c3a0eb3178b8a6f6bc1a5a6c/250x250-000000-80-0-0.jpg'
      }
    };

    profile.following = profile.following || [];
    if (profile.following.some(f => f.code === newFriend.code)) {
      return { success: false, message: 'Already following this user!' };
    }

    profile.following.unshift(newFriend);
    updateActiveProfile({ following: profile.following });
    return { success: true, friend: newFriend };
  }

  function addFriendDirectly(friendObj) {
    const profile = getActiveProfile();
    if (!profile || !friendObj) return { success: false, message: 'Invalid friend data' };
    profile.following = profile.following || [];
    if (profile.following.some(f => (friendObj.code && f.code === friendObj.code) || (friendObj.id && f.id === friendObj.id))) {
      return { success: false, message: 'Already following this user!' };
    }
    const newFriend = {
      id: friendObj.id || friendObj.uid || 'f_' + Math.random().toString(36).substring(2, 8),
      code: friendObj.code || 'RS-USER',
      username: friendObj.username || 'user',
      displayName: friendObj.displayName || 'Music Friend',
      avatar: friendObj.avatar || DEFAULT_AVATARS[0],
      bio: friendObj.bio || '',
      lastTrack: friendObj.lastTrack || {
        title: 'Exploring music',
        artist: 'Raser',
        time: 'Online',
        playing: false
      }
    };
    profile.following.unshift(newFriend);
    updateActiveProfile({ following: profile.following });
    return { success: true, friend: newFriend };
  }

  function unfollowFriend(friendId) {
    const profile = getActiveProfile();
    if (!profile || !profile.following) return;
    profile.following = profile.following.filter(f => f.id !== friendId && f.code !== friendId);
    updateActiveProfile({ following: profile.following });
  }

  // Track Notes & Memories (Müzik Günlüğü)
  function getTrackNotes() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_NOTES);
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }

  function setTrackNote(trackCanonicalId, noteText, trackMeta = null) {
    const notes = getTrackNotes();
    if (!noteText || !noteText.trim()) {
      delete notes[trackCanonicalId];
    } else {
      notes[trackCanonicalId] = {
        text: noteText.trim(),
        date: Date.now(),
        track: trackMeta || null
      };
    }
    try {
      localStorage.setItem(STORAGE_KEY_NOTES, JSON.stringify(notes));
      window.dispatchEvent(new CustomEvent('raser:track-note-updated', { detail: { id: trackCanonicalId, note: notes[trackCanonicalId] } }));
    } catch (_) {}
    return notes[trackCanonicalId];
  }

  function getNoteForTrack(trackCanonicalId) {
    const notes = getTrackNotes();
    return notes[trackCanonicalId] || null;
  }

  // Export module to global
  window.RaserAccount = {
    getAllProfiles,
    getActiveProfile,
    updateActiveProfile,
    switchProfile,
    createNewProfile,
    recordTrackPlay,
    addFriendByCode,
    addFriendDirectly,
    unfollowFriend,
    getTrackNotes,
    setTrackNote,
    getNoteForTrack,
    DEFAULT_AVATARS
  };

})(window);
