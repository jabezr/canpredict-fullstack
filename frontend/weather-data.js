/*!
 * weather-data.js
 * ---------------------------------------------------------------
 * Single shared client for the CanPredict FastAPI backend, used by all
 * five pages (Home, Forecast, AI Prediction, Insights, Profile).
 *
 * This file no longer generates synthetic weather data. Every data
 * function below is now ASYNC (returns a Promise) because it makes a
 * real network call to the backend, which in turn calls OpenWeather.
 * Callers must `await` them (or use `.then()`), and should handle
 * rejected promises (network down, backend down, city not found, etc.)
 * with a visible error/retry state rather than assuming success.
 *
 * The backend URL is the ONE line to change if you deploy the API
 * somewhere other than localhost:
 */
var API_BASE_URL = 'http://127.0.0.1:8000';

(function (global) {
    'use strict';

    var STORAGE_KEY = 'weatherAppStore';
    var REQUEST_TIMEOUT_MS = 12000;

    // A short, curated list used ONLY to power the search-suggestions
    // dropdown UI. It is not authoritative — ANY real city name can be
    // searched and will be resolved live by the backend's geocoding call;
    // this list just gives the autocomplete something helpful to suggest
    // before the user finishes typing.
    var POPULAR_CITIES = [
        'Chennai', 'Bangalore', 'Mumbai', 'Delhi', 'Hyderabad', 'Kolkata',
        'Pune', 'Chengalpattu', 'Madurai', 'Kochi', 'Jaipur', 'Ahmedabad',
        'London', 'New York', 'Tokyo', 'Singapore', 'Dubai', 'Paris',
        'Sydney', 'Toronto'
    ];

    var CONDITION_ICON = {
        'sunny': 'icon-sunny', 'clear sky': 'icon-sunny', 'clear': 'icon-sunny',
        'partly cloudy': 'icon-partly-cloudy', 'scattered clouds': 'icon-partly-cloudy',
        'cloudy': 'icon-cloudy', 'overcast': 'icon-cloudy', 'clouds': 'icon-cloudy',
        'rain': 'icon-rain', 'light rain': 'icon-rain', 'showers': 'icon-rain',
        'thunderstorm': 'icon-thunder', 'thunder': 'icon-thunder', 'storm': 'icon-thunder',
        'drizzle': 'icon-drizzle',
        'snow': 'icon-snow', 'snowfall': 'icon-snow',
        'mist': 'icon-mist', 'haze': 'icon-mist', 'hazy': 'icon-mist',
        'windy': 'icon-windy', 'breezy': 'icon-windy',
        'fog': 'icon-fog', 'foggy': 'icon-fog'
    };

    // =================================================================
    // NETWORK LAYER — timeout, one retry on transient failure, and
    // normalized errors with a human-readable `.message`.
    // =================================================================
    function buildUrl(path, params) {
        var url = API_BASE_URL.replace(/\/$/, '') + path;
        var query = Object.keys(params || {})
            .filter(function (k) { return params[k] !== undefined && params[k] !== null && params[k] !== ''; })
            .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
            .join('&');
        return query ? url + '?' + query : url;
    }

    function fetchJson(url, attemptsLeft) {
        if (typeof attemptsLeft !== 'number') attemptsLeft = 1;

        var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        var timeoutId = controller ? setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS) : null;

        return fetch(url, { signal: controller ? controller.signal : undefined })
            .then(function (res) {
                if (timeoutId) clearTimeout(timeoutId);
                if (!res.ok) {
                    return res.json().catch(function () { return {}; }).then(function (body) {
                        var err = new Error((body && body.detail) || ('Request failed (' + res.status + ')'));
                        err.status = res.status;
                        throw err;
                    });
                }
                return res.json();
            })
            .catch(function (err) {
                if (timeoutId) clearTimeout(timeoutId);
                var isAbort = err && err.name === 'AbortError';
                var isNetworkDown = err instanceof TypeError; // fetch throws TypeError on network failure/CORS
                if ((isAbort || isNetworkDown) && attemptsLeft > 0) {
                    return fetchJson(url, attemptsLeft - 1);
                }
                if (isAbort) {
                    throw new Error('The request timed out. Check that the CanPredict backend is running and reachable.');
                }
                if (isNetworkDown) {
                    throw new Error('Could not reach the CanPredict backend at ' + API_BASE_URL + '. Is it running?');
                }
                throw err;
            });
    }

    function apiGet(path, params) {
        return fetchJson(buildUrl(path, params), 1);
    }

    // Turns a "location descriptor" (a plain city-name string, or an
    // {lat, lon} object) into the query params the backend expects.
    function toLocationParams(locationDescriptor) {
        if (locationDescriptor && typeof locationDescriptor === 'object' &&
            locationDescriptor.lat !== undefined && locationDescriptor.lon !== undefined) {
            return { lat: locationDescriptor.lat, lon: locationDescriptor.lon };
        }
        return { city: locationDescriptor };
    }

    // =================================================================
    // STORE (persisted in localStorage)
    // =================================================================
    function defaultState() {
        return {
            location: { type: 'city', query: 'Chennai' },
            cityDisplay: 'Chennai',
            country: '',
            unit: 'C',
            windUnit: 'kmh',
            theme: 'dark',
            favorites: [],
            searchHistory: [],
            selectedDayIndex: 0,
            selectedHourIndex: 0,
            forecastMode: '7',
            lastUpdated: new Date().toISOString()
        };
    }

    function load() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) {
                var def = defaultState();
                save(def);
                return def;
            }
            return Object.assign(defaultState(), JSON.parse(raw));
        } catch (e) {
            return defaultState();
        }
    }

    function save(state) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (e) { /* ignore quota / privacy-mode errors */ }
        return state;
    }

    function update(patch) {
        var state = load();
        if (typeof patch === 'function') {
            patch(state);
        } else {
            Object.assign(state, patch);
        }
        state.lastUpdated = new Date().toISOString();
        save(state);
        return state;
    }

    // setCity: resolves a city name against the backend (real geocoding),
    // then stores it as the active location. Returns a Promise<state>,
    // rejects with a human-readable error (e.g. "City ... was not found.")
    // if the backend/geocoding call fails.
    function setCity(query) {
        return apiGet('/weather/search', { city: query }).then(function (data) {
            return update(function (s) {
                s.location = { type: 'city', query: query };
                s.cityDisplay = data.city;
                s.country = data.country;
                s.selectedDayIndex = 0;
                s.selectedHourIndex = 0;
                var histEntry = data.country ? (data.city + ', ' + data.country) : data.city;
                if (s.searchHistory.indexOf(histEntry) === -1) {
                    s.searchHistory.push(histEntry);
                    if (s.searchHistory.length > 8) s.searchHistory.shift();
                }
            });
        });
    }

    // setCustomLocation: resolves lat/lon via the backend's reverse
    // geocoding (through /weather/location), then stores it as the
    // active location. The `displayHint` param is only used as a
    // placeholder while the request is in flight; the real city name
    // returned by the backend always wins once it arrives.
    function setCustomLocation(displayHint, lat, lon) {
        return apiGet('/weather/location', { lat: lat, lon: lon }).then(function (data) {
            return update(function (s) {
                s.location = { type: 'coords', lat: lat, lon: lon };
                s.cityDisplay = data.country ? (data.city + ', ' + data.country) : data.city;
                s.country = data.country;
                s.selectedDayIndex = 0;
                s.selectedHourIndex = 0;
            });
        });
    }

    function setSelectedDay(index) {
        return update(function (s) {
            s.selectedDayIndex = index;
            s.selectedHourIndex = 0;
        });
    }

    function setSelectedHour(index) {
        return update({ selectedHourIndex: index });
    }

    function toggleFavorite(cityDisplay) {
        var added;
        update(function (s) {
            var i = s.favorites.indexOf(cityDisplay);
            if (i === -1) { s.favorites.push(cityDisplay); added = true; }
            else { s.favorites.splice(i, 1); added = false; }
        });
        return added;
    }

    // Current active location as a descriptor usable by getCityData /
    // generateHourly / generateMetrics / generatePrediction / generateInsights.
    function currentLocationDescriptor(state) {
        state = state || load();
        if (state.location && state.location.type === 'coords') {
            return { lat: state.location.lat, lon: state.location.lon };
        }
        return (state.location && state.location.query) || state.cityDisplay;
    }

    // Looks up a city without changing the active store selection — used
    // to validate a name before switching, or to preview data for a
    // different city (e.g. a favorites/search-history row).
    function geocodeCity(query) {
        return apiGet('/weather/search', { city: query });
    }

    // =================================================================
    // ICONS — unchanged from the previous version: full inline SVG
    // <defs> covering every supported condition. The backend already
    // returns a matching `condition_icon` id for every value it sends,
    // so this table is mostly a fallback for any plain-text condition
    // string that didn't come with one attached.
    // =================================================================
    var ICON_DEFS_ID = 'sharedWeatherIconDefs';
    var ICON_DEFS_MARKUP =
        '<defs>' +
        '<linearGradient id="sunGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ffca28"/><stop offset="100%" stop-color="#f57c00"/></linearGradient>' +
        '<linearGradient id="cloudGrad" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#ffffff"/><stop offset="100%" stop-color="#b0c4de"/></linearGradient>' +
        '<linearGradient id="cloudGradDark" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#c3cad8"/><stop offset="100%" stop-color="#8896ab"/></linearGradient>' +
        '<linearGradient id="boltGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ffee58"/><stop offset="100%" stop-color="#fbc02d"/></linearGradient>' +
        '<linearGradient id="snowGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ffffff"/><stop offset="100%" stop-color="#c9e6ff"/></linearGradient>' +
        '</defs>' +
        '<g id="icon-sunny">' +
        '<circle cx="50" cy="50" r="28" fill="url(#sunGrad)" filter="drop-shadow(0 0 8px #ffca28)"/>' +
        '<path d="M50 10 L50 18 M50 82 L50 90 M10 50 L18 50 M82 50 L90 50 M22 22 L28 28 M72 72 L78 78 M22 78 L28 72 M72 28 L78 22" stroke="url(#sunGrad)" stroke-width="6" stroke-linecap="round"/>' +
        '</g>' +
        '<g id="icon-partly-cloudy">' +
        '<circle cx="65" cy="40" r="22" fill="url(#sunGrad)"/>' +
        '<path d="M25 70 h50 a18 18 0 0 0 0 -36 a14 14 0 0 0 -22 -8 a20 20 0 0 0 -28 44 z" fill="url(#cloudGrad)"/>' +
        '</g>' +
        '<g id="icon-cloudy">' +
        '<path d="M25 65 h50 a18 18 0 0 0 0 -36 a14 14 0 0 0 -22 -8 a20 20 0 0 0 -28 44 z" fill="url(#cloudGrad)" opacity="0.8"/>' +
        '<path d="M15 80 h50 a18 18 0 0 0 0 -36 a14 14 0 0 0 -22 -8 a20 20 0 0 0 -28 44 z" fill="url(#cloudGrad)"/>' +
        '</g>' +
        '<g id="icon-rain">' +
        '<path d="M20 55 h60 a20 20 0 0 0 0 -40 a16 16 0 0 0 -26 -10 a24 24 0 0 0 -34 50 z" fill="url(#cloudGrad)"/>' +
        '<path d="M35 70 l-8 20 M50 70 l-8 20 M65 70 l-8 20" stroke="#00d2ff" stroke-width="4" stroke-linecap="round"/>' +
        '</g>' +
        '<g id="icon-thunder">' +
        '<path d="M20 55 h60 a20 20 0 0 0 0 -40 a16 16 0 0 0 -26 -10 a24 24 0 0 0 -34 50 z" fill="url(#cloudGrad)"/>' +
        '<path d="M45 50 l-15 25 h15 l-5 20 l25 -30 h-15 z" fill="url(#boltGrad)" filter="drop-shadow(0 0 4px #ffee58)"/>' +
        '</g>' +
        '<g id="icon-drizzle">' +
        '<path d="M22 58 h56 a18 18 0 0 0 0 -36 a14 14 0 0 0 -23 -9 a20 20 0 0 0 -33 45 z" fill="url(#cloudGrad)" opacity="0.92"/>' +
        '<path d="M33 72 l-4 10 M47 72 l-4 10 M61 72 l-4 10 M40 80 l-4 10 M54 80 l-4 10" stroke="#7fd8ff" stroke-width="3" stroke-linecap="round"/>' +
        '</g>' +
        '<g id="icon-snow">' +
        '<path d="M22 52 h56 a18 18 0 0 0 0 -36 a14 14 0 0 0 -23 -9 a20 20 0 0 0 -33 45 z" fill="url(#snowGrad)"/>' +
        '<g stroke="#bfe6ff" stroke-width="3" stroke-linecap="round">' +
        '<path d="M35 72 v14 M29 79 h12"/>' +
        '<path d="M35 72 l6 7 M41 72 l-6 7 M35 86 l6 -7 M35 86 l-6 -7"/>' +
        '<path d="M65 72 v14 M59 79 h12"/>' +
        '<path d="M65 72 l6 7 M71 72 l-6 7 M65 86 l6 -7 M65 86 l-6 -7"/>' +
        '<circle cx="50" cy="82" r="3" fill="#bfe6ff" stroke="none"/>' +
        '</g>' +
        '</g>' +
        '<g id="icon-mist">' +
        '<circle cx="62" cy="34" r="16" fill="url(#sunGrad)" opacity="0.55"/>' +
        '<g stroke="url(#cloudGrad)" stroke-width="7" stroke-linecap="round" opacity="0.9">' +
        '<path d="M20 50 h60"/><path d="M15 64 h70"/><path d="M25 78 h50"/>' +
        '</g>' +
        '</g>' +
        '<g id="icon-fog">' +
        '<g stroke="url(#cloudGradDark)" stroke-width="7" stroke-linecap="round">' +
        '<path d="M18 40 h64"/><path d="M12 54 h76"/><path d="M18 68 h64"/><path d="M25 82 h50"/>' +
        '</g>' +
        '</g>' +
        '<g id="icon-windy">' +
        '<path d="M28 62 h50 a18 18 0 0 0 0 -36 a14 14 0 0 0 -22 -8 a20 20 0 0 0 -28 44 z" fill="url(#cloudGrad)" opacity="0.5"/>' +
        '<g stroke="#7fd8ff" stroke-width="5" stroke-linecap="round" fill="none">' +
        '<path d="M12 70 h44 a8 8 0 1 0 -8 -8"/>' +
        '<path d="M18 84 h38 a7 7 0 1 0 -7 -7"/>' +
        '<path d="M8 58 h30 a6 6 0 1 0 -6 -6"/>' +
        '</g>' +
        '</g>';

    function ensureIconDefs() {
        if (document.getElementById(ICON_DEFS_ID)) return;
        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('id', ICON_DEFS_ID);
        svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden;');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        svg.innerHTML = ICON_DEFS_MARKUP;
        if (document.body.firstChild) {
            document.body.insertBefore(svg, document.body.firstChild);
        } else {
            document.body.appendChild(svg);
        }
    }

    function iconMarkup(iconId, extraAttrs) {
        return '<svg viewBox="0 0 100 100"' + (extraAttrs || '') + '><use href="#' + iconId + '"></use></svg>';
    }

    function conditionToIcon(condition) {
        if (!condition) return 'icon-cloudy';
        return CONDITION_ICON[condition.toLowerCase()] || 'icon-cloudy';
    }

    // =================================================================
    // FORMATTING HELPERS (pure, unchanged)
    // =================================================================
    function uvMeta(uv) {
        if (uv >= 8) return { label: 'Very High', color: '#ff4b72' };
        if (uv >= 6) return { label: 'High', color: '#ffa726' };
        if (uv >= 3) return { label: 'Moderate', color: '#ffca28' };
        return { label: 'Low', color: '#8c92c2' };
    }

    function aqiMeta(aqi) {
        if (aqi <= 50) return { label: 'Good', color: '#00e676' };
        if (aqi <= 100) return { label: 'Moderate', color: '#ffd600' };
        if (aqi <= 150) return { label: 'Unhealthy (Sensitive)', color: '#ff9800' };
        if (aqi <= 200) return { label: 'Unhealthy', color: '#ff5252' };
        return { label: 'Hazardous', color: '#b388ff' };
    }

    function humidityMeta(h) {
        if (h >= 80) return 'Very High';
        if (h >= 60) return 'Moderate';
        if (h >= 40) return 'Comfortable';
        return 'Low';
    }

    function cToF(c) { return Math.round((c * 9) / 5 + 32); }

    function convertWind(kmh, unit) {
        return unit === 'mph' ? Math.round(kmh * 0.621371) : Math.round(kmh);
    }

    function formatTemp(celsius, unit) {
        return (unit === 'F' ? cToF(celsius) : Math.round(celsius)) + String.fromCharCode(176);
    }

    // =================================================================
    // DATA FUNCTIONS — every one of these hits the backend. They keep
    // the exact field names the frontend render functions already
    // expect, so only the call sites (not the rendering code that reads
    // the results) needed to change from sync to async.
    // =================================================================
    var ABS_MIN_C = 0, ABS_MAX_C = 45; // used only for the 7-day temp bar visualization

    function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

    function dayFromApiItem(apiDay, index) {
        var barLeft = clamp(Math.round((apiDay.temp_min - ABS_MIN_C) / (ABS_MAX_C - ABS_MIN_C) * 100), 2, 90);
        var barRight = clamp(Math.round((ABS_MAX_C - apiDay.temp_max) / (ABS_MAX_C - ABS_MIN_C) * 100), 2, 90);
        return {
            index: index,
            day: apiDay.day_label,
            date: apiDay.date,
            icon: apiDay.condition_icon,
            condition: apiDay.condition,
            min: apiDay.temp_min,
            max: apiDay.temp_max,
            feelsLike: apiDay.feels_like,
            rain: apiDay.rain_probability,
            humidity: apiDay.humidity,
            wind: apiDay.wind_speed,
            windDir: apiDay.wind_direction,
            pressure: apiDay.pressure,
            uv: apiDay.uv_index,
            uvLabel: apiDay.uv_label,
            cloudCover: apiDay.cloud_cover,
            sunrise: apiDay.sunrise,
            sunset: apiDay.sunset,
            moonrise: apiDay.moonrise,
            moonset: apiDay.moonset,
            barLeft: barLeft,
            barRight: barRight
        };
    }

    // getCityData(locationDescriptor) -> Promise<{ key, profile: {display, country}, days: [...] }>
    function getCityData(locationDescriptor) {
        var params = Object.assign({ days: 7 }, toLocationParams(locationDescriptor));
        return apiGet('/weather/daily', params).then(function (data) {
            var days = data.daily.map(dayFromApiItem);
            return {
                key: data.city,
                profile: { display: data.city, country: data.country },
                days: days
            };
        });
    }

    // generateHourly(locationDescriptor, dayObj) -> Promise<hourlyArray>
    // Real hourly data only exists ~48h out. For a selected day beyond
    // that horizon, we fall back to a smooth interpolation between that
    // day's own (real) min/max/condition — clearly a lower-fidelity
    // approximation, not synthetic city data.
    function generateHourly(locationDescriptor, dayObj) {
        if (dayObj.index > 1) {
            return Promise.resolve(approximateHourlyFromDay(dayObj));
        }
        var params = Object.assign({ hours: 48 }, toLocationParams(locationDescriptor));
        return apiGet('/weather/hourly', params).then(function (data) {
            var matching = data.hourly.filter(function (h) { return h.date === dayObj.date; });
            if (!matching.length) {
                return approximateHourlyFromDay(dayObj);
            }
            var isToday = dayObj.index === 0;
            return matching.slice(0, 8).map(function (h, i) {
                return {
                    time: (isToday && i === 0) ? 'Now' : h.time,
                    icon: h.condition_icon,
                    temp: Math.round(h.temperature),
                    rain: h.rain_probability,
                    active: i === 0
                };
            });
        });
    }

    function approximateHourlyFromDay(dayObj) {
        var labels = ['6 AM', '9 AM', '12 PM', '3 PM', '6 PM', '9 PM', '12 AM'];
        var fracs = [0.15, 0.55, 0.9, 1.0, 0.7, 0.4, 0.2];
        return labels.map(function (label, i) {
            var temp = Math.round(dayObj.min + fracs[i] * (dayObj.max - dayObj.min));
            return { time: label, icon: dayObj.icon, temp: temp, rain: dayObj.rain, active: i === 2 };
        });
    }

    // generateMetrics(locationDescriptor, dayObj) -> Promise<metricsObj>
    // "Today" (index 0) always fetches the precise, real-time current
    // reading (including real AQI). Any other selected day is built from
    // the already-fetched daily forecast item (see dayFromApiItem above)
    // plus TODAY's most recently observed AQI as a reasonable same-region
    // proxy — OpenWeather's free tier does not provide a multi-day AQI
    // forecast, so a multi-day-ahead AQI number would otherwise have to
    // be invented rather than measured.
    var lastKnownAqi = null; // { aqi, label, color } cached from the last /weather/current call

    function generateMetrics(locationDescriptor, dayObj) {
        if (dayObj.index === 0) {
            var params = toLocationParams(locationDescriptor);
            return apiGet('/weather/current', params).then(function (c) {
                var uv = uvMeta(c.uv_index);
                var aqi = aqiMeta(c.air_quality.aqi);
                lastKnownAqi = { aqi: c.air_quality.aqi, label: c.air_quality.label, color: aqi.color };
                return {
                    temp: c.temperature,
                    feelsLike: c.feels_like,
                    humidity: c.humidity, humidityLabel: humidityMeta(c.humidity),
                    wind: c.wind_speed, windDir: c.wind_direction,
                    uv: c.uv_index, uvLabel: c.uv_label, uvColor: uv.color,
                    pressure: c.pressure,
                    aqi: c.air_quality.aqi, aqiLabel: c.air_quality.label, aqiColor: aqi.color,
                    sunrise: c.sunrise, sunset: c.sunset,
                    moonrise: c.moonrise, moonset: c.moonset,
                    sunriseMinutes: timeStringToMinutes(c.sunrise),
                    sunsetMinutes: timeStringToMinutes(c.sunset),
                    description: c.condition + ', feels like ' + Math.round(c.feels_like) + '\u00b0.'
                };
            });
        }

        var uvM = uvMeta(dayObj.uv);
        var aqiFallback = lastKnownAqi || { aqi: 50, label: 'Good', color: aqiMeta(50).color };
        return Promise.resolve({
            temp: Math.round((dayObj.min + dayObj.max) / 2),
            feelsLike: dayObj.feelsLike,
            humidity: dayObj.humidity, humidityLabel: humidityMeta(dayObj.humidity),
            wind: dayObj.wind, windDir: dayObj.windDir,
            uv: dayObj.uv, uvLabel: dayObj.uvLabel, uvColor: uvM.color,
            pressure: dayObj.pressure,
            aqi: aqiFallback.aqi, aqiLabel: aqiFallback.label + ' (from today)', aqiColor: aqiFallback.color,
            sunrise: dayObj.sunrise, sunset: dayObj.sunset,
            moonrise: dayObj.moonrise, moonset: dayObj.moonset,
            sunriseMinutes: timeStringToMinutes(dayObj.sunrise),
            sunsetMinutes: timeStringToMinutes(dayObj.sunset),
            description: dayObj.condition + ' expected, ' + dayObj.min + '\u00b0\u2013' + dayObj.max + '\u00b0.'
        });
    }

    function timeStringToMinutes(timeStr) {
        // "5:58 AM" -> minutes since midnight. Defensive against "--".
        var m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec((timeStr || '').trim());
        if (!m) return 360; // sane default (6:00 AM) if unparseable
        var h = parseInt(m[1], 10) % 12;
        var min = parseInt(m[2], 10);
        if (/pm/i.test(m[3])) h += 12;
        return h * 60 + min;
    }

    // generatePrediction(locationDescriptor, days) -> Promise<predictionObj>
    // `days` (the already-fetched daily array) is accepted for API-shape
    // compatibility but not required — the backend derives tomorrow's
    // prediction itself from a fresh forecast lookup.
    function generatePrediction(locationDescriptor) {
        var params = toLocationParams(locationDescriptor);
        return apiGet('/prediction', params).then(function (p) {
            return {
                confidence: p.confidence,
                confidenceLabel: p.confidence_label,
                rainProbability: p.rain_probability,
                stormProbability: p.storm_probability,
                recommendation: p.recommendation,
                riskLevel: p.risk_level,
                condition: p.condition,
                icon: p.condition_icon,
                min: p.temp_min,
                max: p.temp_max
            };
        });
    }

    // generateInsights(locationDescriptor, dayObj, metrics) -> Promise<insightsObj>
    function generateInsights(locationDescriptor) {
        var params = toLocationParams(locationDescriptor);
        return apiGet('/weather/insights', params).then(function (r) {
            return {
                travelAdvice: r.travel_advice,
                healthTip: r.health_tip,
                clothingSuggestion: r.clothing_suggestion,
                agricultureAdvice: r.agriculture_advice,
                outdoorScore: r.outdoor_score,
                uvRecommendation: r.uv_recommendation,
                uvLabel: r.uv_label,
                aqi: r.aqi,
                aqiLabel: r.aqi_label,
                pressure: r.pressure,
                visibility: r.visibility,
                wind: r.wind_speed,
                windDir: r.wind_direction,
                humidity: r.humidity,
                cloudCover: r.cloud_cover,
                dewPoint: r.dew_point
            };
        });
    }

    // =================================================================
    // OVERLAY MANAGER — unchanged (no data dependency).
    // =================================================================
    var overlayRegistry = {};
    var overlayStack = [];

    function registerOverlay(name, closeFn) {
        overlayRegistry[name] = closeFn;
    }

    function noteOpened(name) {
        overlayStack = overlayStack.filter(function (n) { return n !== name; });
        overlayStack.push(name);
    }

    function noteClosed(name) {
        overlayStack = overlayStack.filter(function (n) { return n !== name; });
    }

    function closeAllOverlaysExcept(exceptName) {
        Object.keys(overlayRegistry).forEach(function (name) {
            if (name === exceptName) return;
            try { overlayRegistry[name](); } catch (e) { /* ignore */ }
        });
        overlayStack = exceptName ? [exceptName] : [];
    }

    function closeTopOverlay() {
        if (!overlayStack.length) return false;
        var top = overlayStack[overlayStack.length - 1];
        if (overlayRegistry[top]) {
            try { overlayRegistry[top](); } catch (e) { /* ignore */ }
        }
        overlayStack.pop();
        return true;
    }

    function closeAllOverlays() {
        Object.keys(overlayRegistry).forEach(function (name) {
            try { overlayRegistry[name](); } catch (e) { /* ignore */ }
        });
        overlayStack = [];
    }

    var escListenerBound = false;
    function bindGlobalEscHandler() {
        if (escListenerBound) return;
        escListenerBound = true;
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                closeTopOverlay();
            }
        });
    }

    // =================================================================
    // PUBLIC API
    // =================================================================
    global.WeatherApp = {
        API_BASE_URL: API_BASE_URL,
        POPULAR_CITIES: POPULAR_CITIES,

        getCityData: getCityData,
        generateHourly: generateHourly,
        generateMetrics: generateMetrics,
        generatePrediction: generatePrediction,
        generateInsights: generateInsights,
        geocodeCity: geocodeCity,

        uvMeta: uvMeta,
        aqiMeta: aqiMeta,
        cToF: cToF,
        convertWind: convertWind,
        formatTemp: formatTemp,

        icons: {
            ensureDefs: ensureIconDefs,
            markup: iconMarkup,
            conditionToIcon: conditionToIcon
        },
        store: {
            load: load,
            save: save,
            update: update,
            setCity: setCity,
            setCustomLocation: setCustomLocation,
            setSelectedDay: setSelectedDay,
            setSelectedHour: setSelectedHour,
            toggleFavorite: toggleFavorite,
            currentLocationDescriptor: currentLocationDescriptor,
            defaultState: defaultState
        },
        overlay: {
            register: registerOverlay,
            opened: noteOpened,
            closed: noteClosed,
            closeAllExcept: closeAllOverlaysExcept,
            closeTop: closeTopOverlay,
            closeAll: closeAllOverlays,
            bindEsc: bindGlobalEscHandler
        }
    };
})(window);
