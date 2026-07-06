/*!
 * weather-data.js
 * ---------------------------------------------------------------
 * Single shared source of truth for the whole app (Home, Forecast,
 * AI Prediction, Insights, Profile). Every page includes this file
 * BEFORE its own inline <script>.
 *
 * When a real backend (FastAPI) is ready, only the functions in the
 * "DATA GENERATION" section below need to be swapped for fetch()
 * calls that return the same shapes — nothing else in any page has
 * to change.
 * ---------------------------------------------------------------
 */
(function (global) {
    'use strict';

    var STORAGE_KEY = 'weatherAppStore';

    // =================================================================
    // CITY PROFILES
    // =================================================================
    var CITY_PROFILES = {
        chennai:      { display: 'Chennai, India',      baseMax: 33, baseMin: 26, climate: 'coastal',  aqiBase: 58,  favTag: 'Current Location' },
        bangalore:    { display: 'Bangalore, India',    baseMax: 27, baseMin: 18, climate: 'temperate', aqiBase: 62 },
        mumbai:       { display: 'Mumbai, India',       baseMax: 31, baseMin: 25, climate: 'coastal',  aqiBase: 95 },
        delhi:        { display: 'Delhi, India',        baseMax: 36, baseMin: 24, climate: 'dry',      aqiBase: 152 },
        hyderabad:    { display: 'Hyderabad, India',    baseMax: 29, baseMin: 21, climate: 'mixed',    aqiBase: 88 },
        chengalpattu: { display: 'Chengalpattu, India', baseMax: 34, baseMin: 25, climate: 'coastal',  aqiBase: 55 },
        kolkata:      { display: 'Kolkata, India',      baseMax: 32, baseMin: 26, climate: 'mixed',    aqiBase: 110 },
        pune:         { display: 'Pune, India',         baseMax: 28, baseMin: 19, climate: 'temperate', aqiBase: 70 },
        madurai:      { display: 'Madurai, India',      baseMax: 35, baseMin: 24, climate: 'dry',      aqiBase: 60 },
        kochi:        { display: 'Kochi, India',        baseMax: 30, baseMin: 24, climate: 'coastal',  aqiBase: 50 },
        jaipur:       { display: 'Jaipur, India',       baseMax: 38, baseMin: 23, climate: 'dry',      aqiBase: 130 },
        shimla:       { display: 'Shimla, India',       baseMax: 12, baseMin: 2,  climate: 'snowy',    aqiBase: 35 }
    };

    var CLIMATE_CYCLES = {
        coastal:   ['Partly Cloudy', 'Rain', 'Thunderstorm', 'Cloudy', 'Sunny', 'Partly Cloudy', 'Rain', 'Sunny', 'Partly Cloudy', 'Cloudy', 'Rain', 'Thunderstorm', 'Cloudy', 'Partly Cloudy', 'Sunny'],
        temperate: ['Cloudy', 'Drizzle', 'Partly Cloudy', 'Sunny', 'Windy', 'Cloudy', 'Rain', 'Partly Cloudy', 'Sunny', 'Mist', 'Cloudy', 'Drizzle', 'Sunny', 'Partly Cloudy', 'Windy'],
        dry:       ['Sunny', 'Sunny', 'Windy', 'Sunny', 'Partly Cloudy', 'Sunny', 'Fog', 'Sunny', 'Sunny', 'Windy', 'Sunny', 'Partly Cloudy', 'Sunny', 'Sunny', 'Fog'],
        mixed:     ['Partly Cloudy', 'Cloudy', 'Thunderstorm', 'Rain', 'Sunny', 'Mist', 'Cloudy', 'Partly Cloudy', 'Rain', 'Sunny', 'Cloudy', 'Windy', 'Partly Cloudy', 'Thunderstorm', 'Sunny'],
        snowy:     ['Snow', 'Cloudy', 'Snow', 'Partly Cloudy', 'Snow', 'Mist', 'Cloudy', 'Snow', 'Sunny', 'Fog', 'Snow', 'Cloudy', 'Partly Cloudy', 'Snow', 'Sunny']
    };

    var RAIN_RANGE = {
        'Sunny': [3, 12], 'Partly Cloudy': [10, 25], 'Cloudy': [20, 40], 'Drizzle': [40, 60],
        'Rain': [60, 80], 'Thunderstorm': [75, 95], 'Mist': [15, 30], 'Windy': [5, 20],
        'Fog': [10, 25], 'Snow': [45, 70]
    };

    var CONDITION_ICON = {
        'sunny': 'icon-sunny', 'clear sky': 'icon-sunny', 'hot & dry': 'icon-sunny', 'clear': 'icon-sunny',
        'partly cloudy': 'icon-partly-cloudy', 'scattered clouds': 'icon-partly-cloudy',
        'cloudy': 'icon-cloudy', 'overcast': 'icon-cloudy',
        'rain': 'icon-rain', 'light rain': 'icon-rain', 'showers': 'icon-rain', 'rain showers': 'icon-rain',
        'thunderstorm': 'icon-thunder', 'thunder': 'icon-thunder', 'storm': 'icon-thunder',
        'drizzle': 'icon-drizzle',
        'snow': 'icon-snow', 'snowfall': 'icon-snow',
        'mist': 'icon-mist', 'humid & hazy': 'icon-mist', 'haze': 'icon-mist', 'hazy': 'icon-mist',
        'windy': 'icon-windy', 'breezy': 'icon-windy',
        'fog': 'icon-fog', 'foggy': 'icon-fog'
    };

    var CONDITION_DESC = {
        'Sunny': 'Clear skies and bright sunshine throughout the day. Great for outdoor activities.',
        'Partly Cloudy': 'Partly cloudy skies throughout the day. Pleasant and warm.',
        'Cloudy': 'Overcast skies with limited sunshine. Mild temperatures expected.',
        'Rain': 'Light to moderate showers expected on and off throughout the day. Carry an umbrella.',
        'Thunderstorm': 'Thunderstorms likely with heavy rainfall. Stay indoors if possible.',
        'Drizzle': 'Light drizzle throughout the day. A light jacket should be enough.',
        'Snow': 'Snowfall expected. Roads may be slippery — dress warmly.',
        'Mist': 'Misty conditions with reduced visibility, especially in the morning.',
        'Windy': 'Strong, gusty winds expected throughout the day.',
        'Fog': 'Dense fog expected, especially early morning. Drive carefully.'
    };

    // =================================================================
    // DETERMINISTIC RANDOM HELPERS
    // =================================================================
    function seededRand(seed) {
        var x = Math.sin(seed * 12.9898) * 43758.5453;
        return x - Math.floor(x);
    }

    function citySeedBase(cityKey) {
        var sum = 0;
        for (var i = 0; i < cityKey.length; i++) sum += cityKey.charCodeAt(i) * (i + 7);
        return sum;
    }

    function lerp(range, t) { return range[0] + t * (range[1] - range[0]); }

    function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

    function minutesToTime(totalMinutes) {
        var m = ((totalMinutes % 1440) + 1440) % 1440;
        var h = Math.floor(m / 60);
        var min = Math.floor(m % 60);
        var ampm = h >= 12 ? 'PM' : 'AM';
        var h12 = h % 12;
        if (h12 === 0) h12 = 12;
        return h12 + ':' + String(min).padStart(2, '0') + ' ' + ampm;
    }

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

    var WIND_DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    var DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    function dayMeta(index) {
        var d = new Date();
        d.setDate(d.getDate() + index);
        return {
            label: index === 0 ? 'Today' : DAY_NAMES[d.getDay()],
            date: MONTH_NAMES[d.getMonth()] + ' ' + String(d.getDate()).padStart(2, '0'),
            weekday: DAY_NAMES[d.getDay()],
            jsDate: d
        };
    }

    // =================================================================
    // DATA GENERATION  (swap these for API calls when a backend exists)
    // =================================================================
    var forecastCache = {};

    function generateForecastDays(cityKey) {
        if (forecastCache[cityKey]) return forecastCache[cityKey];
        var profile = CITY_PROFILES[cityKey] || CITY_PROFILES.chennai;
        var cycle = CLIMATE_CYCLES[profile.climate] || CLIMATE_CYCLES.mixed;
        var seedBase = citySeedBase(cityKey);
        var absMin = profile.climate === 'snowy' ? -5 : 15;
        var absMax = profile.climate === 'snowy' ? 20 : 40;

        var days = [];
        for (var i = 0; i < 15; i++) {
            var condition = cycle[i % cycle.length];
            var meta = dayMeta(i);
            var tempJitter = (seededRand(seedBase + i * 3.1) - 0.5) * 4;
            var condOffset = condition === 'Sunny' ? 2 : (condition === 'Rain' || condition === 'Thunderstorm' || condition === 'Snow') ? -3 : 0;
            var max = Math.round(profile.baseMax + tempJitter + condOffset);
            var min = Math.round(profile.baseMin + tempJitter * 0.7 + condOffset * 0.6);
            if (min >= max) min = max - 4;

            var rr = RAIN_RANGE[condition] || [10, 30];
            var rain = Math.round(lerp(rr, seededRand(seedBase + i * 5.7)));

            var barLeft = clamp(Math.round((min - absMin) / (absMax - absMin) * 100), 2, 90);
            var barRight = clamp(Math.round((absMax - max) / (absMax - absMin) * 100), 2, 90);

            days.push({
                index: i,
                day: meta.label,
                date: meta.date,
                weekday: meta.weekday,
                icon: CONDITION_ICON[condition.toLowerCase()] || 'icon-cloudy',
                condition: condition,
                min: min,
                max: max,
                rain: rain,
                barLeft: barLeft,
                barRight: barRight
            });
        }
        forecastCache[cityKey] = days;
        return days;
    }

    function generateHourly(cityKey, dayObj) {
        var seedBase = citySeedBase(cityKey) + dayObj.index * 101;
        if (dayObj.index === 0) {
            var now = new Date();
            var labels = ['Now'];
            var hourList = [now.getHours()];
            for (var s = 1; s <= 6; s++) {
                var h = (now.getHours() + s) % 24;
                hourList.push(h);
                var ampm = h >= 12 ? 'PM' : 'AM';
                var h12 = h % 12; if (h12 === 0) h12 = 12;
                labels.push(h12 + ' ' + ampm);
            }
            return labels.map(function (label, i) {
                var frac = 0.3 + 0.5 * Math.sin((hourList[i] / 24) * Math.PI);
                var temp = Math.round(dayObj.min + clamp(frac, 0, 1) * (dayObj.max - dayObj.min));
                var jitter = Math.round((seededRand(seedBase + i * 2.3) - 0.5) * 16);
                var rain = clamp(dayObj.rain + jitter, 0, 100);
                var icon = i === 0 ? dayObj.icon : (rain > 55 ? (dayObj.icon === 'icon-thunder' ? 'icon-thunder' : 'icon-rain') : dayObj.icon);
                return { time: label, icon: icon, temp: temp, rain: rain, active: i === 0 };
            });
        }
        var labels2 = ['6 AM', '9 AM', '12 PM', '3 PM', '6 PM', '9 PM', '12 AM'];
        var fracs = [0.15, 0.55, 0.9, 1.0, 0.7, 0.4, 0.2];
        return labels2.map(function (label, i) {
            var frac = fracs[i];
            var temp = Math.round(dayObj.min + frac * (dayObj.max - dayObj.min));
            var jitter = Math.round((seededRand(seedBase + i * 10.1) - 0.5) * 20);
            var rain = clamp(dayObj.rain + jitter, 0, 100);
            var icon = frac < 0.3 ? (dayObj.icon === 'icon-sunny' ? 'icon-partly-cloudy' : dayObj.icon) : dayObj.icon;
            return { time: label, icon: icon, temp: temp, rain: rain, active: i === 2 };
        });
    }

    function generateMetrics(cityKey, dayObj) {
        var profile = CITY_PROFILES[cityKey] || CITY_PROFILES.chennai;
        var seedBase = citySeedBase(cityKey) + dayObj.index * 7;
        var isToday = dayObj.index === 0;

        var humidityRange = { coastal: [65, 88], temperate: [45, 68], dry: [25, 45], mixed: [55, 80], snowy: [50, 75] }[profile.climate] || [50, 75];
        var uvRange = dayObj.condition === 'Sunny' ? [8, 10] : (dayObj.condition === 'Cloudy' || dayObj.condition === 'Rain' || dayObj.condition === 'Thunderstorm' || dayObj.condition === 'Fog') ? [1, 3] : [4, 7];

        var humidity = Math.round(lerp(humidityRange, seededRand(seedBase + 1)));
        var wind = 6 + Math.round(seededRand(seedBase + 2) * (dayObj.condition === 'Windy' ? 30 : 20));
        var windDir = WIND_DIRS[(seedBase + dayObj.index) % WIND_DIRS.length];
        var uv = Math.round(lerp(uvRange, seededRand(seedBase + 3)));
        var uvInfo = uvMeta(uv);
        var pressure = 1008 + Math.round((seededRand(seedBase + 4) - 0.5) * 20);
        var aqi = Math.round(profile.aqiBase + (seededRand(seedBase + 5) - 0.5) * 24);
        var aqiInfo = aqiMeta(aqi);

        var sunriseMinutes = 5 * 60 + 44 + citySeedBase(cityKey) % 20 - dayObj.index;
        var sunsetMinutes = 18 * 60 + 32 - citySeedBase(cityKey) % 15 + dayObj.index;
        var moonriseMinutes = 21 * 60 + 15 + dayObj.index * 50;
        var moonsetMinutes = 6 * 60 + 10 + dayObj.index * 50;

        var feelsOffset = dayObj.condition === 'Sunny' ? 3 : (dayObj.condition === 'Rain' || dayObj.condition === 'Thunderstorm') ? -2 : (dayObj.condition === 'Snow') ? -4 : 1;
        var temp = isToday ? dayObj.max - 1 : dayObj.max - 1;

        return {
            temp: temp,
            feelsLike: temp + feelsOffset,
            humidity: humidity, humidityLabel: humidityMeta(humidity),
            wind: wind, windDir: windDir,
            uv: uv, uvLabel: uvInfo.label, uvColor: uvInfo.color,
            pressure: pressure,
            aqi: clamp(aqi, 5, 500), aqiLabel: aqiInfo.label, aqiColor: aqiInfo.color,
            sunrise: minutesToTime(sunriseMinutes), sunset: minutesToTime(sunsetMinutes),
            sunriseMinutes: ((sunriseMinutes % 1440) + 1440) % 1440,
            sunsetMinutes: ((sunsetMinutes % 1440) + 1440) % 1440,
            moonrise: minutesToTime(moonriseMinutes), moonset: minutesToTime(moonsetMinutes),
            description: CONDITION_DESC[dayObj.condition] || 'Weather conditions expected as forecasted.'
        };
    }

    function generatePrediction(cityKey, days) {
        var tomorrow = days[1] || days[0];
        var seedBase = citySeedBase(cityKey) + 999;
        var confidence = Math.round(80 + seededRand(seedBase) * 15);
        var rainProbability = tomorrow.rain;
        var stormProbability = tomorrow.icon === 'icon-thunder'
            ? Math.round(65 + seededRand(seedBase + 1) * 25)
            : (tomorrow.icon === 'icon-rain' ? Math.round(20 + seededRand(seedBase + 1) * 25) : Math.round(seededRand(seedBase + 1) * 12));

        var riskLevel = (tomorrow.icon === 'icon-thunder' || tomorrow.icon === 'icon-snow') ? 'High'
            : (tomorrow.icon === 'icon-rain' || tomorrow.icon === 'icon-fog' || tomorrow.icon === 'icon-mist') ? 'Moderate' : 'Low';

        var recommendation;
        switch (tomorrow.icon) {
            case 'icon-thunder': recommendation = 'Avoid outdoor activities and unplug sensitive electronics during storm hours.'; break;
            case 'icon-rain': case 'icon-drizzle': recommendation = 'Carry an umbrella and plan outdoor activities around the rain window.'; break;
            case 'icon-snow': recommendation = 'Dress warmly and watch for slippery roads.'; break;
            case 'icon-fog': case 'icon-mist': recommendation = 'Drive carefully and allow extra travel time due to low visibility.'; break;
            case 'icon-windy': recommendation = 'Secure loose outdoor items and be cautious of strong gusts.'; break;
            case 'icon-sunny': recommendation = 'Apply sunscreen and stay hydrated if outdoors for long periods.'; break;
            default: recommendation = 'Generally comfortable conditions expected — a normal day outdoors.';
        }

        return {
            confidence: confidence,
            confidenceLabel: confidence >= 90 ? 'Very High' : confidence >= 75 ? 'High' : 'Moderate',
            rainProbability: rainProbability,
            stormProbability: clamp(stormProbability, 0, 100),
            recommendation: recommendation,
            riskLevel: riskLevel,
            condition: tomorrow.condition,
            icon: tomorrow.icon,
            min: tomorrow.min,
            max: tomorrow.max
        };
    }

    function generateInsights(cityKey, dayObj, metrics) {
        var travelAdvice, healthTip, clothingSuggestion, agricultureAdvice;

        if (dayObj.icon === 'icon-thunder' || dayObj.icon === 'icon-rain' || dayObj.icon === 'icon-drizzle') {
            travelAdvice = 'Expect delays on waterlogged routes — allow extra travel time and avoid low-lying roads.';
            clothingSuggestion = 'Waterproof jacket or umbrella, and non-slip footwear recommended.';
            agricultureAdvice = 'Good conditions for irrigation-free watering; hold off on pesticide spraying until rain clears.';
        } else if (dayObj.icon === 'icon-snow') {
            travelAdvice = 'Roads may be slippery — drive slowly and check local advisories before travelling.';
            clothingSuggestion = 'Layer up with a warm coat, gloves, and insulated boots.';
            agricultureAdvice = 'Protect sensitive crops from frost damage overnight.';
        } else if (dayObj.icon === 'icon-fog' || dayObj.icon === 'icon-mist') {
            travelAdvice = 'Reduced visibility expected in the morning — use fog lamps and drive carefully.';
            clothingSuggestion = 'A light jacket is enough; visibility, not temperature, is the main concern today.';
            agricultureAdvice = 'Morning mist can help retain soil moisture — good day for transplanting seedlings.';
        } else if (dayObj.icon === 'icon-sunny') {
            travelAdvice = 'Clear skies make for smooth travel — a great day for a road trip or outdoor errands.';
            clothingSuggestion = 'Light, breathable cotton clothing with sunglasses and a hat.';
            agricultureAdvice = 'Good day for harvesting; ensure adequate irrigation to offset stronger evaporation.';
        } else if (dayObj.icon === 'icon-windy') {
            travelAdvice = 'Two-wheeler riders should be cautious of strong crosswinds on open roads.';
            clothingSuggestion = 'A windbreaker will keep you comfortable outdoors today.';
            agricultureAdvice = 'Hold off on spraying pesticides — strong winds will reduce effectiveness and cause drift.';
        } else {
            travelAdvice = 'No major disruptions expected — normal travel conditions throughout the day.';
            clothingSuggestion = 'Light layers work well for the mild, overcast conditions today.';
            agricultureAdvice = 'Stable conditions — routine field activity can continue as planned.';
        }

        if (metrics.aqi > 150) {
            healthTip = 'Air quality is poor today — sensitive groups should limit prolonged outdoor exertion.';
        } else if (metrics.uv >= 8) {
            healthTip = 'UV levels are very high — limit direct sun exposure between 10 AM and 4 PM.';
        } else if (metrics.humidity >= 80) {
            healthTip = 'High humidity may make it feel warmer than it is — stay hydrated.';
        } else {
            healthTip = 'Conditions are generally favorable for outdoor activity today.';
        }

        var outdoorScore = clamp(Math.round(
            100 - dayObj.rain * 0.5 - Math.max(0, metrics.uv - 6) * 4 - Math.max(0, metrics.aqi - 80) * 0.25
        ), 5, 98);

        var uvInfo = uvMeta(metrics.uv);
        var uvRecommendation = metrics.uv >= 8
            ? 'Wear SPF 50+ sunscreen, sunglasses, and avoid peak sun hours.'
            : metrics.uv >= 6
                ? 'SPF 30+ sunscreen recommended if outdoors for extended periods.'
                : metrics.uv >= 3
                    ? 'Minimal protection needed for most people.'
                    : 'No protection required today.';

        return {
            travelAdvice: travelAdvice,
            healthTip: healthTip,
            clothingSuggestion: clothingSuggestion,
            agricultureAdvice: agricultureAdvice,
            outdoorScore: outdoorScore,
            uvRecommendation: uvRecommendation,
            uvLabel: uvInfo.label
        };
    }

    function getCityData(cityKey) {
        var key = CITY_PROFILES[cityKey] ? cityKey : 'chennai';
        var profile = CITY_PROFILES[key];
        var days = generateForecastDays(key);
        return { key: key, profile: profile, days: days };
    }

    // =================================================================
    // CITY RESOLUTION (search)
    // =================================================================
    function resolveCityKey(query) {
        if (!query) return null;
        var q = query.trim().toLowerCase();
        if (CITY_PROFILES[q]) return q;
        for (var key in CITY_PROFILES) {
            if (!CITY_PROFILES.hasOwnProperty(key)) continue;
            var display = CITY_PROFILES[key].display.toLowerCase();
            if (display.indexOf(q) === 0 || key.indexOf(q) === 0 || display.split(',')[0] === q) {
                return key;
            }
        }
        return null;
    }

    function allCityKeys() { return Object.keys(CITY_PROFILES); }

    // =================================================================
    // STORE (persisted in localStorage — the future API swap point)
    // =================================================================
    function defaultState() {
        return {
            cityKey: 'chennai',
            cityDisplay: CITY_PROFILES.chennai.display,
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
            var parsed = JSON.parse(raw);
            var merged = Object.assign(defaultState(), parsed);
            return merged;
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

    function setCity(cityKeyOrQuery) {
        var key = resolveCityKey(cityKeyOrQuery) || cityKeyOrQuery;
        if (!CITY_PROFILES[key]) return load();
        return update(function (s) {
            s.cityKey = key;
            s.cityDisplay = CITY_PROFILES[key].display;
            s.selectedDayIndex = 0;
            s.selectedHourIndex = 0;
            if (s.searchHistory.indexOf(CITY_PROFILES[key].display) === -1) {
                s.searchHistory.push(CITY_PROFILES[key].display);
                if (s.searchHistory.length > 8) s.searchHistory.shift();
            }
        });
    }

    function setCustomLocation(display, lat, lng) {
        // Deterministically map arbitrary coordinates onto one of our
        // known climate profiles so "Current Location" still yields a
        // full, consistent dataset without needing a live geocoding API.
        var keys = allCityKeys();
        var idx = Math.abs(Math.round((lat + lng) * 1000)) % keys.length;
        var baseKey = keys[idx];
        return update(function (s) {
            s.cityKey = baseKey;
            s.cityDisplay = display;
            s.selectedDayIndex = 0;
            s.selectedHourIndex = 0;
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
        var state = load();
        var idx = state.favorites.indexOf(cityDisplay);
        var added;
        update(function (s) {
            var i = s.favorites.indexOf(cityDisplay);
            if (i === -1) { s.favorites.push(cityDisplay); added = true; }
            else { s.favorites.splice(i, 1); added = false; }
        });
        return added;
    }

    // =================================================================
    // ICONS — full inline SVG <defs> covering every supported condition
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
    // OVERLAY MANAGER — guarantees only one popup/modal/dropdown/sheet
    // is ever open at a time, ESC always closes the current one, and
    // every registered overlay gets outside-click + ESC handling for
    // free.
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
    // MISC HELPERS reused by page scripts
    // =================================================================
    function cToF(c) { return Math.round((c * 9) / 5 + 32); }

    function convertWind(kmh, unit) {
        return unit === 'mph' ? Math.round(kmh * 0.621371) : Math.round(kmh);
    }

    function formatTemp(celsius, unit) {
        return (unit === 'F' ? cToF(celsius) : Math.round(celsius)) + String.fromCharCode(176);
    }

    // =================================================================
    // PUBLIC API
    // =================================================================
    global.WeatherApp = {
        CITY_PROFILES: CITY_PROFILES,
        allCityKeys: allCityKeys,
        resolveCityKey: resolveCityKey,
        getCityData: getCityData,
        generateHourly: generateHourly,
        generateMetrics: generateMetrics,
        generatePrediction: generatePrediction,
        generateInsights: generateInsights,
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
