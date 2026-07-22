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
    routeLine: null,
    pickupAutocompleteTimeout: null,
    dropoffAutocompleteTimeout: null,
    geocoderAbortController: null
};

var WHATSAPP_NUMBER = '27768457061';
var NOMINATIM_URL = 'https://nominatim.openstreetmap.org';

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
    initMap();
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
   MAP INITIALIZATION - MapLibre GL
   ===================================================================== */
function initMap() {
    // Free tile source that works in South Africa
    var map = new maplibregl.Map({
        container: 'booking-map',
        style: {
            version: 8,
            sources: {
                osm: {
                    type: 'raster',
                    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
                    tileSize: 256,
                    attribution: '© OpenStreetMap Contributors'
                }
            },
            layers: [{
                id: 'osm',
                type: 'raster',
                source: 'osm'
            }]
        },
        center: [28.0473, -26.2041],
        zoom: 7,
        attributionControl: true
    });

    BookingState.map = map;

    // Add zoom controls
    map.addControl(new maplibregl.NavigationControl(), 'bottom-right');

    // Add scale control
    map.addControl(new maplibregl.ScaleControl({
        maxWidth: 100,
        unit: 'metric'
    }), 'bottom-left');

    // Wait for map to load
    map.on('load', function() {
        // Map is ready
    });

    // Click on map to set location
    map.on('click', function(e) {
        var lng = e.lngLat.lng;
        var lat = e.lngLat.lat;
        var coords = { lat: lat, lng: lng };
        
        // Reverse geocode
        reverseGeocode(lat, lng, function(address) {
            if (!BookingState.pickupMarker || (BookingState.pickupMarker && BookingState.dropoffMarker)) {
                setLocation('pickup', coords, address || 'Selected Location');
            } else if (BookingState.pickupMarker && !BookingState.dropoffMarker) {
                setLocation('dropoff', coords, address || 'Selected Location');
            } else {
                clearAllLocations();
                setLocation('pickup', coords, address || 'Selected Location');
            }
        });
    });

    // Setup autocomplete for pickup
    setupAutocomplete('pickup');
    setupAutocomplete('dropoff');

    // Setup Find buttons
    document.getElementById('pickupFindBtn').onclick = function() {
        findAddress('pickup');
    };
    document.getElementById('dropoffFindBtn').onclick = function() {
        findAddress('dropoff');
    };

    // Enter key support
    document.getElementById('pickupSearch').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            findAddress('pickup');
        }
    });
    document.getElementById('dropoffSearch').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            findAddress('dropoff');
        }
    });

    // Clear button
    document.getElementById('clearMapBtn').onclick = function() {
        clearAllLocations();
    };

    // Current location button
    document.getElementById('useCurrentLocationBtn').onclick = function() {
        useCurrentLocation();
    };
}

/* =====================================================================
   ADDRESS AUTOCOMPLETE WITH PREDICTION
   ===================================================================== */
function setupAutocomplete(type) {
    var inputId = type === 'pickup' ? 'pickupSearch' : 'dropoffSearch';
    var resultsId = type === 'pickup' ? 'pickupAutocomplete' : 'dropoffAutocomplete';
    var input = document.getElementById(inputId);
    var resultsContainer = document.getElementById(resultsId);
    var timeoutKey = type === 'pickup' ? 'pickupAutocompleteTimeout' : 'dropoffAutocompleteTimeout';

    input.addEventListener('input', function() {
        var query = this.value.trim();
        clearTimeout(BookingState[timeoutKey]);

        if (query.length < 2) {
            resultsContainer.classList.remove('active');
            resultsContainer.innerHTML = '';
            return;
        }

        BookingState[timeoutKey] = setTimeout(function() {
            searchAddress(query, type);
        }, 300);
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', function(e) {
        if (!resultsContainer.contains(e.target) && e.target !== input) {
            resultsContainer.classList.remove('active');
        }
    });
}

function searchAddress(query, type) {
    var resultsId = type === 'pickup' ? 'pickupAutocomplete' : 'dropoffAutocomplete';
    var resultsContainer = document.getElementById(resultsId);
    var inputId = type === 'pickup' ? 'pickupSearch' : 'dropoffSearch';
    var input = document.getElementById(inputId);

    // Show loading
    resultsContainer.innerHTML = '<div class="searching-indicator">🔍 Searching...</div>';
    resultsContainer.classList.add('active');

    // Use Nominatim with South Africa bias
    var url = NOMINATIM_URL + '/search?format=json&q=' + encodeURIComponent(query + ', South Africa') + '&countrycodes=za&limit=8&addressdetails=1&bounded=1&viewbox=16.5,-33.5,33.5,-22.5';

    fetch(url)
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (!data || data.length === 0) {
                resultsContainer.innerHTML = '<div class="searching-indicator">No results found. Try a different address.</div>';
                return;
            }

            var html = '';
            for (var i = 0; i < data.length; i++) {
                var result = data[i];
                var displayName = result.display_name;
                // Highlight the matched part
                var mainText = result.name || displayName.split(',')[0] || 'Unknown';
                var subText = displayName.replace(mainText, '').trim().replace(/^,/, '').trim() || 'South Africa';
                
                // Add type indicator
                var typeLabel = '';
                if (result.type === 'city') typeLabel = '🏙️';
                else if (result.type === 'town') typeLabel = '🏘️';
                else if (result.type === 'village') typeLabel = '🏘️';
                else if (result.type === 'suburb') typeLabel = '🏠';
                else if (result.type === 'road') typeLabel = '🛣️';
                else if (result.type === 'house') typeLabel = '🏠';
                else if (result.type === 'building') typeLabel = '🏢';
                else typeLabel = '📍';

                html += '<div class="autocomplete-item" data-lat="' + result.lat + '" data-lng="' + result.lon + '" data-address="' + displayName.replace(/"/g, '&quot;') + '">';
                html += '<span class="main-text">' + typeLabel + ' ' + mainText + '</span>';
                html += '<span class="sub-text">' + subText + '</span>';
                html += '</div>';
            }

            resultsContainer.innerHTML = html;

            // Add click handlers
            var items = resultsContainer.querySelectorAll('.autocomplete-item');
            for (var j = 0; j < items.length; j++) {
                items[j].addEventListener('click', function() {
                    var lat = parseFloat(this.dataset.lat);
                    var lng = parseFloat(this.dataset.lng);
                    var address = this.dataset.address;
                    var coords = { lat: lat, lng: lng };

                    // Set the input value
                    input.value = address;

                    // Set the location
                    setLocation(type, coords, address);

                    // Clear results
                    resultsContainer.classList.remove('active');
                    resultsContainer.innerHTML = '';

                    // Pan to location
                    BookingState.map.flyTo({
                        center: [lng, lat],
                        zoom: 13,
                        duration: 1000
                    });
                });
            }
        })
        .catch(function() {
            resultsContainer.innerHTML = '<div class="searching-indicator">Error searching. Please try again.</div>';
        });
}

function findAddress(type) {
    var inputId = type === 'pickup' ? 'pickupSearch' : 'dropoffSearch';
    var input = document.getElementById(inputId);
    var query = input.value.trim();

    if (!query) {
        showToast('Please type an address first.', 'error');
        return;
    }

    // Show loading state
    var btnId = type === 'pickup' ? 'pickupFindBtn' : 'dropoffFindBtn';
    var btn = document.getElementById(btnId);
    btn.textContent = '...';
    btn.disabled = true;

    var url = NOMINATIM_URL + '/search?format=json&q=' + encodeURIComponent(query + ', South Africa') + '&countrycodes=za&limit=1&addressdetails=1';

    fetch(url)
        .then(function(response) { return response.json(); })
        .then(function(data) {
            btn.textContent = 'Find';
            btn.disabled = false;

            if (!data || data.length === 0) {
                showToast('Could not find that address. Please try again.', 'error');
                return;
            }

            var result = data[0];
            var lat = parseFloat(result.lat);
            var lng = parseFloat(result.lon);
            var address = result.display_name || query;
            var coords = { lat: lat, lng: lng };

            setLocation(type, coords, address);
            BookingState.map.flyTo({
                center: [lng, lat],
                zoom: 13,
                duration: 1000
            });
        })
        .catch(function() {
            btn.textContent = 'Find';
            btn.disabled = false;
            showToast('Error finding address. Please try again.', 'error');
        });
}

function reverseGeocode(lat, lng, callback) {
    var url = NOMINATIM_URL + '/reverse?format=json&lat=' + lat + '&lon=' + lng + '&zoom=18&addressdetails=1';

    fetch(url)
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (data && data.display_name) {
                callback(data.display_name);
            } else {
                callback(null);
            }
        })
        .catch(function() {
            callback(null);
        });
}

function useCurrentLocation() {
    if (!navigator.geolocation) {
        showToast('Geolocation is not supported by your browser.', 'error');
        return;
    }

    showToast('Getting your location...', 'info');

    navigator.geolocation.getCurrentPosition(function(position) {
        var lat = position.coords.latitude;
        var lng = position.coords.longitude;
        var coords = { lat: lat, lng: lng };

        reverseGeocode(lat, lng, function(address) {
            setLocation('pickup', coords, address || 'Current Location');
            BookingState.map.flyTo({
                center: [lng, lat],
                zoom: 14,
                duration: 1000
            });
            showToast('Location set successfully!', 'success');
        });
    }, function() {
        showToast('Could not get your location. Please allow location access.', 'error');
    }, {
        enableHighAccuracy: true,
        timeout: 10000
    });
}

/* =====================================================================
   LOCATION FUNCTIONS
   ===================================================================== */
function setLocation(type, coords, address) {
    var lat = coords.lat;
    var lng = coords.lng;
    var map = BookingState.map;

    // Create marker element
    var markerEl = document.createElement('div');
    markerEl.className = 'custom-marker ' + (type === 'pickup' ? 'custom-marker-pickup' : 'custom-marker-dropoff');
    markerEl.innerHTML = '<span>' + (type === 'pickup' ? 'P' : 'D') + '</span>';

    // Create popup content
    var popupContent = '<strong>' + (type === 'pickup' ? 'Pickup' : 'Drop-off') + '</strong><br>' + address;

    if (type === 'pickup') {
        if (BookingState.pickupMarker) {
            BookingState.pickupMarker.remove();
        }
        BookingState.pickupMarker = new maplibregl.Marker({
            element: markerEl,
            draggable: true
        })
        .setLngLat([lng, lat])
        .setPopup(new maplibregl.Popup({ offset: 25 }).setHTML(popupContent))
        .addTo(map);

        // Handle drag
        BookingState.pickupMarker.on('dragend', function() {
            var pos = this.getLngLat();
            var newCoords = { lat: pos.lat, lng: pos.lng };
            reverseGeocode(pos.lat, pos.lng, function(address) {
                var newAddress = address || 'Selected Location';
                BookingState.pickupAddress = newAddress;
                var input = document.getElementById('pickupSearch');
                if (input) input.value = newAddress;
                BookingState.pickupCoords = newCoords;
                calculatePrice();
            });
        });

        BookingState.pickupCoords = { lat: lat, lng: lng };
        BookingState.pickupAddress = address;
        document.getElementById('pickupSearch').value = address;
    } else {
        if (BookingState.dropoffMarker) {
            BookingState.dropoffMarker.remove();
        }
        BookingState.dropoffMarker = new maplibregl.Marker({
            element: markerEl,
            draggable: true
        })
        .setLngLat([lng, lat])
        .setPopup(new maplibregl.Popup({ offset: 25 }).setHTML(popupContent))
        .addTo(map);

        // Handle drag
        BookingState.dropoffMarker.on('dragend', function() {
            var pos = this.getLngLat();
            var newCoords = { lat: pos.lat, lng: pos.lng };
            reverseGeocode(pos.lat, pos.lng, function(address) {
                var newAddress = address || 'Selected Location';
                BookingState.dropoffAddress = newAddress;
                var input = document.getElementById('dropoffSearch');
                if (input) input.value = newAddress;
                BookingState.dropoffCoords = newCoords;
                calculatePrice();
            });
        });

        BookingState.dropoffCoords = { lat: lat, lng: lng };
        BookingState.dropoffAddress = address;
        document.getElementById('dropoffSearch').value = address;
    }

    // Fit bounds to show both markers
    if (BookingState.pickupMarker && BookingState.dropoffMarker) {
        var bounds = new maplibregl.LngLatBounds();
        bounds.extend([BookingState.pickupCoords.lng, BookingState.pickupCoords.lat]);
        bounds.extend([BookingState.dropoffCoords.lng, BookingState.dropoffCoords.lat]);
        map.fitBounds(bounds, { padding: 50, duration: 1000 });
        calculatePrice();
    } else if (BookingState.pickupMarker) {
        map.flyTo({ center: [lng, lat], zoom: 12, duration: 1000 });
    }
}

function clearAllLocations() {
    if (BookingState.pickupMarker) {
        BookingState.pickupMarker.remove();
        BookingState.pickupMarker = null;
    }
    if (BookingState.dropoffMarker) {
        BookingState.dropoffMarker.remove();
        BookingState.dropoffMarker = null;
    }
    if (BookingState.routeLine) {
        BookingState.routeLine.remove();
        BookingState.routeLine = null;
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

    // Clear autocomplete results
    document.getElementById('pickupAutocomplete').classList.remove('active');
    document.getElementById('pickupAutocomplete').innerHTML = '';
    document.getElementById('dropoffAutocomplete').classList.remove('active');
    document.getElementById('dropoffAutocomplete').innerHTML = '';
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

    // Draw route
    drawRoute();
}

function drawRoute() {
    if (!BookingState.pickupCoords || !BookingState.dropoffCoords) return;

    if (BookingState.routeLine) {
        BookingState.routeLine.remove();
        BookingState.routeLine = null;
    }

    var map = BookingState.map;

    // Get route from OSRM (Open Source Routing Machine)
    var url = 'https://router.project-osrm.org/route/v1/driving/' +
        BookingState.pickupCoords.lng + ',' + BookingState.pickupCoords.lat + ';' +
        BookingState.dropoffCoords.lng + ',' + BookingState.dropoffCoords.lat +
        '?overview=full&geometries=geojson';

    fetch(url)
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (data && data.routes && data.routes.length > 0) {
                var route = data.routes[0];
                var geometry = route.geometry;

                // Draw the route
                if (BookingState.routeLine) {
                    BookingState.routeLine.remove();
                }

                BookingState.routeLine = new maplibregl.GeoJSONSource({
                    data: {
                        type: 'Feature',
                        properties: {},
                        geometry: geometry
                    }
                });

                // Add source and layer
                var sourceId = 'route-line-' + Date.now();
                var layerId = 'route-layer-' + Date.now();

                map.addSource(sourceId, {
                    type: 'geojson',
                    data: {
                        type: 'Feature',
                        properties: {},
                        geometry: geometry
                    }
                });

                map.addLayer({
                    id: layerId,
                    type: 'line',
                    source: sourceId,
                    layout: {
                        'line-join': 'round',
                        'line-cap': 'round'
                    },
                    paint: {
                        'line-color': '#F5A623',
                        'line-width': 4,
                        'line-opacity': 0.8
                    }
                });

                // Store layer ID for removal later
                BookingState.routeLayerId = layerId;
                BookingState.routeSourceId = sourceId;
            }
        })
        .catch(function() {
            // Fallback: draw straight line
            if (BookingState.routeLine) {
                BookingState.routeLine.remove();
                BookingState.routeLine = null;
            }

            // Draw a simple line using a GeoJSON source
            var coords = [
                [BookingState.pickupCoords.lng, BookingState.pickupCoords.lat],
                [BookingState.dropoffCoords.lng, BookingState.dropoffCoords.lat]
            ];

            var sourceId = 'route-line-' + Date.now();
            var layerId = 'route-layer-' + Date.now();

            map.addSource(sourceId, {
                type: 'geojson',
                data: {
                    type: 'Feature',
                    properties: {},
                    geometry: {
                        type: 'LineString',
                        coordinates: coords
                    }
                }
            });

            map.addLayer({
                id: layerId,
                type: 'line',
                source: sourceId,
                layout: {
                    'line-join': 'round',
                    'line-cap': 'round'
                },
                paint: {
                    'line-color': '#F5A623',
                    'line-width': 4,
                    'line-opacity': 0.8,
                    'line-dasharray': [8, 6]
                }
            });

            BookingState.routeLayerId = layerId;
            BookingState.routeSourceId = sourceId;
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
