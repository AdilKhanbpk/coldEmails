import { useState, useEffect } from 'react';

/**
 * Custom hook that debounces a value, delaying updates until after a specified delay period.
 * 
 * This hook reduces API calls and re-renders by only updating the returned value after
 * the input value has stopped changing for the specified delay period. Particularly useful
 * for search inputs, filter fields, and other user inputs that trigger expensive operations.
 * 
 * Performance Impact: Reduces API calls and expensive computations by batching rapid
 * changes. For example, typing "United States" (13 characters) triggers only 1 update
 * instead of 13 with a 350ms delay.
 * 
 * @template T - The type of value being debounced (can be any type)
 * @param value - The value to debounce
 * @param delay - The delay in milliseconds before updating the debounced value
 * @returns The debounced value that only updates after the delay period
 * 
 * @example
 * function LeadsClient() {
 *   const [countryInput, setCountryInput] = useState('');
 *   const debouncedCountry = useDebouncedValue(countryInput, 350);
 * 
 *   useEffect(() => {
 *     // Only triggers after 350ms of no typing
 *     setFilters(prev => ({ ...prev, country: debouncedCountry }));
 *   }, [debouncedCountry]);
 * 
 *   return (
 *     <Input 
 *       value={countryInput} 
 *       onChange={e => setCountryInput(e.target.value)} 
 *       placeholder="Filter by country..."
 *     />
 *   );
 * }
 * 
 * @example
 * function SearchBar() {
 *   const [searchTerm, setSearchTerm] = useState('');
 *   const debouncedSearch = useDebouncedValue(searchTerm, 500);
 * 
 *   useEffect(() => {
 *     if (debouncedSearch) {
 *       // API call only happens 500ms after user stops typing
 *       fetchSearchResults(debouncedSearch);
 *     }
 *   }, [debouncedSearch]);
 * 
 *   return <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />;
 * }
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Set up a timeout to update the debounced value after the delay
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Cleanup function: cancel the timeout if value changes before delay expires
    // This ensures we only update after the user has stopped changing the value
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
