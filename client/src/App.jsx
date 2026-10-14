import React, { useState, useEffect } from "react";
import "./App.css";
import { apiRequest } from "./api";
import {
  deriveKeyFromPassphrase,
  getSaltForGroup,
  encryptMessage,
  decryptMessage,
} from "./crypto";

function App() {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);

  const [showCreate, setShowCreate] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({
    name: "",
    email: "",
    password: "",
  });

  const [groups, setGroups] = useState([]);
  const [newGroup, setNewGroup] = useState({
    name: "",
    description: "",
    expiryOption: "1d",
    customDateTime: "",
  });

  const [activeGroup, setActiveGroup] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");

  const [passphrase, setPassphrase] = useState("");
  const [groupKey, setGroupKey] = useState(null);
  const [joiningGroup, setJoiningGroup] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [pendingJoinToken, setPendingJoinToken] = useState(null);


  const handleAuthChange = (field, value) => {
    setAuthForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    try {
      const path =
        authMode === "login" ? "/auth/login" : "/auth/register";

      const body =
        authMode === "login"
          ? {
              email: authForm.email,
              password: authForm.password,
            }
          : {
              name: authForm.name,
              email: authForm.email,
              password: authForm.password,
            };

      const data = await apiRequest(path, "POST", body);
      setToken(data.token);
      setUser(data.user);
      // fetch groups after login
    } catch (err) {
      alert(err.message);
    }
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    setGroups([]);
    setActiveGroup(null);
    setMessages([]);
    setGroupKey(null);
    setPassphrase("");
  };
  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith("/join/")) {
      const token = path.split("/join/")[1];
      if (token) {
        setPendingJoinToken(token);
      }
    }
  }, []);
  
  const fetchGroups = async () => {
    if (!token) return;
    try {
      const data = await apiRequest("/groups", "GET", null, token);
      setGroups(data.groups || []);
    } catch (err) {
      console.error(err);
      alert("Failed to load groups");
    }
  };

  useEffect(() => {
    if (token) {
      fetchGroups();
    }
  }, [token]);

  useEffect(() => {
    async function joinIfNeeded() {
      if (pendingJoinToken && token) {
        try {
          const data = await apiRequest(
            `/invites/${pendingJoinToken}/join`,
            "POST",
            {},
            token
          );
  
          const group = data.group;
  
          // Add group to list if not present
          setGroups((prev) => {
            const exists = prev.some((g) => g.id === group.id);
            if (exists) return prev;
            return [group, ...prev];
          });
  
          setActiveGroup(group);
          // Clear token & URL
          setPendingJoinToken(null);
          window.history.replaceState(null, "", "/");
        } catch (err) {
          alert(err.message);
          setPendingJoinToken(null);
          window.history.replaceState(null, "", "/");
        }
      }
    }
    joinIfNeeded();
  }, [pendingJoinToken, token]);
  

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!newGroup.name) {
      alert("Group name is required");
      return;
    }

    let expirationTime = new Date();

    if (newGroup.expiryOption === "1d") {
      expirationTime.setDate(expirationTime.getDate() + 1);
    } else if (newGroup.expiryOption === "7d") {
      expirationTime.setDate(expirationTime.getDate() + 7);
    } else if (newGroup.expiryOption === "custom") {
      if (!newGroup.customDateTime) {
        alert("Please select a custom date & time");
        return;
      }
      const custom = new Date(newGroup.customDateTime);
      if (isNaN(custom.getTime())) {
        alert("Invalid custom date");
        return;
      }
      expirationTime = custom;
    }

    try {
      const body = {
        name: newGroup.name,
        description: newGroup.description,
        expirationTime: expirationTime.toISOString(),
      };

      const data = await apiRequest("/groups", "POST", body, token);
      setGroups((prev) => [data.group, ...prev]);

      setShowCreate(false);
      openGroup(data.group);
      setNewGroup({
        name: "",
        description: "",
        expiryOption: "1d",
        customDateTime: "",
      });
    } catch (err) {
      alert(err.message);
    }
  };

  const openGroup = (group) => {
    setActiveGroup(group);
    setInviteLink("");
    setNewMessage("");
    setMessages([]);
    setPassphrase("");
    setGroupKey(null);
  };

  const setupGroupKey = async (e) => {
    e.preventDefault();
    if (!passphrase || !activeGroup) return;
    setJoiningGroup(true);
    try {
      const salt = getSaltForGroup(activeGroup.id);
      const key = await deriveKeyFromPassphrase(passphrase, salt);
      setGroupKey(key);

      const data = await apiRequest(
        `/groups/${activeGroup.id}/messages`,
        "GET",
        null,
        token
      );

      const decrypted = await Promise.all(
        (data.messages || []).map(async (m) => {
          const text = await decryptMessage(m.ciphertext, m.iv, key);
          return { ...m, text };
        })
      );
      setMessages(decrypted);
    } catch (err) {
      console.error(err);
      alert("Failed to derive key or load messages");
    } finally {
      setJoiningGroup(false);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !groupKey || !activeGroup) return;

    try {
      const { ciphertext, iv } = await encryptMessage(newMessage, groupKey);

      const data = await apiRequest(
        `/groups/${activeGroup.id}/messages`,
        "POST",
        { ciphertext, iv },
        token
      );

      const msg = {
        ...data.message,
        sender_name: user.name,
        text: newMessage,
      };

      setMessages((prev) => [...prev, msg]);
      setNewMessage("");
    } catch (err) {
      console.error(err);
      alert("Failed to send message");
    }
  };
  const handleCreateInvite = async () => {
    if (!activeGroup) return;
    try {
      const data = await apiRequest(
        `/groups/${activeGroup.id}/invite`,
        "POST",
        null,
        token
      );
      const link = `${window.location.origin}/join/${data.token}`;
      setInviteLink(link);
  
      try {
        await navigator.clipboard.writeText(link);
        alert("Invite link copied to clipboard");
      } catch {
        // Clipboard might fail on some browsers
        alert("Invite link created. Copy it from the header.");
      }
    } catch (err) {
      alert(err.message);
    }
  };
  
  // ========== AUTH VIEW ==========
  if (!token) {
    return (
      <div className="auth-page">
        <section className="auth-story">
          <div className="brand"><span className="brand-mark">d</span> dissolve<span className="brand-dot">.</span></div>
          <div className="eyebrow">A LITTLE MORE PRIVATE</div>
          <h1>Good conversations.<br />Small footprint.</h1>
          <p>A space for your people, with encrypted group chats that expire on your terms.</p>
          <div className="conversation-preview" aria-hidden="true">
            <div className="preview-top"><span className="preview-avatar">W</span><div>Weekend plans<small>Private group · expires in 7 days</small></div><span className="preview-live">●</span></div>
            <div className="preview-message">Same place, same people? <small>10:42</small></div>
            <div className="preview-message mine">Wouldn’t miss it. ☀ <small>10:43</small></div>
            <div className="preview-note">Just between you and your people.</div>
          </div>
          <div className="story-tags"><span>Browser-side encryption</span><span>Time-bound groups</span></div>
        </section>
        <div className="auth-card">
          <div className="eyebrow">YOUR PRIVATE SPACE</div>
          <h2>{authMode === "login" ? "Welcome back." : "Make yourself at home."}</h2>
          <p className="auth-description">{authMode === "login" ? "Sign in to pick up the conversation." : "Create an account and bring your people together."}</p>
          <form onSubmit={handleAuthSubmit}>
            {authMode === "register" && (
              <input
                aria-label="Your name"
                autoComplete="name"
                required
                placeholder="Your name"
                value={authForm.name}
                onChange={(e) =>
                  handleAuthChange("name", e.target.value)
                }
              />
            )}
            <input
              aria-label="Email address"
              autoComplete="email"
              required
              placeholder="Email address"
              type="email"
              value={authForm.email}
              onChange={(e) =>
                handleAuthChange("email", e.target.value)
              }
            />
            <input
              aria-label="Password"
              autoComplete={authMode === "login" ? "current-password" : "new-password"}
              required
              placeholder="Password"
              type="password"
              value={authForm.password}
              onChange={(e) =>
                handleAuthChange("password", e.target.value)
              }
            />
            <button type="submit">
              {authMode === "login" ? "Sign in →" : "Create account →"}
            </button>
          </form>
          <div className="switch">
            {authMode === "login" ? "New here?" : "Already have an account?"}
            <button
              type="button"
              onClick={() =>
                setAuthMode((m) => (m === "login" ? "register" : "login"))
              }
            >
              {authMode === "login" ? "Create an account" : "Login"}
            </button>
          </div>
          <div className="auth-footnote">Your messages are encrypted in your browser.</div>
        </div>
      </div>
    );
  }

  // ========== MAIN WHATSAPP-LIKE LAYOUT ==========
  return (
    <div className="app">
      <div className="app-body">
        {/* Sidebar */}
        <div className="sidebar">
          <div className="brand sidebar-brand"><span className="brand-mark">d</span> dissolve<span className="brand-dot">.</span></div>
          <div className="sidebar-header">
            <span className="user-avatar">{user?.name?.slice(0, 1).toUpperCase()}</span>
            <div className="sidebar-header-user">
              <span>{user?.name}</span>
              <span>{user?.email}</span>
            </div>
            <div className="sidebar-header-buttons">
              <button onClick={handleLogout}>Logout</button>
            </div>
          </div>

          <div className="sidebar-section-title"><h2>Your conversations <span>{groups.length}</span></h2><button className="new-group-button" onClick={() => setShowCreate(!showCreate)} aria-expanded={showCreate}>{showCreate ? "Close" : "+ New"}</button></div>
          {showCreate && <div className="sidebar-create">
            <form onSubmit={handleCreateGroup}>
              <input
                placeholder="New group name"
                value={newGroup.name}
                onChange={(e) =>
                  setNewGroup((prev) => ({
                    ...prev,
                    name: e.target.value,
                  }))
                }
              />
              <input
                placeholder="Description (optional)"
                value={newGroup.description}
                onChange={(e) =>
                  setNewGroup((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
              />
              <select
                value={newGroup.expiryOption}
                onChange={(e) =>
                  setNewGroup((prev) => ({
                    ...prev,
                    expiryOption: e.target.value,
                  }))
                }
              >
                <option value="1d">Expire in 1 day</option>
                <option value="7d">Expire in 7 days</option>
                <option value="custom">Custom date & time</option>
              </select>
              {newGroup.expiryOption === "custom" && (
                <input
                  type="datetime-local"
                  value={newGroup.customDateTime}
                  onChange={(e) =>
                    setNewGroup((prev) => ({
                      ...prev,
                      customDateTime: e.target.value,
                    }))
                  }
                />
              )}
              <button type="submit">Create group</button>
            </form>
          </div>}

          <div className="sidebar-list">
            {groups.length === 0 && (
              <div className="list-empty"><span className="empty-small-icon">＋</span><strong>Your people belong here.</strong><p>Create a group to start your first private conversation.</p><button onClick={() => setShowCreate(true)}>Create a group →</button></div>
            )}
            {groups.map((g) => (
              <button
                type="button"
                key={g.id}
                className={
                  "chat-list-item" +
                  (activeGroup && activeGroup.id === g.id ? " active" : "")
                }
                onClick={() => openGroup(g)}
              >
                <span className="group-avatar">{g.name.slice(0, 1).toUpperCase()}</span>
                <div className="group-details"><div className="chat-list-title">{g.name}</div>
                <div className="chat-list-meta">
                  {g.description || "A private space for your people"}
                  <span className="group-expiry">{g.status} · Expires {new Date(g.expiration_time).toLocaleDateString()}</span>
                </div></div>
              </button>
            ))}
          </div>
          <div className="sidebar-footer"><span className="status-dot" /> Encrypted. Ephemeral. Yours.</div>
        </div>

        {/* Chat area */}
        <div className="chat">
          {!activeGroup && (
            <div className="chat-empty">
              <div className="empty-art" aria-hidden="true"><span>◌</span><div className="empty-art-bubble">hello.</div><div className="empty-art-spark">✳</div></div>
              <div className="eyebrow">ROOM FOR REAL CONVERSATIONS</div>
              <h2>A little space for your people.</h2>
              <p>
                Choose a conversation or create a group. Share the moments
                that matter, then let the space expire.
              </p>
              <button className="empty-create" onClick={() => setShowCreate(true)}>+ Create your first group</button>
              <div className="empty-caption">Messages encrypted in your browser · Access ends at expiry</div>
            </div>
          )}

          {activeGroup && (
            <>
             <div className="chat-header">
  <div className="chat-header-info">
    <span>{activeGroup.name}</span>
    <span>
      Expires:{" "}
      {new Date(activeGroup.expiration_time).toLocaleString()}{" "}
      • Status: {activeGroup.status}
      {inviteLink && (
        <>
          {" "}
          • Invite:{" "}
          <span style={{ color: "#00a884" }}>
            {inviteLink}
          </span>
        </>
      )}
    </span>
  </div>

  <div className="chat-header-actions">
    <button
      type="button"
      onClick={handleCreateInvite}
      className="invite-button"
    >
      Invite link
    </button>

    <form
      className="chat-header-passphrase"
      onSubmit={setupGroupKey}
    >
      <input
        type="password"
        aria-label="Group passphrase"
        placeholder="Group passphrase"
        value={passphrase}
        onChange={(e) => setPassphrase(e.target.value)}
      />
      <button type="submit" disabled={joiningGroup}>
        {joiningGroup ? "Loading..." : "Unlock"}
      </button>
    </form>
  </div>
</div>


              <div className="chat-body">
                {messages.length === 0 && (
                  <div className="message-empty" role="status">
                    {groupKey
                      ? "No messages yet. Start the conversation!"
                      : "Enter the group passphrase to decrypt messages."}
                  </div>
                )}

                {messages.map((m) => {
                  const isMe = m.user_id === user?.id;
                  const timeStr = new Date(
                    m.created_at
                  ).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  });

                  return (
                    <div
                      key={m.id}
                      className={
                        "message " +
                        (isMe ? "message-from-me" : "message-from-others")
                      }
                    >
                      {!isMe && (
                        <div className="message-sender">
                          {m.sender_name || "Unknown"}
                        </div>
                      )}
                      <div>{m.text}</div>
                      <div className="message-time">{timeStr}</div>
                    </div>
                  );
                })}
              </div>

              <form className="chat-input" onSubmit={handleSendMessage}>
                <input
                  aria-label="Message"
                  placeholder={
                    groupKey
                      ? "Type a message"
                      : "Unlock with passphrase to send"
                  }
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  disabled={!groupKey}
                />
                <button type="submit" disabled={!groupKey || !newMessage.trim()}>
                  Send
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
