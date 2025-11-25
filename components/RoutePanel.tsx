
import React, { useMemo, useState } from 'react';
import { DisplayJob, RouteInfo } from '../types';
import LeafletMap from './LeafletMap';
import { ClipboardIcon, LoadingIcon, RefreshIcon, MapPinIcon, VariationsIcon } from './icons';
import { useAppContext } from '../context/AppContext';
import { JobCard } from './JobCard';
import { TIME_SLOTS } from '../constants';

interface RouteMapPanelProps {
    routeData: {
        repName: string;
        mappableJobs: DisplayJob[];
        unmappableJobs: DisplayJob[];
        routeInfo: RouteInfo | null;
    } | null;
    isLoading: boolean;
}

const RouteMapPanel: React.FC<RouteMapPanelProps> = ({ routeData, isLoading }) => {
    const { handleUpdateJob, handleUnassignJob, handleRemoveJob, handleRefreshRoute, handleShowAllJobsOnMap, handleTryAddressVariations, isTryingVariations } = useAppContext();
    const [copySuccess, setCopySuccess] = useState(false);
    
    // State for time slot filtering (Single selection now)
    const [selectedTimeSlotId, setSelectedTimeSlotId] = useState<string | null>(null);

    const googleMapsUrl = useMemo(() => {
        if (!routeData || routeData.mappableJobs.length === 0) return '#';
        const addresses = routeData.mappableJobs.map(j => j.address);
        if (addresses.length === 1) {
          return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addresses[0])}`;
        }
        const encoded = addresses.map(addr => encodeURIComponent(addr));
        return `https://www.google.com/maps/dir/${encoded.join('/')}`;
    }, [routeData]);

    const handleCopyUnplotted = () => {
        if (!routeData || routeData.unmappableJobs.length === 0) return;
        
        const addressesToCopy = routeData.unmappableJobs.map(job => job.address).join('\n');
        
        navigator.clipboard.writeText(addressesToCopy).then(() => {
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 2500);
        }).catch(err => {
            console.error("Failed to copy unplotted addresses:", err);
            alert("Could not copy addresses. Please check browser permissions.");
        });
    };

    const toggleTimeSlot = (slotId: string) => {
        setSelectedTimeSlotId(prev => prev === slotId ? null : slotId);
    };

    // Filter jobs based on active time slots - Now sets 'isDimmed' instead of removing
    const jobsForMap = useMemo(() => {
        if (!routeData) return [];
        
        // Always return all jobs, but mark them as dimmed if they don't match the selected slot
        return routeData.mappableJobs.map(job => {
            if (!selectedTimeSlotId) {
                return { ...job, isDimmed: false };
            }

            const jobSlotLabel = job.timeSlotLabel;
            // Find the slot definition that matches this job's label
            const matchedSlot = TIME_SLOTS.find(ts => ts.label === jobSlotLabel);
            
            // If matched, check if IDs match. If not matched (e.g. uncategorized), it's dimmed when a filter is active.
            const isMatch = matchedSlot ? matchedSlot.id === selectedTimeSlotId : false;
            
            return { ...job, isDimmed: !isMatch };
        });
    }, [routeData, selectedTimeSlotId]);

    const renderHeaderContent = () => {
        if (isLoading) {
            return (
                <div>
                    <h4 className="font-bold text-base text-gray-800">Calculating Route...</h4>
                    <p className="text-sm text-gray-600">Please wait.</p>
                </div>
            );
        }

        if (!routeData) {
            return (
                 <div>
                    <h4 className="font-bold text-base text-gray-800">No Route Selected</h4>
                    <p className="text-sm text-gray-600">Select a rep or paste jobs to view map.</p>
                </div>
            );
        }
        
        const { repName, mappableJobs, unmappableJobs } = routeData;
        const totalJobs = mappableJobs.length + unmappableJobs.length;
        const isOverviewMap = repName === 'Unassigned Jobs' || repName === 'Job Map';

        let title, subtitle;

        if (isOverviewMap) {
            title = 'Job Map';
            subtitle = repName === 'Job Map' 
                ? `${totalJobs} total jobs` 
                : `${totalJobs} unassigned jobs`;
        } else {
            title = repName;
            subtitle = totalJobs > 0 ? `${totalJobs} stops` : 'No jobs assigned for today.';
        }

        // Handle empty state if job list is empty but routeData exists
        if (totalJobs === 0) {
             return (
                 <div>
                    <h4 className="font-bold text-base text-gray-800">{title}</h4>
                    <p className="text-sm text-gray-600">No jobs found in this list.</p>
                </div>
            );
        }

        return (
            <div className="flex flex-col w-full">
                <div className="flex justify-between items-start w-full mb-2">
                    <div>
                        <h4 className="font-bold text-base text-gray-800">{title}</h4>
                        <p className="text-sm text-gray-600">{subtitle}</p>
                    </div>
                    {totalJobs > 0 && (
                        <div className="flex items-center gap-2">
                             <button
                                onClick={handleShowAllJobsOnMap}
                                disabled={isLoading}
                                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${isLoading ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                                title="Show all assigned and unassigned jobs on the map"
                            >
                                <MapPinIcon />
                                <span className="hidden sm:inline">Show All</span>
                            </button>
                            <button
                                onClick={handleRefreshRoute}
                                disabled={isLoading}
                                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${isLoading ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                                title="Refresh map view to update rep colors and routes"
                            >
                                <RefreshIcon />
                                <span className="hidden sm:inline">Refresh</span>
                            </button>
                            <a 
                                href={googleMapsUrl} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${mappableJobs.length > 0 ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-gray-400 text-white cursor-not-allowed opacity-70'}`}
                                onClick={(e) => mappableJobs.length === 0 && e.preventDefault()}
                            >
                                <ClipboardIcon />
                                <span className="hidden sm:inline">Google Maps</span>
                            </a>
                        </div>
                    )}
                </div>
                
                {/* Time Slot Filter Bar */}
                <div className="flex flex-wrap items-center gap-1 mt-1 select-none">
                    <span className="text-[10px] font-bold text-gray-400 uppercase mr-1">Filter Time:</span>
                    {TIME_SLOTS.map(slot => {
                        const isActive = selectedTimeSlotId === slot.id;
                        return (
                            <button
                                key={slot.id}
                                onClick={() => toggleTimeSlot(slot.id)}
                                className={`px-2 py-0.5 text-[10px] font-medium rounded-full border transition-all ${
                                    isActive 
                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' 
                                    : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-300 hover:text-indigo-600'
                                }`}
                            >
                                {slot.label.replace(/am|pm/gi, '').replace(/\s/g, '')}
                            </button>
                        );
                    })}
                     {selectedTimeSlotId !== null && (
                        <button onClick={() => setSelectedTimeSlotId(null)} className="text-[10px] text-indigo-600 underline ml-1 hover:text-indigo-800">Show All</button>
                    )}
                </div>
            </div>
        );
    };

    const routeInfoForMap = routeData?.routeInfo || null;
    const mapType = (routeData?.repName === 'Unassigned Jobs' || routeData?.repName === 'Job Map') ? 'unassigned' : 'route';

    return (
        <div className="w-full h-full flex flex-col bg-gray-50 rounded-lg overflow-hidden">
            <header className="p-3 border-b border-gray-200 bg-white flex-shrink-0">
                {renderHeaderContent()}
            </header>

            <div className="flex-grow relative bg-gray-200">
                <LeafletMap jobs={jobsForMap} routeInfo={routeInfoForMap} mapType={mapType} />
            </div>
            
            {routeData && routeData.unmappableJobs.length > 0 && !isLoading && (
                <div className="flex-shrink-0 bg-red-50 border-t border-red-200">
                    <div className="p-3">
                        <div className="flex justify-between items-start mb-2">
                            <div>
                                <h5 className="font-bold text-red-800 flex items-center text-sm">
                                    <span className="mr-2 text-lg">⚠️</span> 
                                    {routeData.unmappableJobs.length} Unplotted Jobs
                                </h5>
                                <p className="text-xs text-red-600 mt-0.5">
                                    Address verification required.
                                </p>
                            </div>
                            <div className="flex items-center space-x-2">
                                 <button
                                    onClick={handleCopyUnplotted}
                                    className={`p-1.5 rounded-md transition-colors ${copySuccess ? 'bg-green-100 text-green-700' : 'bg-white text-gray-500 hover:text-gray-800 border border-gray-200 hover:bg-gray-50'}`}
                                    title="Copy addresses to clipboard"
                                >
                                    <ClipboardIcon className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                        
                        <div className="space-y-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar mb-2">
                            {routeData.unmappableJobs.map(job => (
                                <div key={job.id} className="bg-white rounded border border-red-100 shadow-sm">
                                    <JobCard
                                        job={job}
                                        onUpdateJob={handleUpdateJob}
                                        onUnassign={job.assignedRepName ? handleUnassignJob : undefined}
                                        onRemove={handleRemoveJob}
                                    />
                                     {job.geocodeError && (
                                        <div className="px-2 pb-1 text-[10px] text-red-500 font-mono">
                                            {job.geocodeError}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={handleTryAddressVariations}
                            disabled={isTryingVariations}
                            className="w-full flex items-center justify-center space-x-2 py-2 rounded-md text-xs font-bold transition-colors bg-white border border-red-200 text-red-700 hover:bg-red-100 shadow-sm disabled:opacity-50"
                        >
                            {isTryingVariations ? <LoadingIcon className="text-red-700" /> : <VariationsIcon className="h-4 w-4" />}
                            <span>{isTryingVariations ? 'Trying Variations...' : 'Try Auto-Fix Variations'}</span>
                        </button>
                    </div>
                </div>
            )}

            {routeData && routeData.routeInfo && routeData.repName !== 'Unassigned Jobs' && routeData.repName !== 'Job Map' && !isLoading && (
                <footer className="p-2 border-t border-gray-200 text-center bg-white text-sm font-semibold text-gray-700 flex-shrink-0">
                    Estimated Route: {routeData.routeInfo.distance.toFixed(1)} miles / {routeData.routeInfo.duration.toFixed(0)} mins driving
                </footer>
            )}
        </div>
    );
};

export default RouteMapPanel;
