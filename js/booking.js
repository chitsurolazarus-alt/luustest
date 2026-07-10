/* =====================================================================
   LUU TRAVELS & LOGISTICS - BOOKING MANAGER
   ===================================================================== */

const BookingState = {
    currentUser: null,
    trips: [],
    selectedTrip: null,
    routeFilter: 'all',
    seats: 1,
    paymentMethod: 'cash',
    distance: 0,
    selectedDate: null,
    selectedTime: null
};

document.addEventListener('DOMContentLoaded', async () => {
    const user = await AuthManager.requireAuth('login.html');
    if (!user) return;
    BookingState.currentUser = user;

    MapManager.init('booking-map');
    setupMapClicks();
    await loadTimeSlots();
    setupUIHandlers();
    
    // Trigger initial load
    loadTripsForDateAndTime();
});

// Map click handler: first click sets pickup, second sets dropoff, third click resets and starts over
let clickStage = 'pickup';
function setupMapClicks() {
    MapManager.map.on('click', (e) => {
        const { lat, lng } = e.latlng;
        if (clickStage === 'pickup') {
            MapManager.setPickup(lat, lng);
            clickStage = 'dropoff';
        } else if (clickStage === 'dropoff') {
            MapManager.setDropoff(lat, lng);
            clickStage = 'done';
        } else {
            MapManager.clearAll();
            MapManager.setPickup(lat, lng);
            clickStage = 'dropoff';
        }
    });

    document.addEventListener('routeUpdated', (e) => {
        BookingState.distance = e.detail.distance;
        document.getElementById('distanceValue').textContent = `${e.detail.distance.toFixed(1)} km`;
        const estimated = e.detail.distance * APP_CONFIG.pricePerKm;
        document.getElementById('estimatedPriceValue').textContent = formatCurrency(estimated);
    });

    document.getElementById('clearMapBtn').addEventListener('click', () => {
        MapManager.clearAll();
        clickStage = 'pickup';
        document.getElementById('pickupSearch').value = '';
        document.getElementById('dropoffSearch').value = '';
        document.getElementById('distanceValue').textContent = '— km';
        document.getElementById('estimatedPriceValue').textContent = 'R0.00';
    });

    document.getElementById('pickupSearchBtn').addEventListener('click', () => handleAddressSearch('pickup'));
    document.getElementById('dropoffSearchBtn').addEventListener('click', () => handleAddressSearch('dropoff'));
    document.getElementById('pickupSearch').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddressSearch('pickup'); } });
    document.getElementById('dropoffSearch').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddressSearch('dropoff'); } });
}

async function handleAddressSearch(which) {
    const inputId = which === 'pickup' ? 'pickupSearch' : 'dropoffSearch';
    const btnId = which === 'pickup' ? 'pickupSearchBtn' : 'dropoffSearchBtn';
    const query = document.getElementById(inputId).value.trim();
    if (!query) { showToast('Please type an address first.', 'error'); return; }

    const btn = document.getElementById(btnId);
    btn.disabled = true;
    btn.textContent = '...';
    try {
        const { lat, lng } = await MapManager.geocodeAddress(query + ', South Africa');
        if (which === 'pickup') {
            MapManager.setPickup(lat, lng);
            clickStage = 'dropoff';
        } else {
            MapManager.setDropoff(lat, lng);
            clickStage = 'done';
        }
    } catch (err) {
        showToast(err.message || 'Could not find that address.', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Find';
    }
}

async function loadTimeSlots() {
    const { data, error } = await supabaseClient
        .from('time_slots')
        .select('*')
        .eq('is_active', true)
        .order('route')
        .order('departure_time');

    if (error) {
        showToast('Could not load time slots: ' + error.message, 'error');
        return;
    }

    // If no time slots exist, create default ones
    if (!data || data.length === 0) {
        await createDefaultTimeSlots();
        const { data: newData } = await supabaseClient
            .from('time_slots')
            .select('*')
            .eq('is_active', true)
            .order('route')
            .order('departure_time');
        renderTimeSlots(newData || []);
    } else {
        renderTimeSlots(data);
    }
}

async function createDefaultTimeSlots() {
    const defaultSlots = [
        { route: 'Gauteng-Limpopo', departure_time: '06:00', is_active: true },
        { route: 'Gauteng-Limpopo', departure_time: '10:00', is_active: true },
        { route: 'Gauteng-Limpopo', departure_time: '14:00', is_active: true },
        { route: 'Gauteng-Limpopo', departure_time: '18:00', is_active: true },
        { route: 'Limpopo-Gauteng', departure_time: '06:00', is_active: true },
        { route: 'Limpopo-Gauteng', departure_time: '10:00', is_active: true },
        { route: 'Limpopo-Gauteng', departure_time: '14:00', is_active: true },
        { route: 'Limpopo-Gauteng', departure_time: '18:00', is_active: true }
    ];
    
    for (const slot of defaultSlots) {
        await supabaseClient.from('time_slots').insert([slot]);
    }
}

function renderTimeSlots(slots) {
    const container = document.getElementById('timeSlotContainer');
    const route = BookingState.routeFilter;

    const filtered = route === 'all' 
        ? slots 
        : slots.filter(s => s.route === route);

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="trip-empty">No time slots available for this route. Please check back later.</div>
        `;
        return;
    }

    // Group by route for display
    const grouped = {};
    filtered.forEach(slot => {
        if (!grouped[slot.route]) grouped[slot.route] = [];
        grouped[slot.route].push(slot);
    });

    let html = '';
    for (const [route, times] of Object.entries(grouped)) {
        html += `<div style="margin-bottom:16px;">
            <h4 style="font-size:0.9rem; color:var(--primary); margin-bottom:8px;">${route.replace('-', ' → ')}</h4>
            <div style="display:flex; flex-wrap:wrap; gap:8px;">
                ${times.map(slot => `
                    <button class="time-slot-chip ${BookingState.selectedTime === slot.id ? 'active' : ''}" 
                            data-slot-id="${slot.id}" 
                            data-route="${slot.route}" 
                            data-time="${slot.departure_time}"
                            style="padding:8px 16px; border-radius:999px; border:1.5px solid var(--gray-200); 
                                   background:${BookingState.selectedTime === slot.id ? 'var(--primary)' : 'var(--secondary)'};
                                   color:${BookingState.selectedTime === slot.id ? 'var(--secondary)' : 'var(--gray-600)'};
                                   cursor:pointer; font-weight:600; font-size:0.85rem;">
                        ${slot.departure_time}
                    </button>
                `).join('')}
            </div>
        </div>`;
    }

    container.innerHTML = html;

    // Add click handlers for time slots
    container.querySelectorAll('.time-slot-chip').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.time-slot-chip').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            BookingState.selectedTime = btn.dataset.slotId;
            document.getElementById('selectedTimeDisplay').textContent = btn.dataset.time;
            document.getElementById('selectedTimeDisplay').style.color = 'var(--success)';
            loadTripsForDateAndTime();
        });
    });
}

async function loadTripsForDateAndTime() {
    const dateInput = document.getElementById('tripDate');
    const selectedDate = dateInput.value;
    
    if (!selectedDate) {
        document.getElementById('tripList').innerHTML = '<div class="trip-empty">Please select a travel date first.</div>';
        return;
    }

    // If no time slot selected, show all trips for the date
    let routeFilter = null;
    if (BookingState.selectedTime) {
        const { data: slotData } = await supabaseClient
            .from('time_slots')
            .select('route')
            .eq('id', BookingState.selectedTime)
            .single();
        if (slotData) {
            routeFilter = slotData.route;
        }
    }

    // Build the departure time range (the whole day of selected date)
    const startDate = new Date(selectedDate);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(selectedDate);
    endDate.setHours(23, 59, 59, 999);

    // Build query
    let query = supabaseClient
        .from('trips')
        .select('*, drivers(full_name, vehicle_model, vehicle_color, phone)')
        .gte('departure_time', startDate.toISOString())
        .lte('departure_time', endDate.toISOString())
        .gt('available_seats', 0)
        .order('departure_time', { ascending: true });

    if (routeFilter) {
        query = query.eq('route', routeFilter);
    } else if (BookingState.routeFilter !== 'all') {
        query = query.eq('route', BookingState.routeFilter);
    }

    const { data, error } = await query;

    if (error) {
        showToast('Could not load trips: ' + error.message, 'error');
        return;
    }

    BookingState.trips = data || [];
    renderTripsForDate();
}

function renderTripsForDate() {
    const list = document.getElementById('tripList');

    if (BookingState.trips.length === 0) {
        list.innerHTML = `
            <div class="trip-empty">
                No trips available for this route on the selected date. 
                <br><small style="color:var(--gray-400);">Please try another date or time slot.</small>
            </div>
        `;
        return;
    }

    list.innerHTML = BookingState.trips.map(trip => {
        const departure = new Date(trip.departure_time);
        const driverName = trip.drivers ? trip.drivers.full_name : 'To be assigned';
        const vehicle = trip.drivers ? `${trip.drivers.vehicle_color} ${trip.drivers.vehicle_model}` : 'N/A';
        return `
            <div class="trip-card" data-trip-id="${trip.id}">
                <div class="trip-card-top">
                    <span class="trip-card-route">${trip.route.replace('-', ' → ')}</span>
                    <span class="trip-card-price">${formatCurrency(trip.total_price)}</span>
                </div>
                <div class="trip-card-meta">
                    <span>🕐 ${departure.toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                    <span>👤 ${driverName}</span>
                    <span>🚐 ${vehicle}</span>
                    <span>💺 ${trip.available_seats} seats left</span>
                </div>
            </div>
        `;
    }).join('');

    list.querySelectorAll('.trip-card').forEach(card => {
        card.addEventListener('click', () => selectTrip(card.dataset.tripId));
    });
}

function selectTrip(tripId) {
    BookingState.selectedTrip = BookingState.trips.find(t => t.id === tripId);
    document.querySelectorAll('.trip-card').forEach(c => c.classList.toggle('selected', c.dataset.tripId === tripId));

    const card = document.getElementById('bookingFormCard');
    card.style.display = 'block';
    BookingState.seats = 1;
    document.getElementById('seatCount').value = 1;
    document.getElementById('seatsAvailableLabel').textContent = `of ${BookingState.selectedTrip.available_seats} available`;
    updatePriceSummary();
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function updatePriceSummary() {
    if (!BookingState.selectedTrip) return;
    const perSeat = Number(BookingState.selectedTrip.total_price);
    document.getElementById('pricePerSeat').textContent = formatCurrency(perSeat);
    document.getElementById('seatsSummary').textContent = BookingState.seats;
    document.getElementById('totalPrice').textContent = formatCurrency(perSeat * BookingState.seats);
}

function setupUIHandlers() {
    // Route filter chips
    document.querySelectorAll('.route-chip').forEach(chip => {
        chip.addEventListener('click', async () => {
            document.querySelectorAll('.route-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            BookingState.routeFilter = chip.dataset.route;
            BookingState.selectedTime = null;
            document.getElementById('selectedTimeDisplay').textContent = 'None selected';
            document.getElementById('selectedTimeDisplay').style.color = 'var(--gray-400)';
            await loadTimeSlots();
            loadTripsForDateAndTime();
        });
    });

    // Date picker - set default to today
    const dateInput = document.getElementById('tripDate');
    const today = new Date().toISOString().split('T')[0];
    dateInput.setAttribute('min', today);
    dateInput.value = today;
    
    dateInput.addEventListener('change', () => {
        BookingState.selectedTrip = null;
        document.getElementById('bookingFormCard').style.display = 'none';
        loadTripsForDateAndTime();
    });

    // Seat controls
    document.getElementById('seatMinus').addEventListener('click', () => {
        if (BookingState.seats > 1) { BookingState.seats--; document.getElementById('seatCount').value = BookingState.seats; updatePriceSummary(); }
    });
    document.getElementById('seatPlus').addEventListener('click', () => {
        const max = Math.min(APP_CONFIG.maxSeats, BookingState.selectedTrip ? BookingState.selectedTrip.available_seats : APP_CONFIG.maxSeats);
        if (BookingState.seats < max) { BookingState.seats++; document.getElementById('seatCount').value = BookingState.seats; updatePriceSummary(); }
    });

    // Payment options
    document.querySelectorAll('.payment-option').forEach(opt => {
        opt.addEventListener('click', () => {
            if (opt.dataset.method === 'card') {
                showToast('Card payments are coming soon. Please select Cash for now.', 'info');
                return;
            }
            document.querySelectorAll('.payment-option').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            BookingState.paymentMethod = opt.dataset.method;
        });
    });

    document.getElementById('confirmBookingBtn').addEventListener('click', confirmBooking);

    document.getElementById('logoutBtn').addEventListener('click', async () => {
        await AuthManager.logout();
        window.location.href = '../index.html';
    });
}

async function confirmBooking() {
    if (!BookingState.selectedTrip) {
        showToast('Please select a trip first.', 'error');
        return;
    }
    const trip = BookingState.selectedTrip;
    const pickupLocation = MapManager.pickupMarker
        ? `${MapManager.pickupMarker.getLatLng().lat.toFixed(5)}, ${MapManager.pickupMarker.getLatLng().lng.toFixed(5)}`
        : trip.pickup_location;
    const dropoffLocation = MapManager.dropoffMarker
        ? `${MapManager.dropoffMarker.getLatLng().lat.toFixed(5)}, ${MapManager.dropoffMarker.getLatLng().lng.toFixed(5)}`
        : trip.dropoff_location;

    const btn = document.getElementById('confirmBookingBtn');
    btn.disabled = true;
    btn.textContent = 'Booking...';

    try {
        const { error } = await supabaseClient.from('bookings').insert([{
            user_id: BookingState.currentUser.id,
            trip_id: trip.id,
            number_of_seats: BookingState.seats,
            total_price: Number(trip.total_price) * BookingState.seats,
            payment_method: BookingState.paymentMethod,
            pickup_location: pickupLocation,
            dropoff_location: dropoffLocation,
            pickup_coordinates: MapManager.pickupMarker ? { lat: MapManager.pickupMarker.getLatLng().lat, lng: MapManager.pickupMarker.getLatLng().lng } : null,
            dropoff_coordinates: MapManager.dropoffMarker ? { lat: MapManager.dropoffMarker.getLatLng().lat, lng: MapManager.dropoffMarker.getLatLng().lng } : null,
            special_requests: document.getElementById('specialRequests').value.trim() || null
        }]);

        if (error) throw error;

        showToast('Booking confirmed! Redirecting to your dashboard...', 'success');
        setTimeout(() => window.location.href = 'dashboard.html', 1500);
    } catch (err) {
        showToast(err.message || 'Booking failed. Please try again.', 'error');
        btn.disabled = false;
        btn.textContent = 'Confirm Booking';
    }
}
