/* =====================================================================
   LUU TRAVELS & LOGISTICS - MAPLIBRE GL SERVICE
   ===================================================================== */

var MapLibreService = {
    map: null,
    pickupMarker: null,
    dropoffMarker: null,
    routeSource: null,
    routeLayer: null,
    pickupPopup: null,
    dropoffPopup: null,
    isInitialized: false,
    geocoderAbortController: null,
    searchCache: {},
    geocodingQueue: [],
    isGeocoding: false,

    // OpenRouteService API endpoints
    ORS_GEOCODE: 'https://api.openrouteservice.org/geocode/search',
    ORS_ROUTING: 'https://api.openrouteservice.org/v2/directions/driving-car',

    init: function(containerId) {
        if (this.isInitialized) {
            return this.map;
        }

        var map = new maplibregl.Map({
            container: containerId,
            style: {
                version: 8,
                sources: {
                    osm: {
                        type: 'raster',
                        tiles: [
                            'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                            'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
                            'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
                            'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'
                        ],
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
            attributionControl: true,
            maxZoom: 19,
            minZoom: 3
        });

        map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
        map.addControl(new maplibregl.ScaleControl({
            maxWidth: 100,
            unit: 'metric'
        }), 'bottom-left');

        map.on('load', function() {
            // Map is ready
        });

        this.map = map;
        this.isInitialized = true;

        return map;
    },

    createMarkerElement: function(type, label) {
        var el = document.createElement('div');
        el.className = 'custom-marker custom-marker-' + type;
        el.innerHTML = '<span>' + label + '</span>';
        return el;
    },

    setPickup: function(lng, lat, address) {
        var map = this.map;
        if (this.pickupMarker) {
            this.pickupMarker.remove();
        }
        if (this.pickupPopup) {
            this.pickupPopup.remove();
            this.pickupPopup = null;
        }

        var el = this.createMarkerElement('pickup', 'P');
        this.pickupMarker = new maplibregl.Marker({
            element: el,
            draggable: true
        })
        .setLngLat([lng, lat])
        .addTo(map);

        if (address) {
            this.pickupPopup = new maplibregl.Popup({ offset: 25 })
                .setHTML('<strong>Pickup</strong><br>' + address);
            this.pickupMarker.setPopup(this.pickupPopup);
        }

        this.pickupMarker.on('dragend', function() {
            var pos = this.getLngLat();
            var event = new CustomEvent('pickupDragged', {
                detail: { lng: pos.lng, lat: pos.lat }
            });
            document.dispatchEvent(event);
        });

        return this.pickupMarker;
    },

    setDropoff: function(lng, lat, address) {
        var map = this.map;
        if (this.dropoffMarker) {
            this.dropoffMarker.remove();
        }
        if (this.dropoffPopup) {
            this.dropoffPopup.remove();
            this.dropoffPopup = null;
        }

        var el = this.createMarkerElement('dropoff', 'D');
        this.dropoffMarker = new maplibregl.Marker({
            element: el,
            draggable: true
        })
        .setLngLat([lng, lat])
        .addTo(map);

        if (address) {
            this.dropoffPopup = new maplibregl.Popup({ offset: 25 })
                .setHTML('<strong>Drop-off</strong><br>' + address);
            this.dropoffMarker.setPopup(this.dropoffPopup);
        }

        this.dropoffMarker.on('dragend', function() {
            var pos = this.getLngLat();
            var event = new CustomEvent('dropoffDragged', {
                detail: { lng: pos.lng, lat: pos.lat }
            });
            document.dispatchEvent(event);
        });

        return this.dropoffMarker;
    },

    fitBounds: function() {
        if (!this.pickupMarker || !this.dropoffMarker) {
            if (this.pickupMarker) {
                var pos = this.pickupMarker.getLngLat();
                this.map.flyTo({ center: [pos.lng, pos.lat], zoom: 14, duration: 1000 });
            }
            return;
        }

        var bounds = new maplibregl.LngLatBounds();
        bounds.extend(this.pickupMarker.getLngLat());
        bounds.extend(this.dropoffMarker.getLngLat());
        this.map.fitBounds(bounds, { padding: 80, duration: 1000 });
    },

    clearMarkers: function() {
        if (this.pickupMarker) {
            this.pickupMarker.remove();
            this.pickupMarker = null;
        }
        if (this.dropoffMarker) {
            this.dropoffMarker.remove();
            this.dropoffMarker = null;
        }
        if (this.pickupPopup) {
            this.pickupPopup.remove();
            this.pickupPopup = null;
        }
        if (this.dropoffPopup) {
            this.dropoffPopup.remove();
            this.dropoffPopup = null;
        }
        this.clearRoute();
    },

    clearRoute: function() {
        if (this.routeLayer) {
            try {
                this.map.removeLayer(this.routeLayer);
            } catch(e) {}
            this.routeLayer = null;
        }
        if (this.routeSource) {
            try {
                this.map.removeSource(this.routeSource);
            } catch(e) {}
            this.routeSource = null;
        }
    },

    flyTo: function(lng, lat, zoom, duration) {
        zoom = zoom || 14;
        duration = duration || 1000;
        this.map.flyTo({
            center: [lng, lat],
            zoom: zoom,
            duration: duration
        });
    },

    // =====================================================================
    // GEOCODING - Search ANY location in South Africa
    // =====================================================================
    geocode: function(query) {
        return new Promise(function(resolve, reject) {
            if (!query || query.length < 2) {
                resolve([]);
                return;
            }

            // Check cache first
            var cacheKey = query.toLowerCase().trim();
            if (MapLibreService.searchCache[cacheKey]) {
                var cached = MapLibreService.searchCache[cacheKey];
                var now = Date.now();
                if (now - cached.timestamp < 300000) { // 5 minutes cache
                    resolve(cached.results);
                    return;
                }
            }

            // Cancel previous request
            if (MapLibreService.geocoderAbortController) {
                MapLibreService.geocoderAbortController.abort();
            }

            MapLibreService.geocoderAbortController = new AbortController();
            var signal = MapLibreService.geocoderAbortController.signal;

            var url = MapLibreService.ORS_GEOCODE +
                '?api_key=' + APP_CONFIG.openRouteServiceKey +
                '&text=' + encodeURIComponent(query) +
                '&boundary.country=ZA' +
                '&size=10' +
                '&layers=venue,street,address,locality,region';

            fetch(url, { signal: signal })
                .then(function(response) {
                    if (!response.ok) {
                        throw new Error('Geocoding API error: ' + response.status);
                    }
                    return response.json();
                })
                .then(function(data) {
                    if (data && data.features) {
                        var results = data.features.map(function(feature) {
                            var props = feature.properties;
                            var coords = feature.geometry.coordinates;
                            var label = props.label || props.name || '';
                            var type = props.layer || 'venue';
                            
                            // Determine icon based on type
                            var icon = '📍';
                            if (type === 'venue' || type === 'building') icon = '🏢';
                            else if (type === 'address') icon = '🏠';
                            else if (type === 'street') icon = '🛣️';
                            else if (type === 'locality' || type === 'city') icon = '🏙️';
                            else if (type === 'region' || type === 'province') icon = '🏛️';
                            else if (type === 'school') icon = '🏫';
                            else if (type === 'hospital') icon = '🏥';
                            else if (type === 'park') icon = '🌳';
                            else if (type === 'restaurant') icon = '🍽️';
                            else if (type === 'hotel') icon = '🏨';
                            else if (type === 'shop') icon = '🛍️';
                            else if (type === 'airport') icon = '✈️';
                            else if (type === 'bus') icon = '🚌';
                            else if (type === 'taxi') icon = '🚕';
                            
                            return {
                                lng: coords[0],
                                lat: coords[1],
                                label: label,
                                name: props.name || label,
                                type: type,
                                icon: icon,
                                confidence: props.confidence || 0.5,
                                source: 'ors'
                            };
                        });

                        // Cache results
                        MapLibreService.searchCache[cacheKey] = {
                            results: results,
                            timestamp: Date.now()
                        };

                        resolve(results);
                    } else {
                        resolve([]);
                    }
                })
                .catch(function(err) {
                    if (err.name === 'AbortError') {
                        resolve([]);
                    } else {
                        reject(err);
                    }
                });
        });
    },

    // =====================================================================
    // ROUTING - Get driving route, distance, and time
    // =====================================================================
    getRoute: function(startLng, startLat, endLng, endLat) {
        return new Promise(function(resolve, reject) {
            var url = MapLibreService.ORS_ROUTING +
                '?api_key=' + APP_CONFIG.openRouteServiceKey +
                '&start=' + startLng + ',' + startLat +
                '&end=' + endLng + ',' + endLat +
                '&geometry=true' +
                '&instructions=false' +
                '&elevation=false';

            fetch(url)
                .then(function(response) {
                    if (!response.ok) {
                        throw new Error('Routing API error: ' + response.status);
                    }
                    return response.json();
                })
                .then(function(data) {
                    if (data && data.features && data.features.length > 0) {
                        var feature = data.features[0];
                        var properties = feature.properties;
                        var segments = properties.segments || [];
                        var route = null;
                        var distance = 0;
                        var duration = 0;

                        if (segments.length > 0) {
                            var segment = segments[0];
                            distance = segment.distance || 0; // meters
                            duration = segment.duration || 0; // seconds
                            if (feature.geometry && feature.geometry.coordinates) {
                                route = feature.geometry.coordinates;
                            }
                        }

                        resolve({
                            route: route,
                            distance: distance / 1000, // convert to km
                            duration: duration,
                            durationFormatted: MapLibreService.formatDuration(duration)
                        });
                    } else {
                        reject(new Error('No route found'));
                    }
                })
                .catch(function(err) {
                    reject(err);
                });
        });
    },

    // =====================================================================
    // DRAW ROUTE ON MAP
    // =====================================================================
    drawRoute: function(routeCoordinates) {
        this.clearRoute();

        if (!routeCoordinates || routeCoordinates.length < 2) {
            return;
        }

        var map = this.map;
        var sourceId = 'route-source-' + Date.now();
        var layerId = 'route-layer-' + Date.now();

        map.addSource(sourceId, {
            type: 'geojson',
            data: {
                type: 'Feature',
                properties: {},
                geometry: {
                    type: 'LineString',
                    coordinates: routeCoordinates
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
                'line-opacity': 0.85,
                'line-blur': 1
            }
        });

        // Add glowing effect
        var glowLayerId = 'route-glow-' + Date.now();
        map.addLayer({
            id: glowLayerId,
            type: 'line',
            source: sourceId,
            layout: {
                'line-join': 'round',
                'line-cap': 'round'
            },
            paint: {
                'line-color': '#F5A623',
                'line-width': 8,
                'line-opacity': 0.25,
                'line-blur': 4
            }
        });

        this.routeSource = sourceId;
        this.routeLayer = layerId;

        // Fit bounds to route
        var bounds = new maplibregl.LngLatBounds();
        for (var i = 0; i < routeCoordinates.length; i++) {
            bounds.extend(routeCoordinates[i]);
        }
        map.fitBounds(bounds, { padding: 60, duration: 800 });
    },

    // =====================================================================
    // UTILITY FUNCTIONS
    // =====================================================================
    formatDuration: function(seconds) {
        if (seconds < 60) {
            return Math.round(seconds) + ' seconds';
        }
        var minutes = Math.floor(seconds / 60);
        if (minutes < 60) {
            return minutes + ' min' + (minutes > 1 ? 's' : '');
        }
        var hours = Math.floor(minutes / 60);
        var remainingMinutes = minutes % 60;
        if (remainingMinutes === 0) {
            return hours + ' hour' + (hours > 1 ? 's' : '');
        }
        return hours + 'h ' + remainingMinutes + 'm';
    },

    // =====================================================================
    // REVERSE GEOCODING
    // =====================================================================
    reverseGeocode: function(lng, lat) {
        return new Promise(function(resolve, reject) {
            var url = MapLibreService.ORS_GEOCODE +
                '?api_key=' + APP_CONFIG.openRouteServiceKey +
                '&point.lon=' + lng +
                '&point.lat=' + lat +
                '&size=1';

            fetch(url)
                .then(function(response) {
                    if (!response.ok) {
                        throw new Error('Reverse geocoding error: ' + response.status);
                    }
                    return response.json();
                })
                .then(function(data) {
                    if (data && data.features && data.features.length > 0) {
                        var feature = data.features[0];
                        resolve(feature.properties.label || 'Selected Location');
                    } else {
                        resolve('Selected Location');
                    }
                })
                .catch(function(err) {
                    reject(err);
                });
        });
    },

    // =====================================================================
    // CLEANUP
    // =====================================================================
    destroy: function() {
        if (this.geocoderAbortController) {
            this.geocoderAbortController.abort();
            this.geocoderAbortController = null;
        }
        this.clearMarkers();
        this.clearRoute();
        this.searchCache = {};
        if (this.map) {
            this.map.remove();
            this.map = null;
        }
        this.isInitialized = false;
    }
};
