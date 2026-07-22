/* =====================================================================
   LUU TRAVELS & LOGISTICS - BOOKING MANAGER
   ===================================================================== */

var BookingState = {
    currentUser: null,
    routeFilter: 'all',
    seats: 1,
    distance: 0,
    duration: 0,
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
    routeData: null,
    isCalculating: false
};

var WHATSAPP_NUMBER = '27768457061';

document.addEventListener('DOMContentLoaded', async function() {
    var user = await AuthManager.requireAuth('login.html');
    if (!user) return;
    BookingState.currentUser = user;

    MapLibreService.init('booking-map');
    LocationSearch.init('pickupSearch', 'dropoffSearch', 'pickupAutocomplete', 'dropoffAutocomplete');

    setupUIHandlers();
    setupMobileMenu();
    setupLogout();
    setupBookingTypeButtons();
    setupPromoHandler();
    await loadTimeSlots();
    setupLocationEvents();
});

/* =====================================================================
   LOCATION EVENTS
   ===================================================================== */
function setupLocationEvents() {
    document.addEventListener('pickupSelected', function(e) {
        var detail = e.detail;
        BookingState.pickupCoords = { lat: detail.lat, lng: detail.lng };
        BookingState.pickupAddress = detail.label;
        calculateRoute();
    });

    document.addEventListener('dropoffSelected', function(e) {
        var detail = e.detail;
        BookingState.dropoffCoords = { lat: detail.lat, lng: detail.lng };
        BookingState.dropoffAddress = detail.label;
        calculateRoute();
    });

    document.addEventListener('locationsReady', function(e) {
        var detail = e.detail;
        BookingState.pickupCoords = detail.pickup;
        BookingState.dropoffCoords = detail.dropoff;
        calculateRoute();
    });

    document.addEventListener('pickupDragged', function(e) {
        var detail = e.detail;
        BookingState.pickupCoords = { lat: detail.lat, lng: detail.lng };
        MapLibreService.reverseGeocode(detail.lng, detail.lat)
            .then(function(address) {
                BookingState.pickupAddress = address;
                LocationSearch.pickupInput.value = address;
                calculateRoute();
            })
            .catch(function() {
                BookingState.pickupAddress = 'Selected Location';
                calculateRoute();
            });
    });

    document.addEventListener('dropoffDragged', function(e) {
        var detail = e.detail;
        BookingState.dropoffCoords = { lat: detail.lat, lng: detail.lng };
        MapLibreService.reverseGeocode(detail.lng, detail.lat)
            .then(function(address) {
                BookingState.dropoffAddress = address;
                LocationSearch.dropoffInput.value = address;
                calculateRoute();
            })
            .catch(function() {
                BookingState.dropoffAddress = 'Selected Location';
                calculateRoute();
            });
    });

    document.getElementById('useCurrentLocationBtn').addEventListener('click', function() {
        LocationSearch.useCurrentLocation();
    });

    document.getElementById('clearMapBtn').addEventListener('click', function() {
        LocationSearch.clear();
        BookingState.pickupCoords = null;
        BookingState.dropoffCoords = null;
        BookingState.pickupAddress = null;
        BookingState.dropoffAddress = null;
        BookingState.distance = 0;
        BookingState.duration = 0;
        BookingState.routeData = null;
        document.getElementById('distanceValue').textContent = '— km';
        document.getElementById('timeValue').textContent = '—';
        document.getElementById('estimatedPriceValue').textContent = 'R0.00';
        document.getElementById('distanceDisplay').textContent = '— km';
        document.getElementById('totalPrice').textContent = 'R0.00';
        document.getElementById('discountRow').style.display = 'none';
        MapLibreService.clearRoute();
    });
}

/* =====================================================================
   ROUTE CALCULATION
   ===================================================================== */
function calculateRoute() {
    if (!BookingState.pickupCoords || !BookingState.dropoffCoords) return;
    if (BookingState.isCalculating) return;

    BookingState.isCalculating = true;

    var pickup = BookingState.pickupCoords;
    var dropoff = BookingState.dropoffCoords;

    MapLibreService.getRoute(pickup.lng, pickup.lat, dropoff.lng, dropoff.lat)
        .then(function(result) {
            BookingState.isCalculating = false;
            BookingState.routeData = result;

            BookingState.distance = result.distance;
            BookingState.duration = result.duration;

            MapLibreService.drawRoute(result.route);

            document.getElementById('distanceValue').textContent = result.distance.toFixed(1) + ' km';
            document.getElementById('timeValue').textContent = result.durationFormatted;
            document.getElementById('distanceDisplay').textContent = result.distance.toFixed(1) + ' km';

            var basePrice = result.distance * APP_CONFIG.pricePerKm * BookingState.seats;
            var discount = BookingState.promoDiscount / 100 * basePrice;
            var total = basePrice - discount;

            document.getElementById('estimatedPriceValue').textContent = formatCurrency(total);
            document.getElementById('totalPrice').textContent = formatCurrency(total);

            if (discount > 0) {
                document.getElementById('discountRow').style.display = 'flex';
                document.getElementById('discountDisplay').textContent = '- ' + formatCurrency(discount);
            } else {
                document.getElementById('discountRow').style.display = 'none';
            }
        })
        .catch(function(err) {
            BookingState.isCalculating = false;
            console.error('Route calculation error:', err);
            showToast('Could not calculate route. Please try again.', 'error');

            var distance = calculateDistanceKm(
                pickup.lat, pickup.lng,
                dropoff.lat, dropoff.lng
            );
            BookingState.distance = distance;
            document.getElementById('distanceValue').textContent = distance.toFixed(1) + ' km';
            document.getElementById('distanceDisplay').textContent = distance.toFixed(1) + ' km';

            var basePrice = distance * APP_CONFIG.pricePerKm * BookingState.seats;
            var discount = BookingState.promoDiscount / 100 * basePrice;
            var total = basePrice - discount;

            document.getElementById('estimatedPriceValue').textContent = formatCurrency(total);
            document.getElementById('totalPrice').textContent = formatCurrency(total);
        });
}

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

        MapLibreService.destroy();

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
   BOOKING TYPE BUTTONS
   ===================================================================== */
function setupBookingTypeButtons() {
    var btns = document.querySelectorAll('.booking-type-btn');
    for (var i = 0; i < btns.length; i++) {
        btns[i].onclick = function() {
            var allBtns = document.querySelectorAll('.booking-type-btn');
            for (var b = 0; b < allBtns.length; b++) {
                allBtns[b].classList.remove('active');
                allBtns[b].style.background = 'var(--secondary)';
                allBtns[b].style.color = 'var(--gray-600)';
            }
            this.classList.add('active');
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
                { display_name: "Distance", value: BookingState.distance.toFixed(1) + ' km' },
                { display_name: "Duration", value: BookingState.duration > 0 ? Math.round(BookingState.duration / 60) + ' min' : 'N/A' }
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
            paystack_reference: response.reference,
            distance: BookingState.distance,
            duration: BookingState.duration
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
        if (BookingState.duration > 0) {
            message += '⏱️ *Est. Time:* ' + Math.round(BookingState.duration / 60) + ' min\n';
        }
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
            booking_type: BookingState.bookingType,
            distance: BookingState.distance,
            duration: BookingState.duration
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
            if (BookingState.duration > 0) {
                message += '⏱️ *Est. Time:* ' + Math.round(BookingState.duration / 60) + ' min\n';
            }
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
            if (BookingState.duration > 0) {
                message += '⏱️ *Est. Time:* ' + Math.round(BookingState.duration / 60) + ' min\n';
            }
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
        showToast('Please set both pickup and drop-off locations.', 'error');
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
