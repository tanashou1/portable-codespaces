/**
 * app.js – Portable Codespaces
 * Single-file SPA logic: navigation, GitHub API, GitHub Models chat, code viewer.
 */
(function () {
  'use strict';

  /* ============================================================
     STATE
     ============================================================ */
  const state = {
    token: localStorage.getItem('pc_token') || '',
    messages: [],
    systemPrompt:
      localStorage.getItem('pc_system_prompt') ||
      'あなたはGitHub Codespacesを使って開発するプログラマーをサポートするAIアシスタントです。コードの説明、デバッグ、最適化、設計アドバイスなどを日本語でサポートします。コードブロックは必ずmarkdownの```で囲んで回答してください。',
    currentRepo: null,
    currentRef: 'main',
    isLoading: false,
  };

  // Restore persisted messages (keep last 60)
  try {
    const saved = JSON.parse(localStorage.getItem('pc_messages') || '[]');
    state.messages = Array.isArray(saved) ? saved.slice(-60) : [];
  } catch (_) {}

  /* ============================================================
     GITHUB REST API
     ============================================================ */
  async function githubFetch(path, opts = {}) {
    if (!state.token) throw new Error('トークンが設定されていません');
    const res = await fetch('https://api.github.com' + path, {
      ...opts,
      headers: {
        Authorization: 'Bearer ' + state.token,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(opts.headers || {}),
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || 'HTTP ' + res.status);
    }
    return res.json();
  }

  function getAuthUser() {
    return githubFetch('/user');
  }

  function listCodespaces() {
    return githubFetch('/user/codespaces').then((d) => d.codespaces || []);
  }

  function getRepoContents(owner, repo, path, ref) {
    const q = ref ? '?ref=' + encodeURIComponent(ref) : '';
    return githubFetch('/repos/' + owner + '/' + repo + '/contents/' + path + q);
  }

  async function getFileText(owner, repo, path, ref) {
    const q = ref ? '?ref=' + encodeURIComponent(ref) : '';
    const data = await githubFetch(
      '/repos/' + owner + '/' + repo + '/contents/' + path + q
    );
    if (data.encoding === 'base64') {
      try {
        return atob(data.content.replace(/\n/g, ''));
      } catch (_) {
        throw new Error('ファイルのデコードに失敗しました (base64)');
      }
    }
    return data.content || '';
  }

  /* ============================================================
     GITHUB MODELS CHAT (streaming)
     ============================================================ */
  async function streamChat(messages, model, onChunk) {
    if (!state.token) throw new Error('トークンが設定されていません');
    const res = await fetch(
      'https://models.inference.ai.azure.com/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + state.token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model, messages, stream: true }),
      }
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        (body.error && body.error.message) || 'HTTP ' + res.status
      );
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop(); // keep incomplete last line
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') return fullText;
        try {
          const json = JSON.parse(data);
          const chunk = json.choices?.[0]?.delta?.content;
          if (chunk) {
            fullText += chunk;
            onChunk(chunk);
          }
        } catch (_) {}
      }
    }
    return fullText;
  }

  /* ============================================================
     UTILITIES
     ============================================================ */
  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  function renderMd(text) {
    if (typeof marked === 'undefined') {
      return '<p>' + escHtml(text).replace(/\n/g, '<br>') + '</p>';
    }
    const raw = marked.parse(text);
    return typeof DOMPurify !== 'undefined'
      ? DOMPurify.sanitize(raw)
      : raw;
  }

  function highlightAll() {
    if (typeof hljs === 'undefined') return;
    document.querySelectorAll('pre code:not([data-highlighted])').forEach((el) => {
      hljs.highlightElement(el);
    });
  }

  function showToast(msg, type) {
    const old = document.querySelector('.toast');
    if (old) old.remove();
    const el = document.createElement('div');
    el.className = 'toast' + (type ? ' ' + type : '');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  function scrollToBottom(el) {
    el.scrollTop = el.scrollHeight;
  }

  /* ============================================================
     NAVIGATION
     ============================================================ */
  function navigateTo(tabName) {
    document.querySelectorAll('.tab-content').forEach((s) =>
      s.classList.remove('active')
    );
    document.querySelectorAll('.nav-item').forEach((b) =>
      b.classList.remove('active')
    );

    const section = document.getElementById('tab-' + tabName);
    if (section) section.classList.add('active');
    const btn = document.querySelector('.nav-item[data-tab="' + tabName + '"]');
    if (btn) btn.classList.add('active');

    if (tabName === 'codespaces') loadCodespaces();
  }

  /* ============================================================
     CODESPACES TAB
     ============================================================ */
  async function loadCodespaces() {
    const list = document.getElementById('codespaces-list');
    if (!state.token) {
      list.innerHTML =
        '<div class="empty-state">⚙️ 設定からトークンを登録してください</div>';
      return;
    }
    list.innerHTML = '<div class="empty-state">読み込み中…</div>';
    try {
      const spaces = await listCodespaces();
      if (!spaces.length) {
        list.innerHTML =
          '<div class="empty-state">Codespaces が見つかりません</div>';
        return;
      }
      list.innerHTML = spaces.map(renderCodespaceCard).join('');
    } catch (e) {
      list.innerHTML =
        '<div class="empty-state">エラー: ' + escHtml(e.message) + '</div>';
    }
  }

  function renderCodespaceCard(cs) {
    const stateName = cs.state || 'Unknown';
    const badgeClass = [
      'Available',
      'Shutdown',
      'Starting',
      'Unavailable',
    ].includes(stateName)
      ? 'cs-badge-' + stateName
      : 'cs-badge-default';
    const repo = cs.repository?.full_name || '';
    const branch = cs.git_status?.ref || '';
    const webUrl = cs.web_url || 'https://github.com/codespaces';
    const displayName = escHtml(cs.display_name || cs.name);
    const updated = cs.updated_at
      ? new Date(cs.updated_at).toLocaleString('ja-JP', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';

    return (
      '<div class="codespace-card">' +
      '  <div class="cs-header">' +
      '    <div class="cs-name">' + displayName + '</div>' +
      '    <span class="cs-badge ' + badgeClass + '">' + escHtml(stateName) + '</span>' +
      '  </div>' +
      (repo
        ? '<div class="cs-meta">📁 ' + escHtml(repo) +
          (branch ? ' &middot; ' + escHtml(branch) : '') + '</div>'
        : '') +
      (updated ? '<div class="cs-meta">🕒 ' + updated + '</div>' : '') +
      '  <div class="cs-actions">' +
      '    <a href="' + escHtml(webUrl) + '" target="_blank" rel="noopener" class="cs-btn">🌐 開く</a>' +
      (repo
        ? '    <button class="cs-btn" data-action="view-code" data-repo="' +
          escHtml(repo) + '">📄 コード</button>'
        : '') +
      '    <button class="cs-btn" data-action="chat-about"' +
      '      data-name="' + escHtml(cs.display_name || cs.name) + '"' +
      '      data-repo="' + escHtml(repo) + '">💬 AI相談</button>' +
      '  </div>' +
      '</div>'
    );
  }

  /* ============================================================
     CHAT TAB
     ============================================================ */
  function renderMessages() {
    const container = document.getElementById('chat-messages');
    if (!state.messages.length) {
      container.innerHTML =
        '<div class="chat-welcome">' +
        '<p>👋 GitHub Models を使った AI アシスタントです。</p>' +
        '<p>コードの質問、デバッグ、設計相談など、何でも聞いてください。</p>' +
        '</div>';
      return;
    }
    container.innerHTML = state.messages
      .map((msg, i) => buildMessageHTML(msg, i))
      .join('');
    scrollToBottom(container);
    highlightAll();
  }

  function buildMessageHTML(msg, index) {
    const isUser = msg.role === 'user';
    const avatar = isUser ? '👤' : '🤖';
    const content = isUser
      ? '<p>' + escHtml(msg.content).replace(/\n/g, '<br>') + '</p>'
      : renderMd(msg.content);
    return (
      '<div class="message ' + msg.role + '">' +
      '  <div class="message-avatar">' + avatar + '</div>' +
      '  <div class="message-body">' +
      '    <div class="message-content">' + content + '</div>' +
      '    <div class="message-actions">' +
      '      <button class="msg-btn" data-copy-index="' + index + '">📋 コピー</button>' +
      '    </div>' +
      '  </div>' +
      '</div>'
    );
  }

  async function sendMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text || state.isLoading) return;
    if (!state.token) {
      showToast('トークンを設定してください', 'error');
      return;
    }

    state.messages.push({ role: 'user', content: text });
    input.value = '';
    input.style.height = 'auto';
    state.isLoading = true;
    document.getElementById('btn-send').disabled = true;

    const container = document.getElementById('chat-messages');
    // Show existing messages + user message
    renderMessages();

    // Typing indicator
    const typingEl = document.createElement('div');
    typingEl.className = 'message assistant';
    typingEl.id = 'typing-msg';
    typingEl.innerHTML =
      '<div class="message-avatar">🤖</div>' +
      '<div class="message-body"><div class="message-content">' +
      '<div class="typing-indicator">' +
      '<span class="typing-dot"></span>' +
      '<span class="typing-dot"></span>' +
      '<span class="typing-dot"></span>' +
      '</div></div></div>';
    container.appendChild(typingEl);
    scrollToBottom(container);

    const model = document.getElementById('model-select').value;
    const apiMessages = [
      { role: 'system', content: state.systemPrompt },
      ...state.messages,
    ];

    // Streaming: build a live-updating bubble
    let assistantText = '';
    const assistantEl = document.createElement('div');
    assistantEl.className = 'message assistant';
    assistantEl.innerHTML =
      '<div class="message-avatar">🤖</div>' +
      '<div class="message-body"><div class="message-content" id="streaming-content"></div></div>';

    try {
      await streamChat(apiMessages, model, (chunk) => {
        assistantText += chunk;
        if (typingEl.parentNode) {
          container.replaceChild(assistantEl, typingEl);
        }
        const contentEl = document.getElementById('streaming-content');
        if (contentEl) {
          const rendered = renderMd(assistantText);
          contentEl.innerHTML = rendered;
          scrollToBottom(container);
          highlightAll();
        }
      });

      state.messages.push({ role: 'assistant', content: assistantText });
    } catch (e) {
      const errText =
        'エラーが発生しました: ' +
        e.message +
        '\n\nGitHub Models APIへのアクセスに失敗しました。' +
        'トークンに `models:read` スコープがあるか確認してください。';
      state.messages.push({ role: 'assistant', content: errText });
    }

    // Persist (last 60 messages)
    try {
      localStorage.setItem(
        'pc_messages',
        JSON.stringify(state.messages.slice(-60))
      );
    } catch (_) {}

    state.isLoading = false;
    document.getElementById('btn-send').disabled = false;
    renderMessages();
  }

  /* ============================================================
     CODE VIEWER TAB
     ============================================================ */
  async function loadRepository(owner, repo, ref) {
    state.currentRepo = { owner, repo };
    state.currentRef = ref || 'main';
    document.getElementById('code-header').textContent = '';
    document.getElementById('code-display').innerHTML =
      '<div class="empty-state">ファイルを選択してください</div>';
    await loadDirectory('');
  }

  async function loadDirectory(path) {
    const panel = document.getElementById('file-tree-panel');
    panel.innerHTML = '<div class="empty-state">読み込み中…</div>';

    const { owner, repo } = state.currentRepo;
    try {
      const items = await getRepoContents(
        owner,
        repo,
        path,
        state.currentRef
      );
      const sorted = [...items].sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      panel.innerHTML =
        buildBreadcrumbs(path) +
        sorted.map(buildTreeItemHTML).join('');
    } catch (e) {
      panel.innerHTML =
        '<div class="empty-state">エラー: ' + escHtml(e.message) + '</div>';
    }
  }

  function buildBreadcrumbs(path) {
    const parts = path ? path.split('/').filter(Boolean) : [];
    let html =
      '<div class="tree-breadcrumb">' +
      '<span class="breadcrumb-item" data-nav-path="">🏠</span>';
    let cur = '';
    for (const part of parts) {
      cur += (cur ? '/' : '') + part;
      html +=
        ' <span class="breadcrumb-sep">/</span> ' +
        '<span class="breadcrumb-item" data-nav-path="' +
        escHtml(cur) +
        '">' +
        escHtml(part) +
        '</span>';
    }
    return html + '</div>';
  }

  function buildTreeItemHTML(item) {
    const icon = item.type === 'dir' ? '📁' : fileIcon(item.name);
    if (item.type === 'dir') {
      return (
        '<div class="tree-item" data-nav-path="' + escHtml(item.path) + '">' +
        '<span class="tree-icon">' + icon + '</span>' +
        '<span class="tree-name">' + escHtml(item.name) + '</span>' +
        '</div>'
      );
    }
    return (
      '<div class="tree-item" data-open-file="' + escHtml(item.path) +
      '" data-file-name="' + escHtml(item.name) + '">' +
      '<span class="tree-icon">' + icon + '</span>' +
      '<span class="tree-name">' + escHtml(item.name) + '</span>' +
      '</div>'
    );
  }

  async function openFile(path, name) {
    const header = document.getElementById('code-header');
    const display = document.getElementById('code-display');
    header.textContent = path;
    display.innerHTML = '<div class="empty-state">読み込み中…</div>';

    // Mark tree item as active
    document.querySelectorAll('.tree-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.openFile === path);
    });

    const { owner, repo } = state.currentRepo;
    const ext = name.split('.').pop().toLowerCase();
    const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'svg'];
    if (imageExts.includes(ext)) {
      const rawUrl =
        'https://raw.githubusercontent.com/' +
        owner + '/' + repo + '/' +
        encodeURIComponent(state.currentRef) + '/' + path;
      display.innerHTML =
        '<div style="padding:20px;text-align:center;">' +
        '<img src="' + escHtml(rawUrl) + '" alt="' + escHtml(name) +
        '" style="max-width:100%;max-height:500px;border-radius:4px;">' +
        '</div>';
      return;
    }

    try {
      const text = await getFileText(owner, repo, path, state.currentRef);
      const lang = detectLang(name);
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      if (lang) code.className = 'language-' + lang;
      code.textContent = text;
      pre.appendChild(code);
      display.innerHTML = '';
      display.appendChild(pre);
      if (typeof hljs !== 'undefined') hljs.highlightElement(code);
    } catch (e) {
      display.innerHTML =
        '<div class="empty-state">エラー: ' + escHtml(e.message) + '</div>';
    }
  }

  function fileIcon(name) {
    const ext = name.split('.').pop().toLowerCase();
    const byExt = {
      js: '🟨', mjs: '🟨', cjs: '🟨',
      ts: '🔷', tsx: '🔷',
      jsx: '⚛️',
      py: '🐍', pyw: '🐍',
      rb: '💎',
      go: '🐹',
      rs: '🦀',
      java: '☕', kt: '🟠', kts: '🟠',
      swift: '🧡',
      c: '🔵', h: '🔵',
      cpp: '🔵', cc: '🔵', cxx: '🔵', hpp: '🔵',
      cs: '🟣',
      php: '🐘',
      html: '🌐', htm: '🌐',
      css: '🎨', scss: '🎨', sass: '🎨', less: '🎨',
      xml: '📋', svg: '🖼️',
      json: '📋', jsonc: '📋',
      yaml: '📋', yml: '📋',
      toml: '📋', ini: '📋', cfg: '📋',
      sh: '💻', bash: '💻', zsh: '💻', fish: '💻',
      md: '📝', mdx: '📝', markdown: '📝',
      txt: '📄',
      sql: '🗃️',
      graphql: '🔮', gql: '🔮',
      r: '📊',
      lua: '🌙',
      vue: '💚',
      dart: '🎯',
      ex: '💜', exs: '💜',
      lock: '🔒',
      env: '🔒',
      png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️',
      webp: '🖼️', ico: '🖼️',
      pdf: '📕',
      zip: '📦', tar: '📦', gz: '📦',
    };
    const byName = {
      dockerfile: '🐳',
      makefile: '🔧',
      rakefile: '💎',
      gemfile: '💎',
      '.gitignore': '🙈',
      '.env': '🔒',
      '.npmrc': '📦',
      'package.json': '📦',
      'package-lock.json': '📦',
      'yarn.lock': '🔒',
      'readme.md': '📖',
      'license': '⚖️',
      'changelog.md': '📜',
    };
    return byName[name.toLowerCase()] || byExt[ext] || '📄';
  }

  function detectLang(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const nameMap = {
      dockerfile: 'dockerfile',
      makefile: 'makefile',
      gemfile: 'ruby',
      rakefile: 'ruby',
      '.bashrc': 'bash',
      '.zshrc': 'bash',
      '.profile': 'bash',
    };
    const extMap = {
      js: 'javascript', mjs: 'javascript', cjs: 'javascript',
      ts: 'typescript', tsx: 'typescript',
      jsx: 'javascript',
      py: 'python', pyw: 'python',
      rb: 'ruby', rake: 'ruby',
      go: 'go',
      rs: 'rust',
      java: 'java', kt: 'kotlin', kts: 'kotlin',
      swift: 'swift',
      c: 'c', h: 'c',
      cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp',
      cs: 'csharp',
      php: 'php',
      html: 'html', htm: 'html',
      css: 'css', scss: 'scss', sass: 'scss', less: 'less',
      xml: 'xml',
      json: 'json', jsonc: 'json',
      yaml: 'yaml', yml: 'yaml',
      toml: 'toml', ini: 'ini',
      sh: 'bash', bash: 'bash', zsh: 'bash',
      md: 'markdown', mdx: 'markdown',
      sql: 'sql',
      graphql: 'graphql', gql: 'graphql',
      r: 'r',
      lua: 'lua',
      vue: 'xml',
      dart: 'dart',
      ex: 'elixir', exs: 'elixir',
    };
    return nameMap[filename.toLowerCase()] || extMap[ext] || '';
  }

  /* ============================================================
     SETTINGS TAB
     ============================================================ */
  async function applyToken(token) {
    state.token = token.trim();
    localStorage.setItem('pc_token', state.token);
    if (!state.token) return;
    try {
      const user = await getAuthUser();
      renderUserInfo(user);
      showToast('こんにちは、' + user.login + ' さん！', 'success');
    } catch (e) {
      showToast('トークンが無効です: ' + e.message, 'error');
    }
  }

  function renderUserInfo(user) {
    const el = document.getElementById('user-info');
    el.innerHTML =
      '<div class="user-profile">' +
      '<img class="user-avatar" src="' + escHtml(user.avatar_url) +
      '" alt="' + escHtml(user.login) + '" width="36" height="36">' +
      '<div>' +
      '<div>' + escHtml(user.name || user.login) + '</div>' +
      '<div style="font-size:12px">@' + escHtml(user.login) + '</div>' +
      '</div>' +
      '</div>';
  }

  /* ============================================================
     EVENT DELEGATION & LISTENERS
     ============================================================ */
  function setupListeners() {
    // Bottom nav
    document.querySelector('.bottom-nav').addEventListener('click', (e) => {
      const btn = e.target.closest('.nav-item[data-tab]');
      if (btn) navigateTo(btn.dataset.tab);
    });

    // Header settings shortcut
    document.getElementById('header-settings').addEventListener('click', () =>
      navigateTo('settings')
    );

    // Token modal
    document.getElementById('modal-save').addEventListener('click', async () => {
      const token = document.getElementById('modal-pat').value.trim();
      if (!token) { showToast('トークンを入力してください', 'error'); return; }
      await applyToken(token);
      document.getElementById('settings-pat').value = token;
      document.getElementById('token-modal').classList.add('hidden');
      loadCodespaces();
    });
    document.getElementById('modal-pat').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('modal-save').click();
    });

    // Codespaces refresh
    document.getElementById('btn-refresh').addEventListener('click', loadCodespaces);

    // Codespaces card actions (delegated)
    document.getElementById('codespaces-list').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      if (btn.dataset.action === 'view-code') {
        const [owner, repo] = btn.dataset.repo.split('/');
        document.getElementById('repo-input').value = btn.dataset.repo;
        loadRepository(owner, repo, 'main');
        navigateTo('viewer');
      } else if (btn.dataset.action === 'chat-about') {
        document.getElementById('chat-input').value =
          '「' + btn.dataset.name + '」(' + btn.dataset.repo +
          ') の Codespace について相談したいです。';
        navigateTo('chat');
        document.getElementById('chat-input').focus();
      }
    });

    // Chat send
    document.getElementById('btn-send').addEventListener('click', sendMessage);
    document.getElementById('chat-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    // Auto-grow textarea
    document.getElementById('chat-input').addEventListener('input', function () {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });

    // Clear chat
    document.getElementById('btn-clear-chat').addEventListener('click', () => {
      if (!confirm('チャット履歴を削除しますか？')) return;
      state.messages = [];
      localStorage.removeItem('pc_messages');
      renderMessages();
    });

    // Copy message (delegated on chat messages)
    document.getElementById('chat-messages').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-copy-index]');
      if (!btn) return;
      const idx = parseInt(btn.dataset.copyIndex, 10);
      const msg = state.messages[idx];
      if (msg && navigator.clipboard) {
        navigator.clipboard
          .writeText(msg.content)
          .then(() => showToast('コピーしました', 'success'))
          .catch(() => showToast('コピーに失敗しました', 'error'));
      }
    });

    // Code viewer – load repo
    document.getElementById('btn-load-repo').addEventListener('click', async () => {
      const rawRepo = document.getElementById('repo-input').value.trim();
      const ref = document.getElementById('ref-input').value.trim() || 'main';
      if (!rawRepo) { showToast('リポジトリを入力してください', 'error'); return; }
      const [owner, repo, ...rest] = rawRepo.split('/');
      if (!owner || !repo || rest.length > 0) {
        showToast('owner/repo の形式で入力してください', 'error');
        return;
      }
      await loadRepository(owner, repo, ref);
    });
    document.getElementById('repo-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('btn-load-repo').click();
    });

    // Code viewer – file tree clicks (delegated)
    document.getElementById('file-tree-panel').addEventListener('click', async (e) => {
      const item = e.target.closest('[data-nav-path]');
      if (item && 'navPath' in item.dataset) {
        await loadDirectory(item.dataset.navPath);
        return;
      }
      const fileItem = e.target.closest('[data-open-file]');
      if (fileItem) {
        await openFile(fileItem.dataset.openFile, fileItem.dataset.fileName);
      }
    });

    // Settings – save PAT
    document.getElementById('btn-save-pat').addEventListener('click', async () => {
      const token = document.getElementById('settings-pat').value.trim();
      if (!token) { showToast('トークンを入力してください', 'error'); return; }
      await applyToken(token);
    });

    // Settings – clear PAT
    document.getElementById('btn-clear-pat').addEventListener('click', () => {
      if (!confirm('トークンを削除しますか？')) return;
      state.token = '';
      localStorage.removeItem('pc_token');
      document.getElementById('settings-pat').value = '';
      document.getElementById('user-info').innerHTML = '';
      showToast('クリアしました');
    });

    // Settings – save system prompt
    document.getElementById('btn-save-system-prompt').addEventListener('click', () => {
      state.systemPrompt = document.getElementById('system-prompt').value;
      localStorage.setItem('pc_system_prompt', state.systemPrompt);
      showToast('保存しました', 'success');
    });
  }

  /* ============================================================
     INIT
     ============================================================ */
  async function init() {
    setupListeners();

    // Configure marked for line breaks and GFM
    if (typeof marked !== 'undefined') {
      marked.use({ breaks: true, gfm: true });
    }

    // Restore settings UI values
    document.getElementById('settings-pat').value = state.token;
    document.getElementById('system-prompt').value = state.systemPrompt;

    // Render any saved messages
    renderMessages();

    if (state.token) {
      // Verify token silently, show user info
      getAuthUser()
        .then(renderUserInfo)
        .catch(() => {});
      loadCodespaces();
    } else {
      document.getElementById('token-modal').classList.remove('hidden');
    }
  }

  init();
})();
