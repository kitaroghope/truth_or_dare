/* ----------------------------------------------------------------
   Truth‑or‑Dare Chat Client – UPDATED VERSION
   ----------------------------------------------------------------
   Highlights of the refactor:
   • Username is persisted in localStorage.
   • Landing screen now shows a list of joinable rooms or “Create Room”.
   • Invite links (?group=room‑id) silently pre‑select the room and hide
     the list so the invitee only needs to enter a name.
   • All game events (RPS choice, Truth/Dare, win/lose) now appear in chat.
------------------------------------------------------------------ */

const socket = io();

let room = new URLSearchParams(window.location.search).get("group") || "";
let username = localStorage.getItem("td_username") || "";

const setupDiv = document.getElementById("setup");
const gameUI = document.getElementById("gameUI");
const roomLabel = document.getElementById("roomLabel");
const resultMessage = document.getElementById("resultMessage");
const chatSection = document.getElementById("chatSection");
const truthDarePrompt = document.getElementById("truthDarePrompt");
const chatLog = document.getElementById("chatLog");
const rpsSection = document.getElementById("rpsSection");
const receiverName = document.getElementById("receiverName");
const chatInput = document.getElementById("chatInput");
const fileInput = document.getElementById("fileInput");
const chatInputContainer = document.getElementById("chatInputContainer");
const newRoundContainer = document.getElementById("newRoundContainer");
const truthDareModal = document.getElementById("truthDareModal");
const modalMessage = document.getElementById("modalMessage");
const modalButtons = document.getElementById("modalButtons");
const modalWaiting = document.getElementById("modalWaiting");

let mediaRecorder;
let audioChunks = [];
let recordingTimer;
let recordingStartTime = 0;
let gameState = "waiting"; // waiting, playing, finished

function updateUIVisibility() {
  switch (gameState) {
    case "waiting":
      // Show RPS buttons, hide chat and new round button
      rpsSection.style.display = "block";
      chatSection.style.display = "none";
      chatInputContainer.style.display = "none";
      newRoundContainer.style.display = "none";
      break;
    case "playing":
      // Show RPS buttons, hide chat and new round button
      rpsSection.style.display = "block";
      chatSection.style.display = "none";
      chatInputContainer.style.display = "none";
      newRoundContainer.style.display = "none";
      break;
    case "finished":
      // Hide RPS buttons, show chat and new round button
      rpsSection.style.display = "none";
      chatSection.style.display = "block";
      chatInputContainer.style.display = "flex";
      newRoundContainer.style.display = "block";
      break;
  }
}

function appendSystemMessage(content) {
  const div = document.createElement("div");
  div.className = "message from-them";
  div.innerHTML = `<em>${content}</em>`;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function joinGame() {
  if (!room || !username) return;

  const url = `?group=${room}&user=${username}`;
  window.history.replaceState({}, "", url);

  setupDiv.style.display = "none";
  gameUI.style.display = "block";
  roomLabel.innerText = `Room: ${room}`;

  // Initialize game state
  gameState = "waiting";
  updateUIVisibility();

  socket.emit("joinRoom", { room, username });
}

function makeChoice(choice) {
  socket.emit("makeChoice", choice);
  resultMessage.innerText = "Waiting for other player...";
  resultMessage.className = "mt-4";
  
  // Update game state
  gameState = "playing";
  
  // Disable RPS buttons instead of hiding section
  const rpsButtons = document.querySelectorAll('.rps-button');
  rpsButtons.forEach(btn => {
    btn.disabled = true;
    btn.style.opacity = '0.5';
  });
  
  // Show loading spinner
  const loadingSpinner = document.createElement('div');
  loadingSpinner.className = 'loading-spinner mt-3';
  loadingSpinner.id = 'loadingSpinner';
  resultMessage.appendChild(loadingSpinner);

  // System message now handled by server
}

function sendTD(selection) {
  socket.emit("truthOrDare", selection);
  truthDarePrompt.style.display = "none";
  // System message now handled by server
}

function selectTruthDare(selection) {
  socket.emit("truthOrDare", selection);
  // Show waiting state immediately
  modalButtons.style.display = "none";
  modalWaiting.style.display = "flex";
  modalMessage.innerText = `You selected ${selection}. Wait for the winner to ask you a question.`;
}

function showTruthDareModal(type) {
  truthDareModal.style.display = "flex";
  
  if (type === "choose") {
    modalMessage.innerText = "You lost the round! Choose Truth or Dare to continue.";
    modalButtons.style.display = "flex";
    modalWaiting.style.display = "none";
  } else if (type === "waiting") {
    modalMessage.innerText = "You won! Wait for your opponent to choose Truth or Dare.";
    modalButtons.style.display = "none";
    modalWaiting.style.display = "flex";
  }
}

function hideTruthDareModal() {
  truthDareModal.style.display = "none";
  modalButtons.style.display = "flex";
  modalWaiting.style.display = "none";
}

function sendMessage() {
  const msg = chatInput.value.trim();
  const file = fileInput.files[0];
  
  // Send text message if there's text
  if (msg) {
    socket.emit("sendMessage", msg);
    chatInput.value = "";
  }

  // Send file if one is selected
  if (file) {
    const formData = new FormData();
    formData.append("file", file);

    fetch(`/upload/${room}/${username}`, {
      method: "POST",
      body: formData,
    }).then((res) => res.json()).then(() => {
      fileInput.value = "";
    }).catch((error) => {
      console.error("Error uploading file:", error);
      alert("Failed to upload file. Please try again.");
    });
  }
  
  // Only send if there's content (text or file)
  if (!msg && !file) {
    return;
  }
}

// Add Enter key support for chat input
function setupChatInput() {
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
}

function startNewRound() {
  socket.emit("startNewRound");
  resultMessage.innerText = "";
  resultMessage.className = "mt-4";
  
  // Update game state
  gameState = "waiting";
  updateUIVisibility();
  
  // Re-enable RPS buttons
  const rpsButtons = document.querySelectorAll('.rps-button');
  rpsButtons.forEach(btn => {
    btn.disabled = false;
    btn.style.opacity = '1';
  });
  
  // Remove loading spinner if it exists
  const loadingSpinner = document.getElementById('loadingSpinner');
  if (loadingSpinner) {
    loadingSpinner.remove();
  }
  
  truthDarePrompt.style.display = "none";
  hideTruthDareModal();
}

function appendMessage(msg) {
  const div = document.createElement("div");
  div.classList.add("message");

  // Handle system messages differently
  if (msg.type === "system") {
    div.classList.add("from-them");
    div.innerHTML = `<em>${msg.content}</em>`;
  } else {
    div.classList.add(msg.username === username ? "from-me" : "from-them");

    if (msg.type === "text") {
      div.innerHTML = `<strong>${msg.username}:</strong> ${msg.content}`;
    } else if (msg.type === "audio") {
      div.innerHTML = `<strong>${msg.username}:</strong><br><audio controls src="${msg.content}"></audio>`;
    } else {
      const fileType = msg.content.split('.').pop().toLowerCase();
      const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileType);
      const isVideo = ['mp4', 'webm', 'ogg', 'mov'].includes(fileType);

      if (isImage) {
        div.innerHTML = `<strong>${msg.username}:</strong><br><img src="${msg.content}" style="max-width: 200px; max-height: 200px; border-radius: 10px;" />`;
      } else if (isVideo) {
        div.innerHTML = `<strong>${msg.username}:</strong><br><video controls style="max-width: 200px; max-height: 200px; border-radius: 10px;" src="${msg.content}"></video>`;
      } else {
        div.innerHTML = `<strong>${msg.username}:</strong><br><a href="${msg.content}" target="_blank" class="file-message">📎 Download File</a>`;
      }
    }
  }

  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
}

let isRecording = false;

function updateRecordingTimer() {
  const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
  document.getElementById("recordingTimer").innerText = `Recording: ${elapsed}s`;
}

function toggleRecording() {
  // Ensure we're in a secure context for mobile
  if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
    alert('Voice recording requires HTTPS. Please use a secure connection.');
    return;
  }
  
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
}

function startRecording() {
  // Enhanced constraints for mobile compatibility
  const constraints = {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: 44100,
      channelCount: 1
    }
  };

  navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
    // Check if MediaRecorder is supported with different formats
    let mimeType = "audio/webm";
    if (!MediaRecorder.isTypeSupported("audio/webm")) {
      if (MediaRecorder.isTypeSupported("audio/mp4")) {
        mimeType = "audio/mp4";
      } else if (MediaRecorder.isTypeSupported("audio/ogg")) {
        mimeType = "audio/ogg";
      } else if (MediaRecorder.isTypeSupported("audio/wav")) {
        mimeType = "audio/wav";
      } else {
        mimeType = ""; // Let browser choose
      }
    }

    const options = mimeType ? { mimeType } : {};
    mediaRecorder = new MediaRecorder(stream, options);
    audioChunks = [];
    isRecording = true;

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      clearInterval(recordingTimer);
      document.getElementById("recordingIndicator").style.display = "none";
      document.getElementById("recordBtn").classList.remove("recording");
      document.getElementById("recordBtn").innerHTML = "🎤";
      isRecording = false;

      // Stop all audio tracks
      stream.getTracks().forEach(track => track.stop());

      if (audioChunks.length > 0) {
        const audioBlob = new Blob(audioChunks, { type: mimeType || "audio/webm" });
        const formData = new FormData();
        const fileName = `recording.${mimeType.split('/')[1] || 'webm'}`;
        formData.append("file", audioBlob, fileName);

        fetch(`/upload/${room}/${username}`, {
          method: "POST",
          body: formData,
        }).catch((error) => {
          console.error("Error uploading audio:", error);
          alert("Failed to upload audio recording. Please try again.");
        });
      }
    };

    mediaRecorder.onerror = (event) => {
      console.error("MediaRecorder error:", event.error);
      alert("Recording failed. Please try again.");
      isRecording = false;
      stream.getTracks().forEach(track => track.stop());
    };

    // Start recording with timeslice for mobile compatibility
    mediaRecorder.start(1000); // Record in 1-second chunks
    recordingStartTime = Date.now();
    recordingTimer = setInterval(updateRecordingTimer, 1000);
    
    // Update UI
    document.getElementById("recordingIndicator").style.display = "flex";
    document.getElementById("recordBtn").classList.add("recording");
    document.getElementById("recordBtn").innerHTML = "⏹️";
  }).catch((error) => {
    console.error("Error accessing microphone:", error);
    let errorMessage = "Could not access microphone. ";
    
    if (error.name === 'NotAllowedError') {
      errorMessage += "Please allow microphone access and try again.";
    } else if (error.name === 'NotFoundError') {
      errorMessage += "No microphone found on this device.";
    } else if (error.name === 'NotSupportedError') {
      errorMessage += "Audio recording is not supported on this device.";
    } else {
      errorMessage += "Please check your permissions and try again.";
    }
    
    alert(errorMessage);
  });
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
    // Stop all audio tracks
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
  }
}

if (room) {
  document.getElementById("groupInput").value = room;
}

if (room && username) {
  joinGame();
}

socket.on("nameExists", () => alert("Username already taken in this room."));
socket.on("roomFull", () => alert("Room is full. Max 2 players."));
socket.on("playerUpdate", (players) => {
  const other = players.find((p) => p !== username);
  receiverName.innerText = other ? `Talking to: ${other}` : "Waiting for opponent...";
});
socket.on("result", ({ message }) => {
  // Remove loading spinner
  const loadingSpinner = document.getElementById('loadingSpinner');
  if (loadingSpinner) {
    loadingSpinner.remove();
  }
  
  resultMessage.innerText = message;
  
  // Add appropriate styling based on result
  if (message.includes("You win")) {
    resultMessage.className = "mt-4 result-win";
    gameState = "finished";
    updateUIVisibility();
  } else if (message.includes("You lose")) {
    resultMessage.className = "mt-4 result-lose";
    gameState = "finished";
    updateUIVisibility();
    // Modal will be shown by server event
  } else if (message.includes("tie")) {
    resultMessage.className = "mt-4 result-tie";
    gameState = "waiting";
    updateUIVisibility();
    // Re-enable buttons for tie
    const rpsButtons = document.querySelectorAll('.rps-button');
    rpsButtons.forEach(btn => {
      btn.disabled = false;
      btn.style.opacity = '1';
    });
  }

  // System message now handled by server
});
socket.on("chatVisible", (visible) => {
  // The server controls chat visibility, but we now manage it through game state
  if (visible && gameState !== "finished") {
    gameState = "finished";
    updateUIVisibility();
  } else if (!visible && gameState === "finished") {
    gameState = "waiting";
    updateUIVisibility();
  }
});
socket.on("truthOrDareResponse", ({ username, selection }) => {
  // System message now handled by server via newMessage event
});
socket.on("showTruthDareModal", ({ type }) => {
  showTruthDareModal(type);
});
socket.on("hideTruthDareModal", () => {
  hideTruthDareModal();
});
socket.on("newMessage", appendMessage);
socket.on("previousMessages", (msgs) => msgs.forEach(appendMessage));

// NEW: Full state restoration after reconnection
socket.on("fullStateRestoration", (state) => {
  console.log("✅ Restoring full game state:", state);

  // Restore game phase
  gameState = state.gameState || "waiting";

  // Restore UI visibility based on phase
  if (state.chatVisible) {
    chatSection.style.display = "block";
    chatInputContainer.style.display = "flex";
    newRoundContainer.style.display = "block";
    rpsSection.style.display = "none";
    gameState = "finished";
  } else {
    chatSection.style.display = "none";
    chatInputContainer.style.display = "none";
    newRoundContainer.style.display = "none";
    rpsSection.style.display = "block";
  }

  // Update UI based on current game state
  updateUIVisibility();

  // Restore result message if there's a winner/loser
  if (state.isWinner) {
    resultMessage.innerText = "You win! You may ask a truth or give a dare.";
    resultMessage.className = "mt-4 result-win";
  } else if (state.isLoser) {
    resultMessage.innerText = "You lose! Choose Truth or Dare.";
    resultMessage.className = "mt-4 result-lose";
  }

  // Restore Truth/Dare modal state if needed
  if (state.awaitingTruthDare && !state.truthDareSelection) {
    if (state.isLoser) {
      showTruthDareModal("choose");
    } else if (state.isWinner) {
      showTruthDareModal("waiting");
    }
  } else {
    hideTruthDareModal();
  }

  // Restore button states
  const rpsButtons = document.querySelectorAll('.rps-button');
  if (state.gamePhase === 'choosing' && state.userChoice) {
    // User already made a choice - show waiting state
    rpsButtons.forEach(btn => {
      btn.disabled = true;
      btn.style.opacity = '0.5';
    });
    resultMessage.innerText = "Waiting for other player...";
  } else if (state.gamePhase === 'lobby' || state.gamePhase === 'waiting') {
    // Enable buttons for new choice
    rpsButtons.forEach(btn => {
      btn.disabled = false;
      btn.style.opacity = '1';
    });
  }

  console.log(`✅ State restored: phase=${state.gamePhase}, chatVisible=${state.chatVisible}`);
});

socket.on("clearResultMessage", () => {
  resultMessage.innerText = "";
  resultMessage.className = "mt-4";
});
socket.on("gameStateUpdate", ({ state }) => {
  gameState = state;
  updateUIVisibility();
  
  if (state === "waiting") {
    // Re-enable RPS buttons
    const rpsButtons = document.querySelectorAll('.rps-button');
    rpsButtons.forEach(btn => {
      btn.disabled = false;
      btn.style.opacity = '1';
    });
    
    // Remove loading spinner if it exists
    const loadingSpinner = document.getElementById('loadingSpinner');
    if (loadingSpinner) {
      loadingSpinner.remove();
    }
  }
});

window.addEventListener("DOMContentLoaded", () => {
  // Setup room list functionality
  setupRoomList();
  
  // Setup username saving
  setupUsernameHandling();
  
  // Setup chat input
  setupChatInput();
  
  // Setup file input change handler
  setupFileInput();
  
  // Check microphone support
  checkMicrophoneSupport();
});

function setupRoomList() {
  const roomsList = document.getElementById('roomsList');
  const createRoomBtn = document.getElementById('createRoomBtn');
  
  // Request available rooms
  socket.emit('getRooms');
  
  createRoomBtn.addEventListener('click', () => {
    const roomId = generateRoomId();
    room = roomId;
    if (username) {
      joinGame();
    } else {
      alert('Please enter a username first!');
    }
  });
  
  // Handle room list updates
  socket.on('roomsList', (rooms) => {
    roomsList.innerHTML = '';
    if (rooms.length === 0) {
      roomsList.innerHTML = '<li class="list-group-item text-center text-muted">No rooms available. Create one!</li>';
    } else {
      rooms.forEach(roomId => {
        const roomItem = document.createElement('li');
        roomItem.className = 'list-group-item room-item';
        roomItem.innerHTML = `
          <div class="d-flex justify-content-between align-items-center">
            <span>🏠 Room: ${roomId}</span>
            <button class="btn btn-sm btn-outline-primary" onclick="joinRoom('${roomId}')">Join</button>
          </div>
        `;
        // roomsList.appendChild(roomItem);
        console.log(roomId);
      });
    }
  });
}

function setupUsernameHandling() {
  const usernameInput = document.getElementById('usernameInput');
  const saveUsernameBtn = document.getElementById('saveUsernameBtn');
  const usernameRow = document.getElementById('usernameRow');
  const greetingMessage = document.getElementById('greetingMessage');
  const greetingUsername = document.getElementById('greetingUsername');
  const changeUsernameBtn = document.getElementById('changeUsernameBtn');

  // Function to show greeting and hide username input
  function showGreeting() {
    if (username) {
      greetingUsername.innerText = username;
      // Show greeting
      greetingMessage.classList.remove('d-none');
      // Hide username input
      usernameRow.classList.add('d-none');
    }
  }

  // Function to show username input and hide greeting
  function showUsernameInput() {
    // Hide greeting
    greetingMessage.classList.add('d-none');
    // Show username input
    usernameRow.classList.remove('d-none');
    usernameInput.value = username || '';
    usernameInput.disabled = false;
    saveUsernameBtn.innerText = 'Save Name';
    saveUsernameBtn.disabled = false;
    setTimeout(() => usernameInput.focus(), 100);
  }

  // Load saved username and show greeting if exists
  if (username) {
    showGreeting();
  } else {
    showUsernameInput();
  }

  // Save username button
  saveUsernameBtn.addEventListener('click', () => {
    const inputUsername = usernameInput.value.trim();
    if (inputUsername) {
      username = inputUsername;
      localStorage.setItem('td_username', username);
      showGreeting();

      // If room is already selected, join automatically
      if (room) {
        joinGame();
      }
    } else {
      alert('Please enter a valid username!');
    }
  });

  // Change username button
  changeUsernameBtn.addEventListener('click', () => {
    showUsernameInput();
  });

  // Allow enter key to save username
  usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      saveUsernameBtn.click();
    }
  });
}

function generateRoomId() {
  return 'room_' + Math.random().toString(36).substr(2, 9);
}

function joinRoom(roomId) {
  if (!username) {
    alert('Please enter a username first!');
    return;
  }
  room = roomId;
  joinGame();
}

function setupFileInput() {
  const fileInput = document.getElementById('fileInput');
  
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      const file = e.target.files[0];
      const fileName = file.name;
      const fileSize = (file.size / 1024 / 1024).toFixed(2); // Size in MB
      
      // Show file selected feedback
      const chatInput = document.getElementById('chatInput');
      chatInput.placeholder = `📎 ${fileName} (${fileSize}MB) selected - Press Enter to send`;
      
      // Auto-send file after a short delay if no text is being typed
      setTimeout(() => {
        if (chatInput.value.trim() === '') {
          sendMessage();
          chatInput.placeholder = 'Type a message...';
        }
      }, 1000);
    }
  });
}

function checkMicrophoneSupport() {
  const recordBtn = document.getElementById('recordBtn');
  
  // Check if MediaRecorder is supported
  if (!window.MediaRecorder) {
    recordBtn.classList.add('disabled');
    recordBtn.title = 'Audio recording not supported on this browser';
    recordBtn.onclick = () => alert('Audio recording is not supported on this browser.');
    return;
  }
  
  // Check if getUserMedia is supported
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    recordBtn.classList.add('disabled');
    recordBtn.title = 'Microphone access not supported on this browser';
    recordBtn.onclick = () => alert('Microphone access is not supported on this browser.');
    return;
  }
  
  // For iOS Safari, check if running in HTTPS or localhost
  const isIOSSafari = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isSecureContext = window.location.protocol === 'https:' || window.location.hostname === 'localhost';
  
  if (isIOSSafari && !isSecureContext) {
    recordBtn.classList.add('disabled');
    recordBtn.title = 'HTTPS required for microphone access on iOS';
    recordBtn.onclick = () => alert('Voice recording requires HTTPS on iOS Safari.');
    console.warn('Microphone access requires HTTPS on iOS Safari');
    return;
  }
  
  // Test microphone access on first user interaction
  recordBtn.addEventListener('click', function testMicOnFirstUse() {
    if (!isRecording && !recordBtn.classList.contains('disabled')) {
      // Remove this event listener after first use
      recordBtn.removeEventListener('click', testMicOnFirstUse);
      
      // Test microphone access
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
          // Success - microphone works
          stream.getTracks().forEach(track => track.stop());
          console.log('Microphone access confirmed');
        })
        .catch(error => {
          console.error('Microphone test failed:', error);
          if (error.name === 'NotAllowedError') {
            alert('Please allow microphone access in your browser settings to use voice recording.');
          }
        });
    }
  }, { once: true });
}

function inviteToRoom() {
  if (!room) {
    alert('No room to invite to!');
    return;
  }
  
  const inviteUrl = `${window.location.origin}?group=${room}`;
  
  // Try to use the Web Share API first (native sharing)
  if (navigator.share) {
    navigator.share({
      title: '🎲 Truth or Dare Game',
      text: 'Join my Truth or Dare game room!',
      url: inviteUrl
    }).then(() => {
      console.log('Successfully shared invite link');
    }).catch((error) => {
      console.log('Error sharing:', error);
      // Fallback to clipboard copy if sharing was cancelled or failed
      fallbackToClipboard(inviteUrl);
    });
  } else {
    // Fallback for browsers that don't support Web Share API
    fallbackToClipboard(inviteUrl);
  }
}

function fallbackToClipboard(inviteUrl) {
  // Try to use the modern clipboard API
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(inviteUrl).then(() => {
      alert('Invite link copied to clipboard!\n\nShare this link with others to invite them to your room.');
    }).catch(() => {
      // Fallback to manual copy modal
      showInviteLink(inviteUrl);
    });
  } else {
    // Fallback for browsers that don't support clipboard API
    showInviteLink(inviteUrl);
  }
}

function showInviteLink(inviteUrl) {
  // Create a temporary modal-like dialog
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-title">📤 Invite Link</div>
      <div class="modal-message">
        Share this link with others to invite them to your room:
        <br><br>
        <input type="text" value="${inviteUrl}" readonly 
               style="width: 100%; padding: 0.5rem; border: 1px solid #ddd; border-radius: 5px; font-size: 0.9rem; background: #f8f9fa;" 
               onclick="this.select()" />
      </div>
      <div class="modal-buttons">
        <button class="modal-btn modal-btn-truth" onclick="copyInviteLink('${inviteUrl}')">
          📋 Copy Link
        </button>
        <button class="modal-btn modal-btn-dare" onclick="this.parentElement.parentElement.parentElement.remove()">
          ✅ Done
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  // Auto-select the URL text
  const input = modal.querySelector('input');
  setTimeout(() => input.select(), 100);
}

function copyInviteLink(url) {
  // Try clipboard API first
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      alert('Link copied to clipboard!');
    }).catch(() => {
      // Fallback to document.execCommand
      fallbackCopyTextToClipboard(url);
    });
  } else {
    // Fallback for older browsers
    fallbackCopyTextToClipboard(url);
  }
}

function fallbackCopyTextToClipboard(text) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-999999px';
  textArea.style.top = '-999999px';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  
  try {
    document.execCommand('copy');
    alert('Link copied to clipboard!');
  } catch (err) {
    alert('Unable to copy link automatically. Please copy it manually.');
  }
  
  document.body.removeChild(textArea);
}
