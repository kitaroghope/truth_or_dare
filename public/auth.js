/**
 * Authentication and User Management
 * Handles JWT tokens, auto-refresh, and user interface interactions
 */

// Global auth state
let currentUser = null;
let accessToken = null;
let refreshToken = null;
let refreshTimer = null;
let gameClient = null;

// API base URL
const API_URL = window.location.origin;

// ========== TOKEN MANAGEMENT ==========

/**
 * Load tokens from localStorage
 */
function loadTokens() {
  accessToken = localStorage.getItem('td_accessToken');
  refreshToken = localStorage.getItem('td_refreshToken');

  if (accessToken && refreshToken) {
    // Initialize game client with token
    initializeGameClient();

    // Fetch current user profile
    fetchCurrentUser();

    // Setup auto-refresh
    setupTokenRefresh();
  } else {
    updateAuthUI(false);
  }
}

/**
 * Save tokens to localStorage
 */
function saveTokens(access, refresh) {
  accessToken = access;
  refreshToken = refresh;

  localStorage.setItem('td_accessToken', access);
  localStorage.setItem('td_refreshToken', refresh);

  // Reinitialize game client with new token
  initializeGameClient();

  // Setup auto-refresh
  setupTokenRefresh();
}

/**
 * Clear tokens from storage
 */
function clearTokens() {
  accessToken = null;
  refreshToken = null;

  localStorage.removeItem('td_accessToken');
  localStorage.removeItem('td_refreshToken');

  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

/**
 * Setup automatic token refresh (20 hours = 4 hours before 24hr expiry)
 */
function setupTokenRefresh() {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
  }

  // Refresh token after 20 hours (4 hours before expiry)
  const refreshInterval = 20 * 60 * 60 * 1000; // 20 hours in milliseconds

  refreshTimer = setTimeout(async () => {
    await refreshAccessToken();
  }, refreshInterval);
}

/**
 * Refresh access token using refresh token
 */
async function refreshAccessToken() {
  try {
    const response = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    });

    if (response.ok) {
      const data = await response.json();
      saveTokens(data.accessToken, data.refreshToken);
      console.log('✅ Access token refreshed');
      return true;
    } else {
      // Refresh failed, logout user
      console.error('⚠️  Token refresh failed, logging out');
      logout();
      return false;
    }
  } catch (error) {
    console.error('Token refresh error:', error);
    logout();
    return false;
  }
}

// ========== API HELPERS ==========

/**
 * Make authenticated API request
 */
async function apiRequest(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    });

    // Handle 401 Unauthorized - try to refresh token
    if (response.status === 401 && refreshToken) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        // Retry request with new token
        headers['Authorization'] = `Bearer ${accessToken}`;
        const retryResponse = await fetch(`${API_URL}${endpoint}`, {
          ...options,
          headers,
        });
        return retryResponse;
      }
    }

    return response;
  } catch (error) {
    console.error('API request error:', error);
    throw error;
  }
}

// ========== INITIALIZATION ==========

/**
 * Initialize game client with authentication
 */
function initializeGameClient() {
  if (gameClient) {
    gameClient.disconnect();
  }

  gameClient = new GameClient({
    token: accessToken,
    apiBaseUrl: API_URL,
  });

  gameClient.connect().then(() => {
    console.log(`✅ Game client connected via ${gameClient.connectionMode}`);
  }).catch((error) => {
    console.error('Game client connection error:', error);
  });
}

/**
 * Fetch current user profile
 */
async function fetchCurrentUser() {
  try {
    const response = await apiRequest('/api/auth/me');

    if (response.ok) {
      const data = await response.json();
      currentUser = data.user;

      // Sync username with localStorage for game client
      if (currentUser.username) {
        const cachedUsername = localStorage.getItem("td_username");
        if (cachedUsername !== currentUser.username) {
          console.log(`✅ Syncing username: "${cachedUsername}" → "${currentUser.username}"`);
          localStorage.setItem("td_username", currentUser.username);
        }
      }

      updateAuthUI(true);
    } else {
      clearTokens();
      updateAuthUI(false);
    }
  } catch (error) {
    console.error('Fetch current user error:', error);
    clearTokens();
    updateAuthUI(false);
  }
}

/**
 * Update UI based on authentication status
 */
function updateAuthUI(isAuthenticated) {
  const authButtons = document.getElementById('authButtons');
  const userMenu = document.getElementById('userMenu');

  if (isAuthenticated && currentUser) {
    authButtons.style.display = 'none';
    userMenu.style.display = 'block';

    // Update user menu
    document.getElementById('userMenuName').textContent = currentUser.username;

    // Update avatar
    const avatarUrl = currentUser.avatar_url || '/images/default-avatar.png';
    document.getElementById('userAvatar').src = avatarUrl;
  } else {
    authButtons.style.display = 'block';
    userMenu.style.display = 'none';
  }
}

// ========== AUTH HANDLERS ==========

/**
 * Handle login form submission
 */
async function handleLogin(event) {
  event.preventDefault();

  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const errorDiv = document.getElementById('loginError');

  errorDiv.style.display = 'none';

  try {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (response.ok) {
      saveTokens(data.accessToken, data.refreshToken);
      await fetchCurrentUser();
      closeLoginModal();
      document.getElementById('loginForm').reset();

      // Show success message
      alert('Welcome back! 🎉');
    } else {
      errorDiv.textContent = data.message || 'Login failed. Please try again.';
      errorDiv.style.display = 'block';
    }
  } catch (error) {
    console.error('Login error:', error);
    errorDiv.textContent = 'Network error. Please try again.';
    errorDiv.style.display = 'block';
  }
}

/**
 * Handle signup form submission
 */
async function handleSignup(event) {
  event.preventDefault();

  const username = document.getElementById('signupUsername').value;
  const email = document.getElementById('signupEmail').value;
  const password = document.getElementById('signupPassword').value;
  const confirmPassword = document.getElementById('signupConfirmPassword').value;
  const errorDiv = document.getElementById('signupError');

  errorDiv.style.display = 'none';

  // Validate passwords match
  if (password !== confirmPassword) {
    errorDiv.textContent = 'Passwords do not match';
    errorDiv.style.display = 'block';
    return;
  }

  try {
    const response = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password }),
    });

    const data = await response.json();

    if (response.ok) {
      saveTokens(data.accessToken, data.refreshToken);
      await fetchCurrentUser();
      closeSignupModal();
      document.getElementById('signupForm').reset();

      // Show success message
      alert('Account created successfully! 🎉\nCheck your email to verify your account.');
    } else {
      errorDiv.textContent = data.message || 'Signup failed. Please try again.';
      errorDiv.style.display = 'block';
    }
  } catch (error) {
    console.error('Signup error:', error);
    errorDiv.textContent = 'Network error. Please try again.';
    errorDiv.style.display = 'block';
  }
}

/**
 * Handle forgot password form submission
 */
async function handleForgotPassword(event) {
  event.preventDefault();

  const email = document.getElementById('forgotPasswordEmail').value;
  const errorDiv = document.getElementById('forgotPasswordError');
  const successDiv = document.getElementById('forgotPasswordSuccess');

  errorDiv.style.display = 'none';
  successDiv.style.display = 'none';

  try {
    const response = await fetch(`${API_URL}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    const data = await response.json();

    if (response.ok) {
      successDiv.textContent = 'Password reset link sent to your email! Check your inbox.';
      successDiv.style.display = 'block';
      document.getElementById('forgotPasswordForm').reset();
    } else {
      errorDiv.textContent = data.message || 'Failed to send reset link. Please try again.';
      errorDiv.style.display = 'block';
    }
  } catch (error) {
    console.error('Forgot password error:', error);
    errorDiv.textContent = 'Network error. Please try again.';
    errorDiv.style.display = 'block';
  }
}

/**
 * Logout user
 */
async function logout() {
  try {
    await apiRequest('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });
  } catch (error) {
    console.error('Logout error:', error);
  }

  // Disconnect game client
  if (gameClient) {
    gameClient.disconnect();
    gameClient = null;
  }

  // Clear tokens and user data
  clearTokens();
  currentUser = null;
  updateAuthUI(false);

  // Redirect to home
  window.location.href = '/';
}

// ========== PROFILE MANAGEMENT ==========

/**
 * Show profile modal and load user data
 */
async function showProfileModal() {
  document.getElementById('profileModal').style.display = 'flex';

  if (!currentUser) return;

  // Populate form
  document.getElementById('profileUsername').value = currentUser.username;
  document.getElementById('profileEmail').value = currentUser.email;
  document.getElementById('profileBio').value = currentUser.bio || '';

  // Set avatar
  const avatarUrl = currentUser.avatar_url || '/images/default-avatar.png';
  document.getElementById('profileAvatar').src = avatarUrl;

  // Load and display stats
  try {
    const response = await apiRequest('/api/auth/me');
    if (response.ok) {
      const data = await response.json();
      const stats = data.stats;

      document.getElementById('profileGamesPlayed').textContent = stats.games_played || 0;
      document.getElementById('profileGamesWon').textContent = stats.games_won || 0;
      document.getElementById('profileGamesLost').textContent = stats.games_lost || 0;

      const winRate = stats.games_played > 0
        ? Math.round((stats.games_won / stats.games_played) * 100)
        : 0;
      document.getElementById('profileWinRate').textContent = `${winRate}%`;
    }
  } catch (error) {
    console.error('Error loading stats:', error);
  }
}

/**
 * Update user profile
 */
async function updateProfile() {
  const bio = document.getElementById('profileBio').value;
  const errorDiv = document.getElementById('profileError');

  errorDiv.style.display = 'none';

  try {
    const response = await apiRequest('/api/users/profile', {
      method: 'PATCH',
      body: JSON.stringify({ bio }),
    });

    if (response.ok) {
      const data = await response.json();
      currentUser = data.user;
      alert('Profile updated successfully! ✅');
      closeProfileModal();
    } else {
      const data = await response.json();
      errorDiv.textContent = data.message || 'Failed to update profile';
      errorDiv.style.display = 'block';
    }
  } catch (error) {
    console.error('Update profile error:', error);
    errorDiv.textContent = 'Network error. Please try again.';
    errorDiv.style.display = 'block';
  }
}

/**
 * Handle avatar upload
 */
async function handleAvatarUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Check file size (max 5MB)
  if (file.size > 5 * 1024 * 1024) {
    alert('Image size must be less than 5MB');
    return;
  }

  const formData = new FormData();
  formData.append('avatar', file);

  try {
    const response = await fetch(`${API_URL}/api/users/avatar`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
      body: formData,
    });

    if (response.ok) {
      const data = await response.json();
      currentUser.avatar_url = data.avatar_url;

      // Update avatar in UI
      document.getElementById('profileAvatar').src = data.avatar_url;
      document.getElementById('userAvatar').src = data.avatar_url;

      alert('Avatar updated successfully! ✅');
    } else {
      const data = await response.json();
      alert(data.message || 'Failed to upload avatar');
    }
  } catch (error) {
    console.error('Avatar upload error:', error);
    alert('Network error. Please try again.');
  }
}

/**
 * Close profile modal
 */
function closeProfileModal() {
  document.getElementById('profileModal').style.display = 'none';
}

// ========== FRIENDS MANAGEMENT ==========

/**
 * Show friends modal and load data
 */
async function showFriendsModal() {
  document.getElementById('friendsModal').style.display = 'flex';

  await loadFriendsList();
  await loadFriendRequests();
}

/**
 * Load friends list
 */
async function loadFriendsList() {
  try {
    const response = await apiRequest('/api/friends');

    if (response.ok) {
      const data = await response.json();
      const friends = data.friends;

      const container = document.getElementById('friendsListContent');
      document.getElementById('friendsCount').textContent = friends.length;

      if (friends.length === 0) {
        container.innerHTML = '<div class="text-center text-muted py-4">No friends yet. Start searching!</div>';
        return;
      }

      container.innerHTML = friends.map(friend => `
        <div class="list-group-item d-flex justify-content-between align-items-center">
          <div class="d-flex align-items-center">
            <img src="${friend.avatar_url || '/images/default-avatar.png'}"
                 style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; margin-right: 10px;">
            <div>
              <div class="fw-bold">${friend.username}</div>
              <small class="text-muted">${friend.isOnline ? '🟢 Online' : '⚫ Offline'}</small>
            </div>
          </div>
          <button class="btn btn-sm btn-outline-danger" onclick="removeFriend('${friend.friendshipId}')">
            Remove
          </button>
        </div>
      `).join('');
    }
  } catch (error) {
    console.error('Error loading friends:', error);
  }
}

/**
 * Load friend requests
 */
async function loadFriendRequests() {
  try {
    const response = await apiRequest('/api/friends/requests');

    if (response.ok) {
      const data = await response.json();
      const requests = data.requests;

      const container = document.getElementById('friendRequestsContent');
      document.getElementById('requestsCount').textContent = requests.length;

      if (requests.length === 0) {
        container.innerHTML = '<div class="text-center text-muted py-4">No pending requests</div>';
        return;
      }

      container.innerHTML = requests.map(request => `
        <div class="list-group-item d-flex justify-content-between align-items-center">
          <div class="d-flex align-items-center">
            <img src="${request.avatar_url || '/images/default-avatar.png'}"
                 style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; margin-right: 10px;">
            <div>
              <div class="fw-bold">${request.username}</div>
              <small class="text-muted">Sent friend request</small>
            </div>
          </div>
          <div class="btn-group">
            <button class="btn btn-sm btn-success" onclick="acceptFriendRequest('${request.friendshipId}')">
              Accept
            </button>
            <button class="btn btn-sm btn-danger" onclick="rejectFriendRequest('${request.friendshipId}')">
              Reject
            </button>
          </div>
        </div>
      `).join('');
    }
  } catch (error) {
    console.error('Error loading friend requests:', error);
  }
}

/**
 * Search for friends
 */
async function searchFriends() {
  const query = document.getElementById('friendSearchInput').value.trim();
  const resultsContainer = document.getElementById('friendSearchResults');

  if (query.length < 2) {
    resultsContainer.innerHTML = '<div class="text-center text-muted py-4">Enter at least 2 characters to search</div>';
    return;
  }

  try {
    const response = await apiRequest(`/api/users/search?q=${encodeURIComponent(query)}`);

    if (response.ok) {
      const data = await response.json();
      const users = data.users;

      if (users.length === 0) {
        resultsContainer.innerHTML = '<div class="text-center text-muted py-4">No users found</div>';
        return;
      }

      resultsContainer.innerHTML = users.map(user => `
        <div class="list-group-item d-flex justify-content-between align-items-center">
          <div class="d-flex align-items-center">
            <img src="${user.avatar_url || '/images/default-avatar.png'}"
                 style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; margin-right: 10px;">
            <div>
              <div class="fw-bold">${user.username}</div>
              <small class="text-muted">${user.email}</small>
            </div>
          </div>
          <button class="btn btn-sm btn-primary" onclick="sendFriendRequest('${user.id}')">
            Add Friend
          </button>
        </div>
      `).join('');
    }
  } catch (error) {
    console.error('Search friends error:', error);
  }
}

/**
 * Send friend request
 */
async function sendFriendRequest(userId) {
  try {
    const response = await apiRequest(`/api/friends/request/${userId}`, {
      method: 'POST',
    });

    if (response.ok) {
      alert('Friend request sent! ✅');
      // Refresh search
      searchFriends();
    } else {
      const data = await response.json();
      alert(data.message || 'Failed to send friend request');
    }
  } catch (error) {
    console.error('Send friend request error:', error);
    alert('Network error. Please try again.');
  }
}

/**
 * Accept friend request
 */
async function acceptFriendRequest(friendshipId) {
  try {
    const response = await apiRequest(`/api/friends/accept/${friendshipId}`, {
      method: 'POST',
    });

    if (response.ok) {
      alert('Friend request accepted! 🎉');
      await loadFriendRequests();
      await loadFriendsList();
    } else {
      const data = await response.json();
      alert(data.message || 'Failed to accept friend request');
    }
  } catch (error) {
    console.error('Accept friend request error:', error);
    alert('Network error. Please try again.');
  }
}

/**
 * Reject friend request
 */
async function rejectFriendRequest(friendshipId) {
  try {
    const response = await apiRequest(`/api/friends/reject/${friendshipId}`, {
      method: 'POST',
    });

    if (response.ok) {
      alert('Friend request rejected');
      await loadFriendRequests();
    } else {
      const data = await response.json();
      alert(data.message || 'Failed to reject friend request');
    }
  } catch (error) {
    console.error('Reject friend request error:', error);
    alert('Network error. Please try again.');
  }
}

/**
 * Remove friend
 */
async function removeFriend(friendshipId) {
  if (!confirm('Are you sure you want to remove this friend?')) {
    return;
  }

  try {
    const response = await apiRequest(`/api/friends/${friendshipId}`, {
      method: 'DELETE',
    });

    if (response.ok) {
      alert('Friend removed');
      await loadFriendsList();
    } else {
      const data = await response.json();
      alert(data.message || 'Failed to remove friend');
    }
  } catch (error) {
    console.error('Remove friend error:', error);
    alert('Network error. Please try again.');
  }
}

/**
 * Close friends modal
 */
function closeFriendsModal() {
  document.getElementById('friendsModal').style.display = 'none';
}

// ========== GAME HISTORY ==========

let gameHistoryFilter = 'all';

/**
 * Show game history modal
 */
async function showGameHistoryModal() {
  document.getElementById('gameHistoryModal').style.display = 'flex';
  await loadGameHistory();
}

/**
 * Load game history
 */
async function loadGameHistory() {
  const container = document.getElementById('gameHistoryContent');
  container.innerHTML = '<div class="text-center text-muted py-4">Loading game history...</div>';

  try {
    const response = await apiRequest('/api/games/history/me');

    if (response.ok) {
      const data = await response.json();
      let games = data.games;

      // Apply filter
      if (gameHistoryFilter === 'won') {
        games = games.filter(g => g.winner_id === currentUser.id);
      } else if (gameHistoryFilter === 'lost') {
        games = games.filter(g => g.loser_id === currentUser.id && g.winner_id !== null);
      } else if (gameHistoryFilter === 'completed') {
        games = games.filter(g => g.status === 'completed');
      }

      if (games.length === 0) {
        container.innerHTML = '<div class="text-center text-muted py-4">No games found</div>';
        return;
      }

      container.innerHTML = games.map(game => {
        const isWinner = game.winner_id === currentUser.id;
        const statusClass = isWinner ? 'success' : 'danger';
        const statusText = game.status === 'completed' ? (isWinner ? 'Won' : 'Lost') : game.status;
        const date = new Date(game.created_at).toLocaleDateString();

        return `
          <div class="card mb-2">
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-center">
                <div>
                  <h6 class="mb-1">Game ${game.room_code}</h6>
                  <small class="text-muted">${date}</small>
                </div>
                <span class="badge bg-${statusClass}">${statusText}</span>
              </div>
              ${game.truth_dare_selection ? `<div class="mt-2"><small>Selection: <strong>${game.truth_dare_selection}</strong></small></div>` : ''}
            </div>
          </div>
        `;
      }).join('');
    }
  } catch (error) {
    console.error('Error loading game history:', error);
    container.innerHTML = '<div class="text-center text-danger py-4">Failed to load game history</div>';
  }
}

/**
 * Filter game history
 */
function filterGameHistory(filter) {
  gameHistoryFilter = filter;
  loadGameHistory();
}

/**
 * Close game history modal
 */
function closeGameHistoryModal() {
  document.getElementById('gameHistoryModal').style.display = 'none';
}

// ========== EMAIL INVITATION ==========

/**
 * Show email invitation modal
 */
function showEmailInviteModal() {
  if (!currentUser) {
    alert('Please login to send email invitations');
    showLoginModal();
    return;
  }

  if (!room) {
    alert('Please join or create a room first');
    return;
  }

  document.getElementById('emailInviteModal').style.display = 'flex';
  document.getElementById('inviteSuccess').style.display = 'none';
  document.getElementById('inviteError').style.display = 'none';
}

/**
 * Handle email invitation form submission
 */
async function handleEmailInvite(event) {
  event.preventDefault();

  const email = document.getElementById('inviteEmail').value;
  const message = document.getElementById('inviteMessage').value;
  const successDiv = document.getElementById('inviteSuccess');
  const errorDiv = document.getElementById('inviteError');

  successDiv.style.display = 'none';
  errorDiv.style.display = 'none';

  try {
    // Get current game ID from room
    // For now, we'll use the room code as gameId
    const response = await apiRequest(`/api/games/${room}/invite`, {
      method: 'POST',
      body: JSON.stringify({ email, message }),
    });

    if (response.ok) {
      successDiv.textContent = 'Invitation sent successfully! ✅';
      successDiv.style.display = 'block';
      document.getElementById('emailInviteForm').reset();

      setTimeout(() => {
        closeEmailInviteModal();
      }, 2000);
    } else {
      const data = await response.json();
      errorDiv.textContent = data.message || 'Failed to send invitation';
      errorDiv.style.display = 'block';
    }
  } catch (error) {
    console.error('Email invite error:', error);
    errorDiv.textContent = 'Network error. Please try again.';
    errorDiv.style.display = 'block';
  }
}

/**
 * Close email invitation modal
 */
function closeEmailInviteModal() {
  document.getElementById('emailInviteModal').style.display = 'none';
}

// ========== MODAL CONTROLS ==========

function showLoginModal() {
  document.getElementById('loginModal').style.display = 'flex';
  document.getElementById('loginError').style.display = 'none';
}

function closeLoginModal() {
  document.getElementById('loginModal').style.display = 'none';
}

function showSignupModal() {
  document.getElementById('signupModal').style.display = 'flex';
  document.getElementById('signupError').style.display = 'none';
}

function closeSignupModal() {
  document.getElementById('signupModal').style.display = 'none';
}

function showForgotPasswordModal() {
  closeLoginModal();
  document.getElementById('forgotPasswordModal').style.display = 'flex';
  document.getElementById('forgotPasswordSuccess').style.display = 'none';
  document.getElementById('forgotPasswordError').style.display = 'none';
}

function closeForgotPasswordModal() {
  document.getElementById('forgotPasswordModal').style.display = 'none';
}

// ========== INITIALIZATION ==========

// Load tokens on page load
window.addEventListener('DOMContentLoaded', () => {
  loadTokens();
});

// Export game client for use in client.js
window.getGameClient = () => gameClient;
window.getCurrentUser = () => currentUser;
window.getAccessToken = () => accessToken;
