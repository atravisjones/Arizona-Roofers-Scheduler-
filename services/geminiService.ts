
import { Job, Rep, ParsedJobsResult, DisplayJob, Settings } from '../types';
import { GoogleGenAI, Type } from '@google/genai';
import { TIME_SLOTS, TAG_KEYWORDS } from '../constants';
import { ALL_KNOWN_CITIES } from './geography';

/**
 * Helper to get the 24-hour start hour from a time string (e.g., "7:30am", "1pm").
 * @param timeString The time string to parse.
 * @returns The hour in 24-hour format (0-23) or null.
 */
const getStartHour24 = (timeString: string): number | null => {
    const match = timeString.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (!match) return null;

    let [_, hourStr, minuteStr, period] = match;
    let hour = parseInt(hourStr, 10);
    
    period = period?.toLowerCase();

    if (period === 'pm' && hour < 12) {
        hour += 12;
    }
    if (period === 'am' && hour === 12) { // 12am is 00:00
        hour = 0;
    }
    return hour;
};

/**
 * Maps a job's timeframe string to a predefined time slot ID.
 * @param timeframe The timeframe string (e.g., "7:30am-9am").
 * @returns The matching slot ID ('ts-1', 'ts-2', etc.) or null.
 */
export const mapTimeframeToSlotId = (timeframe: string): string | null => {
    const jobStartHour = getStartHour24(timeframe);
    if (jobStartHour === null) return null;

    if (jobStartHour >= 7 && jobStartHour < 10) return 'ts-1'; // 7:30am - 10am
    if (jobStartHour >= 10 && jobStartHour < 13) return 'ts-2'; // 10am - 1pm
    if (jobStartHour >= 13 && jobStartHour < 16) return 'ts-3'; // 1pm - 4pm
    if (jobStartHour >= 16 && jobStartHour < 19) return 'ts-4'; // 4pm - 7pm
    
    return null;
};

/**
 * Builds a list of searchable name variations for each rep to find them in text.
 * This is now more robust, creating multiple formats for better matching.
 * @param reps The list of all representative objects.
 * @returns An array of objects, each containing a rep and their name variations.
 */
const buildRepNameMatchers = (reps: Rep[]): { rep: Rep; searchTerms: string[] }[] => {
    return reps.map(rep => {
        const terms = new Set<string>();
        const originalName = rep.name.toLowerCase();

        // Clean the full name by removing quotes and known region suffixes.
        const cleanedFullName = originalName
            .replace(/"/g, '') // remove quotes
            .replace(/\s+\(.*\)$/, '') // remove anything in parentheses (e.g., "(Sample)")
            .replace(/\s+(phoenix|tucson)$/i, '') // remove region tags
            .trim();
        
        // The primary search term is the cleaned full name.
        // This is the most specific and safest match. It requires at least two names (e.g., "First Last").
        if (cleanedFullName && cleanedFullName.includes(' ')) {
            terms.add(cleanedFullName);
        }
        
        const parts = cleanedFullName.split(' ').filter(p => p.length > 1);
        
        // Add "First Last" as a variation if there's a middle name (more than 2 parts).
        if (parts.length > 2) {
             terms.add(`${parts[0]} ${parts[parts.length - 1]}`);
        }
        
        // Special case for names like "Lee Y" where it's already a distinct format.
        if (/^[a-zA-Z]+\s[a-zA-Z]$/.test(cleanedFullName)) {
            terms.add(cleanedFullName);
        }

        // We explicitly DO NOT add single name parts like "Chandler" or "Brett".
        // This prevents incorrect matches with city names or common first names.

        const finalTerms = Array.from(terms).filter(t => t && t.trim().length > 1);

        return {
            rep,
            // Sort longest to shortest to prevent a less specific match from winning.
            searchTerms: [...new Set(finalTerms)].sort((a, b) => b.length - a.length)
        };
    });
};


/**
 * Parses jobs from a pasted text block.
 * It now also detects representative names anywhere in the job line (outside the address)
 * and creates pre-assignments for them.
 * @param text The raw text pasted by the user.
 * @param reps A list of available reps to check against.
 * @returns A promise resolving to jobs, a detected date, and any pre-assignments.
 */
export async function parseJobsFromText(
  text: string,
  reps: Rep[]
): Promise<ParsedJobsResult & { assignments: { jobId: string, repId: string, slotId: string }[] }> {
  const jobs: Job[] = [];
  const assignments: { jobId: string, repId: string, slotId: string }[] = [];
  const repNameMatchers = buildRepNameMatchers(reps);
  
  const lines = text.split('\n');
  
  let detectedDate: string | null = null;
  const dateRegex = /(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday),\s+([a-z]{3,9})\s+(\d{1,2}),\s+(\d{4})/i;
  const monthMap: { [key: string]: number } = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
  };
  
  for (const line of lines.slice(0, 5)) {
    const match = line.trim().match(dateRegex);
    if (match) {
        const [, monthName, day, year] = match;
        const normalizedMonthKey = monthName.toLowerCase().substring(0, 3);
        const month = monthMap[normalizedMonthKey];
        if (month !== undefined) {
          const parsedDate = new Date(parseInt(year), month, parseInt(day));
          const y = parsedDate.getFullYear();
          const m = String(parsedDate.getMonth() + 1).padStart(2, '0');
          const d = String(parsedDate.getDate()).padStart(2, '0');
          detectedDate = `${y}-${m}-${d}`;
          break;
        }
    }
  }

  const timeSlotRegex = /(\d{1,2}(?::\d{2})?(?:am|pm)?\s*-\s*\d{1,2}(?::\d{2})?(?:am|pm)?)/i;
  let currentTimeframe: string | undefined = undefined;

  const knownCitiesList = Array.from(ALL_KNOWN_CITIES).sort((a, b) => b.length - a.length);

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;
    if (dateRegex.test(trimmedLine) && trimmedLine.split(' ').length < 6) continue;

    const timeSlotMatch = trimmedLine.match(timeSlotRegex);
    if (timeSlotMatch && /\(\d+\)$/.test(trimmedLine)) {
      currentTimeframe = timeSlotMatch[1];
      continue;
    }

    // New, more robust parsing logic: Find rep first, then parse the rest.
    let assignedRep: Rep | null = null;
    let lineWithoutRep = trimmedLine;
    
    // 1. Find and remove rep name from the entire line for cleaner parsing.
    for (const matcher of repNameMatchers) {
        for (const term of matcher.searchTerms) {
            const escapedTerm = term.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            const regex = new RegExp(`\\b${escapedTerm}\\b`, 'i');
            if (regex.test(lineWithoutRep)) {
                assignedRep = matcher.rep;
                // Cleanly remove the rep name and any surrounding separators.
                lineWithoutRep = lineWithoutRep.replace(regex, '')
                    .replace(/\s*-\s*-\s*/, ' - ') // handle double hyphens from removal
                    .replace(/\s*-\s*$/, '') // remove trailing hyphen
                    .replace(/^\s*-\s*/, '') // remove leading hyphen
                    .replace(/\s{2,}/g, ' ') // collapse multiple spaces
                    .trim();
                break;
            }
        }
        if (assignedRep) break;
    }

    // 2. Now, identify the address from the line *without* the rep's name.
    let address = '';
    let nonAddressPart = lineWithoutRep;
    
    const addressStartRegex = /\b\d{1,}\s+[A-Z]/g;
    let lastMatch;
    let match;
    while ((match = addressStartRegex.exec(lineWithoutRep)) !== null) {
        lastMatch = match;
    }
    const addressStartIndex = lastMatch ? lastMatch.index : -1;

    if (addressStartIndex > -1) {
      address = lineWithoutRep.substring(addressStartIndex).trim();
      nonAddressPart = lineWithoutRep.substring(0, addressStartIndex).trim();
    }
    
    let notes = '';
    let city = '';
    let zipCode: string | undefined = undefined;
    
    // 3. Parse the remaining cityAndNotesPart.
    let cityAndNotesPart = nonAddressPart.replace(/\s*-\s*$/, '').trim();

    // Try to match the start of the line against known Arizona cities.
    // This is the most reliable way to separate "City" from "Tags/Zip/Notes"
    const lowerNonAddress = nonAddressPart.toLowerCase();
    const matchedCity = knownCitiesList.find(c => lowerNonAddress.startsWith(c));

    if (matchedCity) {
        city = matchedCity.toUpperCase(); // Standardize to the known city name
        // Remove the city and any following separators from the start to get the notes
        const cityRegex = new RegExp(`^${matchedCity}[,\\.\\s]*`, 'i');
        notes = nonAddressPart.replace(cityRegex, '').trim();
        cityAndNotesPart = notes; // Update for zip extraction
    } else {
        // Fallback: Try to find a tag to split
        const tagKeywordsRegex = new RegExp(`\\b(${TAG_KEYWORDS.join('|')}|\\d+\\s*S|\\d+\\s*sq\\.?(?:ft)?|\\d+\\s*yrs)\\b|#`, 'i');
        const firstTagMatch = cityAndNotesPart.match(tagKeywordsRegex);
        if (firstTagMatch && firstTagMatch.index !== undefined) {
            city = cityAndNotesPart.substring(0, firstTagMatch.index).trim();
            notes = cityAndNotesPart.substring(firstTagMatch.index).trim();
        } else {
            city = cityAndNotesPart;
            notes = '';
        }
    }

    // Extract zip code if present in the remaining part (notes) or at the end of city part if fallback used
    const zipCodeRegex = /\b(\d{5})\b/;
    const zipMatch = cityAndNotesPart.match(zipCodeRegex);
    
    if (zipMatch) {
        zipCode = zipMatch[1];
        // Remove zip from city if it leaked in (only happens in fallback path)
        city = city.replace(zipCode, '').replace(/,$/, '').trim();
        // Remove zip from notes if present
        notes = notes.replace(zipCode, '').replace(/,,/g, ',').trim();
    }
    
    // CLEANUP: Aggressively clean the city name of any remaining digits or messy punctuation
    // This prevents "MESA, 85204" from becoming the city name if the parsing logic above was loose.
    city = city.replace(/\d+/g, '').replace(/[,:.-]+$/, '').replace(/^[,:.-]+/, '').trim();

    // 4. If we didn't find an address with the regex, use notes as a fallback,
    // but only if 'notes' itself looks like a plausible address.
    if (addressStartIndex === -1) {
        // If 'notes' contains a number and a letter, it might be an address.
        if (/\d/.test(notes) && /[a-zA-Z]/.test(notes)) {
            address = notes;
        } else {
            continue;
        }
    }

    // If city still isn't found, try to parse from the full address string.
    if (!city && address) {
        const addressParts = address.split(',');
        if (addressParts.length > 1) {
            const potentialCityPart = addressParts.length > 2 ? addressParts[addressParts.length - 2] : addressParts[1];
            const potentialCity = potentialCityPart.trim();
            if (potentialCity && !/^[A-Z]{2}(\s\d{5})?$/i.test(potentialCity)) {
                city = potentialCity;
            }
        }
    }

    if (!city) {
      continue;
    }
    
    city = city.replace(/[,:.-]\s*$/, '').trim();

    // 5. Final cleanup to remove redundant city name from the start of notes.
    const cityRegex = new RegExp(`^${city.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}[,:\\s]*`, 'i');
    notes = notes.replace(cityRegex, '').trim();

    // 6. Add the rep's name to the notes if one was detected.
    if (assignedRep) {
        notes = `${notes} (Rep: ${assignedRep.name})`.trim();
    }

    const hasNumber = /\d/.test(address);
    const hasStreetName = /\b[a-zA-Z]{3,}\b/.test(address);
    if (!address || !hasNumber || !hasStreetName) {
        continue;
    }

    const newJob = {
      id: `job-${Date.now()}-${jobs.length}-${Math.random().toString(36).substring(2, 9)}`,
      customerName: city,
      address, city, notes,
      originalTimeframe: currentTimeframe,
      zipCode,
    };
    jobs.push(newJob);

    if (assignedRep && currentTimeframe) {
        const slotId = mapTimeframeToSlotId(currentTimeframe);
        if (slotId) {
            assignments.push({ jobId: newJob.id, repId: assignedRep.id, slotId });
        }
    }
  }

  const result = { date: detectedDate, jobs, assignments };
  return Promise.resolve(result);
}

export async function assignJobsWithAi(
    reps: Rep[],
    unassignedJobs: Job[],
    selectedDay: string,
    settings: Settings,
    onThought: (thought: string) => void
): Promise<{ assignments: { jobId: string; repId: string; slotId: string }[] }> {
    if (!process.env.API_KEY) {
        throw new Error("API_KEY environment variable not set.");
    }
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    onThought("Initializing AI assignment process...");
    onThought(`Analyzing ${reps.length} reps and ${unassignedJobs.length} unassigned jobs for ${selectedDay}.`);
    
    const simplifiedReps = reps.map(rep => {
        const currentJobs = rep.schedule.flatMap(s => s.jobs);
        return {
            id: rep.id,
            name: rep.name,
            isLocked: rep.isLocked,
            skills: rep.skills,
            region: rep.region,
            zipCodes: rep.zipCodes,
            currentSchedule: rep.schedule.map(slot => ({
                slotId: slot.id,
                jobCount: slot.jobs.length
            })),
            assignedCities: [...new Set(currentJobs.map(j => j.city).filter(Boolean))],
            unavailableSlots: rep.unavailableSlots?.[selectedDay] || [],
        };
    });

    const simplifiedJobs = unassignedJobs.map(job => ({
        id: job.id,
        city: job.city,
        address: job.address,
        notes: job.notes,
        zipCode: job.zipCode,
        originalTimeframe: job.originalTimeframe,
    }));
    
    onThought("Building a detailed prompt for the AI based on current settings...");

    const maxJobsInSlot = settings.allowDoubleBooking ? settings.maxJobsPerSlot : 1;
    const slotCapacityDescription = settings.allowDoubleBooking 
        ? `Double booking is ALLOWED. A single time slot cannot have more than ${maxJobsInSlot} jobs.`
        : `Double booking is NOT ALLOWED. A single time slot can only have one job.`;

    const prompt = `
You are an expert dispatcher for a roofing company. Your task is to create the most efficient schedule possible by maximizing appointments and minimizing drive time.

**Context:**
- Today is ${selectedDay}.
- There are ${unassignedJobs.length} jobs to assign.
- There are ${reps.length} representatives available.

**Primary Goals (in order of importance):**
1.  **Maximize Appointments:** Assign as many jobs from the unassigned list as possible. Your primary objective is to get every possible job scheduled.
2.  **Minimize Drive Time:** After maximizing assignments, ensure the routes are as efficient as possible by creating dense, geographically clustered workdays for each representative.

**Rules for Assignment (Follow these strictly in order):**

**--- Hard Constraints (Must NOT be violated) ---**
1.  **Locked Reps:** A representative with "isLocked: true" in the input JSON MUST NOT have any changes made to their schedule. Do not unassign or move their existing jobs. You may add new jobs to them only if they are not full.
2.  **Availability:**
    - Reps have 'unavailableSlots' listed by ID (e.g., 'ts-1'). Do NOT assign jobs to these slots unless absolutely necessary to meet the goal of maximizing appointments.
    - ${settings.allowAssignOutsideAvailability ? "You are PERMITTED to assign jobs to unavailable slots if no other option exists, but prioritize available slots." : "You are STRICTLY FORBIDDEN from assigning jobs to unavailable slots."}
3.  **Slot Capacity:** ${slotCapacityDescription}
4.  **Regional Constraints:**
    - Reps have a 'region' (PHX, NORTH, SOUTH).
    - Reps with 'NORTH' region should primarily be assigned jobs in Northern Arizona (Flagstaff, Prescott, Sedona, etc).
    - Reps with 'SOUTH' region should primarily be assigned jobs in Southern Arizona (Tucson, Marana, Vail, etc).
    - Reps with 'PHX' region should primarily be assigned jobs in the Phoenix Metro area.
    - 'UNKNOWN' region reps can be assigned anywhere, but try to keep them clustered.
    - ${settings.allowRegionalRepsInPhoenix ? "Regional reps (North/South) ARE allowed to take jobs in Phoenix if needed." : "Regional reps (North/South) are NOT allowed to take jobs in Phoenix."}

**--- Optimization Guidelines (Follow these to improve score) ---**
1.  **Cluster Jobs:** Group jobs by City and Zip Code. A rep should ideally stay in 1 or 2 adjacent cities for the entire day.
2.  **Skill Matching:**
    - Jobs often have tags like 'Tile', 'Shingle', 'Flat', 'Metal', 'Foam'.
    - Reps have skill levels (1-3) for these tags.
    - Assign complex jobs (e.g. 'Tile', 'Flat') to reps with high skill levels in those categories.
    - Reps with 'Insurance' skill should get insurance jobs. 'Commercial' skill should get commercial jobs.
3.  **Time Slot Matching:**
    - Jobs have an 'originalTimeframe' (e.g., '7:30am - 10am').
    - Try to assign the job to the matching slot ID (ts-1: 7:30-10, ts-2: 10-1, ts-3: 1-4, ts-4: 4-7).
    - ${settings.strictTimeSlotMatching ? "You MUST match the time slot exactly." : "You should try to match the time slot, but can shift it if needed for efficiency."}

**Input Data:**

Representatives:
${JSON.stringify(simplifiedReps, null, 2)}

Unassigned Jobs:
${JSON.stringify(simplifiedJobs, null, 2)}

**Output Format:**
Return a JSON object with the following structure:
{
  "assignments": [
    { "jobId": "string", "repId": "string", "slotId": "string", "reason": "string" }
  ],
  "thoughts": "Brief explanation of your strategy"
}
`;

    onThought("Sending data to Gemini for processing...");

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        assignments: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    jobId: { type: Type.STRING },
                                    repId: { type: Type.STRING },
                                    slotId: { type: Type.STRING },
                                    reason: { type: Type.STRING }
                                },
                                required: ['jobId', 'repId', 'slotId']
                            }
                        },
                        thoughts: { type: Type.STRING }
                    }
                }
            }
        });

        onThought("Received response from AI. Parsing assignments...");
        
        const responseText = response.text;
        if (!responseText) {
            throw new Error("Empty response from AI");
        }

        const result = JSON.parse(responseText);
        
        if (result.thoughts) {
            onThought(`AI Strategy: ${result.thoughts}`);
        }

        return result;

    } catch (error) {
        console.error("Gemini API Error:", error);
        throw error;
    }
}

export async function fixAddressesWithAi(jobs: DisplayJob[]): Promise<{ jobId: string, correctedAddress: string }[]> {
    if (!process.env.API_KEY) throw new Error("API_KEY not set");
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const jobList = jobs.map(j => ({ id: j.id, address: j.address, city: j.city, zip: j.zipCode, notes: j.notes }));
    
    const prompt = `
    You are a geo-location expert for Arizona.
    I have a list of addresses that failed to geocode. Please try to fix typos, format them correctly, or extract the street address from notes if present.
    If an address is missing a city, infer it from context if possible or default to Phoenix area cities if street matches known locations.
    If it cannot be fixed (e.g. just a city name, or nonsense), return "Unverified: " followed by the original text.
    
    Input Jobs:
    ${JSON.stringify(jobList, null, 2)}
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            jobId: { type: Type.STRING },
                            correctedAddress: { type: Type.STRING }
                        },
                        required: ['jobId', 'correctedAddress']
                    }
                }
            }
        });
        
        return JSON.parse(response.text || '[]');
    } catch (error) {
        console.error("Gemini Address Fix Error:", error);
        return [];
    }
}
