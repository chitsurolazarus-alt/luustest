/* =====================================================================
   LUU TRAVELS & LOGISTICS - LOCATION SEARCH COMPONENT
   ===================================================================== */

var LocationSearch = {
    pickupInput: null,
    dropoffInput: null,
    pickupResults: null,
    dropoffResults: null,
    pickupTimeout: null,
    dropoffTimeout: null,
    pickupSelected: false,
    dropoffSelected: false,
    currentPickupCoords: null,
    currentDropoffCoords: null,
    isSearching: false,
    searchAbortController: null,
    pickupFindBtn: null,
    dropoffFindBtn: null,

    init: function(pickupInputId, dropoffInputId, pickupResultsId, dropoffResultsId) {
        this.pickupInput = document.getElementById(pickupInputId);
        this.dropoffInput = document.getElementById(dropoffInputId);
        this.pickupResults = document.getElementById(pickupResultsId);
        this.dropoffResults = document.getElementById(dropoffResultsId);
        this.pickupFindBtn = document.getElementById('pickupFindBtn');
        this.dropoffFindBtn = document.getElementById('dropoffFindBtn');

        if (!this.pickupInput || !this.dropoffInput) {
            console.error('LocationSearch: Input elements not found');
            return;
        }

        this.setupInputEvents('pickup');
        this.setupInputEvents('dropoff');
        this.setupFindButtons();
        this.setupOutsideClick();
    },

    setupInputEvents: function(type) {
        var input = type === 'pickup' ? this.pickupInput : this.dropoffInput;
        var resultsContainer = type === 'pickup' ? this.pickupResults : this.dropoffResults;
        var timeoutKey = type === 'pickup' ? 'pickupTimeout' : 'dropoffTimeout';

        input.addEventListener('input', function() {
            var query = this.value.trim();
            clearTimeout(LocationSearch[timeoutKey]);

            if (query.length < 2) {
                resultsContainer.classList.remove('active');
                resultsContainer.innerHTML = '';
                return;
            }

            if (type === 'pickup') {
                LocationSearch.pickupSelected = false;
            } else {
                LocationSearch.dropoffSelected = false;
            }

            LocationSearch[timeoutKey] = setTimeout(function() {
                LocationSearch.performSearch(query, type);
            }, 300);
        });

        // Handle Enter key
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                var firstResult = resultsContainer.querySelector('.search-result-item');
                if (firstResult) {
                    firstResult.click();
                } else {
                    // If no results, try the Find button
                    if (type === 'pickup') {
                        LocationSearch.findAddress('pickup');
                    } else {
                        LocationSearch.findAddress('dropoff');
                    }
                }
            }
        });

        // Handle arrow keys for navigation
        input.addEventListener('keydown', function(e) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                var items = resultsContainer.querySelectorAll('.search-result-item');
                if (items.length === 0) return;

                var currentIndex = -1;
                for (var i = 0; i < items.length; i++) {
                    if (items[i].classList.contains('active')) {
                        currentIndex = i;
                        items[i].classList.remove('active');
                    }
                }

                if (e.key === 'ArrowDown') {
                    var nextIndex = (currentIndex + 1) % items.length;
                    items[nextIndex].classList.add('active');
                    items[nextIndex].scrollIntoView({ block: 'nearest' });
                } else {
                    var prevIndex = (currentIndex - 1 + items.length) % items.length;
                    items[prevIndex].classList.add('active');
                    items[prevIndex].scrollIntoView({ block: 'nearest' });
                }
            }
        });

        input.addEventListener('blur', function() {
            setTimeout(function() {
                resultsContainer.classList.remove('active');
            }, 200);
        });
    },

    setupFindButtons: function() {
        if (this.pickupFindBtn) {
            this.pickupFindBtn.addEventListener('click', function() {
                LocationSearch.findAddress('pickup');
            });
        }

        if (this.dropoffFindBtn) {
            this.dropoffFindBtn.addEventListener('click', function() {
                LocationSearch.findAddress('dropoff');
            });
        }
    },

    setupOutsideClick: function() {
        document.addEventListener('click', function(e) {
            if (!e.target.closest('.address-search')) {
                LocationSearch.pickupResults.classList.remove('active');
                LocationSearch.dropoffResults.classList.remove('active');
            }
        });
    },

    performSearch: function(query, type) {
        var resultsContainer = type === 'pickup' ? this.pickupResults : this.dropoffResults;

        resultsContainer.innerHTML = '<div class="searching-indicator">🔍 Searching...</div>';
        resultsContainer.classList.add('active');

        if (this.searchAbortController) {
            this.searchAbortController.abort();
        }
        this.searchAbortController = new AbortController();

        MapLibreService.geocode(query)
            .then(function(results) {
                if (results && results.length > 0) {
                    LocationSearch.renderResults(results, type);
                } else {
                    resultsContainer.innerHTML = '<div class="searching-indicator">No results found. Try the Find button or drag the pin.</div>';
                }
            })
            .catch(function(err) {
                if (err.name !== 'AbortError') {
                    console.error('Search error:', err);
                    resultsContainer.innerHTML = '<div class="searching-indicator">Search error. Please try the Find button.</div>';
                }
            });
    },

    renderResults: function(results, type) {
        var resultsContainer = type === 'pickup' ? this.pickupResults : this.dropoffResults;

        var html = '';
        for (var i = 0; i < results.length; i++) {
            var result = results[i];
            var icon = result.icon || '📍';
            html += '<div class="search-result-item" data-lng="' + result.lng + '" data-lat="' + result.lat + '" data-label="' + result.label.replace(/"/g, '&quot;') + '">';
            html += '<span class="result-icon">' + icon + '</span>';
            html += '<div class="result-content">';
            html += '<div class="result-main">' + result.name + '</div>';
            html += '<div class="result-sub">' + result.label + '</div>';
            html += '</div>';
            html += '</div>';
        }

        resultsContainer.innerHTML = html;
        resultsContainer.classList.add('active');

        var items = resultsContainer.querySelectorAll('.search-result-item');
        for (var j = 0; j < items.length; j++) {
            items[j].addEventListener('click', function() {
                var lng = parseFloat(this.dataset.lng);
                var lat = parseFloat(this.dataset.lat);
                var label = this.dataset.label;

                LocationSearch.selectResult(lng, lat, label, type);
            });
        }
    },

    findAddress: function(type) {
        var input = type === 'pickup' ? this.pickupInput : this.dropoffInput;
        var query = input.value.trim();

        if (!query) {
            showToast('Please type an address first.', 'error');
            return;
        }

        var btn = type === 'pickup' ? this.pickupFindBtn : this.dropoffFindBtn;
        btn.textContent = '⏳...';
        btn.disabled = true;

        // Use OpenRouteService geocoding directly
        var url = 'https://api.openrouteservice.org/geocode/search?api_key=' + APP_CONFIG.openRouteServiceKey + '&text=' + encodeURIComponent(query + ', South Africa') + '&boundary.country=ZA&size=1';

        fetch(url)
            .then(function(response) {
                if (!response.ok) {
                    throw new Error('Geocoding error: ' + response.status);
                }
                return response.json();
            })
            .then(function(data) {
                btn.textContent = '🔍 Find';
                btn.disabled = false;

                if (data && data.features && data.features.length > 0) {
                    var feature = data.features[0];
                    var coords = feature.geometry.coordinates;
                    var label = feature.properties.label || query;

                    LocationSearch.selectResult(coords[0], coords[1], label, type);
                    showToast('Location found: ' + label, 'success');
                } else {
                    showToast('Could not find that address. Please try dragging the pin on the map.', 'error');
                }
            })
            .catch(function(err) {
                btn.textContent = '🔍 Find';
                btn.disabled = false;
                console.error('Find address error:', err);
                showToast('Error finding address. Please try dragging the pin on the map.', 'error');
            });
    },

    selectResult: function(lng, lat, label, type) {
        var input = type === 'pickup' ? this.pickupInput : this.dropoffInput;
        var resultsContainer = type === 'pickup' ? this.pickupResults : this.dropoffResults;

        input.value = label;
        resultsContainer.classList.remove('active');
        resultsContainer.innerHTML = '';

        if (type === 'pickup') {
            this.pickupSelected = true;
            this.currentPickupCoords = { lng: lng, lat: lat };
            var pickupMarker = MapLibreService.setPickup(lng, lat, label);
            var event = new CustomEvent('pickupSelected', {
                detail: { lng: lng, lat: lat, label: label }
            });
            document.dispatchEvent(event);
            MapLibreService.flyTo(lng, lat, 14);
        } else {
            this.dropoffSelected = true;
            this.currentDropoffCoords = { lng: lng, lat: lat };
            var dropoffMarker = MapLibreService.setDropoff(lng, lat, label);
            var event = new CustomEvent('dropoffSelected', {
                detail: { lng: lng, lat: lat, label: label }
            });
            document.dispatchEvent(event);
            if (this.currentPickupCoords) {
                MapLibreService.fitBounds();
            } else {
                MapLibreService.flyTo(lng, lat, 14);
            }
        }

        if (this.currentPickupCoords && this.currentDropoffCoords) {
            var routeEvent = new CustomEvent('locationsReady', {
                detail: {
                    pickup: this.currentPickupCoords,
                    dropoff: this.currentDropoffCoords
                }
            });
            document.dispatchEvent(routeEvent);
        }
    },

    getPickupCoords: function() {
        return this.currentPickupCoords;
    },

    getDropoffCoords: function() {
        return this.currentDropoffCoords;
    },

    setPickupLocation: function(lng, lat, label) {
        this.currentPickupCoords = { lng: lng, lat: lat };
        if (label) {
            this.pickupInput.value = label;
        } else {
            MapLibreService.reverseGeocode(lng, lat)
                .then(function(address) {
                    LocationSearch.pickupInput.value = address;
                })
                .catch(function() {
                    LocationSearch.pickupInput.value = 'Selected Location';
                });
        }
        MapLibreService.setPickup(lng, lat, label || 'Selected Location');
        MapLibreService.flyTo(lng, lat, 14);

        if (this.currentDropoffCoords) {
            var routeEvent = new CustomEvent('locationsReady', {
                detail: {
                    pickup: this.currentPickupCoords,
                    dropoff: this.currentDropoffCoords
                }
            });
            document.dispatchEvent(routeEvent);
        }
    },

    setDropoffLocation: function(lng, lat, label) {
        this.currentDropoffCoords = { lng: lng, lat: lat };
        if (label) {
            this.dropoffInput.value = label;
        } else {
            MapLibreService.reverseGeocode(lng, lat)
                .then(function(address) {
                    LocationSearch.dropoffInput.value = address;
                })
                .catch(function() {
                    LocationSearch.dropoffInput.value = 'Selected Location';
                });
        }
        MapLibreService.setDropoff(lng, lat, label || 'Selected Location');
        if (this.currentPickupCoords) {
            MapLibreService.fitBounds();
        } else {
            MapLibreService.flyTo(lng, lat, 14);
        }

        if (this.currentPickupCoords) {
            var routeEvent = new CustomEvent('locationsReady', {
                detail: {
                    pickup: this.currentPickupCoords,
                    dropoff: this.currentDropoffCoords
                }
            });
            document.dispatchEvent(routeEvent);
        }
    },

    clear: function() {
        this.currentPickupCoords = null;
        this.currentDropoffCoords = null;
        this.pickupSelected = false;
        this.dropoffSelected = false;
        this.pickupInput.value = '';
        this.dropoffInput.value = '';
        this.pickupResults.classList.remove('active');
        this.pickupResults.innerHTML = '';
        this.dropoffResults.classList.remove('active');
        this.dropoffResults.innerHTML = '';
        MapLibreService.clearMarkers();
    },

    clearPickup: function() {
        this.currentPickupCoords = null;
        this.pickupSelected = false;
        if (MapLibreService.pickupMarker) {
            MapLibreService.pickupMarker.remove();
            MapLibreService.pickupMarker = null;
        }
        if (MapLibreService.pickupPopup) {
            MapLibreService.pickupPopup.remove();
            MapLibreService.pickupPopup = null;
        }
        this.pickupInput.value = '';
        this.pickupResults.classList.remove('active');
        this.pickupResults.innerHTML = '';
        if (this.currentDropoffCoords) {
            var lng = this.currentDropoffCoords.lng;
            var lat = this.currentDropoffCoords.lat;
            MapLibreService.flyTo(lng, lat, 12);
        }
    },

    clearDropoff: function() {
        this.currentDropoffCoords = null;
        this.dropoffSelected = false;
        if (MapLibreService.dropoffMarker) {
            MapLibreService.dropoffMarker.remove();
            MapLibreService.dropoffMarker = null;
        }
        if (MapLibreService.dropoffPopup) {
            MapLibreService.dropoffPopup.remove();
            MapLibreService.dropoffPopup = null;
        }
        this.dropoffInput.value = '';
        this.dropoffResults.classList.remove('active');
        this.dropoffResults.innerHTML = '';
        if (this.currentPickupCoords) {
            var lng = this.currentPickupCoords.lng;
            var lat = this.currentPickupCoords.lat;
            MapLibreService.flyTo(lng, lat, 12);
        }
    },

    useCurrentLocation: function() {
        if (!navigator.geolocation) {
            showToast('Geolocation is not supported by your browser.', 'error');
            return;
        }

        showToast('Getting your location...', 'info');

        navigator.geolocation.getCurrentPosition(
            function(position) {
                var lng = position.coords.longitude;
                var lat = position.coords.latitude;

                MapLibreService.reverseGeocode(lng, lat)
                    .then(function(address) {
                        LocationSearch.setPickupLocation(lng, lat, address);
                        showToast('Location found: ' + address, 'success');
                    })
                    .catch(function() {
                        LocationSearch.setPickupLocation(lng, lat, 'Current Location');
                        showToast('Location set successfully!', 'success');
                    });
            },
            function(error) {
                var message = 'Could not get your location. ';
                if (error.code === 1) {
                    message += 'Please allow location access.';
                } else if (error.code === 2) {
                    message += 'Location unavailable.';
                } else {
                    message += 'Please try again.';
                }
                showToast(message, 'error');
            },
            {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 60000
            }
        );
    }
};
