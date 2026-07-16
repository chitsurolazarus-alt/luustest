/* =====================================================================
   LUU TRAVELS & LOGISTICS - ADMIN DASHBOARD MANAGER
   ===================================================================== */

var AdminState = {
    drivers: [],
    trips: [],
    bookings: [],
    ads: [],
    slots: [],
    reviews: []
};

document.addEventListener('DOMContentLoaded', async function() {
    var auth = await AuthManager.requireAdmin('admin-login.html');
    if (!auth) return;
    document.getElementById('adminUserLabel').textContent = auth.profile.full_name + ' (Admin)';

    setupNavigation();
    setupModals();
    setupForms();

    document.getElementById('logoutBtn').addEventListener('click', async function() {
        await AuthManager.logout();
        window.location.href = 'admin-login.html';
    });

    await refreshAll();
});

/* ---------------------------- NAVIGATION ---------------------------- */
function setupNavigation() {
    var titles = {
        dashboard: 'Dashboard Overview',
        bookings: 'Booking Management',
        drivers: 'Driver Management',
        trips: 'Trip Management',
        ads: 'Advertisement Management',
        timeslots: 'Time Slot Management',
        reviews: 'Review Moderation'
    };
    var navItems = document.querySelectorAll('.admin-nav-item[data-section]');
    for (var i = 0; i < navItems.length; i++) {
        navItems[i].addEventListener('click', function() {
            var allNav = document.querySelectorAll('.admin-nav-item[data-section]');
            for (var n = 0; n < allNav.length; n++) {
                allNav[n].classList.remove('active');
            }
            this.classList.add('active');
            var allSections = document.querySelectorAll('.admin-section');
            for (var s = 0; s < allSections.length; s++) {
                allSections[s].classList.remove('active');
            }
            document.getElementById('section-' + this.dataset.section).classList.add('active');
            document.getElementById('sectionTitle').textContent = titles[this.dataset.section];
        });
    }
}

/* ------------------------------ MODALS ------------------------------ */
function setupModals() {
    document.getElementById('addDriverBtn').addEventListener('click', function() { openModal('driverModal'); });
    document.getElementById('addTripBtn').addEventListener('click', function() { openModal('tripModal'); });
    document.getElementById('addAdBtn').addEventListener('click', function() { openModal('adModal'); });
    document.getElementById('addSlotBtn').addEventListener('click', function() { openModal('slotModal'); });

    var closeBtns = document.querySelectorAll('.modal-close');
    for (var i = 0; i < closeBtns.length; i++) {
        closeBtns[i].addEventListener('click', function() {
            closeModal(this.dataset.close);
        });
    }
    
    var overlays = document.querySelectorAll('.modal-overlay');
    for (var j = 0; j < overlays.length; j++) {
        overlays[j].addEventListener('click', function(e) {
            if (e.target === this) closeModal(this.id);
        });
    }
}

function openModal(id) { 
    document.getElementById(id).classList.add('open'); 
}

function closeModal(id) { 
    document.getElementById(id).classList.remove('open'); 
    var form = document.getElementById(id).querySelector('form');
    if (form) form.reset();
}

/* ------------------------------- LOAD -------------------------------- */
async function refreshAll() {
    await Promise.all([loadBookings(), loadDrivers(), loadTrips(), loadAds(), loadSlots(), loadReviews()]);
    renderDashboardStats();
    renderRecentTables();
}

async function loadBookings() {
    var { data, error } = await supabaseClient
        .from('bookings')
        .select('*, users(full_name, email, phone), trips(route, pickup_location, dropoff_location)')
        .order('created_at', { ascending: false });
    if (error) { showToast('Error loading bookings: ' + error.message, 'error'); return; }
    AdminState.bookings = data || [];
    renderBookings();
}

async function loadDrivers() {
    var { data, error } = await supabaseClient.from('drivers').select('*').order('created_at', { ascending: false });
    if (error) { showToast('Error loading drivers: ' + error.message, 'error'); return; }
    AdminState.drivers = data || [];
    renderDrivers();
    populateDriverSelect();
}

async function loadTrips() {
    var { data, error } = await supabaseClient
        .from('trips')
        .select('*, drivers(full_name)')
        .order('departure_time', { ascending: false });
    if (error) { showToast('Error loading trips: ' + error.message, 'error'); return; }
    AdminState.trips = data || [];
    renderTrips();
}

async function loadAds() {
    var { data, error } = await supabaseClient.from('ads').select('*').order('display_order', { ascending: true });
    if (error) { showToast('Error loading ads: ' + error.message, 'error'); return; }
    AdminState.ads = data || [];
    renderAds();
}

async function loadSlots() {
    var { data, error } = await supabaseClient.from('time_slots').select('*').order('route').order('departure_time');
    if (error) { showToast('Error loading time slots: ' + error.message, 'error'); return; }
    AdminState.slots = data || [];
    renderSlots();
}

async function loadReviews() {
    var { data, error } = await supabaseClient
        .from('reviews')
        .select('*, users(full_name, email)')
        .order('created_at', { ascending: false });
    if (error) { showToast('Error loading reviews: ' + error.message, 'error'); return; }
    AdminState.reviews = data || [];
    renderReviews();
}

/* ---------------------------- DASHBOARD ------------------------------ */
function renderDashboardStats() {
    var pending = AdminState.bookings.filter(function(b) { return b.booking_status === 'pending'; }).length;
    var confirmed = AdminState.bookings.filter(function(b) { return b.booking_status === 'confirmed'; }).length;
    var completed = AdminState.bookings.filter(function(b) { return b.booking_status === 'completed'; }).length;
    var paid = AdminState.bookings.filter(function(b) { return b.payment_status === 'paid'; }).length;
    
    document.getElementById('statBookings').textContent = AdminState.bookings.length;
    document.getElementById('statPending').textContent = pending;
    document.getElementById('statConfirmed').textContent = confirmed;
    document.getElementById('statCompleted').textContent = completed;
    document.getElementById('statPaid').textContent = paid;
    document.getElementById('statDrivers').textContent = AdminState.drivers.length;
}

function renderRecentTables() {
    var recentBookings = AdminState.bookings.slice(0, 5);
    var html1 = '';
    for (var i = 0; i < recentBookings.length; i++) {
        var b = recentBookings[i];
        html1 += '<tr><td>' + b.booking_reference + '</td><td>' + (b.users ? b.users.full_name : '—') + '</td><td>' + (b.trips ? b.trips.route.replace('-', ' → ') : 'Route TBD') + '</td><td>' + b.number_of_seats + '</td><td>' + formatCurrency(b.total_price) + '</td><td><span class="badge badge-' + b.booking_status + '">' + b.booking_status + '</span></td><td><span class="badge ' + (b.payment_status === 'paid' ? 'badge-confirmed' : 'badge-pending') + '">' + b.payment_status + '</span></td></tr>';
    }
    document.querySelector('#recentBookingsTable tbody').innerHTML = html1 || '<tr><td colspan="7" style="text-align:center; color:var(--gray-600);">No bookings yet.</td></tr>';

    var recentTrips = AdminState.trips.slice(0, 5);
    var html2 = '';
    for (var j = 0; j < recentTrips.length; j++) {
        var t = recentTrips[j];
        html2 += '<tr><td>' + t.route.replace('-', ' → ') + '</td><td>' + (t.drivers ? t.drivers.full_name : 'Unassigned') + '</td><td>' + new Date(t.departure_time).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' }) + '</td><td>' + t.available_seats + '</td><td>' + formatCurrency(t.total_price) + '</td><td><span class="badge badge-active">' + t.status + '</span></td></tr>';
    }
    document.querySelector('#recentTripsTable tbody').innerHTML = html2 || '<tr><td colspan="6" style="text-align:center; color:var(--gray-600);">No trips yet.</td></tr>';
}

/* ------------------------------ BOOKINGS ------------------------------ */
function renderBookings() {
    var statuses = ['pending', 'confirmed', 'completed', 'cancelled'];
    var html = '';
    for (var i = 0; i < AdminState.bookings.length; i++) {
        var b = AdminState.bookings[i];
        var statusOptions = '';
        for (var s = 0; s < statuses.length; s++) {
            statusOptions += '<option value="' + statuses[s] + '" ' + (statuses[s] === b.booking_status ? 'selected' : '') + '>' + statuses[s].charAt(0).toUpperCase() + statuses[s].slice(1) + '</option>';
        }
        
        var actionsHtml = '';
        if (b.booking_status === 'pending') actionsHtml += '<button class="btn btn-success btn-sm" data-confirm="' + b.id + '" style="width:100%;">✅ Confirm</button>';
        if (b.booking_status === 'confirmed') actionsHtml += '<button class="btn btn-navy btn-sm" data-complete="' + b.id + '" style="width:100%;">🎉 Complete</button>';
        if (b.booking_status === 'completed' && b.payment_status === 'pending') actionsHtml += '<button class="btn btn-success btn-sm" data-mark-paid="' + b.id + '" style="width:100%;">💰 Mark Paid</button>';
        if (b.payment_status === 'paid') actionsHtml += '<span class="badge badge-confirmed" style="width:100%;text-align:center;">✅ Paid</span>';
        actionsHtml += '<button class="btn btn-danger btn-sm" data-delete-booking="' + b.id + '" style="width:100%;">🗑 Delete</button>';
        
        html += '<tr>';
        html += '<td><strong>' + b.booking_reference + '</strong></td>';
        html += '<td>' + (b.users ? b.users.full_name + '<br><small style="color:var(--gray-600);">' + b.users.email + '</small>' : '—') + (b.users?.phone ? '<br><small style="color:var(--gray-600);">📱 ' + b.users.phone + '</small>' : '') + '</td>';
        html += '<td style="font-size:0.85rem;">' + (b.pickup_location || b.trips?.pickup_location || '—') + '<br><span style="color:var(--gray-600);">↓</span>' + (b.dropoff_location || b.trips?.dropoff_location || '—') + '</td>';
        html += '<td>' + b.number_of_seats + '</td>';
        html += '<td>' + formatCurrency(b.total_price) + '</td>';
        html += '<td style="text-transform:capitalize; font-size:0.85rem;">' + b.payment_method + ' · <span class="badge ' + (b.payment_status === 'paid' ? 'badge-confirmed' : 'badge-pending') + '">' + b.payment_status + '</span></td>';
        html += '<td><select class="select-status" data-status-for="' + b.id + '">' + statusOptions + '</select></td>';
        html += '<td class="table-actions" style="display:flex; flex-direction:column; gap:4px; align-items:flex-start;">' + actionsHtml + '</td>';
        html += '</tr>';
    }
    document.querySelector('#bookingsTable tbody').innerHTML = html || '<tr><td colspan="8" style="text-align:center; color:var(--gray-600);">No bookings yet.</td></tr>';

    var statusSelects = document.querySelectorAll('[data-status-for]');
    for (var a = 0; a < statusSelects.length; a++) {
        statusSelects[a].addEventListener('change', function() {
            updateBookingStatus(this.dataset.statusFor, this.value);
        });
    }
    
    var deleteBtns = document.querySelectorAll('[data-delete-booking]');
    for (var d = 0; d < deleteBtns.length; d++) {
        deleteBtns[d].addEventListener('click', function() {
            deleteBooking(this.dataset.deleteBooking);
        });
    }
    
    var confirmBtns = document.querySelectorAll('[data-confirm]');
    for (var c = 0; c < confirmBtns.length; c++) {
        confirmBtns[c].addEventListener('click', function() {
            confirmBooking(this.dataset.confirm);
        });
    }
    
    var completeBtns = document.querySelectorAll('[data-complete]');
    for (var cm = 0; cm < completeBtns.length; cm++) {
        completeBtns[cm].addEventListener('click', function() {
            completeBooking(this.dataset.complete);
        });
    }
    
    var markPaidBtns = document.querySelectorAll('[data-mark-paid]');
    for (var mp = 0; mp < markPaidBtns.length; mp++) {
        markPaidBtns[mp].addEventListener('click', function() {
            markBookingPaid(this.dataset.markPaid);
        });
    }
}

async function confirmBooking(bookingId) {
    if (!confirm('Confirm this booking? The customer will be notified.')) return;
    
    var { error } = await supabaseClient
        .from('bookings')
        .update({ 
            booking_status: 'confirmed',
            payment_status: 'pending'
        })
        .eq('id', bookingId);
        
    if (error) { 
        showToast('Error confirming booking: ' + error.message, 'error'); 
        return; 
    }
    
    showToast('✅ Booking confirmed! Customer has been notified.', 'success');
    await loadBookings();
    renderDashboardStats();
    renderRecentTables();
}

async function completeBooking(bookingId) {
    if (!confirm('Mark this booking as completed? This will also mark it as paid.')) return;
    
    var { error } = await supabaseClient
        .from('bookings')
        .update({ 
            booking_status: 'completed',
            payment_status: 'paid'
        })
        .eq('id', bookingId);
        
    if (error) { 
        showToast('Error completing booking: ' + error.message, 'error'); 
        return; 
    }
    
    showToast('🎉 Booking completed and marked as paid! Customer can now leave a review.', 'success');
    await loadBookings();
    renderDashboardStats();
    renderRecentTables();
}

async function markBookingPaid(bookingId) {
    if (!confirm('Mark this booking as paid?')) return;
    
    var { error } = await supabaseClient
        .from('bookings')
        .update({ 
            payment_status: 'paid'
        })
        .eq('id', bookingId);
        
    if (error) { 
        showToast('Error marking as paid: ' + error.message, 'error'); 
        return; 
    }
    
    showToast('💰 Booking marked as paid.', 'success');
    await loadBookings();
    renderDashboardStats();
    renderRecentTables();
}

async function updateBookingStatus(id, status) {
    var updateData = { booking_status: status };
    if (status === 'completed') {
        updateData.payment_status = 'paid';
    }
    
    var { error } = await supabaseClient.from('bookings').update(updateData).eq('id', id);
    if (error) { showToast(error.message, 'error'); return; }
    showToast('Booking ' + status + '.' + (status === 'completed' ? ' Marked as paid.' : ''), 'success');
    await loadBookings();
    renderDashboardStats();
    renderRecentTables();
}

async function deleteBooking(id) {
    if (!confirm('Delete this booking permanently?')) return;
    var { error } = await supabaseClient.from('bookings').delete().eq('id', id);
    if (error) { showToast(error.message, 'error'); return; }
    showToast('Booking deleted.', 'success');
    await loadBookings();
    renderDashboardStats();
    renderRecentTables();
}

/* ------------------------------ DRIVERS ------------------------------ */
function renderDrivers() {
    var html = '';
    for (var i = 0; i < AdminState.drivers.length; i++) {
        var d = AdminState.drivers[i];
        var actionsHtml = '';
        if (!d.is_approved) actionsHtml += '<button class="btn btn-success btn-sm" data-approve="' + d.id + '">Approve</button>';
        actionsHtml += '<button class="btn ' + (d.is_active ? 'btn-outline' : 'btn-navy') + ' btn-sm" data-toggle-active="' + d.id + '" data-active="' + d.is_active + '" style="' + (d.is_active ? 'color:var(--primary); border-color:var(--primary);' : '') + '">' + (d.is_active ? 'Deactivate' : 'Activate') + '</button>';
        actionsHtml += '<button class="btn btn-danger btn-sm" data-delete-driver="' + d.id + '">Delete</button>';
        
        html += '<tr>';
        html += '<td>' + d.full_name + '</td>';
        html += '<td>' + d.email + '<br><small style="color:var(--gray-600);">' + d.phone + '</small></td>';
        html += '<td>' + d.vehicle_color + ' ' + d.vehicle_model + '<br><small style="color:var(--gray-600);">' + d.vehicle_registration + '</small></td>';
        html += '<td>' + d.vehicle_capacity + '</td>';
        html += '<td><span class="badge ' + (d.is_approved ? 'badge-confirmed' : 'badge-pending') + '">' + (d.is_approved ? 'Approved' : 'Pending') + '</span> <span class="badge ' + (d.is_active ? 'badge-active' : 'badge-inactive') + '">' + (d.is_active ? 'Active' : 'Inactive') + '</span></td>';
        html += '<td class="table-actions">' + actionsHtml + '</td>';
        html += '</tr>';
    }
    document.querySelector('#driversTable tbody').innerHTML = html || '<tr><td colspan="6" style="text-align:center; color:var(--gray-600);">No drivers added yet.</td></tr>';

    var approveBtns = document.querySelectorAll('[data-approve]');
    for (var a = 0; a < approveBtns.length; a++) {
        approveBtns[a].addEventListener('click', function() {
            approveDriver(this.dataset.approve);
        });
    }
    
    var toggleBtns = document.querySelectorAll('[data-toggle-active]');
    for (var t = 0; t < toggleBtns.length; t++) {
        toggleBtns[t].addEventListener('click', function() {
            toggleDriverActive(this.dataset.toggleActive, this.dataset.active === 'true');
        });
    }
    
    var deleteBtns = document.querySelectorAll('[data-delete-driver]');
    for (var d = 0; d < deleteBtns.length; d++) {
        deleteBtns[d].addEventListener('click', function() {
            deleteDriver(this.dataset.deleteDriver);
        });
    }
}

function populateDriverSelect() {
    var select = document.getElementById('tripDriver');
    var approved = AdminState.drivers.filter(function(d) { return d.is_approved && d.is_active; });
    var html = '<option value="">Select driver</option>';
    for (var i = 0; i < approved.length; i++) {
        html += '<option value="' + approved[i].id + '">' + approved[i].full_name + ' — ' + approved[i].vehicle_model + '</option>';
    }
    select.innerHTML = html;
}

async function approveDriver(id) {
    var { error } = await supabaseClient.from('drivers').update({ is_approved: true }).eq('id', id);
    if (error) { showToast(error.message, 'error'); return; }
    showToast('Driver approved.', 'success');
    await loadDrivers();
}

async function toggleDriverActive(id, isActive) {
    var { error } = await supabaseClient.from('drivers').update({ is_active: !isActive }).eq('id', id);
    if (error) { showToast(error.message, 'error'); return; }
    showToast('Driver ' + (!isActive ? 'activated' : 'deactivated') + '.', 'success');
    await loadDrivers();
}

async function deleteDriver(id) {
    if (!confirm('Delete this driver permanently?')) return;
    var { error } = await supabaseClient.from('drivers').delete().eq('id', id);
    if (error) { showToast(error.message, 'error'); return; }
    showToast('Driver deleted.', 'success');
    await loadDrivers();
}

/* ------------------------------- TRIPS -------------------------------- */
function renderTrips() {
    var tripStatuses = ['scheduled', 'in-progress', 'completed', 'cancelled'];
    var html = '';
    for (var i = 0; i < AdminState.trips.length; i++) {
        var t = AdminState.trips[i];
        var statusOptions = '';
        for (var s = 0; s < tripStatuses.length; s++) {
            statusOptions += '<option value="' + tripStatuses[s] + '" ' + (tripStatuses[s] === t.status ? 'selected' : '') + '>' + tripStatuses[s] + '</option>';
        }
        html += '<tr>';
        html += '<td>' + t.route.replace('-', ' → ') + '</td>';
        html += '<td>' + (t.drivers ? t.drivers.full_name : 'Unassigned') + '</td>';
        html += '<td>' + new Date(t.departure_time).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' }) + '</td>';
        html += '<td>' + t.available_seats + ' / ' + (t.available_seats + t.booked_seats) + '</td>';
        html += '<td>' + formatCurrency(t.total_price) + '</td>';
        html += '<td><select class="select-status" data-trip-status-for="' + t.id + '">' + statusOptions + '</select></td>';
        html += '<td class="table-actions"><button class="btn btn-danger btn-sm" data-delete-trip="' + t.id + '">Delete</button></td>';
        html += '</tr>';
    }
    document.querySelector('#tripsTable tbody').innerHTML = html || '<tr><td colspan="7" style="text-align:center; color:var(--gray-600);">No trips added yet.</td></tr>';

    var deleteBtns = document.querySelectorAll('[data-delete-trip]');
    for (var d = 0; d < deleteBtns.length; d++) {
        deleteBtns[d].addEventListener('click', function() {
            deleteTrip(this.dataset.deleteTrip);
        });
    }
    
    var statusSelects = document.querySelectorAll('[data-trip-status-for]');
    for (var s = 0; s < statusSelects.length; s++) {
        statusSelects[s].addEventListener('change', function() {
            updateTripStatus(this.dataset.tripStatusFor, this.value);
        });
    }
}

async function updateTripStatus(tripId, status) {
    var { error } = await supabaseClient.from('trips').update({ status: status }).eq('id', tripId);
    if (error) { showToast(error.message, 'error'); return; }
    if (status === 'completed') {
        await supabaseClient.from('bookings').update({ 
            booking_status: 'completed',
            payment_status: 'paid'
        }).eq('trip_id', tripId).neq('booking_status', 'cancelled');
    }
    showToast('Trip status updated.', 'success');
    await loadTrips();
    renderRecentTables();
}

async function deleteTrip(id) {
    if (!confirm('Delete this trip? Any related bookings will also be removed.')) return;
    var { error } = await supabaseClient.from('trips').delete().eq('id', id);
    if (error) { showToast(error.message, 'error'); return; }
    showToast('Trip deleted.', 'success');
    await loadTrips();
    renderDashboardStats();
    renderRecentTables();
}

/* -------------------------------- ADS ---------------------------------- */
function renderAds() {
    var html = '';
    for (var i = 0; i < AdminState.ads.length; i++) {
        var ad = AdminState.ads[i];
        html += '<tr>';
        html += '<td>' + ad.title + '</td>';
        html += '<td>' + (ad.content.length > 60 ? ad.content.slice(0, 60) + '…' : ad.content) + '</td>';
        html += '<td><span class="badge ' + (ad.is_active ? 'badge-active' : 'badge-inactive') + '">' + (ad.is_active ? 'Active' : 'Inactive') + '</span></td>';
        html += '<td class="table-actions"><button class="btn ' + (ad.is_active ? 'btn-outline' : 'btn-navy') + ' btn-sm" data-toggle-ad="' + ad.id + '" data-active="' + ad.is_active + '" style="' + (ad.is_active ? 'color:var(--primary); border-color:var(--primary);' : '') + '">' + (ad.is_active ? 'Deactivate' : 'Activate') + '</button><button class="btn btn-danger btn-sm" data-delete-ad="' + ad.id + '">Delete</button></td>';
        html += '</tr>';
    }
    document.querySelector('#adsTable tbody').innerHTML = html || '<tr><td colspan="4" style="text-align:center; color:var(--gray-600);">No ads posted yet.</td></tr>';

    var toggleBtns = document.querySelectorAll('[data-toggle-ad]');
    for (var t = 0; t < toggleBtns.length; t++) {
        toggleBtns[t].addEventListener('click', function() {
            toggleAdActive(this.dataset.toggleAd, this.dataset.active === 'true');
        });
    }
    
    var deleteBtns = document.querySelectorAll('[data-delete-ad]');
    for (var d = 0; d < deleteBtns.length; d++) {
        deleteBtns[d].addEventListener('click', function() {
            deleteAd(this.dataset.deleteAd);
        });
    }
}

async function toggleAdActive(id, isActive) {
    var { error } = await supabaseClient.from('ads').update({ is_active: !isActive }).eq('id', id);
    if (error) { showToast(error.message, 'error'); return; }
    await loadAds();
}

async function deleteAd(id) {
    if (!confirm('Delete this ad?')) return;
    var { error } = await supabaseClient.from('ads').delete().eq('id', id);
    if (error) { showToast(error.message, 'error'); return; }
    showToast('Ad deleted.', 'success');
    await loadAds();
}

/* ----------------------------- PROMO CODES ------------------------------ */
async function loadPromos() {
    var { data, error } = await supabaseClient.from('promo_codes').select('*').order('created_at', { ascending: false });
    if (error) { showToast('Error loading promos: ' + error.message, 'error'); return; }
    AdminState.promos = data || [];
    renderPromos();
}

function renderPromos() {
    var html = '';
    for (var i = 0; i < AdminState.promos.length; i++) {
        var p = AdminState.promos[i];
        var isExpired = p.expires_at && new Date(p.expires_at) < new Date();
        var statusClass = p.is_active && !isExpired ? 'badge-active' : 'badge-inactive';
        var statusText = p.is_active && !isExpired ? 'Active' : (isExpired ? 'Expired' : 'Inactive');
        
        html += '<tr>';
        html += '<td><strong>' + p.code + '</strong></td>';
        html += '<td>' + (p.description || '—') + '</td>';
        html += '<td>' + p.discount_percent + '%</td>';
        html += '<td>' + (p.used_count || 0) + '/' + (p.max_uses || '∞') + '</td>';
        html += '<td><span class="badge ' + statusClass + '">' + statusText + '</span></td>';
        html += '<td>' + (p.expires_at ? new Date(p.expires_at).toLocaleDateString() : 'Never') + '</td>';
        html += '<td class="table-actions">';
        html += '<button class="btn ' + (p.is_active ? 'btn-outline' : 'btn-navy') + ' btn-sm" data-toggle-promo="' + p.id + '" data-active="' + p.is_active + '" style="' + (p.is_active ? 'color:var(--primary); border-color:var(--primary);' : '') + '">' + (p.is_active ? 'Deactivate' : 'Activate') + '</button>';
        html += '<button class="btn btn-danger btn-sm" data-delete-promo="' + p.id + '">Delete</button>';
        html += '</td></tr>';
    }
    document.querySelector('#promosTable tbody').innerHTML = html || '<tr><td colspan="7" style="text-align:center; color:var(--gray-600);">No promo codes created yet.</td></tr>';

    document.querySelectorAll('[data-toggle-promo]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            togglePromoActive(this.dataset.togglePromo, this.dataset.active === 'true');
        });
    });
    
    document.querySelectorAll('[data-delete-promo]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            deletePromo(this.dataset.deletePromo);
        });
    });
}

async function togglePromoActive(id, isActive) {
    var { error } = await supabaseClient.from('promo_codes').update({ is_active: !isActive }).eq('id', id);
    if (error) { showToast(error.message, 'error'); return; }
    showToast('Promo ' + (!isActive ? 'activated' : 'deactivated') + '.', 'success');
    await loadPromos();
}

async function deletePromo(id) {
    if (!confirm('Delete this promo code?')) return;
    var { error } = await supabaseClient.from('promo_codes').delete().eq('id', id);
    if (error) { showToast(error.message, 'error'); return; }
    showToast('Promo deleted.', 'success');
    await loadPromos();
}

// Add to setupModals
document.getElementById('addPromoBtn').addEventListener('click', function() { openModal('promoModal'); });

// Add to setupForms
document.getElementById('promoForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    var payload = {
        code: document.getElementById('promoCode').value.trim().toUpperCase(),
        description: document.getElementById('promoDescription').value.trim() || null,
        discount_percent: parseFloat(document.getElementById('promoDiscount').value),
        is_active: true,
        max_uses: parseInt(document.getElementById('promoMaxUses').value) || 0,
        expires_at: document.getElementById('promoExpires').value || null
    };
    var { error } = await supabaseClient.from('promo_codes').insert([payload]);
    if (error) { showToast(error.message, 'error'); return; }
    showToast('Promo code added successfully.', 'success');
    closeModal('promoModal');
    await loadPromos();
});

// Add to refreshAll
await loadPromos();

// Add to AdminState
promos: []

// Add to navigation titles
promos: 'Promo Code Management'
/* ------------------------------ REVIEWS ------------------------------ */
function renderReviews() {
    var html = '';
    for (var i = 0; i < AdminState.reviews.length; i++) {
        var r = AdminState.reviews[i];
        var reviewerName = r.reviewer_name || (r.users ? r.users.full_name : 'Unknown');
        var actionsHtml = '';
        if (!r.is_approved) {
            actionsHtml += '<button class="btn btn-success btn-sm" data-approve-review="' + r.id + '">Approve</button>';
        } else {
            actionsHtml += '<button class="btn btn-outline btn-sm" style="color:var(--primary); border-color:var(--primary);" data-unapprove-review="' + r.id + '">Unpublish</button>';
        }
        actionsHtml += '<button class="btn btn-danger btn-sm" data-delete-review="' + r.id + '">Delete</button>';
        
        html += '<tr>';
        html += '<td>' + reviewerName + '<br><small style="color:var(--gray-600);">' + (r.users ? r.users.email : '') + '</small></td>';
        html += '<td>' + '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating) + '</td>';
        html += '<td>' + (r.comment || '<em style="color:var(--gray-600);">No comment</em>') + '</td>';
        html += '<td><span class="badge ' + (r.is_approved ? 'badge-active' : 'badge-pending') + '">' + (r.is_approved ? 'Approved' : 'Pending') + '</span></td>';
        html += '<td class="table-actions">' + actionsHtml + '</td>';
        html += '</tr>';
    }
    document.querySelector('#reviewsTable tbody').innerHTML = html || '<tr><td colspan="5" style="text-align:center; color:var(--gray-600);">No reviews submitted yet.</td></tr>';

    var approveBtns = document.querySelectorAll('[data-approve-review]');
    for (var a = 0; a < approveBtns.length; a++) {
        approveBtns[a].addEventListener('click', function() {
            setReviewApproval(this.dataset.approveReview, true);
        });
    }
    
    var unapproveBtns = document.querySelectorAll('[data-unapprove-review]');
    for (var u = 0; u < unapproveBtns.length; u++) {
        unapproveBtns[u].addEventListener('click', function() {
            setReviewApproval(this.dataset.unapproveReview, false);
        });
    }
    
    var deleteBtns = document.querySelectorAll('[data-delete-review]');
    for (var d = 0; d < deleteBtns.length; d++) {
        deleteBtns[d].addEventListener('click', function() {
            deleteReview(this.dataset.deleteReview);
        });
    }
}

async function setReviewApproval(id, isApproved) {
    var { error } = await supabaseClient.from('reviews').update({ is_approved: isApproved }).eq('id', id);
    if (error) { showToast(error.message, 'error'); return; }
    showToast(isApproved ? 'Review approved and published.' : 'Review unpublished.', 'success');
    await loadReviews();
}

async function deleteReview(id) {
    if (!confirm('Delete this review permanently?')) return;
    var { error } = await supabaseClient.from('reviews').delete().eq('id', id);
    if (error) { showToast(error.message, 'error'); return; }
    showToast('Review deleted.', 'success');
    await loadReviews();
}

/* ----------------------------- TIME SLOTS ------------------------------ */
function renderSlots() {
    var html = '';
    for (var i = 0; i < AdminState.slots.length; i++) {
        var s = AdminState.slots[i];
        html += '<tr>';
        html += '<td>' + s.route.replace('-', ' → ') + '</td>';
        html += '<td>' + s.departure_time + '</td>';
        html += '<td><span class="badge ' + (s.is_active ? 'badge-active' : 'badge-inactive') + '">' + (s.is_active ? 'Active' : 'Inactive') + '</span></td>';
        html += '<td class="table-actions"><button class="btn ' + (s.is_active ? 'btn-outline' : 'btn-navy') + ' btn-sm" data-toggle-slot="' + s.id + '" data-active="' + s.is_active + '" style="' + (s.is_active ? 'color:var(--primary); border-color:var(--primary);' : '') + '">' + (s.is_active ? 'Deactivate' : 'Activate') + '</button><button class="btn btn-danger btn-sm" data-delete-slot="' + s.id + '">Delete</button></td>';
        html += '</tr>';
    }
    document.querySelector('#slotsTable tbody').innerHTML = html || '<tr><td colspan="4" style="text-align:center; color:var(--gray-600);">No time slots added yet. Add slots for each route and time.</td></tr>';

    var toggleBtns = document.querySelectorAll('[data-toggle-slot]');
    for (var t = 0; t < toggleBtns.length; t++) {
        toggleBtns[t].addEventListener('click', function() {
            toggleSlotActive(this.dataset.toggleSlot, this.dataset.active === 'true');
        });
    }
    
    var deleteBtns = document.querySelectorAll('[data-delete-slot]');
    for (var d = 0; d < deleteBtns.length; d++) {
        deleteBtns[d].addEventListener('click', function() {
            deleteSlot(this.dataset.deleteSlot);
        });
    }
}

async function toggleSlotActive(id, isActive) {
    var { error } = await supabaseClient.from('time_slots').update({ is_active: !isActive }).eq('id', id);
    if (error) { showToast(error.message, 'error'); return; }
    showToast('Time slot ' + (!isActive ? 'activated' : 'deactivated') + '.', 'success');
    await loadSlots();
}

async function deleteSlot(id) {
    if (!confirm('Delete this time slot?')) return;
    var { error } = await supabaseClient.from('time_slots').delete().eq('id', id);
    if (error) { showToast(error.message, 'error'); return; }
    showToast('Time slot deleted.', 'success');
    await loadSlots();
}

/* ------------------------------- FORMS --------------------------------- */
function setupForms() {
    document.getElementById('tripDistance').addEventListener('input', function(e) {
        var distance = parseFloat(e.target.value) || 0;
        document.getElementById('tripPrice').value = (distance * APP_CONFIG.pricePerKm).toFixed(2);
    });

    document.getElementById('driverForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        var payload = {
            full_name: document.getElementById('driverName').value.trim(),
            email: document.getElementById('driverEmail').value.trim(),
            phone: document.getElementById('driverPhone').value.trim(),
            license_number: document.getElementById('driverLicense').value.trim(),
            prdp_number: document.getElementById('driverPrdp').value.trim() || null,
            vehicle_registration: document.getElementById('vehicleReg').value.trim(),
            vehicle_model: document.getElementById('vehicleModel').value.trim(),
            vehicle_color: document.getElementById('vehicleColor').value.trim(),
            vehicle_capacity: parseInt(document.getElementById('vehicleCapacity').value, 10),
            is_approved: true
        };
        var { error } = await supabaseClient.from('drivers').insert([payload]);
        if (error) { showToast(error.message, 'error'); return; }
        showToast('Driver added successfully.', 'success');
        closeModal('driverModal');
        await loadDrivers();
        renderDashboardStats();
    });

    document.getElementById('tripForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        var distance = parseFloat(document.getElementById('tripDistance').value);
        var seats = parseInt(document.getElementById('tripSeats').value, 10);
        var payload = {
            driver_id: document.getElementById('tripDriver').value || null,
            route: document.getElementById('tripRoute').value,
            pickup_location: document.getElementById('tripPickup').value.trim(),
            dropoff_location: document.getElementById('tripDropoff').value.trim(),
            distance: distance,
            price_per_km: APP_CONFIG.pricePerKm,
            total_price: parseFloat(document.getElementById('tripPrice').value),
            departure_time: new Date(document.getElementById('tripDeparture').value).toISOString(),
            available_seats: seats,
            status: 'scheduled'
        };
        var { error } = await supabaseClient.from('trips').insert([payload]);
        if (error) { showToast(error.message, 'error'); return; }
        showToast('Trip added successfully.', 'success');
        closeModal('tripModal');
        await loadTrips();
        renderDashboardStats();
        renderRecentTables();
    });

    document.getElementById('adForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        var saveBtn = document.getElementById('saveAdBtn');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        try {
            var imageUrl = document.getElementById('adImage').value.trim() || null;
            var file = document.getElementById('adImageFile').files[0];

            if (file) {
                var filePath = Date.now() + '-' + file.name.replace(/[^a-zA-Z0-9.\-_]/g, '');
                var { error: uploadError } = await supabaseClient.storage
                    .from('ads-images')
                    .upload(filePath, file, { cacheControl: '3600', upsert: false });
                if (uploadError) throw uploadError;

                var { data: publicUrlData } = supabaseClient.storage.from('ads-images').getPublicUrl(filePath);
                imageUrl = publicUrlData.publicUrl;
            }

            var payload = {
                title: document.getElementById('adTitle').value.trim(),
                content: document.getElementById('adContent').value.trim(),
                image_url: imageUrl,
                is_active: true
            };
            var { error } = await supabaseClient.from('ads').insert([payload]);
            if (error) throw error;

            showToast('Ad posted successfully.', 'success');
            closeModal('adModal');
            await loadAds();
        } catch (err) {
            showToast(err.message || 'Could not save the ad.', 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Ad';
        }
    });

    document.getElementById('slotForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        var payload = {
            route: document.getElementById('slotRoute').value,
            departure_time: document.getElementById('slotTime').value,
            is_active: true
        };
        var { error } = await supabaseClient.from('time_slots').insert([payload]);
        if (error) { showToast(error.message, 'error'); return; }
        showToast('Time slot added successfully.', 'success');
        closeModal('slotModal');
        await loadSlots();
    });
}
