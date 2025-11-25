

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Rep, Job, AppState, SortConfig, SortKey, DisplayJob, RouteInfo, Settings, ScoreBreakdown } from '../types';
import { TIME_SLOTS, ROOF_KEYWORDS, TYPE_KEYWORDS } from '../constants';
import { fetchSheetData } from '../services/googleSheetsService';
import { parseJobsFromText, assignJobsWithAi, fixAddressesWithAi, mapTimeframeToSlotId } from '../services/geminiService';
import { ARIZONA_CITY_ADJACENCY, GREATER_PHOENIX_CITIES, NORTHERN_AZ_CITIES, SOUTHERN_AZ_CITIES, SOUTHEAST_PHOENIX_CITIES, LOWER_VALLEY_EXTENSION_CITIES, SOUTH_OUTER_RING_CITIES, haversineDistance, EAST_TO_WEST_CITIES, WEST_VALLEY_CITIES, EAST_VALLEY_CITIES } from '../services/geography';
import { geocodeAddresses, fetchRoute, Coordinates, GeocodeResult } from '../services/osmService';

// Helpers
const norm = (city: string | null | undefined): string => (city || '').toLowerCase().trim();
const isJoseph = (rep: Rep) => rep.name.trim().toLowerCase().startsWith('joseph simms');
const isRichard = (rep: Rep) => rep.name.trim().toLowerCase().startsWith('richard hadsall');
const isLondon = (rep: Rep) => rep.name.trim().toLowerCase().startsWith('london smith');

const formatDateToKey = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const getCleanSortName = (name: string): string => {
    return name
        .replace(/"[^"]*"/g, '')
        .replace(/\([^)]*\)/g, '')
        .replace(/\s+(phoenix|tucson)$/i, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
};

// Helper to sort timeframes
const getSortableHour = (timeString: string | undefined): number => {
    if (!timeString) return 99;
    const match = timeString.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (!match) return 99;
    let hour = parseInt(match[1], 10);
    const period = match[3]?.toLowerCase();
    if (period === 'pm' && hour < 12) hour += 12;
    if (period === 'am' && hour === 12) hour = 0;
    // Heuristic: if no period and hour is 1-6, assume PM.
    if (!period && hour >= 1 && hour <= 6) {
        hour += 12;
    }
    return hour;
};


// Optimized based on user "training data" (High Volume settings)
export const DEFAULT_SETTINGS: Settings = {
  allowDoubleBooking: false,
  maxJobsPerSlot: 2,
  allowAssignOutsideAvailability: false,
  maxJobsPerRep: 4, 
  minJobsPerRep: 3, 
  maxCitiesPerRep: 3,
  weightSameCity: 8,
  weightAdjacentCity: 6,
  weightSkillMatch: 5,
  unavailabilityPenalty: 1.2, 
  strictTimeSlotMatching: true,
  maxTravelTimeMinutes: 75, 
  scoringWeights: {
      distanceBase: 1.0,      
      distanceCluster: 3.0,   
      skillRoofing: 1.0,
      skillType: 1.5,        
      performance: 1.5        
  },
  allowRegionalRepsInPhoenix: false,
};

const EMPTY_STATE: AppState = { reps: [], unassignedJobs: [], settings: DEFAULT_SETTINGS };

export const useAppLogic = () => {
  const [history, setHistory] = useState<Map<string, AppState>[]>([new Map()]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const [activeDayKeys, setActiveDayKeys] = useState<string[]>([]);
  const [isLoadingReps, setIsLoadingReps] = useState<boolean>(true);
  const [repsError, setRepsError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [isAutoAssigning, setIsAutoAssigning] = useState<boolean>(false);
  const [isDistributing, setIsDistributing] = useState<boolean>(false);
  const [isAiAssigning, setIsAiAssigning] = useState<boolean>(false);
  const [isAiFixingAddresses, setIsAiFixingAddresses] = useState<boolean>(false);
  const [isTryingVariations, setIsTryingVariations] = useState<boolean>(false);
  const [parsingError, setParsingError] = useState<string | null>(null);
  const [selectedRepId, setSelectedRepId] = useState<string | null>(null);
  const [usingMockData, setUsingMockData] = useState<boolean>(false);
  const [activeSheetName, setActiveSheetName] = useState<string>('');
  
  // Default to Tomorrow
  const [selectedDate, _setSelectedDate] = useState<Date>(() => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(12, 0, 0, 0); // Noon to avoid timezone edge cases
      return d;
  });

  const [expandedRepIds, setExpandedRepIds] = useState<Set<string>>(new Set());
  const [isOverrideActive, setIsOverrideActive] = useState<boolean>(false);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'salesRank', direction: 'asc' });
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [aiThoughts, setAiThoughts] = useState<string[]>([]);
  const [activeRoute, setActiveRoute] = useState<{ repName: string; mappableJobs: DisplayJob[]; unmappableJobs: DisplayJob[]; routeInfo: RouteInfo | null; } | null>(null);
  const [isRouting, setIsRouting] = useState(false);
  const [draggedJob, setDraggedJob] = useState<Job | null>(null);
  const [draggedOverRepId, setDraggedOverRepId] = useState<string | null>(null);
  const [hoveredJobId, setHoveredJobId] = useState<string | null>(null);
  const [repSettingsModalRepId, setRepSettingsModalRepId] = useState<string | null>(null);
  const [mapRefreshTrigger, setMapRefreshTrigger] = useState(0); // Trigger to refresh map after assignments
  const [autoMapAction, setAutoMapAction] = useState<'none' | 'show-all' | string>('none'); // Trigger to show map (all or specific repId)

  const [geoCache, setGeoCache] = useState<Map<string, Coordinates>>(new Map());

  // State to track visible jobs from filters
  const [filteredAssignedJobs, setFilteredAssignedJobs] = useState<DisplayJob[]>([]);
  const [filteredUnassignedJobs, setFilteredUnassignedJobs] = useState<Job[]>([]);
  
  // Init flag for map
  const [hasInitializedMap, setHasInitializedMap] = useState(false);
  // Ref to track the latest map request to prevent race conditions
  const mapRequestRef = useRef(0);

  const updateGeoCache = useCallback(async (addresses: string[]) => {
      const unique = [...new Set(addresses)].filter(addr => !geoCache.has(addr));
      if (unique.length === 0) return;
      
      const results = await geocodeAddresses(unique);
      setGeoCache(prev => {
          const next = new Map(prev);
          unique.forEach((addr, i) => {
              if (results[i].coordinates) next.set(addr, results[i].coordinates!);
          });
          return next;
      });
  }, [geoCache]);

  useEffect(() => {
      const dailyState = history[historyIndex]?.get(formatDateToKey(selectedDate));
      if (dailyState) {
          const repZips = dailyState.reps.flatMap(r => (r.zipCodes || []).map(z => `${z}, Arizona, USA`));
          updateGeoCache(repZips);
      }
  }, [history, historyIndex, selectedDate, updateGeoCache]);


  const dailyStates = useMemo(() => history[historyIndex] || new Map(), [history, historyIndex]);

  const appState = useMemo(() => {
    return dailyStates.get(formatDateToKey(selectedDate)) || EMPTY_STATE;
  }, [dailyStates, selectedDate]);

  const log = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    setDebugLogs(prev => [...prev.slice(-100), `[${timestamp}] ${message}`]);
  }, []);

  const recordChange = useCallback((updater: (currentDailyStates: Map<string, AppState>) => Map<string, AppState>, actionName?: string) => {
      setHistory(prevHistory => {
          const currentDailyStates = prevHistory[historyIndex];
          const newDailyStates = updater(currentDailyStates);
          
          if (newDailyStates === currentDailyStates) {
              return prevHistory;
          }

          const newHistory = prevHistory.slice(0, historyIndex + 1);
          newHistory.push(newDailyStates);
          setHistoryIndex(newHistory.length - 1);
          if(actionName) log(`ACTION: ${actionName} (recorded in history)`);
          return newHistory;
      });
  }, [historyIndex, log]);

  const setAppState = useCallback((updater: AppState | ((prevState: AppState) => AppState)) => {
      const dateKey = formatDateToKey(selectedDate);
      recordChange(currentDailyStates => {
          const newDailyStates = new Map<string, AppState>(currentDailyStates);
          const currentDayState = newDailyStates.get(dateKey) || EMPTY_STATE;
          const newDayState = typeof updater === 'function' ? updater(currentDayState) : updater;
          newDailyStates.set(dateKey, newDayState);
          return newDailyStates;
      });
  }, [selectedDate, recordChange]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const handleUndo = useCallback(() => {
    if (canUndo) {
        setHistoryIndex(prev => prev - 1);
        log('ACTION: Undo');
        setActiveRoute(null);
    }
  }, [canUndo, log]);

  const handleRedo = useCallback(() => {
    if (canRedo) {
        setHistoryIndex(prev => prev + 1);
        log('ACTION: Redo');
        setActiveRoute(null);
    }
  }, [canRedo, log]);

  const updateSettings = useCallback((updatedSettings: Partial<Settings>) => {
    const dateKey = formatDateToKey(selectedDate);
    recordChange(currentDailyStates => {
        const newDailyStates = new Map<string, AppState>(currentDailyStates);
        const dayState = newDailyStates.get(dateKey) || EMPTY_STATE;
        const newSettings = { 
            ...dayState.settings, 
            ...updatedSettings,
            scoringWeights: { ...dayState.settings.scoringWeights, ...(updatedSettings.scoringWeights || {}) } 
        };
        newDailyStates.set(dateKey, { ...dayState, settings: newSettings });
        return newDailyStates;
    }, 'Update Settings');
  }, [recordChange, selectedDate]);


  // Initialize with Tomorrow
  useEffect(() => {
    if (activeDayKeys.length === 0) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(12, 0, 0, 0);
        const tomorrowKey = formatDateToKey(tomorrow);
        
        setActiveDayKeys([tomorrowKey]);
        _setSelectedDate(tomorrow);
    }
  }, []); 


  const addAiThought = useCallback((thought: string) => {
    setAiThoughts(prev => [...prev, thought]);
  }, []);

  const clearAiThoughts = useCallback(() => {
    setAiThoughts([]);
  }, []);

  const selectedDayString = useMemo(() => selectedDate.toLocaleString('en-us', { weekday: 'long' }), [selectedDate]);

  const getCityRegion = useCallback((city: string | undefined | null): Rep['region'] | null => {
    if (!city) return null;
    const normalizedCity = city.toLowerCase().trim();
    if (GREATER_PHOENIX_CITIES.has(normalizedCity)) return 'PHX';
    if (NORTHERN_AZ_CITIES.has(normalizedCity)) return 'NORTH';
    if (SOUTHERN_AZ_CITIES.has(normalizedCity)) return 'SOUTH';
    return null;
  }, []);

  const isJobValidForRepRegion = useCallback((job: Job, rep: Rep): boolean => {
      const jobCity = norm(job.city);
      if (!jobCity) return true;
      const jobRegion = getCityRegion(jobCity);
      
      // 1. London Smith: STRICT NORTH (North of Black Canyon City)
      if (isLondon(rep)) {
          if (jobRegion === 'NORTH') return true;
          // Allow in Phoenix only if explicit setting is ON
          if (jobRegion === 'PHX' && appState.settings.allowRegionalRepsInPhoenix) return true;
          return false;
      }

      // 2. Richard Hadsall & Joseph Simms: STRICT SOUTH (South of Eloy)
      if (isJoseph(rep) || isRichard(rep)) {
          if (jobRegion === 'SOUTH') return true;
          // Allow in Phoenix only if explicit setting is ON
          if (jobRegion === 'PHX' && appState.settings.allowRegionalRepsInPhoenix) return true;
          return false; 
      }
      
      // 3. General Regional Logic
      if (jobRegion) {
          if (rep.region === 'UNKNOWN' || rep.region === jobRegion) return true;
          // Allow South Reps in PHX if setting is enabled (Only for generic South reps, not named restricted ones)
          if (appState.settings.allowRegionalRepsInPhoenix && rep.region === 'SOUTH' && jobRegion === 'PHX') {
              return true;
          }
          return false;
      }
      return true;
  }, [getCityRegion, appState.settings.allowRegionalRepsInPhoenix]);

  const checkCityRuleViolation = useCallback((rep: Rep, newJobCity: string | undefined | null): { violated: boolean; cities: Set<string> } => {
    const currentCitiesOriginalCase = new Set(rep.schedule.flatMap(s => s.jobs).map(j => j.city).filter((c): c is string => !!c));
    const currentCitiesLowercase = new Set(Array.from(currentCitiesOriginalCase).map(c => c.toLowerCase()));
    
    if (!newJobCity) return { violated: false, cities: currentCitiesOriginalCase };
    
    const newJobCityLower = newJobCity.toLowerCase();
    
    // If rep is already in this city, it's allowed
    if (currentCitiesLowercase.has(newJobCityLower)) {
        return { violated: false, cities: currentCitiesOriginalCase };
    }

    // 1. Check Max Cities Count
    if (currentCitiesLowercase.size >= appState.settings.maxCitiesPerRep) {
        return { violated: true, cities: currentCitiesOriginalCase };
    }

    // 2. Check Adjacency (Strict Mode)
    // If the rep already has cities, the new one MUST be adjacent to at least one of them.
    if (currentCitiesLowercase.size > 0) {
        const isAdjacent = Array.from(currentCitiesLowercase).some(existingCity => {
            const neighbors = ARIZONA_CITY_ADJACENCY[existingCity] || [];
            return neighbors.includes(newJobCityLower);
        });
        
        if (!isAdjacent) {
            return { violated: true, cities: currentCitiesOriginalCase };
        }
    }

    return { violated: false, cities: currentCitiesOriginalCase };
  }, [appState.settings.maxCitiesPerRep]);

  const allJobs = useMemo((): DisplayJob[] => {
    const jobs: DisplayJob[] = [];
    appState.reps.forEach(rep => rep.schedule.forEach(slot => slot.jobs.forEach(job => jobs.push({ ...job, assignedRepName: rep.name, timeSlotLabel: slot.label }))));
    appState.unassignedJobs.forEach(job => jobs.push({ ...job, assignedRepName: undefined, timeSlotLabel: job.originalTimeframe || 'Uncategorized' }));
    return jobs;
  }, [appState.reps, appState.unassignedJobs]);

  const assignedJobs = useMemo(() => allJobs.filter(job => job.assignedRepName), [allJobs]);
  const assignedJobsCount = useMemo(() => assignedJobs.length, [assignedJobs]);
  const assignedCities = useMemo(() => Array.from(new Set(assignedJobs.map(j => j.city).filter((c): c is string => !!c))).sort(), [assignedJobs]);
  const assignedRepNames = useMemo(() => Array.from(new Set(assignedJobs.map(j => j.assignedRepName).filter((name): name is string => !!name))).sort(), [assignedJobs]);

  const loadReps = useCallback(async (date: Date) => {
    const dateKey = formatDateToKey(date);
    if (dailyStates.has(dateKey)) {
        log(`State for ${dateKey} already loaded.`);
        return;
    }

    try {
      setIsLoadingReps(true);
      setRepsError(null);
      setUsingMockData(false);
      setActiveRoute(null);
      const { reps: repData, sheetName } = await fetchSheetData(date);
      setActiveSheetName(sheetName);
      if (repData.length > 0 && (repData[0] as Rep).isMock) setUsingMockData(true);
      const repsWithSchedule = repData.map(rep => ({ 
          ...rep, 
          schedule: TIME_SLOTS.map(slot => ({ ...slot, jobs: [] })), 
          isLocked: false
      }));
      
      const allRepZips = repsWithSchedule.flatMap(r => r.zipCodes || []).map(z => `${z}, Arizona, USA`);
      if (allRepZips.length > 0) {
          updateGeoCache(allRepZips);
      }

      const newDayState: AppState = { reps: repsWithSchedule, unassignedJobs: [], settings: DEFAULT_SETTINGS };
      
      const newDailyStates = new Map(dailyStates).set(dateKey, newDayState);
      setHistory([newDailyStates]);
      setHistoryIndex(0);

      if (repsWithSchedule.length > 0) {
        setSelectedRepId(currentId => currentId ? currentId : repsWithSchedule[0].id);
        setExpandedRepIds(new Set([repsWithSchedule[0].id]));
      } else {
        setExpandedRepIds(new Set());
      }
    } catch (error) {
      console.error('Failed to load rep data:', error);
      setRepsError('An error occurred while fetching data. See console for details.');
    } finally {
      setIsLoadingReps(false);
    }
  }, [dailyStates, log, updateGeoCache]);

  const setSelectedDate = useCallback((date: Date) => {
    const dateKey = formatDateToKey(date);
    if (!activeDayKeys.includes(dateKey)) return;
    
    const currentDateKey = formatDateToKey(selectedDate);
    if (dateKey !== currentDateKey) {
        _setSelectedDate(date);
        setActiveRoute(null);
        setSelectedRepId(null);
        setHasInitializedMap(false); // Reset initialization flag for new date
        log(`Switched view to date: ${dateKey}`);
    }
  }, [activeDayKeys, selectedDate, log]);

  const addActiveDay = useCallback((date: Date) => {
    const dateKey = formatDateToKey(date);
    if (!activeDayKeys.includes(dateKey)) {
        setActiveDayKeys(prev => [...prev, dateKey].sort());
    }
    _setSelectedDate(date);
    setActiveRoute(null);
    setSelectedRepId(null);
    setHasInitializedMap(false); // Reset initialization flag for new date
    log(`Added day ${dateKey} to workspace.`);
  }, [activeDayKeys, log]);

  const removeActiveDay = useCallback((dateKeyToRemove: string) => {
    const newActiveDayKeys = activeDayKeys.filter(k => k !== dateKeyToRemove);
    if (newActiveDayKeys.length === 0) return;
    
    setActiveDayKeys(newActiveDayKeys);
    
    const currentSelectedKey = formatDateToKey(selectedDate);
    if (currentSelectedKey === dateKeyToRemove) {
        _setSelectedDate(new Date(newActiveDayKeys[0] + 'T12:00:00'));
        setActiveRoute(null);
        setSelectedRepId(null);
        setHasInitializedMap(false); // Reset initialization flag
    }
    log(`Removed day ${dateKeyToRemove} from workspace.`);
  }, [activeDayKeys, selectedDate, log]);


  useEffect(() => {
    const dateKey = formatDateToKey(selectedDate);
    if (!dailyStates.has(dateKey)) {
        loadReps(selectedDate);
    }
  }, [selectedDate, dailyStates, loadReps]);
  

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setIsOverrideActive(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => { if (e.key === 'Alt') setIsOverrideActive(false); };
    const handleBlur = () => setIsOverrideActive(false);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  const handleJobDragEnd = useCallback(() => {
    setDraggedJob(null);
    setDraggedOverRepId(null);
  }, []);

  const calculateAssignmentScore = useCallback((job: Job, rep: Rep, slotId: string, allSettings: Settings): { score: number, breakdown: ScoreBreakdown } => {
      const overrides = rep.scoringOverrides || {};
      const weights = { ...allSettings.scoringWeights, ...overrides };

      if (!rep.zipCodes || rep.zipCodes.length === 0) {
          weights.distanceBase = 0;
      }

      let distanceBaseScore = 0;
      let distanceClusterScore = 0;
      let skillRoofingScore = 0;
      let skillTypeScore = 0;

      const rank = rep.salesRank || 99;
      let performanceScore = 0;
      if (rank === 1) performanceScore = 100;
      else if (rank === 2) performanceScore = 98;
      else if (rank === 3) performanceScore = 95;
      else if (rank <= 5) performanceScore = 90;
      else if (rank <= 10) performanceScore = 80;
      else if (rank <= 20) performanceScore = 60;
      else performanceScore = Math.max(10, 60 - ((rank - 20) * 2));

      const jobCity = norm(job.city);
      const jobRegion = getCityRegion(jobCity);
      const maxReasonableMiles = jobRegion === 'PHX' ? 35 : 60; // Increased PHX radius to 35 miles to allow East Valley coverage

      const repHomeZips = new Set(rep.zipCodes || []);
      const existingJobs = rep.schedule.flatMap(s => s.jobs);

      const calculateDistanceScore = (miles: number) => {
          if (miles === -1) return 0;
          const clampedMiles = Math.min(miles, maxReasonableMiles);
          const percentage = 1 - (clampedMiles / maxReasonableMiles);
          const score = Math.pow(percentage, 2) * 100;
          return Math.max(1, Math.round(score));
      };

      // 1. DISTANCE TO HOME
      let minHomeDist = -1;
      if (rep.zipCodes && rep.zipCodes.length > 0) {
          const jobCoord = geoCache.get(job.address);
          const homeZipAddress = `${rep.zipCodes[0]}, Arizona, USA`;
          const homeCoord = geoCache.get(homeZipAddress);
          if (jobCoord && homeCoord) {
              minHomeDist = haversineDistance(homeCoord, jobCoord) * 0.621371;
          }
      }

      if (minHomeDist !== -1) {
          distanceBaseScore = calculateDistanceScore(minHomeDist);
      } else {
          if (job.zipCode && repHomeZips.has(job.zipCode)) distanceBaseScore = 100;
          else if (isJobValidForRepRegion(job, rep)) distanceBaseScore = 50;
          else distanceBaseScore = 1;
      }

      // 2. DISTANCE TO CLUSTER
      if (existingJobs.length > 0) {
          // CRITICAL CHANGE: If jobs exist, the Home Base distance is IRRELEVANT.
          // We must force the algorithm to prioritize proximity to existing commitments.
          weights.distanceBase = 0;

          let minClusterDist = -1;
          const jobCoord = geoCache.get(job.address);

          if (jobCoord) {
              let nearestDistKm = Infinity;
              existingJobs.forEach(ej => {
                  const ejCoord = geoCache.get(ej.address);
                  if (ejCoord) {
                      const d = haversineDistance(jobCoord, ejCoord);
                      if (d < nearestDistKm) nearestDistKm = d;
                  }
              });
              if (nearestDistKm !== Infinity) {
                  minClusterDist = nearestDistKm * 0.621371;
              }
          }

          if (minClusterDist !== -1) {
              // STEEPER DROP-OFF for distance
              if (minClusterDist < 5) distanceClusterScore = 100;
              else if (minClusterDist < 12) distanceClusterScore = 90;
              else if (minClusterDist < 20) distanceClusterScore = 60; // Slightly relaxed for suburban spread
              else if (minClusterDist < 25) distanceClusterScore = 30; 
              else distanceClusterScore = 10; // > 25 miles is bad
          } else {
              const repCities = new Set(existingJobs.map(j => norm(j.city)));
              if (repCities.has(norm(job.city))) distanceClusterScore = 100;
              else {
                  const isAdjacent = Array.from(repCities).some(city => (ARIZONA_CITY_ADJACENCY[city] || []).includes(norm(job.city)));
                  distanceClusterScore = isAdjacent ? 60 : 1;
              }
          }
      } else {
          // New Logic: If no existing jobs, rely on Home Score.
          // If no Home Score (no zip), treat as 100 (clean slate/opportunity).
          if (rep.zipCodes && rep.zipCodes.length > 0) {
             distanceClusterScore = distanceBaseScore;
          } else {
             // No home, no jobs -> This is a fresh rep.
             // Any job is a good start.
             distanceClusterScore = 100;
          }
      }

      // 3. SKILL MATCHING
      const notesLower = job.notes.toLowerCase();
      
      const roofTags = ROOF_KEYWORDS.filter(keyword => new RegExp(`\\b${keyword.toLowerCase()}\\b`).test(notesLower));
      if (roofTags.length > 0) {
          const totalSkill = roofTags.reduce((acc, tag) => acc + (rep.skills?.[tag] || 0), 0);
          skillRoofingScore = Math.min(100, ((totalSkill / roofTags.length) / 3) * 100);
      } else {
          skillRoofingScore = 50; 
      }

      // 4. TYPE MATCHING
      const typeTags = TYPE_KEYWORDS.filter(keyword => new RegExp(`\\b${keyword.toLowerCase()}\\b`).test(notesLower));
      let isSpecialist = false;

      if (typeTags.length > 0) {
          const totalSkill = typeTags.reduce((acc, tag) => acc + (rep.skills?.[tag] || 0), 0);
          skillTypeScore = Math.min(100, ((totalSkill / typeTags.length) / 3) * 100);
          
          if (typeTags.some(tag => (rep.skills?.[tag] || 0) >= 3)) {
              isSpecialist = true;
          }
      } else {
          skillTypeScore = -1; 
          weights.skillType = 0;
      }

      // 5. PRIORITY
      const isPriority = job.notes.includes('#');
      if (!isPriority) {
          weights.performance = 0;
      }

      // 6. WEIGHTED AVERAGE
      const totalWeight = weights.distanceBase + weights.distanceCluster + weights.skillRoofing + weights.skillType + weights.performance;
      
      let weightedScore = 0;
      if (totalWeight > 0) {
          const effectiveTypeScore = skillTypeScore === -1 ? 0 : skillTypeScore;
          
          weightedScore = (
              (distanceBaseScore * weights.distanceBase) +
              (distanceClusterScore * weights.distanceCluster) +
              (skillRoofingScore * weights.skillRoofing) +
              (effectiveTypeScore * weights.skillType) +
              (performanceScore * weights.performance)
          ) / totalWeight;
      }

      let penalty = 0;
      const isUnavailable = (rep.unavailableSlots?.[selectedDayString] || []).includes(slotId);
      if (isUnavailable) {
          // Penalty adjusted for multiplier scale (0-2.0).
          // 1.6 * 50 = 80 points penalty.
          penalty += (allSettings.unavailabilityPenalty * 50); 
      }

      // --- ADJACENCY & VALLEY LOGIC ---
      if (existingJobs.length > 0) {
          const currentCities = new Set(existingJobs.map(j => norm(j.city)));
          const targetCity = norm(job.city);
          
          if (targetCity) {
              // 1. Valley Split Firewall
              // If the rep is already working in the East Valley, PUNISH West Valley jobs severely.
              const hasWest = Array.from(currentCities).some(c => WEST_VALLEY_CITIES.has(c));
              const hasEast = Array.from(currentCities).some(c => EAST_VALLEY_CITIES.has(c));
              
              const isTargetWest = WEST_VALLEY_CITIES.has(targetCity);
              const isTargetEast = EAST_VALLEY_CITIES.has(targetCity);

              // If we are crossing the boundary, apply massive penalty
              if ((hasWest && isTargetEast) || (hasEast && isTargetWest)) {
                  penalty += 60; // Huge deterrent
              }

              // 2. Basic Adjacency Check
              let isConnected = false;
              if (currentCities.has(targetCity)) isConnected = true;
              
              if (!isConnected) {
                  for (const city of currentCities) {
                      const neighbors = ARIZONA_CITY_ADJACENCY[city] || [];
                      if (neighbors.includes(targetCity)) {
                          isConnected = true;
                          break;
                      }
                  }
              }
              
              if (!isConnected) {
                  // Apply penalty for breaking the chain (non-adjacent city)
                  // Increased from 30 to 50 to prevent jumping
                  penalty += 50; 
              }
          }
      }

      let finalScore = Math.max(1, Math.min(100, Math.round(weightedScore - penalty))); 
      
      if (isSpecialist) {
          finalScore = Math.min(100, finalScore + 25);
      }
      
      return {
          score: finalScore,
          breakdown: {
              distanceBase: distanceBaseScore,
              distanceCluster: distanceClusterScore,
              skillRoofing: skillRoofingScore,
              skillType: skillTypeScore,
              performance: isPriority ? performanceScore : 0,
              penalty: penalty
          }
      };
  }, [selectedDayString, isJobValidForRepRegion, getCityRegion, geoCache]);

  const handleUnassignJob = useCallback((jobId: string) => { 
    const dateKey = formatDateToKey(selectedDate);
    recordChange(currentDailyStates => {
        const newDailyStates = new Map<string, AppState>(currentDailyStates);
        const dayState = newDailyStates.get(dateKey);
        if (!dayState) return currentDailyStates;
        const newState = JSON.parse(JSON.stringify(dayState)) as AppState;
        let jobToUnassign: DisplayJob | undefined;
        for (const rep of newState.reps) {
            for (const repSlot of rep.schedule) {
                const jobIndex = repSlot.jobs.findIndex(j => j.id === jobId);
                if (jobIndex > -1) { [jobToUnassign] = repSlot.jobs.splice(jobIndex, 1); break; }
            }
            if (jobToUnassign) break;
        }
        if (!jobToUnassign) return currentDailyStates;
        jobToUnassign.notes = (jobToUnassign.notes || '').replace(/\(Scheduled: [^)]+\)\s*/, '').trim();
        delete jobToUnassign.assignmentScore; 
        delete jobToUnassign.scoreBreakdown; 
        delete jobToUnassign.timeSlotLabel;
        
        if (!newState.unassignedJobs.some(j => j.id === jobToUnassign!.id)) {
            newState.unassignedJobs.push(jobToUnassign);
        }
        newState.unassignedJobs.sort((a, b) => (a.city || '').localeCompare(b.city || ''));
        newDailyStates.set(dateKey, newState);
        return newDailyStates;
    }, 'Unassign Job');
    setMapRefreshTrigger(prev => prev + 1); // Refresh map to reflect change (remove pin or change color)
  }, [recordChange, selectedDate]);

  const handleJobDrop = useCallback((jobId: string, target: { repId: string; slotId: string } | 'unassigned', e?: React.DragEvent<HTMLDivElement>) => {
    if (target === 'unassigned') { handleUnassignJob(jobId); return; }
    
    const targetRepInfo = appState.reps.find(r => r.id === target.repId);
    if (targetRepInfo?.isOptimized) { alert("Cannot modify an optimized schedule."); return; }
    
    const dateKey = formatDateToKey(selectedDate);
    const jobToDrop = appState.unassignedJobs.find(j => j.id === jobId) || appState.reps.flatMap(r => r.schedule.flatMap(s => s.jobs)).find(j => j.id === jobId);
    if(jobToDrop) updateGeoCache([jobToDrop.address]);

    recordChange(currentDailyStates => {
        const newDailyStates = new Map<string, AppState>(currentDailyStates);
        const dayState = newDailyStates.get(dateKey);
        if (!dayState) return currentDailyStates;
        const newState = JSON.parse(JSON.stringify(dayState)) as AppState;
        let jobToMove: DisplayJob | undefined;
        
        const unassignedIndex = newState.unassignedJobs.findIndex(job => job.id === jobId);
        if (unassignedIndex > -1) { [jobToMove] = newState.unassignedJobs.splice(unassignedIndex, 1); }
        else {
            for (const rep of newState.reps) {
                for (const repSlot of rep.schedule) {
                    const jobIndex = repSlot.jobs.findIndex(job => job.id === jobId);
                    if (jobIndex > -1) { [jobToMove] = repSlot.jobs.splice(jobIndex, 1); break; }
                }
                if (jobToMove) break;
            }
        }
        if (!jobToMove) return currentDailyStates;

        jobToMove.notes = (jobToMove.notes || '').replace(/\(Scheduled: [^)]+\)\s*/, '').trim();
        const targetRep = newState.reps.find(r => r.id === target.repId);
        if (targetRep) {
            const targetSlot = targetRep.schedule.find(s => s.id === target.slotId);
            if (targetSlot) {
                const { score, breakdown } = calculateAssignmentScore(jobToMove, targetRep, targetSlot.id, newState.settings);
                targetSlot.jobs.push({ ...jobToMove, assignmentScore: score, scoreBreakdown: breakdown });
            }
        }
        newDailyStates.set(dateKey, newState);
        return newDailyStates;
    }, 'Drop Job');
    
    if (activeRoute) {
         setMapRefreshTrigger(prev => prev + 1);
    } else {
         setAutoMapAction(target.repId);
    }
    
    setSelectedRepId(target.repId);
    setExpandedRepIds(prev => new Set(prev).add(target.repId));
  }, [handleUnassignJob, appState.reps, appState.unassignedJobs, selectedDate, recordChange, calculateAssignmentScore, updateGeoCache, activeRoute]);

  const handleShowFilteredJobsOnMap = useCallback(async (jobs: DisplayJob[], title: string) => {
      const requestId = ++mapRequestRef.current;
      log(`ACTION: Show Filtered Jobs on Map: ${title} (${jobs.length} items).`);
      
      setIsRouting(true);
      setSelectedRepId(null);
      
      try {
          if (jobs.length === 0) {
               if (mapRequestRef.current === requestId) {
                   setActiveRoute(null); 
               }
               return;
          }

          const addresses = jobs.map(j => j.address);
          const coordsResults = await geocodeAddresses(addresses);
          
          if (mapRequestRef.current !== requestId) {
              return;
          }

          const mappableJobs: DisplayJob[] = [];
          const unmappableJobs: DisplayJob[] = [];
          const mappableCoords: Coordinates[] = [];
          
          jobs.forEach((job, index) => {
              const result = coordsResults[index];
              if (result.coordinates) { 
                  mappableJobs.push(job); 
                  mappableCoords.push(result.coordinates); 
              } else { 
                  unmappableJobs.push({ ...job, geocodeError: result.error || 'Unknown' }); 
              }
          });
          
          const routeInfo: RouteInfo = {
              distance: 0,
              duration: 0,
              geometry: null,
              coordinates: mappableCoords
          };
          
          setActiveRoute({ repName: title, mappableJobs, unmappableJobs, routeInfo });
      } catch (error) { 
          console.error("Failed to show filtered jobs:", error); 
      } finally { 
          if (mapRequestRef.current === requestId) {
              setIsRouting(false); 
          }
      }
  }, [log]);

  useEffect(() => {
      const timer = setTimeout(() => {
          if (activeRoute?.repName === 'Job Map') {
              const combined = [...filteredAssignedJobs, ...filteredUnassignedJobs];
              handleShowFilteredJobsOnMap(combined, 'Job Map');
          } else if (activeRoute?.repName === 'Unassigned Jobs') {
              handleShowFilteredJobsOnMap(filteredUnassignedJobs, 'Unassigned Jobs');
          }
      }, 300);
      return () => clearTimeout(timer);
  }, [filteredAssignedJobs, filteredUnassignedJobs, activeRoute?.repName, handleShowFilteredJobsOnMap]);


  const handleShowRoute = useCallback(async (repId: string, optimize: boolean) => {
    const requestId = ++mapRequestRef.current;
    const rep = appState.reps.find(r => r.id === repId);
    if (!rep) return;
    setSelectedRepId(repId);
    log(`ACTION: ${optimize ? 'Optimize & Show' : 'Show'} Route for ${rep.name}`);
    setIsRouting(true);
    
    let jobsForRoute: DisplayJob[] = rep.schedule.flatMap(slot => slot.jobs.map(job => ({ ...job, timeSlotLabel: slot.label, assignedRepName: rep.name })));
    
    // CRITICAL FIX: If optimized, keep order from schedule. Do NOT re-sort by time string.
    if (!rep.isOptimized) {
      jobsForRoute.sort((a, b) => getSortableHour(a.originalTimeframe) - getSortableHour(b.originalTimeframe));
    }

    // Assign explicit marker labels (1, 2, 3...) based on sorted order BEFORE adding Home Base
    // This ensures map pins are numbered correctly corresponding to the list
    jobsForRoute.forEach((job, idx) => {
        job.markerLabel = String(idx + 1);
    });

    if (rep.zipCodes && rep.zipCodes.length > 0) {
        const homeZip = rep.zipCodes[0];
        const homeJob: DisplayJob = {
            id: `home-${rep.id}`,
            customerName: 'Start: Home Base',
            address: `${homeZip}, Arizona, USA`,
            notes: `Rep Home: ${homeZip}`,
            city: homeZip,
            zipCode: homeZip,
            assignedRepName: rep.name,
            timeSlotLabel: 'Start',
            isStartLocation: true,
            assignmentScore: 100,
            markerLabel: undefined // Ensure Home Base has no number label so it gets the icon
        };
        jobsForRoute = [homeJob, ...jobsForRoute];
    }

    if (jobsForRoute.length === 0) {
      if (mapRequestRef.current === requestId) {
          setActiveRoute({ repName: rep.name, mappableJobs: [], unmappableJobs: [], routeInfo: null });
          setIsRouting(false);
      }
      return;
    }

    const addresses = jobsForRoute.map(j => j.address);
    const coordsResults = await geocodeAddresses(addresses);
    if (mapRequestRef.current !== requestId) return;
    
    const mappableJobs: DisplayJob[] = [];
    const unmappableJobs: DisplayJob[] = [];
    const routeCoords: Coordinates[] = [];
    jobsForRoute.forEach((job, index) => {
        const result = coordsResults[index];
        if (result.coordinates) {
            mappableJobs.push(job);
            routeCoords.push(result.coordinates);
        } else {
            unmappableJobs.push({ ...job, geocodeError: result.error || 'Unknown geocoding error' });
        }
    });

    const route = await fetchRoute(routeCoords);
    if (mapRequestRef.current !== requestId) return;

    const finalMappableJobs = [...mappableJobs];
    let finalUnmappableJobs = [...unmappableJobs];
    const allCoordsForMap = [...(route?.coordinates || routeCoords)];

    if (unmappableJobs.length > 0) {
        const fallbackQueries = unmappableJobs.map(job => {
            if (job.zipCode) return `${job.zipCode}, AZ`;
            if (job.city) return `${job.city}, AZ`;
            return null;
        });

        const jobsToTry = unmappableJobs.filter((_, i) => fallbackQueries[i] !== null);
        const queriesToRun = fallbackQueries.filter((q): q is string => q !== null);
        
        if (queriesToRun.length > 0) {
            const fallbackResults = await geocodeAddresses(queriesToRun);
            if (mapRequestRef.current !== requestId) return;

            const stillFailingJobs: DisplayJob[] = [];
            jobsToTry.forEach((job, i) => {
                const result = fallbackResults[i];
                if (result.coordinates) {
                    const estimatedJob = { ...job, isEstimatedLocation: true, geocodeError: `Estimated location for ${queriesToRun[i]}` };
                    finalMappableJobs.push(estimatedJob);
                    allCoordsForMap.push(result.coordinates);
                } else {
                    stillFailingJobs.push(job);
                }
            });
            const jobsWithoutQuery = unmappableJobs.filter((_, i) => fallbackQueries[i] === null);
            finalUnmappableJobs = [...stillFailingJobs, ...jobsWithoutQuery];
        }
    }

    const finalRouteInfo: RouteInfo | null = route ? {
        ...route,
        coordinates: allCoordsForMap
    } : allCoordsForMap.length > 0 ? {
        distance: 0,
        duration: 0,
        geometry: null,
        coordinates: allCoordsForMap
    } : null;

    setActiveRoute({ repName: rep.name, mappableJobs: finalMappableJobs, unmappableJobs: finalUnmappableJobs, routeInfo: finalRouteInfo });
    setIsRouting(false);
  }, [appState.reps, log]);

  const handleShowUnassignedJobsOnMap = useCallback(async (jobs?: Job[]) => {
    const requestId = ++mapRequestRef.current;
    const targetJobs = jobs || appState.unassignedJobs;
    log(`ACTION: Show Unassigned Jobs on Map (${targetJobs.length} items).`);
    
    if (targetJobs.length === 0) { 
        if (mapRequestRef.current === requestId) {
            setActiveRoute(null); 
        }
        return; 
    }
    
    setIsRouting(true);
    setSelectedRepId(null);
    try {
        const addresses = targetJobs.map(j => j.address);
        const coordsResults = await geocodeAddresses(addresses);
        if (mapRequestRef.current !== requestId) return;

        const mappableJobs: DisplayJob[] = [];
        const unmappableJobs: DisplayJob[] = [];
        const mappableCoords: Coordinates[] = [];
        targetJobs.forEach((job, index) => {
            const result = coordsResults[index];
            if (result.coordinates) { mappableJobs.push(job); mappableCoords.push(result.coordinates); }
            else { unmappableJobs.push({ ...job, geocodeError: result.error || 'Unknown' }); }
        });
        
        const routeInfo: RouteInfo = {
            distance: 0,
            duration: 0,
            geometry: null,
            coordinates: mappableCoords
        };
        
        setActiveRoute({ repName: 'Unassigned Jobs', mappableJobs, unmappableJobs, routeInfo });
    } catch (error) { console.error("Failed to show unassigned jobs:", error); } finally { 
        if (mapRequestRef.current === requestId) setIsRouting(false); 
    }
  }, [appState.unassignedJobs, log]);

  const handleShowZipOnMap = useCallback(async (zip: string, rep?: Rep) => {
      const requestId = ++mapRequestRef.current;
      log(`ACTION: Show Zip ${zip} on Map.`);
      setIsRouting(true);
      try {
          const result = await geocodeAddresses([`${zip}, Arizona, USA`]);
          if (mapRequestRef.current !== requestId) return;

          if (result[0]?.coordinates) {
              const coord = result[0].coordinates;
              const dummyJob: DisplayJob = {
                  id: `zip-${zip}`,
                  customerName: `Zip Code: ${zip}`,
                  address: `${zip}, Arizona`,
                  notes: rep ? ` Territory of ${rep.name}` : '',
                  city: '',
                  zipCode: zip
              };
              setActiveRoute({ 
                  repName: `Zip: ${zip}`, 
                  mappableJobs: [dummyJob], 
                  unmappableJobs: [], 
                  routeInfo: { distance: 0, duration: 0, geometry: null, coordinates: [coord] } 
              });
          } else {
              log(`Could not locate zip ${zip}`);
          }
      } catch(e) { console.error(e); } finally { 
          if (mapRequestRef.current === requestId) setIsRouting(false); 
      }
  }, [log]);

  const handleShowAllRepLocations = useCallback(async () => {
      const requestId = ++mapRequestRef.current;
      log('ACTION: Show All Rep Locations.');
      setIsRouting(true);
      try {
          const repsWithZips = appState.reps.filter(r => r.zipCodes && r.zipCodes.length > 0);
          const displayJobs: DisplayJob[] = repsWithZips.map(r => ({
              id: `home-${r.id}`,
              customerName: r.name,
              address: `${r.zipCodes![0]}, Arizona, USA`,
              notes: 'Home Base',
              city: '',
              zipCode: r.zipCodes![0],
              isRepHome: true,
              assignedRepName: r.name
          }));
          
          const addresses = displayJobs.map(j => j.address);
          const results = await geocodeAddresses(addresses);
          if (mapRequestRef.current !== requestId) return;

          const mappableJobs: DisplayJob[] = [];
          const coords: Coordinates[] = [];
          
          displayJobs.forEach((job, i) => {
              if (results[i].coordinates) {
                  mappableJobs.push(job);
                  coords.push(results[i].coordinates!);
              }
          });
          
          setActiveRoute({
              repName: 'All Rep Locations',
              mappableJobs,
              unmappableJobs: [],
              routeInfo: { distance: 0, duration: 0, geometry: null, coordinates: coords }
          });
      } catch (e) { console.error(e); } finally { 
          if (mapRequestRef.current === requestId) setIsRouting(false); 
      }
  }, [appState.reps, log]);

  const handleShowAllJobsOnMap = useCallback(async () => {
    const requestId = ++mapRequestRef.current;
    log('ACTION: Show All Jobs on Map.');
    if (allJobs.length === 0) { 
        if (mapRequestRef.current === requestId) setActiveRoute(null); 
        return; 
    }
    
    setIsRouting(true);
    setSelectedRepId(null);
    try {
        const addresses = allJobs.map(j => j.address);
        const coordsResults = await geocodeAddresses(addresses);
        if (mapRequestRef.current !== requestId) return;

        const mappableJobs: DisplayJob[] = [];
        const unmappableJobs: DisplayJob[] = [];
        const mappableCoords: Coordinates[] = [];
        allJobs.forEach((job, index) => {
            const result = coordsResults[index];
            if (result.coordinates) { mappableJobs.push(job); mappableCoords.push(result.coordinates); }
            else { unmappableJobs.push({ ...job, geocodeError: result.error || 'Unknown' }); }
        });
        
        const routeInfo: RouteInfo = {
            distance: 0, duration: 0, geometry: null, coordinates: mappableCoords
        };
        
        setActiveRoute({ repName: 'Job Map', mappableJobs, unmappableJobs, routeInfo });
    } catch (error) { console.error("Failed to show all jobs on map:", error); } finally { 
        if (mapRequestRef.current === requestId) setIsRouting(false); 
    }
  }, [allJobs, log]);
  
  const handleRefreshRoute = useCallback(async () => {
    if (!activeRoute || isRouting) return;
    const repName = activeRoute.repName;
    if (repName === 'Unassigned Jobs') await handleShowUnassignedJobsOnMap();
    else if (repName === 'Job Map') await handleShowAllJobsOnMap();
    else if (repName === 'All Rep Locations') await handleShowAllRepLocations();
    else {
        const rep = appState.reps.find(r => r.name === repName);
        if (rep) await handleShowRoute(rep.id, false);
        else await handleShowAllJobsOnMap();
    }
  }, [activeRoute, isRouting, log, handleShowUnassignedJobsOnMap, handleShowAllJobsOnMap, handleShowAllRepLocations, appState.reps, handleShowRoute]);

  const handleRefreshRouteRef = useRef(handleRefreshRoute);
  useEffect(() => { handleRefreshRouteRef.current = handleRefreshRoute; }, [handleRefreshRoute]);

  useEffect(() => {
      if (mapRefreshTrigger > 0) {
          handleRefreshRouteRef.current?.();
      }
  }, [mapRefreshTrigger]);

  const handleParseJobs = useCallback(async (pastedText: string, onComplete: () => void) => {
    log('ACTION: Process Pasted Jobs clicked.');
    if (!pastedText.trim()) { setParsingError('Pasted text cannot be empty.'); return; }
    setIsParsing(true);
    setParsingError(null);
    try {
      const { date: parsedDateString, jobs: parsedJobs, assignments } = await parseJobsFromText(pastedText, appState.reps);
      const targetDate = parsedDateString ? new Date(parsedDateString + 'T12:00:00') : selectedDate;
      const targetDateKey = formatDateToKey(targetDate);
      
      let baseState = dailyStates.get(targetDateKey);
      if (!baseState) {
          const { reps: repData, sheetName } = await fetchSheetData(targetDate);
          setActiveSheetName(sheetName);
          if (repData.length > 0 && (repData[0] as Rep).isMock) setUsingMockData(true);
          const repsWithSchedule = repData.map(rep => ({ ...rep, schedule: TIME_SLOTS.map(slot => ({ ...slot, jobs: [] })), isLocked: false }));
          baseState = { reps: repsWithSchedule, unassignedJobs: [], settings: DEFAULT_SETTINGS };
      }

      const newDayState = JSON.parse(JSON.stringify(baseState)) as AppState;
      const assignedJobIds = new Set(assignments.map(a => a.jobId));
      const jobsToLeaveUnassigned = parsedJobs.filter(j => !assignedJobIds.has(j.id));
      const existingUnassignedIds = new Set(newDayState.unassignedJobs.map(j => j.id));
      newDayState.unassignedJobs.push(...jobsToLeaveUnassigned.filter(j => !existingUnassignedIds.has(j.id)));
      
      for (const assignment of assignments) {
        const jobToMove = parsedJobs.find(j => j.id === assignment.jobId);
        if (!jobToMove) continue;
        const rep = newDayState.reps.find(r => r.id === assignment.repId);
        if (!rep) { newDayState.unassignedJobs.push(jobToMove); continue; };
        const slot = rep.schedule.find(s => s.id === assignment.slotId);
        if (!slot) { newDayState.unassignedJobs.push(jobToMove); continue; }
        slot.jobs.push(jobToMove);
      }
      
      const newDailyStates = new Map(dailyStates).set(targetDateKey, newDayState);
      setHistory([newDailyStates]);
      setHistoryIndex(0);

      if (!activeDayKeys.includes(targetDateKey)) addActiveDay(targetDate);
      else _setSelectedDate(targetDate);
      onComplete();
      log('- COMPLETE: Job parsing finished.');
      
      if (parsedJobs.length > 0) updateGeoCache(parsedJobs.map(j => j.address));
      
      setAutoMapAction('show-all');

    } catch (error) {
      console.error('Failed to parse jobs:', error);
      setParsingError('Job parsing failed.');
    } finally {
      setIsParsing(false);
    }
  }, [log, appState.reps, selectedDate, dailyStates, activeDayKeys, addActiveDay, updateGeoCache]);

  const handleClearAllSchedules = useCallback(() => { 
    const dateKey = formatDateToKey(selectedDate);
    recordChange(currentDailyStates => {
        const newDailyStates = new Map<string, AppState>(currentDailyStates);
        const dayState = newDailyStates.get(dateKey);
        if (!dayState) return currentDailyStates;
        const unlockedReps = dayState.reps.filter(rep => !rep.isLocked);
        
        const jobsToUnassign: DisplayJob[] = [];
        const preservedReps = unlockedReps.map(rep => {
            const newSchedule = rep.schedule.map(slot => {
                const preservedJobs = [];
                const removedJobs = [];
                for (const job of slot.jobs) {
                    const repNamePattern = new RegExp(`\\(Rep:\\s*${rep.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`, 'i');
                    if (repNamePattern.test(job.notes)) {
                        preservedJobs.push(job);
                    } else {
                        removedJobs.push(job);
                    }
                }
                jobsToUnassign.push(...removedJobs);
                return { ...slot, jobs: preservedJobs };
            });
            return { ...rep, schedule: newSchedule, isOptimized: false };
        });

        if (jobsToUnassign.length === 0) return currentDailyStates;

        const cleanedJobs = jobsToUnassign.map(job => {
            const cleaned = { ...job, notes: (job.notes || '').replace(/\(Scheduled: [^)]+\)\s*/, '').trim() };
            delete cleaned.assignmentScore;
            delete cleaned.scoreBreakdown;
            return cleaned;
        });
        
        const combined = [...dayState.unassignedJobs, ...cleanedJobs];
        const newUnassignedJobs = combined.filter((job, index, self) => index === self.findIndex((j) => (j.id === job.id))).sort((a, b) => (a.city || '').localeCompare(b.city || ''));
        
        const finalReps = dayState.reps.map(originalRep => {
            if (originalRep.isLocked) return originalRep;
            const updatedRep = preservedReps.find(pr => pr.id === originalRep.id);
            return updatedRep || originalRep;
        });

        newDailyStates.set(dateKey, { ...dayState, reps: finalReps, unassignedJobs: newUnassignedJobs });
        return newDailyStates;
    }, 'Clear All Schedules');
    setAutoMapAction('show-all');
  }, [recordChange, selectedDate]);

  const handleToggleRepLock = useCallback((repId: string) => { 
    const dateKey = formatDateToKey(selectedDate);
    recordChange(currentDailyStates => {
        const newDailyStates = new Map<string, AppState>(currentDailyStates);
        const dayState = newDailyStates.get(dateKey);
        if (!dayState) return currentDailyStates;
        const newReps = dayState.reps.map(rep => rep.id === repId ? { ...rep, isLocked: !rep.isLocked } : rep);
        newDailyStates.set(dateKey, { ...dayState, reps: newReps });
        return newDailyStates;
    }, 'Toggle Rep Lock');
  }, [recordChange, selectedDate]);

  const handleUpdateJob = useCallback((jobId: string, updatedDetails: Partial<Pick<Job, 'customerName' | 'address' | 'notes' | 'originalTimeframe'>>) => { 
    const dateKey = formatDateToKey(selectedDate);
    recordChange(currentDailyStates => {
        const newDailyStates = new Map<string, AppState>(currentDailyStates);
        const dayState = newDailyStates.get(dateKey);
        if (!dayState) return currentDailyStates;
        const newState = JSON.parse(JSON.stringify(dayState)) as AppState;
        
        let wasUpdated = false;
        const findAndUpdate = (job: Job) => {
            if (job.id === jobId) {
                Object.assign(job, updatedDetails);
                wasUpdated = true;
                return true;
            }
            return false;
        };

        if (newState.unassignedJobs.some(findAndUpdate)) { } 
        else {
            for (const rep of newState.reps) {
                for (const slot of rep.schedule) {
                    if (slot.jobs.some(findAndUpdate)) { break; }
                }
                if (wasUpdated) break;
            }
        }

        if (wasUpdated) {
            newDailyStates.set(dateKey, newState);
            return newDailyStates;
        }
        return currentDailyStates;
    }, 'Update Job Details');
    setMapRefreshTrigger(prev => prev + 1);
  }, [recordChange, selectedDate]);

  const handleUpdateRep = useCallback((repId: string, updates: Partial<Rep>) => { 
      const dateKey = formatDateToKey(selectedDate);
      recordChange(currentDailyStates => {
          const newDailyStates = new Map<string, AppState>(currentDailyStates);
          const dayState = newDailyStates.get(dateKey);
          if (!dayState) return currentDailyStates;
          const newState = JSON.parse(JSON.stringify(dayState)) as AppState;
          const rep = newState.reps.find(r => r.id === repId);
          if (rep) { Object.assign(rep, updates); }
          newDailyStates.set(dateKey, newState);
          return newDailyStates;
      }, 'Update Rep Settings');
  }, [recordChange, selectedDate]);

  const handleRemoveJob = useCallback((jobId: string) => { 
    const dateKey = formatDateToKey(selectedDate);
    let jobRemoved = false;
    let jobName = '';
    recordChange(currentDailyStates => {
        const newDailyStates = new Map<string, AppState>(currentDailyStates);
        const dayState = newDailyStates.get(dateKey);
        if (!dayState) return currentDailyStates;
        const newState = JSON.parse(JSON.stringify(dayState)) as AppState;
        const unassignedIndex = newState.unassignedJobs.findIndex(j => j.id === jobId);
        if (unassignedIndex > -1) {
            jobName = newState.unassignedJobs[unassignedIndex].address;
            newState.unassignedJobs.splice(unassignedIndex, 1);
            jobRemoved = true;
        } else {
            for (const rep of newState.reps) {
                for (const slot of rep.schedule) {
                    const jobIndex = slot.jobs.findIndex(j => j.id === jobId);
                    if (jobIndex > -1) {
                        jobName = slot.jobs[jobIndex].address;
                        slot.jobs.splice(jobIndex, 1);
                        jobRemoved = true;
                        break;
                    }
                }
                if (jobRemoved) break;
            }
        }
        if (jobRemoved) { newDailyStates.set(dateKey, newState); return newDailyStates; }
        return currentDailyStates;
    }, 'Remove Job');
    if (jobRemoved) { 
        log(`ACTION: Removed job "${jobName}"`); 
        setMapRefreshTrigger(prev => prev + 1);
    }
  }, [recordChange, selectedDate, log]);

  const handleAiFixAddresses = useCallback(async () => { 
    const unmappable = activeRoute?.unmappableJobs;
    if (!unmappable || unmappable.length === 0) { log('AI FIX: No unmappable jobs to fix.'); return; }
    log(`ACTION: AI Fix Addresses clicked for ${unmappable.length} jobs.`);
    setIsAiFixingAddresses(true);
    try {
        const results = await fixAddressesWithAi(unmappable);
        let correctedCount = 0;
        for (const result of results) {
            const originalJob = unmappable.find(j => j.id === result.jobId);
            if (!originalJob) continue;
            if (!result.correctedAddress.startsWith('Unverified: ')) {
                const originalAddress = originalJob.address;
                const updatedNotes = `(Address corrected from: ${originalAddress}) ${originalJob.notes || ''}`.trim();
                handleUpdateJob(result.jobId, { address: result.correctedAddress, notes: updatedNotes });
                log(`- AI FIX: Corrected "${originalAddress}" to "${result.correctedAddress}".`);
                correctedCount++;
            } else {
                log(`- AI FIX: Could not verify address for job "${originalJob.customerName}". AI response: ${result.correctedAddress}`);
            }
        }
        log(`- AI FIX COMPLETE: Successfully corrected ${correctedCount} of ${unmappable.length} addresses.`);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown AI error";
        log(`- ERROR (AI Fix): ${errorMessage}`);
        console.error("AI address fix failed:", error);
    } finally {
        setIsAiFixingAddresses(false);
    }
  }, [activeRoute, handleUpdateJob, log]);
  
  const handleTryAddressVariations = useCallback(async () => { 
    const unmappable = activeRoute?.unmappableJobs;
    if (!unmappable || unmappable.length === 0) { log('VARIATIONS: No unmappable jobs to try.'); return; }
    log(`ACTION: Try Address Variations clicked for ${unmappable.length} jobs.`);
    setIsTryingVariations(true);
    try {
        const variationsMap = new Map<string, { jobId: string, originalAddress: string }>();
        const allVariations: string[] = [];
        
        const generateAddressVariations = (address: string): string[] => {
            const variations = new Set<string>();
            variations.add(address);

            const expand = (addr: string) => {
                return addr
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
                    .replace(/\bPl[\.]?\b/gi, 'Place');
            };

            const expanded = expand(address);
            if (expanded !== address) variations.add(expanded);
            const noCountry = address.replace(/,?\s*(united states|usa)\b/gi, '').trim();
            if (noCountry !== address) variations.add(noCountry);
            const noZip = address.replace(/\b\d{5}(?:-\d{4})?\b/g, '').trim().replace(/,$/, '').replace(/,\s*$/, '');
            if (noZip !== address && noZip.length > 5) {
                variations.add(noZip);
                const expandedNoZip = expand(noZip);
                if (expandedNoZip !== noZip) variations.add(expandedNoZip);
            }
            const streetMatch = address.match(/^(\d+\s+[a-zA-Z0-9\s\.]+?)(?:,|$)/);
            if (streetMatch) {
                const streetOnly = streetMatch[1].trim();
                if (streetOnly !== address && streetOnly.length > 5) {
                    variations.add(streetOnly); 
                    variations.add(`${streetOnly}, AZ`); 
                    const expandedStreet = expand(streetOnly);
                    if (expandedStreet !== streetOnly) {
                        variations.add(expandedStreet);
                        variations.add(`${expandedStreet}, AZ`);
                    }
                }
            }
            return Array.from(variations);
        };

        unmappable.forEach(job => {
            const variations = generateAddressVariations(job.address);
            variations.forEach(v => {
                if (!variationsMap.has(v)) {
                    variationsMap.set(v, { jobId: job.id, originalAddress: job.address });
                    allVariations.push(v);
                }
            });
        });
        
        log(`- VARIATIONS: Generated ${allVariations.length} unique variations to test.`);
        const results = await geocodeAddresses(allVariations);
        const successfulJobs = new Map<string, { address: string, result: GeocodeResult }>();
        results.forEach((result, index) => {
            if (result.coordinates) {
                const variation = allVariations[index];
                const { jobId } = variationsMap.get(variation)!;
                if (!successfulJobs.has(jobId)) { successfulJobs.set(jobId, { address: variation, result }); }
            }
        });
        if (successfulJobs.size > 0) {
            log(`- VARIATIONS: Found valid locations for ${successfulJobs.size} jobs.`);
            successfulJobs.forEach(({ address }, jobId) => {
                const originalJob = unmappable.find(j => j.id === jobId);
                if (originalJob) {
                    const updatedNotes = `(Address corrected from: ${originalJob.address}) ${originalJob.notes || ''}`.trim();
                    handleUpdateJob(jobId, { address: address, notes: updatedNotes });
                }
            });
        } else { log('- VARIATIONS: No successful variations found.'); }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        log(`- ERROR (Variations): ${errorMessage}`);
        console.error("Address variation check failed:", error);
    } finally {
        setIsTryingVariations(false);
    }
  }, [activeRoute, handleUpdateJob, log]);

  const handleUnoptimizeRepRoute = useCallback((repId: string) => {
    const dateKey = formatDateToKey(selectedDate);
    recordChange(currentDailyStates => {
        const newDailyStates = new Map<string, AppState>(currentDailyStates);
        const dayState = newDailyStates.get(dateKey);
        if (!dayState) return currentDailyStates;
        const newState = JSON.parse(JSON.stringify(dayState)) as AppState;
        const targetRep = newState.reps.find(r => r.id === repId);
        if (!targetRep || !targetRep.isOptimized) return currentDailyStates;

        // Gather all jobs
        const allJobs = targetRep.schedule.flatMap(s => s.jobs);
        
        // Reset schedule buckets
        targetRep.schedule.forEach(s => s.jobs = []);
        
        // Redistribute
        allJobs.forEach(job => {
            delete job.timeSlotLabel; // Remove calculated label
            let targetSlotId = 'ts-1'; // Default
            if (job.originalTimeframe) {
                const mapped = mapTimeframeToSlotId(job.originalTimeframe);
                if (mapped) targetSlotId = mapped;
            }
            const slot = targetRep.schedule.find(s => s.id === targetSlotId) || targetRep.schedule[0];
            slot.jobs.push(job);
        });

        targetRep.isOptimized = false;
        newDailyStates.set(dateKey, newState);
        return newDailyStates;
    }, 'Un-Optimize Route');
    setMapRefreshTrigger(prev => prev + 1);
  }, [recordChange, selectedDate]);

  const handleOptimizeRepRoute = useCallback(async (repId: string) => { 
    const rep = appState.reps.find(r => r.id === repId);
    if (!rep || rep.schedule.flatMap(s => s.jobs).length < 1) return;
    
    const dateKey = formatDateToKey(selectedDate);
    let allJobs = rep.schedule.flatMap(s => s.jobs);
    const addresses = allJobs.map(j => j.address);
    
    // Ensure all addresses are geocoded before we sort
    if (rep.zipCodes && rep.zipCodes.length > 0) {
        addresses.push(`${rep.zipCodes[0]}, Arizona, USA`);
    }
    const geoResults = await geocodeAddresses(addresses); // Populates internal cache
    
    // Manually build a quick lookup map for this operation to avoid relying on stale state
    const tempCoordMap = new Map<string, Coordinates>();
    addresses.forEach((addr, i) => {
        if (geoResults[i].coordinates) {
            tempCoordMap.set(addr, geoResults[i].coordinates!);
        }
    });

    recordChange(currentDailyStates => {
        const newDailyStates = new Map<string, AppState>(currentDailyStates);
        const dayState = newDailyStates.get(dateKey);
        if (!dayState) return currentDailyStates;
        const newState = JSON.parse(JSON.stringify(dayState)) as AppState;
        const targetRep = newState.reps.find(r => r.id === repId);
        if (!targetRep) return currentDailyStates;

        let jobsToOptimize = targetRep.schedule.flatMap(s => s.jobs);
        const jobCount = jobsToOptimize.length;

        // Conditional optimization logic based on job count
        if (jobCount >= 5) {
            // Full optimization for 5+ jobs
            const sortedJobs = [...jobsToOptimize].sort((a, b) => getSortableHour(a.originalTimeframe) - getSortableHour(b.originalTimeframe));
            targetRep.schedule.forEach(s => s.jobs = []);

            let slotIndex = 0;
            const maxJobsInSlot = dayState.settings.allowDoubleBooking ? dayState.settings.maxJobsPerSlot : 1;

            for (const job of sortedJobs) {
                while (slotIndex < TIME_SLOTS.length) {
                    const currentSlot = targetRep.schedule[slotIndex];
                    if (currentSlot.jobs.length < maxJobsInSlot) {
                        currentSlot.jobs.push({ ...job, timeSlotLabel: currentSlot.label });
                        break;
                    }
                    slotIndex++;
                }
                if (slotIndex >= TIME_SLOTS.length) {
                    newState.unassignedJobs.push(job);
                }
            }
            targetRep.isOptimized = true;

        } else {
             // Reorder within existing slots for 4 or fewer jobs
            targetRep.schedule.forEach(slot => {
                if (slot.jobs.length > 1) {
                    let sortedSlotJobs: DisplayJob[] = [];
                    let unvisited = [...slot.jobs];
                    
                    let currentReferenceCoord: Coordinates | undefined;
                    // Try to find a starting point (e.g., closest to home or previous slot)
                    // For simplicity, we'll start with the first geocodable job
                    let startIndex = unvisited.findIndex(job => tempCoordMap.has(job.address));
                    if (startIndex === -1) startIndex = 0; // Fallback
                    
                    let [currentJob] = unvisited.splice(startIndex, 1);
                    sortedSlotJobs.push(currentJob);
                    currentReferenceCoord = tempCoordMap.get(currentJob.address);

                    while(unvisited.length > 0) {
                        if (!currentReferenceCoord) {
                            sortedSlotJobs.push(...unvisited);
                            break;
                        }
                        let nearestIndex = 0;
                        let minDist = Infinity;
                        unvisited.forEach((job, idx) => {
                            const coord = tempCoordMap.get(job.address);
                            if (coord) {
                                const dist = haversineDistance(currentReferenceCoord!, coord);
                                if (dist < minDist) {
                                    minDist = dist;
                                    nearestIndex = idx;
                                }
                            }
                        });
                        
                        [currentJob] = unvisited.splice(nearestIndex, 1);
                        sortedSlotJobs.push(currentJob);
                        currentReferenceCoord = tempCoordMap.get(currentJob.address);
                    }
                    slot.jobs = sortedSlotJobs.map(j => ({ ...j, timeSlotLabel: slot.label }));
                } else if (slot.jobs.length === 1) {
                    slot.jobs[0].timeSlotLabel = slot.label;
                }
            });
            targetRep.isOptimized = true;
        }

        newDailyStates.set(dateKey, newState);
        return newDailyStates;
    }, 'Optimize Route');
    
    setAutoMapAction(repId);
  }, [appState.reps, selectedDate, recordChange, updateGeoCache]);

  const handleDistributeJobs = useCallback(() => {
    log('ACTION: Distribute Jobs clicked.');
    setIsDistributing(true);
    setTimeout(() => {
        const dateKey = formatDateToKey(selectedDate);
        recordChange(currentDailyStates => {
            const newDailyStates = new Map<string, AppState>(currentDailyStates);
            const dayState = newDailyStates.get(dateKey);
            if (!dayState || dayState.unassignedJobs.length === 0) { return currentDailyStates; }
            const newState = JSON.parse(JSON.stringify(dayState)) as AppState;
            const jobsToAssign = [...newState.unassignedJobs];
            const repsWithNoJobs = newState.reps.filter(rep => !rep.isLocked && !rep.isOptimized && rep.schedule.flatMap(s => s.jobs).length === 0);
            if (repsWithNoJobs.length === 0) { return currentDailyStates; }
            let assignedCount = 0;
            for (const rep of repsWithNoJobs) {
                if (jobsToAssign.length === 0) break;
                const jobIndex = jobsToAssign.findIndex(job => isJobValidForRepRegion(job, rep));
                if (jobIndex === -1) continue;
                const [job] = jobsToAssign.splice(jobIndex, 1);
                let targetSlotId: string | null = null;
                if (job.originalTimeframe) { targetSlotId = mapTimeframeToSlotId(job.originalTimeframe); }
                let assigned = false;
                const availableSlots = rep.schedule.filter(s => !(rep.unavailableSlots?.[selectedDayString] || []).includes(s.id));
                const dummyBreakdown: ScoreBreakdown = { distanceBase: 0, distanceCluster: 0, skillRoofing: 0, skillType: 0, performance: 0, penalty: 0 };
                if (targetSlotId) {
                    const targetSlot = availableSlots.find(s => s.id === targetSlotId);
                    if (targetSlot) { targetSlot.jobs.push({ ...job, assignmentScore: 50, scoreBreakdown: dummyBreakdown }); assigned = true; }
                } 
                if (!assigned && availableSlots.length > 0) { availableSlots[0].jobs.push({ ...job, assignmentScore: 50, scoreBreakdown: dummyBreakdown }); assigned = true; }
                if (assigned) { assignedCount++; } else { jobsToAssign.unshift(job); }
            }
            newState.unassignedJobs = jobsToAssign;
            log(`- DISTRIBUTE: Assigned ${assignedCount} jobs to reps with empty schedules.`);
            newDailyStates.set(dateKey, newState);
            return newDailyStates;
        }, 'Distribute Jobs');
        setAutoMapAction('show-all');
        setIsDistributing(false);
    }, 10);
  }, [recordChange, selectedDate, log, selectedDayString, isJobValidForRepRegion]);

  const handleAutoAssign = useCallback(() => {
    log('ACTION: Auto-Assign All (Balanced) clicked.');
    setIsAutoAssigning(true);
    setTimeout(async () => {
        const dateKey = formatDateToKey(selectedDate);
        const currentDayState = history[historyIndex]?.get(dateKey);
        
        if (currentDayState && currentDayState.unassignedJobs.length > 0) {
             const allAddresses = currentDayState.unassignedJobs.map(j => j.address);
             await updateGeoCache(allAddresses);
        }

        recordChange(currentDailyStates => {
            const newDailyStates = new Map<string, AppState>(currentDailyStates);
            const dayState = newDailyStates.get(dateKey);
            if (!dayState || dayState.unassignedJobs.length === 0) {
                log('- INFO: No unassigned jobs to assign.');
                return currentDailyStates;
            }

            const newState = JSON.parse(JSON.stringify(dayState)) as AppState;
            const jobsToAssign = [...newState.unassignedJobs];
            newState.unassignedJobs = []; 
            let assignedCount = 0;

            const cityOrder = EAST_TO_WEST_CITIES.reduce((acc, city, index) => {
                acc[city.toLowerCase()] = index;
                return acc;
            }, {} as Record<string, number>);

            jobsToAssign.sort((a, b) => {
                const orderA = cityOrder[norm(a.city)] ?? 999;
                const orderB = cityOrder[norm(b.city)] ?? 999;
                return orderA - orderB;
            });

            const availableReps = newState.reps.filter(r => !r.isLocked && !r.isOptimized);

            for (const job of jobsToAssign) {
                let bestAssignment: { repId: string; slotId: string; score: number; breakdown: ScoreBreakdown } | null = null;
                
                const eligibleReps = availableReps.filter(rep => rep.schedule.flatMap(s => s.jobs).length < newState.settings.maxJobsPerRep);

                for (const rep of eligibleReps) {
                    if (!isJobValidForRepRegion(job, rep)) continue;

                    const { violated } = checkCityRuleViolation(rep, job.city);
                    if (violated) continue;

                    const currentJobCount = rep.schedule.flatMap(s => s.jobs).length;
                    const isUnderMinTarget = currentJobCount < newState.settings.minJobsPerRep;

                    for (const slot of rep.schedule) {
                        const maxJobsInSlot = newState.settings.allowDoubleBooking ? newState.settings.maxJobsPerSlot : 1;
                        if (slot.jobs.length >= maxJobsInSlot) continue;
                        
                        const isUnavailable = (rep.unavailableSlots?.[selectedDayString] || []).includes(slot.id);
                        if (isUnavailable && !newState.settings.allowAssignOutsideAvailability) continue;

                        if (newState.settings.strictTimeSlotMatching) {
                            const requiredSlotId = mapTimeframeToSlotId(job.originalTimeframe || '');
                            if (requiredSlotId && requiredSlotId !== slot.id) continue;
                        }

                        const { score, breakdown } = calculateAssignmentScore(job, rep, slot.id, newState.settings);
                        
                        let finalScore = score;
                        if (isUnderMinTarget) {
                            finalScore += 10000;
                        }

                        if (!bestAssignment || finalScore > bestAssignment.score) {
                            bestAssignment = { repId: rep.id, slotId: slot.id, score: finalScore, breakdown };
                        }
                    }
                }

                if (bestAssignment) {
                    const targetRep = newState.reps.find(r => r.id === bestAssignment!.repId)!;
                    const targetSlot = targetRep.schedule.find(s => s.id === bestAssignment!.slotId)!;
                    
                    const displayScore = bestAssignment.score > 1000 ? bestAssignment.score - 10000 : bestAssignment.score;
                    
                    const jobWithScore: DisplayJob = { ...job, assignmentScore: displayScore, scoreBreakdown: bestAssignment.breakdown };
                    targetSlot.jobs.push(jobWithScore);
                    assignedCount++;
                } else {
                    newState.unassignedJobs.push(job);
                }
            }
            
            log(`- AUTO-ASSIGN: Assigned ${assignedCount} jobs.`);
            newDailyStates.set(dateKey, newState);
            return newDailyStates;

        }, 'Auto-Assign All');
        setAutoMapAction('show-all');
        setIsAutoAssigning(false);
    }, 100);
  }, [recordChange, selectedDate, log, selectedDayString, checkCityRuleViolation, calculateAssignmentScore, history, historyIndex, updateGeoCache, isJobValidForRepRegion]);

  const handleAutoAssignForRep = useCallback((repId: string) => {
    log(`ACTION: Auto-Assign for Rep ID ${repId} clicked.`);
    setIsAutoAssigning(true);
    setTimeout(async () => {
        const dateKey = formatDateToKey(selectedDate);
        const currentDayState = history[historyIndex]?.get(dateKey);
        if (currentDayState && currentDayState.unassignedJobs.length > 0) {
             const allAddresses = currentDayState.unassignedJobs.map(j => j.address);
             await updateGeoCache(allAddresses);
        }

        recordChange(currentDailyStates => {
            const newDailyStates = new Map<string, AppState>(currentDailyStates);
            const dayState = newDailyStates.get(dateKey);
            if (!dayState || dayState.unassignedJobs.length === 0) {
                return currentDailyStates;
            }

            const newState = JSON.parse(JSON.stringify(dayState)) as AppState;
            const targetRep = newState.reps.find(r => r.id === repId);

            if (!targetRep || targetRep.isLocked || targetRep.isOptimized) {
                return currentDailyStates;
            }

            const jobsToAssign = [...newState.unassignedJobs];
            newState.unassignedJobs = [];
            let assignedCount = 0;

            const cityOrder = EAST_TO_WEST_CITIES.reduce((acc, city, index) => {
                acc[city.toLowerCase()] = index;
                return acc;
            }, {} as Record<string, number>);

            jobsToAssign.sort((a, b) => {
                const orderA = cityOrder[norm(a.city)] ?? 999;
                const orderB = cityOrder[norm(b.city)] ?? 999;
                return orderA - orderB;
            });

            for (const job of jobsToAssign) {
                let bestSlot: { slotId: string; score: number; breakdown: ScoreBreakdown } | null = null;
                
                const totalJobsForRep = targetRep.schedule.flatMap(s => s.jobs).length;
                if (totalJobsForRep >= newState.settings.maxJobsPerRep) {
                    newState.unassignedJobs.push(job);
                    continue; 
                }

                if (!isJobValidForRepRegion(job, targetRep)) {
                     newState.unassignedJobs.push(job);
                     continue;
                }

                const cityViolation = checkCityRuleViolation(targetRep, job.city);
                if (cityViolation.violated) {
                    newState.unassignedJobs.push(job);
                    continue;
                }

                for (const slot of targetRep.schedule) {
                    const maxJobsInSlot = newState.settings.allowDoubleBooking ? newState.settings.maxJobsPerSlot : 1;
                    if (slot.jobs.length >= maxJobsInSlot) continue;

                    const isUnavailable = (targetRep.unavailableSlots?.[selectedDayString] || []).includes(slot.id);
                    if (isUnavailable && !newState.settings.allowAssignOutsideAvailability) continue;

                    if (newState.settings.strictTimeSlotMatching) {
                        const requiredSlotId = mapTimeframeToSlotId(job.originalTimeframe || '');
                        if (requiredSlotId && requiredSlotId !== slot.id) continue;
                    }

                    const { score, breakdown } = calculateAssignmentScore(job, targetRep, slot.id, newState.settings);

                    if (!bestSlot || score > bestSlot.score) {
                        bestSlot = { slotId: slot.id, score, breakdown };
                    }
                }

                if (bestSlot) {
                    const targetSlot = targetRep.schedule.find(s => s.id === bestSlot!.slotId)!;
                    targetSlot.jobs.push({ ...job, assignmentScore: bestSlot.score, scoreBreakdown: bestSlot.breakdown });
                    assignedCount++;
                } else {
                    newState.unassignedJobs.push(job);
                }
            }
            
            newState.unassignedJobs.sort((a,b) => (a.city || '').localeCompare(b.city || ''));
            newDailyStates.set(dateKey, newState);
            return newDailyStates;

        }, `Auto-Assign for Rep ${repId}`);
        setMapRefreshTrigger(prev => prev + 1);
        setIsAutoAssigning(false);
    }, 100);
  }, [recordChange, selectedDate, log, selectedDayString, checkCityRuleViolation, calculateAssignmentScore, history, historyIndex, updateGeoCache, isJobValidForRepRegion]);

  const handleAiAssign = useCallback(async () => { 
    log('ACTION: Assign with AI clicked.');
    if (appState.unassignedJobs.length === 0) { log('- INFO: No jobs to assign. Aborting.'); return; }
    setIsAiAssigning(true);
    clearAiThoughts();
    try {
        const result = await assignJobsWithAi( appState.reps, appState.unassignedJobs, selectedDayString, appState.settings, addAiThought );
        addAiThought("Applying assignments...");
        const dateKey = formatDateToKey(selectedDate);
        recordChange(currentDailyStates => {
            const newDailyStates = new Map<string, AppState>(currentDailyStates);
            const dayState = newDailyStates.get(dateKey);
            if (!dayState) return currentDailyStates;
            const newState = JSON.parse(JSON.stringify(dayState)) as AppState;
            let assignedCount = 0;
            for (const assignment of result.assignments) {
                const jobIndex = newState.unassignedJobs.findIndex(j => j.id === assignment.jobId);
                if (jobIndex === -1) continue;
                const [jobToMove] = newState.unassignedJobs.splice(jobIndex, 1);
                const rep = newState.reps.find(r => r.id === assignment.repId);
                if (!rep) continue;
                const slot = rep.schedule.find(s => s.id === assignment.slotId);
                if (!slot) continue;
                slot.jobs.push({ 
                    ...jobToMove, 
                    assignmentScore: 85, 
                    scoreBreakdown: { distanceBase: 0, distanceCluster: 0, skillRoofing: 0, skillType: 0, performance: 0, penalty: 0 } 
                }); 
                assignedCount++;
            }
            log(`- AI RESULT: ${assignedCount} jobs assigned by AI.`);
            newDailyStates.set(dateKey, newState);
            return newDailyStates;
        }, 'AI Assign');
        addAiThought(`Assignment complete! ${result.assignments.length} jobs were assigned.`);
        setAutoMapAction('show-all');
    } catch (error) {
        console.error("AI assignment failed:", error);
        log(`- ERROR: AI assignment failed. Details in console.`);
        addAiThought(`An error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
        setIsAiAssigning(false);
    }
  }, [log, appState, selectedDayString, addAiThought, clearAiThoughts, recordChange, selectedDate]);

  const handleSwapSchedules = useCallback((repId1: string, repId2: string) => {
    const dateKey = formatDateToKey(selectedDate);
    recordChange(currentDailyStates => {
        const newDailyStates = new Map<string, AppState>(currentDailyStates);
        const dayState = newDailyStates.get(dateKey);
        if (!dayState) return currentDailyStates;
        const newState = JSON.parse(JSON.stringify(dayState)) as AppState;
        const rep1Index = newState.reps.findIndex(r => r.id === repId1);
        const rep2Index = newState.reps.findIndex(r => r.id === repId2);
        if (rep1Index === -1 || rep2Index === -1) return currentDailyStates;
        const tempSchedule = newState.reps[rep1Index].schedule;
        newState.reps[rep1Index].schedule = newState.reps[rep2Index].schedule;
        newState.reps[rep2Index].schedule = tempSchedule;
        newState.reps[rep1Index].isOptimized = false;
        newState.reps[rep2Index].isOptimized = false;
        newDailyStates.set(dateKey, newState);
        return newDailyStates;
    }, 'Swap Schedules');
    setMapRefreshTrigger(prev => prev + 1);
  }, [recordChange, selectedDate]);

  const handleToggleRepExpansion = (repId: string) => {
    setExpandedRepIds(prev => { const newSet = new Set(prev); newSet.has(repId) ? newSet.delete(repId) : newSet.add(repId); return newSet; });
  };
  const handleToggleAllReps = (filteredReps: Rep[]) => {
    if (expandedRepIds.size < filteredReps.length) setExpandedRepIds(new Set(filteredReps.map(r => r.id)));
    else setExpandedRepIds(new Set());
  };
  const handleSaveStateToFile = useCallback(() => { 
    log('ACTION: Save state to file.');
    try {
        const stateToSave = { dailyStates: Array.from(dailyStates.entries()), activeDayKeys, };
        const jsonString = JSON.stringify(stateToSave, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const date = new Date();
        const timestamp = `${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}`;
        link.download = `rep-route-planner-save-${timestamp}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        log('- SUCCESS: State saved to file.');
    } catch (error) { console.error("Save state error:", error); alert("Error saving file."); }
  }, [dailyStates, activeDayKeys, log]);

  const handleLoadStateFromFile = useCallback((loadedState: any) => {
    log('ACTION: Load state from file.');
    try {
        if (!loadedState || !Array.isArray(loadedState.dailyStates) || !Array.isArray(loadedState.activeDayKeys)) throw new Error("Invalid file format.");
        const isAppState = (v: any): v is { reps: Rep[], unassignedJobs: Job[], settings?: Partial<Settings> } => v && Array.isArray(v.reps) && Array.isArray(v.unassignedJobs);
        const validEntries = loadedState.dailyStates.map((e: any): [string, AppState] => {
            if(Array.isArray(e) && typeof e[0] === 'string' && isAppState(e[1])) {
                const stateCandidate = e[1];
                const finalState: AppState = {
                    reps: stateCandidate.reps,
                    unassignedJobs: stateCandidate.unassignedJobs,
                    settings: { ...DEFAULT_SETTINGS, ...(stateCandidate.settings || {}) }
                };
                return [e[0], finalState];
            } throw new Error("Invalid entry.");
        });
        const newDailyStates = new Map<string, AppState>(validEntries);
        const newActiveDayKeys = loadedState.activeDayKeys.filter((k: any) => typeof k === 'string');
        if (newActiveDayKeys.length === 0) throw new Error("No active days.");
        setHistory([newDailyStates]);
        setHistoryIndex(0);
        setActiveDayKeys(newActiveDayKeys);
        _setSelectedDate(new Date(newActiveDayKeys[0] + 'T12:00:00'));
        setActiveRoute(null);
        setSelectedRepId(null);
        log(`- SUCCESS: Loaded state.`);
        alert("Schedule loaded successfully!");
    } catch (error) { const msg = error instanceof Error ? error.message : "Unknown error"; log(`- ERROR: ${msg}`); alert(`Error loading file: ${msg}`); }
  }, [log]);

  const filteredReps = useCallback((repSearchTerm: string, cityFilters: Set<string>, lockFilter: 'all' | 'locked' | 'unlocked') => {
    const repsToSort = appState.reps.filter(rep => {
      if (cityFilters.size > 0 && !rep.schedule.some(slot => slot.jobs.some(job => job.city && cityFilters.has(job.city)))) return false;
      if (!rep.name.toLowerCase().includes(repSearchTerm.toLowerCase())) return false;
      if (lockFilter === 'locked' && !rep.isLocked) return false;
      if (lockFilter === 'unlocked' && rep.isLocked) return false;
      return true;
    });
    repsToSort.sort((a, b) => {
      const aUnavailableSlots = a.unavailableSlots?.[selectedDayString];
      const bUnavailableSlots = b.unavailableSlots?.[selectedDayString];
      const aIsUnavailable = Array.isArray(aUnavailableSlots) && aUnavailableSlots.length === TIME_SLOTS.length;
      const bIsUnavailable = Array.isArray(bUnavailableSlots) && bUnavailableSlots.length === TIME_SLOTS.length;
      if (aIsUnavailable && !bIsUnavailable) return 1;
      if (!aIsUnavailable && bIsUnavailable) return -1;
      let aValue: string | number, bValue: string | number;
      switch (sortConfig.key) {
        case 'name': aValue = getCleanSortName(a.name); bValue = getCleanSortName(b.name); break;
        case 'jobCount': aValue = a.schedule.flatMap(s => s.jobs).length; bValue = b.schedule.flatMap(s => s.jobs).length; break;
        case 'cityCount': aValue = new Set(a.schedule.flatMap(s => s.jobs).map(j => j.city).filter(Boolean)).size; bValue = new Set(b.schedule.flatMap(s => s.jobs).map(j => j.city).filter(Boolean)).size; break;
        case 'availability': aValue = a.availability.split(',').length; bValue = b.availability.split(',').length; break;
        case 'skillCount': aValue = (a.skills ? Object.values(a.skills) : []).reduce<number>((sum, level) => sum + (level as number), 0); bValue = (b.skills ? Object.values(b.skills) : []).reduce<number>((sum, level) => sum + (level as number), 0); break;
        case 'Tile': case 'Shingle': case 'Flat': case 'Metal': case 'Insurance': case 'Commercial': aValue = (a.skills as any)?.[sortConfig.key] || 0; bValue = (b.skills as any)?.[sortConfig.key] || 0; break;
        case 'salesRank': aValue = a.salesRank === undefined ? 999 : a.salesRank; bValue = b.salesRank === undefined ? 999 : b.salesRank; break;
        default: return a.name.localeCompare(b.name);
      }
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
    return repsToSort;
  }, [appState.reps, sortConfig, selectedDayString]);

  useEffect(() => {
    if (!hasInitializedMap && allJobs.length > 0) {
        handleShowAllJobsOnMap();
        setHasInitializedMap(true);
    }
  }, [allJobs.length, hasInitializedMap, handleShowAllJobsOnMap]);

  useEffect(() => {
      if (autoMapAction === 'none') return;
      
      if (autoMapAction === 'show-all') {
          handleShowAllJobsOnMap();
      } else {
          handleShowRoute(autoMapAction, false);
      }
      setAutoMapAction('none');
  }, [autoMapAction, handleShowAllJobsOnMap, handleShowRoute]);
  
  return {
    appState, setAppState, isLoadingReps, repsError, isParsing, isAutoAssigning, isDistributing, isAiAssigning, isAiFixingAddresses, isTryingVariations, parsingError,
    selectedRepId, usingMockData, activeSheetName, selectedDate, activeDayKeys, addActiveDay, removeActiveDay, setSelectedDate, expandedRepIds,
    isOverrideActive, sortConfig, setSortConfig, debugLogs, log, aiThoughts, activeRoute, isRouting,
    draggedJob, setDraggedJob, draggedOverRepId, setDraggedOverRepId, handleJobDragEnd,
    handleRefreshRoute, settings: appState.settings, updateSettings,
    loadReps, handleShowRoute, handleParseJobs, handleAutoAssign, handleDistributeJobs, handleAutoAssignForRep, handleAiAssign, handleAiFixAddresses, handleTryAddressVariations, clearAiThoughts, handleUnassignJob,
    handleClearAllSchedules, handleJobDrop, handleToggleRepLock,
    handleToggleRepExpansion, handleToggleAllReps, handleUpdateJob, handleRemoveJob, handleUpdateRep, allJobs, assignedJobs, assignedJobsCount,
    assignedCities, assignedRepNames, filteredReps, handleShowUnassignedJobsOnMap, handleShowAllJobsOnMap, handleShowZipOnMap, handleShowAllRepLocations, handleShowFilteredJobsOnMap,
    isJobValidForRepRegion, checkCityRuleViolation,
    handleOptimizeRepRoute, handleUnoptimizeRepRoute, handleSwapSchedules,
    handleSaveStateToFile, handleLoadStateFromFile,
    handleUndo, handleRedo, canUndo, canRedo,
    hoveredJobId, setHoveredJobId,
    repSettingsModalRepId, setRepSettingsModalRepId,
    setFilteredAssignedJobs,
    setFilteredUnassignedJobs,
    filteredAssignedJobs,
    filteredUnassignedJobs
  };
};