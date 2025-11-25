import { Rep } from '../types';

// This data is used as a fallback if the Google Sheets API call fails.
export const MOCK_REPS_DATA: Omit<Rep, 'schedule' | 'isMock'>[] = [
  {
    id: 'rep-mock-1-Alice-Johnson',
    name: 'Alice Johnson (Sample)',
    availability: 'Mon-Fri, 9am-5pm',
    skills: { 'Tile': 3, 'Shingle': 2, 'Flat': 1, 'Metal': 1, 'Insurance': 3, 'Commercial': 1 },
    zipCodes: ['85001', '85003', '85251'],
  },
  {
    id: 'rep-mock-2-Bob-Williams',
    name: 'Bob Williams (Sample)',
    availability: 'Mon, Wed, Fri',
    skills: { 'Tile': 1, 'Shingle': 3, 'Flat': 3, 'Metal': 2, 'Insurance': 1, 'Commercial': 2 },
    zipCodes: ['85301', '85302', '85381'],
  },
  {
    id: 'rep-mock-3-Charlie-Brown',
    name: 'Charlie Brown (Sample)',
    availability: 'All week, flexible',
    skills: { 'Tile': 2, 'Shingle': 2, 'Flat': 2, 'Metal': 3, 'Insurance': 2, 'Commercial': 3 },
    zipCodes: ['85281', '85282', '85224', '85225'],
  },
];