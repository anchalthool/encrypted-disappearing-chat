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
        <div className="auth-card">
          <h2>{authMode === "login" ? "Login" : "Register"}</h2>
          <form onSubmit={handleAuthSubmit}>
            {authMode === "register" && (
              <input
                placeholder="Name"
                value={authForm.name}
                onChange={(e) =>
                  handleAuthChange("name", e.target.value)
                }
              />
            )}
            <input
              placeholder="Email"
              type="email"
              value={authForm.email}
              onChange={(e) =>
                handleAuthChange("email", e.target.value)
              }
            />
            <input
              placeholder="Password"
              type="password"
              value={authForm.password}
              onChange={(e) =>
                handleAuthChange("password", e.target.value)
              }
            />
            <button type="submit">
              {authMode === "login" ? "Login" : "Register"}
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
          <div className="sidebar-header">
            <div className="sidebar-header-user">
              <span>{user?.name}</span>
              <span>{user?.email}</span>
            </div>
            <div className="sidebar-header-buttons">
              <button onClick={handleLogout}>Logout</button>
            </div>
          </div>

          <div className="sidebar-create">
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
          </div>

          <div className="sidebar-list">
            {groups.length === 0 && (
              <div
                style={{
                  color: "#8696a0",
                  fontSize: "13px",
                  padding: "16px",
                }}
              >
                No groups yet. Create one above.
              </div>
            )}
            {groups.map((g) => (
              <div
                key={g.id}
                className={
                  "chat-list-item" +
                  (activeGroup && activeGroup.id === g.id ? " active" : "")
                }
                onClick={() => openGroup(g)}
              >
                <div className="chat-list-title">{g.name}</div>
                <div className="chat-list-meta">
                  {g.description || "No description"} ·{" "}
                  {g.status} · Exp:{" "}
                  {new Date(g.expiration_time).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Chat area */}
        <div className="chat">
          {!activeGroup && (
            <div className="chat-empty">
              <h2>Welcome to Dissolving Groups</h2>
              <p>
                Select a group on the left or create a new one to start an
                end-to-end encrypted chat that disappears after its expiry.
              </p>
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

  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
    <button
      type="button"
      onClick={handleCreateInvite}
      style={{
        background: "transparent",
        color: "#e9edef",
        border: "1px solid #2a3942",
        borderRadius: 4,
        padding: "6px 10px",
        fontSize: 12,
        cursor: "pointer",
      }}
    >
      Invite link
    </button>

    <form
      className="chat-header-passphrase"
      onSubmit={setupGroupKey}
    >
      <input
        type="password"
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
                  <div
                    style={{
                      textAlign: "center",
                      color: "#8696a0",
                      fontSize: "13px",
                      marginTop: "16px",
                    }}
                  >
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
