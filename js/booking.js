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
    dropoffCoords: null,
    bookingType: 'passenger',
    promoCode: null,
    promoDiscount: 0,
    bookingRef: null,
    bookingId: null,
    map: null,
    pickupMarker: null,
    dropoffMarker: null,
    directionRenderer: null,
    autocompletePickup: null,
    autocompleteDropoff: null
};

var WHATSAPP_NUMBER = '27768457061';
var googleMapsLoaded = false;

document.addEventListener('DOMContentLoaded', async function() {
    var user = await AuthManager.requireAuth('login.html');
    if (!user) return;
    BookingState.currentUser = user;

    setupUIHandlers();
    setupMobileMenu();
    setupLogout();
    setupBookingTypeButtons();
    setupPromoHandler();
    await loadTimeSlots();
});

/* =====================================================================
   LOGOUT
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

/* =====================================================================
   GOOGLE MAPS INITIALIZATION
   ===================================================================== */
function initMap() {
    googleMapsLoaded = true;
    
    // Default center: Gauteng, South Africa
    var defaultCenter = { lat: -26.2041, lng: 28.0473 };
    
    BookingState.map = new google.maps.Map(document.getElementById('google-map'), {
        center: defaultCenter,
        zoom: 7,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        zoomControl: true,
        styles: [
            {
                featureType: 'poi',
                elementType: 'labels',
                stylers: [{ visibility: 'off' }]
            }
        ]
    });

    // Setup autocomplete for pickup
    var pickupInput = document.getElementById('pickupSearch');
    BookingState.autocompletePickup = new google.maps.places.Autocomplete(pickupInput, {
        types: ['address'],
        componentRestrictions: { country: 'za' },
        fields: ['place_id', 'formatted_address', 'geometry', 'name']
    });
    BookingState.autocompletePickup.addListener('place_changed', function() {
        onPlaceSelected('pickup');
    });

    // Setup autocomplete for dropoff
    var dropoffInput = document.getElementById('dropoffSearch');
    BookingState.autocompleteDropoff = new google.maps.places.Autocomplete(dropoffInput, {
        types: ['address'],
        componentRestrictions: { country: 'za' },
        fields: ['place_id', 'formatted_address', 'geometry', 'name']
    });
    BookingState.autocompleteDropoff.addListener('place_changed', function() {
        onPlaceSelected('dropoff');
    });

    // Setup current location button
    document.getElementById('useCurrentLocationBtn').onclick = function() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(function(position) {
                var pos = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                BookingState.map.setCenter(pos);
                BookingState.map.setZoom(15);
                
                // Reverse geocode to get address
                var geocoder = new google.maps.Geocoder();
                geocoder.geocode({ location: pos }, function(results, status) {
                    if (status === 'OK' && results[0]) {
                        document.getElementById('pickupSearch').value = results[0].formatted_address;
                        setLocation('pickup', pos, results[0].formatted_address);
                    } else {
                        setLocation('pickup', pos, 'Current Location');
                    }
                });
            }, function() {
                showToast('Could not get your location. Please allow location access.', 'error');
            });
        } else {
            showToast('Geolocation is not supported by your browser.', 'error');
        }
    };

    // Handle enter key on inputs
    pickupInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            var place = BookingState.autocompletePickup.getPlace();
            if (place && place.geometry) {
                onPlaceSelected('pickup');
            }
        }
    });
    
    dropoffInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            var place = BookingState.autocompleteDropoff.getPlace();
            if (place && place.geometry) {
                onPlaceSelected('dropoff');
            }
        }
    });

    // Clear button
    document.getElementById('clearMapBtn').onclick = function() {
        clearAllLocations();
    };

    // Click on map to set location
    BookingState.map.addListener('click', function(e) {
        var lat = e.latLng.lat();
        var lng = e.latLng.lng();
        var pos = { lat: lat, lng: lng };
        
        var geocoder = new google.maps.Geocoder();
        geocoder.geocode({ location: pos }, function(results, status) {
            var address = (status === 'OK' && results[0]) ? results[0].formatted_address : 'Selected Location';
            
            if (!BookingState.pickupMarker || (BookingState.pickupMarker && BookingState.dropoffMarker)) {
                setLocation('pickup', pos, address);
            } else if (BookingState.pickupMarker && !BookingState.dropoffMarker) {
                setLocation('dropoff', pos, address);
            } else {
                clearAllLocations();
                setLocation('pickup', pos, address);
            }
        });
    });
}

function onPlaceSelected(type) {
    var autocomplete = type === 'pickup' ? BookingState.autocompletePickup : BookingState.autocompleteDropoff;
    var place = autocomplete.getPlace();
    
    if (!place || !place.geometry) {
        showToast('Please select an address from the suggestions.', 'error');
        return;
    }
    
    var lat = place.geometry.location.lat();
    var lng = place.geometry.location.lng();
    var address = place.formatted_address || place.name || 'Selected Location';
    
    setLocation(type, { lat: lat, lng: lng }, address);
}

function setLocation(type, coords, address) {
    var lat = coords.lat;
    var lng = coords.lng;
    var pos = new google.maps.LatLng(lat, lng);
    
    if (type === 'pickup') {
        if (BookingState.pickupMarker) {
            BookingState.pickupMarker.setPosition(pos);
        } else {
            BookingState.pickupMarker = new google.maps.Marker({
                position: pos,
                map: BookingState.map,
                label: { text: 'P', color: 'white', fontWeight: 'bold' },
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    fillColor: '#28A745',
                    fillOpacity: 1,
                    strokeColor: '#fff',
                    strokeWeight: 2,
                    scale: 12
                },
                title: 'Pickup Location'
            });
        }
        BookingState.pickupCoords = { lat: lat, lng: lng };
        BookingState.pickupAddress = address;
        document.getElementById('pickupSearch').value = address;
    } else {
        if (BookingState.dropoffMarker) {
            BookingState.dropoffMarker.setPosition(pos);
        } else {
            BookingState.dropoffMarker = new google.maps.Marker({
                position: pos,
                map: BookingState.map,
                label: { text: 'D', color: 'white', fontWeight: 'bold' },
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    fillColor: '#DC3545',
                    fillOpacity: 1,
                    strokeColor: '#fff',
                    strokeWeight: 2,
                    scale: 12
                },
                title: 'Drop-off Location'
            });
        }
        BookingState.dropoffCoords = { lat: lat, lng: lng };
        BookingState.dropoffAddress = address;
        document.getElementById('dropoffSearch').value = address;
    }
    
    // Fit bounds to show both markers
    var bounds = new google.maps.LatLngBounds();
    if (BookingState.pickupMarker) bounds.extend(BookingState.pickupMarker.getPosition());
    if (BookingState.dropoffMarker) bounds.extend(BookingState.dropoffMarker.getPosition());
    
    if (BookingState.pickupMarker && BookingState.dropoffMarker) {
        BookingState.map.fitBounds(bounds, { padding: 50 });
        calculatePrice();
    } else if (BookingState.pickupMarker) {
        BookingState.map.setCenter(BookingState.pickupMarker.getPosition());
        BookingState.map.setZoom(12);
    }
}

function clearAllLocations() {
    if (BookingState.pickupMarker) {
        BookingState.pickupMarker.setMap(null);
        BookingState.pickupMarker = null;
    }
    if (BookingState.dropoffMarker) {
        BookingState.dropoffMarker.setMap(null);
        BookingState.dropoffMarker = null;
    }
    if (BookingState.directionRenderer) {
        BookingState.directionRenderer.setMap(null);
        BookingState.directionRenderer = null;
    }
    BookingState.pickupCoords = null;
    BookingState.dropoffCoords = null;
    BookingState.pickupAddress = null;
    BookingState.dropoffAddress = null;
    BookingState.distance = 0;
    
    document.getElementById('pickupSearch').value = '';
    document.getElementById('dropoffSearch').value = '';
    document.getElementById('distanceValue').textContent = '— km';
    document.getElementById('estimatedPriceValue').textContent = 'R0.00';
    document.getElementById('distanceDisplay').textContent = '— km';
    document.getElementById('totalPrice').textContent = 'R0.00';
    document.getElementById('discountRow').style.display = 'none';
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
    updatePriceSummary();
    
    document.getElementById('distanceValue').textContent = distance.toFixed(1) + ' km';
    
    // Draw route on map
    drawRoute();
}

function drawRoute() {
    if (!BookingState.pickupCoords || !BookingState.dropoffCoords) return;
    
    if (BookingState.directionRenderer) {
        BookingState.directionRenderer.setMap(null);
    }
    
    BookingState.directionRenderer = new google.maps.DirectionsRenderer({
        suppressMarkers: true,
        polylineOptions: {
            strokeColor: '#F5A623',
            strokeWeight: 4,
            strokeOpacity: 0.8
        }
    });
    BookingState.directionRenderer.setMap(BookingState.map);
    
    var request = {
        origin: new google.maps.LatLng(BookingState.pickupCoords.lat, BookingState.pickupCoords.lng),
        destination: new google.maps.LatLng(BookingState.dropoffCoords.lat, BookingState.dropoffCoords.lng),
        travelMode: google.maps.TravelMode.DRIVING
    };
    
    var directionsService = new google.maps.DirectionsService();
    directionsService.route(request, function(response, status) {
        if (status === 'OK') {
            BookingState.directionRenderer.setDirections(response);
            
            // Get actual driving distance
            if (response.routes[0] && response.routes[0].legs[0]) {
                var drivingDistance = response.routes[0].legs[0].distance.value / 1000;
                BookingState.distance = drivingDistance;
                updatePriceSummary();
                document.getElementById('distanceValue').textContent = drivingDistance.toFixed(1) + ' km';
            }
        }
    });
}

/* =====================================================================
   BOOKING TYPE BUTTONS
   ===================================================================== */
function setupBookingTypeButtons() {
    var btns = document.querySelectorAll('.booking-type-btn');
    for (var i = 0; i < btns.length; i++) {
        btns[i].onclick = function() {
            var allBtns = document.querySelectorAll('.booking-type-btn');
            for (var b = 0; b < allBtns.length; b++) {
                allBtns[b].style.background = 'var(--secondary)';
                allBtns[b].style.color = 'var(--gray-600)';
            }
            this.style.background = 'var(--primary)';
            this.style.color = 'var(--secondary)';
            
            BookingState.bookingType = this.dataset.type;
            
            if (BookingState.bookingType === 'quote') {
                document.getElementById('specialRequestsGroup').style.display = 'block';
                document.getElementById('specialRequests').placeholder = 'Describe your parcel or special request for a quote...';
                document.getElementById('payWithCardBtn').style.display = 'none';
                document.getElementById('payWithWhatsAppBtn').textContent = '📱 Get Quote via WhatsApp';
                document.getElementById('payWithWhatsAppBtn').style.background = '#25D366';
            } else if (BookingState.bookingType === 'parcel') {
                document.getElementById('specialRequestsGroup').style.display = 'block';
                document.getElementById('specialRequests').placeholder = 'Parcel details: size, weight, contents...';
                document.getElementById('payWithCardBtn').style.display = 'none';
                document.getElementById('payWithWhatsAppBtn').textContent = '📱 Book via WhatsApp';
                document.getElementById('payWithWhatsAppBtn').style.background = '#25D366';
            } else {
                document.getElementById('specialRequestsGroup').style.display = 'block';
                document.getElementById('specialRequests').placeholder = 'e.g. extra luggage, wheelchair access...';
                document.getElementById('payWithCardBtn').style.display = 'block';
                document.getElementById('payWithWhatsAppBtn').textContent = '📱 Book via WhatsApp';
                document.getElementById('payWithWhatsAppBtn').style.background = '#25D366';
            }
        };
    }
}

/* =====================================================================
   PROMO CODE HANDLER
   ===================================================================== */
function setupPromoHandler() {
    document.getElementById('applyPromoBtn').onclick = async function() {
        var code = document.getElementById('promoCode').value.trim().toUpperCase();
        if (!code) {
            showToast('Please enter a promo code.', 'error');
            return;
        }

        var { data, error } = await supabaseClient
            .from('promo_codes')
            .select('*')
            .eq('code', code)
            .eq('is_active', true)
            .maybeSingle();

        if (error) {
            document.getElementById('promoMessage').innerHTML = '<span style="color:var(--danger);">❌ Error checking promo code.</span>';
            return;
        }

        if (!data) {
            document.getElementById('promoMessage').innerHTML = '<span style="color:var(--danger);">❌ Invalid or expired promo code.</span>';
            return;
        }

        if (data.expires_at && new Date(data.expires_at) < new Date()) {
            document.getElementById('promoMessage').innerHTML = '<span style="color:var(--danger);">❌ This promo code has expired.</span>';
            return;
        }

        var { data: usedCheck, error: usedError } = await supabaseClient
            .from('bookings')
            .select('id')
            .eq('user_id', BookingState.currentUser.id)
            .eq('promo_code_id', data.id)
            .limit(1);

        if (usedCheck && usedCheck.length > 0) {
            document.getElementById('promoMessage').innerHTML = '<span style="color:var(--danger);">❌ You have already used this promo code.</span>';
            return;
        }

        BookingState.promoCode = data;
        BookingState.promoDiscount = data.discount_percent || 0;
        
        document.getElementById('promoMessage').innerHTML = '<span style="color:var(--success);">✅ Promo code applied! ' + data.discount_percent + '% off.</span>';
        updatePriceSummary();
    };
}

function updatePriceSummary() {
    var basePrice = BookingState.distance * APP_CONFIG.pricePerKm * BookingState.seats;
    var discount = BookingState.promoDiscount / 100 * basePrice;
    var total = basePrice - discount;
    
    document.getElementById('estimatedPriceValue').textContent = formatCurrency(total);
    document.getElementById('distanceDisplay').textContent = BookingState.distance.toFixed(1) + ' km';
    document.getElementById('passengerCount').textContent = BookingState.seats;
    document.getElementById('totalPrice').textContent = formatCurrency(total);
    
    if (discount > 0) {
        document.getElementById('discountRow').style.display = 'flex';
        document.getElementById('discountDisplay').textContent = '- ' + formatCurrency(discount);
    } else {
        document.getElementById('discountRow').style.display = 'none';
    }
}

/* =====================================================================
   TIME SLOTS
   ===================================================================== */
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

/* =====================================================================
   UI HANDLERS
   ===================================================================== */
function setupUIHandlers() {
    // Route filter
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

    // Date picker
    var dateInput = document.getElementById('tripDate');
    var today = new Date().toISOString().split('T')[0];
    dateInput.setAttribute('min', today);
    dateInput.value = today;

    // Seat controls
    document.getElementById('seatMinus').onclick = function() {
        if (BookingState.seats > 1) { 
            BookingState.seats--; 
            document.getElementById('seatCount').value = BookingState.seats;
            document.getElementById('passengerCount').textContent = BookingState.seats;
            updatePriceSummary();
        }
    };
    
    document.getElementById('seatPlus').onclick = function() {
        if (BookingState.seats < APP_CONFIG.maxSeats) { 
            BookingState.seats++; 
            document.getElementById('seatCount').value = BookingState.seats;
            document.getElementById('passengerCount').textContent = BookingState.seats;
            updatePriceSummary();
        }
    };

    // Payment buttons
    document.getElementById('payWithCardBtn').onclick = initiatePaystackPayment;
    document.getElementById('payWithWhatsAppBtn').onclick = confirmBookingViaWhatsApp;
}

/* =====================================================================
   PAYSTACK PAYMENT
   ===================================================================== */
async function initiatePaystackPayment() {
    if (!validateBooking()) return;

    var user = BookingState.currentUser;
    var { data: profile, error: profileError } = await supabaseClient
        .from('users')
        .select('full_name, phone, email')
        .eq('id', user.id)
        .maybeSingle();

    if (profileError || !profile) {
        showToast('Could not find user profile.', 'error');
        return;
    }

    var basePrice = BookingState.distance * APP_CONFIG.pricePerKm * BookingState.seats;
    var discount = BookingState.promoDiscount / 100 * basePrice;
    var total = basePrice - discount;

    var handler = PaystackPop.setup({
        key: APP_CONFIG.paystackPublicKey,
        email: user.email,
        amount: Math.round(total * 100),
        currency: 'ZAR',
        ref: 'LUU-' + Date.now().toString().slice(-8),
        metadata: {
            custom_fields: [
                { display_name: "Customer Name", value: profile.full_name },
                { display_name: "Phone", value: profile.phone },
                { display_name: "Pickup", value: BookingState.pickupAddress },
                { display_name: "Dropoff", value: BookingState.dropoffAddress },
                { display_name: "Passengers", value: BookingState.seats },
                { display_name: "Distance", value: BookingState.distance.toFixed(1) + ' km' }
            ]
        },
        callback: function(response) {
            handlePaymentSuccess(response, total);
        },
        onClose: function() {
            showToast('Payment cancelled.', 'info');
        }
    });

    handler.openIframe();
}

async function handlePaymentSuccess(response, totalAmount) {
    try {
        var user = BookingState.currentUser;
        var { data: profile, error: profileError } = await supabaseClient
            .from('users')
            .select('full_name, phone, email')
            .eq('id', user.id)
            .maybeSingle();

        var { data: slotData, error: slotError } = await supabaseClient
            .from('time_slots')
            .select('route, departure_time')
            .eq('id', BookingState.selectedTime)
            .maybeSingle();

        var date = document.getElementById('tripDate').value;
        var formattedDate = new Date(date).toLocaleDateString('en-ZA', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });

        var bookingRef = 'LUU-' + Date.now().toString().slice(-8);

        var { data: bookingData, error } = await supabaseClient.from('bookings').insert([{
            user_id: user.id,
            trip_id: null,
            number_of_seats: BookingState.seats,
            total_price: totalAmount,
            payment_method: 'card',
            payment_status: 'paid',
            booking_status: 'confirmed',
            pickup_location: BookingState.pickupAddress,
            dropoff_location: BookingState.dropoffAddress,
            pickup_coordinates: BookingState.pickupCoords,
            dropoff_coordinates: BookingState.dropoffCoords,
            special_requests: document.getElementById('specialRequests').value.trim() || null,
            booking_reference: bookingRef,
            promo_code_id: BookingState.promoCode ? BookingState.promoCode.id : null,
            booking_type: BookingState.bookingType,
            paystack_reference: response.reference
        }]).select();

        if (error) throw error;

        var message = '💰 *PAYMENT SUCCESSFUL - Luu Travels & Logistics*\n\n';
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
        message += '💰 *Amount Paid:* R' + totalAmount.toFixed(2) + '\n';
        message += '💳 *Payment Method:* Card (Paystack)\n';
        message += '📝 *Reference:* ' + response.reference + '\n\n';
        message += '📝 *Special Requests:* ' + (document.getElementById('specialRequests').value.trim() || 'None') + '\n\n';
        message += '✅ *Payment Confirmed! Trip is now confirmed.*\n';
        message += '---\n*Please arrange transport for this booking.*';

        var encodedMessage = encodeURIComponent(message);
        var whatsappUrl = 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodedMessage;

        showToast('Payment successful! Opening WhatsApp...', 'success');
        
        setTimeout(function() {
            window.location.href = whatsappUrl;
        }, 500);

    } catch (err) {
        showToast(err.message || 'Could not save booking after payment. Please contact support.', 'error');
    }
}

/* =====================================================================
   WHATSAPP BOOKING
   ===================================================================== */
async function confirmBookingViaWhatsApp() {
    if (!validateBooking()) return;

    var user = BookingState.currentUser;
    var { data: profile, error: profileError } = await supabaseClient
        .from('users')
        .select('full_name, phone, email')
        .eq('id', user.id)
        .maybeSingle();

    var { data: slotData, error: slotError } = await supabaseClient
        .from('time_slots')
        .select('route, departure_time')
        .eq('id', BookingState.selectedTime)
        .maybeSingle();

    var date = document.getElementById('tripDate').value;
    var formattedDate = new Date(date).toLocaleDateString('en-ZA', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });

    var basePrice = BookingState.distance * APP_CONFIG.pricePerKm * BookingState.seats;
    var discount = BookingState.promoDiscount / 100 * basePrice;
    var total = basePrice - discount;
    var bookingRef = 'LUU-' + Date.now().toString().slice(-8);

    try {
        var { data: bookingData, error } = await supabaseClient.from('bookings').insert([{
            user_id: user.id,
            trip_id: null,
            number_of_seats: BookingState.seats,
            total_price: total,
            payment_method: BookingState.bookingType === 'quote' ? 'quote' : 'cash',
            payment_status: BookingState.bookingType === 'quote' ? 'pending' : 'pending',
            booking_status: BookingState.bookingType === 'quote' ? 'quote' : 'pending',
            pickup_location: BookingState.pickupAddress,
            dropoff_location: BookingState.dropoffAddress,
            pickup_coordinates: BookingState.pickupCoords,
            dropoff_coordinates: BookingState.dropoffCoords,
            special_requests: document.getElementById('specialRequests').value.trim() || null,
            booking_reference: bookingRef,
            promo_code_id: BookingState.promoCode ? BookingState.promoCode.id : null,
            booking_type: BookingState.bookingType
        }]).select();

        if (error) throw error;

        var message = '';
        if (BookingState.bookingType === 'quote') {
            message = '💰 *QUOTE REQUEST - Luu Travels & Logistics*\n\n';
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
            message += '📝 *Special Requests:* ' + (document.getElementById('specialRequests').value.trim() || 'None') + '\n\n';
            message += '---\n*Please provide a quote for this request.*';
        } else {
            message = '🚐 *NEW BOOKING - Luu Travels & Logistics*\n\n';
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
            message += '💰 *Total Price:* R' + total.toFixed(2) + '\n';
            if (BookingState.promoCode) {
                message += '🎫 *Promo Applied:* ' + BookingState.promoCode.code + ' (' + BookingState.promoDiscount + '% off)\n';
            }
            message += '📝 *Special Requests:* ' + (document.getElementById('specialRequests').value.trim() || 'None') + '\n\n';
            message += '---\n*Please confirm this booking and arrange transport.*';
        }

        var encodedMessage = encodeURIComponent(message);
        var whatsappUrl = 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodedMessage;

        showToast('Booking saved! Opening WhatsApp...', 'success');
        
        setTimeout(function() {
            window.location.href = whatsappUrl;
        }, 500);

    } catch (err) {
        showToast(err.message || 'Could not save booking. Please try again.', 'error');
    }
}

/* =====================================================================
   VALIDATION
   ===================================================================== */
function validateBooking() {
    if (!BookingState.selectedTime) {
        showToast('Please select a departure time.', 'error');
        return false;
    }
    
    if (!BookingState.pickupAddress || !BookingState.dropoffAddress) {
        showToast('Please set both pickup and drop-off locations on the map.', 'error');
        return false;
    }

    if (BookingState.distance === 0) {
        showToast('Please set both pickup and drop-off locations to calculate distance.', 'error');
        return false;
    }

    if (BookingState.bookingType === 'quote') {
        var specialRequests = document.getElementById('specialRequests').value.trim();
        if (!specialRequests) {
            showToast('Please describe your parcel or request for a quote.', 'error');
            return false;
        }
    }

    return true;
}

// Make initMap globally accessible for Google Maps callback
window.initMap = initMap;
