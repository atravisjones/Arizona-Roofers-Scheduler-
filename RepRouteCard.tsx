import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { DisplayJob, RouteInfo } from '../types';
import { geocodeAddresses, fetchRoute, Coordinates } from '../services/osmService';
import { haversineDistance } from '../services/geography';
import LeafletMap from './LeafletMap';
import { LoadingIcon, ErrorIcon, OptimizeIcon, ClipboardIcon, ChevronDownIcon, ChevronUpIcon } from './icons';

interface RepRouteCardProps {
    repName: string;
    jobs: DisplayJob[];
}

const RepRouteCard: React.FC<RepRouteCardProps> = ({ repName, jobs }) => {
    const [orderedJobs, setOrderedJobs] = useState<DisplayJob[]>(jobs);
    const [mappableJobs, setMappableJobs] = useState<DisplayJob[]>([]);
    const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isExpanded, setIsExpanded] = useState(true);

    useEffect(() => {
        setOrderedJobs(jobs);
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
                const coordsWithNulls = await geocodeAddresses(addresses);

                const newMappableJobs: DisplayJob[] = [];
                const validCoords: Coordinates[] = [];

                orderedJobs.forEach((job, index) => {
                    // FIX: The geocodeAddresses function returns GeocodeResult objects. We must check for the `coordinates` property within the result, not cast the whole object.
                    const result = coordsWithNulls[index];
                    if (result?.coordinates) {
                        newMappableJobs.push(job);
                        validCoords.push(result.coordinates);
                    }
                });
                
                setMappableJobs(newMappableJobs);

                if (validCoords.length < orderedJobs.length) {
                    const missingCount = orderedJobs.length - validCoords.length;
                    setError(`Could not locate ${missingCount} address${missingCount > 1 ? 'es' : ''}. Route may be incomplete.`);
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
    }, [orderedJobs]);

    const handleOptimize = async () => {
        if (orderedJobs.length <= 1) return;
        setIsLoading(true);

        const coordsWithNulls = await geocodeAddresses(orderedJobs.map(j => j.address));
        const jobCoordMap = new Map<string, Coordinates>();
        orderedJobs.forEach((job, index) => {
            // FIX: The geocodeAddresses function returns GeocodeResult objects. We must check for the `coordinates` property before using it.
            const result = coordsWithNulls[index];
            if (result?.coordinates) {
                jobCoordMap.set(job.id, result.coordinates);
            }
        });
        
        const jobsByTimeSlot = orderedJobs.reduce((acc, job) => {
            const slot = job.timeSlotLabel || 'Uncategorized';
            if (!acc[slot]) acc[slot] = [];
            acc[slot].push(job);
            return acc;
        }, {} as Record<string, DisplayJob[]>);

        const optimizedJobs: DisplayJob[] = [];
        
        const getSortableHour = (timeString: string): number => {
            const match = timeString.match(/^(\d{1,2})/);
            if (!match) return 99;
            let hour = parseInt(match[1], 10);
            if (hour >= 1 && hour <= 7) hour += 12;
            return hour;
        };

        const sortedSlots = Object.keys(jobsByTimeSlot).sort((a, b) => {
            if (a === 'Uncategorized') return 1;
            if (b === 'Uncategorized') return -1;
            return getSortableHour(a) - getSortableHour(b);
        });

        for (const slot of sortedSlots) {
            let unvisited = [...jobsByTimeSlot[slot]];
            if (unvisited.length <= 1) {
                optimizedJobs.push(...unvisited);
                continue;
            }
            
            let sortedForSlot: DisplayJob[] = [];
            // Find a valid starting job
            let startIndex = unvisited.findIndex(job => jobCoordMap.has(job.id));
            if (startIndex === -1) { // No jobs in this slot could be geocoded
                optimizedJobs.push(...unvisited);
                continue;
            }
            let currentJob = unvisited.splice(startIndex, 1)[0];
            sortedForSlot.push(currentJob);

            while (unvisited.length > 0) {
                const currentCoord = jobCoordMap.get(currentJob.id);
                if (!currentCoord) {
                    sortedForSlot.push(...unvisited);
                    break;
                }
                
                let nearestIndex = -1;
                let minDistance = Infinity;

                unvisited.forEach((job, index) => {
                    const coord = jobCoordMap.get(job.id);
                    if(coord) {
                        const distance = haversineDistance(currentCoord, coord);
                        if (distance < minDistance) {
                            minDistance = distance;
                            nearestIndex = index;
                        }
                    }
                });

                if (nearestIndex !== -1) {
                    currentJob = unvisited.splice(nearestIndex, 1)[0];
                    sortedForSlot.push(currentJob);
                } else {
                    sortedForSlot.push(...unvisited);
                    break;
                }
            }
            optimizedJobs.push(...sortedForSlot);
        }

        setOrderedJobs(optimizedJobs);
        setIsLoading(false);
    };
    
    const googleMapsUrl = useMemo(() => {
        if (orderedJobs.length === 0) return '#';
        const addresses = orderedJobs.map(j => j.address);
        if (addresses.length === 1) {
          return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addresses[0])}`;
        }
        const encoded = addresses.map(addr => encodeURIComponent(addr));
        return `https://www.google.com/maps/dir/${encoded.join('/')}`;
    }, [orderedJobs]);

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
                            <div className="border rounded-md p-2 h-64 overflow-y-auto bg-gray-50">
                                <ol className="list-decimal list-inside space-y-2 text-sm">
                                    {orderedJobs.map(job => (
                                        <li key={job.id}>
                                            <span className="font-semibold">{job.timeSlotLabel}: </span>
                                            <span className="text-gray-700">{job.address}</span>
                                        </li>
                                    ))}
                                </ol>
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