
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { DisplayJob, RouteInfo, ItineraryItem } from '../types';
import { geocodeAddresses, fetchRoute, Coordinates } from '../services/osmService';
import { haversineDistance } from '../services/geography';
import LeafletMap from './LeafletMap';
import { LoadingIcon, ErrorIcon, OptimizeIcon, ClipboardIcon, ChevronDownIcon, ChevronUpIcon, MessageIcon } from './icons';
import { useAppContext } from '../context/AppContext';

interface RepRouteCardProps {
    repName: string;
    jobs: DisplayJob[];
}

const parseTimeRange = (timeStr: string | undefined): { start: number, end: number } | null => {
    if (!timeStr) return null;
    // Matches "7:30am", "10am", "7:30am - 9am"
    const parts = timeStr.split('-').map(s => s.trim());
    
    const parseTime = (t: string) => {
        const match = t.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
        if (!match) return 0;
        let h = parseInt(match[1]);
        const m = parseInt(match[2] || '0');
        const p = match[3]?.toLowerCase();
        if (p === 'pm' && h < 12) h += 12;
        if (p === 'am' && h === 12) h = 0;
        // Simple heuristic if AM/PM missing: 7-11 is AM, 1-6 is PM (unless 12)
        if (!p) {
            if (h >= 1 && h <= 6) h += 12;
        }
        return h * 60 + m;
    };

    if (parts.length >= 2) {
        return { start: parseTime(parts[0]), end: parseTime(parts[1]) };
    }
    return null;
};

const doTimesOverlap = (t1: string | undefined, t2: string | undefined): boolean => {
    const r1 = parseTimeRange(t1);
    const r2 = parseTimeRange(t2);
    if (!r1 || !r2) return true; // Cannot determine, assume valid/overlap to avoid false alarm
    
    // Standard overlap check: StartA < EndB && StartB < EndA
    return r1.start < r2.end && r2.start < r1.end;
};

const RepRouteCard: React.FC<RepRouteCardProps> = ({ repName, jobs }) => {
    const { setHoveredJobId, selectedDate, appState } = useAppContext();
    const [orderedJobs, setOrderedJobs] = useState<DisplayJob[]>(jobs);
    const [mappableJobs, setMappableJobs] = useState<DisplayJob[]>([]);
    const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isExpanded, setIsExpanded] = useState(true);
    const [itinerary, setItinerary] = useState<ItineraryItem[]>([]);
    const [copySuccess, setCopySuccess] = useState(false);

    // Find the rep object to get zip codes
    const rep = useMemo(() => appState.reps.find(r => r.name === repName), [appState.reps, repName]);
    const homeZip = rep?.zipCodes?.[0];

    useEffect(() => {
        setOrderedJobs(jobs);
        // Reset itinerary when jobs change
        setItinerary([]); 
    }, [jobs]);

    useEffect(() => {
        const calculateRoute = async () => {
            if (orderedJobs.length < 1) {
                setRouteInfo(null);
                setMappableJobs([]);
                setError(null);
                return;
            };
            setIsLoading(true);
            setError(null);
            try {
                const addresses = orderedJobs.map(j => j.address);
                
                // Add Home Zip to mapping if available to show start/end
                if (homeZip) {
                    addresses.unshift(`${homeZip}, Arizona, USA`);
                }

                const coordsWithNulls = await geocodeAddresses(addresses);

                const newMappableJobs: DisplayJob[] = [];
                const validCoords: Coordinates[] = [];
                let jobCounter = 1;

                // 1. Handle Start Location (Home)
                let coordIndexOffset = 0;
                if (homeZip) {
                    const homeResult = coordsWithNulls[0];
                    if (homeResult?.coordinates) {
                        newMappableJobs.push({
                            id: `start-${repName}-${Date.now()}`,
                            address: `${homeZip}, Arizona, USA`,
                            customerName: 'Start: Home Base',
                            city: homeZip,
                            notes: 'Route Start',
                            zipCode: homeZip,
                            isRepHome: true,
                            assignedRepName: repName,
                            timeSlotLabel: 'Start'
                        });
                        validCoords.push(homeResult.coordinates);
                    }
                    coordIndexOffset = 1;
                }

                // 2. Handle Actual Jobs
                orderedJobs.forEach((job, index) => {
                    const result = coordsWithNulls[index + coordIndexOffset];
                    if (result?.coordinates) {
                        // Set marker label to keep numbering correct (1, 2, 3...) despite potential start/end points
                        newMappableJobs.push({ ...job, markerLabel: String(jobCounter++) });
                        validCoords.push(result.coordinates);
                    }
                });
                
                // 3. Handle End Location (Home - Round Trip)
                if (homeZip && validCoords.length > 0) {
                     const homeResult = coordsWithNulls[0]; // Re-use start coord
                     if (homeResult?.coordinates) {
                        newMappableJobs.push({
                            id: `end-${repName}-${Date.now()}`,
                            address: `${homeZip}, Arizona, USA`,
                            customerName: 'End: Home Base',
                            city: homeZip,
                            notes: 'Route End',
                            zipCode: homeZip,
                            isRepHome: true,
                            assignedRepName: repName,
                            timeSlotLabel: 'End'
                        });
                        validCoords.push(homeResult.coordinates);
                     }
                }
                
                setMappableJobs(newMappableJobs);

                if (validCoords.length < orderedJobs.length) {
                    const missingCount = orderedJobs.length - (validCoords.length - (homeZip ? 2 : 0)); // Adjust count for home zip points
                    if (missingCount > 0) {
                        setError(`Could not locate ${missingCount} address${missingCount > 1 ? 'es' : ''}. Route may be incomplete.`);
                    }
                }

                if (validCoords.length > 1) {
                    const route = await fetchRoute(validCoords);
                    setRouteInfo(route);
                } else if (validCoords.length === 1) {
                    setRouteInfo({
                        distance: 0,
                        duration: 0,
                        geometry: null,
                        coordinates: validCoords
                    });
                } else {
                    setRouteInfo(null);
                    if (orderedJobs.length > 0) {
                        setError("Could not find locations for any of the jobs.");
                    }
                }

            } catch (e) {
                const message = e instanceof Error ? e.message : "Failed to calculate route.";
                console.error("Route calculation error:", e);
                setError(message);
                setRouteInfo(null);
            } finally {
                setIsLoading(false);
            }
        };
        calculateRoute();
    }, [orderedJobs, homeZip, repName]);

    const handleOptimize = async () => {
        if (orderedJobs.length <= 1) return;
        setIsLoading(true);

        // 1. Determine Drive Buffer based on job count
        const jobCount = orderedJobs.length;
        let driveBufferMinutes = 30;
        if (jobCount === 4) driveBufferMinutes = 60;
        if (jobCount <= 3) driveBufferMinutes = 90;

        // 2. Group by Original Timeframe
        const getSortableHour = (timeString: string | undefined): number => {
            if (!timeString) return 99;
            const match = timeString.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
            if (!match) return 99;
            let hour = parseInt(match[1], 10);
            const period = match[3]?.toLowerCase();
            if (period === 'pm' && hour < 12) hour += 12;
            if (period === 'am' && hour === 12) hour = 0;
            return hour;
        };

        const buckets: Record<number, DisplayJob[]> = {};
        orderedJobs.forEach(job => {
            const h = getSortableHour(job.originalTimeframe);
            if (!buckets[h]) buckets[h] = [];
            buckets[h].push(job);
        });

        const sortedHours = Object.keys(buckets).map(Number).sort((a, b) => a - b);
        const optimizedJobs: DisplayJob[] = [];

        const coordsWithNulls = await geocodeAddresses(orderedJobs.map(j => j.address));
        const jobCoordMap = new Map<string, Coordinates>();
        orderedJobs.forEach((job, index) => {
            const result = coordsWithNulls[index];
            if (result?.coordinates) {
                jobCoordMap.set(job.id, result.coordinates);
            }
        });

        // Start from Home Base if available
        let currentRefCoord: Coordinates | undefined = undefined; 
        if (homeZip) {
             const homeResult = await geocodeAddresses([`${homeZip}, Arizona, USA`]);
             if (homeResult[0]?.coordinates) {
                 currentRefCoord = homeResult[0].coordinates;
             }
        }

        for (const h of sortedHours) {
            let unvisited = [...buckets[h]];
            
            while (unvisited.length > 0) {
                let nearestIndex = 0; // Default to first
                let minDistance = Infinity;

                if (currentRefCoord) {
                    unvisited.forEach((job, index) => {
                        const coord = jobCoordMap.get(job.id);
                        if(coord) {
                            const distance = haversineDistance(currentRefCoord!, coord);
                            if (distance < minDistance) {
                                minDistance = distance;
                                nearestIndex = index;
                            }
                        }
                    });
                }

                const [nextJob] = unvisited.splice(nearestIndex, 1);
                optimizedJobs.push(nextJob);
                
                const nextCoord = jobCoordMap.get(nextJob.id);
                if (nextCoord) currentRefCoord = nextCoord;
            }
        }

        // 3. Generate Itinerary
        const generatedItinerary: ItineraryItem[] = [];
        let currentTime = new Date();
        currentTime.setHours(7, 30, 0, 0); // Start at 7:30 AM

        const JOB_DURATION_MINUTES = 90; // 1.5 hours

        // Helper to format time
        const formatTime = (date: Date) => {
            return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        };

        // Update time labels for the map and ordered jobs list
        const jobsWithUpdatedTimes = optimizedJobs.map(job => {
             const startStr = currentTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(/\s/g, '');
             
             const jobStart = new Date(currentTime);
             currentTime.setMinutes(currentTime.getMinutes() + JOB_DURATION_MINUTES);
             const jobEnd = new Date(currentTime);
             
             const endStr = currentTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(/\s/g, '');
             const timeSlotLabel = `${startStr}-${endStr}`;

             generatedItinerary.push({
                type: 'job',
                timeRange: `${formatTime(jobStart)} - ${formatTime(jobEnd)}`,
                job: { ...job, timeSlotLabel }, // Use updated label in itinerary display
                duration: '1h 30m'
            });

            // Add Dynamic Drive Time
            currentTime.setMinutes(currentTime.getMinutes() + driveBufferMinutes);
            
            // Add drive entry to itinerary
            generatedItinerary.push({
                type: 'travel',
                timeRange: `(~${driveBufferMinutes} mins drive)`,
                duration: `${driveBufferMinutes}m`
            });

             return { ...job, timeSlotLabel };
        });

        setOrderedJobs(jobsWithUpdatedTimes);
        setItinerary(generatedItinerary);
        setIsLoading(false);
    };
    
    const googleMapsUrl = useMemo(() => {
        if (orderedJobs.length === 0) return '#';
        const waypoints = orderedJobs.map(j => encodeURIComponent(j.address));
        
        // Start and End at Home Zip if available
        if (homeZip) {
            const homeAddr = encodeURIComponent(`${homeZip}, Arizona`);
            waypoints.unshift(homeAddr);
            waypoints.push(homeAddr);
        }

        return `https://www.google.com/maps/dir/${waypoints.join('/')}`;
    }, [orderedJobs, homeZip]);

    const handleCopyItinerary = () => {
        if (itinerary.length === 0) return;

        const dateStr = selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
        let text = `Route for ${repName} - ${dateStr}\n\n`;

        itinerary.forEach(item => {
            if (item.type === 'job' && item.job) {
                // Use original timeframe if available for the display, otherwise the scheduled time
                const timeDisplay = item.job.originalTimeframe || item.timeRange;
                
                text += `${timeDisplay}: ${item.job.city?.toUpperCase() || 'LOCATION'}`;
                
                // Check overlap between Original Request and Scheduled Slot
                // If they do NOT overlap, show warning.
                if (item.job.originalTimeframe && item.job.timeSlotLabel) {
                    const overlaps = doTimesOverlap(item.job.originalTimeframe, item.job.timeSlotLabel);
                    
                    if (!overlaps) {
                        text += ` (Scheduled: ${item.timeRange})`;
                        text += ` - WARNING: POTENTIAL RESCHEDULE NECESSARY`;
                    }
                }
                text += `\n`;

                text += `${item.job.address}\n`;
                if (item.job.notes) text += `Notes: ${item.job.notes}\n`;
                if (item.job.customerName) text += `Customer: ${item.job.customerName}\n`;
                text += `\n`;
            } else if (item.type === 'lunch') {
               // No lunch block
            } else if (item.type === 'travel') {
                // Optional: Include drive times in text
            }
        });
        
        text += `Google Maps Route:\n${googleMapsUrl}`;

        navigator.clipboard.writeText(text).then(() => {
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 2500);
        }).catch(err => {
            alert('Failed to copy to clipboard');
        });
    };

    return (
        <div className="bg-white rounded-lg shadow-md border border-gray-200">
            <div className="p-3 border-b flex justify-between items-center cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
                <h4 className="font-bold text-base text-gray-800">{repName} ({jobs.length} stops)</h4>
                {isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
            </div>
            {isExpanded && (
                <div className="p-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <div className="flex items-center space-x-2 mb-2">
                                <button onClick={handleOptimize} disabled={isLoading || orderedJobs.length <=1} className="flex-1 text-sm bg-indigo-600 text-white py-1.5 px-3 rounded-md hover:bg-indigo-700 disabled:bg-indigo-300 flex items-center justify-center transition">
                                    <OptimizeIcon className="h-4 w-4 mr-2" />
                                    <span>Optimize Order</span>
                                </button>
                                <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" className="flex-1 text-sm text-center bg-blue-500 text-white py-1.5 px-3 rounded-md hover:bg-blue-600 flex items-center justify-center transition">
                                    <ClipboardIcon className="h-4 w-4 mr-2" />
                                    <span>Google Maps</span>
                                </a>
                            </div>
                            
                            {itinerary.length > 0 && (
                                <button 
                                    onClick={handleCopyItinerary}
                                    className={`w-full mb-2 text-sm flex items-center justify-center py-1.5 px-3 rounded-md transition border ${copySuccess ? 'bg-green-100 text-green-700 border-green-300' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                                >
                                    <MessageIcon className="h-4 w-4 mr-2" />
                                    <span>{copySuccess ? 'Copied to Clipboard!' : 'Copy Itinerary for Rep'}</span>
                                </button>
                            )}

                            <div className="border rounded-md p-2 h-64 overflow-y-auto bg-gray-50 custom-scrollbar">
                                {itinerary.length > 0 ? (
                                    <ul className="space-y-3 text-sm">
                                        {itinerary.map((item, idx) => (
                                            <li key={idx} className={`flex flex-col ${item.type === 'lunch' ? 'bg-amber-100 p-2 rounded text-center font-bold text-amber-800 border border-amber-200' : item.type === 'travel' ? 'text-gray-400 text-xs italic text-center' : ''}`}>
                                                {item.type === 'job' && item.job ? (
                                                    <div 
                                                        onMouseEnter={() => setHoveredJobId(item.job!.id)}
                                                        onMouseLeave={() => setHoveredJobId(null)}
                                                        className="bg-white p-2 rounded border border-gray-200 shadow-sm hover:shadow-md transition-shadow"
                                                    >
                                                        <div className="flex justify-between text-xs font-bold text-indigo-700 mb-1">
                                                            <span>{item.job.originalTimeframe || item.timeRange}</span>
                                                            <span>{item.job.city}</span>
                                                        </div>
                                                        <div className="text-gray-800 leading-tight mb-1">{item.job.address}</div>
                                                        {item.job.notes && <div className="text-gray-500 text-xs truncate">{item.job.notes}</div>}
                                                        {item.job.originalTimeframe && item.job.timeSlotLabel && !doTimesOverlap(item.job.originalTimeframe, item.job.timeSlotLabel) && (
                                                            <div className="text-[10px] text-red-600 mt-0.5 font-bold">
                                                                Schedule: {item.timeRange} (Reschedule Needed)
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span>{item.type === 'lunch' ? `🍱 LUNCH (${item.duration})` : `🚗 Drive: ${item.duration}`}</span>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <ol className="list-decimal list-inside space-y-2 text-sm">
                                        {orderedJobs.map(job => (
                                            <li 
                                                key={job.id}
                                                onMouseEnter={() => setHoveredJobId(job.id)}
                                                onMouseLeave={() => setHoveredJobId(null)}
                                                className="hover:bg-gray-100 rounded px-1 py-0.5 transition-colors cursor-default"
                                            >
                                                <span className="font-semibold">{job.timeSlotLabel}: </span>
                                                <span className="text-gray-700">{job.address}</span>
                                            </li>
                                        ))}
                                    </ol>
                                )}
                            </div>
                        </div>
                        <div className="h-80 relative">
                             <LeafletMap jobs={mappableJobs} routeInfo={routeInfo} mapType="route" />
                        </div>
                    </div>
                    {(isLoading || routeInfo) && (
                        <div className="mt-2 text-center bg-gray-100 p-2 rounded-md text-sm font-semibold">
                            {isLoading ? "Calculating..." : routeInfo ? `Est. Route: ${routeInfo.distance.toFixed(1)} miles / ${routeInfo.duration.toFixed(0)} mins driving` : ''}
                        </div>
                    )}
                    {error && <p className="text-red-500 text-xs text-center mt-2 font-semibold bg-red-50 p-1 rounded-md">{error}</p>}
                </div>
            )}
        </div>
    );
};

export default RepRouteCard;