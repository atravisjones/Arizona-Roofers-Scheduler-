

import React from 'react';
import { Coordinates } from './services/osmService';

// Fix: Export ParsedJobsResult interface
export interface ParsedJobsResult {
  date: string | null;
  jobs: Job[];
}

// Create a literal type from the array of keywords
// To avoid circular dependency with constants.ts, we define this explicitly.
type SkillName = 'Tile' | 'Shingle' | 'Flat' | 'Metal' | 'Insurance' | 'Commercial';

export type SortKey = 'name' | 'availability' | 'jobCount' | 'cityCount' | 'skillCount' | 'score' | 'salesRank' | SkillName;

export interface SortConfig {
  key: SortKey;
  direction: 'asc' | 'desc';
}

export interface ScoringWeights {
    distanceBase: number;    // 0-10: Proximity to Home/Region
    distanceCluster: number; // 0-10: Proximity to other jobs
    skillRoofing: number;    // 0-10: Tile, Shingle, etc.
    skillType: number;       // 0-10: Insurance, Commercial
    performance: number;     // 0-10: Sales Rank
}

export interface ScoreBreakdown {
    distanceBase: number;
    distanceCluster: number;
    skillRoofing: number;
    skillType: number;
    performance: number;
    penalty: number;
}

export interface Settings {
  // General Rules
  allowDoubleBooking: boolean;
  maxJobsPerSlot: number;
  allowAssignOutsideAvailability: boolean;
  maxJobsPerRep: number;
  minJobsPerRep: number; // Added minimum target
  maxCitiesPerRep: number;

  // Auto-Assign & AI Weights (0-10 scale)
  // Deprecated in favor of ScoringWeights but kept for backward compat if needed logic remains
  weightSameCity: number;
  weightAdjacentCity: number;
  weightSkillMatch: number;
  
  unavailabilityPenalty: number; // A value from 0-10, applied as a negative.
  strictTimeSlotMatching: boolean;

  maxTravelTimeMinutes: number; // In minutes
  
  // Gamification / Scoring Logic
  scoringWeights: ScoringWeights;
  
  // Regional Rules
  allowRegionalRepsInPhoenix: boolean;
}


export interface Rep {
  id: string;
  name: string;
  availability: string;
  schedule: ScheduledTimeSlot[];
  isMock?: boolean; // Flag to indicate if this is sample data
  unavailableSlots?: Record<string, string[]>; // e.g. { "Monday": ["ts-3", "ts-4"] }
  skills?: Record<string, number>; // e.g. { "Tile": 3, "Shingle": 2 }
  region?: 'PHX' | 'NORTH' | 'SOUTH' | 'UNKNOWN';
  zipCodes?: string[];
  isLocked?: boolean;
  isOptimized?: boolean;
  
  // Gamification Properties
  salesRank?: number; // 1 = Top performer.
  scoringOverrides?: Partial<ScoringWeights>; // Individual overrides
}

export interface Job {
  id: string;
  customerName: string;
  address: string;
  notes: string;
  city?: string; // Added city to the job type
  originalTimeframe?: string; // Added original timeframe from pasted text
  zipCode?: string;
}

export interface DisplayJob extends Job {
  assignedRepName?: string;
  timeSlotLabel?: string;
  geocodeError?: string;
  isEstimatedLocation?: boolean;
  isDimmed?: boolean;
  isStartLocation?: boolean;
  isRepHome?: boolean;
  assignmentScore?: number; // The score (0-100) of this specific assignment
  scoreBreakdown?: ScoreBreakdown;
  markerLabel?: string; // Optional custom label for map marker (e.g., "1", "2")
}

export interface TimeSlot {
  id:string;
  label: string;
}

export interface ScheduledTimeSlot extends TimeSlot {
  jobs: DisplayJob[]; // Updated to use DisplayJob to support assignmentScore
}

export interface AppState {
  reps: Rep[];
  unassignedJobs: Job[];
  settings: Settings;
}

export interface RouteInfo {
    distance: number; // in miles
    duration: number; // in minutes
    geometry: any; // GeoJSON geometry
    coordinates: Coordinates[]; // for markers
}

export interface ItineraryItem {
    type: 'job' | 'lunch' | 'travel';
    timeRange: string;
    job?: DisplayJob;
    duration: string;
}

export interface AppContextType {
    appState: AppState;
    setAppState: React.Dispatch<React.SetStateAction<AppState>>;
    isLoadingReps: boolean;
    repsError: string | null;
    isParsing: boolean;
    isAutoAssigning: boolean;
    isDistributing: boolean;
    isAiAssigning: boolean;
    isAiFixingAddresses: boolean;
    isTryingVariations: boolean;
    parsingError: string | null;
    // FIX: Changed from `selectedRepIds` to `selectedRepId` to support single selection, matching the context implementation.
    selectedRepId: string | null;
    usingMockData: boolean;
    activeSheetName: string;
    selectedDate: Date;
    activeDayKeys: string[];
    addActiveDay: (date: Date) => void;
    removeActiveDay: (dateKey: string) => void;
    setSelectedDate: (date: Date) => void;
    expandedRepIds: Set<string>;
    isOverrideActive: boolean;
    sortConfig: SortConfig;
    setSortConfig: (config: SortConfig) => void;
    debugLogs: string[];
    log: (message: string) => void;
    aiThoughts: string[];
    activeRoute: {
        repName: string;
        mappableJobs: DisplayJob[];
        unmappableJobs: DisplayJob[];
        routeInfo: RouteInfo | null;
    } | null;
    isRouting: boolean;
    draggedJob: Job | null;
    setDraggedJob: (job: Job | null) => void;
    draggedOverRepId: string | null;
    setDraggedOverRepId: (id: string | null) => void;
    handleJobDragEnd: () => void;
    handleRefreshRoute: () => void;
    settings: Settings;
    updateSettings: (updatedSettings: Partial<Settings>) => void;
    loadReps: (date: Date) => Promise<void>;
    // FIX: Changed from `handleSelectRepForRoute` to `handleShowRoute` to match the context implementation.
    handleShowRoute: (repId: string, optimize: boolean) => Promise<void>;
    handleShowUnassignedJobsOnMap: (jobs?: Job[]) => Promise<void>;
    handleShowFilteredJobsOnMap: (jobs: DisplayJob[], title: string) => Promise<void>; // New function
    handleShowAllJobsOnMap: () => Promise<void>;
    handleShowZipOnMap: (zip: string, rep?: Rep) => Promise<void>;
    handleShowAllRepLocations: () => Promise<void>;
    handleParseJobs: (pastedText: string, onComplete: () => void) => Promise<void>;
    handleAutoAssign: () => void;
    handleDistributeJobs: () => void;
    handleAutoAssignForRep: (repId: string) => void;
    handleAiAssign: () => void;
    handleAiFixAddresses: () => Promise<void>;
    handleTryAddressVariations: () => Promise<void>;
    clearAiThoughts: () => void;
    handleUnassignJob: (jobId: string) => void;
    handleClearAllSchedules: () => void;
    handleJobDrop: (jobId: string, target: { repId: string; slotId: string } | 'unassigned', e?: React.DragEvent<HTMLDivElement>) => void;
    handleToggleRepLock: (repId: string) => void;
    handleToggleRepExpansion: (repId: string) => void;
    handleToggleAllReps: (filteredReps: Rep[]) => void;
    // FIX: Allow `originalTimeframe` to be updated to support reschedule confirmation.
    handleUpdateJob: (jobId: string, updatedDetails: Partial<Pick<Job, 'customerName' | 'address' | 'notes' | 'originalTimeframe'>>) => void;
    handleUpdateRep: (repId: string, updates: Partial<Rep>) => void; // New function
    handleRemoveJob: (jobId: string) => void;
    handleOptimizeRepRoute: (repId: string) => Promise<void>;
    handleUnoptimizeRepRoute: (repId: string) => void; // New function
    handleSwapSchedules: (repId1: string, repId2: string) => void;
    handleSaveStateToFile: () => void;
    handleLoadStateFromFile: (loadedState: any) => void;
    handleUndo: () => void;
    handleRedo: () => void;
    canUndo: boolean;
    canRedo: boolean;
    allJobs: DisplayJob[];
    assignedJobs: DisplayJob[];
    assignedJobsCount: number;
    assignedCities: string[];
    assignedRepNames: string[];
    filteredReps: (repSearchTerm: string, cityFilters: Set<string>, lockFilter: 'all' | 'locked' | 'unlocked') => Rep[];
    isJobValidForRepRegion: (job: Job, rep: Rep) => boolean;
    checkCityRuleViolation: (rep: Rep, newJobCity: string | null | undefined) => { violated: boolean, cities: Set<string> };
    hoveredJobId: string | null;
    setHoveredJobId: (id: string | null) => void;
    
    // UI State for modals
    repSettingsModalRepId: string | null;
    setRepSettingsModalRepId: (id: string | null) => void;

    // Map Filter State Pushing
    setFilteredAssignedJobs: (jobs: DisplayJob[]) => void;
    setFilteredUnassignedJobs: (jobs: Job[]) => void;
}