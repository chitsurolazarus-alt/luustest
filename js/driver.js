/* =====================================================================
   LUU TRAVELS & LOGISTICS - DRIVER DASHBOARD MANAGER
   ===================================================================== */

const DriverState = {
    authUser: null,
    profile: null,
    driverRecord: null,
    trips: [],
    watchId: null,
    isLive: false
};

document.addEventListener('DOMContentLoaded', async () => {
    const auth = await AuthManager.requireDriver('login.html');
    if (!auth) return;
    DriverState.authUser = auth.user;
    DriverState.profile = auth.profile;

    document.getElementById('welcomeText').textContent = `Welcome, ${auth.profile.full_name.split(' ')[0]}`;
    document.getElementById('logoutBtn').addEventListener('click', async () => {
        stopLiveLocation();
        await AuthManager.logout();
        window.location.href = '../index.html';
    });
    document.getElementById('liveToggleBtn').addEventListener('click', toggleLiveLocation);

    await loadDriverRecord();
});

async function loadDriverRecord() {
    const { data, error } = await supabaseClient
        .from('drivers')
        .select('*')
        .eq('user_id', DriverState.authUser.id)
        .single();

    const body = document.getElementById('driverBody');

    if (error || !data) {
        body.innerHTML = '<div class="pending-banner">We could not find your driver profile. Please contact Luu Travels & Logistics support.</div>';
        return;
    }

    DriverState.driverRecord = data;

    if (!data.is_approved) {
        body.innerHTML = '<div class="pending-banner">⏳ Your driver application is pending review. You will be able to see assigned trips here once an admin approves your account.</div>';
        document.getElementById('liveToggleBtn').disabled = true;
        return;
    }
    if (!data.is_active) {
        body.innerHTML = '<div class="pending-banner">Your driver account has been deactivated. Please contact Luu Travels & Logistics.</div>';
        document.getElementById('liveToggleBtn').disabled = true;
        return;
    }

    await loadAssignedTrips();
}

async function loadAssignedTrips() {
    const { data, error } = await supabaseClient
        .from('trips')
        .select('*, bookings(id, number_of_seats, payment_method, payment_status, booking_status, pickup_location, dropoff_location, special_requests, users(full_name, phone))')
        .eq('driver_id', DriverState.driverRecord.id)
        .in('status', ['scheduled', 'in-progress'])
        .order('departure_time', { ascending: true });

    const body = document.getElementById('driverBody');
    if (error) {
        body.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div>Could not load your trips: ${error.message}</div>`;
        return;
    }

    DriverState.trips = data || [];
    if (DriverState.trips.length === 0) {
        body.innerHTML = '<div class="empty-state"><div class="icon">📭</div>You have no upcoming trips assigned yet.</div>';
        return;
    }

    body.innerHTML = DriverState.trips.map(renderTripCard).join('');
    attachTripHandlers();
}

function renderTripCard(trip) {
    const departure = new Date(trip.departure_time).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
    const activeBookings = (trip.bookings || []).filter(b => b.booking_status !== 'cancelled');
    const totalPassengers = activeBookings.reduce((sum, b) => sum + b.number_of_seats, 0);

    const rows = activeBookings.map(b => `
        <tr>
            <td>${b.users ? b.users.full_name : 'Unknown'}</td>
            <td>${b.users ? b.users.phone : '—'}</td>
            <td>${b.number_of_seats}</td>
            <td>${b.pickup_location}</td>
            <td>${b.dropoff_location}</td>
            <td style="text-transform:capitalize;">${b.payment_method}
                ${b.payment_method === 'cash' && b.payment_status !== 'paid'
                    ? `<button class="btn btn-success btn-sm" style="margin-left:6px;" data-mark-paid="${b.id}">Mark Paid</button>`
                    : `<span class="badge badge-confirmed" style="margin-left:6px;">${b.payment_status}</span>`}
            </td>
        </tr>
    `).join('');

    const nextStatusAction = trip.status === 'scheduled'
        ? `<button class="btn btn-navy btn-sm" data-trip-action="in-progress" data-trip-id="${trip.id}">Start Trip</button>`
        : `<button class="btn btn-success btn-sm" data-trip-action="completed" data-trip-id="${trip.id}">Mark Trip Completed</button>`;

    return `
        <div class="trip-assignment-card">
            <div class="trip-assignment-top">
                <div>
                    <div class="trip-assignment-route">${trip.route.replace('-', ' → ')}</div>
                    <div class="trip-assignment-meta">🕐 ${departure} · ${trip.pickup_location} → ${trip.dropoff_location}</div>
                </div>
                <span class="passenger-count-pill">👥 ${totalPassengers} passenger${totalPassengers === 1 ? '' : 's'}</span>
            </div>
            ${activeBookings.length > 0 ? `
                <div style="overflow-x:auto;">
                    <table class="passenger-table">
                        <thead><tr><th>Customer</th><th>Phone</th><th>Seats</th><th>Pickup</th><th>Dropoff</th><th>Payment</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            ` : '<p style="color:var(--gray-600); font-size:0.88rem; margin-top:10px;">No passengers booked on this trip yet.</p>'}
            <div class="trip-status-actions">${nextStatusAction}</div>
        </div>
    `;
}

function attachTripHandlers() {
    document.querySelectorAll('[data-mark-paid]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const { error } = await supabaseClient.from('bookings').update({ payment_status: 'paid' }).eq('id', btn.dataset.markPaid);
            if (error) { showToast(error.message, 'error'); return; }
            showToast('Marked as paid.', 'success');
            await loadAssignedTrips();
        });
    });

    document.querySelectorAll('[data-trip-action]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const newStatus = btn.dataset.tripAction;
            const { error } = await supabaseClient.from('trips').update({ status: newStatus }).eq('id', btn.dataset.tripId);
            if (error) { showToast(error.message, 'error'); return; }
            showToast(newStatus === 'in-progress' ? 'Trip started.' : 'Trip marked as completed.', 'success');
            if (newStatus === 'completed') {
                // Also mark bookings on this trip as completed so customers can review the trip
                await supabaseClient.from('bookings').update({ booking_status: 'completed' }).eq('trip_id', btn.dataset.tripId).neq('booking_status', 'cancelled');
            }
            await loadAssignedTrips();
        });
    });
}

/* ------------------------ LIVE LOCATION SHARING ------------------------ */
function toggleLiveLocation() {
    if (DriverState.isLive) {
        stopLiveLocation();
    } else {
        startLiveLocation();
    }
}

function startLiveLocation() {
    if (!navigator.geolocation) {
        showToast('Your browser does not support location sharing.', 'error');
        return;
    }
    DriverState.watchId = navigator.geolocation.watchPosition(
        async (pos) => {
            const { latitude, longitude } = pos.coords;
            await supabaseClient
                .from('drivers')
                .update({ current_location: { lat: latitude, lng: longitude } })
                .eq('id', DriverState.driverRecord.id);
        },
        (err) => {
            showToast('Could not get your location: ' + err.message, 'error');
            stopLiveLocation();
        },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
    DriverState.isLive = true;
    document.getElementById('liveDot').classList.add('live');
    document.getElementById('liveLabel').textContent = 'Sharing your live location';
    document.getElementById('liveToggleBtn').textContent = 'Stop Sharing';
    showToast('Location sharing started. Customers can now track you.', 'success');
}

function stopLiveLocation() {
    if (DriverState.watchId !== null) {
        navigator.geolocation.clearWatch(DriverState.watchId);
        DriverState.watchId = null;
    }
    DriverState.isLive = false;
    document.getElementById('liveDot').classList.remove('live');
    document.getElementById('liveLabel').textContent = 'Location sharing off';
    document.getElementById('liveToggleBtn').textContent = 'Go Live';
}
