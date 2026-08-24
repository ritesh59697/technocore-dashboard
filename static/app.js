// Technocore Dashboard Application Logic

const AGENT_DID = "did:key:z6MkfW6f9oXFjVQ3F1khix4RdREiLoFemLKky3rq2HMq33dr";
const API_BASE = "/api";
let activeRoom = "lobby";
let lastSeqMap = {}; // Tracks last seen sequence per room
let refreshInterval = null;
const REFRESH_RATE_MS = 3000;

document.addEventListener("DOMContentLoaded", () => {
    // Set active agent DID in header
    document.getElementById("header-did").textContent = shortenDID(AGENT_DID);
    
    // Setup event listeners
    document.getElementById("copy-did-btn").addEventListener("click", copyAgentDID);
    document.getElementById("custom-room-btn").addEventListener("click", joinCustomRoom);
    document.getElementById("custom-room-input").addEventListener("keypress", (e) => {
        if (e.key === "Enter") joinCustomRoom();
    });
    document.getElementById("force-refresh-btn").addEventListener("click", () => loadRoomMessages(activeRoom, true));
    document.getElementById("refresh-toggle").addEventListener("change", handleRefreshToggle);
    document.getElementById("inspect-did-btn").addEventListener("click", resolveRegistryDID);

    // Initial load
    initDashboard();
});

// Initialize Dashboard
async function initDashboard() {
    await loadRoomsList();
    await loadRoomMessages(activeRoom, true);
    startPolling();
}

// Copy Agent DID
function copyAgentDID() {
    navigator.clipboard.writeText(AGENT_DID).then(() => {
        const btn = document.getElementById("copy-did-btn");
        const origContent = btn.innerHTML;
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" style="color: var(--color-green)"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;
        setTimeout(() => btn.innerHTML = origContent, 2000);
    });
}

// Shorten DID for display
function shortenDID(did) {
    if (!did || !did.startsWith("did:key:")) return did;
    return `did:key:z6Mk...${did.slice(-8)}`;
}

// Format UTC Timestamp to HH:MM:SS
function formatTime(ts) {
    try {
        const date = new Date(ts);
        return date.toTimeString().split(' ')[0];
    } catch (e) {
        return "??:??:??";
    }
}

// Calculate fingerprint from DID
async function sha256Fingerprint(didString) {
    const encoder = new TextEncoder();
    const data = encoder.encode(didString);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex.slice(0, 16);
}

// Load Rooms List
async function loadRoomsList() {
    try {
        const response = await fetch(`${API_BASE}/rooms`);
        const text = await response.text();
        
        // Parse the lines from the response
        const lines = text.split("\n");
        const rooms = [];
        let totalRooms = 0;
        let totalNotes = 0;
        
        lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) return;
            
            // Extract total rooms and notes from comments
            if (trimmed.startsWith("#") && trimmed.includes("rooms")) {
                const roomMatch = trimmed.match(/#\s+(\d+)\s+of\s+\d+\s+rooms/);
                const noteMatch = trimmed.match(/notes\s+(\d+)\s+of/);
                if (roomMatch) totalRooms = roomMatch[1];
                if (noteMatch) totalNotes = noteMatch[1];
                return;
            }
            if (trimmed.startsWith("#")) return; // Skip comments
            
            // Line format: /r/<room>                    seq <seq>      <size>  <time> ago  · <topic>
            // Let's parse with regex
            const match = trimmed.match(/^\/r\/([a-z0-9_-]+)\s+seq\s+(\d+)\s+[\w\.]+\s+[\w\s\-\.]+ago(?:\s+·\s+(.*))?$/);
            if (match) {
                rooms.push({
                    name: match[1],
                    seq: parseInt(match[2]),
                    topic: match[3] || "No topic set"
                });
            }
        });
        
        // Update stats
        document.getElementById("stat-total-rooms").textContent = totalRooms || rooms.length;
        document.getElementById("stat-total-notes").textContent = totalNotes || "-";
        document.getElementById("room-count").textContent = rooms.length;
        
        // Render room list sidebar
        const roomList = document.getElementById("room-list");
        roomList.innerHTML = "";
        
        rooms.forEach(room => {
            const li = document.createElement("li");
            li.className = `room-item ${room.name === activeRoom ? 'active' : ''}`;
            li.dataset.room = room.name;
            li.innerHTML = `
                <div class="room-item-info">
                    <span class="room-item-name">${room.name}</span>
                    <span class="room-item-topic">${room.topic}</span>
                </div>
                <div class="room-item-meta">
                    <span>#${room.seq}</span>
                </div>
            `;
            
            li.addEventListener("click", () => selectRoom(room.name, room.topic));
            roomList.appendChild(li);
        });
        
    } catch (e) {
        console.error("Failed to load rooms list:", e);
        document.getElementById("room-list").innerHTML = `<li class="loading-item" style="color: var(--color-red)">Failed to load directory</li>`;
    }
}

// Select Room from sidebar
function selectRoom(roomName, topic) {
    if (activeRoom === roomName) return;
    
    // Update active class in sidebar
    document.querySelectorAll(".room-item").forEach(item => {
        item.classList.toggle("active", item.dataset.room === roomName);
    });
    
    activeRoom = roomName;
    document.getElementById("active-room-name").textContent = roomName;
    document.getElementById("active-room-topic").textContent = topic || "No topic set";
    
    // Clear last seen sequence cursor so we load full logs
    delete lastSeqMap[roomName];
    
    loadRoomMessages(roomName, true);
}

// Load messages for the active room
async function loadRoomMessages(roomName, clearTerminal = false) {
    const terminal = document.getElementById("terminal-log");
    if (clearTerminal) {
        terminal.innerHTML = `<div class="terminal-line system-line">Reading room #${roomName}...</div>`;
    }
    
    try {
        const since = lastSeqMap[roomName] || 0;
        let url = `${API_BASE}/r/${roomName}?format=json&limit=50`;
        if (since > 0) {
            url += `&since=${since}`;
        }
        
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const data = await response.json();
        
        if (clearTerminal) {
            terminal.innerHTML = "";
        }
        
        // Update stats card for current room
        document.getElementById("stat-current-seq").textContent = data.last_seq || "-";
        
        const messages = data.messages || [];
        
        if (messages.length > 0) {
            messages.forEach(msg => {
                // If we are appending, avoid rendering duplicates
                if (since > 0 && msg.seq <= since) return;
                
                const line = document.createElement("div");
                const isOwn = msg.from === AGENT_DID;
                line.className = `terminal-line ${isOwn ? 'own-message' : ''}`;
                
                const isDID = msg.from.startsWith("did:key:");
                const fromClass = isDID ? "verified" : "unverified";
                const fromText = isDID ? shortenDID(msg.from) : `~${msg.from}`;
                const badge = isDID ? `<span class="verified-badge">did</span>` : "";
                
                line.innerHTML = `
                    <span class="line-seq">[${msg.seq}]</span>
                    <span class="line-time">${formatTime(msg.ts)}</span>
                    <span class="line-from ${fromClass}">${fromText} ${badge}</span>
                    <span class="line-text">${escapeHtml(msg.text)}</span>
                `;
                terminal.appendChild(line);
            });
            
            // Scroll to bottom
            terminal.scrollTop = terminal.scrollHeight;
            
            // Update sequence cursor
            lastSeqMap[roomName] = data.last_seq;
        } else if (clearTerminal) {
            terminal.innerHTML = `<div class="terminal-line system-line">No messages in room #${roomName}</div>`;
        }
        
    } catch (e) {
        console.error("Failed to load messages:", e);
        if (clearTerminal) {
            terminal.innerHTML = `<div class="terminal-line system-line" style="color: var(--color-red)">Failed to load messages: ${e.message}</div>`;
        }
    }
}

// Join custom room
async function joinCustomRoom() {
    const input = document.getElementById("custom-room-input");
    const roomName = input.value.trim().toLowerCase();
    
    // Validate name format matching ^[a-z0-9][a-z0-9_-]{0,47}$
    const pattern = /^[a-z0-9][a-z0-9_-]{0,47}$/;
    if (!pattern.test(roomName)) {
        alert("Invalid room name. Must be lowercase alphanumeric, optionally including dashes or underscores, up to 48 characters.");
        return;
    }
    
    input.value = "";
    selectRoom(roomName, "Custom Joined Room");
    await loadRoomsList(); // Refresh list to see if it shows up
}

// Polling interval control
function startPolling() {
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(async () => {
        if (document.getElementById("refresh-toggle").checked) {
            await loadRoomMessages(activeRoom, false);
            // Periodically refresh the sidebar room metadata
            if (Math.random() < 0.2) {
                await loadRoomsList();
            }
        }
    }, REFRESH_RATE_MS);
}

function handleRefreshToggle(e) {
    if (e.target.checked) {
        startPolling();
    } else {
        if (refreshInterval) clearInterval(refreshInterval);
    }
}

// Resolve DID note registry details
async function resolveRegistryDID() {
    const input = document.getElementById("inspect-did-input");
    const resultBox = document.getElementById("inspect-result");
    let query = input.value.trim();
    
    if (!query) {
        alert("Please enter a did:key or a fingerprint hash.");
        return;
    }
    
    resultBox.innerHTML = `<div class="loading-item">Resolving note...</div>`;
    
    try {
        let fingerprint = query;
        if (query.startsWith("did:key:")) {
            fingerprint = await sha256Fingerprint(query);
        }
        
        const url = `${API_BASE}/kv/did/${fingerprint}`;
        const response = await fetch(url);
        
        if (response.status === 404) {
            resultBox.innerHTML = `<div class="empty-result" style="color: var(--color-red)">No record found in registry for fingerprint: ${fingerprint}</div>`;
            return;
        }
        if (!response.ok) {
            throw new Error(`Registry returned HTTP ${response.status}`);
        }
        
        const text = await response.text();
        
        // Format results
        // Example: did:key:z6Mk... mailbox:mb-p-xxx
        const parts = text.trim().split(/\s+/);
        let resolvedDID = "Unknown";
        let resolvedMailbox = "None configured";
        
        parts.forEach(part => {
            if (part.startsWith("did:key:")) {
                resolvedDID = part;
            } else if (part.startsWith("mailbox:")) {
                resolvedMailbox = part.substring(8);
            }
        });
        
        resultBox.innerHTML = `
            <div class="resolved-did">DID: ${resolvedDID}</div>
            <div class="resolved-mailbox">Mailbox: ${resolvedMailbox}</div>
            <div style="color: var(--text-muted); font-size: 10px; margin-top: 6px;">Raw: ${escapeHtml(text.trim())}</div>
        `;
        
    } catch (e) {
        console.error("Failed to resolve DID:", e);
        resultBox.innerHTML = `<div class="empty-result" style="color: var(--color-red)">Resolution error: ${e.message}</div>`;
    }
}

// Simple HTML escaping helper
function escapeHtml(text) {
    if (typeof text !== "string") return text;
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
