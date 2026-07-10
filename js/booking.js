/* =====================================================================
   LUU TRAVELS & LOGISTICS - BOOKING MANAGER
   ===================================================================== */

const BookingState = {
    currentUser: null,
    routeFilter: 'all',
    seats: 1,
    distance: 0,
    selectedDate: null,
    selectedTime: null,
    pickupAddress: null,
    dropoffAddress: null,
    pickupCoords: null,
    dropoffCoords: null
};

const WHATSAPP_NUMBER = '27768457061'; // South African number without +

document.addEventListener('DOMContentLoaded', async () => {
    const user = await AuthManager.requireAuth('login.html');
    if (!user) return;
    BookingState.currentUser = user;

    MapManager.init('booking-map');
    setupMapClicks();
    await loadTimeSlots();
    setupUIHandlers();
});

// Map click handler
let clickStage = 'pickup';
function setupMapClicks() {
    MapManager.map.on('click', async (e) => {
        const { lat, lng } = e.latlng;
        if (clickStage === 'pickup') {
            MapManager.setPickup(lat, lng);
            clickStage = 'dropoff';
            // Reverse geocode to get address
            const address = await reverseGeocode(lat, lng);
            document.getElementById('pickupSearch').value = address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
            BookingState.pickupAddress = address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
            BookingState.pickupCoords = { lat, lng };
        } else if (clickStage === 'dropoff') {
            MapManager.setDropoff(lat, lng);
            clickStage = 'done';
            const address = await reverseGeocode(lat, lng);
            document.getElementById('dropoffSearch').value = address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
            BookingState.dropoffAddress = address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
            BookingState.dropoffCoords = { lat, lng };
            calculatePrice();
        } else {
            MapManager.clearAll();
            clickStage = 'pickup';
            document.getElementById('pickupSearch').value = '';
            document.getElementById('dropoffSearch').value = '';
            BookingState.pickupAddress = null;
            BookingState.dropoffAddress = null;
            BookingState.distance = 0;
            document.getElementById('distanceValue').textContent = '— km';
            document.getElementById('estimatedPriceValue').textContent = 'R0.00';
            document.getElementById('distanceDisplay').textContent = '— km';
            document.getElementById('totalPrice').textContent = 'R0.00';
        }
    });

    document.getElementById('clearMapBtn').addEventListener('click', () => {
        MapManager.clearAll();
        clickStage = 'pickup';
        document.getElementById('pickupSearch').value = '';
        document.getElementById('dropoffSearch').value = '';
        BookingState.pickupAddress = null;
        BookingState.dropoffAddress = null;
        BookingState.distance = 0;
        document.getElementById('distanceValue').textContent = '— km';
        document.getElementById('estimatedPriceValue').textContent = 'R0.00';
        document.getElementById('distanceDisplay').textContent = '— km';
        document.getElementById('totalPrice').textContent = 'R0.00';
    });

    document.getElementById('pickupSearchBtn').addEventListener('click', () => handleAddressSearch('pickup'));
    document.getElementById('dropoffSearchBtn').addEventListener('click', () => handleAddressSearch('dropoff'));
    document.getElementById('pickupSearch').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddressSearch('pickup'); } });
    document.getElementById('dropoffSearch').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddressSearch('dropoff'); } });
}

async function reverseGeocode(lat, lng) {
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
        const response = await fetch(url);
        const data = await response.json();
        return data.display_name || null;
    } catch (e) {
        return null;
    }
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
            BookingState.pickupAddress = query;
            BookingState.pickupCoords = { lat, lng };
        } else {
            MapManager.setDropoff(lat, lng);
            clickStage = 'done';
            BookingState.dropoffAddress = query;
            BookingState.dropoffCoords = { lat, lng };
            calculatePrice();
        }
    } catch (err) {
        showToast(err.message || 'Could not find that address.', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Find';
    }
}

function calculatePrice() {
    if (!BookingState.pickupCoords || !BookingState.dropoffCoords) return;
    
    const distance = calculateDistanceKm(
        BookingState.pickupCoords.lat,
        BookingState.pickupCoords.lng,
        BookingState.dropoffCoords.lat,
        BookingState.dropoffCoords.lng
    );
    
    BookingState.distance = distance;
    const price = distance * APP_CONFIG.pricePerKm * BookingState.seats;
    
    document.getElementById('distanceValue').textContent = `${distance.toFixed(1)} km`;
    document.getElementById('estimatedPriceValue').textContent = formatCurrency(price);
    document.getElementById('distanceDisplay').textContent = `${distance.toFixed(1)} km`;
    document.getElementById('totalPrice').textContent = formatCurrency(price);
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
            <div class="trip-empty">No time slots available for this route.</div>
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

    container.querySelectorAll('.time-slot-chip').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.time-slot-chip').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            BookingState.selectedTime = btn.dataset.slotId;
            document.getElementById('selectedTimeDisplay').textContent = btn.dataset.time;
            document.getElementById('selectedTimeDisplay').style.color = 'var(--success)';
        });
    });
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
        });
    });

    // Date picker - set default to today
    const dateInput = document.getElementById('tripDate');
    const today = new Date().toISOString().split('T')[0];
    dateInput.setAttribute('min', today);
    dateInput.value = today;

    // Seat controls
    document.getElementById('seatMinus').addEventListener('click', () => {
        if (BookingState.seats > 1) { 
            BookingState.seats--; 
            document.getElementById('seatCount').value = BookingState.seats;
            document.getElementById('passengerCount').textContent = BookingState.seats;
            calculatePrice();
        }
    });
    document.getElementById('seatPlus').addEventListener('click', () => {
        if (BookingState.seats < 14) { 
            BookingState.seats++; 
            document.getElementById('seatCount').value = BookingState.seats;
            document.getElementById('passengerCount').textContent = BookingState.seats;
            calculatePrice();
        }
    });

    // Confirm booking - WhatsApp
    document.getElementById('confirmBookingBtn').addEventListener('click', confirmBookingViaWhatsApp);

    document.getElementById('logoutBtn').addEventListener('click', async () => {
        await AuthManager.logout();
        window.location.href = '../index.html';
    });
}

async function confirmBookingViaWhatsApp() {
    // Validate all required fields
    if (!BookingState.selectedTime) {
        showToast('Please select a departure time.', 'error');
        return;
    }
    
    if (!BookingState.pickupAddress || !BookingState.dropoffAddress) {
        showToast('Please set both pickup and drop-off locations on the map.', 'error');
        return;
    }

    if (BookingState.distance === 0) {
        showToast('Please set both pickup and drop-off locations to calculate distance.', 'error');
        return;
    }

    // Get user profile
    const user = BookingState.currentUser;
    const { data: profile } = await supabaseClient
        .from('users')
        .select('full_name, phone')
        .eq('id', user.id)
        .single();

    // Get time slot details
    const { data: slotData } = await supabaseClient
        .from('time_slots')
        .select('route, departure_time')
        .eq('id', BookingState.selectedTime)
        .single();

    const date = document.getElementById('tripDate').value;
    const formattedDate = new Date(date).toLocaleDateString('en-ZA', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });

    // Calculate total price
    const totalPrice = BookingState.distance * APP_CONFIG.pricePerKm * BookingState.seats;

    // Build WhatsApp message
    const message = `
🚐 *NEW BOOKING - Luu Travels & Logistics*

👤 *Customer:* ${profile?.full_name || 'Unknown'}
📱 *Phone:* ${profile?.phone || 'Not provided'}
📧 *Email:* ${user.email}

📍 *Route:* ${slotData?.route?.replace('-', ' → ') || 'Unknown'}
📅 *Date:* ${formattedDate}
🕐 *Time:* ${slotData?.departure_time || 'Unknown'}

📍 *Pickup:* ${BookingState.pickupAddress}
📍 *Drop-off:* ${BookingState.dropoffAddress}

📏 *Distance:* ${BookingState.distance.toFixed(1)} km
👥 *Passengers:* ${BookingState.seats}
💰 *Total Price:* R${totalPrice.toFixed(2)}

📝 *Special Requests:* ${document.getElementById('specialRequests').value.trim() || 'None'}

---
*Please confirm this booking and arrange transport.*
    `.trim();

    // Encode message for WhatsApp URL
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodedMessage}`;

    // Save booking to database
    try {
        const { error } = await supabaseClient.from('bookings').insert([{
            user_id: user.id,
            trip_id: null, // No specific trip, just a booking request
            number_of_seats: BookingState.seats,
            total_price: totalPrice,
            payment_method: 'cash',
            payment_status: 'pending',
            booking_status: 'pending',
            pickup_location: BookingState.pickupAddress,
            dropoff_location: BookingState.dropoffAddress,
            pickup_coordinates: BookingState.pickupCoords,
            dropoff_coordinates: BookingState.dropoffCoords,
            special_requests: document.getElementById('specialRequests').value.trim() || null,
            booking_reference: `LUU-${Date.now().toString().slice(-8)}`
        }]);

        if (error) throw error;

        showToast('Booking saved! Redirecting to WhatsApp...', 'success');
        
        // Redirect to WhatsApp after a short delay
        setTimeout(() => {
            window.open(whatsappUrl, '_blank');
            // Also open a new tab to WhatsApp
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 500);
        }, 1000);

    } catch (err) {
        showToast(err.message || 'Could not save booking. Please try again.', 'error');
    }
}
