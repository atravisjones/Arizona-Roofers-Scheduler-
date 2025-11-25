
import { Coordinates } from "./osmService";

// This file contains geographical data and rules for the Rep Route Planner.

// A detailed graph of Arizona city adjacencies based on user-provided logic.
// This is used to ensure auto-assigned jobs create logical, sequential travel paths.
// ALL CITIES ARE STORED IN LOWERCASE FOR CASE-INSENSITIVE MATCHING
const GREATER_PHOENIX_CORE_ADJACENCY: Record<string, string[]> = {
  "phoenix": ["glendale", "peoria", "paradise valley", "scottsdale", "tempe", "avondale", "tolleson", "ahwatukee foothills", "laveen", "new river", "anthem"],
  "glendale": ["phoenix", "peoria", "el mirage"],
  "peoria": ["glendale", "phoenix", "surprise", "sun city", "sun city west"],
  "avondale": ["phoenix", "tolleson", "goodyear", "litchfield park"],
  "goodyear": ["avondale", "buckeye", "litchfield park", "estrella mountain ranch"],
  "tolleson": ["phoenix", "avondale"],
  "paradise valley": ["phoenix", "scottsdale"],
  "scottsdale": ["paradise valley", "phoenix", "tempe", "fountain hills", "rio verde", "fort mcdowell"],
  "tempe": ["phoenix", "scottsdale", "mesa", "chandler", "guadalupe"],
  "mesa": ["tempe", "scottsdale", "gilbert", "apache junction", "red mountain"],
  "gilbert": ["mesa", "chandler", "queen creek", "higley"],
  "chandler": ["tempe", "gilbert", "ahwatukee foothills", "sun lakes"],
  "queen creek": ["gilbert", "san tan valley"],
  "apache junction": ["mesa", "gold canyon"],
  "litchfield park": ["goodyear", "avondale"],
  "buckeye": ["goodyear", "sun city festival", "verrado"],
  "surprise": ["peoria", "waddell", "sun city grand"],
  "fountain hills": ["scottsdale", "rio verde", "fort mcdowell"],
  "guadalupe": ["tempe", "phoenix"],
  "ahwatukee foothills": ["phoenix", "chandler", "tempe"],
  "sun lakes": ["chandler"],
  "gold canyon": ["apache junction"],
  "rio verde": ["scottsdale", "fountain hills"],
  "fort mcdowell": ["fountain hills"]
};

const LOWER_VALLEY_ADJACENCY: Record<string, string[]> = {
  "maricopa": ["casa blanca", "stanfield", "casa grande"],
  "casa blanca": ["maricopa", "sacaton"],
  "sacaton": ["casa blanca", "blackwater", "casa grande"],
  "blackwater": ["sacaton", "coolidge"],
  "coolidge": ["blackwater", "casa grande", "florence"],
  "casa grande": ["stanfield", "maricopa", "sacaton", "coolidge", "arizona city", "toltec"],
  "stanfield": ["casa grande", "maricopa"],
  "arizona city": ["casa grande", "eloy"],
  "eloy": ["arizona city", "chuichu", "toltec"],
  "toltec": ["eloy", "casa grande"],
  "chuichu": ["eloy", "casa grande"],
  "florence": ["coolidge", "san tan valley", "queen creek"],
  "san tan valley": ["florence", "queen creek"],
};


// Merge all adjacency maps into one comprehensive map
export const ARIZONA_CITY_ADJACENCY = [
    GREATER_PHOENIX_CORE_ADJACENCY,
    LOWER_VALLEY_ADJACENCY,
].reduce((acc, currentMap) => {
    for (const city in currentMap) {
        if (!acc[city]) {
            acc[city] = [];
        }
        acc[city] = [...new Set([...acc[city], ...currentMap[city]])];
    }
    return acc;
}, {} as Record<string, string[]>);


// Make the entire graph bidirectional
Object.keys(ARIZONA_CITY_ADJACENCY).forEach(city => {
    ARIZONA_CITY_ADJACENCY[city].forEach(neighbor => {
        if (!ARIZONA_CITY_ADJACENCY[neighbor]) {
            ARIZONA_CITY_ADJACENCY[neighbor] = [];
        }
        if (!ARIZONA_CITY_ADJACENCY[neighbor].includes(city)) {
            ARIZONA_CITY_ADJACENCY[neighbor].push(city);
        }
    });
});


// New Territory Definitions based on user's detailed breakdown
// CITIES ARE STORED IN LOWERCASE FOR CASE-INSENSITIVE MATCHING
export const GREATER_PHOENIX_CITIES = new Set([
    "phoenix", "scottsdale", "tempe", "mesa", "chandler", "gilbert", "glendale", "peoria", "surprise", 
    "avondale", "goodyear", "buckeye", "queen creek", "san tan valley", "apache junction", "fountain hills", 
    "paradise valley", "cave creek", "carefree", "anthem", "el mirage", "youngtown", "litchfield park", 
    "tolleson", "waddell", "sun city", "sun city west", "ahwatukee", "new river", "gold canyon", "sun lakes", 
    "maricopa", "casa grande", "florence", "coolidge", "laveen", "guadalupe", "ahwatukee foothills",
    "rio verde", "fort mcdowell", "sun city festival", "sun city grand", "verrado", "estrella mountain ranch",
    "higley", "red mountain"
]);

export const WEST_VALLEY_CITIES = new Set([
    "buckeye", "surprise", "waddell", "sun city west", "sun city", "sun city festival", 
    "sun city grand", "el mirage", "youngtown", "peoria", "glendale", 
    "litchfield park", "goodyear", "avondale", "tolleson", "verrado", 
    "estrella mountain ranch"
]);

export const EAST_VALLEY_CITIES = new Set([
    "scottsdale", "paradise valley", "fountain hills", "rio verde", "fort mcdowell", 
    "tempe", "mesa", "gilbert", "chandler", "queen creek", "san tan valley", 
    "apache junction", "gold canyon", "sun lakes", "higley", "red mountain"
]);

export const NORTHERN_AZ_CITIES = new Set([
    "prescott", "prescott valley", "flagstaff", "payson", "sedona", "cottonwood", "camp verde", "chino valley", 
    "williams", "kingman", "bullhead city", "lake havasu city", "show low", "pinetop", "snowflake", "holbrook", 
    "winslow", "page", "tuba city", "fredonia", "kayenta", "peach springs", "eagar", "springerville", "st. johns", 
    "clarkdale", "cornville", "dewey-humboldt", "skull valley", "yarnell", "crown king", "happy jack", "pine", 
    "strawberry", "rimrock", "village of oak creek", "munds park", "parks", "star valley", "verde village",
    "cordes junction", "mayer", "bagdad", "seligman", "ash fork", "black canyon city"
]);

export const SOUTHERN_AZ_CITIES = new Set([
    "tucson", "south tucson", "oro valley", "marana", "vail", "sahuarita", "green valley", "catalina foothills", 
    "nogales", "rio rico", "sierra vista", "benson", "oracle", "mammoth", "red rock", "saddlebrooke", "sonoita", 
    "tubac", "patagonia", "willcox", "douglas", "san manuel", "rillito", "tanque verde", "three points", "summit", 
    "catalina", "redington", "corona de tucson", "picacho peak", "globe", "miami", "claypool",
    "amado", "arivaca", "elgin", "huachuca city", "tombstone", "bisbee", "naco"
]);

// Joseph Simms' restricted hybrid territory. 
// REMOVED: Mesa, Chandler, Gilbert to prevent him from being assigned core East Valley jobs.
// He is now focused on the true "Outer Ring" + South.
export const SOUTHEAST_PHOENIX_CITIES = new Set([
    "queen creek", "san tan valley", "apache junction", "gold canyon", "sun lakes"
]);

// New set for the Lower Valley sub-region to encourage job clustering
export const LOWER_VALLEY_EXTENSION_CITIES = new Set([
    "maricopa", "casa grande", "coolidge", "florence", "stanfield", "arizona city", "eloy", "casa blanca", 
    "sacaton", "blackwater", "chuichu", "san tan valley", "queen creek", "toltec"
]);

// New set for the Southern Outer Ring to prioritize Joseph Simms
export const SOUTH_OUTER_RING_CITIES = new Set<string>([
  "maricopa","casa grande","stanfield","arizona city","eloy","coolidge","florence",
  "blackwater","sacaton","casa blanca","chuichu","gila bend",
  "queen creek","san tan valley","apache junction","gold canyon"
]);

export const ALL_KNOWN_CITIES = new Set([
    ...GREATER_PHOENIX_CITIES,
    ...NORTHERN_AZ_CITIES,
    ...SOUTHERN_AZ_CITIES,
    ...LOWER_VALLEY_EXTENSION_CITIES,
    ...SOUTH_OUTER_RING_CITIES,
    ...SOUTHEAST_PHOENIX_CITIES,
]);

/**
 * Calculates the Haversine distance between two points on the Earth.
 * @param coords1 - The first coordinate object { lat, lon }.
 * @param coords2 - The second coordinate object { lat, lon }.
 * @returns The distance in kilometers.
 */
export function haversineDistance(coords1: Coordinates, coords2: Coordinates): number {
    const R = 6371; // Radius of the Earth in km
    const dLat = (coords2.lat - coords1.lat) * Math.PI / 180;
    const dLon = (coords2.lon - coords1.lon) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(coords1.lat * Math.PI / 180) * Math.cos(coords2.lat * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
}

export const EAST_TO_WEST_CITIES = [
    'BUCKEYE',
    'SURPRISE',
    'LITCHFIELD PARK',
    'SUN CITY WEST',
    'SUN CITY FESTIVAL',
    'GOODYEAR',
    'AVONDALE',
    'SUN CITY',
    'TOLLESON',
    'PEORIA',
    'GLENDALE',
    'PHOENIX',
    'MARICOPA',
    'PARADISE VALLEY',
    'TEMPE',
    'GUADALUPE',
    'SCOTTSDALE',
    'RIO VERDE',
    'FOUNTAIN HILLS',
    'CHANDLER',
    'MESA',
    'GILBERT',
    'CASA GRANDE',
    'QUEEN CREEK',
    'SAN TAN VALLEY',
    'APACHE JUNCTION',
    'COOLIDGE',
    'GOLD CANYON',
    'FLORENCE',
    'ORO VALLEY',
    'TUCSON'
];