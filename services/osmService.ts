
import { RouteInfo } from "../types";

export interface Coordinates {
    lat: number;
    lon: number;
}

export interface GeocodeResult {
    coordinates: Coordinates | null;
    error: string | null;
}


// In-memory cache for geocoded addresses.
// This prevents re-querying the API for the same address, making the map much faster.
const geocodeCache = new Map<string, GeocodeResult>();

// Load cache from localStorage on startup
try {
    const savedCache = localStorage.getItem('geocode-cache');
    if (savedCache) {
        const parsed = JSON.parse(savedCache);
        Object.entries(parsed).forEach(([key, value]) => {
            geocodeCache.set(key, value as GeocodeResult);
        });
    }
} catch (e) {
    console.warn("Failed to load geocode cache from localStorage");
}

const saveCacheToStorage = () => {
    try {
        const obj = Object.fromEntries(geocodeCache);
        localStorage.setItem('geocode-cache', JSON.stringify(obj));
    } catch (e) {
        console.warn("Failed to save geocode cache to localStorage");
    }
};

// Define Arizona's geographical boundaries to filter out incorrect geocodes.
const ARIZONA_BOUNDS = {
    north: 37.1,    // Northern border with Utah
    south: 31.2,    // Southern border with Mexico
    west: -115.0,   // Western border with California/Nevada
    east: -108.9,   // Eastern border with New Mexico
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Expands abbreviations and generates variations of an address to increase match probability.
 */
function getAddressVariations(address: string): string[] {
    const variations = new Set<string>();

    // 1. Basic cleanup: Remove country, "story", normalize spaces
    let clean = address
        .replace(/,?\s*\b(united states|usa)\b/gi, '')
        .replace(/\b(\d+)\s*story\b/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    
    variations.add(clean);

    // Helper to expand directions/types
    const expand = (str: string) => str
        .replace(/\bN[\.]?\b/g, 'North')
        .replace(/\bS[\.]?\b/g, 'South')
        .replace(/\bE[\.]?\b/g, 'East')
        .replace(/\bW[\.]?\b/g, 'West')
        .replace(/\bSt[\.]?\b/gi, 'Street')
        .replace(/\bRd[\.]?\b/gi, 'Road')
        .replace(/\bDr[\.]?\b/gi, 'Drive')
        .replace(/\bAve[\.]?\b/gi, 'Avenue')
        .replace(/\bBlvd[\.]?\b/gi, 'Boulevard')
        .replace(/\bLn[\.]?\b/gi, 'Lane')
        .replace(/\bCt[\.]?\b/gi, 'Court')
        .replace(/\bPl[\.]?\b/gi, 'Place')
        .replace(/\bTrl[\.]?\b/gi, 'Trail')
        .replace(/\bCir[\.]?\b/gi, 'Circle')
        .replace(/\bWy[\.]?\b/gi, 'Way');

    // 2. Strip Junk (notes, gate codes, etc) using delimiters like #, (, [
    // Example: "425 N Vineyard, Mesa, AZ 85201 # (old roof)" -> "425 N Vineyard, Mesa, AZ 85201"
    const noJunk = clean.split(/[\#\(\[]|\s-\s/)[0].trim();
    if (noJunk !== clean && /\d/.test(noJunk)) {
        variations.add(noJunk);
    }

    // 3. Smart Street Extraction (Regex based) - Priority for unplotted addresses
    // Captures: Number + Direction (opt) + Name + Suffix (opt)
    // Detects end of street by comma OR known Arizona city names to handle missing commas.
    const streetRegex = /^(\d+\s+(?:[NESWnesw]\.?\s+)?[a-zA-Z0-9\s]+?(?:\b(?:St|Street|Rd|Road|Dr|Drive|Ave|Avenue|Blvd|Boulevard|Ln|Lane|Ct|Court|Pl|Place|Trl|Trail|Cir|Circle|Wy|Way)\b)?)(?:,|\s+(?:Mesa|Phoenix|Scottsdale|Tempe|Chandler|Gilbert|Glendale|Peoria|Buckeye|Surprise|Queen Creek|San Tan Valley|Apache Junction|Goodyear|Avondale|Tolleson|Litchfield Park|Paradise Valley|Fountain Hills|Cave Creek|Carefree|Anthem|New River|Sun City|Sun City West|El Mirage|Youngtown|Laveen|Maricopa|Casa Grande|Florence|Coolidge|Eloy|Arizona City|Tucson|Oro Valley|Marana|Vail|Sahuarita|Green Valley|Nogales|Rio Rico|Sierra Vista|Flagstaff|Prescott|Sedona|Payson|Cottonwood|Camp Verde|Kingman|Bullhead City|Lake Havasu City|Show Low|Page|Winslow|Holbrook|Williams|Globe|Miami|Safford|Thatcher|Douglas|Bisbee|Benson|Willcox|Yuma|Somerton|San Luis|Fortuna Foothills|Gila Bend|Wickenburg|Quartzsite|Parker|AZ)\b)/i;
    
    const match = noJunk.match(streetRegex);
    if (match) {
        const streetOnly = match[1].trim();
        // Add "Street Only" (e.g. "21036 W Maiden Lane")
        variations.add(streetOnly); 
        
        // Add "Street Only Expanded" (e.g., "21036 West Maiden Lane")
        // This is critical for the user's use case where W -> West makes it plot.
        const expandedStreet = expand(streetOnly);
        variations.add(expandedStreet);
        
        // Try Street + AZ context
        variations.add(`${expandedStreet}, AZ`);
    } else {
        // Fallback: Split by comma if regex didn't match
        const splitStreet = noJunk.split(',')[0].trim();
        if (splitStreet !== noJunk && /\d/.test(splitStreet)) {
            variations.add(splitStreet);
            variations.add(expand(splitStreet));
        }
    }

    // 4. Expand everything collected so far to ensure coverage
    Array.from(variations).forEach(v => {
        const expanded = expand(v);
        if (expanded !== v) variations.add(expanded);
    });

    // 5. Last Resort: Remove Zip Code from original
    const noZip = clean.replace(/\b\d{5}(?:-\d{4})?\b/g, '').trim().replace(/,$/, '').trim();
    if (noZip !== clean) {
        variations.add(noZip);
    }

    return Array.from(variations);
}

/**
 * Performs the raw API call to Nominatim for a specific query string.
 */
async function queryNominatim(query: string, retries = 2, initialDelay = 1000): Promise<GeocodeResult> {
    // Ensure Arizona context is present if it looks like a US address and lacks it
    let finalQuery = query;
    if (!/,\s*(az|arizona)\b/i.test(finalQuery)) {
        finalQuery += ', Arizona';
    }

    // More aggressive fix for "Corona de Tucson" which is officially part of Vail, AZ.
    if (finalQuery.toLowerCase().includes('corona de tucson')) {
        const streetPart = finalQuery.toLowerCase().split('corona de tucson')[0].trim().replace(/,$/, '').trim();
        finalQuery = `${streetPart}, Vail, AZ`;
    }

    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(finalQuery)}&format=json&limit=1`;
    let currentDelay = initialDelay;

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'RepRoutePlanner/1.0 (Arizona)'
                }
            });

            if (response.ok) {
                const data = await response.json();
                if (data && data.length > 0) {
                    const lat = parseFloat(data[0].lat);
                    const lon = parseFloat(data[0].lon);

                    // Validate that the coordinates are within Arizona's bounds.
                    if (lat >= ARIZONA_BOUNDS.south && lat <= ARIZONA_BOUNDS.north && lon >= ARIZONA_BOUNDS.west && lon <= ARIZONA_BOUNDS.east) {
                        return { coordinates: { lat, lon }, error: null };
                    } else {
                        // If we found something but it's outside bounds, treat as not found so we might try another variation
                        return { coordinates: null, error: 'Location found outside of Arizona' };
                    }
                }
                return { coordinates: null, error: 'Address not found' };
            }

            if (response.status === 503 || response.status === 429) {
                if (attempt < retries) {
                    await sleep(currentDelay);
                    currentDelay *= 2;
                    continue;
                }
            }
            return { coordinates: null, error: `API status ${response.status}: ${response.statusText}` };

        } catch (error) {
            if (attempt < retries) {
                await sleep(currentDelay);
                currentDelay *= 2;
                continue;
            }
            return { coordinates: null, error: error instanceof Error ? error.message : "Network error" };
        }
    }
    return { coordinates: null, error: 'Max retries exceeded' };
}

/**
 * Geocodes an address, trying multiple variations if the initial query fails.
 */
async function geocodeSingleAddressAPI(address: string): Promise<GeocodeResult> {
    const variations = getAddressVariations(address);
    let lastError = 'Address not found';

    for (let i = 0; i < variations.length; i++) {
        const variation = variations[i];
        
        // Respect rate limiting between variations for the same job
        if (i > 0) await sleep(1200);

        const result = await queryNominatim(variation);
        if (result.coordinates) {
            return result;
        }
        if (result.error) lastError = result.error;
    }

    return { coordinates: null, error: lastError };
}


/**
 * Geocodes a list of addresses in the background to populate the cache.
 * This function respects the API rate limit but does not block the main thread.
 * It's intended to be called as a "fire-and-forget" task.
 * @param addresses An array of street addresses to pre-cache.
 */
export async function preCacheGeocodes(addresses: string[]): Promise<void> {
    const uniqueAddresses = [...new Set(addresses)];
    const addressesToFetch = uniqueAddresses.filter(address => !geocodeCache.has(address));

    if (addressesToFetch.length === 0) {
        return;
    }

    console.log(`[GeoCache] Pre-caching ${addressesToFetch.length} new addresses in the background.`);
    
    for (const address of addressesToFetch) {
        // Check cache again in case another process geocoded it
        if (!geocodeCache.has(address)) {
            await sleep(1000); // Respect Nominatim's usage policy
            const result = await geocodeSingleAddressAPI(address);
            geocodeCache.set(address, result);
            saveCacheToStorage(); // Save after every new fetch
        }
    }
    console.log(`[GeoCache] Finished pre-caching.`);
}

/**
 * Geocodes a list of addresses. It first checks a cache for existing coordinates.
 * For any addresses not in the cache, it calls the Nominatim API with a delay
 * to comply with the usage policy (max 1 request per second).
 * This version returns a result object with coordinates or an error, preserving order.
 * @param addresses An array of street addresses.
 * @returns A promise that resolves to an array of `GeocodeResult` objects.
 */
export async function geocodeAddresses(addresses: string[]): Promise<GeocodeResult[]> {
    const uniqueAddressesToFetch = [...new Set(addresses)].filter(addr => !geocodeCache.has(addr));

    // Fetch any addresses that were not in the cache sequentially
    if (uniqueAddressesToFetch.length > 0) {
        for (const address of uniqueAddressesToFetch) {
            // Re-check cache in case a parallel pre-cache process is running
            if (geocodeCache.has(address)) continue;
            
            await sleep(1000); // Respect Nominatim's usage policy of max 1 request/sec
            const result = await geocodeSingleAddressAPI(address);
            geocodeCache.set(address, result); // Cache the result (even if null)
            saveCacheToStorage(); // Save after every new fetch
        }
    }
    
    // Now that the cache is populated, map over the original addresses to preserve order.
    return addresses.map(address => geocodeCache.get(address) ?? { coordinates: null, error: 'Internal cache failure' });
}


/**
 * Fetches route information (geometry, distance, duration) from the OSRM API.
 * @param coordinates An array of Coordinates objects representing the stops.
 * @returns A promise that resolves to a RouteInfo object or null.
 */
export async function fetchRoute(coordinates: Coordinates[]): Promise<RouteInfo | null> {
    if (coordinates.length < 2) return null;

    const coordinatesString = coordinates.map(c => `${c.lon},${c.lat}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coordinatesString}?overview=full&geometries=geojson`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`OSRM API error: ${response.statusText}`);
        }
        const data = await response.json();
        if (data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            return {
                distance: route.distance * 0.000621371, // meters to miles
                duration: route.duration / 60, // seconds to minutes
                geometry: route.geometry,
                coordinates: coordinates,
            };
        }
        return null;
    } catch (error) {
        console.error("Failed to fetch route from OSRM:", error);
        return null;
    }
}
