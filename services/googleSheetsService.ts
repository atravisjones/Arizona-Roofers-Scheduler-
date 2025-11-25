import { Rep } from '../types';
import { GOOGLE_API_KEY, SPREADSHEET_ID, SHEET_TITLE_PREFIX, DATA_RANGE, USE_MOCK_DATA_ON_FAILURE, TIME_SLOTS, SKILLS_SHEET_TITLE, SKILLS_DATA_RANGE, SALES_ORDER_DATA_RANGE } from '../constants';
import { MOCK_REPS_DATA } from './mockData';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetches a URL with exponential backoff retry logic for server errors (5xx) and rate limits (429).
 */
async function fetchWithRetry(url: string, retries = 3, initialDelay = 1000): Promise<Response> {
    let currentDelay = initialDelay;
    
    for (let i = 0; i <= retries; i++) {
        try {
            const response = await fetch(url);
            
            // If successful or a client error (4xx except 429), return the response immediately.
            // We let the caller handle 404s, 403s etc.
            if (response.ok || (response.status < 500 && response.status !== 429)) {
                return response;
            }

            // If it's a server error (5xx) or rate limit (429), and we have retries left...
            if (i < retries) {
                console.warn(`Google Sheets API attempt ${i + 1} failed (Status ${response.status}). Retrying in ${currentDelay}ms...`);
                await sleep(currentDelay);
                currentDelay *= 2;
                continue;
            }
            
            // If no retries left, return the last response (likely an error status)
            return response;

        } catch (error) {
            // Network errors (fetch throws)
            if (i < retries) {
                console.warn(`Google Sheets API network attempt ${i + 1} failed. Retrying in ${currentDelay}ms...`, error);
                await sleep(currentDelay);
                currentDelay *= 2;
                continue;
            }
            // Propagate error if out of retries
            throw error;
        }
    }
    throw new Error("Fetch failed unexpectedly.");
}

/**
 * Finds the correct sheet title for a given date from the spreadsheet metadata.
 * This new logic is more robust and correctly handles year rollovers by checking
 * the selected date against ranges constructed for the current, previous, and next year.
 * @param dateToFind The date to find a matching sheet for.
 * @param sheets The list of sheet properties from the spreadsheet metadata.
 * @returns The title of the matching sheet, or a fallback title.
 */
function findSheetNameForDate(dateToFind: Date, sheets: any[]): string | null {
    dateToFind.setHours(0, 0, 0, 0); // Normalize to the start of the day for comparison
    const dateRangeRegex = /(\d{1,2})\/(\d{1,2})\s*-\s*(\d{1,2})\/(\d{1,2})/;

    for (const s of sheets) {
        const title = s.properties.title;
        if (title.startsWith(SHEET_TITLE_PREFIX)) {
            const match = title.match(dateRangeRegex);
            if (match) {
                const [, startMonth, startDay, endMonth, endDay] = match.map(Number);

                // Check for the date in 3 possible years: the selected date's year, the year before, and the year after.
                // This handles viewing past/future schedules correctly.
                for (const yearOffset of [0, -1, 1]) {
                    const searchYear = dateToFind.getFullYear() + yearOffset;
                    
                    let startYear = searchYear;
                    let endYear = searchYear;

                    // Handle year rollover (e.g., a range from December to January)
                    if (startMonth > endMonth) {
                        endYear = startYear + 1;
                    }
                    
                    const startDate = new Date(startYear, startMonth - 1, startDay);
                    startDate.setHours(0,0,0,0);
                    const endDate = new Date(endYear, endMonth - 1, endDay);
                    endDate.setHours(23, 59, 59, 999);

                    // If the date we're looking for is within this constructed range, we found the right sheet.
                    if (dateToFind >= startDate && dateToFind <= endDate) {
                        return title;
                    }
                }
            }
        }
    }
    
    // Fallback if no matching date range is found after checking multiple years.
    const fallbackSheet = sheets.find((s: any) => s.properties.title.startsWith(SHEET_TITLE_PREFIX));
    if (fallbackSheet) {
      console.warn(`Could not find a sheet for the selected date (${dateToFind.toLocaleDateString()}). Falling back to the first sheet with the prefix: ${fallbackSheet.properties.title}`);
      return fallbackSheet.properties.title;
    }
    
    return null;
}

// Helper to normalize names for matching
const normalizeName = (name: string) => name.trim().toLowerCase().replace(/"/g, '').replace(/[^a-z0-9]/g, '');

// Fetches the sales rankings from the 'Appointment Blocks' sheet.
// The list is expected to be in order of highest sales to lowest.
async function fetchSalesRankings(): Promise<Map<string, number>> {
    const rankMap = new Map<string, number>();
    try {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'${encodeURIComponent(SKILLS_SHEET_TITLE)}'!${SALES_ORDER_DATA_RANGE}?key=${GOOGLE_API_KEY}`;
        const response = await fetchWithRetry(url);
        if (!response.ok) {
            console.warn(`Failed to fetch sales rankings: ${response.statusText}`);
            return rankMap;
        }
        const data = await response.json();
        const values = data.values;

        if (!values || values.length === 0) {
            return rankMap;
        }

        // Iterate through the list. Index 0 is Rank 1.
        values.forEach((row: any[], index: number) => {
            if (row && row.length > 0 && row[0]) {
                const name = String(row[0]);
                // Skip header if it was included by accident (though range B44 should avoid it)
                if (name.toLowerCase().includes('sales order')) return;
                
                const normalized = normalizeName(name);
                // Only set if not already present (in case of duplicates, first one wins as higher rank)
                if (!rankMap.has(normalized)) {
                    rankMap.set(normalized, index + 1);
                }
            }
        });
    } catch (error) {
        console.error("Error fetching sales rankings:", error);
    }
    return rankMap;
}

// Fetches and parses the rep skills from the 'Appointment Blocks' sheet.
async function fetchRepSkills(): Promise<Map<string, { skills: Record<string, number>, zipCodes: string[] }>> {
  const skillsMap = new Map<string, { skills: Record<string, number>, zipCodes: string[] }>();
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'${encodeURIComponent(SKILLS_SHEET_TITLE)}'!${SKILLS_DATA_RANGE}?key=${GOOGLE_API_KEY}`;
    const response = await fetchWithRetry(url);
    if (!response.ok) {
      console.error(`Failed to fetch skills sheet: ${response.statusText}`);
      return skillsMap; // Return empty map on failure
    }
    const data = await response.json();
    const values = data.values;

    if (!values || values.length < 2) {
      console.warn('Skills sheet is empty or has only a header.');
      return skillsMap;
    }
    
    const headers = values[0].map((h: string) => h.trim());
    const skillRows = values.slice(1);

    const zipCodeColumnIndex = headers.findIndex(h => h.toLowerCase().includes('zip'));

    for (const row of skillRows) {
      const repName = row[0];
      if (!repName) continue;

      const normalizedName = normalizeName(repName);
      const skills: Record<string, number> = {};
      
      const skillHeaders = headers.slice(1, zipCodeColumnIndex > 0 ? zipCodeColumnIndex : headers.length);
      skillHeaders.forEach((skillName: string, index: number) => {
        const skillValue = parseInt(row[index + 1], 10);
        if (!isNaN(skillValue)) {
          skills[skillName] = skillValue;
        }
      });
      
      let zipCodes: string[] = [];
      if (zipCodeColumnIndex > -1 && row[zipCodeColumnIndex]) {
          const zipString = String(row[zipCodeColumnIndex]);
          zipCodes = zipString.split(/[,;\s]+/).map(zip => zip.trim()).filter(Boolean);
      }
      
      skillsMap.set(normalizedName, { skills, zipCodes });
    }
  } catch (error) {
    console.error("Error fetching or parsing rep skills:", error);
  }
  return skillsMap;
}


/**
 * Fetches rep availability data directly from the Google Sheets API based on the visual layout.
 * This requires the spreadsheet to be public ("Anyone with the link can view").
 * @param date The date for which to fetch availability. Defaults to today.
 */
export async function fetchSheetData(date: Date = new Date()): Promise<{ reps: Omit<Rep, 'schedule'>[], sheetName: string }> {
  let sheetName = '';
  try {
    // 0. Fetch skills and rankings data in parallel
    const skillsPromise = fetchRepSkills();
    const ranksPromise = fetchSalesRankings();

    // 1. Get spreadsheet metadata to find the current sheet name
    const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}?key=${GOOGLE_API_KEY}`;
    const metaResponse = await fetchWithRetry(metaUrl);
    if (!metaResponse.ok) {
        throw new Error(`Failed to fetch spreadsheet metadata (Status: ${metaResponse.status}). Is the spreadsheet ID correct and public?`);
    }
    const metaData = await metaResponse.json();

    const foundSheetName = findSheetNameForDate(date, metaData.sheets);

    if (!foundSheetName) {
        throw new Error(`No sheet found in the spreadsheet with the prefix "${SHEET_TITLE_PREFIX}".`);
    }
    sheetName = foundSheetName;
    
    // 2. Fetch the data from the specified range, getting the formatted values.
    const dataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'${encodeURIComponent(sheetName)}'!${DATA_RANGE}?key=${GOOGLE_API_KEY}&valueRenderOption=FORMATTED_VALUE`;
    const dataResponse = await fetchWithRetry(dataUrl);
    if (!dataResponse.ok) {
        throw new Error(`Failed to fetch sheet data (Status: ${dataResponse.status}). Check API key and spreadsheet permissions.`);
    }
    const data = await dataResponse.json();
    const values = data.values;
    if (!values || values.length < 2) { // Need at least header and one data row
      console.warn("Sheet has no data or only a header row.");
      if (USE_MOCK_DATA_ON_FAILURE) return { reps: MOCK_REPS_DATA.map(rep => ({...rep, isMock: true})), sheetName: 'Mock Data' };
      return { reps: [], sheetName };
    }

    // 3. Parse header row to dynamically find day columns
    const headerRow = values[0];
    const days: { name: string; colIndex: number }[] = [];
    const dayRegex = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i;

    headerRow.forEach((cell: any, index: number) => {
        if (index > 0 && cell) { // Skip first column (A)
            const cellAsString = String(cell); // Ensure value is a string before trimming
            const match = cellAsString.trim().match(dayRegex);
            if (match) {
                days.push({ name: match[0], colIndex: index });
            }
        }
    });

    if (days.length === 0) {
        throw new Error("Could not find valid day headers in row 2 (e.g., 'Monday 10/27').");
    }

    // 4. Parse data rows into Rep structure
    const repsMap = new Map<string, { name: string; unavailableSlots: Record<string, Set<string>>; firstRowIndex: number }>();
    const timeSlotLabelsToIds = new Map(TIME_SLOTS.map(slot => [slot.label.trim().toLowerCase(), slot.id]));
    const dataRows = values.slice(1);
    
    let currentRepContext: string | null = null;

    for (const [rowIndex, row] of dataRows.entries()) {
        const firstCol = String(row?.[0] || '').trim();
        if (!firstCol) {
            currentRepContext = null;
            continue;
        }

        if (firstCol.toUpperCase() === firstCol && firstCol.replace(/[^A-Z\s]/g, '').length > 1) {
            currentRepContext = null;
            continue;
        }
        
        let wasRowProcessed = false;

        for (const [label, id] of timeSlotLabelsToIds.entries()) {
            const labelRegex = new RegExp(label.replace(/(\s-\s)/, '\\s?-\\s?') + '$', 'i');
            if (labelRegex.test(firstCol)) {
                const slotId = id;
                let repName = firstCol.replace(labelRegex, '').trim().replace(/:$/, '').trim();

                if (!repName && currentRepContext) {
                    repName = currentRepContext;
                }

                if (!repName) {
                    wasRowProcessed = true;
                    break;
                }
                
                currentRepContext = repName;

                if (!repsMap.has(repName)) {
                    repsMap.set(repName, {
                        name: repName,
                        unavailableSlots: Object.fromEntries(days.map(d => [d.name, new Set()])),
                        firstRowIndex: rowIndex + 2 // Sheet rows are 1-based, and we sliced the header.
                    });
                }
                
                const repData = repsMap.get(repName)!;
                days.forEach(day => {
                    const availabilityMark = row[day.colIndex];
                    
                    // New, more robust availability logic. Default to AVAILABLE unless explicitly marked otherwise.
                    // This handles empty cells, "TRUE", boolean true, and '✅' as AVAILABLE.
                    // It handles "FALSE", boolean false, and any other text as UNAVAILABLE.
                    const availabilityMarkStr = String(availabilityMark ?? '').trim();
                    const isExplicitlyUnavailable = 
                        availabilityMark === false || 
                        availabilityMarkStr.toUpperCase() === 'FALSE' ||
                        (availabilityMarkStr !== '' && availabilityMarkStr.toUpperCase() !== 'TRUE' && availabilityMarkStr !== '✅');

                    if (isExplicitlyUnavailable) {
                        repData.unavailableSlots[day.name].add(slotId);
                    }
                });
                
                wasRowProcessed = true;
                break;
            }
        }

        if (!wasRowProcessed && firstCol) {
            currentRepContext = firstCol.replace(/:$/, '').trim();
        }
    }

    const skillsMap = await skillsPromise;
    const rankingsMap = await ranksPromise;

    // 5. Convert the map into the final array of Rep objects and merge skills
    const reps: Omit<Rep, 'schedule'>[] = Array.from(repsMap.values()).map((repData, index) => {
        const availableDaysSummary: string[] = [];
        days.forEach(day => {
            const unavailableCount = repData.unavailableSlots[day.name]?.size || 0;
            if (unavailableCount < TIME_SLOTS.length) {
                availableDaysSummary.push(day.name.substring(0, 3));
            }
        });

        const availability = availableDaysSummary.join(', ') || 'Not available';
        
        const finalUnavailableSlots: Record<string, string[]> = {};
        for (const day in repData.unavailableSlots) {
            finalUnavailableSlots[day] = Array.from(repData.unavailableSlots[day]);
        }
        
        const normalizedName = normalizeName(repData.name);
        const repInfo = skillsMap.get(normalizedName);
        const skills = repInfo?.skills;
        const zipCodes = repInfo?.zipCodes;
        const salesRank = rankingsMap.get(normalizedName);
        
        const { firstRowIndex } = repData;
        let region: Rep['region'] = 'UNKNOWN';
        if (firstRowIndex >= 2 && firstRowIndex <= 118) {
            region = 'PHX';
        } else if (firstRowIndex >= 119 && firstRowIndex <= 135) {
            region = 'NORTH';
        } else if (firstRowIndex >= 136 && firstRowIndex <= 152) {
            region = 'SOUTH';
        }

        return {
            id: `rep-${index + 1}-${repData.name.replace(/\s+/g, '-')}`,
            name: repData.name,
            availability,
            unavailableSlots: finalUnavailableSlots,
            skills,
            zipCodes,
            region,
            salesRank // Added Rank
        }
    });

    if (reps.length === 0) {
      console.warn("Successfully connected and data was found, but no valid rep data could be parsed. Check the sheet format.");
      if (USE_MOCK_DATA_ON_FAILURE) {
        return { reps: MOCK_REPS_DATA.map(rep => ({...rep, isMock: true})), sheetName: 'Mock Data' };
      }
    }
    
    return { reps, sheetName };

  } catch (error) {
    console.error("Error fetching from Google Sheets API:", error);
    if (USE_MOCK_DATA_ON_FAILURE) {
      console.warn("Google Sheets fetch failed. Falling back to mock data.");
      return { reps: MOCK_REPS_DATA.map(rep => ({...rep, isMock: true})), sheetName: 'Mock Data' };
    } else {
      throw error;
    }
  }
}

/**
 * Fetches a single cell's value from a given sheet.
 * @param cell The cell reference (e.g., "A1").
 * @param sheetName The name of the sheet to query.
 * @returns The value of the cell as a string.
 */
export async function fetchSheetCell(cell: string, sheetName:string): Promise<string> {
  if (!sheetName) {
    throw new Error('Sheet name must be provided to fetch a cell.');
  }
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'${encodeURIComponent(sheetName)}'!${encodeURIComponent(cell)}?key=${GOOGLE_API_KEY}&valueRenderOption=FORMATTED_VALUE`;
  
  try {
    const response = await fetchWithRetry(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch cell ${cell} (Status: ${response.status})`);
    }
    const data = await response.json();
    const value = data.values?.[0]?.[0];
    
    if (value === undefined || value === null || value === "") {
      return '(empty)';
    }
    return String(value);
  } catch (err) {
    console.error(`Error fetching cell data for ${cell} from ${sheetName}:`, err);
    throw new Error(`Could not retrieve data for cell ${cell}.`);
  }
}