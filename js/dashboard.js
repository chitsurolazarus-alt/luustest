/* =====================================================================
   LUU TRAVELS & LOGISTICS - USER DASHBOARD MANAGER
   ===================================================================== */

const DashboardState = {
    profile: null,
    bookings: [],
    reviewedBookingIds: new Set(),
    statusFilter: 'all',
    openTrackingId: null,
    selectedRating: 0,
    subscription: null
};

document.addEventListener('DOMContentLoaded', async function() {
    const user = await AuthManager.requireAuth('login.html');
    if (!user) return;

    DashboardState.profile = await AuthManager.getProfile(user.id);
    renderProfile();
    await loadBookings(user.id);
    await loadOwnReviews(user.id);
    renderBookings();
    setupHandlers();
    setupReviewModal(user.id);
    setupRealTimeNotifications(user.id);
    setupMobileMenu();
    setupLogout();

    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
});

/* =====================================================================
   LOGOUT - SIMPLE AND RELIABLE
   ===================================================================== */
function setupLogout() {
    var logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.onclick = function(e) {
            e.preventDefault();
            doLogout();
        };
    }

    var mobileLogout = document.getElementById('mobileLogout');
    if (mobileLogout) {
        mobileLogout.onclick = function(e) {
            e.preventDefault();
            doLogout();
        };
    }
}

async function doLogout() {
    try {
        var logoutBtn = document.getElementById('logoutBtn');
        var mobileLogout = document.getElementById('mobileLogout');
        if (logoutBtn) logoutBtn.textContent = 'Logging out...';
        if (mobileLogout) mobileLogout.textContent = '⏳ Logging out...';
        
        if (DashboardState.subscription) {
            try {
                await DashboardState.subscription.unsubscribe();
            } catch(e) {}
            DashboardState.subscription = null;
        }
        
        var { error } = await supabaseClient.auth.signOut();
        if (error) throw error;
        
        try {
            localStorage.clear();
            sessionStorage.clear();
        } catch(e) {}
        
        showToast('Logged out successfully!', 'success');
        
        setTimeout(function() {
            window.location.href = 'login.html';
        }, 500);
        
    } catch (err) {
        console.error('Logout error:', err);
        showToast('Error logging out. Please try again.', 'error');
        
        var logoutBtn = document.getElementById('logoutBtn');
        var mobileLogout = document.getElementById('mobileLogout');
        if (logoutBtn) logoutBtn.textContent = 'Logout';
        if (mobileLogout) mobileLogout.textContent = '🚪 Logout';
    }
}

/* =====================================================================
   MOBILE MENU
   ===================================================================== */
function setupMobileMenu() {
    var hamburger = document.getElementById('hamburgerBtn');
    var mobileMenu = document.getElementById('mobileMenu');

    if (hamburger && mobileMenu) {
        hamburger.onclick = function() {
            this.classList.toggle('active');
            mobileMenu.classList.toggle('open');
        };

        var links = mobileMenu.querySelectorAll('a');
        for (var i = 0; i < links.length; i++) {
            links[i].onclick = function() {
                hamburger.classList.remove('active');
                mobileMenu.classList.remove('open');
            };
        }
    }
}

async function loadOwnReviews(userId) {
    var { data, error } = await supabaseClient.from('reviews').select('booking_id').eq('user_id', userId);
    if (!error && data) {
        DashboardState.reviewedBookingIds = new Set(data.map(function(r) { return r.booking_id; }));
    }
}

function renderProfile() {
    var p = DashboardState.profile;
    document.getElementById('welcomeText').textContent = 'Welcome back, ' + p.full_name.split(' ')[0];
    document.getElementById('avatarInitial').textContent = p.full_name.charAt(0).toUpperCase();
    document.getElementById('profileName').textContent = p.full_name;
    document.getElementById('profileEmail').textContent = p.email;
    document.getElementById('profilePhone').textContent = p.phone || 'Not provided';
    document.getElementById('profileSince').textContent = new Date(p.created_at).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long' });
}

async function loadBookings(userId) {
    var { data, error } = await supabaseClient
        .from('bookings')
        .select('*, trips(route, departure_time, pickup_location, dropoff_location, drivers(id, full_name, vehicle_model, vehicle_color, phone))')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (error) {
        showToast('Could not load bookings: ' + error.message, 'error');
        return;
    }
    DashboardState.bookings = data || [];
    renderBookings();
    updateStatusCounts();
}

function updateStatusCounts() {
    var counts = {
        pending: 0,
        confirmed: 0,
        completed: 0,
        cancelled: 0
    };
    
    for (var i = 0; i < DashboardState.bookings.length; i++) {
        var b = DashboardState.bookings[i];
        if (counts[b.booking_status] !== undefined) {
            counts[b.booking_status]++;
        }
    }

    var tabs = document.querySelectorAll('.dash-tab');
    for (var j = 0; j < tabs.length; j++) {
        var tab = tabs[j];
        var status = tab.dataset.status;
        if (status !== 'all') {
            var count = counts[status] || 0;
            tab.textContent = tab.textContent.replace(/\(\d+\)/, '');
            tab.textContent = tab.textContent.trim() + ' (' + count + ')';
        } else {
            tab.textContent = '📋 All (' + DashboardState.bookings.length + ')';
        }
    }
}

function renderBookings() {
    var list = document.getElementById('bookingsList');
    var filtered = [];
    
    if (DashboardState.statusFilter === 'all') {
        filtered = DashboardState.bookings;
    } else {
        for (var i = 0; i < DashboardState.bookings.length; i++) {
            if (DashboardState.bookings[i].booking_status === DashboardState.statusFilter) {
                filtered.push(DashboardState.bookings[i]);
            }
        }
    }

    if (filtered.length === 0) {
        list.innerHTML = '<div class="empty-state"><div class="icon">📭</div><h3>No bookings found</h3><p style="color:var(--gray-600);">' + (DashboardState.statusFilter === 'all' ? 'You haven\'t made any bookings yet.' : 'You have no ' + DashboardState.statusFilter + ' bookings.') + '</p><a href="booking.html" class="btn btn-primary" style="margin-top:16px;">🚐 Book a Trip</a></div>';
        return;
    }

    var html = '';
    for (var j = 0; j < filtered.length; j++) {
        var b = filtered[j];
        var trip = b.trips || {};
        var departure = trip.departure_time ? new Date(trip.departure_time).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
        var canCancel = b.booking_status === 'pending';
        var canTrack = ['confirmed', 'completed'].includes(b.booking_status) && trip.drivers;
        var canReview = b.booking_status === 'completed' && !DashboardState.reviewedBookingIds.has(b.id);
        var alreadyReviewed = b.booking_status === 'completed' && DashboardState.reviewedBookingIds.has(b.id);
        
        var statusEmoji = {
            'pending': '⏳',
            'confirmed': '✅',
            'completed': '🎉',
            'cancelled': '❌'
        };

        var statusClass = {
            'pending': 'badge-pending',
            'confirmed': 'badge-confirmed',
            'completed': 'badge-completed',
            'cancelled': 'badge-cancelled'
        };

        var paymentStatusClass = b.payment_status === 'paid' ? 'badge-confirmed' : 'badge-pending';
        var paymentEmoji = b.payment_status === 'paid' ? '✅' : '⏳';

        var routeDisplay = trip.route ? trip.route.replace('-', ' → ') : 'Route TBD';
        var locationDisplay = b.pickup_location ? '<div style="font-size:0.75rem; color:var(--gray-600);">📍 ' + b.pickup_location + ' → ' + b.dropoff_location + '</div>' : '';

        var actionsHtml = '';
        if (canCancel) actionsHtml += '<button class="btn btn-danger btn-sm" data-cancel="' + b.id + '">Cancel</button>';
        if (canTrack) actionsHtml += '<button class="btn btn-navy btn-sm" data-track="' + b.id + '" data-driver="' + (trip.drivers ? trip.drivers.id : '') + '">📍 Track</button>';
        if (canReview) actionsHtml += '<button class="btn btn-primary btn-sm" data-review="' + b.id + '" data-driver-id="' + (trip.drivers ? trip.drivers.id : '') + '">⭐ Review</button>';
        if (alreadyReviewed) actionsHtml += '<span class="review-note">✓ Reviewed</span>';
        if (b.payment_status === 'paid') actionsHtml += '<span class="review-note">💰 Paid</span>';

        html += '<div class="booking-card status-' + b.booking_status + '">';
        html += '<div class="booking-card-top">';
        html += '<div><div class="booking-ref">' + b.booking_reference + '</div>';
        html += '<div class="booking-route">' + routeDisplay + '</div>';
        html += locationDisplay + '</div>';
        html += '<div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px;">';
        html += '<span class="badge ' + (statusClass[b.booking_status] || 'badge-pending') + '">' + (statusEmoji[b.booking_status] || '📋') + ' ' + b.booking_status + '</span>';
        html += '<span class="badge ' + paymentStatusClass + '" style="font-size:0.65rem;">' + paymentEmoji + ' ' + b.payment_status + '</span>';
        html += '</div></div>';
        html += '<div class="booking-details">';
        html += '<div><div class="label">Departure</div><div class="value">' + departure + '</div></div>';
        html += '<div><div class="label">Passengers</div><div class="value">' + b.number_of_seats + '</div></div>';
        html += '<div><div class="label">Total</div><div class="value">' + formatCurrency(b.total_price) + '</div></div>';
        html += '<div><div class="label">Payment</div><div class="value" style="text-transform:capitalize; font-size:0.8rem;">' + b.payment_method + '</div></div>';
        html += '</div>';
        html += '<div class="booking-actions">' + actionsHtml + '</div>';
        html += '<div class="tracking-panel" id="tracking-' + b.id + '">';
        html += '<div id="tracking-map-' + b.id + '" style="height:320px;"></div>';
        html += '</div></div>';
    }

    list.innerHTML = html;

    var cancelBtns = list.querySelectorAll('[data-cancel]');
    for (var k = 0; k < cancelBtns.length; k++) {
        cancelBtns[k].onclick = function() { cancelBooking(this.dataset.cancel); };
    }

    var trackBtns = list.querySelectorAll('[data-track]');
    for (var l = 0; l < trackBtns.length; l++) {
        trackBtns[l].onclick = function() { toggleTracking(this.dataset.track, this.dataset.driver); };
    }

    var reviewBtns = list.querySelectorAll('[data-review]');
    for (var m = 0; m < reviewBtns.length; m++) {
        reviewBtns[m].onclick = function() { openReviewModal(this.dataset.review, this.dataset.driverId); };
    }
}

function openReviewModal(bookingId, driverId) {
    document.getElementById('reviewBookingId').value = bookingId;
    document.getElementById('reviewDriverId').value = driverId || '';
    document.getElementById('reviewComment').value = '';
    DashboardState.selectedRating = 0;
    var stars = document.querySelectorAll('#starPicker span');
    for (var i = 0; i < stars.length; i++) {
        stars[i].classList.remove('active');
    }
    document.getElementById('reviewModal').classList.add('open');
}

function setupReviewModal(userId) {
    var stars = document.querySelectorAll('#starPicker span');
    for (var i = 0; i < stars.length; i++) {
        stars[i].onclick = function() {
            DashboardState.selectedRating = parseInt(this.dataset.star, 10);
            var allStars = document.querySelectorAll('#starPicker span');
            for (var s = 0; s < allStars.length; s++) {
                if (parseInt(allStars[s].dataset.star, 10) <= DashboardState.selectedRating) {
                    allStars[s].classList.add('active');
                } else {
                    allStars[s].classList.remove('active');
                }
            }
        };
    }

    var closeBtns = document.querySelectorAll('[data-close-review]');
    for (var j = 0; j < closeBtns.length; j++) {
        closeBtns[j].onclick = function() { document.getElementById('reviewModal').classList.remove('open'); };
    }

    document.getElementById('reviewModal').onclick = function(e) {
        if (e.target.id === 'reviewModal') document.getElementById('reviewModal').classList.remove('open');
    };

    document.getElementById('reviewForm').onsubmit = async function(e) {
        e.preventDefault();
        if (DashboardState.selectedRating === 0) {
            showToast('Please select a star rating.', 'error');
            return;
        }
        var bookingId = document.getElementById('reviewBookingId').value;
        var driverId = document.getElementById('reviewDriverId').value || null;
        var comment = document.getElementById('reviewComment').value.trim();

        var btn = document.getElementById('submitReviewBtn');
        btn.disabled = true;
        btn.textContent = 'Submitting...';

        var { error } = await supabaseClient.from('reviews').insert([{
            user_id: userId,
            booking_id: bookingId,
            driver_id: driverId,
            rating: DashboardState.selectedRating,
            comment: comment || null
        }]);

        if (error) {
            showToast(error.message, 'error');
            btn.disabled = false;
            btn.textContent = 'Submit Review';
            return;
        }

        showToast('Thanks! Your review has been submitted for approval.', 'success');
        document.getElementById('reviewModal').classList.remove('open');
        btn.disabled = false;
        btn.textContent = 'Submit Review';
        await loadOwnReviews(userId);
        renderBookings();
    };
}

async function cancelBooking(bookingId) {
    if (!confirm('Are you sure you want to cancel this trip?')) return;
    var { error } = await supabaseClient
        .from('bookings')
        .update({ booking_status: 'cancelled' })
        .eq('id', bookingId);

    if (error) {
        showToast('Could not cancel booking: ' + error.message, 'error');
        return;
    }
    showToast('Booking cancelled.', 'success');
    var user = await AuthManager.getCurrentUser();
    await loadBookings(user.id);
}

function toggleTracking(bookingId, driverId) {
    var panel = document.getElementById('tracking-' + bookingId);
    var isOpen = panel.classList.contains('open');

    if (DashboardState.openTrackingId && DashboardState.openTrackingId !== bookingId) {
        var prev = document.getElementById('tracking-' + DashboardState.openTrackingId);
        if (prev) prev.classList.remove('open');
        MapManager.stopTracking();
    }

    if (isOpen) {
        panel.classList.remove('open');
        MapManager.stopTracking();
        DashboardState.openTrackingId = null;
        return;
    }

    panel.classList.add('open');
    DashboardState.openTrackingId = bookingId;

    setTimeout(function() {
        MapManager.map = null;
        MapManager.driverMarker = null;
        MapManager.init('tracking-map-' + bookingId, [-24.6, 29.0], 8);
        MapManager.startTracking(driverId);
    }, 50);
}

function setupHandlers() {
    var tabs = document.querySelectorAll('.dash-tab');
    for (var i = 0; i < tabs.length; i++) {
        tabs[i].onclick = function() {
            var allTabs = document.querySelectorAll('.dash-tab');
            for (var t = 0; t < allTabs.length; t++) {
                allTabs[t].classList.remove('active');
            }
            this.classList.add('active');
            DashboardState.statusFilter = this.dataset.status;
            renderBookings();
        };
    }
}

/* =====================================================================
   REAL-TIME NOTIFICATIONS
   ===================================================================== */

function setupRealTimeNotifications(userId) {
    DashboardState.subscription = supabaseClient
        .channel('bookings-changes')
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'bookings',
                filter: 'user_id=eq.' + userId
            },
            function(payload) {
                var booking = payload.new;
                var oldStatus = payload.old.booking_status;
                var newStatus = booking.booking_status;
                var oldPayment = payload.old.payment_status;
                var newPayment = booking.payment_status;
                
                if (oldStatus !== newStatus) {
                    handleBookingStatusChange(booking, oldStatus, newStatus);
                }
                if (oldPayment !== newPayment && newPayment === 'paid') {
                    handlePaymentStatusChange(booking);
                }
            }
        )
        .subscribe();
}

function handleBookingStatusChange(booking, oldStatus, newStatus) {
    var statusMessages = {
        'confirmed': {
            title: '✅ Booking Confirmed!',
            body: 'Your booking ' + booking.booking_reference + ' has been confirmed.'
        },
        'completed': {
            title: '🎉 Trip Completed!',
            body: 'Your trip ' + booking.booking_reference + ' has been completed. Please leave a review!'
        },
        'cancelled': {
            title: '❌ Booking Cancelled',
            body: 'Your booking ' + booking.booking_reference + ' has been cancelled.'
        }
    };

    var notification = statusMessages[newStatus];
    if (!notification) return;

    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(notification.title, {
            body: notification.body,
            icon: '/assets/logo.png'
        });
    }

    playNotificationSound();
    showToast(notification.title + ' - ' + notification.body, 'success');
    loadBookings(DashboardState.profile.id);
}

function handlePaymentStatusChange(booking) {
    var title = '💰 Payment Confirmed!';
    var body = 'Your payment for booking ' + booking.booking_reference + ' has been confirmed.';

    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, {
            body: body,
            icon: '/assets/logo.png'
        });
    }

    playNotificationSound();
    showToast(title + ' - ' + body, 'success');
    loadBookings(DashboardState.profile.id);
}

function playNotificationSound() {
    try {
        var audio = document.getElementById('notificationSound');
        if (audio) {
            audio.currentTime = 0;
            audio.play().catch(function() {});
        }
    } catch (e) {}
}
