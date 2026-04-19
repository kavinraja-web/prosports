let currentSelectedRole = '';
let pendingLoginUser    = null;
let currentUser         = null;  // always in sync with localStorage

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────
function debounce(fn, delay) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), delay); };
}

function setFieldStatus(fieldId, state, message) {
    const input = document.getElementById(fieldId);
    if (!input) return;
    let hint = input.parentElement.querySelector('.field-hint');
    if (!hint) {
        hint = document.createElement('p');
        hint.className = 'field-hint text-xs mt-1 font-bold';
        input.parentElement.appendChild(hint);
    }
    input.classList.remove('border-green-500','border-red-500','border-blue-400','border-gray-200');
    hint.classList.remove('text-green-600','text-red-500','text-blue-500','text-gray-400');
    if (state === 'loading') { input.classList.add('border-blue-400'); hint.classList.add('text-blue-500'); hint.innerHTML=`<i class="fas fa-spinner fa-spin mr-1"></i>${message}`; }
    else if (state === 'success') { input.classList.add('border-green-500'); hint.classList.add('text-green-600'); hint.innerHTML=`<i class="fas fa-check-circle mr-1"></i>${message}`; }
    else if (state === 'error')   { input.classList.add('border-red-500');   hint.classList.add('text-red-500');   hint.innerHTML=`<i class="fas fa-times-circle mr-1"></i>${message}`; }
    else { input.classList.add('border-gray-200'); hint.innerHTML=''; }
}

function showToast(message, type = 'success') {
    let t = document.getElementById('psToast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'psToast';
        t.style.cssText = 'position:fixed;bottom:32px;left:50%;transform:translateX(-50%) translateY(100px);padding:14px 28px;border-radius:50px;font-weight:800;font-size:0.9rem;z-index:9999;transition:transform 0.4s cubic-bezier(.175,.885,.32,1.275),opacity 0.4s;opacity:0;white-space:nowrap;box-shadow:0 8px 32px rgba(0,0,0,0.25);letter-spacing:0.03em;max-width:90vw;text-align:center;';
        document.body.appendChild(t);
    }
    t.style.background = type === 'success' ? '#1e3a8a' : type === 'warn' ? '#d97706' : '#dc2626';
    t.style.color = '#fff';
    t.textContent = message;
    requestAnimationFrame(() => { t.style.transform='translateX(-50%) translateY(0)'; t.style.opacity='1'; });
    setTimeout(() => { t.style.transform='translateX(-50%) translateY(100px)'; t.style.opacity='0'; }, 3500);
}

// ─────────────────────────────────────────────
//  Dynamic Ticker
// ─────────────────────────────────────────────
async function loadDynamicTicker() {
    try {
        const res = await fetch('/events');
        if (!res.ok) return;
        const events = await res.json();
        
        // Filter out past events
        const now = new Date();
        now.setHours(0,0,0,0);
        const upcoming = events.filter(e => new Date(e.date) >= now);
        
        if (upcoming.length === 0) return; // Keep the default hardcoded HTML text
        
        // Sort closest events first
        upcoming.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        // Take top 4 upcoming events
        const topEvents = upcoming.slice(0, 4);
        
        const tickerParts = topEvents.map(e => {
            const dateStr = new Date(e.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
            return `🔥 ${e.eventName.toUpperCase()} IN ${e.venueName.toUpperCase()} • ENROLLMENT CLOSES: ${dateStr}`;
        });
        
        const tickerString = `🏆 REGISTRATIONS ARE NOW OPEN! • ${tickerParts.join(' • ')} • PREPARE TO RISE TO THE CHALLENGE 🏆`;
        
        const tickerEl = document.querySelector('.ticker-text');
        if (tickerEl) {
            tickerEl.innerHTML = tickerString;
            // Adjust the animation duration based on length to maintain comfortable reading speed
            const speed = Math.max(25, tickerString.length / 4);
            tickerEl.style.animationDuration = `${speed}s`;
        }
    } catch {
        // If server fails or is offline, it just silently keeps the default HTML ticker
    }
}

// ─────────────────────────────────────────────
//  DOM Ready
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    currentUser = JSON.parse(localStorage.getItem('proSportsUser'));
    refreshUI();
    loadDynamicTicker();
    
    // Always start at home after a refresh, even if logged in
    showHomePage();

    // Set min date for event form to today
    const evtDate = document.getElementById('evtDate');
    if (evtDate) evtDate.min = new Date().toISOString().split('T')[0];

    // Hero buttons
    document.querySelectorAll('header a').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (localStorage.getItem('proSportsUser')) return;
            setTimeout(() => { resetModal(); document.getElementById('authModal').classList.remove('hidden'); }, 200);
        });
    });

    // Dash search
    const ds = document.getElementById('dashSearch');
    if (ds) ds.addEventListener('input', e => filterAthleteEvents(e.target.value));

    // Auth modal
    document.getElementById('authModal').addEventListener('click', e => { if (e.target === document.getElementById('authModal')) hideModal(); });
    document.getElementById('closeModal').onclick       = hideModal;
    document.getElementById('emailCheckBtn').onclick    = checkEmailAndAdvance;
    document.getElementById('uEmail').addEventListener('keydown', e => { if (e.key==='Enter') checkEmailAndAdvance(); });
    document.getElementById('finalSubmit').onclick      = submitRegistration;
    document.getElementById('loginConfirmBtn').onclick  = confirmLogin;

    // Live ID watcher
    document.getElementById('uIdNumber').addEventListener('input', debounce(async (e) => {
        const id = e.target.value.trim();
        if (!id) { setFieldStatus('uIdNumber','idle',''); return; }
        const c = id.replace(/\s/g,'');
        if (/^\d+$/.test(c) && c.length < 12) { setFieldStatus('uIdNumber','loading',`Aadhaar: ${c.length}/12 digits…`); return; }
        setFieldStatus('uIdNumber','loading','Validating…');
        try {
            const r = await fetch(`/validate-id?id=${encodeURIComponent(c)}`);
            const d = await r.json();
            if (d.valid) setFieldStatus('uIdNumber','success',`${d.type} verified ✓`);
            else         setFieldStatus('uIdNumber','error', d.reason);
        } catch { setFieldStatus('uIdNumber','success','Format OK (offline)'); }
    }, 600));

    document.getElementById('fullName').addEventListener('input', e => {
        const v = e.target.value.trim();
        if (v.length>=3) setFieldStatus('fullName','success','Name accepted ✓');
        else if (v.length>0) setFieldStatus('fullName','error','At least 3 characters');
        else setFieldStatus('fullName','idle','');
    });

    // Auto-extract venue name from maps link
    const evtMapsInput = document.getElementById('evtMaps');
    if (evtMapsInput) {
        evtMapsInput.addEventListener('input', debounce(async (e) => {
            const url = e.target.value.trim();
            if (!url) { setFieldStatus('evtMaps','idle',''); return; }
            setFieldStatus('evtMaps','loading','Extracting venue name...');
            try {
                const res = await fetch(`/extract-location?url=${encodeURIComponent(url)}`);
                const data = await res.json();
                if (data.name) {
                    const venueInput = document.getElementById('evtVenue');
                    if (!venueInput.value || venueInput.value === data.name) {
                        venueInput.value = data.name;
                        setFieldStatus('evtVenue', 'success', 'Auto-filled ✓');
                    }
                    setFieldStatus('evtMaps', 'success', 'Location matched ✓');
                } else {
                    setFieldStatus('evtMaps', 'idle', 'Could not extract name automatically');
                }
            } catch {
                setFieldStatus('evtMaps', 'idle', '');
            }
        }, 800));
    }
});

// ─────────────────────────────────────────────
//  UI Routing based on role
// ─────────────────────────────────────────────

function openPublicEvents(sportTag = 'all') {
    // Hide home sections
    document.querySelector('header').classList.add('hidden');
    document.querySelector('#register').classList.add('hidden');
    if (document.querySelector('footer')) document.querySelector('footer').classList.add('hidden');

    // Hide official dashboard if open
    const officialDash = document.getElementById('officialDashboard');
    if (officialDash) officialDash.classList.add('hidden');
    
    // Show athlete/public dashboard
    document.getElementById('sportsDashboard').classList.remove('hidden');

    // Toggle profile banner based on whether logged in as Athlete
    const user = JSON.parse(localStorage.getItem('proSportsUser'));
    const banner = document.getElementById('athleteProfileBanner');
    if (banner) {
        if (!user || user.role !== 'Athlete') {
            banner.classList.add('hidden');
        } else {
            banner.classList.remove('hidden');
        }
    }

    loadEventsByTag(sportTag);
    window.scrollTo(0, 0);
}
function showHomePage() {
    // Show home sections
    document.querySelector('header').classList.remove('hidden');
    document.querySelector('#register').classList.remove('hidden');
    if (document.querySelector('footer')) document.querySelector('footer').classList.remove('hidden');

    // Hide dashboards
    const od = document.getElementById('officialDashboard');
    const sd = document.getElementById('sportsDashboard');
    if (od) od.classList.add('hidden');
    if (sd) sd.classList.add('hidden');
    
    window.scrollTo(0, 0);
}

function showRoleDashboard(user, type = 'Sports') {
    // Persist the type
    localStorage.setItem('proSportsViewMode', type);

    // Hide ALL main page sections and ALL dashboards first
    document.querySelector('header').classList.add('hidden');
    document.querySelector('#register').classList.add('hidden');
    document.getElementById('officialDashboard').classList.add('hidden');
    document.getElementById('sportsDashboard').classList.add('hidden');
    if (document.querySelector('footer')) document.querySelector('footer').classList.add('hidden');

    if (user.role === 'Official') {
        document.getElementById('officialDashboard').classList.remove('hidden');
        document.getElementById('offUserName').innerText    = user.name;
        document.getElementById('offUserInitial').innerText = user.name.charAt(0).toUpperCase();

        const btnText = document.getElementById('dynamicPostText');
        const btnIcon = document.getElementById('dynamicPostIcon');
        const dashTitle = document.getElementById('officialDashTitle');
        const postBtn = document.getElementById('dynamicPostBtn');
        
        if (type === 'Marathon') {
            if(btnText) btnText.innerText = 'Post Marathon';
            if(btnIcon) btnIcon.className = 'fas fa-running text-xl';
            if(dashTitle) dashTitle.innerText = 'My Marathon Events';
            if(postBtn) {
                postBtn.className = 'bg-red-600 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-yellow-500 hover:text-blue-900 transition-all shadow-lg flex items-center justify-center gap-3';
                postBtn.setAttribute('onclick', "openCreateEventModal('Marathon')");
            }
        } else {
            if(btnText) btnText.innerText = 'Post Sport';
            if(btnIcon) btnIcon.className = 'fas fa-basketball text-xl';
            if(dashTitle) dashTitle.innerText = 'My Sports Events';
            if(postBtn) {
                postBtn.className = 'bg-blue-900 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-yellow-500 hover:text-blue-900 transition-all shadow-lg flex items-center justify-center gap-3';
                postBtn.setAttribute('onclick', "openCreateEventModal('Sports')");
            }
        }

        loadOfficialEvents(user.email, type);
    } else {
        document.getElementById('sportsDashboard').classList.remove('hidden');
        document.getElementById('dashUserName').innerText    = user.name;
        document.getElementById('dashUserInitial').innerText = user.name.charAt(0).toUpperCase();
        loadEventsByTag(type === 'Marathon' ? 'Marathon' : 'all');
        loadMyRegistrations(user.email);
    }
    window.scrollTo(0, 0);
}

function openUserDashboard() {
    const user = JSON.parse(localStorage.getItem('proSportsUser'));
    if (!user) {
        showToast('Please log in first.', 'warn');
        resetModal();
        document.getElementById('authModal').classList.remove('hidden');
        return;
    }
    const savedMode = localStorage.getItem('proSportsViewMode') || 'Sports';
    showRoleDashboard(user, savedMode);
}

async function loadMyRegistrations(email) {
    const list = document.getElementById('myRegistrationsList');
    if (!list) return;
    try {
        const res = await fetch(`/my-registrations?email=${encodeURIComponent(email)}`);
        const regs = await res.json();
        if (regs.length === 0) {
            list.innerHTML = `<div class="col-span-full py-10 text-center text-gray-400 font-bold bg-white rounded-2xl border-2 border-dashed"><p>No registrations found. Register for an event to see it here!</p></div>`;
            return;
        }
        list.innerHTML = regs.map(r => `
            <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between">
                <div>
                    <h3 class="text-lg font-black text-blue-900 mb-1">${r.eventId.eventName}</h3>
                    <p class="text-xs text-gray-400 font-bold uppercase tracking-widest mb-3">${r.eventId.sport}</p>
                    <div class="space-y-2 mb-4">
                        <div class="flex items-center gap-2 text-sm text-gray-600 font-semibold">
                            <i class="fas fa-calendar-alt text-blue-900 w-4"></i>
                            <span>${new Date(r.eventId.date).toLocaleDateString()}</span>
                        </div>
                        <div class="flex items-center gap-2 text-sm text-gray-600 font-semibold">
                            <i class="fas fa-check-circle text-green-600 w-4"></i>
                            <span class="text-green-600 font-black uppercase text-xs">
                                Confirmed
                            </span>
                        </div>
                    </div>
                </div>
                <div class="flex flex-col gap-2">
                    ${r.receiptFileName ? `<a href="/registrations/${r._id}/receipt" class="w-full text-center bg-green-50 text-green-700 p-3 rounded-xl font-black text-xs uppercase hover:bg-green-100 transition-all border border-green-200">
                        <i class="fas fa-file-download mr-1"></i> Download Confirmation
                    </a>` : ''}
                </div>
            </div>
        `).join('');
    } catch {
        list.innerHTML = `<p class="text-red-400 col-span-full text-center p-10 font-bold">Could not load registrations.</p>`;
    }
}

function refreshUI() {
    const user = JSON.parse(localStorage.getItem('proSportsUser'));
    const loggedOut = document.getElementById('loggedOutButtons');
    const loggedIn  = document.getElementById('loggedInProfile');
    const mobileLoggedOut = document.getElementById('mobileLoggedOut');
    const mobileLoggedIn  = document.getElementById('mobileLoggedIn');

    if (user) {
        if (loggedOut) loggedOut.classList.add('hidden');
        if (loggedIn)  loggedIn.classList.remove('hidden');
        if (mobileLoggedOut) mobileLoggedOut.classList.add('hidden');
        if (mobileLoggedIn)  mobileLoggedIn.classList.remove('hidden');

        document.getElementById('userInitialLetter').innerText = user.name.charAt(0).toUpperCase();
        if (document.getElementById('mobileUserInitialLetter')) document.getElementById('mobileUserInitialLetter').innerText = user.name.charAt(0).toUpperCase();

        const nm = document.getElementById('navUserName');
        const rl = document.getElementById('navUserRole');
        const mnm = document.getElementById('mobileNavUserName');
        const mrl = document.getElementById('mobileNavUserRole');

        if (nm) nm.innerText = user.name;
        if (rl) rl.innerText = user.role;
        if (mnm) mnm.innerText = user.name;
        if (mrl) mrl.innerText = user.role;
    } else {
        if (loggedOut) loggedOut.classList.remove('hidden');
        if (loggedIn)  loggedIn.classList.add('hidden');
        if (mobileLoggedOut) mobileLoggedOut.classList.remove('hidden');
        if (mobileLoggedIn)  mobileLoggedIn.classList.add('hidden');
    }
}

function toggleMobileMenu() {
    const overlay = document.getElementById('mobileMenuOverlay');
    if (overlay.classList.contains('hidden')) {
        overlay.classList.remove('hidden');
        overlay.classList.add('flex');
        document.body.style.overflow = 'hidden'; // Prevent scroll
    } else {
        overlay.classList.add('hidden');
        overlay.classList.remove('flex');
        document.body.style.overflow = 'auto'; // Restore scroll
    }
}

function handleLogout() {
    localStorage.removeItem('proSportsUser');
    location.reload();
}

// ─────────────────────────────────────────────
//  Auth Modal Steps
// ─────────────────────────────────────────────
function hideAllSteps() {
    ['step1','step2','step3login','step3register'].forEach(id => document.getElementById(id).classList.add('hidden'));
}

function openDirectLogin(role) {
    showDetailsForm(role);
    document.getElementById('authModal').classList.remove('hidden');
}

function showDetailsForm(role) {
    currentSelectedRole = role;
    document.getElementById('modalSubTitle').innerText = `Registering as ${role}`;
    document.getElementById('formTitle').innerText = `${role} – Enter Email`;
    hideAllSteps();
    document.getElementById('step2').classList.remove('hidden');
    document.getElementById('uEmail').value = '';
    setTimeout(() => document.getElementById('uEmail').focus(), 100);
}

function goToStep2() {
    hideAllSteps();
    document.getElementById('step2').classList.remove('hidden');
    document.getElementById('uEmail').focus();
}

function resetModal() {
    hideAllSteps();
    document.getElementById('step1').classList.remove('hidden');
    document.getElementById('modalSubTitle').innerText = 'Official Portal';
    pendingLoginUser = null;
}

function hideModal() { document.getElementById('authModal').classList.add('hidden'); }

async function checkEmailAndAdvance() {
    const email = document.getElementById('uEmail').value.trim().toLowerCase();
    const btn   = document.getElementById('emailCheckBtn');
    if (!email) { showToast('Please enter your email.','error'); return; }
    const re = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
    if (!re.test(email)) { showToast('Invalid email format.','error'); return; }

    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i> Checking…`;

    try {
        const res  = await fetch(`/check-email?email=${encodeURIComponent(email)}&role=${currentSelectedRole}`);
        const data = await res.json();
        hideAllSteps();

        if (data.exists) {
            pendingLoginUser = data.user;
            document.getElementById('loginWelcomeMsg').textContent = `Account found: ${data.user.name} (${data.user.role})`;
            document.getElementById('loginIdTypeBadge').textContent = `${data.user.idType}-Verified Member`;
            document.getElementById('step3login').classList.remove('hidden');
            document.getElementById('modalSubTitle').innerText = `Welcome back, ${data.user.name}!`;
        } else {
            document.getElementById('uEmailDisplay').value = email;
            document.getElementById('regFormTitle').innerText = `${currentSelectedRole} Registration`;
            document.getElementById('step3register').classList.remove('hidden');
            document.getElementById('modalSubTitle').innerText = `New ${currentSelectedRole} Account`;
            setTimeout(() => document.getElementById('fullName').focus(), 100);
        }
    } catch {
        showToast('Cannot reach server. Is the backend running?','error');
        document.getElementById('step2').classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.innerHTML = `Continue <i class="fas fa-arrow-right ml-2"></i>`;
    }
}

async function confirmLogin() {
    const btn = document.getElementById('loginConfirmBtn');
    if (!pendingLoginUser) { showToast('Session expired. Try again.','error'); resetModal(); return; }
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i> Logging in…`;
    try {
        const res  = await fetch('/login', {
            method: 'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ email: pendingLoginUser.email, role: currentSelectedRole })
        });
        const data = await res.json();
        if (res.ok) {
            localStorage.setItem('proSportsUser', JSON.stringify(data.user));
            showToast(`✅ ${data.message}`,'success');
            setTimeout(() => location.reload(), 1200);
        } else {
            showToast(data.error || 'Login failed.','error');
            btn.disabled=false; btn.innerHTML=`<i class="fas fa-sign-in-alt mr-2"></i> Login Now`;
        }
    } catch {
        showToast('Server offline.','error');
        btn.disabled=false; btn.innerHTML=`<i class="fas fa-sign-in-alt mr-2"></i> Login Now`;
    }
}

async function submitRegistration() {
    const btn = document.getElementById('finalSubmit');
    const payload = {
        name:     document.getElementById('fullName').value.trim(),
        email:    document.getElementById('uEmailDisplay').value.trim(),
        idNumber: document.getElementById('uIdNumber').value.trim(),
        role:     currentSelectedRole
    };
    if (!payload.name||!payload.email||!payload.idNumber) { showToast('Please fill in all fields.','error'); return; }
    btn.disabled=true; btn.innerHTML=`<i class="fas fa-spinner fa-spin mr-2"></i> Verifying…`;
    try {
        const res    = await fetch('/register', {
            method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)
        });
        const result = await res.json();
        if (res.ok) {
            localStorage.setItem('proSportsUser', JSON.stringify(result.user));
            showToast(`✅ ${result.message}`,'success');
            setTimeout(() => location.reload(), 1500);
        } else {
            showToast(result.error||'Verification failed.','error');
            btn.disabled=false; btn.innerHTML=`Verify & Complete <i class="fas fa-arrow-right ml-2"></i>`;
        }
    } catch {
        showToast('Server offline.','error');
        btn.disabled=false; btn.innerHTML=`Verify & Complete <i class="fas fa-arrow-right ml-2"></i>`;
    }
}

function handleHeroButtonClick(type) {
    const user = JSON.parse(localStorage.getItem('proSportsUser'));
    if (!user) {
        resetModal();
        document.getElementById('authModal').classList.remove('hidden');
        return;
    }
    
    if (user.role === 'Official') {
        showRoleDashboard(user, type);
        openCreateEventModal(type);
    } else {
        openPublicEvents(type === 'Marathon' ? 'Marathon' : 'all');
    }
}

// ─────────────────────────────────────────────
//  CREATE EVENT MODAL
// ─────────────────────────────────────────────
function openCreateEventModal(type = 'Sports') {
    document.getElementById('createEventForm').reset();
    document.getElementById('pdfLabel').textContent = 'Click to upload PDF form';
    
    const evtTypeInput = document.getElementById('evtType');
    if (evtTypeInput) evtTypeInput.value = type;
    
    const sportSelect = document.getElementById('evtSport');
    if (type === 'Marathon') {
        document.getElementById('modalEventPostingTitle').innerText = 'POST MARATHON';
        sportSelect.innerHTML = `<option value="Marathon" selected>Marathon</option>`;
        sportSelect.classList.add('bg-gray-200');
        sportSelect.style.pointerEvents = 'none';
    } else {
        document.getElementById('modalEventPostingTitle').innerText = 'POST SPORT EVENT';
        sportSelect.innerHTML = `
          <option value="" disabled selected>Select Sport</option>
          <option value="Cricket">Cricket</option>
          <option value="Football">Football</option>
          <option value="Kabaddi">Kabaddi</option>
          <option value="Track & Field">Track & Field</option>
        `;
        sportSelect.classList.remove('bg-gray-200');
        sportSelect.style.pointerEvents = 'auto';
    }

    document.getElementById('createEventModal').classList.remove('hidden');
}

function closeCreateEventModal() {
    document.getElementById('createEventModal').classList.add('hidden');
}

function handlePdfSelect(input) {
    const file = input.files[0];
    if (file) {
        if (file.type !== 'application/pdf') {
            showToast('Only PDF files are allowed.','error');
            input.value = '';
            document.getElementById('pdfLabel').textContent = 'Click to upload PDF form';
            return;
        }
        if (file.size > 10*1024*1024) {
            showToast('File too large. Max 10 MB.','error');
            input.value = '';
            return;
        }
        document.getElementById('pdfLabel').innerHTML = `<i class="fas fa-check-circle text-green-500 mr-2"></i>${file.name}`;
    }
}

async function submitCreateEvent() {
    const user = JSON.parse(localStorage.getItem('proSportsUser'));
    if (!user || user.role !== 'Official') { showToast('Only Officials can create events.','error'); return; }

    const evtName     = document.getElementById('evtName').value.trim();
    const evtSport    = document.getElementById('evtSport').value;
    const evtType     = document.getElementById('evtType').value;
    const evtDate     = document.getElementById('evtDate').value;
    const evtVenue    = document.getElementById('evtVenue').value.trim();
    const evtMaps     = document.getElementById('evtMaps').value.trim();
    const evtCategory = document.getElementById('evtCategory').value;
    const evtPdf      = document.getElementById('evtPdf').files[0];

    if (!evtName||!evtSport||!evtType||!evtDate||!evtVenue||!evtCategory) {
        showToast('Please fill in all required fields.','error');
        return;
    }

    const btn = document.querySelector('#createEventForm + div button') || document.querySelector('[onclick="submitCreateEvent()"]');

    // Build FormData (needed for file upload)
    const formData = new FormData();
    formData.append('eventName',     evtName);
    formData.append('sport',         evtSport);
    formData.append('eventType',     evtType);
    formData.append('date',          evtDate);
    formData.append('venueName',     evtVenue);
    formData.append('mapsLink',      evtMaps);
    formData.append('category',      evtCategory);
    formData.append('officialEmail', user.email);
    formData.append('officialName',  user.name);
    if (evtPdf) formData.append('registrationForm', evtPdf);

    // Disable submit button
    const submitBtn = document.querySelector('#createEventModal [onclick="submitCreateEvent()"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i> Publishing…`;

    try {
        const res  = await fetch('/events', { method:'POST', body: formData });
        const data = await res.json();
        if (res.ok) {
            showToast(`✅ Event "${evtName}" published successfully!`,'success');
            closeCreateEventModal();
            loadOfficialEvents(user.email, evtType);
        } else {
            showToast(data.error || 'Failed to create event.','error');
        }
    } catch {
        showToast('Server offline.','error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<i class="fas fa-upload"></i> Publish Event`;
    }
}

// ─────────────────────────────────────────────
//  LOAD EVENTS – Official's own events
// ─────────────────────────────────────────────
async function loadOfficialEvents(officialEmail, type = 'Sports') {
    const container = document.getElementById('offEventsList');
    const noMsg     = document.getElementById('offNoEvents');
    const countBadge= document.getElementById('offEventCount');
    container.innerHTML = `<div class="col-span-3 py-10 text-center text-gray-300"><i class="fas fa-spinner fa-spin text-4xl"></i></div>`;

    try {
        const res    = await fetch(`/events?official=${encodeURIComponent(officialEmail)}`);
        let events = await res.json();

        // Filter events by view context
        if (type === 'Marathon') {
            events = events.filter(e => e.eventType === 'Marathon');
        } else {
            events = events.filter(e => e.eventType !== 'Marathon');
        }

        countBadge.textContent = `${events.length} Event${events.length !== 1 ? 's' : ''}`;

        if (events.length === 0) {
            container.innerHTML = '';
            noMsg.classList.remove('hidden');
            const noMsgText = noMsg.querySelector('p');
            if (noMsgText) noMsgText.innerText = `No ${type} events yet`;
            return;
        }
        noMsg.classList.add('hidden');
        container.innerHTML = events.map(e => renderEventCard(e, true)).join('');
    } catch {
        container.innerHTML = `<p class="text-red-400 font-bold col-span-3 text-center py-10">Could not load events (server offline)</p>`;
    }
}

// ─────────────────────────────────────────────
//  LOAD EVENTS – Athlete view (by sport tag)
// ─────────────────────────────────────────────
let currentAthleteEvents = [];

async function loadEventsByTag(tag) {
    // Update tab styles
    document.querySelectorAll('.sport-tab').forEach(t => {
        t.classList.remove('active-tab','bg-blue-900','text-white');
        t.classList.add('bg-gray-100','text-gray-700');
    });
    const activeTab = document.querySelector(`.sport-tab[data-tag="${tag}"]`);
    if (activeTab) { activeTab.classList.remove('bg-gray-100','text-gray-700'); activeTab.classList.add('active-tab','bg-blue-900','text-white'); }

    const container = document.getElementById('athleteEventsList');
    const noMsg     = document.getElementById('athleteNoEvents');
    container.innerHTML = `<div class="col-span-3 py-10 text-center text-gray-300"><i class="fas fa-spinner fa-spin text-4xl"></i></div>`;

    let url = '/events';
    if (tag !== 'all') url += `?sport=${encodeURIComponent(tag)}`;

    try {
        const res    = await fetch(url);
        currentAthleteEvents = await res.json();
        renderAthleteEvents(currentAthleteEvents);
    } catch {
        container.innerHTML = `<p class="text-red-400 font-bold col-span-3 text-center py-10">Could not load events (server offline)</p>`;
    }
}

function filterAthleteEvents(term) {
    const filtered = currentAthleteEvents.filter(e =>
        e.eventName.toLowerCase().includes(term.toLowerCase()) ||
        e.sport.toLowerCase().includes(term.toLowerCase()) ||
        e.venueName.toLowerCase().includes(term.toLowerCase())
    );
    renderAthleteEvents(filtered);
}

function renderAthleteEvents(events) {
    const container = document.getElementById('athleteEventsList');
    const noMsg     = document.getElementById('athleteNoEvents');
    if (events.length === 0) {
        container.innerHTML = '';
        noMsg.classList.remove('hidden');
        const noMsgP = noMsg.querySelector('p');
        if (noMsgP) noMsgP.innerText = 'No events currently posted here';
    } else {
        noMsg.classList.add('hidden');
        container.innerHTML = events.map(e => renderEventCard(e, false)).join('');
    }
}

// ─────────────────────────────────────────────
//  EVENT CARD HTML
// ─────────────────────────────────────────────
function renderEventCard(e, isOfficial) {
    const sportColors = {
        'Cricket':     'bg-green-600',
        'Football':    'bg-blue-600',
        'Kabaddi':     'bg-orange-500',
        'Track & Field':'bg-purple-600',
        'Marathon':    'bg-red-600'
    };
    const catColors = {
        'Under 18': 'bg-blue-100 text-blue-700',
        'Above 18': 'bg-purple-100 text-purple-700',
        'Both':     'bg-green-100 text-green-700'
    };

    const sportBg  = sportColors[e.sport] || 'bg-blue-900';
    const catStyle = catColors[e.category] || 'bg-gray-100 text-gray-500';
    const dateStr  = new Date(e.date).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
    const hasPdf   = !!e.pdfFileName;

    return `
    <div class="event-card bg-white rounded-2xl shadow-md hover:shadow-xl overflow-hidden border border-gray-100">
      <!-- Sport tag banner -->
      <div class="${sportBg} px-5 py-3 flex items-center justify-between">
        <span class="text-white font-black uppercase text-sm tracking-wider">${e.sport}</span>
        <span class="${catStyle} text-xs font-black px-3 py-1 rounded-full">${e.category}</span>
      </div>
      <!-- Content -->
      <div class="p-5">
        <h3 class="text-lg font-black text-blue-900 mb-1 leading-tight">${e.eventName}</h3>
        <p class="text-xs text-yellow-600 font-black uppercase tracking-widest mb-3">${e.eventType}</p>

        <div class="space-y-2 mb-4">
          <div class="flex items-center gap-2 text-sm text-gray-600 font-semibold">
            <i class="fas fa-calendar-alt text-blue-900 w-4"></i>
            <span>${dateStr}</span>
          </div>
          <div class="flex items-center gap-2 text-sm text-gray-600 font-semibold">
            <i class="fas fa-map-marker-alt text-blue-900 w-4"></i>
            <span class="truncate">${e.venueName}</span>
          </div>
          <div class="flex items-center gap-2 text-sm text-gray-600 font-semibold">
            <i class="fas fa-user-tie text-blue-900 w-4"></i>
            <span>By ${e.officialName}</span>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex gap-2 mt-4">
          ${e.mapsLink ? `
          <a href="${e.mapsLink}" target="_blank"
            class="flex-1 flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 font-black text-xs px-3 py-2.5 rounded-xl transition-all border border-red-200">
            <i class="fab fa-google"></i> Location
          </a>` : `
          <div class="flex-1 flex items-center justify-center gap-2 bg-gray-50 text-gray-300 font-black text-xs px-3 py-2.5 rounded-xl border border-gray-100">
            <i class="fas fa-map-marker-slash"></i> No Map
          </div>`}

          ${hasPdf ? `
          <a href="/events/${e.id}/form" target="_blank" download
            class="flex-1 flex items-center justify-center gap-2 bg-blue-900 hover:bg-yellow-500 hover:text-blue-900 text-white font-black text-xs px-3 py-2.5 rounded-xl transition-all">
            <i class="fas fa-file-pdf"></i> Download Blank Form
          </a>` : `
          <div class="flex-1 flex items-center justify-center gap-2 bg-gray-50 text-gray-300 font-black text-xs px-3 py-2.5 rounded-xl border border-gray-100">
            <i class="fas fa-file-pdf"></i> No Form
          </div>`}
        </div>

        ${isOfficial ? `
        <div class="flex gap-2 mt-2">
            <button onclick="openViewRegsModal('${e.id}', '${e.eventName.replace(/'/g, "\\'")}')"
              class="flex-1 flex items-center justify-center gap-2 bg-green-50 text-green-700 hover:bg-green-100 font-bold text-xs px-3 py-2 rounded-xl transition-all border border-green-200">
              <i class="fas fa-users"></i> Registrations
            </button>
            <button onclick="deleteEvent('${e.id}')"
              class="flex-1 flex items-center justify-center gap-2 text-red-500 hover:bg-red-50 font-bold text-xs px-3 py-2 rounded-xl transition-all border border-red-100">
              <i class="fas fa-trash"></i> Delete
            </button>
        </div>` : `
        <button onclick="openUploadFormModal('${e.id}', '${e.eventName.replace(/'/g, "\\'")}', ${hasPdf})"
          class="w-full mt-2 flex items-center justify-center gap-2 bg-yellow-500 text-blue-900 hover:bg-yellow-400 font-black text-xs px-3 py-2 rounded-xl transition-all shadow border border-yellow-600">
          <i class="fas fa-upload"></i> Upload Filled Form & Register
        </button>`}
      </div>
    </div>`;
}

// ─────────────────────────────────────────────
//  DELETE EVENT
// ─────────────────────────────────────────────
async function deleteEvent(eventId) {
    const user = JSON.parse(localStorage.getItem('proSportsUser'));
    if (!user) return;
    if (!confirm('Are you sure you want to delete this event?')) return;

    try {
        const res  = await fetch(`/events/${eventId}`, {
            method: 'DELETE',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ officialEmail: user.email })
        });
        const data = await res.json();
        if (res.ok) { showToast('Event deleted.','warn'); loadOfficialEvents(user.email); }
        else         showToast(data.error || 'Could not delete.','error');
    } catch { showToast('Server offline.','error'); }
}

// ─────────────────────────────────────────────
//  ATHLETE: REGISTER FOR EVENT
// ─────────────────────────────────────────────
function openUploadFormModal(eventId, eventName, eventHasPdf) {
    const user = JSON.parse(localStorage.getItem('proSportsUser'));
    if (!user || user.role !== 'Athlete') {
        showToast('Please log in as an Athlete to register.', 'error');
        setTimeout(() => openDirectLogin('Athlete'), 1500);
        return;
    }

    document.getElementById('uploadRegForm').reset();
    document.getElementById('regEventId').value = eventId;
    document.getElementById('uploadEventName').innerText = eventName;
    document.getElementById('regPdfLabel').textContent = 'Click to upload PDF';
    document.getElementById('uploadFormModal').classList.remove('hidden');
}

function closeUploadFormModal() {
    document.getElementById('uploadFormModal').classList.add('hidden');
}

function handleRegPdfSelect(input) {
    const file = input.files[0];
    if (file) {
        if (file.type !== 'application/pdf') {
            showToast('Only PDF files are allowed.', 'error');
            input.value = '';
            document.getElementById('regPdfLabel').textContent = 'Click to upload PDF';
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            showToast('File too large. Max 10 MB.', 'error');
            input.value = '';
            return;
        }
        document.getElementById('regPdfLabel').innerHTML = `<i class="fas fa-check-circle text-green-500 mr-2"></i>${file.name}`;
    }
}

async function submitEventRegistration() {
    const user = JSON.parse(localStorage.getItem('proSportsUser'));
    if (!user) return;
    const eventId = document.getElementById('regEventId').value;
    const pdfFile = document.getElementById('regFilledPdf').files[0];

    if (!pdfFile) { showToast('Please select your filled PDF form.', 'error'); return; }

    const submitBtn = document.querySelector('#uploadRegForm button');
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i> Uploading...`;

    const formData = new FormData();
    formData.append('athleteEmail', user.email);
    formData.append('athleteName', user.name);
    formData.append('filledForm', pdfFile);

    try {
        const res = await fetch(`/events/${eventId}/register`, { method: 'POST', body: formData });
        const data = await res.json();
        if (res.ok) {
            showToast('✅ Successfully registered!', 'success');
            closeUploadFormModal();
            loadMyRegistrations(user.email);
        } else {
            showToast(data.error || 'Failed to register.', 'error');
        }
    } catch {
        showToast('Server offline.', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<i class="fas fa-check-circle"></i> Complete Registration`;
    }
}


// ─────────────────────────────────────────────
//  OFFICIAL: VIEW REGISTRATIONS
// ─────────────────────────────────────────────
async function openViewRegsModal(eventId, eventName) {
    const user = JSON.parse(localStorage.getItem('proSportsUser'));
    if (!user) return;

    document.getElementById('viewRegsEventName').innerText = eventName;
    const container = document.getElementById('regsListContainer');
    container.innerHTML = `<div class="py-10 text-center text-gray-300"><i class="fas fa-spinner fa-spin text-4xl"></i></div>`;
    document.getElementById('viewRegsModal').classList.remove('hidden');

    try {
        const res = await fetch(`/events/${eventId}/registrations?officialEmail=${encodeURIComponent(user.email)}`);
        const regs = await res.json();
        
        if (regs.error) {
            container.innerHTML = `<p class="text-red-500 font-bold text-center">${regs.error}</p>`;
            return;
        }

        if (regs.length === 0) {
            container.innerHTML = `<div class="col-span-full py-20 text-center"><div class="text-6xl mb-4">📝</div><p class="text-2xl font-black text-gray-300 uppercase italic">No participants have registered yet.</p></div>`;
            return;
        }

        container.innerHTML = regs.map(r => `
            <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
                <div>
                    <h4 class="font-black text-blue-900">${r.athleteName}</h4>
                    <p class="text-xs text-gray-500 font-semibold">${r.athleteEmail}</p>
                    <p class="text-[10px] text-gray-400 mt-1">Reg: ${new Date(r.registeredAt).toLocaleString()}</p>
                </div>
                <a href="/download/registration/${r.id}" target="_blank" download
                    class="bg-blue-50 text-blue-900 hover:bg-blue-900 hover:text-white px-4 py-2 rounded-lg font-bold text-xs transition-colors flex items-center gap-2">
                    <i class="fas fa-download"></i> View Form
                </a>
            </div>
        `).join('');
    } catch {
        container.innerHTML = `<p class="text-red-400 font-bold text-center py-6">Could not load participants (offline).</p>`;
    }
}

function closeViewRegsModal() {
    document.getElementById('viewRegsModal').classList.add('hidden');
}
