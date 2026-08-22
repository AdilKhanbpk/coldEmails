import { useState, useEffect } from 'react';

/**
 * Custom hook that tracks document visibility state.
 * Returns true when the browser tab is visible, false when hidden.
 * 
 * Use this hook to pause/resume operations like polling when the tab
 * becomes inactive to save resources and reduce unnecessary API calls.
 * 
 * @returns {boolean} - True if the document is visible, false if hidden
 * 
 * @example
 * function MyComponent() {
 *   const isVisible = useVisibilityChange();
 *   
 *   useEffect(() => {
 *     if (isVisible) {
 *       // Resume polling or other operations
 *     } else {
 *       // Pause operations
 *     }
 *   }, [isVisible]);
 * }
 */
export function useVisibilityChange(): boolean {
  const [isVisible, setIsVisible] = useState(
    typeof document !== 'undefined' ? !document.hidden : true
  );

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return isVisible;
}
