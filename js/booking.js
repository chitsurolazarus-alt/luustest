/* =====================================================================
   LUU TRAVELS & LOGISTICS - BOOKING MANAGER
   ===================================================================== */

var BookingState = {
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

var WHATSAPP_NUMBER = '27768457061';

document.addEventListener('DOMContentLoaded', async function() {
    var user = await AuthManager.requireAuth('login.html');
    if (!user) return;
    BookingState.currentUser = user;

    MapManager.init('booking-map');
    setupMapClicks();
    await loadTimeSlots();
    setupUIHandlers();
    setupMobileMenu();
    setupLogout();
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

// Map click handler
var clickStage = 'pickup';

function setupMapClicks() {
    MapManager.map.on('click', async function(e) {
        var lat = e.latlng.lat;
        var lng = e.latlng.lng;
        
        if (clickStage === 'pickup') {
            MapManager.setPickup(lat, lng);
            clickStage = 'dropoff';
            var address = await reverseGeocode(lat, lng);
            document.getElementById('pickupSearch').value = address || lat.toFixed(5) + ', ' + lng.toFixed(5);
            BookingState.pickupAddress = address || lat.toFixed(5) + ', ' + lng.toFixed(5);
            BookingState.pickupCoords = { lat: lat, lng: lng };
        } else if (clickStage === 'dropoff') {
            MapManager.setDropoff(lat, lng);
            clickStage = 'done';
            var address = await reverseGeocode(lat, lng);
            document.getElementById('dropoffSearch').value = address || lat.toFixed(5) + ', ' + lng.toFixed(5);
            BookingState.dropoffAddress = address || lat.toFixed(5) + ', ' + lng.toFixed(5);
            BookingState.dropoffCoords = { lat: lat, lng: lng };
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

    document.getElementById('clearMapBtn').onclick = function() {
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
    };

    document.getElementById('pickupSearchBtn').onclick = function() { handleAddressSearch('pickup'); };
    document.getElementById('dropoffSearchBtn').onclick = function() { handleAddressSearch('dropoff'); };
    document.getElementById('pickupSearch').onkeydown = function(e) { if (e.key === 'Enter') { e.preventDefault(); handleAddressSearch('pickup'); } };
    document.getElementById('dropoffSearch').onkeydown = function(e) { if (e.key === 'Enter') { e.preventDefault(); handleAddressSearch('dropoff'); } };
}

async function reverseGeocode(lat, lng) {
    try {
        var url = 'https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lng + '&zoom=18&addressdetails=1';
        var response = await fetch(url);
        var data = await response.json();
        return data.display_name || null;
    } catch (e) {
        return null;
    }
}

async function handleAddressSearch(which) {
    var inputId = which === 'pickup' ? 'pickupSearch' : 'dropoffSearch';
    var btnId = which === 'pickup' ? 'pickupSearchBtn' : 'dropoffSearchBtn';
    var query = document.getElementById(inputId).value.trim();
    if (!query) { showToast('Please type an address first.', 'error'); return; }

    var btn = document.getElementById(btnId);
    btn.disabled = true;
    btn.textContent = '...';
    try {
        var result = await MapManager.geocodeAddress(query + ', South Africa');
        var lat = result.lat;
        var lng = result.lng;
        if (which === 'pickup') {
            MapManager.setPickup(lat, lng);
            clickStage = 'dropoff';
            BookingState.pickupAddress = query;
            BookingState.pickupCoords = { lat: lat, lng: lng };
        } else {
            MapManager.setDropoff(lat, lng);
            clickStage = 'done';
            BookingState.dropoffAddress = query;
            BookingState.dropoffCoords = { lat: lat, lng: lng };
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
    
    var distance = calculateDistanceKm(
        BookingState.pickupCoords.lat,
        BookingState.pickupCoords.lng,
        BookingState.dropoffCoords.lat,
        BookingState.dropoffCoords.lng
    );
    
    BookingState.distance = distance;
    var price = distance * APP_CONFIG.pricePerKm * BookingState.seats;
    
    document.getElementById('distanceValue').textContent = distance.toFixed(1) + ' km';
    document.getElementById('estimatedPriceValue').textContent = formatCurrency(price);
    document.getElementById('distanceDisplay').textContent = distance.toFixed(1) + ' km';
    document.getElementById('totalPrice').textContent = formatCurrency(price);
}

async function loadTimeSlots() {
    var { data, error } = await supabaseClient
        .from('time_slots')
        .select('*')
        .eq('is_active', true)
        .order('route')
        .order('departure_time');

    if (error) {
        showToast('Could not load time slots: ' + error.message, 'error');
        return;
    }

    if (!data || data.length === 0) {
        await createDefaultTimeSlots();
        var { data: newData } = await supabaseClient
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
    var defaultSlots = [
        { route: 'Gauteng-Limpopo', departure_time: '06:00', is_active: true },
        { route: 'Gauteng-Limpopo', departure_time: '10:00', is_active: true },
        { route: 'Gauteng-Limpopo', departure_time: '14:00', is_active: true },
        { route: 'Gauteng-Limpopo', departure_time: '18:00', is_active: true },
        { route: 'Limpopo-Gauteng', departure_time: '06:00', is_active: true },
        { route: 'Limpopo-Gauteng', departure_time: '10:00', is_active: true },
        { route: 'Limpopo-Gauteng', departure_time: '14:00', is_active: true },
        { route: 'Limpopo-Gauteng', departure_time: '18:00', is_active: true }
    ];
    
    for (var i = 0; i < defaultSlots.length; i++) {
        await supabaseClient.from('time_slots').insert([defaultSlots[i]]);
    }
}

function renderTimeSlots(slots) {
    var container = document.getElementById('timeSlotContainer');
    var route = BookingState.routeFilter;

    var filtered = [];
    if (route === 'all') {
        filtered = slots;
    } else {
        for (var i = 0; i < slots.length; i++) {
            if (slots[i].route === route) {
                filtered.push(slots[i]);
            }
        }
    }

    if (filtered.length === 0) {
        container.innerHTML = '<div class="trip-empty">No time slots available for this route.</div>';
        return;
    }

    var grouped = {};
    for (var j = 0; j < filtered.length; j++) {
        var slot = filtered[j];
        if (!grouped[slot.route]) grouped[slot.route] = [];
        grouped[slot.route].push(slot);
    }

    var html = '';
    var routeKeys = Object.keys(grouped);
    for (var k = 0; k < routeKeys.length; k++) {
        var routeKey = routeKeys[k];
        var times = grouped[routeKey];
        html += '<div style="margin-bottom:16px;">';
        html += '<h4 style="font-size:0.9rem; color:var(--primary); margin-bottom:8px;">' + routeKey.replace('-', ' → ') + '</h4>';
        html += '<div style="display:flex; flex-wrap:wrap; gap:8px;">';
        for (var t = 0; t < times.length; t++) {
            var slotItem = times[t];
            var isActive = BookingState.selectedTime === slotItem.id ? 'active' : '';
            var bgColor = BookingState.selectedTime === slotItem.id ? 'var(--primary)' : 'var(--secondary)';
            var textColor = BookingState.selectedTime === slotItem.id ? 'var(--secondary)' : 'var(--gray-600)';
            html += '<button class="time-slot-chip ' + isActive + '" data-slot-id="' + slotItem.id + '" data-route="' + slotItem.route + '" data-time="' + slotItem.departure_time + '" style="padding:8px 16px; border-radius:999px; border:1.5px solid var(--gray-200); background:' + bgColor + '; color:' + textColor + '; cursor:pointer; font-weight:600; font-size:0.85rem;">' + slotItem.departure_time + '</button>';
        }
        html += '</div></div>';
    }

    container.innerHTML = html;

    var chips = container.querySelectorAll('.time-slot-chip');
    for (var c = 0; c < chips.length; c++) {
        chips[c].onclick = function() {
            var allChips = document.querySelectorAll('.time-slot-chip');
            for (var a = 0; a < allChips.length; a++) {
                allChips[a].classList.remove('active');
            }
            this.classList.add('active');
            BookingState.selectedTime = this.dataset.slotId;
            document.getElementById('selectedTimeDisplay').textContent = this.dataset.time;
            document.getElementById('selectedTimeDisplay').style.color = 'var(--success)';
        };
    }
}

function setupUIHandlers() {
    var chips = document.querySelectorAll('.route-chip');
    for (var i = 0; i < chips.length; i++) {
        chips[i].onclick = async function() {
            var allChips = document.querySelectorAll('.route-chip');
            for (var c = 0; c < allChips.length; c++) {
                allChips[c].classList.remove('active');
            }
            this.classList.add('active');
            BookingState.routeFilter = this.dataset.route;
            BookingState.selectedTime = null;
            document.getElementById('selectedTimeDisplay').textContent = 'None selected';
            document.getElementById('selectedTimeDisplay').style.color = 'var(--gray-400)';
            await loadTimeSlots();
        };
    }

    var dateInput = document.getElementById('tripDate');
    var today = new Date().toISOString().split('T')[0];
    dateInput.setAttribute('min', today);
    dateInput.value = today;

    document.getElementById('seatMinus').onclick = function() {
        if (BookingState.seats > 1) { 
            BookingState.seats--; 
            document.getElementById('seatCount').value = BookingState.seats;
            document.getElementById('passengerCount').textContent = BookingState.seats;
            calculatePrice();
        }
    };
    
    document.getElementById('seatPlus').onclick = function() {
        if (BookingState.seats < 14) { 
            BookingState.seats++; 
            document.getElementById('seatCount').value = BookingState.seats;
            document.getElementById('passengerCount').textContent = BookingState.seats;
            calculatePrice();
        }
    };

    document.getElementById('confirmBookingBtn').onclick = confirmBookingViaWhatsApp;
}

async function confirmBookingViaWhatsApp() {
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

    var user = BookingState.currentUser;
    var { data: profile } = await supabaseClient
        .from('users')
        .select('full_name, phone')
        .eq('id', user.id)
        .single();

    var { data: slotData } = await supabaseClient
        .from('time_slots')
        .select('route, departure_time')
        .eq('id', BookingState.selectedTime)
        .single();

    var date = document.getElementById('tripDate').value;
    var formattedDate = new Date(date).toLocaleDateString('en-ZA', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });

    var totalPrice = BookingState.distance * APP_CONFIG.pricePerKm * BookingState.seats;
    var bookingRef = 'LUU-' + Date.now().toString().slice(-8);

    try {
        var { data: bookingData, error } = await supabaseClient.from('bookings').insert([{
            user_id: user.id,
            trip_id: null,
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
            booking_reference: bookingRef
        }]).select();

        if (error) throw error;

        var message = '🚐 *NEW BOOKING - Luu Travels & Logistics*\n\n';
        message += '📋 *Reference:* ' + bookingRef + '\n';
        message += '👤 *Customer:* ' + (profile?.full_name || 'Unknown') + '\n';
        message += '📱 *Phone:* ' + (profile?.phone || 'Not provided') + '\n';
        message += '📧 *Email:* ' + user.email + '\n\n';
        message += '📍 *Route:* ' + (slotData?.route?.replace('-', ' → ') || 'Unknown') + '\n';
        message += '📅 *Date:* ' + formattedDate + '\n';
        message += '🕐 *Time:* ' + (slotData?.departure_time || 'Unknown') + '\n\n';
        message += '📍 *Pickup:* ' + BookingState.pickupAddress + '\n';
        message += '📍 *Drop-off:* ' + BookingState.dropoffAddress + '\n\n';
        message += '📏 *Distance:* ' + BookingState.distance.toFixed(1) + ' km\n';
        message += '👥 *Passengers:* ' + BookingState.seats + '\n';
        message += '💰 *Total Price:* R' + totalPrice.toFixed(2) + '\n\n';
        message += '📝 *Special Requests:* ' + (document.getElementById('specialRequests').value.trim() || 'None') + '\n\n';
        message += '---\n*Please confirm this booking and arrange transport.*';

        var encodedMessage = encodeURIComponent(message);
        var whatsappUrl = 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodedMessage;

        showToast('Booking saved! Opening WhatsApp...', 'success');
        
        // Open WhatsApp in new tab/window - works on both desktop and mobile
        window.open(whatsappUrl, '_blank');
        
        // Redirect to dashboard after a short delay
        setTimeout(function() {
            window.location.href = 'dashboard.html';
        }, 1500);

    } catch (err) {
        showToast(err.message || 'Could not save booking. Please try again.', 'error');
    }
}
