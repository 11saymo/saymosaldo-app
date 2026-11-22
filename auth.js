(() => {
  'use strict';

  const SUPABASE_URL = 'https://pmrrslmkrulhuapxtltm.supabase.co';
  const PUBLISHABLE_KEY = 'sb_publishable_yqDwOCq3n3rZ7E0WOMLUtg_84VOefBt';
  const USERNAME_DOMAIN = 'accounts.saymosaldo.app';
  const SESSION_KEY = 'saymosaldo_auth_session';
  const $ = id => document.getElementById(id);

  let session = null;
  let username = '';
  let syncTimer = null;
  let refreshTimer = null;
  let syncBusy = false;
  let syncPromise = null;
  let syncAgain = false;
  let loggingOut = false;
  let retryDelay = 2000;
  let pendingRegistration = null;
  let recoveryUsername = '';

  function normalizeUsername(value) {
    if (typeof value !== 'string') return null;
    const result = value.trim().toLowerCase();
    return /^[a-z0-9][a-z0-9._-]{2,23}$/.test(result) ? result : null;
  }

  function usernameEmail(value) {
    const normalized = normalizeUsername(value);
    return normalized ? normalized + '@' + USERNAME_DOMAIN : null;
  }

  function validPassword(value) {
    return typeof value === 'string' && value.length >= 12 && value.length <= 72;
  }

  function normalizeCloudData(input) {
    const value = input && typeof input === 'object' ? input : {};
    return {
      tx: Array.isArray(value.tx) ? value.tx : [],
      goals: Array.isArray(value.goals) ? value.goals : [],
      budgets: Array.isArray(value.budgets) ? value.budgets : [],
      recurring: Array.isArray(value.recurring) ? value.recurring : [],
      debts: Array.isArray(value.debts) ? value.debts : [],
      chat_finance: Array.isArray(value.chat_finance) ? value.chat_finance :
        Array.isArray(value.chatFinance) ? value.chatFinance : []
    };
  }

  function hasData(value) {
    const data = normalizeCloudData(value);
    return ['tx', 'goals', 'budgets', 'recurring', 'debts', 'chat_finance'].some(key => data[key].length > 0);
  }

  function apiErrorMessage(payload, status) {
    const value = String(payload && (payload.error || payload.code || payload.msg || payload.message || payload.error_description) || '');
    if (/username_taken/i.test(value)) return 'Этот логин уже занят. Придумайте другой.';
    if (/username_invalid/i.test(value)) return 'Логин: 3–24 символа, латинские буквы, цифры, точка, дефис или подчёркивание.';
    if (/password_invalid/i.test(value)) return 'Пароль должен содержать от 12 до 72 символов.';
    if (/recovery_invalid/i.test(value)) return 'Логин или код восстановления не подошли. Проверьте их и попробуйте ещё раз.';
    if (/rate_limited/i.test(value) || status === 429) return 'Слишком много попыток. Подождите 10 минут и попробуйте снова.';
    if (/temporarily_unavailable/i.test(value)) return 'Сервис временно недоступен. Попробуйте ещё раз чуть позже.';
    if (/origin_not_allowed/i.test(value)) return 'Запрос отклонён настройками безопасности. Откройте официальный сайт SaymoSaldo.';
    if (/invalid login credentials|invalid_grant|invalid_credentials/i.test(value)) return 'Неверный логин или пароль.';
    if (/email not confirmed/i.test(value)) return 'Аккаунт не активирован. Обратитесь в поддержку.';
    return status === 0 ? 'Нет соединения. Проверьте интернет и повторите попытку.' :
      'Не удалось выполнить действие. Попробуйте ещё раз позже.';
  }

  async function apiRequest(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 18000);
    const headers = {
      apikey: PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };
    if (options.token) headers.Authorization = 'Bearer ' + options.token;
    let response;
    try {
      response = await fetch(SUPABASE_URL + path, {
        method: options.method || 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
        cache: 'no-store'
      });
    } catch (error) {
      const failure = new Error(error && error.name === 'AbortError'
        ? 'Сервер долго не отвечает. Проверьте интернет и попробуйте ещё раз.'
        : 'Нет соединения с сервером. Проверьте интернет.');
      failure.status = 0;
      throw failure;
    } finally {
      clearTimeout(timeout);
    }
    const raw = await response.text();
    let payload = {};
    try { payload = raw ? JSON.parse(raw) : {}; }
    catch (error) { throw new Error('Сервер вернул некорректный ответ. Попробуйте позже.'); }
    if (!response.ok) {
      const failure = new Error(apiErrorMessage(payload, response.status));
      failure.status = response.status;
      failure.code = payload.error || payload.code || '';
      throw failure;
    }
    return payload;
  }

  async function callUsernameFunction(body) {
    return apiRequest('/functions/v1/username-auth', { method: 'POST', body });
  }

  function readSession() {
    try {
      const value = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      return value && value.access_token && value.refresh_token ? value : null;
    } catch (error) {
      return null;
    }
  }

  function storeSession(value) {
    if (!value || !value.access_token || !value.refresh_token || !value.user || !value.user.id) {
      throw new Error('Сервер не вернул полноценную сессию. Попробуйте войти ещё раз.');
    }
    session = {
      ...value,
      expires_at: Number(value.expires_at) || Math.floor(Date.now() / 1000) + Number(value.expires_in || 3600)
    };
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch (error) {
      session = null;
      throw new Error('Браузер не смог сохранить вход. Освободите место в хранилище и попробуйте снова.');
    }
  }

  function clearSession() {
    session = null;
    try { localStorage.removeItem(SESSION_KEY); } catch (error) {}
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = null;
  }

  async function refreshSession() {
    if (!session || !session.refresh_token) throw new Error('Сессия завершилась. Войдите снова.');
    const value = await apiRequest('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: session.refresh_token }
    });
    storeSession(value);
    scheduleRefresh();
    return session;
  }

  async function ensureFreshSession() {
    if (!session) throw new Error('Войдите в аккаунт.');
    if (session.expires_at <= Math.floor(Date.now() / 1000) + 90) await refreshSession();
    return session;
  }

  function scheduleRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer);
    if (!session) return;
    const delay = Math.max(5000, (session.expires_at - Math.floor(Date.now() / 1000) - 60) * 1000);
    refreshTimer = setTimeout(async () => {
      try {
        await refreshSession();
      } catch (error) {
        if (error.status === 0) {
          if (window.SaymoSaldoApp) window.SaymoSaldoApp.setSyncStatus('Нет сети — сохранённые данные останутся на устройстве');
          refreshTimer = setTimeout(() => scheduleRefresh(), 30000);
        } else {
          await expireSession();
        }
      }
    }, delay);
  }

  async function expireSession() {
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = null;
    syncAgain = false;
    clearSession();
    if (window.SaymoSaldoApp) window.SaymoSaldoApp.reset();
    showAuth();
    setNotice('Сеанс завершился. Войдите снова — ваши сохранённые записи останутся в аккаунте.', 'error');
  }

  function setNotice(message, kind = '') {
    const el = $('authNotice');
    if (!el) return;
    el.textContent = message || '';
    el.className = 'auth-notice' + (message ? ' on' : '') + (kind ? ' ' + kind : '');
  }

  function showView(view) {
    for (const name of ['login', 'register', 'reset']) {
      const form = $('auth' + name[0].toUpperCase() + name.slice(1) + 'Form');
      if (form) form.hidden = name !== view;
    }
    $('recoveryPanel').hidden = true;
    $('authTitle').textContent = view === 'login' ? 'Войти в SaymoSaldo' :
      view === 'register' ? 'Создать аккаунт' : 'Восстановить пароль';
    setNotice('');
  }

  function showAuth() {
    $('authRoot').hidden = false;
    $('appShell').hidden = true;
    showView('login');
  }

  function setBusy(form, busy) {
    const button = form.querySelector('button[type="submit"]');
    if (button) {
      button.disabled = busy;
      button.textContent = busy ? 'Подождите…' : button.dataset.idleText;
    }
  }

  function rememberButtonLabels() {
    document.querySelectorAll('.auth-form button[type="submit"]').forEach(button => {
      button.dataset.idleText = button.textContent;
    });
  }

  function setRecoveryCode(code, message, user) {
    recoveryUsername = user || '';
    $('authLoginForm').hidden = true;
    $('authRegisterForm').hidden = true;
    $('authResetForm').hidden = true;
    $('recoveryPanel').hidden = false;
    $('authTitle').textContent = 'Сохраните код восстановления';
    $('recoveryMessage').textContent = message;
    $('recoveryCode').textContent = code;
    setNotice('Это единственный показ кода. Скопируйте его и сохраните в надёжном месте.', 'success');
  }

  async function copyRecoveryCode() {
    const code = $('recoveryCode').textContent;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setNotice('Код скопирован. Сохраните его отдельно от телефона.', 'success');
    } catch (error) {
      const area = document.createElement('textarea');
      area.value = code;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try {
        const ok = document.execCommand('copy');
        setNotice(ok ? 'Код скопирован. Сохраните его отдельно от телефона.' : 'Выделите код и скопируйте его вручную.', ok ? 'success' : 'error');
      } catch (copyError) {
        setNotice('Выделите код и скопируйте его вручную.', 'error');
      }
      area.remove();
    }
  }

  function localEmptyData() {
    return { tx: [], goals: [], budgets: [], recurring: [], debts: [], chat_finance: [] };
  }

  async function loadRemoteData(userId) {
    const token = (await ensureFreshSession()).access_token;
    const rows = await apiRequest('/rest/v1/user_data?select=data,updated_at&user_id=eq.' +
      encodeURIComponent(userId) + '&limit=1', { token });
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  }

  function scheduleCloudSave() {
    if (!session || !window.SaymoSaldoApp || loggingOut || !window.SaymoSaldoApp.hasPendingSync()) return;
    window.SaymoSaldoApp.setSyncStatus('Сохраняем изменения в аккаунт…');
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => { syncTimer = null; syncCloudData(); }, 700);
  }

  async function syncCloudData() {
    if (!session || !window.SaymoSaldoApp) return;
    if (syncBusy) { syncAgain = true; return syncPromise; }
    syncBusy = true;
    syncPromise = (async () => {
      try {
        await ensureFreshSession();
        const userId = session.user.id;
        const localVersion = window.SaymoSaldoApp.getLocalModifiedAt();
        const data = normalizeCloudData(window.SaymoSaldoApp.getData());
        const payload = {
          user_id: userId,
          data: {
            tx: data.tx,
            goals: data.goals,
            budgets: data.budgets,
            recurring: data.recurring,
            debts: data.debts,
            chat_finance: data.chat_finance
          },
          updated_at: new Date().toISOString()
        };
        await apiRequest('/rest/v1/user_data?on_conflict=user_id', {
          method: 'POST',
          token: session.access_token,
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: payload
        });
        retryDelay = 2000;
        if (window.SaymoSaldoApp.getLocalModifiedAt() === localVersion) {
          window.SaymoSaldoApp.markSynced();
        } else {
          syncAgain = true;
        }
        window.SaymoSaldoApp.setSyncStatus('Синхронизировано');
      } catch (error) {
        window.SaymoSaldoApp.setSyncStatus('Нет синхронизации — записи пока сохранены на этом устройстве');
        if (!loggingOut) {
          if (syncTimer) clearTimeout(syncTimer);
          syncTimer = setTimeout(() => { syncTimer = null; syncCloudData(); }, retryDelay);
          retryDelay = Math.min(60000, retryDelay * 2);
        }
      }
    })();
    try {
      await syncPromise;
    } finally {
      syncBusy = false;
      syncPromise = null;
      if (syncAgain && !loggingOut) { syncAgain = false; scheduleCloudSave(); }
    }
  }

  function showAppStatus(offline) {
    if (window.SaymoSaldoApp) {
      window.SaymoSaldoApp.setSyncStatus(offline
        ? 'Нет связи с облаком — работаем с сохранённой копией на этом устройстве'
        : 'Аккаунт подключён · синхронизация включена');
    }
  }

  async function openApp(user) {
    const app = window.SaymoSaldoApp;
    if (!app) throw new Error('Приложение не загрузилось. Обновите страницу.');
    const userId = user.id;
    username = normalizeUsername(user.user_metadata && user.user_metadata.username) ||
      normalizeUsername(String(user.email || '').split('@')[0]) || 'Пользователь';

    let remote = null;
    let remoteFailed = false;
    try { remote = await loadRemoteData(userId); }
    catch (error) { remoteFailed = true; }

    const local = app.getLocalUserData(userId);
    let chosen = localEmptyData();
    let updatedAt = new Date().toISOString();
    let needsSync = false;

    if (remote && remote.data) {
      const localTime = local ? Date.parse(local.updated_at || 0) : 0;
      const remoteTime = Date.parse(remote.updated_at || 0);
      if (local && (local.pending_sync || localTime > remoteTime)) {
        chosen = normalizeCloudData(local.data);
        updatedAt = local.updated_at;
        needsSync = true;
      } else {
        chosen = normalizeCloudData(remote.data);
        updatedAt = remote.updated_at;
      }
    } else if (local) {
      chosen = normalizeCloudData(local.data);
      updatedAt = local.updated_at;
      needsSync = true;
    } else if (!remoteFailed) {
      const guest = normalizeCloudData(app.getGuestData());
      if (hasData(guest) && window.confirm('На этом устройстве найдены записи без аккаунта. Перенести их в новый аккаунт?')) {
        chosen = guest;
        updatedAt = new Date().toISOString();
        needsSync = true;
      }
    } else {
      throw new Error('Не удалось загрузить данные аккаунта. Проверьте интернет и попробуйте снова.');
    }

    if (!app.activate(userId, chosen, updatedAt, needsSync)) {
      throw new Error('Не удалось сохранить данные аккаунта на устройстве. Проверьте свободное место в браузере.');
    }
    app.setCloudSaveHandler(scheduleCloudSave);
    $('authRoot').hidden = true;
    $('appShell').hidden = false;
    showAppStatus(remoteFailed);
    scheduleRefresh();
    if (needsSync) scheduleCloudSave();
  }

  async function login(usernameValue, password) {
    const normalized = normalizeUsername(usernameValue);
    if (!normalized) throw new Error('Логин должен содержать 3–24 символа: латиницу, цифры, точку, дефис или подчёркивание.');
    if (typeof password !== 'string' || password.length < 1 || password.length > 72) throw new Error('Введите пароль длиной не более 72 символов.');
    const value = await apiRequest('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: { email: usernameEmail(normalized), password }
    });
    storeSession(value);
    await openApp(session.user);
  }

  async function handleLogin(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(form, true);
    setNotice('');
    try {
      await login(data.get('username'), data.get('password'));
      form.reset();
    } catch (error) {
      setNotice(error.message || 'Не удалось войти. Проверьте логин и пароль.', 'error');
    } finally {
      setBusy(form, false);
    }
  }

  async function handleRegister(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const normalized = normalizeUsername(data.get('username'));
    const password = data.get('password');
    if (!normalized) return setNotice('Логин: 3–24 символа, латинские буквы, цифры, точка, дефис или подчёркивание.', 'error');
    if (!validPassword(password)) return setNotice('Пароль должен содержать от 12 до 72 символов.', 'error');
    if (password !== data.get('passwordConfirm')) return setNotice('Пароли не совпадают.', 'error');
    setBusy(form, true);
    setNotice('');
    try {
      const result = await callUsernameFunction({ action: 'register', username: normalized, password });
      if (!result.ok || !result.recovery_code) throw new Error('Аккаунт не создан полностью. Попробуйте ещё раз.');
      pendingRegistration = { username: normalized, password };
      setRecoveryCode(result.recovery_code,
        'Этот код понадобится, если вы забудете пароль. Он не отправляется по почте и больше не будет показан.',
        normalized);
      form.reset();
    } catch (error) {
      setNotice(error.message || 'Не удалось создать аккаунт.', 'error');
    } finally {
      setBusy(form, false);
    }
  }

  async function handleReset(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const normalized = normalizeUsername(data.get('username'));
    const password = data.get('password');
    const recoveryCode = String(data.get('recoveryCode') || '').trim().toLowerCase();
    if (!normalized) return setNotice('Проверьте логин.', 'error');
    if (!/^[0-9a-f]{48}$/.test(recoveryCode)) return setNotice('Код восстановления должен содержать 48 символов.', 'error');
    if (!validPassword(password)) return setNotice('Новый пароль должен содержать от 12 до 72 символов.', 'error');
    if (password !== data.get('passwordConfirm')) return setNotice('Пароли не совпадают.', 'error');
    setBusy(form, true);
    setNotice('');
    try {
      const result = await callUsernameFunction({
        action: 'reset_password', username: normalized, password, recovery_code: recoveryCode
      });
      if (!result.ok || !result.recovery_code) throw new Error('Пароль не обновлён. Попробуйте ещё раз.');
      pendingRegistration = null;
      setRecoveryCode(result.recovery_code,
        'Пароль изменён. Код восстановления остаётся действующим — сохраните его надёжно.',
        normalized);
      form.reset();
    } catch (error) {
      setNotice(error.message || 'Не удалось восстановить пароль.', 'error');
    } finally {
      setBusy(form, false);
    }
  }

  async function finishRecovery() {
    $('recoveryPanel').hidden = true;
    showView('login');
    const loginForm = $('authLoginForm');
    loginForm.elements.username.value = recoveryUsername;
    loginForm.elements.password.value = '';
    if (pendingRegistration) {
      const credentials = pendingRegistration;
      pendingRegistration = null;
      try {
        setNotice('Код сохранён. Выполняем первый вход…', 'success');
        await login(credentials.username, credentials.password);
        loginForm.reset();
        return;
      } catch (error) {
        setNotice('Код сохранён. Теперь войдите с логином и паролем: ' + (error.message || ''), 'error');
      }
    } else {
      setNotice('Код сохранён. Теперь войдите с новым паролем.', 'success');
    }
  }

  async function logout() {
    loggingOut = true;
    if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
    try {
      if (syncBusy && syncPromise) await syncPromise;
      if (syncAgain) syncAgain = false;
      await syncCloudData();
    } catch (error) {}
    if (session) {
      try { await apiRequest('/auth/v1/logout', { method: 'POST', token: session.access_token }); } catch (error) {}
    }
    clearSession();
    if (window.SaymoSaldoApp) window.SaymoSaldoApp.reset();
    loggingOut = false;
    showAuth();
    setNotice('Вы вышли из аккаунта.', 'success');
  }

  async function bootstrap() {
    rememberButtonLabels();
    showAuth();
    session = readSession();
    if (!session) return;
    try {
      if (session.expires_at <= Math.floor(Date.now() / 1000) + 90) {
        await refreshSession();
      } else {
        const user = await apiRequest('/auth/v1/user', { token: session.access_token });
        session.user = user;
        storeSession(session);
      }
      await openApp(session.user);
    } catch (error) {
      if (error.status === 0 && session && session.user &&
          window.SaymoSaldoApp.getLocalUserData(session.user.id)) {
        try { await openApp(session.user); return; } catch (offlineError) {}
      }
      try {
        await refreshSession();
        await openApp(session.user);
      } catch (refreshError) {
        if (refreshError.status === 0 && session && session.user &&
            window.SaymoSaldoApp.getLocalUserData(session.user.id)) {
          try { await openApp(session.user); return; } catch (offlineError) {}
        }
        clearSession();
        setNotice('Сеанс завершился или недоступен сервер. Войдите снова при подключении к интернету.', 'error');
      }
    }
  }

  function bindUi() {
    $('authLoginForm').addEventListener('submit', handleLogin);
    $('authRegisterForm').addEventListener('submit', handleRegister);
    $('authResetForm').addEventListener('submit', handleReset);
    document.addEventListener('click', event => {
      const view = event.target.closest('[data-auth-view]');
      if (view) { showView(view.dataset.authView); return; }
      const action = event.target.closest('[data-auth-action]');
      if (action && action.dataset.authAction === 'logout') logout();
    });
    $('copyRecovery').addEventListener('click', copyRecoveryCode);
    $('recoveryContinue').addEventListener('click', finishRecovery);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && session) {
        ensureFreshSession().then(scheduleCloudSave).catch(error => {
          if (error.status === 0) showAppStatus(true);
          else expireSession();
        });
      }
    });
    window.addEventListener('online', scheduleCloudSave);
  }

  const publicApi = {
    normalizeUsername,
    usernameEmail,
    validPassword,
    normalizeCloudData,
    hasData,
    apiRequest,
    get username() { return username; }
  };
  window.SaymoSaldoAuth = publicApi;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { bindUi(); bootstrap(); }, { once: true });
  } else {
    bindUi();
    bootstrap();
  }
})();