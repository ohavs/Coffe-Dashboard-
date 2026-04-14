/* ═══════════════════════════════════════
   COFFEE DASHBOARD — APP LOGIC
   ═══════════════════════════════════════ */

const App = (() => {

  /* ── Default state ── */
  const DEFAULTS = {
    cleanings:     [],   // [{ date, notes }]
    nextCleaning:  null,
    cleaningCycle: 14,

    filterInstalled: null,
    filterLifespan:  60,
    filterHistory:   [],

    bags:          0,
    gramsPerBag:   250,
    dailyUsage:    30,
    lowStockAlert: 2,

    recipes: null,   // loaded via getDefaultRecipes()
    history: [],     // [{ date, type, icon, text }]
  };

  let state = {};

  /* ───────── Persistence ───────── */
  function load() {
    try {
      const raw = localStorage.getItem('coffeeApp_v2');
      state = raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
    } catch (_) {
      state = { ...DEFAULTS };
    }
    if (!state.recipes || !state.recipes.length) {
      state.recipes = getDefaultRecipes();
    }
  }

  function save() {
    localStorage.setItem('coffeeApp_v2', JSON.stringify(state));
  }

  /* ───────── Date utilities ───────── */
  function todayStr() {
    return new Date().toISOString().split('T')[0];
  }

  function addDays(dateStr, n) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + n);
    return d.toISOString().split('T')[0];
  }

  // Returns (date - today) in full days (positive = future, negative = past)
  function daysDiff(dateStr) {
    if (!dateStr) return null;
    const a = new Date(dateStr); a.setHours(0, 0, 0, 0);
    const b = new Date();        b.setHours(0, 0, 0, 0);
    return Math.round((a - b) / 86400000);
  }

  function fmtDate(dateStr) {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString('he-IL', {
      day: 'numeric', month: 'long', year: 'numeric'
    });
  }

  function fmtShortDate(dateStr) {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString('he-IL', {
      day: 'numeric', month: 'short'
    });
  }

  function timeAgo(dateStr) {
    const d = daysDiff(dateStr);
    if (d === null) return '';
    if (d === 0)  return 'היום';
    if (d === 1)  return 'מחר';
    if (d === -1) return 'אתמול';
    if (d > 0 && d < 7)  return `בעוד ${d} ימים`;
    if (d < 0 && d > -7) return `לפני ${Math.abs(d)} ימים`;
    if (d >= 7)  return `בעוד ${Math.round(d / 7)} שבועות`;
    return `לפני ${Math.round(Math.abs(d) / 7)} שבועות`;
  }

  function greeting() {
    const h = new Date().getHours();
    if (h < 12) return 'בוקר טוב';
    if (h < 17) return 'צהריים טובים';
    if (h < 20) return 'ערב טוב';
    return 'לילה טוב';
  }

  /* ───────── Generic DOM helpers ───────── */
  function el(id) { return document.getElementById(id); }
  function setText(id, val) { const e = el(id); if (e) e.textContent = val ?? ''; }
  function dotClass(id, daysLeft) {
    const e = el(id); if (!e) return;
    if (daysLeft === null) { e.className = 'stat-dot'; return; }
    if (daysLeft < 0)    e.className = 'stat-dot danger';
    else if (daysLeft <= 3) e.className = 'stat-dot warn';
    else                 e.className = 'stat-dot ok';
  }

  /* ───────── Header ───────── */
  function updateHeader() {
    setText('currentDate', new Date().toLocaleDateString('he-IL', {
      weekday: 'long', month: 'long', day: 'numeric'
    }));
  }

  /* ───────── Home tab ───────── */
  function updateHome() {
    setText('greeting', greeting());

    // Cleaning stat
    const cd = daysDiff(state.nextCleaning);
    setText('stat-cleaning-days', cd !== null ? (cd < 0 ? 'עבר!' : String(cd)) : '—');
    dotClass('stat-cleaning-dot', cd);

    // Filter stat
    const filterNext = state.filterInstalled
      ? addDays(state.filterInstalled, state.filterLifespan) : null;
    const fd = daysDiff(filterNext);
    setText('stat-filter-days', fd !== null ? (fd < 0 ? 'עבר!' : String(fd)) : '—');
    dotClass('stat-filter-dot', fd);

    // Bags stat
    setText('stat-bags', String(state.bags));
    const bd = state.bags === 0 ? -1 : (state.bags <= state.lowStockAlert ? 1 : 99);
    dotClass('stat-bags-dot', bd);

    // Supply days
    const totalG  = state.bags * state.gramsPerBag;
    const daysLeft = state.dailyUsage > 0 ? Math.floor(totalG / state.dailyUsage) : 0;
    setText('stat-supply-days', String(daysLeft));
    dotClass('stat-supply-dot', daysLeft <= 0 ? -1 : daysLeft <= 5 ? 1 : 99);

    renderAlerts(cd, fd, daysLeft);
    renderActivity();
  }

  function renderAlerts(cleaningDays, filterDays, supplyDays) {
    const alerts = [];

    if (cleaningDays !== null && cleaningDays <= 3) {
      alerts.push({
        cls: cleaningDays < 0 ? 'danger' : 'warn',
        icon: '🧹',
        text: cleaningDays < 0
          ? `ניקוי היה אמור להתבצע לפני ${Math.abs(cleaningDays)} ימים!`
          : cleaningDays === 0 ? 'ניקוי נדרש היום!'
          : `ניקוי נדרש בעוד ${cleaningDays} ימים`
      });
    }

    if (filterDays !== null && filterDays <= 7) {
      alerts.push({
        cls: filterDays < 0 ? 'danger' : 'warn',
        icon: '💧',
        text: filterDays < 0
          ? `הפילטר אמור להיות מוחלף מזה ${Math.abs(filterDays)} ימים!`
          : filterDays === 0 ? 'החלפת פילטר נדרשת היום!'
          : `החלפת פילטר בעוד ${filterDays} ימים`
      });
    }

    if (supplyDays <= 0) {
      alerts.push({ cls: 'danger', icon: '☕', text: 'נגמר הקפה! זמן לקנות.' });
    } else if (state.bags > 0 && state.bags <= state.lowStockAlert) {
      alerts.push({ cls: 'warn', icon: '☕', text: `מלאי קפה נמוך — ${state.bags} שקיות בלבד` });
    }

    const c = el('alertsContainer');
    c.innerHTML = alerts.map(a =>
      `<div class="alert-item ${a.cls}">
        <span class="alert-icon">${a.icon}</span>
        <span class="alert-text">${a.text}</span>
      </div>`
    ).join('');
  }

  function renderActivity() {
    const list = el('activityList');
    const items = [...state.history].reverse().slice(0, 6);
    if (!items.length) {
      list.innerHTML = '<div class="empty-state"><span>🌟</span><p>אין פעילות עדיין</p></div>';
      return;
    }
    list.innerHTML = items.map(i =>
      `<div class="activity-item">
        <span class="activity-icon">${i.icon}</span>
        <div style="flex:1">
          <div class="activity-text">${i.text}</div>
          <div class="activity-time">${timeAgo(i.date)}</div>
        </div>
      </div>`
    ).join('');
  }

  /* ───────── Machine tab ───────── */
  function updateMachine() {
    const last = state.cleanings.length
      ? state.cleanings[state.cleanings.length - 1] : null;

    setText('lastCleaningDate', last ? fmtDate(last.date) : 'לא נרשם');
    setText('lastCleaningAgo',  last ? timeAgo(last.date) : '');
    setText('nextCleaningDate', state.nextCleaning ? fmtDate(state.nextCleaning) : 'לא נקבע');
    setText('nextCleaningIn',   state.nextCleaning ? timeAgo(state.nextCleaning) : '');

    // Cleaning progress
    let cpct = 0;
    if (last && state.nextCleaning) {
      const elapsed = Math.max(0, -daysDiff(last.date));
      const total   = Math.max(1, (new Date(state.nextCleaning) - new Date(last.date)) / 86400000);
      cpct = Math.min(100, Math.round((elapsed / total) * 100));
    }
    setText('cleaningPct', cpct + '%');
    const cbar = el('cleaningBar');
    if (cbar) {
      cbar.style.width = cpct + '%';
      cbar.className = 'progress-fill ' + (cpct >= 100 ? 'fill-danger' : 'fill-amber');
    }
    setText('cleaningCycle', state.cleaningCycle);

    // Filter
    setText('filterInstalledDate', state.filterInstalled ? fmtDate(state.filterInstalled) : 'לא נרשם');
    setText('filterInstalledAgo',  state.filterInstalled ? timeAgo(state.filterInstalled) : '');
    const fNext = state.filterInstalled ? addDays(state.filterInstalled, state.filterLifespan) : null;
    setText('filterNextDate', fNext ? fmtDate(fNext) : 'לא נקבע');
    setText('filterNextIn',   fNext ? timeAgo(fNext) : '');

    let fpct = 0;
    if (state.filterInstalled) {
      const used = Math.max(0, -daysDiff(state.filterInstalled));
      fpct = Math.min(100, Math.round((used / state.filterLifespan) * 100));
    }
    setText('filterPct', fpct + '%');
    const fbar = el('filterBar');
    if (fbar) {
      fbar.style.width = fpct + '%';
      fbar.className = 'progress-fill ' + (fpct >= 100 ? 'fill-danger' : 'fill-blue');
    }
    setText('filterLifespan', state.filterLifespan);

    renderMachineHistory();
  }

  function renderMachineHistory() {
    const wrap = el('machineHistory');
    const events = state.history
      .filter(h => h.type === 'cleaning' || h.type === 'filter')
      .reverse().slice(0, 15);

    if (!events.length) {
      wrap.innerHTML = '<div class="empty-state"><span>📋</span><p>אין היסטוריה עדיין</p></div>';
      return;
    }
    wrap.innerHTML = events.map(e =>
      `<div class="history-item">
        <div class="history-dot"></div>
        <div class="history-text">${e.text}</div>
        <div class="history-date">${fmtShortDate(e.date)}</div>
      </div>`
    ).join('');
  }

  /* ───────── Supply tab ───────── */
  function updateSupply() {
    setText('bagsCount',   String(state.bags));
    setText('gramsPerBag', String(state.gramsPerBag));
    setText('dailyUsage',  String(state.dailyUsage));
    setText('lowStockAlert', String(state.lowStockAlert));

    const totalG   = state.bags * state.gramsPerBag;
    const daysLeft = state.dailyUsage > 0 ? Math.floor(totalG / state.dailyUsage) : 0;
    setText('daysRemaining', String(daysLeft));
    setText('estimatedEmpty', daysLeft > 0 ? fmtShortDate(addDays(todayStr(), daysLeft)) : 'אין מלאי');
  }

  /* ───────── Recipes tab ───────── */
  function updateRecipes() {
    const wrap = el('recipesList');
    if (!state.recipes.length) {
      wrap.innerHTML = '<div class="empty-state"><span>📖</span><p>אין מתכונים עדיין</p></div>';
      return;
    }
    wrap.innerHTML = state.recipes.map((r, i) =>
      `<div class="recipe-card" onclick="App.showRecipe(${i})">
        <span class="recipe-emoji">${r.emoji}</span>
        <div class="recipe-info">
          <div class="recipe-name">${r.name}</div>
          <div class="recipe-desc">${r.description}</div>
          <div class="recipe-tags">${(r.tags || []).map(t => `<span class="recipe-tag">${t}</span>`).join('')}</div>
        </div>
        <span class="recipe-chev">‹</span>
      </div>`
    ).join('');
  }

  /* ───────── Actions: Machine ───────── */
  function markCleaning() {
    const d = todayStr();
    state.cleanings.push({ date: d });
    state.nextCleaning = addDays(d, state.cleaningCycle);
    addHistory({ date: d, type: 'cleaning', icon: '🧹', text: 'ניקוי מכונה בוצע' });
    save(); updateMachine(); updateHome();
    showToast('✅ ניקוי נרשם בהצלחה!');
  }

  function replaceFilter() {
    const d = todayStr();
    state.filterInstalled = d;
    state.filterHistory.push({ date: d });
    addHistory({ date: d, type: 'filter', icon: '💧', text: 'פילטר מים הוחלף' });
    save(); updateMachine(); updateHome();
    showToast('✅ פילטר הוחלף!');
  }

  function changeCleaningCycle(delta) {
    state.cleaningCycle = Math.max(1, Math.min(180, state.cleaningCycle + delta));
    save(); setText('cleaningCycle', state.cleaningCycle);
  }

  function changeFilterLife(delta) {
    state.filterLifespan = Math.max(5, Math.min(365, state.filterLifespan + delta));
    save(); updateMachine();
  }

  function showSetNextCleaning() {
    const def = state.nextCleaning || addDays(todayStr(), state.cleaningCycle);
    showModal('קבע ניקוי הבא',
      `<div class="form-group">
        <label class="form-label">תאריך ניקוי</label>
        <input type="date" class="form-input" id="nextCleanInput" value="${def}" min="${todayStr()}">
      </div>
      <button class="btn btn-primary" style="width:100%" onclick="App.setNextCleaning()">קבע תאריך</button>`
    );
  }

  function setNextCleaning() {
    const inp = el('nextCleanInput');
    if (inp?.value) {
      state.nextCleaning = inp.value;
      save(); closeModal(); updateMachine(); updateHome();
      showToast('📅 תאריך ניקוי נקבע!');
    }
  }

  /* ───────── Actions: Supply ───────── */
  function changeBags(delta) {
    const prev = state.bags;
    state.bags = Math.max(0, state.bags + delta);
    if (state.bags !== prev) {
      if (delta > 0) {
        addHistory({ date: todayStr(), type: 'supply', icon: '☕',
          text: `נוספו ${delta} שקית${delta > 1 ? 'ות' : ''} קפה` });
      }
      save(); updateSupply(); updateHome();
      // Bounce animation
      const v = el('bagsCount');
      if (v) { v.classList.remove('bump'); void v.offsetWidth; v.classList.add('bump'); }
    }
  }

  function changeGramsPerBag(delta) {
    state.gramsPerBag = Math.max(50, Math.min(2000, state.gramsPerBag + delta));
    save(); updateSupply();
  }
  function changeDailyUsage(delta) {
    state.dailyUsage = Math.max(1, Math.min(500, state.dailyUsage + delta));
    save(); updateSupply();
  }
  function changeLowStock(delta) {
    state.lowStockAlert = Math.max(0, Math.min(20, state.lowStockAlert + delta));
    save(); setText('lowStockAlert', state.lowStockAlert); updateHome();
  }

  /* ───────── Actions: Recipes ───────── */
  let activeRecipeIndex = null;

  function showRecipe(index) {
    const r = state.recipes[index];
    if (!r) return;
    activeRecipeIndex = index;
    const isDefault = r.id <= 6;

    const ingHtml = (r.ingredients || []).map(i =>
      `<div class="ingredient-row">
        <span class="ingredient-name">${i.name}</span>
        <span class="ingredient-amt">${i.amount}</span>
      </div>`
    ).join('');

    const stepsHtml = (r.steps || []).map((s, n) =>
      `<div class="step-row">
        <div class="step-num">${n + 1}</div>
        <div class="step-text">${s}</div>
      </div>`
    ).join('');

    const deleteBtn = isDefault ? '' :
      `<button class="recipe-delete-btn" onclick="App.deleteRecipe(${index})">🗑 מחק מתכון</button>`;

    el('recipeContent').innerHTML = `
      <div class="recipe-detail-hero">
        <span class="recipe-detail-emoji">${r.emoji}</span>
        <div>
          <div class="recipe-detail-title">${r.name}</div>
          <div class="recipe-detail-desc">${r.description}</div>
          <div class="recipe-detail-tags">${(r.tags || []).map(t => `<span class="recipe-tag">${t}</span>`).join('')}</div>
        </div>
      </div>
      ${r.ingredients?.length ? `<div class="recipe-section-lbl">מרכיבים</div>${ingHtml}` : ''}
      ${r.steps?.length ? `<div class="recipe-section-lbl">הכנה</div>${stepsHtml}` : ''}
      ${deleteBtn}
    `;

    el('recipeOverlay').classList.add('open');
  }

  function closeRecipe() {
    el('recipeOverlay').classList.remove('open');
    activeRecipeIndex = null;
  }

  function deleteRecipe(index) {
    if (!confirm('למחוק את המתכון?')) return;
    const name = state.recipes[index]?.name;
    state.recipes.splice(index, 1);
    save(); closeRecipe(); updateRecipes();
    showToast(`🗑 "${name}" נמחק`);
  }

  function showAddRecipe() {
    showModal('מתכון חדש',
      `<div class="form-group">
        <label class="form-label">שם המתכון *</label>
        <input type="text" class="form-input" id="nr-name" placeholder="למשל: אספרסו טורקי">
      </div>
      <div class="form-group">
        <label class="form-label">תיאור קצר</label>
        <input type="text" class="form-input" id="nr-desc" placeholder="תיאור חד-שורתי...">
      </div>
      <div class="form-group">
        <label class="form-label">תגיות (מופרדות בפסיק)</label>
        <input type="text" class="form-input" id="nr-tags" placeholder="קלאסי, חזק, קיץ">
      </div>
      <div class="form-group">
        <label class="form-label">מרכיבים — שורה לכל מרכיב בפורמט: שם | כמות</label>
        <textarea class="form-textarea" id="nr-ingredients" placeholder="קפה טחון | 18 גרם&#10;מים | 30 מ&quot;ל"></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">שלבי הכנה — שורה לכל שלב</label>
        <textarea class="form-textarea" id="nr-steps" placeholder="שלב ראשון...&#10;שלב שני..."></textarea>
      </div>
      <button class="btn btn-primary" style="width:100%;margin-top:4px" onclick="App.addRecipe()">הוסף מתכון ✓</button>`
    );
  }

  function addRecipe() {
    const name = el('nr-name')?.value.trim();
    if (!name) { showToast('⚠️ יש להזין שם'); return; }

    const desc  = el('nr-desc')?.value.trim() || '';
    const tags  = (el('nr-tags')?.value || '').split(',').map(t => t.trim()).filter(Boolean);
    const ingRaw = (el('nr-ingredients')?.value || '').split('\n').filter(Boolean);
    const stepsRaw = (el('nr-steps')?.value || '').split('\n').filter(Boolean);

    const ingredients = ingRaw.map(line => {
      const [n, a] = line.split('|').map(s => s.trim());
      return { name: n || line, amount: a || '' };
    });

    state.recipes.push({
      id: Date.now(),
      name, desc, description: desc, tags,
      emoji: '☕',
      ingredients,
      steps: stepsRaw
    });
    addHistory({ date: todayStr(), type: 'recipe', icon: '📖', text: `מתכון חדש: ${name}` });
    save(); closeModal(); updateRecipes();
    showToast('✅ מתכון נוסף!');
  }

  /* ───────── History helper ───────── */
  function addHistory(entry) {
    state.history.push(entry);
    if (state.history.length > 100) state.history = state.history.slice(-100);
  }

  /* ───────── Modal (bottom sheet) ───────── */
  function showModal(title, bodyHtml) {
    setText('modalTitle', title);
    el('modalBody').innerHTML = bodyHtml;
    el('modalOverlay').classList.add('open');
    // Focus first input after animation
    setTimeout(() => {
      const inp = el('modal').querySelector('input,textarea');
      if (inp) inp.focus();
    }, 350);
  }

  function closeModal() {
    el('modalOverlay').classList.remove('open');
  }

  /* ───────── Toast ───────── */
  let _toastTimer;
  function showToast(msg) {
    const t = el('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  /* ───────── Tab switching ───────── */
  const PAGE_TITLES = { home: 'בית', machine: 'מכונה', supply: 'מלאי', recipes: 'מתכונים' };

  function switchTab(name) {
    document.querySelectorAll('.nav-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === name)
    );
    document.querySelectorAll('.tab-content').forEach(s =>
      s.classList.toggle('active', s.id === 'tab-' + name)
    );
    setText('pageTitle', PAGE_TITLES[name] || '');
    el('main').scrollTo({ top: 0, behavior: 'smooth' });

    if (name === 'machine') updateMachine();
    if (name === 'supply')  updateSupply();
    if (name === 'recipes') updateRecipes();
  }

  /* ───────── Default recipes ───────── */
  function getDefaultRecipes() {
    return [
      {
        id: 1, name: 'אספרסו קלאסי', emoji: '☕',
        description: 'כוס איטלקית מסורתית — חזקה, עמוקה, בלתי נשכחת',
        tags: ['קלאסי', 'חזק', 'קצר'],
        ingredients: [
          { name: 'קפה טחון', amount: '18 גרם' },
          { name: 'מים', amount: '30 מ"ל' },
        ],
        steps: [
          'טחן קפה לאבקה עדינה מאוד',
          'הכנס לפורטאפילטר ודחוס ב-15 ק"ג לחץ',
          'הפעל מכונה — זמן חילוץ 25–30 שניות',
          'הגש מיד בכוסית מחוממת מראש'
        ]
      },
      {
        id: 2, name: 'לאטה', emoji: '🥛',
        description: 'אספרסו עם חלב מוחם סמוך וקצף קטיפתי',
        tags: ['חלבי', 'עדין', 'פופולרי'],
        ingredients: [
          { name: 'אספרסו כפול', amount: '60 מ"ל' },
          { name: 'חלב מוחם', amount: '150 מ"ל' },
          { name: 'קצף חלב', amount: '1 ס"מ' },
        ],
        steps: [
          'הכן שוט אספרסו כפול בכוס גדולה',
          'חמם חלב ל-65°C בלי לרתוח',
          'קצף לקצף קטיפתי ועשיר',
          'מזוג חלב לאיטיות מעל האספרסו',
          'הנח כפית קצף בלב הכוס'
        ]
      },
      {
        id: 3, name: 'קפוצ\'ינו', emoji: '🫧',
        description: 'שלושה שלישים מושלמים: אספרסו, חלב, קצף',
        tags: ['קלאסי', 'מאוזן'],
        ingredients: [
          { name: 'אספרסו', amount: '30 מ"ל' },
          { name: 'חלב מוחם', amount: '60 מ"ל' },
          { name: 'קצף חלב', amount: '60 מ"ל' },
        ],
        steps: [
          'הכן שוט אספרסו',
          'חמם חלב ל-65°C',
          'קצף לקצף עבה ויציב',
          'מזוג שליש חלב, לאחר מכן שליש קצף',
          'יחס קלאסי 1:1:1 — קפה:חלב:קצף'
        ]
      },
      {
        id: 4, name: 'אמריקנו', emoji: '🫖',
        description: 'אספרסו מדולל — ארוך, עדין, ורב-גוני',
        tags: ['ארוך', 'עדין'],
        ingredients: [
          { name: 'אספרסו כפול', amount: '60 מ"ל' },
          { name: 'מים חמים', amount: '120 מ"ל' },
        ],
        steps: [
          'הכן שוט אספרסו כפול',
          'חמם מים ל-90°C (לא רותחים)',
          'מזוג מים חמים לכוס',
          'הוסף אספרסו מעל המים בעדינות'
        ]
      },
      {
        id: 5, name: 'מאקיאטו', emoji: '☕',
        description: 'אספרסו עם כתם קצף — "מוכתם" בחלב',
        tags: ['קצר', 'חזק', 'איטלקי'],
        ingredients: [
          { name: 'אספרסו', amount: '30 מ"ל' },
          { name: 'קצף חלב', amount: '1 כף' },
        ],
        steps: [
          'הכן שוט אספרסו בכוסית',
          'קצף מעט חלב לקצף עבה',
          'הוסף כף אחת בלבד של קצף — בדיוק במרכז'
        ]
      },
      {
        id: 6, name: 'Cold Brew', emoji: '🧊',
        description: 'קפה קר בחליטה ארוכה — חלק, עדין, ממכר',
        tags: ['קר', 'קיץ', 'ייחודי'],
        ingredients: [
          { name: 'קפה גרוס גס', amount: '80 גרם' },
          { name: 'מים קרים', amount: '1 ליטר' },
        ],
        steps: [
          'גרוס קפה לגריסה גסה במיוחד',
          'ערבב עם מים קרים ביחס 1:12',
          'שמור בצנצנת סגורה במקרר',
          'חלוט 12–24 שעות (ככל שיותר — כהה יותר)',
          'סנן דרך פילטר קפה פעמיים',
          'הגש עם קרח בשפע'
        ]
      }
    ];
  }

  /* ───────── Init ───────── */
  function init() {
    load();
    updateHeader();
    updateHome();

    // Nav clicks
    document.querySelectorAll('.nav-btn').forEach(btn =>
      btn.addEventListener('click', () => switchTab(btn.dataset.tab))
    );

    // Stat card → navigate to tab
    document.querySelectorAll('.stat-card[data-tab]').forEach(card =>
      card.addEventListener('click', () => switchTab(card.dataset.tab))
    );

    // Clock tick
    setInterval(updateHeader, 60_000);

    // Register Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  /* ── Public API ── */
  return {
    init,
    // Machine
    markCleaning, replaceFilter,
    changeCleaningCycle, changeFilterLife,
    showSetNextCleaning, setNextCleaning,
    // Supply
    changeBags, changeGramsPerBag, changeDailyUsage, changeLowStock,
    // Recipes
    showRecipe, closeRecipe, deleteRecipe, showAddRecipe, addRecipe,
    // UI
    showModal, closeModal, showToast, switchTab,
  };

})();

document.addEventListener('DOMContentLoaded', App.init);
