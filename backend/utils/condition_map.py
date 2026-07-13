"""
utils/condition_map.py
------------------------
Translates Open-Meteo's WMO `weather_code` into the small, canonical
vocabulary the CanPredict frontend already knows how to render (see
weather-data.js -> CONDITION_ICON). Keeping this mapping identical
between backend and frontend is what lets the existing icon set (Sunny,
Partly Cloudy, Cloudy, Rain, Thunderstorm, Drizzle, Snow, Mist, Windy, Fog)
work unmodified with real data.

Reference: WMO weather interpretation codes (WW), as used by Open-Meteo.
https://open-meteo.com/en/docs (see "WMO Weather interpretation codes")
"""
from typing import Tuple

# WMO code -> (canonical label, icon id)
_CODE_MAP = {
    0: ("Sunny", "icon-sunny"),            # Clear sky
    1: ("Sunny", "icon-sunny"),            # Mainly clear
    2: ("Partly Cloudy", "icon-partly-cloudy"),  # Partly cloudy
    3: ("Cloudy", "icon-cloudy"),          # Overcast
    45: ("Fog", "icon-fog"),               # Fog
    48: ("Fog", "icon-fog"),               # Depositing rime fog
    51: ("Drizzle", "icon-drizzle"),       # Drizzle: light
    53: ("Drizzle", "icon-drizzle"),       # Drizzle: moderate
    55: ("Drizzle", "icon-drizzle"),       # Drizzle: dense
    56: ("Drizzle", "icon-drizzle"),       # Freezing drizzle: light
    57: ("Drizzle", "icon-drizzle"),       # Freezing drizzle: dense
    61: ("Rain", "icon-rain"),             # Rain: slight
    63: ("Rain", "icon-rain"),             # Rain: moderate
    65: ("Rain", "icon-rain"),             # Rain: heavy
    66: ("Rain", "icon-rain"),             # Freezing rain: light
    67: ("Rain", "icon-rain"),             # Freezing rain: heavy
    71: ("Snow", "icon-snow"),             # Snowfall: slight
    73: ("Snow", "icon-snow"),             # Snowfall: moderate
    75: ("Snow", "icon-snow"),             # Snowfall: heavy
    77: ("Snow", "icon-snow"),             # Snow grains
    80: ("Rain", "icon-rain"),             # Rain showers: slight
    81: ("Rain", "icon-rain"),             # Rain showers: moderate
    82: ("Rain", "icon-rain"),             # Rain showers: violent
    85: ("Snow", "icon-snow"),             # Snow showers: slight
    86: ("Snow", "icon-snow"),             # Snow showers: heavy
    95: ("Thunderstorm", "icon-thunder"),  # Thunderstorm: slight/moderate
    96: ("Thunderstorm", "icon-thunder"),  # Thunderstorm with slight hail
    99: ("Thunderstorm", "icon-thunder"),  # Thunderstorm with heavy hail
}


def map_condition(code: int, wind_speed_kmh: float = 0.0) -> Tuple[str, str]:
    """
    Returns (label, icon_id) for a WMO weather code.

    WMO codes describe precipitation/cloud state only — there's no
    dedicated "windy" code — so, matching the frontend's own condition
    vocabulary, a clear/cloudy day is promoted to "Windy" once wind speed
    crosses a "Fresh Breeze" threshold (~39 km/h on the Beaufort scale).
    Rain/snow/storm/fog conditions are left as-is even if windy, since
    those are more informative to show than "Windy" alone.
    """
    label, icon = _CODE_MAP.get(code, ("Cloudy", "icon-cloudy"))

    if icon in ("icon-sunny", "icon-partly-cloudy", "icon-cloudy") and wind_speed_kmh >= 39:
        return "Windy", "icon-windy"

    return label, icon
