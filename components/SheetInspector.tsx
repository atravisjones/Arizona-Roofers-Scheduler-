
import React, { useState } from 'react';
import { fetchSheetCell } from '../services/googleSheetsService';
import { LoadingIcon } from './icons';

interface SheetInspectorProps {
    activeSheetName: string;
}

const SheetInspector: React.FC<SheetInspectorProps> = ({ activeSheetName }) => {
    const [cellRef, setCellRef] = useState<string>('B5');
    const [result, setResult] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const handleFetch = async () => {
        if (!cellRef) {
            setError('Cell reference cannot be empty.');
            return;
        }
        if (!activeSheetName) {
            setError('No sheet is active.');
            return;
        }
        setIsLoading(true);
        setError(null);
        setResult(null);

        try {
            const value = await fetchSheetCell(cellRef, activeSheetName);
            setResult(value);
        } catch (err) {
            setError('Failed to fetch cell data. Check console.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-white p-2 border border-gray-300 rounded-md shadow-sm flex items-center space-x-2">
            <label htmlFor="cell-ref" className="text-sm font-medium text-gray-700 whitespace-nowrap">
                Inspect Cell:
            </label>
            <input
                type="text"
                id="cell-ref"
                value={cellRef}
                onChange={(e) => setCellRef(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
                className="w-20 px-2 py-1 border border-gray-300 bg-white rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                placeholder="e.g., B5"
            />
            <button
                onClick={handleFetch}
                disabled={isLoading}
                className="bg-gray-600 text-white px-3 py-1 rounded-md hover:bg-gray-700 disabled:bg-gray-400 text-sm transition"
            >
                {isLoading ? <LoadingIcon /> : 'Fetch'}
            </button>
            {result && (
                <p className="text-sm text-gray-800 bg-gray-100 px-2 py-1 rounded">
                   <span className="font-semibold">{cellRef.toUpperCase()}:</span> {result}
                </p>
            )}
            {error && (
                <p className="text-sm text-red-600">{error}</p>
            )}
        </div>
    );
};

export default SheetInspector;
