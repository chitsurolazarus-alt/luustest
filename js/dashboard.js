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

document.addEventListener('DOMContentLoaded', async () => {
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

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }

    // Bottom nav logout
    document.getElementById('bottomLogout').addEventListener('click', async (e) => {
        e.preventDefault();
        if (DashboardState.subscription) {
            DashboardState.subscription.unsubscribe();
        }
        await AuthManager.logout();
        window.location.href = '../index.html';
    });

    document.getElementById('logoutBtn').addEventListener('click', async () => {
        if (DashboardState.subscription) {
            DashboardState.subscription.unsubscribe();
        }
        await AuthManager.logout();
        window.location.href = '../index.html';
    });
});

async function loadOwnReviews(userId) {
    const { data, error } = await supabaseClient.from('reviews').select('booking_id').eq('user_id', userId);
    if (!error && data) {
        DashboardState.reviewedBookingIds = new Set(data.map(r => r.booking_id));
    }
}

function renderProfile() {
    const p = DashboardState.profile;
    document.getElementById('welcomeText').textContent = `Welcome back, ${p.full_name.split(' ')[0]}`;
    document.getElementById('avatarInitial').textContent = p.full_name.charAt(0).toUpperCase();
    document.getElementById('profileName').textContent = p.full_name;
    document.getElementById('profileEmail').textContent = p.email;
    document.getElementById('profilePhone').textContent = p.phone || 'Not provided';
    document.getElementById('profileSince').textContent = new Date(p.created_at).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long' });
}

async function loadBookings(userId) {
    const { data, error } = await supabaseClient
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
    const counts = {
        pending: 0,
        confirmed: 0,
        completed: 0,
        cancelled: 0
    };
    
    DashboardState.bookings.forEach(b => {
        if (counts[b.booking_status] !== undefined) {
            counts[b.booking_status]++;
        }
    });

    document.querySelectorAll('.dash-tab').forEach(tab => {
        const status = tab.dataset.status;
        if (status !== 'all') {
            const count = counts[status] || 0;
            tab.textContent = tab.textContent.replace(/\(\d+\)/, '');
            tab.textContent = tab.textContent.trim() + ` (${count})`;
        } else {
            tab.textContent = `📋 All (${DashboardState.bookings.length})`;
        }
    });
}

function renderBookings() {
    const list = document.getElementById('bookingsList');
    const filtered = DashboardState.statusFilter === 'all'
        ? DashboardState.bookings
        : DashboardState.bookings.filter(b => b.booking_status === DashboardState.statusFilter);

    if (filtered.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <div class="icon">📭</div>
                <h3>No bookings found</h3>
                <p style="color:var(--gray-600);">${DashboardState.statusFilter === 'all' ? 'You haven\'t made any bookings yet.' : `You have no ${DashboardState.statusFilter} bookings.`}</p>
                <a href="booking.html" class="btn btn-primary" style="margin-top:16px;">🚐 Book a Trip</a>
            </div>
        `;
        return;
    }

    list.innerHTML = filtered.map(b => {
        const trip = b.trips || {};
        const departure = trip.departure_time ? new Date(trip.departure_time).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
        const canCancel = b.booking_status === 'pending';
        const canTrack = ['confirmed', 'completed'].includes(b.booking_status) && trip.drivers;
        const canReview = b.booking_status === 'completed' && !DashboardState.reviewedBookingIds.has(b.id);
        const alreadyReviewed = b.booking_status === 'completed' && DashboardState.reviewedBookingIds.has(b.id);
        
        const statusEmoji = {
            'pending': '⏳',
            'confirmed': '✅',
            'completed': '🎉',
            'cancelled': '❌'
        };

        const statusClass = {
            'pending': 'badge-pending',
            'confirmed': 'badge-confirmed',
            'completed': 'badge-completed',
            'cancelled': 'badge-cancelled'
        };

        return `
            <div class="booking-card status-${b.booking_status}">
                <div class="booking-card-top">
                    <div>
                        <div class="booking-ref">${b.booking_reference}</div>
                        <div class="booking-route">${trip.route ? trip.route.replace('-', ' → ') : 'Route TBD'}</div>
                        ${b.pickup_location ? `<div style="font-size:0.75rem; color:var(--gray-600);">📍 ${b.pickup_location} → ${b.dropoff_location}</div>` : ''}
                    </div>
                    <span class="badge ${statusClass[b.booking_status] || 'badge-pending'}">${statusEmoji[b.booking_status] || '📋'} ${b.booking_status}</span>
                </div>
                <div class="booking-details">
                    <div><div class="label">Departure</div><div class="value">${departure}</div></div>
                    <div><div class="label">Passengers</div><div class="value">${b.number_of_seats}</div></div>
                    <div><div class="label">Total</div><div class="value">${formatCurrency(b.total_price)}</div></div>
                    <div><div class="label">Payment</div><div class="value" style="text-transform:capitalize; font-size:0.8rem;">${b.payment_method} · ${b.payment_status}</div></div>
                </div>
                <div class="booking-actions">
                    ${canCancel ? `<button class="btn btn-danger btn-sm" data-cancel="${b.id}">Cancel</button>` : ''}
                    ${canTrack ? `<button class="btn btn-navy btn-sm" data-track="${b.id}" data-driver="${trip.drivers.id}">📍 Track</button>` : ''}
                    ${canReview ? `<button class="btn btn-primary btn-sm" data-review="${b.id}" data-driver-id="${trip.drivers ? trip.drivers.id : ''}">⭐ Review</button>` : ''}
                    ${alreadyReviewed ? `<span class="review-note">✓ Reviewed</span>` : ''}
                </div>
                <div class="tracking-panel" id="tracking-${b.id}">
                    <div id="tracking-map-${b.id}" style="height:320px;"></div>
                </div>
            </div>
        `;
    }).join('');

    list.querySelectorAll('[data-cancel]').forEach(btn => {
        btn.addEventListener('click', () => cancelBooking(btn.dataset.cancel));
    });
    list.querySelectorAll('[data-track]').forEach(btn => {
        btn.addEventListener('click', () => toggleTracking(btn.dataset.track, btn.dataset.driver));
    });
    list.querySelectorAll('[data-review]').forEach(btn => {
        btn.addEventListener('click', () => openReviewModal(btn.dataset.review, btn.dataset.driverId));
    });
}

function openReviewModal(bookingId, driverId) {
    document.getElementById('reviewBookingId').value = bookingId;
    document.getElementById('reviewDriverId').value = driverId || '';
    document.getElementById('reviewComment').value = '';
    DashboardState.selectedRating = 0;
    document.querySelectorAll('#starPicker span').forEach(s => s.classList.remove('active'));
    document.getElementById('reviewModal').classList.add('open');
}

function setupReviewModal(userId) {
    document.querySelectorAll('#starPicker span').forEach(star => {
        star.addEventListener('click', () => {
            DashboardState.selectedRating = parseInt(star.dataset.star, 10);
            document.querySelectorAll('#starPicker span').forEach(s => {
                s.classList.toggle('active', parseInt(s.dataset.star, 10) <= DashboardState.selectedRating);
            });
        });
    });

    document.querySelectorAll('[data-close-review]').forEach(btn => {
        btn.addEventListener('click', () => document.getElementById('reviewModal').classList.remove('open'));
    });
    document.getElementById('reviewModal').addEventListener('click', (e) => {
        if (e.target.id === 'reviewModal') document.getElementById('reviewModal').classList.remove('open');
    });

    document.getElementById('reviewForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (DashboardState.selectedRating === 0) {
            showToast('Please select a star rating.', 'error');
            return;
        }
        const bookingId = document.getElementById('reviewBookingId').value;
        const driverId = document.getElementById('reviewDriverId').value || null;
        const comment = document.getElementById('reviewComment').value.trim();

        const btn = document.getElementById('submitReviewBtn');
        btn.disabled = true;
        btn.textContent = 'Submitting...';

        const { error } = await supabaseClient.from('reviews').insert([{
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
    });
}

async function cancelBooking(bookingId) {
    if (!confirm('Are you sure you want to cancel this trip?')) return;
    const { error } = await supabaseClient
        .from('bookings')
        .update({ booking_status: 'cancelled' })
        .eq('id', bookingId);

    if (error) {
        showToast('Could not cancel booking: ' + error.message, 'error');
        return;
    }
    showToast('Booking cancelled.', 'success');
    const user = await AuthManager.getCurrentUser();
    await loadBookings(user.id);
}

function toggleTracking(bookingId, driverId) {
    const panel = document.getElementById(`tracking-${bookingId}`);
    const isOpen = panel.classList.contains('open');

    if (DashboardState.openTrackingId && DashboardState.openTrackingId !== bookingId) {
        const prev = document.getElementById(`tracking-${DashboardState.openTrackingId}`);
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

    setTimeout(() => {
        MapManager.map = null;
        MapManager.driverMarker = null;
        MapManager.init(`tracking-map-${bookingId}`, [-24.6, 29.0], 8);
        MapManager.startTracking(driverId);
    }, 50);
}

function setupHandlers() {
    document.querySelectorAll('.dash-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.dash-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            DashboardState.statusFilter = tab.dataset.status;
            renderBookings();
        });
    });
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
                filter: `user_id=eq.${userId}`
            },
            (payload) => {
                const booking = payload.new;
                const oldStatus = payload.old.booking_status;
                const newStatus = booking.booking_status;
                
                if (oldStatus !== newStatus) {
                    handleBookingStatusChange(booking, oldStatus, newStatus);
                }
            }
        )
        .subscribe();
}

function handleBookingStatusChange(booking, oldStatus, newStatus) {
    const statusMessages = {
        'confirmed': {
            title: '✅ Booking Confirmed!',
            body: `Your booking ${booking.booking_reference} has been confirmed. Your driver will be assigned soon.`
        },
        'completed': {
            title: '🎉 Trip Completed!',
            body: `Your trip ${booking.booking_reference} has been completed. Please leave a review!`
        },
        'cancelled': {
            title: '❌ Booking Cancelled',
            body: `Your booking ${booking.booking_reference} has been cancelled.`
        }
    };

    const notification = statusMessages[newStatus];
    if (!notification) return;

    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(notification.title, {
            body: notification.body,
            icon: '/assets/logo.png'
        });
    }

    playNotificationSound();
    showToast(`${notification.title} - ${notification.body}`, 'success');
    loadBookings(DashboardState.profile.id);
}

function playNotificationSound() {
    try {
        const audio = document.getElementById('notificationSound');
        if (audio) {
            audio.currentTime = 0;
            audio.play().catch(() => {});
        }
    } catch (e) {}
}
