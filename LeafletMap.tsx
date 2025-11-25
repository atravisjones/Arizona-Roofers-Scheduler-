
import React, { useEffect, useRef, useState, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { geocodeAddresses, Coordinates, fetchRoute } from './services/osmService';
import { LoadingIcon } from './components/icons';
import { RouteInfo, DisplayJob } from './types';
import { JobCard } from './components/JobCard';
import { useAppContext, AppContext } from './context/AppContext';
import { TAG_KEYWORDS } from './constants';

declare const L: any;

interface LeafletMapProps {
  jobs: DisplayJob[];
  routeInfo?: RouteInfo | null;
  mapType?: 'unassigned' | 'route';
}

const PHOENIX_COORDS: [number, number] = [33.4484, -112.0740];
const DEFAULT_ZOOM = 9;
const ROUTE_ZOOM = 12;

const LeafletMap: React.FC<LeafletMapProps> = ({ jobs, routeInfo: preloadedRouteInfo, mapType = 'route' }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const featureGroupRef = useRef<any>(null); 
  
  // Get current context to bridge into Leaflet popups
  const contextValue = useAppContext();
  // Store context in a ref so closure always accesses the latest value when opening popups
  const contextValueRef = useRef(contextValue);
  contextValueRef.current = contextValue;

  const { handleUnassignJob, handleUpdateJob, handleRemoveJob, setDraggedJob, handleJobDragEnd, hoveredJobId } = contextValue;

  // Track React roots for cleanup to prevent memory leaks and hydration errors
  const popupRootsRef = useRef<ReactDOM.Root[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [internalRouteInfo, setInternalRouteInfo] = useState<RouteInfo | null>(null);
  const [mappableJobs, setMappableJobs] = useState<DisplayJob[]>([]);

  const effectiveRouteInfo = preloadedRouteInfo !== undefined ? preloadedRouteInfo : internalRouteInfo;
  const addresses = useMemo(() => jobs.map(j => j.address), [jobs]);

  // Clean up any React roots created for popups when the component unmounts
  useEffect(() => {
      return () => {
          popupRootsRef.current.forEach(root => {
              try {
                  // Verify root is valid before unmounting to avoid double-unmount errors
                  // @ts-ignore - accessing internal property for safety check if needed, but unmount is usually safe
                  root.unmount();
              } catch (e) {
                  // Ignore errors during cleanup
              }
          });
          popupRootsRef.current = [];
      };
  }, []);

  useEffect(() => {
    if (mapContainerRef.current && !mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current, {
        center: PHOENIX_COORDS,
        zoom: DEFAULT_ZOOM,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(mapRef.current);

      featureGroupRef.current = L.featureGroup().addTo(mapRef.current);
    }
    
    return () => {
      if (mapRef.current) {
        if (featureGroupRef.current) featureGroupRef.current.clearLayers();
        mapRef.current.remove();
        mapRef.current = null;
        featureGroupRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
      if (!mapRef.current || !mapContainerRef.current) return;

      const map = mapRef.current;
      const resizeObserver = new ResizeObserver(() => {
          setTimeout(() => {
              if (mapRef.current) {
                  map.invalidateSize();
              }
          }, 100);
      });

      resizeObserver.observe(mapContainerRef.current);

      return () => {
          resizeObserver.disconnect();
      };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !featureGroupRef.current) return;
    
    if (preloadedRouteInfo !== undefined) {
        setMappableJobs(jobs);
        setInternalRouteInfo(null);
        setError(null);
        return;
    }
    
    if (featureGroupRef.current) featureGroupRef.current.clearLayers();
    if (jobs.length === 0) {
      setIsLoading(false);
      setError(null);
      setInternalRouteInfo(null);
      setMappableJobs([]);
      if(mapRef.current) mapRef.current.setView(PHOENIX_COORDS, DEFAULT_ZOOM);
      return; 
    }
    
    const fetchAndSetRoute = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const coordsWithNulls = await geocodeAddresses(addresses);
        if (!mapRef.current) return;
        
        const newMappableJobs: DisplayJob[] = [];
        const validCoords: Coordinates[] = [];
        jobs.forEach((job, index) => {
            const result = coordsWithNulls[index];
            if (result?.coordinates) {
                newMappableJobs.push(job);
                validCoords.push(result.coordinates);
            }
        });

        setMappableJobs(newMappableJobs);

        if (validCoords.length === 0) {
          throw new Error('Could not find locations for any of the provided addresses.');
        }

        if (validCoords.length < addresses.length) {
            setError(`Warning: Could only locate ${validCoords.length} of ${addresses.length} addresses.`);
        }

        const route = await fetchRoute(validCoords);
        setInternalRouteInfo(route);

      } catch (e: any) {
        console.error("Geocoding/Routing failed:", e);
        let message = "An unknown error occurred while fetching location data.";
        if (e instanceof Error) {
            message = e.message;
        } else if (typeof e === 'string') {
            message = e;
        }
        setError(message);
        setInternalRouteInfo(null);
        setMappableJobs([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAndSetRoute();

  }, [addresses, preloadedRouteInfo, jobs]);

  useEffect(() => {
      if (!mapRef.current || !featureGroupRef.current) return;

      const map = mapRef.current;
      featureGroupRef.current.clearLayers();
      
      // Clear old React roots when creating new markers
      popupRootsRef.current.forEach(root => {
          try { root.unmount(); } catch(e) {}
      });
      popupRootsRef.current = [];

      const jobsToDisplay = preloadedRouteInfo !== undefined ? jobs : mappableJobs;
      const coordsToDisplay = effectiveRouteInfo?.coordinates;

      if (coordsToDisplay && coordsToDisplay.length > 0 && jobsToDisplay.length === coordsToDisplay.length) {
          
          const uniqueRepNames: string[] = Array.from(new Set<string>(
              jobsToDisplay.map(j => j.assignedRepName).filter((name): name is string => !!name)
          )).sort();

          const repColorMap = new Map<string, string>();
          const goldenRatioConjugate = 0.61803398875;
          let hue = 0.1;

          uniqueRepNames.forEach((repName: string) => {
              hue += goldenRatioConjugate;
              hue %= 1;
              const color = `hsl(${hue * 360}, 75%, 45%)`; 
              repColorMap.set(repName, color);
          });
          
          const getColorForRep = (repName?: string): string => {
              if (!repName) return '#808080';
              return repColorMap.get(repName) || '#808080';
          };
          
          coordsToDisplay.forEach((coord: Coordinates, index: number) => {
              const job = jobsToDisplay[index];
              if (!job) return;
              
              let markerHtml: string;
              let iconSize: [number, number];
              let iconAnchor: [number, number];
              const color = getColorForRep(job.assignedRepName);
              const isPriority = job.notes.includes('#');
              const isHovered = job.id === hoveredJobId;
              
              const dimFilter = job.isDimmed ? 'filter: grayscale(100%); opacity: 0.4;' : '';
              const dimZIndex = job.isDimmed ? 0 : (isPriority ? 1000 : 500);
              const finalZIndex = isHovered ? 10000 : (job.isRepHome ? 900 : dimZIndex);
              
              let shadow = (isPriority && !job.isDimmed)
                ? 'box-shadow: 0 0 0 2px #FFD700, 0 0 10px #FFD700, 0 4px 6px rgba(0,0,0,0.3);' 
                : (!job.isDimmed ? 'box-shadow: 0 2px 4px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.3);' : 'box-shadow: inset 0 0 0 1px rgba(0,0,0,0.1);');
              
              if (isHovered) {
                  shadow = `box-shadow: 0 0 0 3px white, 0 0 15px ${color}, 0 4px 8px rgba(0,0,0,0.5);`;
              }
              
              const border = isPriority 
                ? 'border: 2px solid #FFF;' 
                : 'border: 2px solid white;';
                
              const transform = isHovered ? 'transform: scale(1.5); transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);' : '';

              if (job.isRepHome) {
                  markerHtml = `
                    <div style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; ${transform} ${dimFilter}">
                        <svg viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="2" style="filter: drop-shadow(0 2px 3px rgba(0,0,0,0.3)); width: 100%; height: 100%;">
                            <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
                        </svg>
                    </div>`;
                  iconSize = [24, 24];
                  iconAnchor = [12, 20];
              } else if (job.isStartLocation) {
                  markerHtml = `
                    <div style="background-color: ${color}; ${border} ${shadow} ${dimFilter} ${transform}" class="text-white w-7 h-7 rounded-md flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                        </svg>
                    </div>`;
                  iconSize = [28, 28];
                  iconAnchor = [14, 14];
              } else if (job.isEstimatedLocation) {
                  markerHtml = `<div style="width: 16px; height: 16px; background-color: ${color}; border-radius: 50%; border: 2px dashed white; ${shadow} ${dimFilter} ${transform}"></div>`;
                  iconSize = [20, 20];
                  iconAnchor = [10, 10];
              } else if (mapType === 'unassigned') {
                  markerHtml = `<div style="width: 14px; height: 14px; background-color: ${color}; border-radius: 50%; ${border} ${shadow} ${dimFilter} ${transform}"></div>`;
                  iconSize = [18, 18];
                  iconAnchor = [9, 9];
              } else {
                  markerHtml = `<div style="background-color: ${color}; ${border} ${shadow} ${dimFilter} ${transform}" class="text-white w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs">${index + 1}</div>`;
                  iconSize = [28, 28];
                  iconAnchor = [14, 14];
              }

              const icon = L.divIcon({
                  html: markerHtml,
                  className: '',
                  iconSize,
                  iconAnchor,
              });

              const marker = L.marker([coord.lat, coord.lon], { icon, zIndexOffset: finalZIndex })
                  .addTo(featureGroupRef.current);

              const notesLower = (job.notes || '').toLowerCase();
              const tagsList: string[] = [];
              
              TAG_KEYWORDS.forEach((keyword: string) => {
                  if (new RegExp(`\\b${keyword.toLowerCase()}\\b`).test(notesLower)) {
                      tagsList.push(keyword);
                  }
              });
              
              const storiesMatch = job.notes.match(/\b(\d)S\b/i);
              if (storiesMatch) tagsList.push(`${storiesMatch[1]} Story`);
              
              const sqftMatch = job.notes.match(/\b(\d+)\s*sq\.?\b/i);
              if (sqftMatch) tagsList.push(`${sqftMatch[1]} sqft`);
              
              const ageMatch = job.notes.match(/\b(\d+)\s*yrs\b/i);
              if (ageMatch) tagsList.push(`${ageMatch[1]}yrs`);

              const tagsString = tagsList.join(', ');

              const timeLabel = (job.timeSlotLabel as string) || 'Unscheduled';
              
              let breakdownHtml = '';
              if (job.scoreBreakdown) {
                  const b = job.scoreBreakdown;
                  const showType = b.skillType >= 0;
                  breakdownHtml = `
                    <div style="margin-top: 4px; padding-top: 4px; border-top: 1px dashed #e5e7eb; font-size: 9px; color: #666; text-align: left;">
                        <div style="display:flex; justify-content:space-between;"><span>Dist:</span> <b>${Math.round(b.distanceBase)}</b></div>
                        <div style="display:flex; justify-content:space-between;"><span>Skill:</span> <b>${Math.round(b.skillRoofing)}</b></div>
                        ${showType ? `<div style="display:flex; justify-content:space-between;"><span>Type:</span> <b>${Math.round(b.skillType)}</b></div>` : ''}
                        <div style="display:flex; justify-content:space-between;"><span>Perf:</span> <b>${Math.round(b.performance)}</b></div>
                        ${b.penalty > 0 ? `<div style="display:flex; justify-content:space-between; color: #ef4444;"><span>Penalty:</span> <b>-${b.penalty}</b></div>` : ''}
                        <div style="margin-top:2px; font-weight:bold; color:#d97706; text-align:right;">Score: ${job.assignmentScore}</div>
                    </div>
                  `;
              }

              let toolTipContent = '';
              if (job.isRepHome) {
                  toolTipContent = `
                    <div style="text-align: center; line-height: 1.3; min-width: 120px;">
                        <div style="font-weight: bold; font-size: 11px; color: #4b5563; text-transform: uppercase; margin-bottom: 2px;">Home Base</div>
                        <div style="font-weight: 800; font-size: 13px; color: #111; margin-bottom: 1px;">${job.zipCode}</div>
                        ${job.assignedRepName ? `
                        <div style="font-size: 11px; color: #4338ca; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 3px; background-color: #e0e7ff; padding: 2px 6px; border-radius: 4px; display: inline-flex; margin-top: 2px;">
                            ${job.assignedRepName}
                        </div>` : ''}
                    </div>
                  `;
              } else {
                  toolTipContent = `
                    <div style="text-align: center; line-height: 1.3; min-width: 120px;">
                        <div style="font-weight: bold; font-size: 11px; color: #4b5563; text-transform: uppercase; margin-bottom: 2px;">${timeLabel}</div>
                        <div style="font-weight: 800; font-size: 13px; color: #111; margin-bottom: 1px;">${job.customerName}</div>
                        <div style="font-size: 10px; color: #6b7280; margin-bottom: 4px;">${job.address}</div>
                        
                        ${tagsString ? `
                        <div style="margin-bottom: 4px;">
                            <span style="display: inline-block; background-color: #f3f4f6; color: #374151; border: 1px solid #d1d5db; padding: 2px 6px; border-radius: 12px; font-size: 9px; font-weight: 600;">
                                ${tagsString}
                            </span>
                        </div>` : ''}
                        
                        ${job.assignedRepName ? `
                        <div style="font-size: 11px; color: #4338ca; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 3px; background-color: #e0e7ff; padding: 2px 6px; border-radius: 4px; display: inline-flex;">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style="width: 10px; height: 10px;"><path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" /></svg>
                            ${job.assignedRepName}
                        </div>` : ''}

                        ${isPriority ? '<div style="color: #b45309; font-weight: bold; font-size: 10px; margin-top: 4px;">★ Priority Job</div>' : ''}
                        
                        ${breakdownHtml}
                    </div>
                  `;
              }
              
              marker.bindTooltip(toolTipContent, { 
                  direction: 'top', 
                  offset: [0, -10],
                  opacity: job.isDimmed ? 0.5 : 1,
                  className: 'shadow-md border border-gray-200 rounded-md px-2 py-1'
              });

              // Prepare for React content inside popup
              const popupContainer = document.createElement('div');
              const root = ReactDOM.createRoot(popupContainer);
              popupRootsRef.current.push(root); // Track root for cleanup

              marker.bindPopup(popupContainer, { minWidth: 420, className: 'job-card-popup' });

              marker.on('popupopen', () => {
                  const popupContentNode = marker.getPopup()?.getContent();
                  if (popupContentNode instanceof HTMLElement) {
                      L.DomEvent.disableClickPropagation(popupContentNode);
                      L.DomEvent.disableScrollPropagation(popupContentNode);
                  }
                  
                  // Use the latest context value from ref to bridge the gap
                  const currentContext = contextValueRef.current;
                  
                  root.render(
                      <React.StrictMode>
                          <AppContext.Provider value={currentContext}>
                              <div className="w-[420px] p-2">
                                  <JobCard
                                      job={job}
                                      onUnassign={job.assignedRepName ? currentContext.handleUnassignJob : undefined}
                                      onUpdateJob={currentContext.handleUpdateJob}
                                      onRemove={currentContext.handleRemoveJob}
                                      isDraggable={true}
                                      onDragStart={currentContext.setDraggedJob}
                                      onDragEnd={currentContext.handleJobDragEnd}
                                  />
                              </div>
                          </AppContext.Provider>
                      </React.StrictMode>
                  );
              });
              
              // NOTE: We do NOT unmount on popupclose anymore to prevent React #409 error
              // roots are unmounted when the parent map/markers are destroyed in useEffect cleanup.
          });
          
          if (mapType === 'route' && effectiveRouteInfo?.geometry) {
              L.geoJSON(effectiveRouteInfo.geometry, {
                  style: () => ({ color: '#6366f1', weight: 5, opacity: 0.6, lineCap: 'round' })
              }).addTo(featureGroupRef.current);
          } else if (mapType === 'route' && coordsToDisplay.length > 1) {
              const latLngs = coordsToDisplay.map(coord => [coord.lat, coord.lon]);
              L.polyline(latLngs, { color: '#6366f1', weight: 4, opacity: 0.5, dashArray: '6, 8' }).addTo(featureGroupRef.current);
          }
          
          if(featureGroupRef.current.getLayers().length > 0) {
            map.fitBounds(featureGroupRef.current.getBounds().pad(0.1));
          } else if (coordsToDisplay.length === 1) {
             map.setView([coordsToDisplay[0].lat, coordsToDisplay[0].lon], ROUTE_ZOOM);
          }
      } else {
        map.setView(PHOENIX_COORDS, DEFAULT_ZOOM);
      }

      const timer = setTimeout(() => {
        map.invalidateSize();
      }, 100);

      return () => clearTimeout(timer);

  }, [effectiveRouteInfo, jobs, mapType, mappableJobs, preloadedRouteInfo, hoveredJobId]); 
  // Note: Removed handlers from dependency array as they are stable from contextRef

  return (
    <div className="w-full h-full relative rounded-lg overflow-hidden bg-gray-200">
      {isLoading && (
        <div className="absolute inset-0 bg-gray-100/80 flex flex-col items-center justify-center z-20">
          <LoadingIcon />
          <span className="mt-2 text-gray-700">Generating route map...</span>
        </div>
      )}
      {error && (
         <div className="absolute top-2 left-2 right-2 bg-yellow-100/90 border border-yellow-300 text-yellow-800 text-xs text-center font-semibold p-2 rounded-md shadow-lg z-20">
          {error}
        </div>
      )}
      <div ref={mapContainerRef} className="w-full h-full z-10" />
    </div>
  );
};

export default LeafletMap;
