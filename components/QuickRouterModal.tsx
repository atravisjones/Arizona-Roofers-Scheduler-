import React, { useState, useMemo } from 'react';
import LeafletMap from './LeafletMap';
import { DisplayJob } from '../types';

interface QuickRouterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const QuickRouterModal: React.FC<QuickRouterModalProps> = ({ isOpen, onClose }) => {
  const [pastedText, setPastedText] = useState('');
  const [addresses, setAddresses] = useState<string[]>([]);

  const handleParse = () => {
    const cleanedText = pastedText
      .replace(/\b\d{1,2}(:\d{2})?(am|pm)?\s*-\s*\d{1,2}(:\d{2})?(am|pm)?\b/gi, '')
      .replace(/\b(Tile|Flat|Job)\b/gi, '');

    const splitters = /[\n;|\/]/;
    const lines = cleanedText.split(splitters);

    const uniqueAddresses = Array.from(
      new Set(
        lines
          .map(line => line.trim())
          .filter(line => line.length > 5)
      )
    );
    setAddresses(uniqueAddresses);
  };

  const jobsForMap = useMemo((): DisplayJob[] => 
    addresses.map((addr, i) => ({
      id: `qr-job-${i}`,
      customerName: `Stop ${i + 1}`,
      address: addr,
      notes: ''
    })), [addresses]);
  
  // URL generation is kept for the "Open in Google Maps" buttons as a fallback/alternative
  const googleMapsUrl = useMemo(() => {
    if (addresses.length === 0) return '#';

    if (addresses.length === 1) {
      const query = encodeURIComponent(addresses[0]);
      return `https://www.google.com/maps/search/?api=1&query=${query}`;
    }

    const origin = encodeURIComponent(addresses[0]);
    const destination = encodeURIComponent(addresses[addresses.length - 1]);
    const waypoints = addresses
      .slice(1, -1)
      .slice(0, 20)
      .map(addr => encodeURIComponent(addr))
      .join('|');

    return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving&waypoints=${waypoints}`;
  }, [addresses]);


  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden">
        <header className="p-4 border-b flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-800">Quick Router</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-3xl leading-none">&times;</button>
        </header>

        <div className="flex-grow p-4 grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto">
          <div className="flex flex-col space-y-4">
            <div>
              <label htmlFor="address-paste" className="block text-sm font-medium text-gray-700 mb-1">
                Paste Schedule or Addresses
              </label>
              <textarea
                id="address-paste"
                rows={10}
                className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 transition"
                placeholder="Paste any text with addresses here..."
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
              />
            </div>
            <div className="flex space-x-2">
                <button
                onClick={handleParse}
                className="flex-grow bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 transition"
                >
                Generate Route Preview
                </button>
                <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" className="flex-grow text-center bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition">
                      Open in Google Maps
                </a>
            </div>
            
            {addresses.length > 0 && (
              <div className="p-3 bg-gray-50 rounded-lg border flex-grow overflow-y-auto">
                <h3 className="font-semibold mb-2">{addresses.length} unique addresses found:</h3>
                <ul className="list-disc list-inside text-sm space-y-1 text-gray-700">
                  {addresses.map((addr, i) => <li key={i}>{addr}</li>)}
                </ul>
              </div>
            )}
            
          </div>

          <div className="bg-gray-100 rounded-lg flex flex-col items-center justify-center p-1">
             {jobsForMap.length > 0 ? (
                <LeafletMap jobs={jobsForMap} key={addresses.join('-')} mapType="route" />
             ) : (
                <div className="text-center text-gray-500">
                    <p>Address preview will appear here.</p>
                </div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuickRouterModal;